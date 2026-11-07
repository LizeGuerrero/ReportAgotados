// API pública del motor genérico de empalme.
export * from './tipos';
export { aplicarDiccionario, validarDiccionario } from './motor';
export { TRANSFORMACIONES_BASE } from './transformaciones';
export { validar } from './validadores';
export {
  resolutorEnMemoria,
  proponerEquivalencias,
  valoresSinEquivalencia,
  equivalenciasAfectadasPorCatalogo,
} from './equivalencias';
export type { FilaEquivalencia, EntradaCatalogo, PropuestaEquivalencia } from './equivalencias';
export { cruzar, diferenciar } from './cruce';
export type { ResultadoCruce, Coincidencia, Anomalia, Diferencia, DefinicionComparacion } from './cruce';
export { ESTADOS_INTEGRACION, puedeTransicionar, esEstadoIntegracion, estadoTrasEvaluar } from './estados';
export type { EstadoIntegracion } from './estados';
export { diccionarioAMarkdown } from './documentacion';
export { normalizarCodigo, normalizarTexto, numeroCanonico, leerRuta, escribirRuta } from './utiles';
