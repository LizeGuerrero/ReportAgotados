import type { CompraDetalle, LineaCompra, ProveedorCompra, BaseCosto } from '@/components/pedidos/tipos';
import { esComparable, mejorOferta, ofertaDe, variacionErp } from '@/components/pedidos/reglas';
import { ORDEN_COLOR, REGLAS_COLOR, type ClaveColor, type ReglaColor } from '@/components/pedidos/ajustes';

/** Color de la celda (producto x proveedor) según las reglas elegidas, y por qué se pinta. */
export function colorCelda(d: CompraDetalle, l: LineaCompra, p: ProveedorCompra, base: BaseCosto, reglas: ReglaColor[]) {
  const o = ofertaDe(l, p.proveedor_id);
  const mejor = mejorOferta(d, l, 'precio', base);
  const rapido = mejorOferta(d, l, 'plazo', base);
  const v = o && o.fuente === 'cotizacion' ? variacionErp(o) : undefined;
  const varias = l.ofertas.filter(esComparable).length > 1;
  const cumple: Record<ClaveColor, boolean> = {
    asignado: l.asignaciones.some((a) => a.proveedor_id === p.proveedor_id),
    no_tiene: o?.estado === 'no_disponible',
    mejor_precio: !!o && esComparable(o) && mejor?.proveedor_id === p.proveedor_id && varias,
    mas_rapido: !!o && esComparable(o) && rapido?.proveedor_id === p.proveedor_id && o.dias !== null && varias,
    sobre_erp: v !== undefined && v > 0.05,
    erp_sin_confirmar: !!o && esComparable(o) && o.fuente === 'erp' && o.estado !== 'respondida',
  };
  for (const clave of ORDEN_COLOR) {
    const r = reglas.find((x) => x.clave === clave);
    if (r?.activa && cumple[clave]) return { color: r.color, clave, porque: `Se pinta porque ${REGLAS_COLOR[clave].porque}` };
  }
  return null;
}
