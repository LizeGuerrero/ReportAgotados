/** Utilidades puras compartidas por el motor. */

/** Lee una ruta con puntos ("unidadMedida.id") de un objeto. Devuelve undefined si no existe. */
export function leerRuta(obj: unknown, ruta: string): unknown {
  let actual: unknown = obj;
  for (const parte of ruta.split('.')) {
    if (actual === null || typeof actual !== 'object') return undefined;
    actual = (actual as Record<string, unknown>)[parte];
  }
  return actual;
}

/** Escribe una ruta con puntos creando los objetos intermedios. */
export function escribirRuta(obj: Record<string, unknown>, ruta: string, valor: unknown): void {
  const partes = ruta.split('.');
  let actual = obj;
  for (let i = 0; i < partes.length - 1; i++) {
    const p = partes[i];
    const sig = actual[p];
    if (sig === null || typeof sig !== 'object') actual[p] = {};
    actual = actual[p] as Record<string, unknown>;
  }
  actual[partes[partes.length - 1]] = valor;
}

export function esVacio(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

/**
 * Clave de comparación para CÓDIGOS: minúsculas y sin espacios en los extremos. Es exactamente la regla del
 * índice único de nuestra base (lower(btrim(codigo_erp))). No quita tildes ni cambia nada más.
 */
export function normalizarCodigo(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().toLowerCase();
  return s === '' ? null : s;
}

/** Clave de comparación para TEXTOS de catálogo (unidades, nombres): minúsculas, sin tildes, espacios colapsados. */
export function normalizarTexto(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Número canónico como cadena (0.1900 → "0.19", "0,05" → "0.05"). null si no es un número válido. */
export function numeroCanonico(v: unknown, decimales = 4): string | null {
  if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const f = 10 ** decimales;
  return String(Math.round(n * f) / f);
}
