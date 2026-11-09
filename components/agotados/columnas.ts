import { COLUMNAS, GRUPO_DE, GRUPOS, MAX_CONGELAR, type Columna } from './tipos';

/** Ordena las columnas según la preferencia del usuario, sin sacarlas de su bloque. Lo que no esté en `orden` conserva su lugar. */
export function ordenarColumnas(columnas: Columna[], orden: string[]): Columna[] {
  if (orden.length === 0) return columnas;
  const pos = new Map(orden.map((k, i) => [k, i]));
  const bloques: string[] = [];
  columnas.forEach((c) => {
    if (!bloques.includes(c.bloque)) bloques.push(c.bloque);
  });
  return bloques.flatMap((b) => {
    const del = columnas.map((c, i) => ({ c, i })).filter((x) => x.c.bloque === b);
    del.sort((a, z) => (pos.get(a.c.clave) ?? 1e6 + a.i) - (pos.get(z.c.clave) ?? 1e6 + z.i));
    return del.map((x) => x.c);
  });
}

export interface ColumnasResueltas {
  /** Columnas de datos que se ven (sin plegar), en orden. */
  visibles: Columna[];
  /** Claves de las columnas de la tabla: un grupo plegado ocupa una sola, `g-…`, donde estaba su primera columna visible. */
  claves: string[];
  /** Cuántas columnas visibles tiene cada grupo (para la banda). */
  visiblesPorGrupo: Record<string, number>;
}

export function resolverColumnas(ocultas: string[], orden: string[], plegados: string[]): ColumnasResueltas {
  const visibles = ordenarColumnas(
    COLUMNAS.filter((c) => c.esencial || !ocultas.includes(c.clave)),
    orden,
  );
  const claves: string[] = [];
  const visto = new Set<string>();
  const visiblesPorGrupo: Record<string, number> = {};
  for (const c of visibles) {
    const g = GRUPO_DE[c.clave];
    if (!g) {
      claves.push(c.clave);
      continue;
    }
    visiblesPorGrupo[g.clave] = (visiblesPorGrupo[g.clave] ?? 0) + 1;
    if (!plegados.includes(g.clave)) claves.push(c.clave);
    else if (!visto.has(g.clave)) {
      visto.add(g.clave);
      claves.push(g.clave);
    }
  }
  return { visibles, claves, visiblesPorGrupo };
}

/** Cuántas columnas se pueden congelar: nunca más de las que hay al inicio sin pertenecer a un grupo. */
export function maxCongelables(claves: string[]): number {
  let n = 0;
  for (const k of claves) {
    if (k.startsWith('g-') || GRUPO_DE[k]) break;
    n += 1;
  }
  return Math.min(MAX_CONGELAR, n);
}

/** Texto de una celda tal como se ve; un grupo plegado resume las columnas visibles que esconde. */
export function textoCeldaDe(
  f: Parameters<NonNullable<Columna['texto']>>[0],
  clave: string,
  ocultas: string[],
): string {
  const g = GRUPOS.find((x) => x.clave === clave);
  if (g) {
    return g.columnas
      .filter((k) => !ocultas.includes(k))
      .map((k) => COLUMNAS.find((c) => c.clave === k)?.texto?.(f) ?? '')
      .filter(Boolean)
      .join(' · ');
  }
  return COLUMNAS.find((c) => c.clave === clave)?.texto?.(f) ?? '';
}
