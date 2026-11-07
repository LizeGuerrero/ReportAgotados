/**
 * Errores del conector de World Office. Mensajes pensados para mostrarse al usuario.
 * NUNCA incluyen el token ni el cuerpo de la petición.
 */

export type FormatoError = 'ApiResponse' | 'ProblemDetail' | 'texto' | 'red' | 'respuesta_inesperada';

/** Códigos de negocio documentados para inventarios → explicación en español. */
const MENSAJES_NEGOCIO: Record<string, string> = {
  ERROR_UNIDAD_INVENTARIO: 'La unidad de medida enviada no está registrada en World Office.',
  ERROR_INVENTARIO_CLASIFICACION: 'La clasificación de inventario enviada no está registrada en World Office.',
  ERROR_INVENTARIO_TIPO_IMPUESTO_VENTA: 'El tipo de impuesto de venta enviado no está registrado en World Office.',
  ERROR_CONTABILIZACION_NO_REGISTRADA: 'La contabilización enviada no está registrada en World Office.',
  ERROR_CANTIDAD_MAXIMA_CARACTERES_PERMITIDOS: 'El código del ítem supera la longitud máxima que permite World Office.',
  ERROR_UNIDAD_DE_MEDIDA: 'No se puede cambiar la unidad de medida: el ítem ya se usó en documentos de World Office.',
};

export class WorldOfficeError extends Error {
  readonly status: number;
  readonly codigo: string | null;
  readonly formato: FormatoError;
  /** Detalle técnico devuelto por el ERP (moreInfo / detail), sin datos sensibles. */
  readonly detalle: string | null;
  /** true si repetir la MISMA lectura puede funcionar (5xx, 429, red). Nunca implica reintentar una escritura. */
  readonly reintentable: boolean;

  constructor(p: { mensaje: string; status: number; codigo?: string | null; formato: FormatoError; detalle?: string | null; reintentable?: boolean }) {
    super(p.mensaje);
    this.name = 'WorldOfficeError';
    this.status = p.status;
    this.codigo = p.codigo ?? null;
    this.formato = p.formato;
    this.detalle = p.detalle ?? null;
    this.reintentable = p.reintentable ?? false;
  }
}

const esObjeto = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);
const txt = (x: unknown): string | null => (typeof x === 'string' && x.trim() !== '' ? x.trim() : null);

/** Convierte cualquiera de las dos formas de error de World Office (ApiResponse o ProblemDetail) en un WorldOfficeError. */
export function normalizarError(status: number, cuerpo: unknown): WorldOfficeError {
  let formato: FormatoError = 'texto';
  let codigo: string | null = null;
  let detalle: string | null = null;
  let mensajeApi: string | null = null;

  if (esObjeto(cuerpo)) {
    if ('userMessage' in cuerpo || 'errorCode' in cuerpo || 'developerMessage' in cuerpo) {
      formato = 'ApiResponse';
      codigo = txt(cuerpo.errorCode);
      mensajeApi = txt(cuerpo.userMessage);
      detalle = txt(cuerpo.moreInfo);
    } else if ('title' in cuerpo || 'detail' in cuerpo || 'type' in cuerpo) {
      formato = 'ProblemDetail';
      mensajeApi = txt(cuerpo.title);
      detalle = txt(cuerpo.detail);
      const props = esObjeto(cuerpo.properties) ? cuerpo.properties : {};
      codigo = txt(props.errorCode) ?? txt(props.codigo);
    } else if (txt(cuerpo.message)) {
      mensajeApi = txt(cuerpo.message); // p. ej. el 401 de la guía: {status, error, message, path}
    } else if (txt(cuerpo.texto)) {
      detalle = txt(cuerpo.texto);
    }
  }

  const negocio = codigo ? MENSAJES_NEGOCIO[codigo] : undefined;
  let mensaje: string;
  if (status === 401) mensaje = 'World Office rechazó el token (ausente, inválido o vencido). Un administrador debe actualizarlo.';
  else if (status === 403) mensaje = 'El token no tiene permisos para este servicio de World Office.';
  else if (status === 404) mensaje = negocio ?? mensajeApi ?? 'World Office no encontró el registro solicitado.';
  else if (status === 429) mensaje = 'World Office limitó las peticiones: intenta de nuevo en unos minutos.';
  else if (status >= 500) mensaje = 'World Office no pudo procesar la petición (error del servidor). Intenta de nuevo más tarde.';
  else mensaje = negocio ?? mensajeApi ?? `World Office rechazó la petición (HTTP ${status}).`;

  return new WorldOfficeError({
    mensaje,
    status,
    codigo,
    formato,
    detalle,
    reintentable: status === 429 || status >= 500,
  });
}

export function errorDeRed(causa: unknown, tiempoAgotado: boolean): WorldOfficeError {
  const base = tiempoAgotado ? 'World Office no respondió a tiempo.' : 'No se pudo conectar con World Office.';
  return new WorldOfficeError({
    mensaje: base,
    status: 0,
    formato: 'red',
    // Solo el tipo de error, nunca el mensaje completo (podría contener la URL con datos).
    detalle: causa instanceof Error ? causa.name : null,
    reintentable: true,
  });
}

export function respuestaInesperada(operacion: string, que: string): WorldOfficeError {
  return new WorldOfficeError({
    mensaje: `Respuesta inesperada de World Office en ${operacion}: ${que}.`,
    status: 200,
    formato: 'respuesta_inesperada',
  });
}
