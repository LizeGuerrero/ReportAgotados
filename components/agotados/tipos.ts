/** Tipos y constantes del módulo AGOTADOS (sin React: se pueden probar solos). */

export interface Fila {
  item_id: number;
  codigo: string | null;
  nombre_base: string;
  referencia: string | null;
  linea: string | null;
  sede: string | null;
  usuario: string | null;
  estado_comercial: 'solicitar_pedido' | null;
  fecha_estado: string | null;
  respuesta_compras: 'pedido_solicitado' | 'agotado_proveedor' | 'repartir_sedes' | 'no_se_pide' | null;
  fecha_respuesta: string | null;
  /** Motivo que escribió Compras cuando la respuesta es 'no_se_pide'. */
  motivo_compras: string | null;
  cantidad_sugerida: number | null;
  notas: string | null;
  fecha_nota: string | null;
  seguimiento: string | null;
  total: number;
}

export type Modo = 'empieza_primero' | 'solo_empieza' | 'contiene';

export interface ConfigBusqueda {
  modo: Modo;
  item: boolean;
  nombre: boolean;
  referencia: boolean;
}
export const BUSQUEDA_INICIAL: ConfigBusqueda = { modo: 'empieza_primero', item: true, nombre: true, referencia: true };
export const MODOS: { valor: Modo; texto: string }[] = [
  { valor: 'empieza_primero', texto: 'Primero las que empiezan por el texto, después el resto' },
  { valor: 'solo_empieza', texto: 'Solo las que empiezan por el texto' },
  { valor: 'contiene', texto: 'Todas las que contienen el texto, en orden alfabético' },
];

export const RESPUESTAS: Record<string, string> = {
  pedido_solicitado: 'Pedido solicitado a proveedor',
  agotado_proveedor: 'Agotado en proveedor',
  repartir_sedes: 'Repartir entre sedes',
  no_se_pide: 'No se pide',
};
export const RESPUESTA_INSIGNIA: Record<string, string> = {
  pedido_solicitado: 'ui-badge--success',
  agotado_proveedor: 'ui-badge--danger',
  repartir_sedes: 'ui-badge--violet',
  no_se_pide: 'ui-badge--warning',
};

/** «No se pide: baja rotación» — el motivo viaja con la respuesta para que la sede entienda por qué. */
export const textoRespuesta = (f: { respuesta_compras: string | null; motivo_compras: string | null }) =>
  f.respuesta_compras
    ? RESPUESTAS[f.respuesta_compras] + (f.respuesta_compras === 'no_se_pide' && f.motivo_compras ? `: ${f.motivo_compras}` : '')
    : '';

export const OPCIONES_POR_PAGINA = [25, 50, 100, 200];
export const LOTE_COPIA = 200; // máximo que acepta listar_agotados por llamada
export const MAX_COPIA = 5000; // tope de «copiar todo» para no colgar el navegador

// Claves que entiende listar_agotados(p_orden).
export type ClaveOrden =
  | 'item' | 'nombre' | 'referencia' | 'linea' | 'sede' | 'usuario' | 'solicitud'
  | 'fecha_solicitud' | 'respuesta' | 'fecha_respuesta' | 'cantidad' | 'nota'
  | 'fecha_nota' | 'seguimiento';
export type Direccion = 'asc' | 'desc';
export interface Orden {
  clave: ClaveOrden;
  dir: Direccion;
}

export const formatoNumero = (n: number) => n.toLocaleString('es-CO');
export const limitar = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function fecha(valor: string | null) {
  if (!valor) return '';
  return new Date(valor).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Bogota' });
}

// ---------- Columnas ----------

/**
 * Las columnas se reparten en bloques. Un usuario puede ocultarlas y reordenarlas, pero solo dentro de su bloque:
 * así las bandas de grupo («Solicitud», «Respuesta de Compras»…) siguen mostrando columnas contiguas.
 */
export type Bloque = 'ident' | 'g-solicitud' | 'g-respuesta' | 'g-nota' | 'seg' | 'acc';

export interface Columna {
  clave: string;
  titulo: string;
  bloque: Bloque;
  /** Si existe, el encabezado es ordenable con esa clave. */
  orden?: ClaveOrden;
  /** Texto de la celda tal como se ve; es lo que se copia al portapapeles. */
  texto?: (f: Fila) => string;
  /** No se puede ocultar (sin ella no se identifica la fila o no se puede actuar). */
  esencial?: boolean;
  /** Valor de la celda que es número o fecha: se alinea distinto. */
  tipo?: 'num' | 'fecha';
}

export const COLUMNAS: Columna[] = [
  { clave: 'item', titulo: 'Item', bloque: 'ident', orden: 'item', tipo: 'num', texto: (f) => f.codigo ?? String(f.item_id) },
  { clave: 'nombre', titulo: 'Nombre Base', bloque: 'ident', orden: 'nombre', esencial: true, texto: (f) => f.nombre_base },
  { clave: 'referencia', titulo: 'Referencia', bloque: 'ident', orden: 'referencia', texto: (f) => f.referencia ?? '' },
  { clave: 'linea', titulo: 'Línea', bloque: 'ident', orden: 'linea', texto: (f) => f.linea ?? '' },
  { clave: 'sede', titulo: 'Sede', bloque: 'g-solicitud', orden: 'sede', texto: (f) => f.sede ?? '' },
  { clave: 'usuario', titulo: 'Usuario', bloque: 'g-solicitud', orden: 'usuario', texto: (f) => f.usuario ?? '' },
  { clave: 'solicitud', titulo: 'Solicitud', bloque: 'g-solicitud', orden: 'solicitud', texto: (f) => (f.estado_comercial !== null ? 'Solicitar pedido' : '') },
  { clave: 'fecha_solicitud', titulo: 'Fecha solicitud', bloque: 'g-solicitud', orden: 'fecha_solicitud', tipo: 'fecha', texto: (f) => fecha(f.fecha_estado) },
  { clave: 'respuesta', titulo: 'Respuesta Compras', bloque: 'g-respuesta', orden: 'respuesta', texto: (f) => textoRespuesta(f) },
  { clave: 'fecha_respuesta', titulo: 'Fecha respuesta', bloque: 'g-respuesta', orden: 'fecha_respuesta', tipo: 'fecha', texto: (f) => fecha(f.fecha_respuesta) },
  { clave: 'cantidad', titulo: 'Cant. sugerida', bloque: 'g-nota', orden: 'cantidad', tipo: 'num', texto: (f) => f.cantidad_sugerida?.toString() ?? '' },
  { clave: 'nota', titulo: 'Nota', bloque: 'g-nota', orden: 'nota', texto: (f) => f.notas ?? '' },
  { clave: 'fecha_nota', titulo: 'Fecha nota', bloque: 'g-nota', orden: 'fecha_nota', tipo: 'fecha', texto: (f) => fecha(f.fecha_nota) },
  { clave: 'seguimiento', titulo: 'Seguimiento', bloque: 'seg', orden: 'seguimiento', texto: (f) => f.seguimiento ?? '' },
  // «Acción» son botones, no datos: no tiene `texto`, así que nunca se copia.
  { clave: 'accion', titulo: 'Acción', bloque: 'acc', esencial: true },
];
export const COLUMNA_DE: Record<string, Columna> = Object.fromEntries(COLUMNAS.map((c) => [c.clave, c]));

/** Grupos plegables (como el «esquema» de Excel). */
export interface Grupo {
  clave: Bloque;
  titulo: string;
  columnas: string[];
}
export const GRUPOS: Grupo[] = [
  { clave: 'g-solicitud', titulo: 'Solicitud', columnas: ['sede', 'usuario', 'solicitud', 'fecha_solicitud'] },
  { clave: 'g-respuesta', titulo: 'Respuesta de Compras', columnas: ['respuesta', 'fecha_respuesta'] },
  { clave: 'g-nota', titulo: 'Cantidad y notas', columnas: ['cantidad', 'nota', 'fecha_nota'] },
];
export const GRUPO_DE: Record<string, Grupo> = Object.fromEntries(
  GRUPOS.flatMap((g) => g.columnas.map((c) => [c, g] as const)),
);

export const TITULO_BLOQUE: Record<Bloque, string> = {
  ident: 'Identificación del ítem',
  'g-solicitud': 'Solicitud',
  'g-respuesta': 'Respuesta de Compras',
  'g-nota': 'Cantidad y notas',
  seg: 'Seguimiento',
  acc: 'Acción',
};

// Ancho inicial (px) de cada columna; las claves g-* son la columna resumen de un grupo plegado.
export const ANCHO_DEFECTO: Record<string, number> = {
  item: 84, nombre: 260, referencia: 150, linea: 130, sede: 130, usuario: 150, solicitud: 150,
  fecha_solicitud: 140, respuesta: 230, fecha_respuesta: 140, cantidad: 110, nota: 260,
  fecha_nota: 140, seguimiento: 140, accion: 150,
  'g-solicitud': 150, 'g-respuesta': 180, 'g-nota': 150,
};
export const ANCHO_MIN = 60;
export const ANCHO_MAX = 600;
export const ALTO_MIN = 24;
export const ALTO_MAX = 400;
export const ANCHO_GUTTER = 48;
export const MAX_CONGELAR = 3;
