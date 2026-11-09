'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAgotadosTiempoReal } from '@/components/useAgotadosTiempoReal';
import { construirTablaCopia, copiarAlPortapapeles } from '@/lib/tablaCopia';
import { EspacioTrabajo } from '@/components/agotados/base/EspacioTrabajo';
import { BotonH, GrupoH, SepH, Segmentado } from '@/components/agotados/base/Barra';
import { CentroConfig } from '@/components/agotados/base/CentroConfig';
import { MenuPop } from '@/components/agotados/base/MenuPop';
import { usePrefsUI } from '@/components/agotados/base/usePrefsUI';
import FilaAgotado, { type Celda, type Rango } from '@/components/agotados/FilaAgotado';
import FiltroLinea from '@/components/agotados/FiltroLinea';
import ListaColumnas from '@/components/agotados/ListaColumnas';
import Paginador from '@/components/agotados/Paginador';
import { seccionesAgotados } from '@/components/agotados/ConfigAgotados';
import { maxCongelables, resolverColumnas, ordenarColumnas, textoCeldaDe } from '@/components/agotados/columnas';
import {
  IcAjustar, IcAjustes, IcAjusteTexto, IcBuscar, IcCaja, IcCerrar, IcChevAbajo, IcChevArriba, IcColumnas,
  IcCopiar, IcCopiarTodo, IcCuadricula, IcDensAmplia, IcDensCompacta, IcDensNormal, IcEnfoque, IcGrupos,
  IcLista, IcOrden, IcOrdenColumna, IcRestablecer, IcVista, IcCheck,
} from '@/components/agotados/iconos';
import {
  PERSISTENCIA_SQL, PREFS_POR_DEFECTO, RPC_PREFS, leerLegado, limpiarLegado, normalizarPrefs,
  type Densidad, type PrefsAgotados,
} from '@/components/agotados/prefs';
import {
  ALTO_MAX, ALTO_MIN, ANCHO_DEFECTO, ANCHO_GUTTER, ANCHO_MAX, ANCHO_MIN, COLUMNAS, COLUMNA_DE, GRUPOS, GRUPO_DE,
  LOTE_COPIA, MAX_COPIA, fecha, formatoNumero, limitar, textoRespuesta,
  type Bloque, type Columna, type ConfigBusqueda, type Fila, type Orden, type ClaveOrden,
} from '@/components/agotados/tipos';

interface Seleccion {
  ancla: Celda; // donde empezó la selección (celda activa)
  foco: Celda; // extremo opuesto, el que se mueve al arrastrar
}

const dentro = (n: number, max: number) => Math.min(max, Math.max(0, n));

/** Aviso esperado (no es un fallo): se muestra sin el prefijo «No se pudo copiar». */
class SinDatos extends Error {}

function textoCampos(c: ConfigBusqueda) {
  const nombres = [c.item && 'ítem', c.nombre && 'nombre', c.referencia && 'referencia'].filter(Boolean) as string[];
  if (nombres.length === 1) return nombres[0];
  return nombres.slice(0, -1).join(', ') + ' o ' + nombres[nombres.length - 1];
}

const DENSIDADES: { valor: Densidad; texto: string; icono: React.ReactNode }[] = [
  { valor: 'compacta', texto: 'Densidad compacta', icono: <IcDensCompacta /> },
  { valor: 'normal', texto: 'Densidad normal', icono: <IcDensNormal /> },
  { valor: 'amplia', texto: 'Densidad amplia', icono: <IcDensAmplia /> },
];

export default function ReporteAgotados({ organizacionId, usuarioId }: { organizacionId: string; usuarioId: string }) {
  const [supabase] = useState(() => createClient());
  const { prefs, cambiar, restablecer, listo, aviso: avisoPrefs, origen } = usePrefsUI<PrefsAgotados>({
    supabase,
    organizacionId,
    usuarioId,
    clave: 'agotados',
    defecto: PREFS_POR_DEFECTO,
    normalizar: normalizarPrefs,
    rpc: PERSISTENCIA_SQL ? RPC_PREFS : null,
    legado: { leer: leerLegado, limpiar: limpiarLegado },
  });
  const { barras, enfoque, etiquetas, columnas: prefCols, tabla: prefTabla, busqueda: config } = prefs;
  const porPagina = prefTabla.porPagina;

  const [filas, setFilas] = useState<Fila[]>([]);
  const [lineas, setLineas] = useState<string[]>([]);
  const [linea, setLinea] = useState('');
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [orden, setOrden] = useState<Orden | null>(null);
  const [copiando, setCopiando] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; error: boolean } | null>(null);
  const [centro, setCentro] = useState<{ abierto: boolean; seccion: string }>({ abierto: false, seccion: 'barras' });
  // Alto (px) de filas ajustadas a mano, por ítem. Solo dura mientras la pantalla está abierta.
  const [alturas, setAlturas] = useState<Record<string, number>>({});
  const temporizadorAviso = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tablaRef = useRef<HTMLTableElement>(null);
  const medidor = useRef<CanvasRenderingContext2D | null>(null);
  const arrastre = useRef<{ clave: string; inicio: number; base: number } | null>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const [seleccion, setSeleccion] = useState<Seleccion | null>(null);
  const seleccionando = useRef(false);
  const ultimoPuntero = useRef({ x: 0, y: 0 });

  // ---------- Preferencias: atajos ----------

  const setBarras = (parcial: Partial<PrefsAgotados['barras']>) =>
    cambiar((p) => ({ ...p, barras: { ...p.barras, ...parcial } }));
  const setTabla = (parcial: Partial<PrefsAgotados['tabla']>) => cambiar((p) => ({ ...p, tabla: { ...p.tabla, ...parcial } }));
  const setEnfoque = useCallback((v: boolean) => cambiar((p) => ({ ...p, enfoque: v })), [cambiar]);
  const abrirCentro = (seccion: string) => setCentro({ abierto: true, seccion });

  function cambiarBusqueda(nueva: ConfigBusqueda) {
    cambiar((p) => ({ ...p, busqueda: nueva }));
    setPagina(0);
  }
  function cambiarPorPagina(n: number) {
    setTabla({ porPagina: n });
    setPagina(0);
  }

  // ---------- Datos ----------

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

  // Argumentos del listado. Los usan tanto la carga normal como «Copiar todo», para que lo copiado
  // sea exactamente lo que el usuario está filtrando/ordenando.
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
    const { data, error } = await supabase.rpc('listar_agotados', argsListado(porPagina, pagina * porPagina));
    if (error) setError(error.message);
    else {
      setError('');
      setFilas((data ?? []) as Fila[]);
    }
    setCargando(false);
  }, [supabase, argsListado, pagina, porPagina]);

  useEffect(() => {
    if (listo) cargar();
  }, [cargar, listo]);

  useAgotadosTiempoReal(supabase, organizacionId, cargar);

  async function accion(nombreAccion: string, args: Record<string, unknown>) {
    const { error } = await supabase.rpc(nombreAccion, { p_org: organizacionId, ...args });
    if (error) setError(error.message);
    else setError('');
    await cargar();
  }

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
  // Usa el mismo orden que el encabezado «Solicitud», así ambos se mantienen sincronizados.
  const solicitudesArriba = orden?.clave === 'solicitud' && orden.dir === 'asc';
  function alternarSolicitudesArriba() {
    setOrden(solicitudesArriba ? null : { clave: 'solicitud', dir: 'asc' });
    setPagina(0);
  }

  const hayFiltros = !!linea || texto.trim() !== '';
  function limpiarFiltros() {
    setLinea('');
    setTexto('');
    setBusqueda('');
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

  // ---------- Columnas: visibles, plegadas, tamaños ----------

  const { visibles, claves: clavesVisibles, visiblesPorGrupo } = resolverColumnas(prefCols.ocultas, prefCols.orden, prefCols.plegados);
  const plegada = (clave: string) => !!(GRUPO_DE[clave] && prefCols.plegados.includes(GRUPO_DE[clave].clave));
  const anchoDe = (clave: string) => prefCols.anchos[clave] ?? ANCHO_DEFECTO[clave] ?? 150;
  const anchoTabla = ANCHO_GUTTER + clavesVisibles.reduce((suma, k) => suma + anchoDe(k), 0);
  const gruposConColumnas = GRUPOS.filter((g) => (visiblesPorGrupo[g.clave] ?? 0) > 0);
  const todosPlegados = gruposConColumnas.length > 0 && gruposConColumnas.every((g) => prefCols.plegados.includes(g.clave));

  // Columnas congeladas: se calcula a qué distancia del borde izquierdo queda cada una
  const maxCongelar = maxCongelables(clavesVisibles);
  const nCongeladas = Math.min(prefCols.congelar, maxCongelar);
  const fijas: Record<string, number> = {};
  let izqAcumulada = ANCHO_GUTTER;
  clavesVisibles.slice(0, nCongeladas).forEach((k) => {
    fijas[k] = izqAcumulada;
    izqAcumulada += anchoDe(k);
  });
  const ultimaFija = nCongeladas > 0 ? clavesVisibles[nCongeladas - 1] : null;

  const vistaPersonalizada =
    Object.keys(prefCols.anchos).length > 0 ||
    prefCols.plegados.length > 0 ||
    prefCols.ocultas.length > 0 ||
    prefCols.orden.length > 0 ||
    prefCols.congelar !== PREFS_POR_DEFECTO.columnas.congelar ||
    Object.keys(alturas).length > 0;

  const setColumnas = (fn: (c: PrefsAgotados['columnas']) => PrefsAgotados['columnas']) =>
    cambiar((p) => ({ ...p, columnas: fn(p.columnas) }));

  function alternarGrupo(clave: Bloque) {
    setColumnas((c) => ({ ...c, plegados: c.plegados.includes(clave) ? c.plegados.filter((k) => k !== clave) : [...c.plegados, clave] }));
  }
  function alternarTodosLosGrupos() {
    setColumnas((c) => ({ ...c, plegados: todosPlegados ? [] : GRUPOS.map((g) => g.clave) }));
  }
  function alternarColumna(clave: string) {
    if (COLUMNA_DE[clave]?.esencial) return;
    setColumnas((c) => ({ ...c, ocultas: c.ocultas.includes(clave) ? c.ocultas.filter((k) => k !== clave) : [...c.ocultas, clave] }));
  }
  function moverColumna(clave: string, dir: -1 | 1) {
    setColumnas((c) => {
      const todas = ordenarColumnas(COLUMNAS, c.orden);
      const bloque = COLUMNA_DE[clave].bloque;
      const del = todas.filter((x) => x.bloque === bloque).map((x) => x.clave);
      const i = del.indexOf(clave);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= del.length) return c;
      [del[i], del[j]] = [del[j], del[i]];
      const resto = todas.filter((x) => x.bloque !== bloque).map((x) => x.clave);
      return { ...c, orden: [...resto, ...del] };
    });
  }
  function fijarAncho(clave: string, ancho: number) {
    setColumnas((c) => ({ ...c, anchos: { ...c.anchos, [clave]: limitar(ancho, ANCHO_MIN, ANCHO_MAX) } }));
  }

  // Arrastre de columnas y filas con pointer capture: el movimiento sigue llegando
  // aunque el puntero salga del borde, y sirve igual con mouse, lápiz o dedo.
  function empezarArrastre(e: React.PointerEvent<HTMLElement>, clave: string, eje: 'x' | 'y', base: number) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastre.current = { clave, inicio: eje === 'x' ? e.clientX : e.clientY, base };
  }
  function moverColumnaArrastre(e: React.PointerEvent<HTMLElement>, clave: string) {
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
    if (clave === 'cantidad' || clave === 'nota' || clave === 'accion' || clave.startsWith('g-')) return ANCHO_DEFECTO[clave] ?? 150;
    const ctx = (medidor.current ??= document.createElement('canvas').getContext('2d'));
    if (!ctx || !tablaRef.current) return anchoDe(clave);
    let max = 0;
    tablaRef.current.querySelectorAll<HTMLElement>(`[data-col="${clave}"]`).forEach((celda) => {
      const est = getComputedStyle(celda);
      ctx.font = `${est.fontWeight} ${est.fontSize} ${est.fontFamily}`;
      const extra = celda.tagName === 'TH' ? 52 : 36; // relleno + icono de orden / insignia
      const linea = (celda.innerText || '').split('\n').reduce((m, t) => Math.max(m, ctx.measureText(t).width), 0);
      max = Math.max(max, linea + extra);
    });
    return limitar(Math.ceil(max), ANCHO_MIN, ANCHO_MAX);
  }

  // «Ajustar»: cada columna al ancho de su contenido y cada fila a su alto natural
  function ajustarColumnasYFilas() {
    setColumnas((c) => ({ ...c, anchos: Object.fromEntries(clavesVisibles.map((k) => [k, medirColumna(k)])) }));
    setAlturas({});
  }

  function restablecerVista() {
    setColumnas(() => PREFS_POR_DEFECTO.columnas);
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

  // Si cambia lo que se está viendo (filtro, orden, página, columnas) la selección ya no aplica
  useEffect(() => {
    setSeleccion(null);
  }, [pagina, porPagina, linea, busqueda, orden, config, prefCols.plegados, prefCols.ocultas, prefCols.orden]);

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
    if (objetivo.closest('.agx-rowresizer')) return;

    // Encabezado de fila (número): selecciona la fila completa; con Mayús, estira desde la fila anterior
    const guia = objetivo.closest<HTMLElement>('td[data-fila]');
    if (guia) {
      const r = Number(guia.dataset.fila);
      if (nCols === 0) return;
      setSeleccion((s) =>
        e.shiftKey && s ? { ancla: { r: s.ancla.r, c: 0 }, foco: { r, c: nCols - 1 } } : { ancla: { r, c: 0 }, foco: { r, c: nCols - 1 } },
      );
      contenedorRef.current?.focus({ preventScroll: true });
      return;
    }

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

  function seleccionarTodo() {
    if (nFilas > 0 && nCols > 0) {
      setSeleccion({ ancla: { r: 0, c: 0 }, foco: { r: nFilas - 1, c: nCols - 1 } });
      contenedorRef.current?.focus({ preventScroll: true });
    }
  }

  function verCelda(r: number, c: number) {
    requestAnimationFrame(() => {
      tablaRef.current?.querySelector(`td[data-r="${r}"][data-c="${c}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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
    if (modificador && !e.shiftKey && tecla === 'a') {
      if (nFilas > 0 && nCols > 0) {
        e.preventDefault();
        seleccionarTodo();
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
    const datos = filas.slice(rango.r1, rango.r2 + 1).map((f) => claves.map((k) => textoCeldaDe(f, k, prefCols.ocultas)));
    try {
      await copiarAlPortapapeles(Promise.resolve(construirTablaCopia([], datos)));
      const celdas = datos.length * claves.length;
      mostrarAviso(`Copiado: ${formatoNumero(celdas)} ${celdas === 1 ? 'celda' : 'celdas'}. Ya puedes pegarlas en Excel.`);
    } catch (e) {
      mostrarAviso(e instanceof Error && e.message ? `No se pudo copiar: ${e.message}` : 'No se pudo copiar.', true);
    }
  }

  // ---------- Copiar ----------

  const columnasCopia: Columna[] = visibles.filter((c) => c.texto && !plegada(c.clave));
  const columnasNoCopiadas = COLUMNAS.filter((c) => c.texto && (prefCols.ocultas.includes(c.clave) || plegada(c.clave))).length;

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
      const ocultas = columnasNoCopiadas ? `, sin ${columnasNoCopiadas} columnas ocultas` : '';
      mostrarAviso(`Tabla copiada (${formatoNumero(n)} ${n === 1 ? 'fila' : 'filas'}${ocultas}). Ya puedes pegarla en Excel.`);
    } catch (e) {
      mostrarAviso(e instanceof Error && e.message ? `No se pudo copiar: ${e.message}` : 'No se pudo copiar la tabla.', true);
    } finally {
      setCopiando(false);
    }
  }

  // Todas las solicitudes de pedido activas de la sede, sin importar filtros ni página.
  // Ordenando por «solicitud» las activas quedan primero y los vacíos al final,
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
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const limiteCopia = Math.min(total, MAX_COPIA);
  const columnaOrden = orden ? COLUMNAS.find((c) => c.orden === orden.clave) : undefined;
  const solo = !etiquetas;

  // ---------- Encabezado de la tabla ----------

  function tirador(clave: string, titulo: string) {
    return (
      <span
        className="agx-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label={`Cambiar ancho de ${titulo}`}
        aria-valuenow={Math.round(anchoDe(clave))}
        aria-valuemin={ANCHO_MIN}
        aria-valuemax={ANCHO_MAX}
        tabIndex={0}
        title="Arrastra para cambiar el ancho. Doble clic: ajustar al contenido"
        onPointerDown={(e) => empezarArrastre(e, clave, 'x', anchoDe(clave))}
        onPointerMove={(e) => moverColumnaArrastre(e, clave)}
        onPointerUp={terminarArrastre}
        onPointerCancel={terminarArrastre}
        onDoubleClick={() => fijarAncho(clave, medirColumna(clave))}
        onKeyDown={(e) => teclaColumna(e, clave)}
      />
    );
  }

  const estiloFija = (clave: string): React.CSSProperties | undefined => (fijas[clave] !== undefined ? { left: fijas[clave] } : undefined);
  const claseFija = (clave: string) =>
    [fijas[clave] !== undefined && 'agx-fija', ultimaFija === clave && 'agx-fija--ultima'].filter(Boolean).join(' ');

  // Encabezado ordenable + tirador para cambiar el ancho de la columna
  function renderTh(c: Columna, extra: { rowSpan?: number; sub?: boolean }) {
    const clave = c.orden;
    const activa = !!clave && orden?.clave === clave;
    const ariaSort = clave ? (activa ? (orden!.dir === 'asc' ? ('ascending' as const) : ('descending' as const)) : ('none' as const)) : undefined;
    const clases = [
      'agx-th',
      clave && 'agx-th--sort',
      extra.sub && 'agx-th--sub',
      c.clave === 'accion' && 'agx-th--accion',
      c.tipo === 'num' && 'agx-th--num',
      claseFija(c.clave),
    ]
      .filter(Boolean)
      .join(' ');
    return (
      <th key={c.clave} scope="col" rowSpan={extra.rowSpan} aria-sort={ariaSort} data-col={c.clave} className={clases} style={estiloFija(c.clave)}>
        {clave ? (
          <button type="button" className="agx-sort" onClick={() => alternarOrden(clave)} title={`Ordenar por ${c.titulo}`}>
            <span className="agx-sort__label">{c.titulo}</span>
            <IcOrdenColumna className="agx-sort__icon" />
          </button>
        ) : (
          <span className="agx-th__label">{c.titulo}</span>
        )}
        {tirador(c.clave, c.titulo)}
      </th>
    );
  }

  // Columnas sueltas ocupan las 2 filas del encabezado; cada grupo tiene una banda arriba
  // (con su botón plegar/desplegar) y sus columnas debajo. Plegado ocupa las 2 filas.
  const hayBandas = visibles.some((c) => GRUPO_DE[c.clave]);
  const encabezadoSuperior: React.ReactNode[] = [];
  const encabezadoInferior: React.ReactNode[] = [];
  const grupoVisto = new Set<string>();
  for (const c of visibles) {
    const g = GRUPO_DE[c.clave];
    if (!g) {
      encabezadoSuperior.push(renderTh(c, { rowSpan: hayBandas ? 2 : 1 }));
      continue;
    }
    const primera = !grupoVisto.has(g.clave);
    grupoVisto.add(g.clave);
    if (prefCols.plegados.includes(g.clave)) {
      if (primera) {
        encabezadoSuperior.push(
          <th key={g.clave} scope="col" rowSpan={2} className="agx-th agx-th--plegado" data-col={g.clave}>
            <button type="button" className="agx-band__btn" aria-expanded={false} onClick={() => alternarGrupo(g.clave)} title={`Desplegar: ${g.titulo}`}>
              <IcChevAbajo className="agx-band__chev" />
              <span className="agx-band__label">{g.titulo}</span>
            </button>
            {tirador(g.clave, g.titulo)}
          </th>,
        );
      }
    } else {
      if (primera) {
        encabezadoSuperior.push(
          <th key={g.clave} scope="colgroup" colSpan={visiblesPorGrupo[g.clave]} className={`agx-band agx-band--${g.clave}`}>
            <button type="button" className="agx-band__btn" aria-expanded={true} onClick={() => alternarGrupo(g.clave)} title={`Plegar: ${g.titulo}`}>
              <IcChevAbajo className="agx-band__chev" />
              <span className="agx-band__label">{g.titulo}</span>
            </button>
          </th>,
        );
      }
      encabezadoInferior.push(renderTh(c, { sub: true }));
    }
  }

  // ---------- Piezas del espacio de trabajo ----------

  const paginador = (mini: boolean) => <Paginador pagina={pagina} paginas={paginas} total={total} onPagina={setPagina} mini={mini} />;

  const franja = (
    <div className="agx-franja">
      <div className="agx-franja__izq">
        <span className="agx-franja__logo" aria-hidden="true">
          <IcCaja width={18} height={18} />
        </span>
        <h1 className="agx-titulo">Reporte de agotados</h1>
        <p className="ui-visually-hidden">Busca un ítem, márcalo como agotado y solicita el pedido a Compras.</p>
        <span className="agx-conteo">
          <strong>{formatoNumero(total)}</strong> {total === 1 ? 'ítem' : 'ítems'}
        </span>
      </div>

      <div className="agx-franja__centro" role="search">
        <FiltroLinea
          lineas={lineas}
          valor={linea}
          onCambio={(v) => {
            setLinea(v);
            setPagina(0);
          }}
        />
        <div className="agx-buscar">
          <IcBuscar className="agx-buscar__icono" />
          <input
            type="search"
            className="agx-buscar__in"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={`Buscar por ${textoCampos(config)}`}
            aria-label={`Buscar por ${textoCampos(config)}`}
          />
          {texto && (
            <button type="button" className="agx-ico-btn agx-buscar__x" onClick={() => setTexto('')} aria-label="Borrar búsqueda" title="Borrar búsqueda">
              <IcCerrar />
            </button>
          )}
          <button
            type="button"
            className="agx-ico-btn agx-buscar__cfg"
            onClick={() => abrirCentro('busqueda')}
            aria-label="Configurar búsqueda"
            title="Configurar búsqueda: dónde se busca y cómo coincide"
          >
            <IcAjustes />
          </button>
        </div>
        {hayFiltros && (
          <button type="button" className="agx-link agx-franja__limpiar" onClick={limpiarFiltros}>
            Limpiar filtros
          </button>
        )}
      </div>

      <div className="agx-franja__der">
        {!barras.estado && paginador(true)}
        <button
          type="button"
          className="agx-ico-btn agx-ico-btn--franja"
          onClick={() => setBarras({ herramientas: !barras.herramientas })}
          aria-expanded={barras.herramientas}
          aria-label={barras.herramientas ? 'Contraer la cinta de herramientas' : 'Expandir la cinta de herramientas'}
          title={barras.herramientas ? 'Contraer herramientas' : 'Expandir herramientas'}
        >
          {barras.herramientas ? <IcChevArriba /> : <IcChevAbajo />}
        </button>
        <MenuPop
          etiqueta="Vista: mostrar u ocultar barras y paneles"
          boton={
            <>
              <IcVista />
              <span className="agx-btn__txt">Vista</span>
              <IcChevAbajo />
            </>
          }
        >
          {(cerrar) => (
            <div className="agx-menu">
              <p className="agx-menu__tit">Mostrar</p>
              {(
                [
                  ['herramientas', 'Cinta de herramientas'],
                  ['estado', 'Barra de estado'],
                  ['panel', 'Panel de columnas'],
                ] as const
              ).map(([k, t]) => (
                <button key={k} type="button" className="agx-menu__item" aria-pressed={barras[k]} onClick={() => setBarras({ [k]: !barras[k] })}>
                  <span className="agx-menu__check">{barras[k] && <IcCheck />}</span>
                  {t}
                </button>
              ))}
              <hr className="agx-menu__sep" />
              <button type="button" className="agx-menu__item" aria-pressed={etiquetas} onClick={() => cambiar((p) => ({ ...p, etiquetas: !p.etiquetas }))}>
                <span className="agx-menu__check">{etiquetas && <IcCheck />}</span>
                Texto en los botones
              </button>
              <hr className="agx-menu__sep" />
              <button
                type="button"
                className="agx-menu__item"
                onClick={() => {
                  setEnfoque(true);
                  cerrar();
                }}
              >
                <span className="agx-menu__check">
                  <IcEnfoque />
                </span>
                Modo enfocado
                <kbd className="agx-menu__kbd">Ctrl+Mayús+F</kbd>
              </button>
              <button
                type="button"
                className="agx-menu__item"
                onClick={() => {
                  abrirCentro('barras');
                  cerrar();
                }}
              >
                <span className="agx-menu__check">
                  <IcAjustes />
                </span>
                Más opciones…
              </button>
            </div>
          )}
        </MenuPop>
        <button type="button" className="agx-btn" onClick={() => abrirCentro('barras')} title="Configuración de AGOTADOS" aria-label="Configuración de AGOTADOS">
          <IcAjustes />
          <span className="agx-btn__txt">Configuración</span>
        </button>
      </div>
    </div>
  );

  const cinta = (
    <div className={`agx-cinta${etiquetas ? '' : ' agx-cinta--iconos'}`} role="toolbar" aria-label="Herramientas de la tabla">
      <GrupoH titulo="Vista">
        <BotonH
          icono={<IcAjustar />}
          texto="Ajustar"
          solo={solo}
          ayuda="Ajustar columnas y filas: cada columna al ancho de su contenido y cada fila a su alto natural"
          onClick={ajustarColumnasYFilas}
        />
        <BotonH
          icono={<IcGrupos />}
          texto={todosPlegados ? 'Expandir' : 'Contraer'}
          nombre={todosPlegados ? 'Expandir grupos' : 'Contraer grupos'}
          solo={solo}
          ayuda="Pliega o despliega los grupos de columnas para ver el final de la tabla sin desplazarte"
          deshabilitado={gruposConColumnas.length === 0}
          onClick={alternarTodosLosGrupos}
        />
        <BotonH
          icono={<IcColumnas />}
          texto="Columnas"
          solo={solo}
          ayuda="Mostrar u ocultar el panel de columnas"
          activo={barras.panel}
          onClick={() => setBarras({ panel: !barras.panel })}
        />
        <BotonH
          icono={<IcRestablecer />}
          texto="Restablecer"
          nombre="Restablecer vista"
          solo={true}
          ayuda="Restablecer vista: anchos, alto de filas, columnas ocultas y grupos plegados"
          deshabilitado={!vistaPersonalizada}
          onClick={restablecerVista}
        />
      </GrupoH>
      <SepH />
      <GrupoH titulo="Densidad">
        <Segmentado<Densidad> etiqueta="Densidad de filas" valor={prefTabla.densidad} opciones={DENSIDADES} onCambio={(v) => setTabla({ densidad: v })} />
      </GrupoH>
      <SepH />
      <GrupoH titulo="Tabla">
        <BotonH icono={<IcCuadricula />} texto="Cuadrícula" solo={solo} ayuda="Mostrar u ocultar las líneas entre celdas" activo={prefTabla.cuadricula} onClick={() => setTabla({ cuadricula: !prefTabla.cuadricula })} />
        <BotonH icono={<IcAjusteTexto />} texto="Ajustar texto" solo={solo} ayuda="Mostrar el texto largo en varias líneas en vez de cortarlo" activo={prefTabla.ajustarTexto} onClick={() => setTabla({ ajustarTexto: !prefTabla.ajustarTexto })} />
      </GrupoH>
      <SepH />
      <GrupoH titulo="Orden">
        <BotonH
          icono={<IcOrden />}
          texto="Solicitudes arriba"
          solo={solo}
          ayuda="Muestra primero los ítems con solicitud de pedido activa. Vuelve a pulsar para quitar el orden"
          activo={solicitudesArriba}
          onClick={alternarSolicitudesArriba}
        />
        <BotonH
          icono={<IcCerrar />}
          texto="Quitar orden"
          solo={true}
          ayuda="Quitar el orden elegido"
          deshabilitado={!orden}
          onClick={() => {
            setOrden(null);
            setPagina(0);
          }}
        />
      </GrupoH>
      <SepH />
      <GrupoH titulo="Copiar">
        <BotonH
          icono={<IcCopiar />}
          texto="Tabla"
          nombre="Copiar tabla"
          solo={solo}
          ayuda="Copia esta página con formato de tabla para pegarla en Excel, Word o correo"
          cargando={copiando}
          deshabilitado={copiando || filas.length === 0}
          onClick={() => copiar('pagina')}
        />
        {total > filas.length && (
          <BotonH
            icono={<IcCopiarTodo />}
            texto={`Todo (${formatoNumero(limiteCopia)})`}
            nombre={`Copiar todo (${formatoNumero(limiteCopia)})`}
            solo={solo}
            ayuda="Copia todas las páginas del resultado actual (respeta filtros y orden)"
            deshabilitado={copiando}
            onClick={() => copiar('todo')}
          />
        )}
        <BotonH
          icono={<IcLista />}
          texto="Solicitudes"
          nombre="Copiar solicitudes de pedido"
          solo={solo}
          ayuda="Copia todas las solicitudes de pedido activas de tu sede (tabla para Excel, lista para WhatsApp)"
          deshabilitado={copiando}
          onClick={copiarSolicitudes}
        />
      </GrupoH>
    </div>
  );

  const estado = (
    <div className="agx-estado">
      <div className="agx-estado__izq">
        <span>
          <strong>{formatoNumero(total)}</strong> {total === 1 ? 'ítem' : 'ítems'}
        </span>
        {orden && columnaOrden && (
          <span>
            Orden: <strong>{columnaOrden.titulo}</strong> ({orden.dir === 'asc' ? 'ascendente' : 'descendente'}){' '}
            <button
              type="button"
              className="agx-link"
              onClick={() => {
                setOrden(null);
                setPagina(0);
              }}
            >
              Quitar
            </button>
          </span>
        )}
        {rango && (
          <span>
            <span aria-live="polite">
              Selección: <strong>{formatoNumero(rango.r2 - rango.r1 + 1)}</strong> {rango.r2 === rango.r1 ? 'fila' : 'filas'} ×{' '}
              <strong>{formatoNumero(rango.c2 - rango.c1 + 1)}</strong> {rango.c2 === rango.c1 ? 'columna' : 'columnas'}
            </span>{' '}
            <button type="button" className="agx-link" onClick={copiarSeleccion}>
              Copiar (Ctrl+C)
            </button>{' '}
            <button type="button" className="agx-link" onClick={() => setSeleccion(null)}>
              Quitar selección
            </button>
          </span>
        )}
      </div>
      {paginador(false)}
    </div>
  );

  const panelColumnas = (
    <ListaColumnas
      ocultas={prefCols.ocultas}
      orden={prefCols.orden}
      plegados={prefCols.plegados}
      onAlternar={alternarColumna}
      onMover={moverColumna}
      onAlternarGrupo={alternarGrupo}
      onMostrarTodas={() => setColumnas((c) => ({ ...c, ocultas: [] }))}
    />
  );

  const secciones = seccionesAgotados({
    prefs,
    cambiar,
    onBusqueda: cambiarBusqueda,
    onPorPagina: cambiarPorPagina,
    onAlternarColumna: alternarColumna,
    onMoverColumna: moverColumna,
    onAlternarGrupo: alternarGrupo,
    onMostrarTodas: () => setColumnas((c) => ({ ...c, ocultas: [] })),
    maxCongelar,
    onEnfoque: () => {
      setCentro((c) => ({ ...c, abierto: false }));
      setEnfoque(true);
    },
    onRestablecerVista: restablecerVista,
    onRestablecerTodo: () => {
      void restablecer();
      setAlturas({});
      setPagina(0);
    },
    vistaPersonalizada,
    origen,
    aviso: avisoPrefs,
  });

  const clasesTabla = [
    'agx-tablewrap',
    `agx-dens-${prefTabla.densidad}`,
    prefTabla.cuadricula && 'agx-cuadricula',
    prefTabla.cebra && 'agx-cebra',
    prefTabla.ajustarTexto && 'agx-ajustar',
    cargando && 'is-loading',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <EspacioTrabajo
        listo={listo}
        barras={barras}
        enfoque={enfoque}
        onEnfoque={setEnfoque}
        franja={franja}
        cinta={cinta}
        panel={panelColumnas}
        tituloPanel="Columnas"
        anchoPanel={prefs.panelAncho}
        onAnchoPanel={(px) => cambiar((p) => ({ ...p, panelAncho: px }))}
        onCerrarPanel={() => setBarras({ panel: false })}
        estado={estado}
        flotante={paginador(true)}
      >
        {error && (
          <div role="alert" className="agx-alerta">
            <p>Error: {error}</p>
          </div>
        )}
        <div
          className={clasesTabla}
          role="region"
          aria-label="Tabla de agotados"
          aria-busy={cargando}
          tabIndex={0}
          ref={contenedorRef}
          onKeyDown={alTeclaTabla}
          style={{ ['--agx-ancho' as string]: `${anchoTabla}px`, ['--agx-izq-total' as string]: `${izqAcumulada}px` }}
        >
          <table ref={tablaRef} className="agx-table">
            <colgroup>
              <col style={{ width: ANCHO_GUTTER }} />
              {clavesVisibles.map((k) => (
                <col key={k} style={{ width: anchoDe(k) }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th scope="col" rowSpan={hayBandas ? 2 : 1} className="agx-th agx-corner">
                  <button type="button" className="agx-corner__btn" onClick={seleccionarTodo} aria-label="Seleccionar toda la página" title="Seleccionar toda la página (Ctrl+A)" />
                </th>
                {encabezadoSuperior}
              </tr>
              {encabezadoInferior.length > 0 && <tr>{encabezadoInferior}</tr>}
            </thead>
            <tbody onPointerDown={alPulsarCelda}>
              {filas.map((f, i) => (
                <FilaAgotado
                  key={f.item_id}
                  fila={f}
                  indice={i}
                  numero={pagina * porPagina + i + 1}
                  rango={rango}
                  accion={accion}
                  columnas={clavesVisibles}
                  ocultas={prefCols.ocultas}
                  fijas={fijas}
                  ultimaFija={ultimaFija}
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
                  <td className="agx-vacio" colSpan={clavesVisibles.length + 1}>
                    <p>Sin resultados</p>
                    {hayFiltros && (
                      <button type="button" className="agx-btn" onClick={limpiarFiltros}>
                        Limpiar filtros
                      </button>
                    )}
                  </td>
                </tr>
              )}
              {cargando && filas.length === 0 && (
                <tr>
                  <td className="agx-vacio" colSpan={clavesVisibles.length + 1}>
                    Cargando…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </EspacioTrabajo>

      <CentroConfig
        abierto={centro.abierto}
        titulo="Configuración de AGOTADOS"
        secciones={secciones}
        seccion={centro.seccion}
        onSeccion={(s) => setCentro((c) => ({ ...c, seccion: s }))}
        onCerrar={() => setCentro((c) => ({ ...c, abierto: false }))}
        pie={
          <span className="agx-dialog__guardado">
            Los cambios se aplican y se guardan al instante.
          </span>
        }
      />

      {/* Región viva siempre presente: los lectores de pantalla anuncian el aviso al aparecer */}
      <div role="status" aria-live="polite">
        {aviso && <div className={aviso.error ? 'agx-toast agx-toast--error' : 'agx-toast'}>{aviso.texto}</div>}
      </div>
    </>
  );
}
