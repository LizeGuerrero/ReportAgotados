/**
 * Motor genérico de empalme (homologación de datos entre nuestra aplicación y un ERP).
 *
 * Este directorio NO conoce ningún ERP concreto ni ningún módulo de negocio: solo define qué es una
 * correspondencia, cómo se valida y cómo se transforma un dato. Las correspondencias reales de cada
 * módulo/endpoint viven en diccionarios aparte (p. ej. core/integraciones/worldoffice/diccionarios/items).
 *
 * Código puro (sin React, sin Supabase, sin red): se puede probar sin ninguna dependencia.
 */

/** Estado de homologación de cada correspondencia. */
export type EstadoHomologacion =
  | 'HOMOLOGADO' //              existe correspondencia confirmada
  | 'REQUIERE_ADAPTACION' //     existe el dato, pero debe transformarse / validarse
  | 'FALTA_EN_APP' //            el ERP exige información que nuestra aplicación no tiene
  | 'NO_APLICA' //               el campo no tiene correspondencia necesaria
  | 'PENDIENTE_DOCUMENTACION'; // no hay información suficiente para confirmarla

/** app_a_erp: arma lo que se envía al ERP. erp_a_app: arma lo que se guarda en nuestra aplicación. */
export type Sentido = 'app_a_erp' | 'erp_a_app';

/** Quién manda sobre el dato: si hay diferencias, el propietario es la referencia. */
export type Propietario = 'erp' | 'app' | 'config';

export type TipoDato = 'texto' | 'entero' | 'numero' | 'booleano' | 'id';

export type ReglaValidacion =
  /** Se evalúa sobre el dato de origen, antes de transformarlo. */
  | { tipo: 'obligatorio'; mensaje?: string }
  /** Las siguientes se evalúan sobre el dato ya transformado. Nunca se recorta: si no cabe, es un error. */
  | { tipo: 'longitudMax'; max: number; mensaje?: string }
  | { tipo: 'patron'; patron: string; mensaje: string }
  | { tipo: 'rango'; min?: number; max?: number; mensaje?: string }
  | { tipo: 'entero'; mensaje?: string };

export interface PasoTransformacion {
  nombre: string;
  params?: Record<string, unknown>;
}

export type ValorPredeterminado =
  /** Valor elegido explícitamente por la organización (configuración). Si no existe, se reporta como faltante. */
  | { origen: 'config'; clave: string; mensajeFaltante: string }
  /** Constante documentada por el ERP (no arbitraria). */
  | { origen: 'constante'; valor: unknown };

/** Una fila del diccionario de correspondencias. */
export interface Correspondencia {
  /** Clave en nuestro objeto (ruta con puntos). null si la aplicación no tiene ese dato. */
  campoApp: string | null;
  /** Esquema o tabla de origen en nuestra aplicación (informativo). */
  origenApp: string;
  /** Clave en el objeto del ERP (ruta con puntos). */
  campoErp: string;
  /** Endpoint donde se usa, p. ej. "POST /api/v1/inventarios/crearInventario". */
  endpoint: string;
  tipoApp: TipoDato | null;
  tipoErp: TipoDato;
  obligatorio: boolean;
  /** false = la obligatoriedad solo está en la prosa de la documentación, no en un esquema formal. */
  confirmado: boolean;
  transformacion?: PasoTransformacion[];
  valorPredeterminado?: ValorPredeterminado;
  validaciones?: ReglaValidacion[];
  estado: EstadoHomologacion;
  propietario: Propietario;
  /** Nombre legible para los mensajes al usuario. */
  etiqueta?: string;
  observaciones?: string;
}

export interface Diccionario {
  /** Identificador único, p. ej. "worldoffice.items.crear". */
  id: string;
  /** Módulo de negocio al que pertenece (p. ej. "items"). */
  modulo: string;
  sentido: Sentido;
  endpoint: string;
  version: number;
  correspondencias: Correspondencia[];
}

/** Algo que la organización debe resolver (configuración o equivalencia) antes de poder continuar. */
export interface Faltante {
  tipo: 'config' | 'equivalencia' | 'dato';
  campo: string;
  /** Mensaje listo para mostrar. */
  mensaje: string;
  catalogo?: string;
  valorLocal?: string;
  clave?: string;
}

export interface ErrorCampo {
  campo: string;
  mensaje: string;
}

export interface ResultadoMotor {
  /** true solo si no hay errores ni faltantes: el payload puede enviarse / guardarse. */
  ok: boolean;
  payload: Record<string, unknown>;
  errores: ErrorCampo[];
  faltantes: Faltante[];
  advertencias: string[];
  /** Correspondencias que no se procesaron (NO_APLICA, pendientes de documentación…). */
  omitidos: { campo: string; motivo: string }[];
}

// ---------------------------------------------------------------- equivalencias

export type EstadoEquivalencia = 'CONFIRMADA' | 'PROPUESTA' | 'REVISAR' | 'SIN_EQUIVALENCIA';

export interface ResultadoEquivalencia {
  estado: EstadoEquivalencia;
  /** Identificador del ERP (aErp) */
  idErp?: string | number;
  /** Valor en nuestra aplicación (aLocal) */
  valorLocal?: string;
}

/**
 * Resuelve valores entre nuestra aplicación y el ERP. El almacenamiento (tabla por organización) se inyecta:
 * el motor no sabe de dónde salen las equivalencias.
 */
export interface ResolutorEquivalencias {
  aErp(catalogo: string, valorLocal: string): ResultadoEquivalencia;
  aLocal(catalogo: string, idErp: string | number): ResultadoEquivalencia;
}

// ---------------------------------------------------------------- transformaciones

export interface ContextoMotor {
  /** Configuración de la organización (predeterminados elegidos por el administrador). */
  config: Record<string, unknown>;
  equivalencias: ResolutorEquivalencias;
  /** Transformaciones adicionales o que reemplazan a las base. */
  transformaciones?: Record<string, Transformacion>;
}

export interface ContextoPaso {
  ctx: ContextoMotor;
  campo: string;
}

export type ResultadoPaso =
  | { ok: true; valor: unknown }
  | { ok: false; error: string }
  | { ok: false; faltante: Omit<Faltante, 'campo'> };

export type Transformacion = (
  valor: unknown,
  params: Record<string, unknown>,
  paso: ContextoPaso,
) => ResultadoPaso;
