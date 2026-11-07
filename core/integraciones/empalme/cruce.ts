import { normalizarCodigo } from './utiles';

export interface Coincidencia<L, E> {
  clave: string;
  local: L;
  erp: E;
}

export type TipoAnomalia = 'ERP_CLAVE_DUPLICADA' | 'LOCAL_CLAVE_DUPLICADA' | 'ERP_SIN_CLAVE';

export interface Anomalia<L, E> {
  tipo: TipoAnomalia;
  clave: string | null;
  locales: L[];
  erp: E[];
  mensaje: string;
}

export interface ResultadoCruce<L, E> {
  /** Escenario A: existe en ambos lados con la misma clave. */
  coinciden: Coincidencia<L, E>[];
  /** Escenario B: existe en la aplicación pero no en el ERP. */
  soloLocal: L[];
  /** Escenario C: existe en el ERP pero no en la aplicación. */
  soloErp: E[];
  /** Registros locales sin clave (p. ej. provisionales sin código). NUNCA se cruzan por nombre. */
  sinClave: L[];
  /** Casos que una persona debe resolver; no se cruzan automáticamente. */
  anomalias: Anomalia<L, E>[];
}

/**
 * Cruza dos listas por una clave (por defecto, el código normalizado). Es una función pura:
 * no consulta ni escribe nada.
 *
 * Reglas de seguridad:
 *  - Una clave repetida en un lado (p. ej. dos códigos del ERP que solo difieren en mayúsculas) NO se cruza:
 *    se reporta como anomalía.
 *  - Los registros sin clave nunca se emparejan.
 */
export function cruzar<L, E>(
  locales: L[],
  externos: E[],
  claveLocal: (l: L) => unknown,
  claveErp: (e: E) => unknown,
  normalizar: (v: unknown) => string | null = normalizarCodigo,
): ResultadoCruce<L, E> {
  const mapaLocal = new Map<string, L[]>();
  const mapaErp = new Map<string, E[]>();
  const sinClave: L[] = [];
  const anomalias: Anomalia<L, E>[] = [];

  for (const l of locales) {
    const k = normalizar(claveLocal(l));
    if (k === null) sinClave.push(l);
    else mapaLocal.set(k, [...(mapaLocal.get(k) ?? []), l]);
  }
  for (const e of externos) {
    const k = normalizar(claveErp(e));
    if (k === null) {
      anomalias.push({ tipo: 'ERP_SIN_CLAVE', clave: null, locales: [], erp: [e], mensaje: 'Un registro del ERP no tiene código.' });
    } else mapaErp.set(k, [...(mapaErp.get(k) ?? []), e]);
  }

  const coinciden: Coincidencia<L, E>[] = [];
  const soloLocal: L[] = [];
  const soloErp: E[] = [];

  for (const [k, ls] of mapaLocal) {
    const es = mapaErp.get(k) ?? [];
    if (ls.length > 1) {
      anomalias.push({ tipo: 'LOCAL_CLAVE_DUPLICADA', clave: k, locales: ls, erp: es, mensaje: `Hay ${ls.length} registros locales con la clave "${k}".` });
    } else if (es.length > 1) {
      anomalias.push({ tipo: 'ERP_CLAVE_DUPLICADA', clave: k, locales: ls, erp: es, mensaje: `Hay ${es.length} registros del ERP con la clave "${k}" (difieren solo en mayúsculas o espacios).` });
    } else if (es.length === 1) {
      coinciden.push({ clave: k, local: ls[0], erp: es[0] });
    } else {
      soloLocal.push(ls[0]);
    }
  }
  for (const [k, es] of mapaErp) {
    if (mapaLocal.has(k)) continue;
    if (es.length > 1) {
      anomalias.push({ tipo: 'ERP_CLAVE_DUPLICADA', clave: k, locales: [], erp: es, mensaje: `Hay ${es.length} registros del ERP con la clave "${k}" (difieren solo en mayúsculas o espacios).` });
    } else soloErp.push(es[0]);
  }

  return { coinciden, soloLocal, soloErp, sinClave, anomalias };
}

export interface DefinicionComparacion {
  campo: string;
  /** Comparador propio; por defecto compara texto recortado con espacios colapsados, y números por valor. */
  igual?: (local: unknown, erp: unknown) => boolean;
}

export interface Diferencia {
  campo: string;
  local: unknown;
  erp: unknown;
}

const vacio = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

function igualPorDefecto(a: unknown, b: unknown): boolean {
  if (vacio(a) && vacio(b)) return true;
  if (vacio(a) || vacio(b)) return false;
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
  if (typeof a === 'boolean' || typeof b === 'boolean') return a === b;
  return String(a).trim().replace(/\s+/g, ' ') === String(b).trim().replace(/\s+/g, ' ');
}

/**
 * Compara los campos que manda el ERP entre el registro local y el homologado desde el ERP.
 * Devuelve solo lo que difiere (para mostrar una vista previa antes de actualizar la aplicación).
 */
export function diferenciar(
  local: Record<string, unknown>,
  desdeErp: Record<string, unknown>,
  campos: DefinicionComparacion[],
): Diferencia[] {
  const out: Diferencia[] = [];
  for (const c of campos) {
    if (!(c.campo in desdeErp)) continue; // el ERP no entregó un valor homologable: no se compara
    const igual = c.igual ?? igualPorDefecto;
    if (!igual(local[c.campo], desdeErp[c.campo])) out.push({ campo: c.campo, local: local[c.campo] ?? null, erp: desdeErp[c.campo] });
  }
  return out;
}
