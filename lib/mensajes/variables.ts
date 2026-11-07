/**
 * Variables de los mensajes ({contacto}, {whatsapp}…). La lista oficial (con su significado y ejemplo) vive en la base
 * de datos (`_mensaje_variables`, expuesta por la RPC `mensaje_variables`) y es la misma para Pedidos y Cuentas por
 * pagar. Aquí solo está la mecánica de reemplazo en pantalla, con el MISMO criterio que usa la base de datos:
 *   - variable conocida sin dato  → queda vacía
 *   - variable que no existe      → se deja tal cual (así se nota un error de escritura)
 */
export interface VariableDef {
  clave: string;
  etiqueta: string;
  grupo: string;
  ayuda: string;
  ejemplo: string;
  /** 'mensaje' = texto del mensaje; 'linea' = dentro de "cómo se ve cada factura"; 'erp' = descripción para el ERP. */
  ambito: 'mensaje' | 'linea' | 'erp';
}

/** Datos del proveedor y de quien envía que comparten Pedidos y Cuentas por pagar. */
export const CLAVES_PROVEEDOR = [
  'proveedor', 'contacto', 'primer_nombre', 'whatsapp', 'telefono', 'correo', 'nit', 'ciudad', 'empresa', 'usuario', 'saludo',
] as const;

export type ValoresVariables = Record<string, string>;

/** Un diccionario con todas las claves dadas en vacío: "conocida pero sin dato". */
export function varsVacias(claves: Iterable<string>): ValoresVariables {
  const o: ValoresVariables = {};
  for (const c of claves) o[c] = '';
  return o;
}

/** Primer nombre de un contacto ("Carlos Ramírez Gómez" → "Carlos"). */
export function primerNombre(contacto: string | null | undefined): string {
  return (contacto ?? '').trim().split(/\s+/)[0] ?? '';
}

export function reemplazarVariables(plantilla: string, valores: ValoresVariables): string {
  return plantilla.replace(/\{([a-z_]+)\}/g, (m, k: string) => (Object.prototype.hasOwnProperty.call(valores, k) ? valores[k] : m));
}

/** Marcadores escritos entre llaves que no existen (p. ej. {contacot}). */
export function variablesDesconocidas(texto: string, conocidas: Iterable<string>): string[] {
  const ok = new Set(conocidas);
  const malas = new Set<string>();
  for (const m of texto.matchAll(/\{([^{}]*)\}/g)) if (!ok.has(m[1])) malas.add(`{${m[1]}}`);
  return Array.from(malas);
}

/** Inserta `ins` en la posición del cursor (o la selección) y dice dónde dejar el cursor. */
export function insertarEnPosicion(texto: string, ini: number, fin: number, ins: string): { texto: string; cursor: number } {
  const a = Math.max(0, Math.min(ini, texto.length));
  const b = Math.max(a, Math.min(fin, texto.length));
  return { texto: texto.slice(0, a) + ins + texto.slice(b), cursor: a + ins.length };
}

/** Agrupa las variables por su grupo conservando el orden de aparición. */
export function agruparVariables(vars: VariableDef[]): { grupo: string; items: VariableDef[] }[] {
  const mapa = new Map<string, VariableDef[]>();
  for (const v of vars) {
    const l = mapa.get(v.grupo) ?? [];
    l.push(v);
    mapa.set(v.grupo, l);
  }
  return Array.from(mapa, ([grupo, items]) => ({ grupo, items }));
}
