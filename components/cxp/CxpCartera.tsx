'use client';

import '@/styles/cxp.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { colorDias } from '@/lib/cxp/colorDias';
import { AlertIcon, SearchIcon } from '@/components/ui/icons';
import ComboProveedor, { claveProveedor } from './ComboProveedor';
import CrucesCxp from './CrucesCxp';
import ConfirmarPago from './ConfirmarPago';
import FormExcluir from './FormExcluir';
import FormExcluirSeleccion from './FormExcluirSeleccion';
import MensajesProveedor from './MensajesProveedor';
import FormPendiente from './FormPendiente';
import HojaTabla from './hoja/HojaTabla';
import MenuPop from './hoja/MenuPop';
import PanelColumnas from './hoja/PanelColumnas';
import PanelFormato from './hoja/PanelFormato';
import { MAX_FILAS_INFINITO, prefsPorDefecto, type ColumnaHoja, type GrupoHoja, type PrefsHoja } from './hoja/tipos';
import { usePrefsHoja } from './hoja/usePrefsHoja';
import { usePermisosCxp } from './usePermisosCxp';
import {
  TOTALES_VACIOS,
  aNumero,
  fechaCorta,
  fechaHora,
  moneda,
  type FilaCxp,
  type ProveedorFiltro,
  type TotalesCxp,
  type UltimaCarga,
} from './tipos';

type Vencimiento = '' | 'vencidos' | 'por_vencer' | '1_30' | '31_60' | '61_90' | 'mas_90';
interface Orden {
  clave: string;
  dir: 'asc' | 'desc';
}
interface Aviso {
  texto: string;
  error?: boolean;
}

export default function CxpCartera({
  organizacionId,
  estado,
  titulo,
  descripcion,
  empresaNombre,
  usuarioNombre,
}: {
  organizacionId: string;
  estado: 'pendiente' | 'excluido' | 'pagado';
  titulo: string;
  descripcion: string;
  empresaNombre: string;
  usuarioNombre: string;
}) {
  const [supabase] = useState(() => createClient());
  const permisos = usePermisosCxp(supabase, organizacionId);
  const esPagados = estado === 'pagado';
  const esExcluidas = estado === 'excluido';
  const esPend = estado === 'pendiente';

  // ---- Preferencias de la tabla (se guardan en este navegador) ----
  const ocultasPorDefecto = useMemo(() => (esExcluidas ? ['sede'] : ['documento_erp', 'sede']), [esExcluidas]);
  const defecto = useMemo(() => prefsPorDefecto(ocultasPorDefecto), [ocultasPorDefecto]);
  const { prefs, cambiar, restablecer, listo } = usePrefsHoja(`cxp.hoja.v1:${organizacionId}:${estado}`, defecto);
  const infinito = prefs.modo === 'infinito';
  const lote = prefs.porPagina;

  // ---- Filtros ----
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [sede, setSede] = useState('');
  const [origen, setOrigen] = useState('');
  const [vencimiento, setVencimiento] = useState<Vencimiento>('');
  const [orden, setOrden] = useState<Orden | null>(null);
  const [pagina, setPagina] = useState(0);

  // ---- Datos ----
  const [filas, setFilas] = useState<FilaCxp[]>([]);
  const [total, setTotal] = useState(0);
  const [totales, setTotales] = useState<TotalesCxp>(TOTALES_VACIOS);
  const [proveedores, setProveedores] = useState<ProveedorFiltro[]>([]);
  const [sedes, setSedes] = useState<{ id: string; nombre: string }[]>([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [formulario, setFormulario] = useState<{ editar: FilaCxp | null } | null>(null);
  const [excluyendo, setExcluyendo] = useState<FilaCxp | null>(null);
  const [ultima, setUltima] = useState<UltimaCarga | null | undefined>(undefined); // undefined = aún cargando
  const [nCruces, setNCruces] = useState(0);
  const [cruces, setCruces] = useState<{ manual: FilaCxp | null } | null>(null);
  const [seleccion, setSeleccion] = useState<Map<string, FilaCxp>>(new Map());
  const [pago, setPago] = useState<{ filas: FilaCxp[] } | null>(null);
  const [mensajes, setMensajes] = useState<{ filas: FilaCxp[] } | null>(null);
  const [exclSel, setExclSel] = useState<FilaCxp[] | null>(null);
  const ultimaMarcada = useRef<string | null>(null);
  const [altura, setAltura] = useState<string | undefined>(undefined);
  const peticion = useRef(0);
  const peticionTotales = useRef(0);
  const cargandoMasRef = useRef(false);
  const espacio = useRef<HTMLDivElement>(null);

  // La tabla ocupa el alto disponible de la pantalla: así la barra de arriba queda fija y solo se desplazan las filas.
  useEffect(() => {
    const calcular = () => {
      const el = espacio.current;
      if (!el || window.innerWidth < 768 || window.innerHeight < 560) {
        setAltura(undefined);
        return;
      }
      const arriba = el.getBoundingClientRect().top + window.scrollY;
      setAltura(`${Math.max(420, window.innerHeight - arriba - 24)}px`);
    };
    calcular();
    window.addEventListener('resize', calcular);
    return () => window.removeEventListener('resize', calcular);
  }, []);

  // Espera a que se deje de escribir antes de consultar.
  useEffect(() => {
    const t = setTimeout(() => {
      setBusqueda(texto);
      setPagina(0);
    }, 300);
    return () => clearTimeout(t);
  }, [texto]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  // El proveedor elegido se envía por NIT; si el proveedor no tiene NIT, por nombre.
  const filtroProveedor = useMemo(() => {
    if (proveedor.startsWith('t:')) return { p_tercero: proveedor.slice(2), p_nombre: null };
    if (proveedor.startsWith('n:')) return { p_tercero: null, p_nombre: proveedor.slice(2) };
    return { p_tercero: null, p_nombre: null };
  }, [proveedor]);

  // Al cambiar un filtro se limpia la selección: así no se paga nada que ya no se está viendo.
  useEffect(() => {
    setSeleccion(new Map());
  }, [busqueda, filtroProveedor, sede, origen, vencimiento]);

  // Filtros comunes (los totales no usan el de vencimiento: siempre muestran todos los tramos).
  const comunes = useMemo(
    () => ({
      p_org: organizacionId,
      p_estado: estado,
      p_busqueda: busqueda.trim() || null,
      p_tercero: filtroProveedor.p_tercero,
      p_nombre: filtroProveedor.p_nombre,
      p_sede: sede || null,
      p_origen: origen || null,
    }),
    [organizacionId, estado, busqueda, filtroProveedor, sede, origen],
  );
  const parametrosLista = useMemo(
    () => ({
      ...comunes,
      p_vencimiento: vencimiento || null,
      p_orden: orden?.clave ?? null,
      p_dir: orden?.dir ?? 'asc',
    }),
    [comunes, vencimiento, orden],
  );

  const cargarListas = useCallback(async () => {
    const [prov, sed] = await Promise.all([
      supabase.rpc('cxp_proveedores_filtro', { p_org: organizacionId, p_estado: estado }),
      supabase.rpc('cxp_listar_sedes', { p_org: organizacionId }),
    ]);
    const lista = (prov.data ?? []) as ProveedorFiltro[];
    setProveedores(lista);
    setSedes((sed.data ?? []) as { id: string; nombre: string }[]);
    // Si el proveedor filtrado ya no tiene documentos (p. ej. se pagó el último), se quita el filtro.
    setProveedor((actual) => (actual && !lista.some((p) => claveProveedor(p) === actual) ? '' : actual));
  }, [supabase, organizacionId, estado]);

  const cargarAvisos = useCallback(async () => {
    if (estado !== 'pendiente') return;
    const [u, c] = await Promise.all([
      supabase.rpc('cxp_ultima_carga', { p_org: organizacionId }),
      supabase.rpc('cxp_cruces_sugeridos', { p_org: organizacionId, p_limit: 200 }),
    ]);
    setUltima(((u.data ?? []) as UltimaCarga[])[0] ?? null);
    setNCruces(((c.data ?? []) as unknown[]).length);
  }, [supabase, organizacionId, estado]);

  // Los totales dependen solo de los filtros, no de la página ni del scroll: cambiar de página es más rápido.
  const cargarTotales = useCallback(async () => {
    const mia = ++peticionTotales.current;
    const { data, error } = await supabase.rpc('cxp_totales', comunes);
    if (mia !== peticionTotales.current) return;
    if (error) {
      setError(error.message);
      return;
    }
    setTotales(((data ?? []) as TotalesCxp[])[0] ?? TOTALES_VACIOS);
  }, [supabase, comunes]);

  // Primera página (o la página elegida, en modo por páginas).
  const cargarLista = useCallback(async () => {
    const mia = ++peticion.current;
    setCargando(true);
    const { data, error } = await supabase.rpc('cxp_listar', {
      ...parametrosLista,
      p_limit: lote,
      p_offset: infinito ? 0 : pagina * lote,
    });
    if (mia !== peticion.current) return; // llegó una respuesta más nueva
    setCargando(false);
    if (error) {
      setError(error.message);
      return;
    }
    setError('');
    const f = (data ?? []) as FilaCxp[];
    setFilas(f);
    setTotal(f[0]?.total ?? 0);
  }, [supabase, parametrosLista, lote, infinito, pagina]);

  // Scroll infinito: agrega el siguiente bloque, hasta MAX_FILAS_INFINITO.
  const cargarMas = useCallback(async () => {
    if (cargandoMasRef.current || cargando) return;
    const tope = Math.min(total, MAX_FILAS_INFINITO);
    if (filas.length >= tope) return;
    cargandoMasRef.current = true;
    setCargandoMas(true);
    const mia = peticion.current;
    const { data, error } = await supabase.rpc('cxp_listar', {
      ...parametrosLista,
      p_limit: Math.min(lote, tope - filas.length),
      p_offset: filas.length,
    });
    cargandoMasRef.current = false;
    setCargandoMas(false);
    if (mia !== peticion.current) return; // cambió un filtro mientras cargaba
    if (error) {
      setError(error.message);
      return;
    }
    const nuevas = (data ?? []) as FilaCxp[];
    if (nuevas.length === 0) {
      setTotal(filas.length); // la lista cambió y ya no hay más
      return;
    }
    setFilas((prev) => {
      const ids = new Set(prev.map((r) => r.id));
      return [...prev, ...nuevas.filter((r) => !ids.has(r.id))];
    });
    setTotal(nuevas[0].total);
  }, [supabase, parametrosLista, lote, filas.length, total, cargando]);

  useEffect(() => {
    cargarListas();
  }, [cargarListas]);
  useEffect(() => {
    cargarAvisos();
  }, [cargarAvisos]);
  // Se espera a haber leído las preferencias para no consultar dos veces.
  useEffect(() => {
    if (listo) cargarLista();
  }, [listo, cargarLista]);
  useEffect(() => {
    if (listo) cargarTotales();
  }, [listo, cargarTotales]);

  // Si se vació la última página (p. ej. se pagó el único documento), retrocede una.
  useEffect(() => {
    if (!infinito && !cargando && filas.length === 0 && pagina > 0) setPagina((p) => p - 1);
  }, [infinito, cargando, filas.length, pagina]);

  const refrescarResumen = () => {
    cargarTotales();
    cargarListas();
    cargarAvisos();
  };
  const recargarTodo = () => {
    cargarLista();
    refrescarResumen();
  };
  /** Tras un cambio que saca filas de esta lista: en scroll infinito se quitan sin perder la posición. */
  function despuesDeCambio(ids?: string[]) {
    if (infinito && ids && ids.length > 0) {
      const s = new Set(ids);
      setFilas((prev) => prev.filter((r) => !s.has(r.id)));
      setTotal((t) => Math.max(0, t - ids.length));
      refrescarResumen();
    } else {
      recargarTodo();
    }
  }

  function cambiarPrefs(p: PrefsHoja) {
    if (p.modo !== prefs.modo || p.porPagina !== prefs.porPagina) setPagina(0);
    cambiar(p);
  }

  function alternarOrden(clave: string) {
    setPagina(0);
    setOrden((o) => {
      if (!o || o.clave !== clave) return { clave, dir: 'asc' };
      if (o.dir === 'asc') return { clave, dir: 'desc' };
      return null;
    });
  }

  function filtrar<T>(poner: (v: T) => void) {
    return (v: T) => {
      poner(v);
      setPagina(0);
    };
  }

  // ---- Acciones sobre una fila ----
  async function guardarCampo(f: FilaCxp, campo: 'anticipos' | 'descuentos' | 'retenciones' | 'detalles', valor: string) {
    let dato: string | number = valor;
    if (campo !== 'detalles') {
      const n = aNumero(valor);
      if (Number.isNaN(n)) {
        setAviso({ texto: 'Escribe solo números.', error: true });
        return false;
      }
      dato = n;
    }
    const { error } = await supabase.rpc('cxp_actualizar', {
      p_org: organizacionId,
      p_id: f.id,
      p_datos: { [campo]: dato },
    });
    if (error) {
      setAviso({ texto: error.message, error: true });
      return false;
    }
    // Se actualiza la fila en pantalla sin recargar la lista (así no se pierde el lugar al hacer scroll).
    let actualizada: FilaCxp | null = null;
    setFilas((prev) =>
      prev.map((r) => {
        if (r.id !== f.id) return r;
        const n = { ...r, [campo]: campo === 'detalles' ? (String(dato).trim() || null) : dato } as FilaCxp;
        n.val_pagar = n.total_factura - n.retenciones - n.anticipos - n.descuentos;
        actualizada = n;
        return n;
      }),
    );
    setSeleccion((prev) => (prev.has(f.id) && actualizada ? new Map(prev).set(f.id, actualizada) : prev));
    cargarTotales();
    return true;
  }

  // Marcar filas: toca la fila o la casilla; con Shift se marca un rango desde la última marcada.
  function alternarSeleccion(f: FilaCxp, conShift = false) {
    const idxAct = filas.findIndex((r) => r.id === f.id);
    const idxAnt = ultimaMarcada.current ? filas.findIndex((r) => r.id === ultimaMarcada.current) : -1;
    setSeleccion((prev) => {
      const n = new Map(prev);
      const marcar = !n.has(f.id);
      if (conShift && idxAnt >= 0 && idxAct >= 0) {
        const [a, b] = idxAnt < idxAct ? [idxAnt, idxAct] : [idxAct, idxAnt];
        for (let i = a; i <= b; i++) {
          const r = filas[i];
          if (marcar) n.set(r.id, r);
          else n.delete(r.id);
        }
      } else if (marcar) {
        n.set(f.id, f);
      } else {
        n.delete(f.id);
      }
      return n;
    });
    ultimaMarcada.current = f.id;
  }

  function seleccionarVisibles(marcar: boolean) {
    setSeleccion((prev) => {
      const n = new Map(prev);
      for (const f of filas) {
        if (marcar) n.set(f.id, f);
        else n.delete(f.id);
      }
      return n;
    });
  }

  const totalSeleccion = useMemo(() => {
    let t = 0;
    seleccion.forEach((r) => {
      t += r.val_pagar;
    });
    return t;
  }, [seleccion]);

  /** Pagar (uno o varios): primero se muestra la lista de documentos para confirmar. */
  function pedirPago(lista: FilaCxp[]) {
    if (lista.length > 0) setPago({ filas: lista });
  }

  /** Devuelve el mensaje de error, o null si salió bien. */
  async function confirmarPago(lista: FilaCxp[], armarMensaje: boolean): Promise<string | null> {
    const ids = lista.map((f) => f.id);
    const { error } = await supabase.rpc('cxp_marcar_pagado', { p_org: organizacionId, p_ids: ids });
    if (error) return error.message;
    setPago(null);
    setSeleccion((prev) => {
      const n = new Map(prev);
      ids.forEach((id) => n.delete(id));
      return n;
    });
    setAviso({ texto: ids.length === 1 ? 'Marcado como pagado.' : `${ids.length} documentos marcados como pagados.` });
    despuesDeCambio(ids);
    if (armarMensaje) setMensajes({ filas: lista });
    return null;
  }

  async function reabrir(f: FilaCxp) {
    if (!window.confirm(`¿Devolver a la cartera como pendiente?\n\n${f.nombre}`)) return;
    const { error } = await supabase.rpc('cxp_reabrir', { p_org: organizacionId, p_id: f.id });
    if (error) return setAviso({ texto: error.message, error: true });
    setAviso({ texto: 'Devuelto a la cartera.' });
    despuesDeCambio([f.id]);
  }

  async function quitarExclusion(f: FilaCxp) {
    if (!f.regla_id) return;
    const amplia =
      f.regla_tipo === 'patron'
        ? '\n\nOJO: la regla es por detalle y afecta a todos los documentos con ese detalle; todos volverán a la cartera.'
        : '';
    if (!window.confirm(`¿Quitar la exclusión y devolver a la cartera?\n\n${f.nombre} · ${f.documento_erp ?? ''}${amplia}`)) return;
    const { error } = await supabase.rpc('cxp_regla_eliminar', { p_org: organizacionId, p_id: f.regla_id });
    if (error) return setAviso({ texto: error.message, error: true });
    setAviso({ texto: 'Exclusión quitada: vuelve a la cartera.' });
    recargarTodo(); // una regla amplia puede devolver varios documentos
  }

  async function eliminar(f: FilaCxp) {
    if (!window.confirm(`¿Eliminar este pendiente manual?\n\n${f.nombre} · ${moneda(f.total_factura)}`)) return;
    const { error } = await supabase.rpc('cxp_manual_eliminar', { p_org: organizacionId, p_id: f.id });
    if (error) return setAviso({ texto: error.message, error: true });
    setAviso({ texto: 'Pendiente eliminado.' });
    despuesDeCambio([f.id]);
  }

  // ---- Definición de columnas (agrupadas, como en una hoja de cálculo) ----
  const anotable = esPend && permisos.editar;
  const grupos: GrupoHoja[] = [
    { clave: 'proveedor', titulo: 'Proveedor' },
    { clave: 'documento', titulo: 'Documento' },
    { clave: 'valores', titulo: 'Valores' },
    { clave: 'notas', titulo: 'Notas' },
    ...(esExcluidas ? [{ clave: 'exclusion', titulo: 'Exclusión' }] : []),
    ...(esPagados ? [{ clave: 'pago', titulo: 'Pago' }] : []),
  ];

  const columnas: ColumnaHoja<FilaCxp>[] = [
    {
      clave: 'origen', titulo: 'En sistema', grupo: 'proveedor', ancho: 96,
      render: (f) =>
        f.origen === 'manual' ? (
          <span className="ui-badge ui-badge--info" title="Escrito a mano: todavía no está en el ERP">Manual</span>
        ) : (
          <span className="ui-badge ui-badge--success" title={f.documento_erp ? `Documento del ERP: ${f.documento_erp}` : undefined}>ERP</span>
        ),
    },
    { clave: 'empresa', titulo: 'Empresa', grupo: 'proveedor', ancho: 80, render: (f) => f.empresa ?? '' },
    { clave: 'tercero', titulo: 'NIT', grupo: 'proveedor', ancho: 110, orden: 'tercero', render: (f) => f.tercero ?? '' },
    {
      clave: 'nombre', titulo: 'Proveedor', grupo: 'proveedor', ancho: 280, orden: 'nombre', resumen: true, ajustable: true,
      tooltip: (f) => f.nombre,
      render: (f) => (
        <>
          {f.ausente && (
            <span className="cxp-aus" title="No vino en la última carga del ERP: puede que ya esté pagado allá" aria-label="No vino en la última carga">⚠ </span>
          )}
          <strong className="cxp-nombre">{f.nombre}</strong>
        </>
      ),
    },
    { clave: 'sede', titulo: 'Sede', grupo: 'proveedor', ancho: 120, render: (f) => f.sede ?? '' },

    { clave: 'documento_erp', titulo: 'Doc. ERP', grupo: 'documento', ancho: 130, ajustable: true, tooltip: (f) => f.documento_erp, render: (f) => f.documento_erp ?? '' },
    { clave: 'cond_pago', titulo: 'Cond. pago', grupo: 'documento', ancho: 170, ajustable: true, tooltip: (f) => f.cond_pago, render: (f) => f.cond_pago ?? '' },
    { clave: 'docto', titulo: 'Factura prov.', grupo: 'documento', ancho: 130, ajustable: true, tooltip: (f) => f.docto_proveedor, render: (f) => f.docto_proveedor ?? '' },
    { clave: 'fecha_dcto', titulo: 'F. documento', grupo: 'documento', ancho: 112, orden: 'fecha_dcto', render: (f) => fechaCorta(f.fecha_dcto) },
    { clave: 'fecha_vcto', titulo: 'F. vencimiento', grupo: 'documento', ancho: 122, orden: 'fecha_vcto', resumen: true, render: (f) => fechaCorta(f.fecha_vcto) },
    { clave: 'plazo', titulo: 'Plazo', grupo: 'documento', ancho: 70, alinear: 'der', render: (f) => f.plazo ?? '' },
    {
      clave: 'dias', titulo: 'Días venc.', grupo: 'documento', ancho: 96, orden: 'dias_venc', alinear: 'der',
      // Blanca si no está vencida; cada vez más roja entre más días de vencida (solo en la cartera pendiente).
      estiloCelda: (f) => {
        const c = esPend ? colorDias(f.dias_venc) : null;
        return c ? { backgroundColor: c.fondo, color: c.texto, fontWeight: 700 } : undefined;
      },
      render: (f) => f.dias_venc,
    },

    {
      clave: 'anticipos', titulo: 'Anticipos', grupo: 'valores', ancho: 130, alinear: 'der',
      render: (f) => <CeldaEditable tipo="num" valor={f.anticipos} editable={anotable} etiqueta="Anticipos" onGuardar={(v) => guardarCampo(f, 'anticipos', v)} />,
    },
    {
      clave: 'descuentos', titulo: 'Descuentos', grupo: 'valores', ancho: 130, alinear: 'der',
      render: (f) => <CeldaEditable tipo="num" valor={f.descuentos} editable={anotable} etiqueta="Descuentos" onGuardar={(v) => guardarCampo(f, 'descuentos', v)} />,
    },
    {
      clave: 'retenciones', titulo: 'Adic. retenciones', grupo: 'valores', ancho: 140, alinear: 'der',
      render: (f) => <CeldaEditable tipo="num" valor={f.retenciones} editable={anotable} etiqueta="Adicionales retenciones" onGuardar={(v) => guardarCampo(f, 'retenciones', v)} />,
    },
    { clave: 'total', titulo: 'Total factura', grupo: 'valores', ancho: 140, orden: 'total_factura', alinear: 'der', render: (f) => moneda(f.total_factura) },
    {
      clave: 'pagar', titulo: 'Val. a pagar', grupo: 'valores', ancho: 140, orden: 'val_pagar', alinear: 'der', resumen: true,
      render: (f) => <strong>{moneda(f.val_pagar)}</strong>,
    },

    {
      clave: 'detalles', titulo: 'Detalles', grupo: 'notas', ancho: 280, ajustable: true, tooltip: (f) => f.detalles,
      render: (f) => <CeldaEditable tipo="texto" valor={f.detalles ?? ''} editable={anotable} etiqueta="Detalles" onGuardar={(v) => guardarCampo(f, 'detalles', v)} />,
    },

    ...(esExcluidas
      ? ([
          { clave: 'detalle_erp', titulo: 'Detalle (ERP)', grupo: 'exclusion', ancho: 260, ajustable: true, tooltip: (f) => f.detalle_erp, render: (f) => f.detalle_erp ?? '' },
          { clave: 'contexto', titulo: 'Contexto', grupo: 'exclusion', ancho: 160, resumen: true, render: (f) => f.contexto ?? '' },
          { clave: 'nota_regla', titulo: 'Nota', grupo: 'exclusion', ancho: 240, ajustable: true, tooltip: (f) => f.nota_regla, render: (f) => f.nota_regla ?? '' },
        ] as ColumnaHoja<FilaCxp>[])
      : []),
    ...(esPagados
      ? ([
          { clave: 'fecha_pago', titulo: 'Pagado el', grupo: 'pago', ancho: 160, orden: 'fecha_pago', resumen: true, render: (f) => fechaHora(f.fecha_pago) },
          { clave: 'pagado_por', titulo: 'Pagado por', grupo: 'pago', ancho: 160, render: (f) => f.pagado_por ?? '' },
        ] as ColumnaHoja<FilaCxp>[])
      : []),
  ];

  const hayCheck = (esPend && (permisos.pagar || permisos.excluir)) || esPagados;
  const hayAcciones = esPagados
    ? permisos.pagar
    : esExcluidas
      ? permisos.quitar
      : permisos.pagar || permisos.editar || permisos.eliminar || permisos.excluir;
  const todosVisibles = filas.length > 0 && filas.every((f) => seleccion.has(f.id));
  const paginas = Math.max(1, Math.ceil(total / lote));
  const topeInfinito = Math.min(total, MAX_FILAS_INFINITO);
  const hayMas = infinito && filas.length < topeInfinito;
  const vieja = ultima ? Date.now() - new Date(ultima.fecha).getTime() > 3 * 86400000 : false;

  const renderAcciones = (f: FilaCxp) => (
    <div className="cxp-acciones">
      {esPend && permisos.pagar && (
        <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" onClick={() => pedirPago([f])}>Pagado</button>
      )}
      {esPend && f.origen === 'manual' && permisos.editar && (
        <button type="button" className="ui-btn ui-btn--sm" onClick={() => setFormulario({ editar: f })}>Editar</button>
      )}
      {esPend && f.origen === 'manual' && permisos.editar && (
        <button type="button" className="ui-btn ui-btn--sm" onClick={() => setCruces({ manual: f })} title="Es la misma cuenta que un documento del ERP">
          Cruzar con ERP
        </button>
      )}
      {esPend && f.origen === 'manual' && permisos.eliminar && (
        <button type="button" className="ui-btn ui-btn--sm ui-btn--danger" onClick={() => eliminar(f)}>Eliminar</button>
      )}
      {esPend && f.origen === 'erp' && permisos.excluir && (
        <button type="button" className="ui-btn ui-btn--sm" onClick={() => setExcluyendo(f)} title="Dejar este documento fuera de la cartera">Excluir</button>
      )}
      {esExcluidas && permisos.quitar && (
        <button type="button" className="ui-btn ui-btn--sm" onClick={() => quitarExclusion(f)}>Quitar exclusión</button>
      )}
      {esPagados && permisos.pagar && (
        <button type="button" className="ui-btn ui-btn--sm" onClick={() => reabrir(f)}>Reabrir</button>
      )}
    </div>
  );

  return (
    <div className="cxp-espacio" ref={espacio} style={altura ? { height: altura } : undefined}>
      {/* ===== Barra superior fija: resumen, avisos, filtros, formato y paginador ===== */}
      <div className="cxp-barra">
        <div className="cxp-barra__fila cxp-barra__fila--resumen">
          <div className="cxp-barra__titulo">
            <h1 className="cxp-titulo">{titulo}</h1>
            <p className="cxp-lead">{descripcion}</p>
          </div>
          <div className="cxp-kpis" role="group" aria-label="Resumen de la cartera">
            {esPagados || esExcluidas ? (
              <Kpi titulo={esPagados ? 'Total pagado' : 'Total excluido'} valor={totales.suma_total} cantidad={totales.n_total} activo={false} />
            ) : (
              <>
                <Kpi titulo="Total CXP" valor={totales.suma_total} cantidad={totales.n_total} activo={vencimiento === ''} onClick={() => filtrar(setVencimiento)('')} />
                <Kpi titulo="Vencido" tono="danger" valor={totales.suma_vencido} cantidad={totales.n_vencido} activo={vencimiento === 'vencidos'} onClick={() => filtrar(setVencimiento)(vencimiento === 'vencidos' ? '' : 'vencidos')} />
                <Kpi titulo="Por vencer" tono="success" valor={totales.suma_por_vencer} cantidad={totales.n_por_vencer} activo={vencimiento === 'por_vencer'} onClick={() => filtrar(setVencimiento)(vencimiento === 'por_vencer' ? '' : 'por_vencer')} />
              </>
            )}
          </div>
        </div>

        {esPend && prefs.verTramos && (
          <div className="cxp-tramos" role="group" aria-label="Antigüedad de lo vencido">
            <span className="cxp-tramos__titulo">Vencido por antigüedad:</span>
            {([
              ['1_30', '1–30 días', totales.suma_1_30, totales.n_1_30],
              ['31_60', '31–60 días', totales.suma_31_60, totales.n_31_60],
              ['61_90', '61–90 días', totales.suma_61_90, totales.n_61_90],
              ['mas_90', 'Más de 90 días', totales.suma_mas_90, totales.n_mas_90],
            ] as [Vencimiento, string, number, number][]).map(([clave, etiqueta, valor, n]) => (
              <button
                key={clave}
                type="button"
                className={vencimiento === clave ? 'cxp-tramo is-active' : 'cxp-tramo'}
                aria-pressed={vencimiento === clave}
                onClick={() => filtrar(setVencimiento)(vencimiento === clave ? '' : clave)}
              >
                <span className="cxp-tramo__etiqueta">{etiqueta}</span>
                <span className="cxp-tramo__valor">{moneda(valor)}</span>
                <span className="cxp-tramo__n">{n} doc.</span>
              </button>
            ))}
          </div>
        )}

        {esPend && ultima !== undefined && (
          <div className={vieja ? 'cxp-banner cxp-banner--aviso' : 'cxp-banner'} role="status">
            {ultima === null ? (
              'Aún no se ha cargado ningún archivo del ERP: los totales solo incluyen pendientes escritos a mano.'
            ) : (
              <>
                Datos del ERP al <strong>{fechaHora(ultima.fecha)}</strong>
                {ultima.usuario ? ` · cargó ${ultima.usuario}` : ''}
                {ultima.archivo ? ` · ${ultima.archivo}` : ''}.
                {vieja && ' Hace más de 3 días: conviene cargar un archivo nuevo.'}
                {ultima.ausentes > 0 && (
                  <>
                    {' '}
                    <button type="button" className="cxp-link" onClick={() => filtrar(setOrigen)('ausente')}>
                      {ultima.ausentes} documento(s) no vinieron en esa carga
                    </button>{' '}
                    (puede que ya estén pagados en el ERP).
                  </>
                )}
              </>
            )}
          </div>
        )}

        {esPend && nCruces > 0 && permisos.editar && (
          <div className="cxp-banner cxp-banner--aviso" role="status">
            {nCruces} pendiente(s) manual(es) parecen estar ya en el ERP; si no los cruzas, se cuentan dos veces.{' '}
            <button type="button" className="cxp-link" onClick={() => setCruces({ manual: null })}>Revisar cruces</button>
          </div>
        )}

        {error && (
          <div className="ui-alert ui-alert--error ag-alert" role="alert">
            <AlertIcon className="ui-alert__icon" />
            <span>{error}</span>
          </div>
        )}

        <div className="cxp-barra__fila">
          <div className="ag-toolbar__filters cxp-barra__filtros">
            <ComboProveedor proveedores={proveedores} valor={proveedor} onCambio={filtrar(setProveedor)} />
            <div className="ag-search">
              <SearchIcon className="ag-search__icon" />
              <input
                type="search"
                className="ui-input"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Buscar por proveedor, NIT, factura o detalle"
                aria-label="Buscar"
              />
            </div>
            {sedes.length > 1 && (
              <select className="ui-input cxp-select" aria-label="Sede" value={sede} onChange={(e) => filtrar(setSede)(e.target.value)}>
                <option value="">Todas las sedes</option>
                {sedes.map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            )}
            <select className="ui-input cxp-select" aria-label="Origen" value={origen} onChange={(e) => filtrar(setOrigen)(e.target.value)}>
              <option value="">ERP y manuales</option>
              <option value="erp">Solo ERP</option>
              <option value="manual">Solo manuales</option>
              <option value="ausente">No vinieron en la última carga</option>
            </select>
          </div>

          <div className="cxp-barra__botones">
            <MenuPop etiqueta="Columnas">
              <PanelColumnas columnas={columnas} grupos={grupos} prefs={prefs} onPrefs={cambiarPrefs} ocultasPorDefecto={ocultasPorDefecto} />
            </MenuPop>
            <MenuPop etiqueta="Formato">
              <PanelFormato prefs={prefs} onPrefs={cambiarPrefs} onRestablecer={restablecer} conTramos={esPend} conSeleccion={hayCheck} />
            </MenuPop>
            {esPend && permisos.crear && (
              <button type="button" className="ui-btn ui-btn--primary" onClick={() => setFormulario({ editar: null })}>
                + Agregar pendiente
              </button>
            )}
          </div>
        </div>

        <div className="cxp-barra__fila cxp-barra__fila--pie">
          {esPend && (
            <span className="cxp-leyenda"><i className="cxp-leyenda__muestra" /> Manual: aún no está en el ERP</span>
          )}
          {proveedor && <span className="cxp-barra__nota">Los totales son del proveedor filtrado.</span>}
          <div className="cxp-barra__pager" aria-live="polite">
            {infinito ? (
              <>
                <span>{cargando ? 'Cargando…' : `Mostrando ${filas.length} de ${total}`}</span>
                {hayMas && (
                  <button type="button" className="ui-btn ui-btn--sm" disabled={cargandoMas} onClick={cargarMas}>
                    {cargandoMas ? 'Cargando…' : 'Cargar más'}
                  </button>
                )}
                {total > MAX_FILAS_INFINITO && filas.length >= MAX_FILAS_INFINITO && (
                  <span className="cxp-barra__nota">Máximo {MAX_FILAS_INFINITO} filas: afina los filtros para ver el resto.</span>
                )}
              </>
            ) : (
              <>
                <span>{cargando ? 'Cargando…' : `${total} documento(s)`}</span>
                <button type="button" className="ui-btn ui-btn--sm" disabled={pagina === 0 || cargando} onClick={() => setPagina((p) => p - 1)}>Anterior</button>
                <span>Página {pagina + 1} de {paginas}</span>
                <button type="button" className="ui-btn ui-btn--sm" disabled={pagina + 1 >= paginas || cargando} onClick={() => setPagina((p) => p + 1)}>Siguiente</button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ===== Tabla ===== */}
      <HojaTabla
        columnas={columnas}
        grupos={grupos}
        filas={filas}
        idFila={(f) => f.id}
        claseFila={(f) => (f.origen === 'manual' ? 'cxp-row--manual' : undefined)}
        prefs={prefs}
        onPrefs={cambiarPrefs}
        orden={orden}
        onOrden={alternarOrden}
        seleccion={
          hayCheck
            ? { tiene: (f) => seleccion.has(f.id), alternar: alternarSeleccion, todos: todosVisibles, alternarTodos: seleccionarVisibles }
            : undefined
        }
        acciones={hayAcciones ? renderAcciones : undefined}
        cargando={cargando}
        cargandoMas={cargandoMas}
        vacio={esPagados ? 'Aún no hay documentos pagados.' : esExcluidas ? 'No hay documentos excluidos.' : 'No hay cuentas por pagar con ese filtro.'}
        etiqueta="Cartera por pagar"
        hayMas={hayMas}
        alCentinela={infinito ? cargarMas : undefined}
        reinicio={`${busqueda}|${proveedor}|${sede}|${origen}|${vencimiento}|${orden?.clave ?? ''}${orden?.dir ?? ''}|${pagina}|${infinito}|${lote}`}
      />

      {hayCheck && seleccion.size > 0 && (
        <div className="cxp-seleccion" role="region" aria-label="Documentos seleccionados">
          <div className="cxp-seleccion__info">
            <span>
              <strong>{seleccion.size}</strong> seleccionado(s) · Total <strong>{moneda(totalSeleccion)}</strong>
            </span>
            <button type="button" className="ui-btn" onClick={() => setSeleccion(new Map())}>Limpiar</button>
          </div>
          <div className="cxp-seleccion__centro">
            {esPend && permisos.pagar && (
              <button type="button" className="ui-btn ui-btn--primary cxp-btn-grande" onClick={() => pedirPago(Array.from(seleccion.values()))}>
                Marcar como pagados
              </button>
            )}
            {esPagados && (
              <button type="button" className="ui-btn ui-btn--primary cxp-btn-grande" onClick={() => setMensajes({ filas: Array.from(seleccion.values()) })}>
                Armar mensaje para los proveedores
              </button>
            )}
          </div>
          <div className="cxp-seleccion__derecha">
            {esPend && permisos.excluir && (
              <button type="button" className="ui-btn cxp-btn-grande" onClick={() => setExclSel(Array.from(seleccion.values()))} title="Dejar fuera de la cartera los documentos seleccionados">
                Excluir selección
              </button>
            )}
          </div>
        </div>
      )}

      <div role="status" aria-live="polite">
        {aviso && <div className={aviso.error ? 'ag-toast ag-toast--error' : 'ag-toast'}>{aviso.texto}</div>}
      </div>

      {cruces && (
        <CrucesCxp
          supabase={supabase}
          organizacionId={organizacionId}
          manual={cruces.manual}
          puedePagar={permisos.pagar}
          onCerrar={() => setCruces(null)}
          onCambio={(mensaje) => {
            setAviso({ texto: mensaje });
            recargarTodo();
          }}
        />
      )}

      {pago && (
        <ConfirmarPago filas={pago.filas} onCerrar={() => setPago(null)} onConfirmar={(armar) => confirmarPago(pago.filas, armar)} />
      )}

      {mensajes && (
        <MensajesProveedor
          supabase={supabase}
          organizacionId={organizacionId}
          filas={mensajes.filas}
          empresa={empresaNombre}
          usuario={usuarioNombre}
          onCerrar={() => setMensajes(null)}
        />
      )}

      {exclSel && (
        <FormExcluirSeleccion
          supabase={supabase}
          organizacionId={organizacionId}
          filas={exclSel}
          onCerrar={() => setExclSel(null)}
          onHecho={(n, ids) => {
            setExclSel(null);
            setSeleccion((prev) => {
              const m = new Map(prev);
              ids.forEach((id) => m.delete(id));
              return m;
            });
            setAviso({ texto: `${n} documento(s) excluido(s): los encuentras en la pestaña Excluidas.` });
            despuesDeCambio(ids);
          }}
        />
      )}

      {excluyendo && (
        <FormExcluir
          supabase={supabase}
          organizacionId={organizacionId}
          fila={excluyendo}
          onCerrar={() => setExcluyendo(null)}
          onGuardado={() => {
            const id = excluyendo.id;
            setExcluyendo(null);
            setAviso({ texto: 'Documento excluido: lo encuentras en la pestaña Excluidas.' });
            despuesDeCambio([id]);
          }}
        />
      )}

      {formulario && (
        <FormPendiente
          supabase={supabase}
          organizacionId={organizacionId}
          sedes={sedes}
          inicial={formulario.editar}
          onCerrar={() => setFormulario(null)}
          onGuardado={() => {
            const eraNuevo = formulario.editar === null;
            setFormulario(null);
            setAviso({ texto: eraNuevo ? 'Pendiente agregado.' : 'Cambios guardados.' });
            recargarTodo();
          }}
        />
      )}
    </div>
  );
}

function Kpi({
  titulo,
  valor,
  cantidad,
  tono,
  activo,
  onClick,
}: {
  titulo: string;
  valor: number;
  cantidad: number;
  tono?: 'danger' | 'success';
  activo: boolean;
  onClick?: () => void;
}) {
  const clases = ['cxp-kpi', tono ? `cxp-kpi--${tono}` : '', activo ? 'is-active' : ''].filter(Boolean).join(' ');
  const contenido = (
    <>
      <span className="cxp-kpi__titulo">{titulo}</span>
      <span className="cxp-kpi__valor">{moneda(valor)}</span>
      <span className="cxp-kpi__cantidad">{cantidad} documento(s)</span>
    </>
  );
  return onClick ? (
    <button type="button" className={clases} aria-pressed={activo} onClick={onClick}>
      {contenido}
    </button>
  ) : (
    <div className={clases}>{contenido}</div>
  );
}

/** Celda que se edita al hacer clic: Enter o salir del campo guarda, Esc cancela. */
function CeldaEditable({
  valor,
  tipo,
  editable,
  etiqueta,
  onGuardar,
}: {
  valor: number | string;
  tipo: 'num' | 'texto';
  editable: boolean;
  etiqueta: string;
  onGuardar: (v: string) => Promise<boolean>;
}) {
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState('');
  const [guardando, setGuardando] = useState(false);
  const cancelado = useRef(false);

  const mostrado = tipo === 'num' ? (Number(valor) ? moneda(Number(valor)) : '') : String(valor);
  const original = tipo === 'num' ? (Number(valor) ? String(valor) : '') : String(valor);

  if (!editable) return <>{mostrado}</>;

  if (!editando) {
    return (
      <button
        type="button"
        className="cxp-celda"
        aria-label={`Editar ${etiqueta}`}
        onClick={() => {
          cancelado.current = false;
          setBorrador(original);
          setEditando(true);
        }}
      >
        {mostrado || <span className="cxp-celda__vacia">—</span>}
      </button>
    );
  }

  async function terminar() {
    if (cancelado.current || borrador.trim() === original.trim()) {
      setEditando(false);
      return;
    }
    setGuardando(true);
    await onGuardar(borrador); // si falla, el aviso de error ya se mostró y se vuelve al valor guardado
    setGuardando(false);
    setEditando(false);
  }

  return (
    <input
      className="ui-input ui-input--sm cxp-celda__input"
      autoFocus
      disabled={guardando}
      aria-label={etiqueta}
      inputMode={tipo === 'num' ? 'decimal' : undefined}
      maxLength={tipo === 'texto' ? 500 : undefined}
      value={borrador}
      onChange={(e) => setBorrador(e.target.value)}
      onBlur={terminar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          cancelado.current = true;
          e.currentTarget.blur();
        }
      }}
    />
  );
}
