import type { CSSProperties, ReactNode } from 'react';

export type AjusteTexto = 'puntos' | 'cortar' | 'ajustar';
export type Densidad = 'compacta' | 'normal' | 'amplia';

/** Máximo de filas en pantalla con scroll infinito: protege el rendimiento de la base y del navegador. */
export const MAX_FILAS_INFINITO = 500;
export const OPCIONES_POR_PAGINA = [25, 50, 100, 200];
export const MAX_CONGELAR = 3;

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
  v: 1;
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
  verTramos: boolean;
  /** Marcar una fila al tocar cualquier parte de ella (más fácil que apuntar a la casilla). */
  clicFila: boolean;
}

export function prefsPorDefecto(ocultas: string[] = []): PrefsHoja {
  return {
    v: 1,
    anchos: {},
    ocultas,
    contraidos: [],
    ajuste: 'puntos',
    ajustes: {},
    densidad: 'normal',
    modo: 'paginas',
    porPagina: 50,
    congelar: 0,
    verTramos: true,
    clicFila: true,
  };
}
