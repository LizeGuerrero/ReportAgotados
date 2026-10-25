'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { useTiempoReal } from '@/components/useTiempoReal';
import { usePermisosPedidos } from '@/components/pedidos/usePermisosPedidos';
import { pesos, fecha } from '@/components/pedidos/comun';

type Pestana = 'agotados' | 'cotizar' | 'comparativo' | 'ordenes';

type SedeAgotado = { sede: string; cantidad_sugerida: number | null; notas: string | null };
interface AgotadoDisponible {
  item_id: number;
  codigo: string | null;
  nombre_base: string;
  linea: string | null;
  unidad_medida: string | null;
  cantidad_sugerida: number | null;
  sedes: SedeAgotado[];
  proveedores: number;
  fecha: string | null;
  total: number;
}
interface ProveedorOpcion {
  id: number;
  nombre: string;
  documento: string;
  items_pendientes?: number;
  solicitudes_abiertas?: number;
  items_total?: number;
}
interface ProveedorCompra {
  proveedor_id: number;
  nombre: string;
  documento: string;
  cobra_iva: boolean;
  iva_compra: number;
  pedido_minimo: number | null;
  flete_gratis_desde: number | null;
  flete_estandar: number | null;
  dias_tipicos: number | null;
}
interface Oferta {
  proveedor_id: number;
  estado: 'estimada' | 'pedida' | 'respondida' | 'no_disponible';
  fuente: 'erp' | 'cotizacion';
  costo: number | null;
  dias: number | null;
  observacion: string | null;
  referencia: string | null;
  precio_erp: number | null;
}
interface Asignacion {
  proveedor_id: number;
  cantidad: number;
  motivo: 'mejor_precio' | 'mas_rapido' | 'consolidar' | 'manual';
  nota: string | null;
}
interface LineaCompra {
  id: string;
  item_id: number;
  codigo: string | null;
  nombre: string;
  linea: string | null;
  unidad: string | null;
  iva: number | null;
  cantidad: number;
  ordenada: boolean;
  sedes: { sede: string; cantidad: number | null; nota: string | null }[];
  ofertas: Oferta[];
  asignaciones: Asignacion[];
}
interface OrdenCompra {
  id: string;
  numero: number;
  estado: string;
  proveedor_id: number;
  subtotal: number | null;
  iva: number | null;
  flete: number | null;
  total: number | null;
  fecha: string | null;
  enviada_en: string | null;
  cancelada_motivo: string | null;
}
interface CompraDetalle {
  compra: { id: string; numero: number; titulo: string; estado: string; base_costo: 'con_iva' | 'sin_iva'; creada: string };
  proveedores: ProveedorCompra[];
  lineas: LineaCompra[];
  ordenes: OrdenCompra[];
}
interface CompraResumen {
  id: string;
  numero: number;
  titulo: string;
  estado: string;
  created_at: string;
  productos: number;
  proveedores: number;
  ordenes: number;
}
interface OfertaDraft { costo: string; dias: string; observacion: string; disponible: boolean }
interface AsignacionDraft { cantidad: string; motivo: Asignacion['motivo']; nota: string }
interface CondicionDraft { minimo: string; fleteGratis: string; flete: string; dias: string }

const POR_PAGINA = 50;
const TABLAS_EN_VIVO = ['agotados', 'compras', 'compra_lineas', 'compra_ofertas', 'compra_asignaciones', 'ordenes_compra'] as const;

function errorTexto(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message);
  return String(error ?? 'Ocurrió un error inesperado.');
}
function numero(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
function claveOferta(lineaId: string, proveedorId: number) { return `${lineaId}:${proveedorId}`; }
function nombreEstado(estado: string) {
  const nombres: Record<string, string> = {
    armando: 'En preparación', cotizando: 'Cotizando', decidiendo: 'Comparando / asignando',
    ordenada: 'Órdenes generadas', cerrada: 'Cerrada', emitida: 'Emitida', enviada: 'Enviada',
    pendiente: 'Pendiente', cancelada: 'Cancelada', estimada: 'Precio del ERP', pedida: 'Cotización solicitada',
    respondida: 'Cotizada', no_disponible: 'No disponible',
  };
  return nombres[estado] ?? estado;
}
function estadoClass(estado: string) {
  if (['ordenada', 'cerrada', 'enviada', 'respondida'].includes(estado)) return 'ui-badge ui-badge--success';
  if (['cotizando', 'decidiendo', 'pedida', 'emitida'].includes(estado)) return 'ui-badge ui-badge--warning';
  if (['cancelada', 'no_disponible'].includes(estado)) return 'ui-badge ui-badge--danger';
  return 'ui-badge ui-badge--info';
}
function compraBloqueada(d: CompraDetalle | null) {
  return !d || ['ordenada', 'cerrada'].includes(d.compra.estado);
}

/**
 * Mesa de compra conectada a las RPC de la migración de Claude. La bandeja se alimenta de
 * compra_necesidades(), cuyo origen real son los registros pendientes de public.agotados.
 * El nombre técnico de la RPC se conserva para no duplicar ni renombrar SQL que ya existe.
 */
export default function MesaCompra({ organizacionId }: { organizacionId: string }) {
  const [supabase] = useState<SupabaseClient>(() => createClient());
  const permisos = usePermisosPedidos(supabase, organizacionId);
  const [pestana, setPestana] = useState<Pestana>('agotados');
  const [filas, setFilas] = useState<AgotadoDisponible[]>([]);
  const [lineas, setLineas] = useState<string[]>([]);
  const [linea, setLinea] = useState('');
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(0);
  const [cargandoAgotados, setCargandoAgotados] = useState(false);
  const [seleccion, setSeleccion] = useState<Record<number, { fila: AgotadoDisponible; cantidad: string }>>({});
  const [seleccionProveedores, setSeleccionProveedores] = useState<number[]>([]);
  const [proveedores, setProveedores] = useState<ProveedorOpcion[]>([]);
  const [compras, setCompras] = useState<CompraResumen[]>([]);
  const [compraId, setCompraId] = useState('');
  const [detalle, setDetalle] = useState<CompraDetalle | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [tituloCompra, setTituloCompra] = useState('');
  const [nuevoProveedorId, setNuevoProveedorId] = useState('');
  const [draftsOferta, setDraftsOferta] = useState<Record<string, OfertaDraft>>({});
  const [draftsAsignacion, setDraftsAsignacion] = useState<Record<string, AsignacionDraft>>({});
  const [draftsCondiciones, setDraftsCondiciones] = useState<Record<number, CondicionDraft>>({});
  const [proveedorMensajeId, setProveedorMensajeId] = useState<number | null>(null);
  const [mensaje, setMensaje] = useState('');
  const [dejarFuera, setDejarFuera] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setBusqueda(texto);
      setPagina(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [texto]);

  const cargarAgotados = useCallback(async () => {
    setCargandoAgotados(true);
    const { data, error: rpcError } = await supabase.rpc('compra_necesidades', {
      p_org: organizacionId,
      p_linea: linea || null,
      p_busqueda: busqueda || null,
      p_limit: POR_PAGINA,
      p_offset: pagina * POR_PAGINA,
    });
    setCargandoAgotados(false);
    if (rpcError) {
      setError(`No se pudieron cargar los agotados pendientes: ${rpcError.message}`);
      return;
    }
    const nuevos = (data ?? []) as AgotadoDisponible[];
    setFilas(nuevos);
    setSeleccion((prev) => {
      const siguiente = { ...prev };
      for (const fila of nuevos) {
        if (siguiente[fila.item_id]) siguiente[fila.item_id] = { fila, cantidad: siguiente[fila.item_id].cantidad };
      }
      return siguiente;
    });
    setError('');
  }, [supabase, organizacionId, linea, busqueda, pagina]);

  const cargarLineas = useCallback(async () => {
    // Esta RPC ya existe en el SQL base; solo sirve para el filtro. La bandeja principal se lee de Agotados.
    const { data } = await supabase.rpc('listar_lineas_pedidos', { p_org: organizacionId });
    const lista = (data ?? []) as (string | { linea: string })[];
    setLineas(lista.map((v) => typeof v === 'string' ? v : v.linea).filter(Boolean));
  }, [supabase, organizacionId]);

  const cargarProveedores = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('listar_proveedores_pedidos', { p_org: organizacionId });
    if (rpcError) {
      setError((prev) => prev || `No se pudieron cargar los proveedores: ${rpcError.message}`);
      return;
    }
    setProveedores((data ?? []) as ProveedorOpcion[]);
  }, [supabase, organizacionId]);

  const cargarCompras = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('listar_compras', { p_org: organizacionId });
    if (rpcError) {
      setError(`No se pudieron cargar las compras: ${rpcError.message}`);
      return;
    }
    setCompras((data ?? []) as CompraResumen[]);
  }, [supabase, organizacionId]);

  const cargarDetalle = useCallback(async (id: string) => {
    if (!id) {
      setDetalle(null);
      return;
    }
    setCargandoDetalle(true);
    const { data, error: rpcError } = await supabase.rpc('compra_obtener', { p_org: organizacionId, p_compra: id });
    setCargandoDetalle(false);
    if (rpcError) {
      setError(`No se pudo abrir la compra: ${rpcError.message}`);
      setDetalle(null);
      return;
    }
    const compra = data as CompraDetalle;
    setDetalle(compra);
    setError('');
    setDraftsOferta((prev) => {
      const next = { ...prev };
      for (const l of compra.lineas ?? []) {
        for (const p of compra.proveedores ?? []) {
          const oferta = l.ofertas?.find((o) => o.proveedor_id === p.proveedor_id);
          const key = claveOferta(l.id, p.proveedor_id);
          if (!next[key] || !prev[key]) {
            next[key] = {
              costo: oferta?.costo !== null && oferta?.costo !== undefined ? String(oferta.costo) : oferta?.precio_erp !== null && oferta?.precio_erp !== undefined ? String(oferta.precio_erp) : '',
              dias: oferta?.dias !== null && oferta?.dias !== undefined ? String(oferta.dias) : p.dias_tipicos !== null && p.dias_tipicos !== undefined ? String(p.dias_tipicos) : '',
              observacion: oferta?.observacion ?? '',
              disponible: oferta?.estado !== 'no_disponible',
            };
          }
        }
      }
      return next;
    });
    setDraftsAsignacion((prev) => {
      const next = { ...prev };
      for (const l of compra.lineas ?? []) {
        for (const p of compra.proveedores ?? []) {
          const key = claveOferta(l.id, p.proveedor_id);
          const existente = l.asignaciones?.find((a) => a.proveedor_id === p.proveedor_id);
          if (!prev[key]) next[key] = { cantidad: existente ? String(existente.cantidad) : '', motivo: existente?.motivo ?? 'manual', nota: existente?.nota ?? '' };
        }
      }
      return next;
    });
    setDraftsCondiciones((prev) => {
      const next = { ...prev };
      for (const p of compra.proveedores ?? []) {
        if (!prev[p.proveedor_id]) next[p.proveedor_id] = {
          minimo: p.pedido_minimo == null ? '' : String(p.pedido_minimo),
          fleteGratis: p.flete_gratis_desde == null ? '' : String(p.flete_gratis_desde),
          flete: p.flete_estandar == null ? '' : String(p.flete_estandar),
          dias: p.dias_tipicos == null ? '' : String(p.dias_tipicos),
        };
      }
      return next;
    });
  }, [supabase, organizacionId]);

  useEffect(() => { void cargarAgotados(); }, [cargarAgotados]);
  useEffect(() => { void cargarLineas(); void cargarProveedores(); void cargarCompras(); }, [cargarLineas, cargarProveedores, cargarCompras]);
  useEffect(() => { if (compraId) void cargarDetalle(compraId); else setDetalle(null); }, [compraId, cargarDetalle]);

  const recargarTodo = useCallback(() => {
    void cargarAgotados();
    void cargarCompras();
    void cargarProveedores();
    if (compraId) void cargarDetalle(compraId);
  }, [cargarAgotados, cargarCompras, cargarProveedores, cargarDetalle, compraId]);
  useTiempoReal(supabase, organizacionId, TABLAS_EN_VIVO, recargarTodo);

  const totalAgotados = filas[0]?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(totalAgotados / POR_PAGINA));
  const idsVisibles = filas.map((f) => f.item_id);
  const paginaSeleccionada = idsVisibles.length > 0 && idsVisibles.every((id) => Boolean(seleccion[id]));
  const idsSeleccionados = Object.keys(seleccion).map(Number);
  const compraAbierta = detalle && !['ordenada', 'cerrada'].includes(detalle.compra.estado);
  const proveedoresPorId = useMemo(() => new Map((detalle?.proveedores ?? []).map((p) => [p.proveedor_id, p])), [detalle]);

  function abrirCompra(id: string, siguiente: Pestana = 'cotizar') {
    setCompraId(id);
    setPestana(siguiente);
    setMensaje('');
    setAviso('');
  }

  function alternarSeleccion(fila: AgotadoDisponible, activa: boolean) {
    setSeleccion((prev) => {
      const next = { ...prev };
      if (activa) next[fila.item_id] = { fila, cantidad: fila.cantidad_sugerida == null ? '' : String(fila.cantidad_sugerida) };
      else delete next[fila.item_id];
      return next;
    });
  }

  function alternarPagina(activa: boolean) {
    setSeleccion((prev) => {
      const next = { ...prev };
      for (const fila of filas) {
        if (activa) next[fila.item_id] = next[fila.item_id] ?? { fila, cantidad: fila.cantidad_sugerida == null ? '' : String(fila.cantidad_sugerida) };
        else delete next[fila.item_id];
      }
      return next;
    });
  }

  function actualizarCantidad(itemId: number, cantidad: string) {
    setSeleccion((prev) => prev[itemId] ? { ...prev, [itemId]: { ...prev[itemId], cantidad } } : prev);
  }

  function itemsSeleccionados() {
    const rows = Object.values(seleccion);
    if (rows.length === 0) throw new Error('Selecciona al menos un agotado.');
    return rows.map(({ fila, cantidad }) => {
      const n = numero(cantidad);
      if (n === null || n <= 0) throw new Error(`La cantidad de “${fila.nombre_base}” debe ser mayor que cero.`);
      return { item_id: fila.item_id, cantidad: n };
    });
  }

  async function crearCompra() {
    setError(''); setAviso('');
    let items: { item_id: number; cantidad: number }[];
    try { items = itemsSeleccionados(); } catch (e) { setError(errorTexto(e)); return; }
    setProcesando(true);
    const { data, error: rpcError } = await supabase.rpc('compra_crear', {
      p_org: organizacionId,
      p_titulo: tituloCompra.trim() || null,
      p_items: items,
      p_proveedores: seleccionProveedores,
    });
    setProcesando(false);
    if (rpcError) { setError(rpcError.message); return; }
    const nuevoId = String(data);
    setSeleccion({}); setTituloCompra(''); setSeleccionProveedores([]);
    setAviso(`Compra creada correctamente con ${items.length} artículo(s).`);
    await Promise.all([cargarAgotados(), cargarCompras()]);
    abrirCompra(nuevoId, 'cotizar');
  }

  async function agregarACompra() {
    if (!detalle || !compraAbierta) return;
    setError(''); setAviso('');
    let items: { item_id: number; cantidad: number }[];
    try { items = itemsSeleccionados(); } catch (e) { setError(errorTexto(e)); return; }
    setProcesando(true);
    const { data, error: rpcError } = await supabase.rpc('compra_agregar_items', {
      p_org: organizacionId, p_compra: detalle.compra.id, p_items: items,
    });
    setProcesando(false);
    if (rpcError) { setError(rpcError.message); return; }
    setSeleccion({});
    setAviso(`Se agregaron ${Number(data ?? 0)} artículo(s) a la compra.`);
    await Promise.all([cargarAgotados(), cargarCompras(), cargarDetalle(detalle.compra.id)]);
  }

  async function ejecutar(mensajeOk: string, tarea: () => Promise<{ error: { message: string } | null }>) {
    setProcesando(true); setError(''); setAviso('');
    const { error: rpcError } = await tarea();
    setProcesando(false);
    if (rpcError) { setError(rpcError.message); return false; }
    setAviso(mensajeOk);
    await Promise.all([cargarCompras(), cargarAgotados(), compraId ? cargarDetalle(compraId) : Promise.resolve()]);
    return true;
  }

  async function agregarProveedor() {
    if (!detalle || !nuevoProveedorId) return;
    const ok = await ejecutar('Proveedor agregado a la compra.', async () => await supabase.rpc('compra_consultar_proveedor', {
      p_org: organizacionId, p_compra: detalle.compra.id, p_proveedor: Number(nuevoProveedorId),
    }));
    if (ok) setNuevoProveedorId('');
  }

  async function quitarProveedor(id: number) {
    if (!detalle || !window.confirm('¿Quitar este proveedor de la compra?')) return;
    await ejecutar('Proveedor quitado de la compra.', async () => await supabase.rpc('compra_quitar_proveedor', {
      p_org: organizacionId, p_compra: detalle.compra.id, p_proveedor: id,
    }));
  }

  async function quitarLinea(lineaId: string, nombre: string) {
    if (!detalle || !window.confirm(`¿Quitar “${nombre}” de la compra? El agotado volverá a aparecer entre los pendientes si sigue sin respuesta.`)) return;
    await ejecutar('Artículo quitado de la compra.', async () => await supabase.rpc('compra_quitar_linea', {
      p_org: organizacionId, p_compra: detalle.compra.id, p_linea: lineaId,
    }));
  }

  function draftOferta(l: LineaCompra, p: ProveedorCompra): OfertaDraft {
    const k = claveOferta(l.id, p.proveedor_id);
    return draftsOferta[k] ?? { costo: '', dias: '', observacion: '', disponible: true };
  }

  async function guardarOferta(l: LineaCompra, p: ProveedorCompra) {
    const draft = draftOferta(l, p);
    const costo = draft.disponible ? numero(draft.costo) : null;
    if (draft.disponible && (costo === null || costo <= 0)) { setError(`Digita un costo válido para ${l.nombre} / ${p.nombre}.`); return; }
    const dias = numero(draft.dias);
    if (dias !== null && (!Number.isInteger(dias) || dias < 0)) { setError('Los días de entrega deben ser un entero igual o mayor que cero.'); return; }
    await ejecutar(`Oferta guardada: ${l.nombre} / ${p.nombre}.`, async () => await supabase.rpc('oferta_guardar', {
      p_org: organizacionId,
      p_linea: l.id,
      p_proveedor: p.proveedor_id,
      p_costo: costo,
      p_dias: dias,
      p_observacion: draft.observacion.trim() || null,
      p_disponible: draft.disponible,
    }));
  }

  async function confirmarERP(p: ProveedorCompra) {
    if (!detalle) return;
    await ejecutar(`Se confirmaron las ofertas que tenían precio del ERP para ${p.nombre}.`, async () => await supabase.rpc('oferta_confirmar_erp', {
      p_org: organizacionId, p_compra: detalle.compra.id, p_proveedor: p.proveedor_id,
    }));
  }

  function prepararMensaje(p: ProveedorCompra) {
    if (!detalle) return;
    const hoy = new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota' });
    const lineasTexto = detalle.lineas.map((l, index) => {
      const oferta = l.ofertas?.find((o) => o.proveedor_id === p.proveedor_id);
      const ref = oferta?.referencia ? ` | Referencia proveedor: ${oferta.referencia}` : '';
      return `${index + 1}. ${l.codigo ?? l.item_id} — ${l.nombre} | Cantidad: ${l.cantidad} ${l.unidad ?? 'und'}${ref}`;
    }).join('\n');
    setProveedorMensajeId(p.proveedor_id);
    setMensaje(`SOLICITUD DE COTIZACIÓN C-${String(detalle.compra.numero).padStart(4, '0')}\nProveedor: ${p.nombre} (${p.documento})\nFecha: ${hoy}\n\nAgradecemos cotizar el costo unitario antes de IVA, disponibilidad, tiempo de entrega y flete. Indica también la vigencia de la oferta.\n\n${lineasTexto}\n\nGracias.`);
  }

  async function marcarSolicitada(p: ProveedorCompra) {
    if (!detalle || !window.confirm(`¿Marcar las cotizaciones estimadas para ${p.nombre} como solicitadas? Primero asegúrate de haber enviado el mensaje al proveedor.`)) return;
    await ejecutar(`Cotizaciones marcadas como solicitadas para ${p.nombre}.`, async () => await supabase.rpc('oferta_marcar_pedida', {
      p_org: organizacionId, p_compra: detalle.compra.id, p_proveedor: p.proveedor_id,
    }));
  }

  async function guardarBase(base: 'con_iva' | 'sin_iva') {
    if (!detalle) return;
    await ejecutar(`La base de comparación quedó ${base === 'con_iva' ? 'con IVA' : 'sin IVA'}.`, async () => await supabase.rpc('compra_base_costo', {
      p_org: organizacionId, p_compra: detalle.compra.id, p_base: base,
    }));
  }

  function costoComparacion(oferta: Oferta, proveedor: ProveedorCompra, compra: CompraDetalle['compra']) {
    if (oferta.costo == null) return null;
    return compra.base_costo === 'con_iva' && proveedor.cobra_iva
      ? Number(oferta.costo) * (1 + Number(proveedor.iva_compra ?? 0))
      : Number(oferta.costo);
  }

  function draftAsignacion(l: LineaCompra, p: ProveedorCompra): AsignacionDraft {
    return draftsAsignacion[claveOferta(l.id, p.proveedor_id)] ?? { cantidad: '', motivo: 'manual', nota: '' };
  }

  async function guardarAsignaciones(l: LineaCompra) {
    if (!detalle) return;
    const asignaciones = (detalle.proveedores ?? []).map((p) => {
      const d = draftAsignacion(l, p);
      return { proveedor_id: p.proveedor_id, cantidad: numero(d.cantidad), motivo: d.motivo, nota: d.nota.trim() || null };
    }).filter((a) => a.cantidad !== null && a.cantidad > 0) as { proveedor_id: number; cantidad: number; motivo: Asignacion['motivo']; nota: string | null }[];
    if (asignaciones.length === 0 && l.asignaciones.length > 0 && !window.confirm(`Vas a quitar todas las asignaciones de “${l.nombre}”. ¿Continuar?`)) return;
    const suma = asignaciones.reduce((total, a) => total + a.cantidad, 0);
    if (suma > Number(l.cantidad)) { setError(`La distribución de “${l.nombre}” supera la cantidad solicitada (${suma} de ${l.cantidad}).`); return; }
    if (asignaciones.some((a) => !l.ofertas.some((o) => o.proveedor_id === a.proveedor_id && o.estado !== 'no_disponible' && o.costo !== null))) {
      setError(`“${l.nombre}” tiene una asignación a un proveedor sin costo disponible. Guarda primero la cotización.`); return;
    }
    await ejecutar(`Distribución guardada para ${l.nombre}.`, async () => await supabase.rpc('compra_asignar', {
      p_org: organizacionId, p_linea: l.id, p_asignaciones: asignaciones,
    }));
  }

  async function guardarCondiciones(p: ProveedorCompra) {
    const d = draftsCondiciones[p.proveedor_id] ?? { minimo: '', fleteGratis: '', flete: '', dias: '' };
    const minimo = numero(d.minimo); const fleteGratis = numero(d.fleteGratis); const flete = numero(d.flete); const dias = numero(d.dias);
    if ([minimo, fleteGratis, flete, dias].some((v) => v !== null && v < 0) || (dias !== null && !Number.isInteger(dias))) {
      setError('Pedido mínimo, fletes y días deben ser valores válidos no negativos; los días deben ser enteros.'); return;
    }
    const ok = await ejecutar(`Condiciones de ${p.nombre} guardadas.`, async () => await supabase.rpc('proveedor_condiciones_guardar', {
      p_org: organizacionId,
      p_proveedor: p.proveedor_id,
      p_minimo: minimo,
      p_flete_gratis: fleteGratis,
      p_flete: flete,
      p_dias: dias,
    }));
    if (ok) await cargarDetalle(compraId);
  }

  async function emitirOrdenes() {
    if (!detalle) return;
    if (!window.confirm('Se generarán órdenes de compra para las cantidades asignadas. ¿Continuar?')) return;
    setProcesando(true); setError(''); setAviso('');
    const { data, error: rpcError } = await supabase.rpc('compra_emitir_ordenes', {
      p_org: organizacionId, p_compra: detalle.compra.id, p_dejar_fuera: dejarFuera,
    });
    setProcesando(false);
    if (rpcError) { setError(rpcError.message); return; }
    const resultado = data as { ordenes?: { numero: number; total: number }[]; fuera?: number };
    const n = resultado?.ordenes?.length ?? 0;
    setAviso(`Se generaron ${n} orden(es) de compra${dejarFuera ? `; se devolvieron ${resultado?.fuera ?? 0} línea(s) sin asignar a AGOTADOS pendientes` : ''}.`);
    setDejarFuera(false);
    await Promise.all([cargarCompras(), cargarAgotados(), cargarDetalle(detalle.compra.id)]);
  }

  async function marcarOrdenEnviada(o: OrdenCompra) {
    if (!window.confirm(`¿Confirmas que la orden OC-${String(o.numero).padStart(4, '0')} ya fue enviada al proveedor?`)) return;
    await ejecutar('Orden marcada como enviada.', async () => await supabase.rpc('orden_marcar_enviada', {
      p_org: organizacionId, p_orden: o.id,
    }));
  }

  async function cancelarOrden(o: OrdenCompra) {
    const motivo = window.prompt(`Motivo para cancelar la orden OC-${String(o.numero).padStart(4, '0')}:`);
    if (!motivo?.trim()) return;
    if (!window.confirm('La cancelación quedará registrada. ¿Continuar?')) return;
    await ejecutar('Orden cancelada.', async () => await supabase.rpc('orden_cancelar', {
      p_org: organizacionId, p_orden: o.id, p_motivo: motivo.trim(),
    }));
  }

  async function cerrarCompra() {
    if (!detalle || !window.confirm('¿Cerrar esta compra? Solo se permite después de generar todas las órdenes.')) return;
    await ejecutar('Compra cerrada.', async () => await supabase.rpc('compra_cerrar', {
      p_org: organizacionId, p_compra: detalle.compra.id,
    }));
  }

  const proveedoresNoConsultados = proveedores.filter((p) => !detalle?.proveedores.some((actual) => actual.proveedor_id === p.id));

  return (
    <section className="ped-mesa">
      <div className="mod-tabs" role="tablist" aria-label="Flujo de pedidos">
        {([
          ['agotados', '1. AGOTADOS'],
          ['cotizar', '2. Cotizar'],
          ['comparativo', '3. Comparativo'],
          ['ordenes', '4. Órdenes de compra'],
        ] as [Pestana, string][]).map(([id, etiqueta]) => (
          <button key={id} type="button" role="tab" aria-selected={pestana === id}
            className={pestana === id ? 'mod-tab is-active' : 'mod-tab'} onClick={() => setPestana(id)}>
            {etiqueta}
          </button>
        ))}
      </div>

      {error && <div className="mod-notice ped-alert ped-alert--error" role="alert">{error}</div>}
      {aviso && <div className="mod-notice" role="status">{aviso}</div>}

      {pestana === 'agotados' && (
        <>
          <div className="ped-intro">
            <div><h2 className="mod-h2 mod-mt-0">Agotados pendientes de gestión</h2><p className="mod-text mod-muted">Esta bandeja consulta directamente los reportes de AGOTADOS. Cada artículo puede agrupar reportes de varias sedes; no se crean registros paralelos de “Necesidades”.</p></div>
            <span className="ui-badge ui-badge--info">{totalAgotados.toLocaleString('es-CO')} artículos</span>
          </div>
          <div className="mod-toolbar mod-toolbar--top">
            <label className="ui-field ped-filter"><span className="ui-label">Buscar artículo</span><input className="ui-input" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Código ERP o nombre" /></label>
            <label className="ui-field ped-filter"><span className="ui-label">Línea</span><select className="ui-input" value={linea} onChange={(e) => { setLinea(e.target.value); setPagina(0); }}><option value="">Todas las líneas</option>{lineas.map((l) => <option key={l} value={l}>{l}</option>)}</select></label>
            <button className="ui-btn ui-btn--sm" type="button" onClick={() => { void cargarAgotados(); void cargarProveedores(); }} disabled={cargandoAgotados}>Actualizar</button>
          </div>
          <div className="mod-bulkbar">
            <label className="mod-check"><input type="checkbox" checked={paginaSeleccionada} onChange={(e) => alternarPagina(e.target.checked)} /> Seleccionar página</label>
            <strong>{idsSeleccionados.length} seleccionado(s)</strong>
            {compraAbierta && <span className="mod-sub">Destino disponible: C-{String(detalle!.compra.numero).padStart(4, '0')} · {detalle!.compra.titulo}</span>}
          </div>
          <div className="mod-scroll">
            <table className="mod-table">
              <thead><tr><th className="mod-check"></th><th>Item / Código ERP</th><th>Nombre base</th><th>Línea</th><th>Unidad</th><th>Cantidad a pedir</th><th>Sedes reportantes</th><th>Proveedores</th><th>Fecha</th></tr></thead>
              <tbody>
                {filas.map((f) => {
                  const sel = seleccion[f.item_id];
                  return <tr key={f.item_id} className={sel ? 'is-selected' : ''}>
                    <td className="mod-check"><input type="checkbox" checked={Boolean(sel)} onChange={(e) => alternarSeleccion(f, e.target.checked)} aria-label={`Seleccionar ${f.nombre_base}`} /></td>
                    <td className="mod-nowrap">{f.codigo ?? f.item_id}</td><td>{f.nombre_base}</td><td>{f.linea ?? '—'}</td><td>{f.unidad_medida ?? '—'}</td>
                    <td><input className="ui-input mod-cell-input" aria-label={`Cantidad para ${f.nombre_base}`} type="number" min="0.01" step="0.01" disabled={!sel} value={sel?.cantidad ?? (f.cantidad_sugerida == null ? '' : String(f.cantidad_sugerida))} onChange={(e) => actualizarCantidad(f.item_id, e.target.value)} /></td>
                    <td>{(f.sedes ?? []).map((s) => `${s.sede}${s.cantidad_sugerida != null ? ` (${s.cantidad_sugerida})` : ''}`).join(', ') || '—'}</td><td>{f.proveedores}</td><td>{fecha(f.fecha)}</td>
                  </tr>;
                })}
                {!cargandoAgotados && filas.length === 0 && <tr><td colSpan={9} className="mod-empty">No hay agotados pendientes con estos filtros.</td></tr>}
                {cargandoAgotados && <tr><td colSpan={9} className="mod-empty">Cargando agotados…</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="mod-pager"><button className="ui-btn ui-btn--sm" disabled={pagina <= 0 || cargandoAgotados} onClick={() => setPagina((v) => Math.max(0, v - 1))}>Anterior</button><span>Página {pagina + 1} de {paginas}</span><button className="ui-btn ui-btn--sm" disabled={pagina + 1 >= paginas || cargandoAgotados} onClick={() => setPagina((v) => v + 1)}>Siguiente</button></div>
          <div className="ped-panel mod-mt-4">
            <h3 className="mod-h3 mod-mt-0">Crear compra a partir de la selección</h3>
            <p className="mod-text mod-muted">Puedes asociar proveedores desde el inicio o crear la compra y consultarlos después en Cotizar.</p>
            <div className="ped-form-row">
              <label className="ui-field ped-filter"><span className="ui-label">Nombre de la compra (opcional)</span><input className="ui-input" value={tituloCompra} onChange={(e) => setTituloCompra(e.target.value)} placeholder="Ej. Reposición semanal" maxLength={160} /></label>
              <button className="ui-btn ui-btn--primary" type="button" onClick={crearCompra} disabled={procesando || !permisos.crear || idsSeleccionados.length === 0}>{procesando ? 'Creando…' : `Crear compra (${idsSeleccionados.length})`}</button>
            </div>
            <details className="mod-mt-3"><summary className="mod-semibold mod-pointer">Seleccionar proveedores para esta compra ({seleccionProveedores.length})</summary><div className="ped-provider-picker">{proveedores.map((p) => <label key={p.id} className="mod-check"><input type="checkbox" checked={seleccionProveedores.includes(p.id)} onChange={(e) => setSeleccionProveedores((prev) => e.target.checked ? [...new Set([...prev, p.id])] : prev.filter((id) => id !== p.id))} />{p.nombre}<span className="mod-sub">{p.documento}</span></label>)}{proveedores.length === 0 && <p className="mod-text mod-muted">No hay proveedores disponibles o tu rol no permite consultarlos.</p>}</div></details>
            {compraAbierta && <div className="mod-mt-3"><button className="ui-btn" type="button" onClick={agregarACompra} disabled={procesando || !permisos.editar || idsSeleccionados.length === 0}>Agregar selección a la compra abierta C-{String(detalle!.compra.numero).padStart(4, '0')}</button></div>}
          </div>
        </>
      )}

      {pestana === 'cotizar' && (
        <>
          <div className="ped-intro"><div><h2 className="mod-h2 mod-mt-0">Cotizar artículos</h2><p className="mod-text mod-muted">Abre una compra, consulta proveedores y registra las respuestas o confirma los precios existentes en el ERP.</p></div>
            <label className="ui-field ped-select-compra"><span className="ui-label">Compra</span><select className="ui-input" value={compraId} onChange={(e) => { setCompraId(e.target.value); setMensaje(''); }}><option value="">Selecciona una compra…</option>{compras.map((c) => <option key={c.id} value={c.id}>C-{String(c.numero).padStart(4, '0')} · {c.titulo} — {nombreEstado(c.estado)}</option>)}</select></label>
          </div>
          {!compraId && <TablaCompras compras={compras} onAbrir={(id) => void abrirCompra(id, 'cotizar')} />}
          {cargandoDetalle && <p className="mod-empty">Cargando compra…</p>}
          {detalle && !cargandoDetalle && <>
            <EncabezadoCompra detalle={detalle} />
            <div className="ped-panel">
              <div className="ped-panel-title"><h3 className="mod-h3 mod-mt-0">Proveedores consultados</h3>{permisos.editar && <div className="ped-inline"><select className="ui-input" value={nuevoProveedorId} onChange={(e) => setNuevoProveedorId(e.target.value)}><option value="">Agregar proveedor…</option>{proveedoresNoConsultados.map((p) => <option key={p.id} value={p.id}>{p.nombre} · {p.documento}</option>)}</select><button className="ui-btn ui-btn--sm" onClick={agregarProveedor} disabled={!nuevoProveedorId || procesando || Boolean(compraBloqueada(detalle))}>Consultar</button></div>}</div>
              {detalle.proveedores.length === 0 && <p className="mod-text mod-muted">Aún no hay proveedores consultados. Agrégalos para sembrar los precios disponibles del ERP.</p>}
              {detalle.proveedores.map((p) => <div key={p.proveedor_id} className="ped-provider-row"><div className="ped-provider-name"><strong>{p.nombre}</strong><span className="mod-sub">{p.documento} · IVA {p.cobra_iva ? `${(Number(p.iva_compra) * 100).toLocaleString('es-CO')}%` : 'no aplica'}</span></div><div className="ped-provider-actions"><button className="ui-btn ui-btn--sm" type="button" onClick={() => prepararMensaje(p)} disabled={Boolean(compraBloqueada(detalle))}>Preparar solicitud</button><button className="ui-btn ui-btn--sm" type="button" onClick={() => void confirmarERP(p)} disabled={!permisos.editar || procesando || Boolean(compraBloqueada(detalle))}>Confirmar precios ERP</button><button className="ui-btn ui-btn--sm" type="button" onClick={() => void marcarSolicitada(p)} disabled={!permisos.editar || procesando || Boolean(compraBloqueada(detalle))}>Marcar enviada</button><button className="ui-btn ui-btn--sm ui-btn--danger" type="button" onClick={() => void quitarProveedor(p.proveedor_id)} disabled={!permisos.editar || procesando || Boolean(compraBloqueada(detalle))}>Quitar</button></div>
                {permisos.provEditar && !compraBloqueada(detalle) && <details className="ped-conditions"><summary className="mod-sub mod-pointer">Condiciones de compra y flete</summary><CondicionesProveedor proveedor={p} draft={draftsCondiciones[p.proveedor_id] ?? { minimo: '', fleteGratis: '', flete: '', dias: '' }} onChange={(d) => setDraftsCondiciones((prev) => ({ ...prev, [p.proveedor_id]: d }))} onSave={() => void guardarCondiciones(p)} disabled={procesando} /></details>}
              </div>)}
            </div>
            {mensaje && <div className="ped-panel"><div className="ped-panel-title"><h3 className="mod-h3 mod-mt-0">Solicitud para proveedor</h3><span className="mod-sub">Texto preparado; el sistema no envía correos por sí solo.</span></div><textarea className="ui-input mod-mono" rows={Math.min(18, mensaje.split('\n').length + 1)} value={mensaje} readOnly /><div className="mod-flex mod-wrap mod-gap-2 mod-mt-2"><button className="ui-btn ui-btn--sm" type="button" onClick={() => { void navigator.clipboard.writeText(mensaje).then(() => setAviso('Mensaje copiado al portapapeles.')).catch(() => setError('No se pudo copiar el mensaje; selecciona el texto y usa Ctrl+C.')); }}>Copiar mensaje</button><button className="ui-btn ui-btn--sm" type="button" onClick={() => { const p = detalle.proveedores.find((x) => x.proveedor_id === proveedorMensajeId); if (p) void marcarSolicitada(p); }} disabled={!proveedorMensajeId || !permisos.editar || Boolean(compraBloqueada(detalle))}>Marcar cotización enviada</button><button className="ui-btn ui-btn--sm" type="button" onClick={() => { setMensaje(''); setProveedorMensajeId(null); }}>Cerrar</button></div></div>}
            <div className="ped-panel mod-mt-3"><h3 className="mod-h3 mod-mt-0">Registro de cotizaciones</h3><p className="mod-text mod-muted">Los costos se capturan por artículo y proveedor. El costo digitado se interpreta como valor unitario antes de IVA; la vista Comparativo puede mostrarlo con IVA según la base elegida.</p>
              {detalle.lineas.length === 0 ? <p className="mod-empty">Esta compra no tiene artículos todavía. Selecciona nuevos agotados en la pestaña AGOTADOS.</p> : <div className="mod-scroll"><table className="mod-table"><thead><tr><th>Artículo</th><th>Proveedor</th><th>Referencia</th><th>Precio ERP</th><th>Estado</th><th>Costo unit. antes de IVA</th><th>Días</th><th>Disponible</th><th>Observación</th><th></th></tr></thead><tbody>{detalle.lineas.flatMap((l) => detalle.proveedores.map((p) => {
                const o = l.ofertas?.find((of) => of.proveedor_id === p.proveedor_id);
                const d = draftOferta(l, p); const k = claveOferta(l.id, p.proveedor_id);
                return <tr key={k}><td><strong>{l.codigo ?? l.item_id}</strong><div>{l.nombre}</div><span className="mod-sub">Cant. {l.cantidad} {l.unidad ?? ''}</span></td><td>{p.nombre}</td><td>{o?.referencia ?? '—'}</td><td>{o?.precio_erp == null ? '—' : pesos(o.precio_erp)}</td><td><span className={estadoClass(o?.estado ?? 'estimada')}>{nombreEstado(o?.estado ?? 'estimada')}</span></td><td><input className="ui-input mod-cell-input" type="number" min="0.01" step="0.01" value={d.costo} disabled={!permisos.editar || !d.disponible || Boolean(compraBloqueada(detalle))} onChange={(e) => setDraftsOferta((prev) => ({ ...prev, [k]: { ...d, costo: e.target.value } }))} aria-label={`Costo para ${l.nombre}, ${p.nombre}`} /></td><td><input className="ui-input mod-cell-input" type="number" min="0" step="1" value={d.dias} disabled={!permisos.editar || Boolean(compraBloqueada(detalle))} onChange={(e) => setDraftsOferta((prev) => ({ ...prev, [k]: { ...d, dias: e.target.value } }))} aria-label={`Días de entrega para ${p.nombre}`} /></td><td><label className="mod-check"><input type="checkbox" checked={d.disponible} disabled={!permisos.editar || Boolean(compraBloqueada(detalle))} onChange={(e) => setDraftsOferta((prev) => ({ ...prev, [k]: { ...d, disponible: e.target.checked } }))} />Sí</label></td><td><input className="ui-input mod-cell-input" value={d.observacion} disabled={!permisos.editar || Boolean(compraBloqueada(detalle))} onChange={(e) => setDraftsOferta((prev) => ({ ...prev, [k]: { ...d, observacion: e.target.value } }))} aria-label={`Observación para ${l.nombre}, ${p.nombre}`} /></td><td><button className="ui-btn ui-btn--sm" type="button" disabled={!permisos.editar || procesando || Boolean(compraBloqueada(detalle))} onClick={() => void guardarOferta(l, p)}>Guardar</button></td></tr>;
              }))}</tbody></table></div>}
            </div>
          </>}
        </>
      )}

      {pestana === 'comparativo' && (
        <>
          <div className="ped-intro"><div><h2 className="mod-h2 mod-mt-0">Comparativo y distribución por proveedor</h2><p className="mod-text mod-muted">Compara costos, disponibilidad y entrega; luego reparte la cantidad entre uno o más proveedores.</p></div>
            <label className="ui-field ped-select-compra"><span className="ui-label">Compra</span><select className="ui-input" value={compraId} onChange={(e) => setCompraId(e.target.value)}><option value="">Selecciona una compra…</option>{compras.map((c) => <option key={c.id} value={c.id}>C-{String(c.numero).padStart(4, '0')} · {c.titulo} — {nombreEstado(c.estado)}</option>)}</select></label>
          </div>
          {!detalle && !cargandoDetalle && <TablaCompras compras={compras} onAbrir={(id) => void abrirCompra(id, 'comparativo')} />}
          {cargandoDetalle && <p className="mod-empty">Cargando comparativo…</p>}
          {detalle && <>
            <EncabezadoCompra detalle={detalle} />
            <div className="ped-panel"><div className="ped-panel-title"><div><h3 className="mod-h3 mod-mt-0">Base de comparación</h3><p className="mod-sub">Los precios guardados son antes de IVA; aquí puedes compararlos con o sin IVA según los datos del proveedor.</p></div><select className="ui-input ped-base-select" value={detalle.compra.base_costo} disabled={!permisos.editar || Boolean(compraBloqueada(detalle))} onChange={(e) => void guardarBase(e.target.value as 'con_iva' | 'sin_iva')}><option value="sin_iva">Comparar sin IVA</option><option value="con_iva">Comparar con IVA</option></select></div>
              {detalle.lineas.map((l) => {
                const ofertasDisponibles = l.ofertas.filter((o) => o.estado !== 'no_disponible' && o.costo !== null).map((o) => ({ oferta: o, proveedor: proveedoresPorId.get(o.proveedor_id) })).filter((x): x is { oferta: Oferta; proveedor: ProveedorCompra } => Boolean(x.proveedor)).sort((a, b) => Number(costoComparacion(a.oferta, a.proveedor, detalle.compra) ?? Infinity) - Number(costoComparacion(b.oferta, b.proveedor, detalle.compra) ?? Infinity));
                const asigActual = l.asignaciones.reduce((s, a) => s + Number(a.cantidad), 0);
                return <div className="ped-line-card" key={l.id}><div className="ped-line-head"><div><strong>{l.codigo ?? l.item_id} · {l.nombre}</strong><div className="mod-sub">{l.linea ?? 'Sin línea'} · Requerido: {l.cantidad} {l.unidad ?? 'und'} · Distribuido: {asigActual}</div></div><span className={l.ordenada ? 'ui-badge ui-badge--success' : 'ui-badge ui-badge--info'}>{l.ordenada ? 'Ya tiene orden' : `${ofertasDisponibles.length} oferta(s) con costo`}</span></div>
                  {ofertasDisponibles.length === 0 ? <p className="mod-text mod-muted">No hay precios disponibles para comparar. Registra cotizaciones en la pestaña Cotizar.</p> : <div className="mod-scroll"><table className="mod-table"><thead><tr><th>Proveedor</th><th>Referencia</th><th>Estado / fuente</th><th>Costo base</th><th>Costo comparado</th><th>Entrega</th><th>Asignar cantidad</th><th>Motivo</th><th>Nota</th></tr></thead><tbody>{ofertasDisponibles.map(({ oferta, proveedor }) => {
                    const k = claveOferta(l.id, proveedor.proveedor_id); const d = draftAsignacion(l, proveedor); const costoComp = costoComparacion(oferta, proveedor, detalle.compra);
                    return <tr key={k}><td><strong>{proveedor.nombre}</strong><div className="mod-sub">{proveedor.documento}</div></td><td>{oferta.referencia ?? '—'}</td><td><span className={estadoClass(oferta.estado)}>{nombreEstado(oferta.estado)}</span><div className="mod-sub">{oferta.fuente === 'erp' ? 'ERP' : 'Cotización'}</div></td><td>{pesos(oferta.costo)}</td><td><strong>{costoComp === null ? '—' : pesos(costoComp)}</strong></td><td>{oferta.dias == null ? '—' : `${oferta.dias} día(s)`}</td><td><input className="ui-input mod-cell-input" type="number" min="0" step="0.01" value={d.cantidad} disabled={!permisos.ganadorEditar || l.ordenada || Boolean(compraBloqueada(detalle))} onChange={(e) => setDraftsAsignacion((prev) => ({ ...prev, [k]: { ...d, cantidad: e.target.value } }))} aria-label={`Cantidad a asignar a ${proveedor.nombre}`} /></td><td><select className="ui-input mod-cell-input" value={d.motivo} disabled={!permisos.ganadorEditar || l.ordenada || Boolean(compraBloqueada(detalle))} onChange={(e) => setDraftsAsignacion((prev) => ({ ...prev, [k]: { ...d, motivo: e.target.value as AsignacionDraft['motivo'] } }))}><option value="mejor_precio">Mejor precio</option><option value="mas_rapido">Más rápido</option><option value="consolidar">Consolidar</option><option value="manual">Manual</option></select></td><td><input className="ui-input mod-cell-input" value={d.nota} disabled={!permisos.ganadorEditar || l.ordenada || Boolean(compraBloqueada(detalle))} onChange={(e) => setDraftsAsignacion((prev) => ({ ...prev, [k]: { ...d, nota: e.target.value } }))} aria-label={`Nota de asignación para ${proveedor.nombre}`} /></td></tr>;
                  })}</tbody></table></div>}
                  <div className="ped-line-footer"><span className="mod-sub">La suma asignada no puede superar la cantidad requerida. Puedes dejar una parte sin asignar hasta recibir más cotizaciones.</span><button className="ui-btn ui-btn--sm ui-btn--primary" type="button" disabled={!permisos.ganadorEditar || procesando || l.ordenada || Boolean(compraBloqueada(detalle))} onClick={() => void guardarAsignaciones(l)}>Guardar distribución</button></div>
                </div>;
              })}
              {detalle.lineas.length === 0 && <p className="mod-empty">La compra no tiene artículos.</p>}
            </div>
          </>}
        </>
      )}

      {pestana === 'ordenes' && (
        <>
          <div className="ped-intro"><div><h2 className="mod-h2 mod-mt-0">Órdenes de compra</h2><p className="mod-text mod-muted">Emite una orden por proveedor según la distribución guardada y controla su estado de envío.</p></div>
            <label className="ui-field ped-select-compra"><span className="ui-label">Compra</span><select className="ui-input" value={compraId} onChange={(e) => setCompraId(e.target.value)}><option value="">Selecciona una compra…</option>{compras.map((c) => <option key={c.id} value={c.id}>C-{String(c.numero).padStart(4, '0')} · {c.titulo} — {nombreEstado(c.estado)}</option>)}</select></label>
          </div>
          {!detalle && !cargandoDetalle && <TablaCompras compras={compras} onAbrir={(id) => void abrirCompra(id, 'ordenes')} />}
          {cargandoDetalle && <p className="mod-empty">Cargando órdenes…</p>}
          {detalle && <>
            <EncabezadoCompra detalle={detalle} />
            <div className="ped-panel"><h3 className="mod-h3 mod-mt-0">Generar órdenes desde la distribución</h3><p className="mod-text mod-muted">Se crea una orden por proveedor asignado. Los agotados asociados pasan a “Pedido solicitado” al generar la orden, no al crear la compra.</p>
              <div className="mod-flex mod-wrap mod-gap-2 mod-center"><button className="ui-btn ui-btn--primary" type="button" disabled={!permisos.ganadorCrear || procesando || Boolean(compraBloqueada(detalle))} onClick={() => void emitirOrdenes()}>{procesando ? 'Generando…' : 'Generar órdenes de compra'}</button><label className="mod-check ped-warning-check"><input type="checkbox" checked={dejarFuera} onChange={(e) => setDejarFuera(e.target.checked)} disabled={!permisos.ganadorCrear || procesando || Boolean(compraBloqueada(detalle))} />Dejar fuera los artículos sin asignar (volverán a AGOTADOS pendientes)</label></div>
              {!permisos.ganadorCrear && <p className="mod-sub mod-mt-2">Tu rol no tiene permiso para generar órdenes.</p>}
            </div>
            <div className="ped-panel mod-mt-3"><div className="ped-panel-title"><h3 className="mod-h3 mod-mt-0">Órdenes generadas ({detalle.ordenes.length})</h3>{detalle.compra.estado === 'ordenada' && permisos.editar && <button className="ui-btn ui-btn--sm" type="button" onClick={() => void cerrarCompra()} disabled={procesando}>Cerrar compra</button>}</div>
              {detalle.ordenes.length === 0 ? <p className="mod-empty">Aún no se generan órdenes para esta compra. Guarda las asignaciones en Comparativo.</p> : <div className="mod-scroll"><table className="mod-table"><thead><tr><th>Orden</th><th>Proveedor</th><th>Fecha</th><th>Subtotal</th><th>IVA</th><th>Flete</th><th>Total</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{detalle.ordenes.map((o) => { const p = detalle.proveedores.find((x) => x.proveedor_id === o.proveedor_id); return <tr key={o.id}><td>OC-{String(o.numero).padStart(4, '0')}</td><td>{p?.nombre ?? `Proveedor ${o.proveedor_id}`}</td><td>{fecha(o.fecha)}</td><td>{pesos(o.subtotal)}</td><td>{pesos(o.iva)}</td><td>{pesos(o.flete)}</td><td><strong>{pesos(o.total)}</strong></td><td><span className={estadoClass(o.estado)}>{nombreEstado(o.estado)}</span>{o.cancelada_motivo && <div className="mod-sub">{o.cancelada_motivo}</div>}</td><td><div className="mod-flex mod-wrap mod-gap-1">{['emitida', 'pendiente'].includes(o.estado) && <button className="ui-btn ui-btn--sm" type="button" onClick={() => void marcarOrdenEnviada(o)} disabled={!permisos.ganadorEditar || procesando}>Marcar enviada</button>}{['emitida', 'enviada', 'pendiente'].includes(o.estado) && <button className="ui-btn ui-btn--sm ui-btn--danger" type="button" onClick={() => void cancelarOrden(o)} disabled={!permisos.ganadorEditar || procesando}>Cancelar</button>}</div></td></tr>; })}</tbody></table></div>}
            </div>
          </>}
        </>
      )}
    </section>
  );
}

function EncabezadoCompra({ detalle }: { detalle: CompraDetalle }) {
  return <div className="ped-purchase-heading"><div><span className="mod-sub">Compra C-{String(detalle.compra.numero).padStart(4, '0')}</span><h2 className="mod-h2 mod-mt-0">{detalle.compra.titulo}</h2><span className={estadoClass(detalle.compra.estado)}>{nombreEstado(detalle.compra.estado)}</span></div><div className="ped-purchase-stats"><span><strong>{detalle.lineas.length}</strong> artículo(s)</span><span><strong>{detalle.proveedores.length}</strong> proveedor(es)</span><span><strong>{detalle.ordenes.length}</strong> orden(es)</span></div></div>;
}

function TablaCompras({ compras, onAbrir }: { compras: CompraResumen[]; onAbrir: (id: string) => void }) {
  if (compras.length === 0) return <div className="ped-panel"><p className="mod-empty">Todavía no hay compras. Selecciona artículos en AGOTADOS para crear la primera.</p></div>;
  return <div className="ped-panel"><h3 className="mod-h3 mod-mt-0">Compras registradas</h3><div className="mod-scroll"><table className="mod-table"><thead><tr><th>Compra</th><th>Título</th><th>Estado</th><th>Artículos</th><th>Proveedores</th><th>Órdenes</th><th>Creada</th><th></th></tr></thead><tbody>{compras.map((c) => <tr key={c.id}><td>C-{String(c.numero).padStart(4, '0')}</td><td>{c.titulo}</td><td><span className={estadoClass(c.estado)}>{nombreEstado(c.estado)}</span></td><td>{c.productos}</td><td>{c.proveedores}</td><td>{c.ordenes}</td><td>{fecha(c.created_at)}</td><td><button className="ui-btn ui-btn--sm" type="button" onClick={() => onAbrir(c.id)}>Abrir</button></td></tr>)}</tbody></table></div></div>;
}

function CondicionesProveedor({ proveedor, draft, onChange, onSave, disabled }: {
  proveedor: ProveedorCompra; draft: CondicionDraft; onChange: (d: CondicionDraft) => void; onSave: () => void; disabled: boolean;
}) {
  return <div className="ped-conditions-grid"><label className="mod-field"><span className="mod-label">Pedido mínimo (antes de IVA)</span><input className="ui-input mod-cell-input" type="number" min="0" value={draft.minimo} disabled={disabled} onChange={(e) => onChange({ ...draft, minimo: e.target.value })} /></label><label className="mod-field"><span className="mod-label">Flete gratis desde</span><input className="ui-input mod-cell-input" type="number" min="0" value={draft.fleteGratis} disabled={disabled} onChange={(e) => onChange({ ...draft, fleteGratis: e.target.value })} /></label><label className="mod-field"><span className="mod-label">Flete estándar</span><input className="ui-input mod-cell-input" type="number" min="0" value={draft.flete} disabled={disabled} onChange={(e) => onChange({ ...draft, flete: e.target.value })} /></label><label className="mod-field"><span className="mod-label">Días típicos</span><input className="ui-input mod-cell-input" type="number" min="0" step="1" value={draft.dias} disabled={disabled} onChange={(e) => onChange({ ...draft, dias: e.target.value })} /></label><button className="ui-btn ui-btn--sm" type="button" onClick={onSave} disabled={disabled}>Guardar condiciones</button></div>;
}
