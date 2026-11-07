import { tarifaDeImpuesto } from './inventarios';
import type { InventarioErp } from './inventarios';

/**
 * El catálogo de "tipos de impuesto de venta" NO trae la tarifa. Pero cada inventario ya existente en
 * World Office sí trae, junto a su tipo de impuesto, la tarifa del impuesto. Cruzando ambos datos se puede
 * OBSERVAR qué tarifas usa realmente cada tipo y proponerlo como candidato de equivalencia.
 *
 * Esto es evidencia para el administrador, nunca una decisión automática: dos tipos con la misma tarifa pueden
 * tener tratamiento tributario distinto (gravado 0 %, exento, excluido…), y un mismo tipo puede mostrar tarifas
 * distintas. En ambos casos se marca para decisión humana.
 */

const esObjeto = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);

export interface ObservacionTipoImpuesto {
  tipoId: string;
  nombre: string | null;
  tipo: string | null;
  /** Cuántos inventarios usan cada tarifa con este tipo. La tarifa se guarda tal cual la entrega el ERP (¿19 o 0.19?: lo confirma la sonda). */
  tarifas: { tarifa: number | null; inventarios: number }[];
  inventarios: number;
  veredicto: 'UNICA_TARIFA' | 'VARIAS_TARIFAS' | 'SIN_TARIFA_OBSERVADA';
}

export function observarTarifasPorTipoImpuesto(inventarios: InventarioErp[]): ObservacionTipoImpuesto[] {
  const acum = new Map<string, { nombre: string | null; tipo: string | null; porTarifa: Map<string, { tarifa: number | null; n: number }>; ids: Set<string> }>();

  for (const inv of inventarios) {
    const imps = Array.isArray(inv.datos.impuestos) ? inv.datos.impuestos : [];
    for (const imp of imps) {
      if (!esObjeto(imp)) continue;
      const t = imp.inventarioTipoImpuestoVenta;
      if (!esObjeto(t) || (typeof t.id !== 'number' && typeof t.id !== 'string')) continue;
      const k = String(t.id);
      const a = acum.get(k) ?? {
        nombre: typeof t.nombre === 'string' ? t.nombre : null,
        tipo: typeof t.tipo === 'string' ? t.tipo : null,
        porTarifa: new Map(),
        ids: new Set<string>(),
      };
      const tarifa = tarifaDeImpuesto(imp);
      const kt = String(tarifa);
      const fila = a.porTarifa.get(kt) ?? { tarifa, n: 0 };
      // Un inventario cuenta una sola vez por (tipo, tarifa)
      const marca = `${kt}#${String(inv.id)}`;
      if (!a.ids.has(marca)) {
        a.ids.add(marca);
        fila.n++;
      }
      a.porTarifa.set(kt, fila);
      acum.set(k, a);
    }
  }

  return [...acum.entries()]
    .map(([tipoId, a]): ObservacionTipoImpuesto => {
      const tarifas = [...a.porTarifa.values()].map((f) => ({ tarifa: f.tarifa, inventarios: f.n })).sort((x, y) => y.inventarios - x.inventarios);
      const conTarifa = tarifas.filter((t) => t.tarifa !== null);
      return {
        tipoId,
        nombre: a.nombre,
        tipo: a.tipo,
        tarifas,
        inventarios: new Set([...a.ids].map((m) => m.split('#')[1])).size,
        veredicto: conTarifa.length === 0 ? 'SIN_TARIFA_OBSERVADA' : conTarifa.length === 1 ? 'UNICA_TARIFA' : 'VARIAS_TARIFAS',
      };
    })
    .sort((x, y) => y.inventarios - x.inventarios);
}

/**
 * Para una tarifa local (p. ej. 0.19), devuelve los tipos de impuesto del ERP que la usan. `escala` indica cómo la entrega
 * el ERP; hay que fijarla tras la sonda (no se asume): 'porcentaje' (19) o 'fraccion' (0.19).
 * Si hay más de un candidato (o ninguno) la decisión es de una persona.
 */
export function candidatosParaTarifaLocal(
  tarifaLocal: number,
  observaciones: ObservacionTipoImpuesto[],
  escala: 'porcentaje' | 'fraccion',
): ObservacionTipoImpuesto[] {
  const objetivo = escala === 'porcentaje' ? tarifaLocal * 100 : tarifaLocal;
  return observaciones.filter((o) => o.tarifas.some((t) => t.tarifa !== null && Math.abs(t.tarifa - objetivo) < 1e-9));
}
