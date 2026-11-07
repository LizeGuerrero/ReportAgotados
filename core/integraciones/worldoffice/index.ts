// API pública del conector de World Office (solo servidor).
export { ClienteWorldOffice, OPERACIONES, URL_BASE_WORLD_OFFICE, normalizarToken } from './cliente';
export type { OperacionId, OpcionesCliente, FetchLike, RespuestaWO } from './cliente';
export { WorldOfficeError, normalizarError } from './errores';
export { descargarTodo, extraerPagina, construirCuerpoListado } from './paginacion';
export type { OpcionesListado, ModoPaginacion } from './paginacion';
export { CATALOGOS, descargarCatalogo } from './catalogos';
export type { ClaveCatalogo, DefinicionCatalogo } from './catalogos';
export {
  listarInventarios,
  consultarPorCodigo,
  consultarPorId,
  crearInventario,
  editarInventario,
  extraerEntidad,
  normalizarInventario,
  tarifaDeImpuesto,
  cuerpoEscrituraDesde,
  combinarParaEdicion,
  CAMPOS_ESCRITURA,
} from './inventarios';
export type { InventarioErp, ResultadoEscritura } from './inventarios';
export { observarTarifasPorTipoImpuesto, candidatosParaTarifaLocal } from './impuestos';
export type { ObservacionTipoImpuesto } from './impuestos';
export { DICCIONARIO_CREAR_ITEMS } from './diccionarios/items/crear';
export { DICCIONARIO_EDITAR_ITEMS } from './diccionarios/items/editar';
export {
  DICCIONARIO_CONSULTAR_ITEMS,
  crearDiccionarioConsultarItems,
  CAMPOS_ITEM_QUE_MANDA_EL_ERP,
} from './diccionarios/items/consultar';
