import type {
  AsignacionCompra, BaseCosto, CompraDetalle, LineaCompra, OfertaCompra, ProveedorCompra,
} from '@/components/pedidos/tipos';
import { pesos } from '@/components/pedidos/comun';

/* Reglas de negocio de la mesa de compra. Son funciones puras sobre lo que devuelve compra_obtener:
 * no guardan nada. Lo que se decide aquí se envía a la base de datos, que vuelve a validarlo. */

/** Fracción de IVA que se le paga a este proveedor (0 si no cobra IVA). */
export const ivaProv = (p: ProveedorCompra): number => (p.cobra_iva ? Number(p.iva_compra) : 0);
export const costoConIva = (costo: number, p: ProveedorCompra): number => Math.round(costo * (1 + ivaProv(p)));

/** Costo unitario según la base elegida: con IVA (lo que se paga) o sin IVA (costo neto). */
export const costoBase = (costo: number, p: ProveedorCompra, base: BaseCosto): number =>
  base === 'sin_iva' ? costo : costoConIva(costo, p);

export const ofertaDe = (l: LineaCompra, proveedorId: number): OfertaCompra | undefined =>
  l.ofertas.find((o) => o.proveedor_id === proveedorId);
export const proveedorDe = (d: CompraDetalle, id: number): ProveedorCompra | undefined =>
  d.proveedores.find((p) => p.proveedor_id === id);

export type OfertaConCosto = OfertaCompra & { costo: number };
export const esComparable = (o: OfertaCompra | undefined): o is OfertaConCosto =>
  !!o && o.estado !== 'no_disponible' && typeof o.costo === 'number' && o.costo > 0;

export const totalAsignado = (l: LineaCompra): number => l.asignaciones.reduce((s, a) => s + a.cantidad, 0);

export const variacionErp = (o: OfertaCompra | undefined): number | undefined =>
  o && o.precio_erp && o.precio_erp > 0 && typeof o.costo === 'number' ? o.costo / o.precio_erp - 1 : undefined;

/** Cuántas ofertas de un proveedor traen precio del ERP y aún no están confirmadas. */
export const porConfirmarErp = (d: CompraDetalle, proveedorId: number): number =>
  d.lineas.filter((l) => {
    const o = ofertaDe(l, proveedorId);
    return !l.ordenada && !!o && o.fuente === 'erp' && (o.estado === 'estimada' || o.estado === 'pedida') && esComparable(o);
  }).length;

export const porPedir = (d: CompraDetalle, proveedorId: number): number =>
  d.lineas.filter((l) => !l.ordenada && ofertaDe(l, proveedorId)?.estado === 'estimada').length;

export function estadoOfertasProveedor(d: CompraDetalle, proveedorId: number) {
  const ofertas = d.lineas.map((l) => ofertaDe(l, proveedorId)).filter((o): o is OfertaCompra => !!o);
  const cuenta = (e: OfertaCompra['estado']) => ofertas.filter((o) => o.estado === e).length;
  return {
    total: ofertas.length, estimadas: cuenta('estimada'), pedidas: cuenta('pedida'),
    respondidas: cuenta('respondida'), noDisponibles: cuenta('no_disponible'),
  };
}

/* ------------------------------------------------------------------ resumen y totales */

export interface LineaResumen {
  linea: LineaCompra;
  cantidad: number;
  costo: number;
  costoIva: number;
  subtotal: number;
  ivaMonto: number;
  oferta: OfertaConCosto;
  asignacion: AsignacionCompra;
}

export interface ResumenProveedor {
  proveedor: ProveedorCompra;
  lineas: LineaResumen[];
  subtotal: number;
  iva: number;
  flete: number;
  total: number;
  /** Subtotal sin IVA + flete: lo que cuesta si el IVA de compra es descontable. */
  neto: number;
  cumpleMinimo: boolean;
  faltaParaFleteGratis?: number;
}

export interface ResumenCompra {
  proveedores: ResumenProveedor[];
  subtotal: number;
  iva: number;
  flete: number;
  total: number;
  neto: number;
  completas: LineaCompra[];
  sinAsignar: LineaCompra[];
  incompletas: LineaCompra[];
}

export function fleteDe(p: ProveedorCompra, subtotal: number): number {
  if (p.flete_gratis_desde !== null && subtotal >= p.flete_gratis_desde) return 0;
  return p.flete_estandar ?? 0;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Solo cuenta lo que aún no tiene orden (las líneas con orden ya salieron). */
export function resumenCompra(d: CompraDetalle): ResumenCompra {
  const porProv = new Map<number, ResumenProveedor>();
  const completas: LineaCompra[] = [];
  const sinAsignar: LineaCompra[] = [];
  const incompletas: LineaCompra[] = [];

  for (const l of d.lineas) {
    if (l.ordenada) continue;
    const asignado = totalAsignado(l);
    if (asignado === 0) sinAsignar.push(l);
    else if (asignado === l.cantidad) completas.push(l);
    else incompletas.push(l);
    for (const a of l.asignaciones) {
      const p = proveedorDe(d, a.proveedor_id);
      const o = ofertaDe(l, a.proveedor_id);
      if (!p || !esComparable(o)) continue;
      let r = porProv.get(p.proveedor_id);
      if (!r) {
        r = { proveedor: p, lineas: [], subtotal: 0, iva: 0, flete: 0, total: 0, neto: 0, cumpleMinimo: true };
        porProv.set(p.proveedor_id, r);
      }
      const subtotal = o.costo * a.cantidad;
      const ivaMonto = subtotal * ivaProv(p);
      r.lineas.push({ linea: l, cantidad: a.cantidad, costo: o.costo, costoIva: costoConIva(o.costo, p), subtotal, ivaMonto, oferta: o, asignacion: a });
      r.subtotal += subtotal;
      r.iva += ivaMonto;
    }
  }

  const proveedores = [...porProv.values()].sort((a, b) => a.proveedor.nombre.localeCompare(b.proveedor.nombre, 'es'));
  for (const r of proveedores) {
    r.subtotal = r2(r.subtotal);
    r.iva = r2(r.iva);
    r.flete = fleteDe(r.proveedor, r.subtotal);
    r.total = r.subtotal + r.iva + r.flete;
    r.neto = r.subtotal + r.flete;
    r.cumpleMinimo = r.proveedor.pedido_minimo === null || r.subtotal >= r.proveedor.pedido_minimo;
    const umbral = r.proveedor.flete_gratis_desde;
    if (umbral !== null && r.subtotal < umbral && (r.proveedor.flete_estandar ?? 0) > 0) r.faltaParaFleteGratis = umbral - r.subtotal;
  }
  const suma = (f: (r: ResumenProveedor) => number) => proveedores.reduce((s, r) => s + f(r), 0);
  return {
    proveedores, subtotal: suma((r) => r.subtotal), iva: suma((r) => r.iva), flete: suma((r) => r.flete),
    total: suma((r) => r.total), neto: suma((r) => r.neto), completas, sinAsignar, incompletas,
  };
}

/* ------------------------------------------------------------------ avisos: qué revisar antes de emitir */

export type Nivel = 'error' | 'aviso' | 'info';
export interface Aviso { nivel: Nivel; texto: string; lineaId?: string; proveedorId?: number }

/** Una cotización más de 5 % sobre el precio del ERP se señala para revisarla. */
export const UMBRAL_VARIACION_ERP = 0.05;

export function avisosCompra(d: CompraDetalle): Aviso[] {
  const avisos: Aviso[] = [];
  const res = resumenCompra(d);

  for (const l of res.incompletas) {
    const dif = l.cantidad - totalAsignado(l);
    avisos.push({ nivel: 'error', lineaId: l.id, texto: `${l.nombre}: ${dif > 0 ? `faltan ${dif} por asignar` : `se asignaron ${-dif} de más`}` });
  }
  if (res.sinAsignar.length > 0) avisos.push({ nivel: 'aviso', texto: `${res.sinAsignar.length} producto(s) sin asignar a ningún proveedor` });
  for (const r of res.proveedores) {
    const nom = r.proveedor.nombre;
    if (!r.cumpleMinimo) {
      avisos.push({ nivel: 'error', proveedorId: r.proveedor.proveedor_id, texto: `${nom}: pedido mínimo ${pesos(r.proveedor.pedido_minimo)} (llevas ${pesos(r.subtotal)} antes de IVA)` });
    }
    if (r.faltaParaFleteGratis !== undefined) {
      avisos.push({ nivel: 'info', proveedorId: r.proveedor.proveedor_id, texto: `${nom}: faltan ${pesos(r.faltaParaFleteGratis)} para flete gratis (hoy ${pesos(r.flete)})` });
    }
    const estimadas = r.lineas.filter((x) => x.oferta.estado === 'estimada').length;
    const pedidas = r.lineas.filter((x) => x.oferta.estado === 'pedida').length;
    if (estimadas > 0) avisos.push({ nivel: 'aviso', proveedorId: r.proveedor.proveedor_id, texto: `${nom}: ${estimadas} producto(s) con precio del ERP, sin cotización confirmada` });
    if (pedidas > 0) avisos.push({ nivel: 'aviso', proveedorId: r.proveedor.proveedor_id, texto: `${nom}: ${pedidas} producto(s) con cotización pedida y aún sin respuesta` });
    for (const x of r.lineas) {
      const v = x.oferta.fuente === 'cotizacion' ? variacionErp(x.oferta) : undefined;
      if (v !== undefined && v > UMBRAL_VARIACION_ERP) {
        avisos.push({ nivel: 'info', lineaId: x.linea.id, proveedorId: r.proveedor.proveedor_id, texto: `${x.linea.nombre}: ${nom} cotizó ${Math.round(v * 100)}% sobre el precio del ERP` });
      }
      const caja = x.oferta.unidades_caja;
      if (caja && x.cantidad % caja !== 0) {
        avisos.push({ nivel: 'info', lineaId: x.linea.id, proveedorId: r.proveedor.proveedor_id, texto: `${x.linea.nombre}: ${x.cantidad} no es múltiplo de la caja de ${caja} (${nom})` });
      }
    }
  }
  return avisos;
}

/* ------------------------------------------------------------------ estrategias de decisión */

export type Estrategia = 'precio' | 'plazo' | 'consolidar';
export interface Decision { proveedorId: number; motivo: AsignacionCompra['motivo'] }
export type Criterio = 'precio' | 'plazo';

export function mejorOferta(d: CompraDetalle, l: LineaCompra, criterio: Criterio = 'precio', base: BaseCosto = 'con_iva'): OfertaConCosto | undefined {
  const valor = (o: OfertaConCosto) => {
    const p = proveedorDe(d, o.proveedor_id);
    return { precio: p ? costoBase(o.costo, p, base) : o.costo, dias: o.dias ?? Number.POSITIVE_INFINITY };
  };
  return l.ofertas.filter((o): o is OfertaConCosto => esComparable(o) && !!proveedorDe(d, o.proveedor_id)).sort((a, b) => {
    const va = valor(a), vb = valor(b);
    return criterio === 'precio' ? va.precio - vb.precio || va.dias - vb.dias : va.dias - vb.dias || va.precio - vb.precio;
  })[0];
}

/** A quién asignar cada línea según la estrategia, sin modificar nada. */
export function calcularEstrategia(
  d: CompraDetalle, lineas: LineaCompra[], tipo: Estrategia, tolerancia = 0.05, base: BaseCosto = 'con_iva',
): Map<string, Decision> {
  const resultado = new Map<string, Decision>();
  const precioDe = (l: LineaCompra, pid: number): number | undefined => {
    const o = ofertaDe(l, pid);
    const p = proveedorDe(d, pid);
    return esComparable(o) && p ? costoBase(o.costo, p, base) : undefined;
  };

  if (tipo === 'precio' || tipo === 'plazo') {
    for (const l of lineas) {
      let mejor = mejorOferta(d, l, tipo, base);
      if (tipo === 'plazo' && mejor && mejor.dias === null) mejor = mejorOferta(d, l, 'precio', base);
      if (mejor) resultado.set(l.id, { proveedorId: mejor.proveedor_id, motivo: tipo === 'precio' ? 'mejor_precio' : 'mas_rapido' });
    }
    return resultado;
  }

  let pendientes = lineas.filter((l) => l.ofertas.some((o) => esComparable(o) && !!proveedorDe(d, o.proveedor_id)));
  const mejorPrecio = new Map<string, number>();
  for (const l of pendientes) {
    const m = mejorOferta(d, l, 'precio', base);
    const p = m && proveedorDe(d, m.proveedor_id);
    if (m && p) mejorPrecio.set(l.id, costoBase(m.costo, p, base));
  }
  while (pendientes.length > 0) {
    let elegido: { pid: number; cubre: LineaCompra[]; costo: number } | undefined;
    const candidatos = new Set(pendientes.flatMap((l) => l.ofertas.filter(esComparable).map((o) => o.proveedor_id)));
    for (const pid of candidatos) {
      const cubre = pendientes.filter((l) => {
        const precio = precioDe(l, pid);
        const mejor = mejorPrecio.get(l.id);
        return precio !== undefined && mejor !== undefined && precio <= mejor * (1 + tolerancia);
      });
      const costo = cubre.reduce((s, l) => s + (precioDe(l, pid) ?? 0) * l.cantidad, 0);
      if (cubre.length === 0) continue;
      if (!elegido || cubre.length > elegido.cubre.length || (cubre.length === elegido.cubre.length && costo < elegido.costo)) {
        elegido = { pid, cubre, costo };
      }
    }
    if (!elegido) break;
    for (const l of elegido.cubre) {
      const esElMejor = precioDe(l, elegido.pid) === mejorPrecio.get(l.id);
      resultado.set(l.id, { proveedorId: elegido.pid, motivo: esElMejor ? 'mejor_precio' : 'consolidar' });
    }
    const hechas = new Set(elegido.cubre.map((l) => l.id));
    pendientes = pendientes.filter((l) => !hechas.has(l.id));
  }
  return resultado;
}

export interface OpcionesEstrategia { tolerancia?: number; base?: BaseCosto; soloSinAsignar?: boolean }

/** Qué líneas toca una estrategia: lo asignado a mano no se pisa. */
export function decidirEstrategia(d: CompraDetalle, tipo: Estrategia, o: OpcionesEstrategia = {}) {
  const objetivo = d.lineas.filter(
    (l) => !l.ordenada && !l.asignaciones.some((a) => a.motivo === 'manual') && (!o.soloSinAsignar || l.asignaciones.length === 0),
  );
  const decision = calcularEstrategia(d, objetivo, tipo, o.tolerancia ?? 0.05, o.base ?? 'con_iva');
  return { objetivo, decision };
}

/** Lo que enviaría una estrategia al servidor: una asignación completa por línea. */
export function propuestaDeEstrategia(d: CompraDetalle, tipo: Estrategia, o: OpcionesEstrategia = {}) {
  const { objetivo, decision } = decidirEstrategia(d, tipo, o);
  const items = objetivo.flatMap((l) => {
    const x = decision.get(l.id);
    return x ? [{ linea_id: l.id, asignaciones: [{ proveedor_id: x.proveedorId, cantidad: l.cantidad, motivo: x.motivo }] }] : [];
  });
  return { items, sinOferta: objetivo.length - items.length };
}

/** Totales que resultarían de aplicar una estrategia, sin modificar nada. */
export function simularEstrategia(d: CompraDetalle, tipo: Estrategia, o: OpcionesEstrategia = {}): ResumenCompra {
  const { decision } = decidirEstrategia(d, tipo, o);
  const copia: CompraDetalle = {
    ...d,
    lineas: d.lineas.map((l) => {
      const x = decision.get(l.id);
      return x ? { ...l, asignaciones: [{ proveedor_id: x.proveedorId, cantidad: l.cantidad, motivo: x.motivo, nota: null }] } : l;
    }),
  };
  return resumenCompra(copia);
}

/* ------------------------------------------------------------------ guía de trabajo */

export interface Sugerencia { proveedor: { proveedor_id: number; nombre: string }; cubre: number; total: number }
export type Pestana = 'productos' | 'proveedores' | 'decision' | 'ordenes' | 'historial';
export interface Guia { texto: string; ir?: Pestana }

/** El "siguiente paso sugerido" de una compra: orienta sin imponer un orden. */
export function siguientePaso(d: CompraDetalle): Guia {
  const c = d.compra;
  if (c.estado === 'cerrada') return { texto: 'Compra cerrada.' };
  if (c.estado === 'ordenada') {
    const pendientes = d.ordenes.filter((o) => o.estado === 'emitida').length;
    return pendientes > 0
      ? { texto: `Hay ${pendientes} orden(es) emitida(s) sin enviar al proveedor.`, ir: 'ordenes' }
      : { texto: 'Todas las órdenes salieron. Puedes cerrar la compra.', ir: 'ordenes' };
  }
  if (d.lineas.length === 0) return { texto: 'Agrega productos: desde los agotados pendientes o desde el catálogo.', ir: 'productos' };
  if (d.proveedores.length === 0) return { texto: 'Elige a qué proveedores consultar.', ir: 'proveedores' };
  const avisos = avisosCompra(d);
  const res = resumenCompra(d);
  const error = avisos.find((a) => a.nivel === 'error');
  if (res.completas.length === 0 && res.incompletas.length === 0) {
    const sinPedir = d.proveedores.filter((p) => estadoOfertasProveedor(d, p.proveedor_id).estimadas > 0);
    if (sinPedir.length > 0 && c.estado === 'armando') {
      return { texto: 'Pide cotización a los proveedores consultados, o decide con los precios de lista.', ir: 'proveedores' };
    }
    return { texto: 'Decide: aplica una estrategia (más barato, más rápido, consolidar) o elige proveedor por producto.', ir: 'productos' };
  }
  if (error) return { texto: `Corrige antes de emitir: ${error.texto}`, ir: 'decision' };
  if (res.sinAsignar.length > 0) {
    return { texto: `Faltan ${res.sinAsignar.length} producto(s) por asignar. Puedes emitir y dejarlos para otra compra.`, ir: 'decision' };
  }
  return { texto: `Todo listo: emite ${res.proveedores.length} orden(es) por ${pesos(res.total)}.`, ir: 'decision' };
}

/* ------------------------------------------------------------------ precios escritos o pegados */

/** "38.000", "$ 38,000", "38000", "2.450,50" → número. undefined si no es un precio. */
export function numeroDeTexto(texto: string): number | undefined {
  const t = texto.replace(/[$\s]/g, '');
  if (t === '') return undefined;
  let limpio: string;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) limpio = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) limpio = t.replace(/,/g, '');
  else if (/^\d+,\d{1,2}$/.test(t)) limpio = t.replace(',', '.');
  else if (/^\d+(\.\d+)?$/.test(t)) limpio = t;
  else return undefined;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : undefined;
}
