'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAgotadosTiempoReal } from '@/components/useAgotadosTiempoReal';
import SelectorLinea from '@/components/SelectorLinea';
import {
  ChevronDownIcon,
  ClipboardListIcon,
  ColumnsIcon,
  CopyIcon,
  FitIcon,
  SearchIcon,
  SortIcon,
} from '@/components/ui/icons';
import { construirTablaCopia, copiarAlPortapapeles } from '@/lib/tablaCopia';

interface Fila {
  item_id: number;
  codigo: string | null;
  nombre_base: string;
  referencia: string | null;
  linea: string | null;
  sede: string | null;
  usuario: string | null;
  estado_comercial: 'solicitar_pedido' | null;
  fecha_estado: string | null;
  respuesta_compras: 'pedido_solicitado' | 'agotado_proveedor' | 'repartir_sedes' | 'no_se_pide' | null;
  fecha_respuesta: string | null;
  /** Motivo que escribió Compras cuando la respuesta es 'no_se_pide'. */
  motivo_compras: string | null;
  cantidad_sugerida: number | null;
  notas: string | null;
  fecha_nota: string | null;
  seguimiento: string | null;
  total: number;
}

type Modo = 'empieza_primero' | 'solo_empieza' | 'contiene';

interface Config {
  modo: Modo;
  item: boolean;
  nombre: boolean;
  referencia: boolean;
}

const CONFIG_INICIAL: Config = { modo: 'empieza_primero', item: true, nombre: true, referencia: true };
const CLAVE_CONFIG = 'agotados:config-busqueda';
const MODOS: { valor: Modo; texto: string }[] = [
  { valor: 'empieza_primero', texto: 'Primero las que empiezan por el texto, después el resto' },
  { valor: 'solo_empieza', texto: 'Solo las que empiezan por el texto' },
  { valor: 'contiene', texto: 'Todas las que contienen el texto, en orden alfabético' },
];

const RESPUESTAS: Record<string, string> = {
  pedido_solicitado: 'Pedido solicitado a proveedor',
  agotado_proveedor: 'Agotado en proveedor',
  repartir_sedes: 'Repartir entre sedes',
  no_se_pide: 'No se pide',
};

/** "No se pide: baja rotación" — el motivo viaja con la respuesta para que la sede entienda por qué. */
const textoRespuesta = (f: { respuesta_compras: string | null; motivo_compras: string | null }) =>
  f.respuesta_compras
    ? RESPUESTAS[f.respuesta_compras] +
      (f.respuesta_compras === 'no_se_pide' && f.motivo_compras ? `: ${f.motivo_compras}` : '')
    : '';

const POR_PAGINA = 50;
const LOTE_COPIA = 200; // máximo que acepta listar_agotados por llamada
const MAX_COPIA = 5000; // tope de "copiar todo" para no colgar el navegador

const RESPUESTA_INSIGNIA: Record<string, string> = {
  pedido_solicitado: 'ui-badge--success',
  agotado_proveedor: 'ui-badge--danger',
  repartir_sedes: 'ui-badge--violet',
  no_se_pide: 'ui-badge--warning',
};

// Claves que entiende listar_agotados(p_orden). Ver sql/migration_agotados_orden.sql
type ClaveOrden =
  | 'item' | 'nombre' | 'referencia' | 'linea' | 'sede' | 'usuario' | 'solicitud'
  | 'fecha_solicitud' | 'respuesta' | 'fecha_respuesta' | 'cantidad' | 'nota'
  | 'fecha_nota' | 'seguimiento';
type Direccion = 'asc' | 'desc';
interface Orden {
  clave: ClaveOrden;
  dir: Direccion;
}

interface Columna {
  clave: string;
  titulo: string;
  /** Si existe, el encabezado es ordenable con esa clave. */
  orden?: ClaveOrden;
  clase?: string;
  /** Texto de la celda tal como se ve; es lo que se copia al portapapeles. */
  texto?: (f: Fila) => string;
}

const COLUMNAS: Columna[] = [
  { clave: 'item', titulo: 'Item', orden: 'item', clase: 'ag-col-num', texto: (f) => f.codigo ?? String(f.item_id) },
  { clave: 'nombre', titulo: 'Nombre Base', orden: 'nombre', clase: 'ag-col-nombre', texto: (f) => f.nombre_base },
  { clave: 'referencia', titulo: 'Referencia', orden: 'referencia', texto: (f) => f.referencia ?? '' },
  { clave: 'linea', titulo: 'Línea', orden: 'linea', texto: (f) => f.linea ?? '' },
  { clave: 'sede', titulo: 'Sede', orden: 'sede', texto: (f) => f.sede ?? '' },
  { clave: 'usuario', titulo: 'Usuario', orden: 'usuario', texto: (f) => f.usuario ?? '' },
  { clave: 'solicitud', titulo: 'Solicitud', orden: 'solicitud', texto: (f) => (f.estado_comercial !== null ? 'Solicitar pedido' : '') },
  { clave: 'fecha_solicitud', titulo: 'Fecha solicitud', orden: 'fecha_solicitud', clase: 'ag-col-fecha', texto: (f) => fecha(f.fecha_estado) },
  { clave: 'respuesta', titulo: 'Respuesta Compras', orden: 'respuesta', texto: (f) => textoRespuesta(f) },
  { clave: 'fecha_respuesta', titulo: 'Fecha respuesta', orden: 'fecha_respuesta', clase: 'ag-col-fecha', texto: (f) => fecha(f.fecha_respuesta) },
  { clave: 'cantidad', titulo: 'Cant. sugerida', orden: 'cantidad', clase: 'ag-col-num', texto: (f) => f.cantidad_sugerida?.toString() ?? '' },
  { clave: 'nota', titulo: 'Nota', orden: 'nota', clase: 'ag-col-nota', texto: (f) => f.notas ?? '' },
  { clave: 'fecha_nota', titulo: 'Fecha nota', orden: 'fecha_nota', clase: 'ag-col-fecha', texto: (f) => fecha(f.fecha_nota) },
  { clave: 'seguimiento', titulo: 'Seguimiento', orden: 'seguimiento', texto: (f) => f.seguimiento ?? '' },
  { clave: 'accion', titulo: 'Acción', clase: 'ag-col-accion' },
];
// "Acción" son botones, no datos: no tiene `texto`, así que nunca se copia.

// Grupos plegables (como el "esquema" de Excel). Sus columnas deben ser contiguas en COLUMNAS.
interface Grupo {
  clave: string;
  titulo: string;
  columnas: string[];
}
const GRUPOS: Grupo[] = [
  { clave: 'g-solicitud', titulo: 'Solicitud', columnas: ['sede', 'usuario', 'solicitud', 'fecha_solicitud'] },
  { clave: 'g-respuesta', titulo: 'Respuesta de Compras', columnas: ['respuesta', 'fecha_respuesta'] },
  { clave: 'g-nota', titulo: 'Cantidad y notas', columnas: ['cantidad', 'nota', 'fecha_nota'] },
];
const GRUPO_DE: Record<string, Grupo> = Object.fromEntries(
  GRUPOS.flatMap((g) => g.columnas.map((c) => [c, g] as const)),
);
const CLASE_COL: Record<string, string | undefined> = Object.fromEntries(COLUMNAS.map((c) => [c.clave, c.clase]));

// Ancho inicial (px) de cada columna; las claves g-* son la columna resumen de un grupo plegado.
const ANCHO_DEFECTO: Record<string, number> = {
  item: 80, nombre: 240, referencia: 150, linea: 120, sede: 130, usuario: 140, solicitud: 160,
  fecha_solicitud: 170, respuesta: 220, fecha_respuesta: 170, cantidad: 120, nota: 260,
  fecha_nota: 170, seguimiento: 140, accion: 170,
  'g-solicitud': 150, 'g-respuesta': 180, 'g-nota': 150,
};
const ANCHO_MIN = 70;
const ANCHO_MAX = 600;
const ALTO_MIN = 40;
const ALTO_MAX = 400;
const limitar = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

interface Vista {
  /** clave de grupo -> true si está plegado */
  grupos: Record<string, boolean>;
  /** clave de columna -> ancho en px elegido por el usuario */
  anchos: Record<string, number>;
}
const VISTA_INICIAL: Vista = { grupos: {}, anchos: {} };
const CLAVE_VISTA = 'agotados:vista';

function leerVistaGuardada(): Vista {
  try {
    const crudo = localStorage.getItem(CLAVE_VISTA);
    if (!crudo) return VISTA_INICIAL;
    const v = JSON.parse(crudo);
    const grupos: Record<string, boolean> = {};
    for (const g of GRUPOS) if (v?.grupos?.[g.clave] === true) grupos[g.clave] = true;
    const anchos: Record<string, number> = {};
    for (const k of Object.keys(ANCHO_DEFECTO)) {
      const n = Number(v?.anchos?.[k]);
      if (Number.isFinite(n) && n > 0) anchos[k] = limitar(n, ANCHO_MIN, ANCHO_MAX);
    }
    return { grupos, anchos };
  } catch {
    return VISTA_INICIAL;
  }
}

// ---------- Selección de celdas (arrastrar como en Excel) ----------

interface Celda {
  r: number; // posición de la fila en la página actual
  c: number; // posición de la columna entre las visibles
}
interface Seleccion {
  ancla: Celda; // donde empezó la selección (celda activa)
  foco: Celda; // extremo opuesto, el que se mueve al arrastrar
}
interface Rango {
  r1: number;
  r2: number;
  c1: number;
  c2: number;
  activa: Celda;
}

const TEXTO_COL: Record<string, Columna['texto']> = Object.fromEntries(COLUMNAS.map((c) => [c.clave, c.texto]));

/** Texto de una celda tal como se ve; un grupo plegado resume las columnas que esconde. */
function textoCelda(f: Fila, clave: string): string {
  const g = GRUPOS.find((x) => x.clave === clave);
  if (g) return g.columnas.map((k) => TEXTO_COL[k]?.(f) ?? '').filter(Boolean).join(' · ');
  return TEXTO_COL[clave]?.(f) ?? '';
}

const dentro = (n: number, max: number) => Math.min(max, Math.max(0, n));

/** Clases que dibujan el rectángulo de selección: fondo en todas las celdas y borde solo en el contorno. */
function claseSeleccion(r: number, c: number, s: Rango | null): string {
  if (!s || r < s.r1 || r > s.r2 || c < s.c1 || c > s.c2) return '';
  return [
    'ag-sel',
    r === s.r1 && 'ag-sel--t',
    r === s.r2 && 'ag-sel--b',
    c === s.c1 && 'ag-sel--l',
    c === s.c2 && 'ag-sel--r',
    r === s.activa.r && c === s.activa.c && 'ag-sel--activa',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Aviso esperado (no es un fallo): se muestra sin el prefijo "No se pudo copiar". */
class SinDatos extends Error {}

const formatoNumero = (n: number) => n.toLocaleString('es-CO');

function fecha(valor: string | null) {
  if (!valor) return '';
  return new Date(valor).toLocaleString('es-CO', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  });
}

function leerConfigGuardada(): Config {
  try {
    const crudo = localStorage.getItem(CLAVE_CONFIG);
    if (!crudo) return CONFIG_INICIAL;
    const c = { ...CONFIG_INICIAL, ...JSON.parse(crudo) } as Config;
    if (!MODOS.some((m) => m.valor === c.modo)) c.modo = CONFIG_INICIAL.modo;
    if (!c.item && !c.nombre && !c.referencia) return CONFIG_INICIAL;
    return c;
  } catch {
    return CONFIG_INICIAL;
  }
}

function textoCampos(c: Config) {
  const nombres = [c.item && 'ítem', c.nombre && 'nombre', c.referencia && 'referencia'].filter(Boolean) as string[];
  if (nombres.length === 1) return nombres[0];
  return nombres.slice(0, -1).join(', ') + ' o ' + nombres[nombres.length - 1];
}

export default function ReporteAgotados({ organizacionId }: { organizacionId: string }) {
  const [supabase] = useState(() => createClient());
  const [filas, setFilas] = useState<Fila[]>([]);
  const [lineas, setLineas] = useState<string[]>([]);
  const [linea, setLinea] = useState('');
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [config, setConfig] = useState<Config>(CONFIG_INICIAL);
  const [configLista, setConfigLista] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [orden, setOrden] = useState<Orden | null>(null);
  const [copiando, setCopiando] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; error: boolean } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const temporizadorAviso = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [vista, setVista] = useState<Vista>(VISTA_INICIAL);
  const [vistaLista, setVistaLista] = useState(false);
  // Alto (px) de filas ajustadas a mano, por ítem. Solo dura mientras la pantalla está abierta.
  const [alturas, setAlturas] = useState<Record<string, number>>({});
  const tablaRef = useRef<HTMLTableElement>(null);
  const medidor = useRef<CanvasRenderingContext2D | null>(null);
  const arrastre = useRef<{ clave: string; inicio: number; base: number } | null>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const [seleccion, setSeleccion] = useState<Seleccion | null>(null);
  const seleccionando = useRef(false);
  const ultimoPuntero = useRef({ x: 0, y: 0 });

  // La configuración de búsqueda se recuerda en este navegador
  useEffect(() => {
    setConfig(leerConfigGuardada());
    setConfigLista(true);
  }, []);

  function cambiarConfig(nueva: Config) {
    setConfig(nueva);
    setPagina(0);
    try {
      localStorage.setItem(CLAVE_CONFIG, JSON.stringify(nueva));
    } catch {
      // sin almacenamiento disponible: la configuración vale solo para esta sesión
    }
  }

  useEffect(() => {
    const t = setTimeout(() => {
      setBusqueda(texto);
      setPagina(0);
    }, 300);
    return () => clearTimeout(t);
  }, [texto]);

  useEffect(() => {
    supabase.rpc('listar_lineas', { p_org: organizacionId }).then(({ data, error }) => {
      if (error) setError(error.message);
      else {
        // Con una sola columna, PostgREST devuelve texto plano en vez de objetos; se aceptan ambos formatos
        const lista = (data ?? []) as (string | { linea: string })[];
        setLineas(lista.map((d) => (typeof d === 'string' ? d : d.linea)));
      }
    });
  }, [supabase, organizacionId]);

  const { modo, item, nombre, referencia } = config;

  // Argumentos del listado. Los usan tanto la carga normal como "Copiar todo",
  // para que lo copiado sea exactamente lo que el usuario está filtrando/ordenando.
  const argsListado = useCallback(
    (limite: number, desplazamiento: number) => {
      const campos = [item && 'item', nombre && 'nombre', referencia && 'referencia'].filter(Boolean);
      return {
        p_org: organizacionId,
        p_linea: linea || null,
        p_busqueda: busqueda || null,
        p_limit: limite,
        p_offset: desplazamiento,
        p_modo: modo,
        p_campos: campos,
        // Solo se envían si hay un orden elegido: sin él, la consulta es idéntica a la de antes.
        ...(orden ? { p_orden: orden.clave, p_dir: orden.dir } : {}),
      };
    },
    [organizacionId, linea, busqueda, modo, item, nombre, referencia, orden],
  );

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase.rpc('listar_agotados', argsListado(POR_PAGINA, pagina * POR_PAGINA));
    if (error) setError(error.message);
    else {
      setError('');
      setFilas((data ?? []) as Fila[]);
    }
    setCargando(false);
  }, [supabase, argsListado, pagina]);

  useEffect(() => {
    if (configLista) cargar();
  }, [cargar, configLista]);

  useAgotadosTiempoReal(supabase, organizacionId, cargar);

  async function accion(nombreAccion: string, args: Record<string, unknown>) {
    const { error } = await supabase.rpc(nombreAccion, { p_org: organizacionId, ...args });
    if (error) setError(error.message);
    else setError('');
    await cargar();
  }

  // Cierra "Configurar búsqueda" al hacer clic fuera o pulsar Escape
  useEffect(() => {
    if (!menuAbierto) return;
    function alPulsar(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuAbierto(false);
    }
    function alTecla(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuAbierto(false);
    }
    document.addEventListener('mousedown', alPulsar);
    document.addEventListener('keydown', alTecla);
    return () => {
      document.removeEventListener('mousedown', alPulsar);
      document.removeEventListener('keydown', alTecla);
    };
  }, [menuAbierto]);

  useEffect(
    () => () => {
      if (temporizadorAviso.current) clearTimeout(temporizadorAviso.current);
    },
    [],
  );

  function mostrarAviso(texto: string, error = false) {
    if (temporizadorAviso.current) clearTimeout(temporizadorAviso.current);
    setAviso({ texto, error });
    temporizadorAviso.current = setTimeout(() => setAviso(null), 3500);
  }

  // Sin orden → ascendente → descendente → sin orden (como el filtro de Excel)
  function alternarOrden(clave: ClaveOrden) {
    setOrden((actual) => {
      if (!actual || actual.clave !== clave) return { clave, dir: 'asc' };
      if (actual.dir === 'asc') return { clave, dir: 'desc' };
      return null;
    });
    setPagina(0);
  }

  // Las solicitudes de pedido activas suben al inicio de la lista (y de todas las páginas).
  // Usa el mismo orden que el encabezado "Solicitud", así ambos se mantienen sincronizados.
  const solicitudesArriba = orden?.clave === 'solicitud' && orden.dir === 'asc';
  function alternarSolicitudesArriba() {
    setOrden(solicitudesArriba ? null : { clave: 'solicitud', dir: 'asc' });
    setPagina(0);
  }

  async function traerTodas(): Promise<Fila[]> {
    const acumuladas: Fila[] = [];
    for (let desde = 0; desde < MAX_COPIA; desde += LOTE_COPIA) {
      const { data, error } = await supabase.rpc('listar_agotados', argsListado(LOTE_COPIA, desde));
      if (error) throw new Error(error.message);
      const lote = (data ?? []) as Fila[];
      acumuladas.push(...lote);
      if (lote.length < LOTE_COPIA || acumuladas.length >= (lote[0]?.total ?? 0)) break;
    }
    return acumuladas;
  }

  // ---------- Vista: grupos plegables y tamaños ----------

  useEffect(() => {
    setVista(leerVistaGuardada());
    setVistaLista(true);
  }, []);

  // Se guarda con una pequeña espera para no escribir en cada píxel de un arrastre
  useEffect(() => {
    if (!vistaLista) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(CLAVE_VISTA, JSON.stringify(vista));
      } catch {
        // sin almacenamiento disponible: la vista vale solo para esta sesión
      }
    }, 300);
    return () => clearTimeout(t);
  }, [vista, vistaLista]);

  const plegada = (clave: string) => !!(GRUPO_DE[clave] && vista.grupos[GRUPO_DE[clave].clave]);
  const anchoDe = (clave: string) => vista.anchos[clave] ?? ANCHO_DEFECTO[clave] ?? 150;

  // Columnas de datos que se ven; un grupo plegado ocupa una sola columna resumen (g-*)
  const clavesVisibles: string[] = [];
  for (const c of COLUMNAS) {
    const g = GRUPO_DE[c.clave];
    if (!g) clavesVisibles.push(c.clave);
    else if (!vista.grupos[g.clave]) clavesVisibles.push(c.clave);
    else if (g.columnas[0] === c.clave) clavesVisibles.push(g.clave);
  }
  const anchoTabla = clavesVisibles.reduce((suma, k) => suma + anchoDe(k), 0);
  const todosPlegados = GRUPOS.every((g) => vista.grupos[g.clave]);
  const vistaPersonalizada =
    Object.keys(vista.anchos).length > 0 || Object.keys(vista.grupos).length > 0 || Object.keys(alturas).length > 0;

  function alternarGrupo(clave: string) {
    setVista((v) => ({ ...v, grupos: { ...v.grupos, [clave]: !v.grupos[clave] } }));
  }

  function alternarTodosLosGrupos() {
    setVista((v) => ({
      ...v,
      grupos: todosPlegados ? {} : Object.fromEntries(GRUPOS.map((g) => [g.clave, true])),
    }));
  }

  function fijarAncho(clave: string, ancho: number) {
    setVista((v) => ({ ...v, anchos: { ...v.anchos, [clave]: limitar(ancho, ANCHO_MIN, ANCHO_MAX) } }));
  }

  // Arrastre de columnas y filas con pointer capture: el movimiento sigue llegando
  // aunque el puntero salga del borde, y sirve igual con mouse, lápiz o dedo.
  function empezarArrastre(e: React.PointerEvent<HTMLElement>, clave: string, eje: 'x' | 'y', base: number) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastre.current = { clave, inicio: eje === 'x' ? e.clientX : e.clientY, base };
  }
  function moverColumna(e: React.PointerEvent<HTMLElement>, clave: string) {
    const a = arrastre.current;
    if (a && a.clave === clave) fijarAncho(clave, a.base + e.clientX - a.inicio);
  }
  function moverFila(e: React.PointerEvent<HTMLElement>, id: string) {
    const a = arrastre.current;
    if (a && a.clave === id) setAlturas((h) => ({ ...h, [id]: limitar(a.base + e.clientY - a.inicio, ALTO_MIN, ALTO_MAX) }));
  }
  function terminarArrastre(e: React.PointerEvent<HTMLElement>) {
    arrastre.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function teclaColumna(e: React.KeyboardEvent<HTMLElement>, clave: string) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    fijarAncho(clave, anchoDe(clave) + (e.key === 'ArrowRight' ? 16 : -16));
  }

  // Ancho que necesita una columna para mostrar su contenido sin cortarlo
  function medirColumna(clave: string): number {
    // los campos editables no tienen texto que medir: conservan su ancho normal
    if (clave === 'cantidad' || clave === 'nota' || clave.startsWith('g-')) return ANCHO_DEFECTO[clave] ?? 150;
    const ctx = (medidor.current ??= document.createElement('canvas').getContext('2d'));
    if (!ctx || !tablaRef.current) return anchoDe(clave);
    let max = 0;
    tablaRef.current.querySelectorAll<HTMLElement>(`[data-col="${clave}"]`).forEach((celda) => {
      const est = getComputedStyle(celda);
      ctx.font = `${est.fontWeight} ${est.fontSize} ${est.fontFamily}`;
      const extra = celda.tagName === 'TH' ? 44 : 34; // relleno + icono de orden / insignia
      const linea = celda.innerText.split('\n').reduce((m, t) => Math.max(m, ctx.measureText(t).width), 0);
      max = Math.max(max, linea + extra);
    });
    return limitar(Math.ceil(max), ANCHO_MIN, ANCHO_MAX);
  }

  function ajustarUnaColumna(clave: string) {
    fijarAncho(clave, medirColumna(clave));
  }

  // "Ajustar columnas y filas": cada columna al ancho de su contenido y cada fila a su alto natural
  function ajustarColumnasYFilas() {
    setVista((v) => ({ ...v, anchos: Object.fromEntries(clavesVisibles.map((k) => [k, medirColumna(k)])) }));
    setAlturas({});
  }

  function restablecerVista() {
    setVista(VISTA_INICIAL);
    setAlturas({});
  }

  // ---------- Selección de celdas ----------

  const nFilas = filas.length;
  const nCols = clavesVisibles.length;
  const rango: Rango | null =
    seleccion && nFilas > 0 && nCols > 0
      ? (() => {
          const a = { r: dentro(seleccion.ancla.r, nFilas - 1), c: dentro(seleccion.ancla.c, nCols - 1) };
          const f = { r: dentro(seleccion.foco.r, nFilas - 1), c: dentro(seleccion.foco.c, nCols - 1) };
          return {
            r1: Math.min(a.r, f.r),
            r2: Math.max(a.r, f.r),
            c1: Math.min(a.c, f.c),
            c2: Math.max(a.c, f.c),
            activa: a,
          };
        })()
      : null;

  // Si cambia lo que se está viendo (filtro, orden, página, columnas plegadas) la selección ya no aplica
  useEffect(() => {
    setSeleccion(null);
  }, [pagina, linea, busqueda, orden, config, vista.grupos]);

  function celdaEn(x: number, y: number): Celda | null {
    const td = document.elementFromPoint(x, y)?.closest<HTMLElement>('td[data-r]');
    if (!td || !tablaRef.current?.contains(td)) return null;
    return { r: Number(td.dataset.r), c: Number(td.dataset.c) };
  }

  // Mientras se arrastra: sigue al puntero y desplaza la tabla si se acerca al borde
  useEffect(() => {
    let cuadro = 0;
    const BORDE = 40;
    const PASO = 12;

    function seguir() {
      cuadro = 0;
      const cont = contenedorRef.current;
      if (!seleccionando.current || !cont) return;
      const cab = tablaRef.current?.tHead?.offsetHeight ?? 0;
      const caja = cont.getBoundingClientRect();
      const izq = caja.left + cont.clientLeft;
      const arriba = caja.top + cont.clientTop;
      const { x, y } = ultimoPuntero.current;

      cont.scrollLeft += x < izq + BORDE ? -PASO : x > izq + cont.clientWidth - BORDE ? PASO : 0;
      cont.scrollTop += y < arriba + cab + BORDE ? -PASO : y > arriba + cont.clientHeight - BORDE ? PASO : 0;

      // el puntero se limita al área de datos para que siempre caiga sobre una celda
      const cx = Math.min(Math.max(x, izq + 2), izq + cont.clientWidth - 2);
      const cy = Math.min(Math.max(y, arriba + cab + 2), arriba + cont.clientHeight - 2);
      const celda = celdaEn(cx, cy);
      if (celda) {
        setSeleccion((s) => (s && (s.foco.r !== celda.r || s.foco.c !== celda.c) ? { ...s, foco: celda } : s));
      }
      cuadro = requestAnimationFrame(seguir);
    }

    function alMover(e: PointerEvent) {
      if (!seleccionando.current) return;
      ultimoPuntero.current = { x: e.clientX, y: e.clientY };
      if (!cuadro) cuadro = requestAnimationFrame(seguir);
    }
    function alSoltar() {
      seleccionando.current = false;
    }

    document.addEventListener('pointermove', alMover);
    document.addEventListener('pointerup', alSoltar);
    document.addEventListener('pointercancel', alSoltar);
    return () => {
      document.removeEventListener('pointermove', alMover);
      document.removeEventListener('pointerup', alSoltar);
      document.removeEventListener('pointercancel', alSoltar);
      if (cuadro) cancelAnimationFrame(cuadro);
    };
  }, []);

  function alPulsarCelda(e: React.PointerEvent<HTMLTableSectionElement>) {
    if (e.button !== 0) return;
    const objetivo = e.target as HTMLElement;
    if (objetivo.closest('.ag-rowresizer')) return;
    const td = objetivo.closest<HTMLElement>('td[data-r]');
    if (!td) return;
    const celda = { r: Number(td.dataset.r), c: Number(td.dataset.c) };
    const extender = e.shiftKey;
    setSeleccion((s) => (extender && s ? { ...s, foco: celda } : { ancla: celda, foco: celda }));

    // Campos y botones siguen funcionando normal: solo marcan su celda, sin arrastre
    if (objetivo.closest('input, textarea, select, button, a')) return;
    contenedorRef.current?.focus({ preventScroll: true });
    // Con el dedo el arrastre desplaza la tabla: allí basta con tocar una celda
    if (e.pointerType === 'touch') return;
    seleccionando.current = true;
    ultimoPuntero.current = { x: e.clientX, y: e.clientY };
  }

  function verCelda(r: number, c: number) {
    requestAnimationFrame(() => {
      tablaRef.current
        ?.querySelector(`td[data-r="${r}"][data-c="${c}"]`)
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }

  function alTeclaTabla(e: React.KeyboardEvent<HTMLDivElement>) {
    // Dentro de un campo de texto o botón, el teclado es de ese control
    if (e.target !== e.currentTarget) return;
    const modificador = e.ctrlKey || e.metaKey;
    const tecla = e.key.toLowerCase();

    if (modificador && tecla === 'c') {
      if (rango) {
        e.preventDefault();
        copiarSeleccion();
      }
      return;
    }
    if (modificador && tecla === 'a') {
      if (nFilas > 0 && nCols > 0) {
        e.preventDefault();
        setSeleccion({ ancla: { r: 0, c: 0 }, foco: { r: nFilas - 1, c: nCols - 1 } });
      }
      return;
    }
    if (e.key === 'Escape') {
      if (seleccion) {
        e.preventDefault();
        setSeleccion(null);
      }
      return;
    }
    const paso: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    // Sin selección, las flechas siguen desplazando la tabla como siempre
    if (!paso[e.key] || !rango) return;
    e.preventDefault();
    const [dr, dc] = paso[e.key];
    // Con Mayús se estira el rango desde su extremo; sin Mayús se mueve la celda activa
    const desde = e.shiftKey ? seleccion!.foco : rango.activa;
    const destino = { r: dentro(desde.r + dr, nFilas - 1), c: dentro(desde.c + dc, nCols - 1) };
    setSeleccion(e.shiftKey ? { ancla: seleccion!.ancla, foco: destino } : { ancla: destino, foco: destino });
    verCelda(destino.r, destino.c);
  }

  async function copiarSeleccion() {
    if (!rango) return;
    const claves = clavesVisibles.slice(rango.c1, rango.c2 + 1);
    const datos = filas.slice(rango.r1, rango.r2 + 1).map((f) => claves.map((k) => textoCelda(f, k)));
    try {
      await copiarAlPortapapeles(Promise.resolve(construirTablaCopia([], datos)));
      const celdas = datos.length * claves.length;
      mostrarAviso(`Copiado: ${formatoNumero(celdas)} ${celdas === 1 ? 'celda' : 'celdas'}. Ya puedes pegarlas en Excel.`);
    } catch (e) {
      mostrarAviso(e instanceof Error && e.message ? `No se pudo copiar: ${e.message}` : 'No se pudo copiar.', true);
    }
  }

  // ---------- Copiar ----------

  const columnasCopia = COLUMNAS.filter((c) => c.texto && !plegada(c.clave));
  const columnasOcultas = COLUMNAS.filter((c) => c.texto && plegada(c.clave)).length;

  async function copiar(alcance: 'pagina' | 'todo') {
    setCopiando(true);
    try {
      const datos = alcance === 'pagina' ? Promise.resolve(filas) : traerTodas();
      const contenido = datos.then((lista) =>
        construirTablaCopia(
          columnasCopia.map((c) => c.titulo),
          lista.map((f) => columnasCopia.map((c) => c.texto!(f))),
        ),
      );
      await copiarAlPortapapeles(contenido);
      const n = (await datos).length;
      const ocultas = columnasOcultas ? `, sin ${columnasOcultas} columnas ocultas` : '';
      mostrarAviso(`Tabla copiada (${formatoNumero(n)} ${n === 1 ? 'fila' : 'filas'}${ocultas}). Ya puedes pegarla en Excel.`);
    } catch (e) {
      mostrarAviso(e instanceof Error && e.message ? `No se pudo copiar: ${e.message}` : 'No se pudo copiar la tabla.', true);
    } finally {
      setCopiando(false);
    }
  }

  // Todas las solicitudes de pedido activas de la sede, sin importar filtros ni página.
  // Ordenando por "solicitud" las activas quedan primero y los vacíos al final,
  // así basta con leer lotes hasta encontrar la primera fila sin solicitud.
  async function traerSolicitudes(): Promise<Fila[]> {
    const activas: Fila[] = [];
    for (let desde = 0; desde < MAX_COPIA; desde += LOTE_COPIA) {
      const { data, error } = await supabase.rpc('listar_agotados', {
        p_org: organizacionId,
        p_limit: LOTE_COPIA,
        p_offset: desde,
        p_orden: 'solicitud',
        p_dir: 'asc',
      });
      if (error) throw new Error(error.message);
      const lote = (data ?? []) as Fila[];
      const conSolicitud = lote.filter((f) => f.estado_comercial !== null);
      activas.push(...conSolicitud);
      if (conSolicitud.length < lote.length || lote.length < LOTE_COPIA) break;
    }
    return activas;
  }

  async function copiarSolicitudes() {
    setCopiando(true);
    try {
      const datos = traerSolicitudes();
      const contenido = datos.then((lista) => {
        if (lista.length === 0) throw new SinDatos('No hay solicitudes de pedido activas.');
        const cols: { titulo: string; texto: (f: Fila) => string }[] = [
          { titulo: 'Item', texto: (f) => f.codigo ?? String(f.item_id) },
          { titulo: 'Nombre Base', texto: (f) => f.nombre_base },
          { titulo: 'Referencia', texto: (f) => f.referencia ?? '' },
          { titulo: 'Línea', texto: (f) => f.linea ?? '' },
          { titulo: 'Cant. sugerida', texto: (f) => f.cantidad_sugerida?.toString() ?? '' },
          { titulo: 'Nota', texto: (f) => f.notas ?? '' },
          { titulo: 'Fecha solicitud', texto: (f) => fecha(f.fecha_estado) },
          { titulo: 'Respuesta Compras', texto: (f) => textoRespuesta(f) },
        ];
        // Tabla para Excel/Word/correo (HTML) y lista legible para WhatsApp/chat (texto plano)
        const tabla = construirTablaCopia(
          cols.map((c) => c.titulo),
          lista.map((f) => cols.map((c) => c.texto(f))),
        );
        const hoy = new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota' });
        const lineas = lista.map((f, i) => {
          const partes = [`${i + 1}. [${f.codigo ?? f.item_id}] ${f.nombre_base}`];
          if (f.referencia) partes.push(`Ref: ${f.referencia}`);
          if (f.cantidad_sugerida !== null) partes.push(`Cant: ${f.cantidad_sugerida}`);
          if (f.notas) partes.push(`Nota: ${f.notas.replace(/\s+/g, ' ')}`);
          if (f.respuesta_compras) partes.push(textoRespuesta(f));
          return partes.join(' | ');
        });
        const sede = lista[0].sede ? ` - ${lista[0].sede}` : '';
        return { html: tabla.html, texto: `SOLICITUD DE PEDIDO${sede} - ${hoy}\n\n${lineas.join('\n')}` };
      });
      await copiarAlPortapapeles(contenido);
      const n = (await datos).length;
      mostrarAviso(`Solicitudes de pedido copiadas (${formatoNumero(n)}).`);
    } catch (e) {
      if (e instanceof SinDatos) mostrarAviso(e.message);
      else mostrarAviso(e instanceof Error && e.message ? `No se pudo copiar: ${e.message}` : 'No se pudo copiar.', true);
    } finally {
      setCopiando(false);
    }
  }

  const total = filas[0]?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  const limiteCopia = Math.min(total, MAX_COPIA);
  const columnaOrden = orden ? COLUMNAS.find((c) => c.orden === orden.clave) : undefined;

  // Encabezado ordenable + tirador para cambiar el ancho de la columna
  function renderTh(c: Columna, extra: { rowSpan?: number; sub?: boolean }) {
    const clave = c.orden;
    const activa = !!clave && orden?.clave === clave;
    const ariaSort = clave
      ? activa
        ? orden!.dir === 'asc'
          ? ('ascending' as const)
          : ('descending' as const)
        : ('none' as const)
      : undefined;
    const clases = [clave ? 'ag-th--sort' : '', extra.sub ? 'ag-th--sub' : ''].filter(Boolean).join(' ');
    return (
      <th
        key={c.clave}
        scope="col"
        rowSpan={extra.rowSpan}
        aria-sort={ariaSort}
        data-col={c.clave}
        className={clases || undefined}
      >
        {clave ? (
          <button
            type="button"
            className="ag-sort"
            onClick={() => alternarOrden(clave)}
            title={`Ordenar por ${c.titulo}`}
          >
            <span className="ag-sort__label">{c.titulo}</span>
            <SortIcon />
          </button>
        ) : (
          <span className="ag-th__label">{c.titulo}</span>
        )}
        {tirador(c.clave, c.titulo)}
      </th>
    );
  }

  function tirador(clave: string, titulo: string) {
    return (
      <span
        className="ag-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label={`Cambiar ancho de ${titulo}`}
        aria-valuenow={Math.round(anchoDe(clave))}
        aria-valuemin={ANCHO_MIN}
        aria-valuemax={ANCHO_MAX}
        tabIndex={0}
        title="Arrastra para cambiar el ancho. Doble clic: ajustar al contenido"
        onPointerDown={(e) => empezarArrastre(e, clave, 'x', anchoDe(clave))}
        onPointerMove={(e) => moverColumna(e, clave)}
        onPointerUp={terminarArrastre}
        onPointerCancel={terminarArrastre}
        onDoubleClick={() => ajustarUnaColumna(clave)}
        onKeyDown={(e) => teclaColumna(e, clave)}
      />
    );
  }

  // Encabezado: columnas sueltas ocupan las 2 filas; cada grupo tiene una banda arriba
  // (con su botón plegar/desplegar) y sus columnas debajo. Plegado ocupa las 2 filas.
  const encabezadoSuperior: React.ReactNode[] = [];
  const encabezadoInferior: React.ReactNode[] = [];
  for (const c of COLUMNAS) {
    const g = GRUPO_DE[c.clave];
    if (!g) {
      encabezadoSuperior.push(renderTh(c, { rowSpan: 2 }));
    } else if (vista.grupos[g.clave]) {
      if (g.columnas[0] === c.clave) {
        encabezadoSuperior.push(
          <th key={g.clave} scope="col" rowSpan={2} className="ag-th--grupo-plegado" data-col={g.clave}>
            <button
              type="button"
              className="ag-band__btn"
              aria-expanded={false}
              onClick={() => alternarGrupo(g.clave)}
              title={`Desplegar: ${g.titulo}`}
            >
              <ChevronDownIcon className="ag-band__chev" />
              <span className="ag-band__label">{g.titulo}</span>
            </button>
            {tirador(g.clave, g.titulo)}
          </th>,
        );
      }
    } else {
      if (g.columnas[0] === c.clave) {
        encabezadoSuperior.push(
          <th key={g.clave} scope="colgroup" colSpan={g.columnas.length} className="ag-band">
            <button
              type="button"
              className="ag-band__btn"
              aria-expanded={true}
              onClick={() => alternarGrupo(g.clave)}
              title={`Plegar: ${g.titulo}`}
            >
              <ChevronDownIcon className="ag-band__chev" />
              <span className="ag-band__label">{g.titulo}</span>
            </button>
          </th>,
        );
      }
      encabezadoInferior.push(renderTh(c, { sub: true }));
    }
  }

  return (
    <div>
      <div className="ag-toolbar">
        <div className="ag-toolbar__filters">
          <SelectorLinea
            variante="ui"
            lineas={lineas}
            valor={linea}
            onCambio={(v) => {
              setLinea(v);
              setPagina(0);
            }}
          />
          <div className="ag-search">
            <SearchIcon className="ag-search__icon" />
            <input
              type="search"
              className="ui-input"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={`Buscar por ${textoCampos(config)}`}
              aria-label={`Buscar por ${textoCampos(config)}`}
            />
          </div>
          <div className="ag-popover-wrap" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuAbierto((v) => !v)}
              aria-expanded={menuAbierto}
              className="ui-btn"
            >
              Configurar búsqueda
            </button>
            {menuAbierto && (
              <div className="ag-popover">
                <fieldset>
                  <legend>Buscar en</legend>
                  {([
                    ['item', 'Ítem'],
                    ['nombre', 'Nombre'],
                    ['referencia', 'Referencia'],
                  ] as const).map(([clave, etiqueta]) => (
                    <label key={clave}>
                      <input
                        type="checkbox"
                        checked={config[clave]}
                        onChange={(e) => {
                          const nueva = { ...config, [clave]: e.target.checked };
                          // siempre debe quedar al menos un campo activo
                          if (!nueva.item && !nueva.nombre && !nueva.referencia) return;
                          cambiarConfig(nueva);
                        }}
                      />
                      {etiqueta}
                    </label>
                  ))}
                </fieldset>
                <fieldset>
                  <legend>Coincidencia</legend>
                  {MODOS.map((m) => (
                    <label key={m.valor}>
                      <input
                        type="radio"
                        name="modo-busqueda"
                        checked={config.modo === m.valor}
                        onChange={() => cambiarConfig({ ...config, modo: m.valor })}
                      />
                      {m.texto}
                    </label>
                  ))}
                </fieldset>
                <button type="button" onClick={() => setMenuAbierto(false)} className="ui-btn ui-btn--sm">
                  Cerrar
                </button>
              </div>
            )}
          </div>
        </div>

      </div>

      {error && (
        <div role="alert" className="ui-alert ui-alert--error ag-alert">
          <p>Error: {error}</p>
        </div>
      )}

      <div className="ag-tools">
        <p className="ag-summary">
          <span>
            <strong>{formatoNumero(total)}</strong> {total === 1 ? 'ítem' : 'ítems'}
          </span>
          {orden && columnaOrden && (
            <span>
              Ordenado por <strong>{columnaOrden.titulo}</strong> ({orden.dir === 'asc' ? 'ascendente' : 'descendente'}){' '}
              <button
                type="button"
                className="ui-link"
                onClick={() => {
                  setOrden(null);
                  setPagina(0);
                }}
              >
                Quitar orden
              </button>
            </span>
          )}
          {rango && (
            <span>
              <span aria-live="polite">
                Selección: <strong>{formatoNumero(rango.r2 - rango.r1 + 1)}</strong>{' '}
                {rango.r2 === rango.r1 ? 'fila' : 'filas'} × <strong>{formatoNumero(rango.c2 - rango.c1 + 1)}</strong>{' '}
                {rango.c2 === rango.c1 ? 'columna' : 'columnas'}
              </span>{' '}
              <button type="button" className="ui-link" onClick={copiarSeleccion}>
                Copiar selección (Ctrl+C)
              </button>{' '}
              <button type="button" className="ui-link" onClick={() => setSeleccion(null)}>
                Quitar selección
              </button>
            </span>
          )}
          {vistaPersonalizada && (
            <button type="button" className="ui-link" onClick={restablecerVista}>
              Restablecer vista
            </button>
          )}
        </p>

        <div className="ag-tools__buttons">
          <button
            type="button"
            className="ui-btn ui-btn--sm"
            onClick={ajustarColumnasYFilas}
            title="Ajusta cada columna al ancho de su contenido y cada fila a su alto natural"
          >
            <FitIcon width={16} height={16} />
            Ajustar columnas y filas
          </button>
          <button
            type="button"
            className="ui-btn ui-btn--sm"
            onClick={alternarTodosLosGrupos}
            title="Pliega o despliega los grupos de columnas para ver el final de la tabla sin desplazarte"
          >
            <ColumnsIcon width={16} height={16} />
            {todosPlegados ? 'Expandir grupos' : 'Contraer grupos'}
          </button>
          <button
            type="button"
            className="ui-btn ui-btn--sm ag-toggle"
            aria-pressed={solicitudesArriba}
            onClick={alternarSolicitudesArriba}
            title="Muestra primero los ítems con solicitud de pedido activa. Vuelve a pulsar para quitar el orden"
          >
            Solicitar pedido
          </button>
          <span className="ag-tools__sep" aria-hidden="true" />
          <button
            type="button"
            className={`ui-btn ui-btn--sm${copiando ? ' is-loading' : ''}`}
            onClick={() => copiar('pagina')}
            disabled={copiando || filas.length === 0}
            title="Copia esta página con formato de tabla para pegarla en Excel, Word o correo"
          >
            {!copiando && <CopyIcon width={16} height={16} />}
            Copiar tabla
          </button>
          {total > filas.length && (
            <button
              type="button"
              className="ui-btn ui-btn--sm"
              onClick={() => copiar('todo')}
              disabled={copiando}
              title="Copia todas las páginas del resultado actual (respeta filtros y orden)"
            >
              Copiar todo ({formatoNumero(limiteCopia)})
            </button>
          )}
          <button
            type="button"
            className="ui-btn ui-btn--sm"
            onClick={copiarSolicitudes}
            disabled={copiando}
            title="Copia todas las solicitudes de pedido activas de tu sede (tabla para Excel, lista para WhatsApp)"
          >
            <ClipboardListIcon width={16} height={16} />
            Copiar solicitudes de pedido
          </button>
        </div>
      </div>

      <div
        className={cargando ? 'ag-tablewrap is-loading' : 'ag-tablewrap'}
        role="region"
        aria-label="Tabla de agotados"
        aria-busy={cargando}
        tabIndex={0}
        ref={contenedorRef}
        onKeyDown={alTeclaTabla}
      >
        <table
          ref={tablaRef}
          className="ag-table"
          style={{ '--ag-ancho': `${anchoTabla}px` } as React.CSSProperties}
        >
          <colgroup>
            {clavesVisibles.map((k) => (
              <col key={k} style={{ width: anchoDe(k) }} />
            ))}
          </colgroup>
          <thead>
            <tr>{encabezadoSuperior}</tr>
            {encabezadoInferior.length > 0 && <tr>{encabezadoInferior}</tr>}
          </thead>
          <tbody onPointerDown={alPulsarCelda}>
            {filas.map((f, i) => (
              <FilaAgotado
                key={f.item_id}
                fila={f}
                indice={i}
                rango={rango}
                accion={accion}
                columnas={clavesVisibles}
                altura={alturas[f.item_id]}
                redim={{
                  down: (e, base) => empezarArrastre(e, String(f.item_id), 'y', base),
                  move: (e) => moverFila(e, String(f.item_id)),
                  up: terminarArrastre,
                  reset: () =>
                    setAlturas((h) => {
                      const { [f.item_id]: _quitada, ...resto } = h;
                      return resto;
                    }),
                }}
              />
            ))}
            {!cargando && filas.length === 0 && (
              <tr>
                <td className="ag-empty" colSpan={clavesVisibles.length}>
                  Sin resultados
                </td>
              </tr>
            )}
            {cargando && filas.length === 0 && (
              <tr>
                <td className="ag-empty" colSpan={clavesVisibles.length}>
                  Cargando…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="ag-pager">
        <button
          type="button"
          className="ui-btn ui-btn--sm"
          disabled={pagina === 0}
          onClick={() => setPagina((p) => p - 1)}
        >
          Anterior
        </button>
        <span>
          Página {pagina + 1} de {paginas} ({formatoNumero(total)} ítems)
        </span>
        <button
          type="button"
          className="ui-btn ui-btn--sm"
          disabled={pagina + 1 >= paginas}
          onClick={() => setPagina((p) => p + 1)}
        >
          Siguiente
        </button>
      </div>

      {/* Región viva siempre presente: los lectores de pantalla anuncian el aviso al aparecer */}
      <div role="status" aria-live="polite">
        {aviso && <div className={aviso.error ? 'ag-toast ag-toast--error' : 'ag-toast'}>{aviso.texto}</div>}
      </div>
    </div>
  );
}

function FilaAgotado({
  fila: f,
  indice,
  rango,
  accion,
  columnas,
  altura,
  redim,
}: {
  fila: Fila;
  /** Posición de la fila en la página; junto con la columna identifica cada celda seleccionable. */
  indice: number;
  rango: Rango | null;
  accion: (nombre: string, args: Record<string, unknown>) => Promise<void>;
  /** Claves de las columnas que se ven, en orden (g-* = resumen de un grupo plegado). */
  columnas: string[];
  altura?: number;
  redim: {
    down: (e: React.PointerEvent<HTMLElement>, altoActual: number) => void;
    move: (e: React.PointerEvent<HTMLElement>) => void;
    up: (e: React.PointerEvent<HTMLElement>) => void;
    reset: () => void;
  };
}) {
  const [cantidad, setCantidad] = useState(f.cantidad_sugerida?.toString() ?? '');
  const [nota, setNota] = useState(f.notas ?? '');
  // Mientras el usuario está escribiendo, un refresco en segundo plano (por ejemplo
  // porque Compras respondió otro ítem) no debe borrar lo que todavía no ha guardado.
  const editandoCantidad = useRef(false);
  const editandoNota = useRef(false);

  useEffect(() => {
    if (!editandoCantidad.current) setCantidad(f.cantidad_sugerida?.toString() ?? '');
  }, [f.cantidad_sugerida]);
  useEffect(() => {
    if (!editandoNota.current) setNota(f.notas ?? '');
  }, [f.notas]);

  const activo = f.estado_comercial !== null;
  const agotado = f.respuesta_compras === 'agotado_proveedor';

  function guardarCantidad() {
    editandoCantidad.current = false;
    const nueva = cantidad === '' ? null : Number(cantidad);
    if (nueva === (f.cantidad_sugerida ?? null)) return;
    if (nueva !== null && nueva <= 0) return;
    accion('agotado_guardar_cantidad', { p_item: f.item_id, p_cantidad: nueva });
  }

  function guardarNota() {
    editandoNota.current = false;
    if (nota.trim() === (f.notas ?? '')) return;
    accion('agotado_guardar_nota', { p_item: f.item_id, p_nota: nota });
  }

  const insigniaRespuesta = f.respuesta_compras && (
    <>
      <span className={`ui-badge ${RESPUESTA_INSIGNIA[f.respuesta_compras]}`}>{RESPUESTAS[f.respuesta_compras]}</span>
      {f.respuesta_compras === 'no_se_pide' && f.motivo_compras && (
        <div style={{ fontSize: 12, marginTop: 2 }}>{f.motivo_compras}</div>
      )}
    </>
  );
  const insigniaSolicitud = activo && <span className="ui-badge ui-badge--info">Solicitar pedido</span>;

  const celdas: Record<string, React.ReactNode> = {
    item: (
      <>
        {f.codigo ?? f.item_id}
        {/* Tirador de alto de fila, como el encabezado de fila de una hoja de cálculo */}
        <span
          className="ag-rowresizer"
          role="separator"
          aria-orientation="horizontal"
          aria-label={`Cambiar alto de la fila del ítem ${f.item_id}`}
          title="Arrastra para cambiar el alto. Doble clic: alto natural"
          onPointerDown={(e) => redim.down(e, e.currentTarget.closest('tr')!.getBoundingClientRect().height)}
          onPointerMove={redim.move}
          onPointerUp={redim.up}
          onPointerCancel={redim.up}
          onDoubleClick={redim.reset}
        />
      </>
    ),
    nombre: f.nombre_base,
    referencia: f.referencia ?? '',
    linea: f.linea ?? '',
    sede: f.sede ?? '',
    usuario: f.usuario ?? '',
    solicitud: insigniaSolicitud,
    fecha_solicitud: fecha(f.fecha_estado),
    respuesta: insigniaRespuesta,
    fecha_respuesta: fecha(f.fecha_respuesta),
    cantidad: (
      <input
        value={cantidad}
        inputMode="numeric"
        aria-label={`Cantidad sugerida de ${f.nombre_base}`}
        className="ui-input ui-input--sm ag-qty"
        onFocus={() => (editandoCantidad.current = true)}
        onChange={(e) => setCantidad(e.target.value.replace(/\D/g, ''))}
        onBlur={guardarCantidad}
      />
    ),
    nota: (
      <textarea
        value={nota}
        rows={1}
        aria-label={`Nota sobre ${f.nombre_base}`}
        className="ui-input ui-input--sm ag-note"
        style={altura ? { minHeight: Math.max(altura - 24, 0) } : undefined}
        onFocus={() => (editandoNota.current = true)}
        onChange={(e) => setNota(e.target.value)}
        onBlur={guardarNota}
      />
    ),
    fecha_nota: fecha(f.fecha_nota),
    seguimiento: f.seguimiento && <span className="ui-badge ui-badge--warning">{f.seguimiento}</span>,
    accion: (
      <>
        {!activo && (
          <button
            type="button"
            className="ui-btn ui-btn--primary ui-btn--sm"
            onClick={() => accion('agotado_solicitar', { p_item: f.item_id, p_cantidad: cantidad === '' ? null : Number(cantidad) })}
          >
            Solicitar pedido
          </button>
        )}
        {activo && !agotado && (
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => accion('agotado_cerrar', { p_item: f.item_id })}>
            Cerrar
          </button>
        )}
        {activo && agotado && (
          <button
            type="button"
            className="ui-btn ui-btn--danger ui-btn--sm"
            onClick={() => accion('agotado_cerrar', { p_item: f.item_id, p_cancelar: true })}
          >
            Cancelar
          </button>
        )}
      </>
    ),
    // Resumen de cada grupo cuando está plegado
    'g-solicitud': insigniaSolicitud,
    'g-respuesta': insigniaRespuesta,
    'g-nota': f.cantidad_sugerida !== null || f.notas ? (
      <span>
        {f.cantidad_sugerida ?? ''}
        {f.notas ? ' · con nota' : ''}
      </span>
    ) : null,
  };

  return (
    <tr className={activo ? 'ag-row--activo' : undefined} style={altura ? { height: altura } : undefined}>
      {columnas.map((k, c) => (
        <td
          key={k}
          data-col={k}
          data-r={indice}
          data-c={c}
          className={[k === 'item' ? 'ag-col-num ag-rowhead' : CLASE_COL[k], claseSeleccion(indice, c, rango)].filter(Boolean).join(' ') || undefined}
        >
          {celdas[k]}
        </td>
      ))}
    </tr>
  );
}
