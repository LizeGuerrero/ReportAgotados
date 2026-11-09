import type { CSSProperties, ReactNode } from 'react';

export type AjusteTexto = 'puntos' | 'cortar' | 'ajustar';
export type Alineacion = 'izq' | 'centro' | 'der';
export type OrdenResto = 'vencidos' | 'vencimiento' | 'nombre';
export const ORDENES_RESTO: { valor: OrdenResto; texto: string }[] = [
  { valor: 'vencidos', texto: 'Lo que coincide arriba · luego el resto de lo vencido (el más atrasado primero) · luego lo demás por fecha de vencimiento' },
  { valor: 'vencimiento', texto: 'Lo que coincide arriba · luego todo lo demás por fecha de vencimiento' },
  { valor: 'nombre', texto: 'Lo que coincide arriba · luego todo lo demás por nombre del proveedor' },
];
export type Densidad = 'compacta' | 'normal' | 'amplia';

/** Máximo de filas en pantalla con scroll infinito: protege el rendimiento de la base y del navegador. */
export const MAX_FILAS_INFINITO = 500;
export const OPCIONES_POR_PAGINA = [25, 50, 100, 200];
export const MAX_CONGELAR = 4;
/** Máximo de columnas de datos fijadas a la derecha (además de Acciones, que siempre queda fija). */
export const MAX_CONGELAR_DER = 3;
export const ANCHO_MIN_PREF = 40;
export const ANCHO_MAX_PREF = 900;

export interface GrupoHoja {
  clave: string;
  titulo: string;
}

export interface ColumnaHoja<T> {
  clave: string;
  titulo: string;
  /** Grupo al que pertenece. Las columnas de un mismo grupo deben ir seguidas. */
  grupo: string;
  /** Ancho inicial en píxeles. */
  ancho: number;
  min?: number;
  alinear?: 'izq' | 'der';
  /** Valor numérico (pesos) que se copia cuando el usuario elige «copiar como entero». Solo columnas de dinero. */
  copia?: (fila: T) => number | null | undefined;
  /** Nombre de la columna de orden en la base de datos; si no hay, no se ordena por ella. */
  orden?: string;
  /** Columna que sigue visible cuando se contrae el grupo. */
  resumen?: boolean;
  /** Texto largo: admite puntos suspensivos, cortar o ajustar. */
  ajustable?: boolean;
  render: (fila: T) => ReactNode;
  /** Texto completo al pasar el mouse (útil cuando se corta). */
  tooltip?: (fila: T) => string | null | undefined;
  /** Estilo de la casilla según la fila (por ejemplo, el color de los días vencidos). */
  estiloCelda?: (fila: T) => CSSProperties | undefined;
}

export interface PrefsHoja {
  v: 2;
  anchos: Record<string, number>;
  /** Columnas que el usuario no quiere ver. */
  ocultas: string[];
  /** Grupos contraídos (solo se ve su columna principal). */
  contraidos: string[];
  ajuste: AjusteTexto;
  ajustes: Record<string, AjusteTexto>;
  densidad: Densidad;
  modo: 'paginas' | 'infinito';
  porPagina: number;
  /** Cuántas columnas se quedan fijas a la izquierda al desplazarse. */
  congelar: number;
  /** Columnas de datos que se quedan fijas a la derecha (junto a Acciones). */
  fijasDer: string[];
  /** Alineación elegida por columna (si no hay, se usa la de la columna). */
  alineaciones: Record<string, Alineacion>;
  /** Orden elegido de las columnas dentro de cada grupo (los grupos no se mezclan entre sí). */
  orden: string[];
  verTramos: boolean;
  /** Marcar una fila al tocar cualquier parte de ella (más fácil que apuntar a la casilla). */
  clicFila: boolean;
  /** Escala del color de «Días venc.»: relativa a lo que se ve (blanco → rojo) o fija en 90 días. */
  escalaDias: 'relativa' | 'fija';
  /** Qué hace la búsqueda: filtrar (oculta lo que no coincide) u ordenar (lo que coincide arriba, nada se oculta). */
  busqueda: 'filtrar' | 'ordenar';
  /** Con «ordenar»: cómo se ordena lo que NO coincide. */
  ordenResto: OrdenResto;
}

export function prefsPorDefecto(ocultas: string[] = []): PrefsHoja {
  return {
    v: 2,
    anchos: {},
    ocultas,
    contraidos: [],
    ajuste: 'puntos',
    ajustes: {},
    densidad: 'normal',
    modo: 'paginas',
    porPagina: 50,
    congelar: 0,
    fijasDer: [],
    alineaciones: {},
    orden: [],
    verTramos: true,
    clicFila: true,
    escalaDias: 'relativa',
    busqueda: 'filtrar',
    ordenResto: 'vencidos',
  };
}

/** Preferencias de CXP que no dependen de la pantalla (valen para Cartera, Excluidas y Pagados). */
export type ModoCopiado = 'entero' | 'moneda';
/** Posición y tamaño de la ventana flotante de totales por proveedor (en píxeles de la pantalla). */
export interface GeometriaVentana {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface PrefsGeneral {
  v: 1;
  ventanaTotales?: GeometriaVentana;
  /** entero: «1500000» · moneda: «$ 1.500.000» (lo que se ve en pantalla). */
  copiado: ModoCopiado;
}
export const PREFS_GENERAL_POR_DEFECTO: PrefsGeneral = { v: 1, copiado: 'entero' };

/**
 * Aplica el orden elegido por el usuario. Las columnas de un mismo grupo siguen juntas: el orden solo se
 * reparte dentro de cada grupo (los encabezados de grupo dependen de eso). Lo que no esté en `orden` conserva su lugar.
 */
export function aplicarOrden<C extends { clave: string; grupo: string }>(columnas: C[], orden: string[]): C[] {
  if (orden.length === 0) return columnas;
  const pos = new Map(orden.map((k, i) => [k, i]));
  const grupos: string[] = [];
  columnas.forEach((c) => {
    if (!grupos.includes(c.grupo)) grupos.push(c.grupo);
  });
  return grupos.flatMap((g) => {
    const del = columnas.map((c, i) => ({ c, i })).filter((x) => x.c.grupo === g);
    del.sort((a, b) => (pos.get(a.c.clave) ?? 1e6 + a.i) - (pos.get(b.c.clave) ?? 1e6 + b.i));
    return del.map((x) => x.c);
  });
}
