/**
 * Estado de integración de un registro con el ERP.
 * Es independiente de cualquier estado funcional de la aplicación (p. ej. `provisional` en ítems).
 */
export const ESTADOS_INTEGRACION = [
  'API_PENDIENTE', //            aún no se ha cruzado con el ERP
  'SINCRONIZADO', //             vinculado y sin diferencias
  'DIFERENCIAS', //              vinculado, pero los datos del ERP y de la app difieren
  'REQUIERE_CONFIGURACION', //   faltan equivalencias o valores predeterminados de la organización
  'LISTO_PARA_ENVIAR', //        validado: puede crearse en el ERP
  'ENVIANDO', //                 hay una llamada en curso (bloqueo contra doble clic)
  'ERROR_VALIDACION', //         el dato no cumple las reglas
  'ERROR_API', //                el ERP respondió con error o no respondió
] as const;

export type EstadoIntegracion = (typeof ESTADOS_INTEGRACION)[number];

const ERRORES: EstadoIntegracion[] = ['API_PENDIENTE', 'REQUIERE_CONFIGURACION', 'LISTO_PARA_ENVIAR', 'SINCRONIZADO', 'DIFERENCIAS', 'ERROR_VALIDACION'];

const TRANSICIONES: Record<EstadoIntegracion, EstadoIntegracion[]> = {
  API_PENDIENTE: ['SINCRONIZADO', 'DIFERENCIAS', 'REQUIERE_CONFIGURACION', 'LISTO_PARA_ENVIAR', 'ERROR_VALIDACION'],
  REQUIERE_CONFIGURACION: ['API_PENDIENTE', 'LISTO_PARA_ENVIAR', 'SINCRONIZADO', 'DIFERENCIAS', 'ERROR_VALIDACION'],
  LISTO_PARA_ENVIAR: ['ENVIANDO', 'REQUIERE_CONFIGURACION', 'ERROR_VALIDACION', 'API_PENDIENTE'],
  ENVIANDO: ['SINCRONIZADO', 'DIFERENCIAS', 'ERROR_API', 'ERROR_VALIDACION', 'API_PENDIENTE'],
  SINCRONIZADO: ['DIFERENCIAS', 'ENVIANDO', 'REQUIERE_CONFIGURACION'],
  DIFERENCIAS: ['SINCRONIZADO', 'ENVIANDO', 'REQUIERE_CONFIGURACION'],
  ERROR_VALIDACION: ERRORES,
  ERROR_API: ERRORES,
};

export function puedeTransicionar(desde: EstadoIntegracion, hacia: EstadoIntegracion): boolean {
  return desde === hacia || TRANSICIONES[desde].includes(hacia);
}

export function esEstadoIntegracion(v: unknown): v is EstadoIntegracion {
  return typeof v === 'string' && (ESTADOS_INTEGRACION as readonly string[]).includes(v);
}

/** Estado que corresponde tras evaluar un registro (sin llamar al ERP). */
export function estadoTrasEvaluar(p: {
  vinculado: boolean;
  hayDiferencias: boolean;
  erroresDeDatos: number;
  faltantes: number;
}): EstadoIntegracion {
  if (p.vinculado) return p.hayDiferencias ? 'DIFERENCIAS' : 'SINCRONIZADO';
  if (p.erroresDeDatos > 0) return 'ERROR_VALIDACION';
  if (p.faltantes > 0) return 'REQUIERE_CONFIGURACION';
  return 'LISTO_PARA_ENVIAR';
}
