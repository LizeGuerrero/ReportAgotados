import type { ClienteWorldOffice } from './cliente';
import { WorldOfficeError, respuestaInesperada } from './errores';
import { descargarTodo, type OpcionesListado } from './paginacion';

const esObjeto = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);
const sub = (o: unknown, k: string): unknown => (esObjeto(o) ? o[k] : undefined);
const txt = (x: unknown): string | null => (typeof x === 'string' && x !== '' ? x : null);
const idValido = (x: unknown): string | number | null => (typeof x === 'number' || (typeof x === 'string' && x !== '') ? x : null);

/**
 * Inventario del ERP ya normalizado. `datos` es el objeto original del ERP más campos derivados
 * (`tipoImpuestoVentaId`, `impuestosAmbiguos`, `tarifasVenta`); los diccionarios leen de `datos`.
 */
export interface InventarioErp {
  id: string | number;
  codigo: string | null;
  datos: Record<string, unknown>;
}

/**
 * Extrae la entidad de una respuesta. La documentación muestra tres formas para un inventario
 * (INC-05): `data: {…}`, `data: [ … ]` / `content: [ … ]`. Se aceptan todas.
 */
export function extraerEntidad(cuerpo: unknown): Record<string, unknown> | null {
  if (!esObjeto(cuerpo)) return null;
  const candidatos: unknown[] = [cuerpo.data, esObjeto(cuerpo.data) ? cuerpo.data.content : undefined, cuerpo.content, cuerpo];
  for (const c of candidatos) {
    if (Array.isArray(c)) {
      if (esObjeto(c[0])) return c[0];
    } else if (esObjeto(c) && ('id' in c || 'codigo' in c)) return c;
  }
  return null;
}

/**
 * Tarifa de un impuesto de un inventario. Confirmado con la sonda real: `impuesto.tarifa` viene vacío y la tarifa
 * está en `valor` (texto, como FRACCIÓN: "0.19", "0"). Se acepta `valor` numérico o en texto; si no hay, `impuesto.tarifa`.
 */
export function tarifaDeImpuesto(imp: unknown): number | null {
  const v = sub(imp, 'valor');
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v.trim().replace(',', '.')))) return Number(v.trim().replace(',', '.'));
  const t = sub(sub(imp, 'impuesto'), 'tarifa');
  return typeof t === 'number' && Number.isFinite(t) ? t : null;
}

/** Añade los campos derivados que no vienen planos en el ERP. No altera el resto. */
export function normalizarInventario(entidad: Record<string, unknown>): InventarioErp | null {
  const id = idValido(entidad.id);
  if (id === null) return null;
  const impuestos = Array.isArray(entidad.impuestos) ? entidad.impuestos : [];
  const tipos = new Map<string, string | number>();
  const tarifas: number[] = [];
  for (const imp of impuestos) {
    const tipoId = idValido(sub(sub(imp, 'inventarioTipoImpuestoVenta'), 'id'));
    if (tipoId !== null) tipos.set(String(tipoId), tipoId);
    const t = tarifaDeImpuesto(imp);
    if (t !== null) tarifas.push(t);
  }
  const unicos = [...tipos.values()];
  return {
    id,
    codigo: txt(entidad.codigo),
    datos: {
      ...entidad,
      // Solo hay un "tipo de impuesto de venta" si el inventario tiene exactamente uno; si hay varios no se adivina.
      tipoImpuestoVentaId: unicos.length === 1 ? unicos[0] : null,
      impuestosAmbiguos: unicos.length > 1,
      tarifasVenta: tarifas,
    },
  };
}

export async function listarInventarios(
  cliente: ClienteWorldOffice,
  opciones?: OpcionesListado,
): Promise<{ inventarios: InventarioErp[]; descartados: number; total: number | null }> {
  const { registros, total } = await descargarTodo(cliente, 'inventarios.listar', opciones);
  const inventarios: InventarioErp[] = [];
  let descartados = 0;
  for (const r of registros) {
    const n = esObjeto(r) ? normalizarInventario(r) : null;
    if (n) inventarios.push(n);
    else descartados++;
  }
  return { inventarios, descartados, total };
}

/** Consulta por código. Devuelve null solo si World Office responde 404 (no existe). Cualquier otro error se propaga. */
export async function consultarPorCodigo(cliente: ClienteWorldOffice, codigo: string): Promise<InventarioErp | null> {
  try {
    const { cuerpo } = await cliente.ejecutar('inventarios.consultarCodigo', { parametros: { codigo } });
    const e = extraerEntidad(cuerpo);
    const n = e ? normalizarInventario(e) : null;
    if (!n) throw respuestaInesperada('inventarios.consultarCodigo', 'no se pudo leer el inventario');
    return n;
  } catch (e) {
    if (e instanceof WorldOfficeError && e.status === 404) return null;
    throw e;
  }
}

export async function consultarPorId(cliente: ClienteWorldOffice, id: string | number): Promise<InventarioErp | null> {
  try {
    const { cuerpo } = await cliente.ejecutar('inventarios.consultarId', { parametros: { id } });
    const e = extraerEntidad(cuerpo);
    const n = e ? normalizarInventario(e) : null;
    if (!n) throw respuestaInesperada('inventarios.consultarId', 'no se pudo leer el inventario');
    return n;
  } catch (e) {
    if (e instanceof WorldOfficeError && e.status === 404) return null;
    throw e;
  }
}

/** Campos que acepta World Office al crear/editar un inventario (documentación INV-14 / INV-16). */
export const CAMPOS_ESCRITURA = [
  'id',
  'codigo',
  'descripcion',
  'idUnidadMedida',
  'senActivo',
  'idInventarioClasificacion',
  'idCentroCosto',
  'idInventarioGrupo',
  'idInventarioTipoImpuestoVenta',
  'idContabilizacion',
] as const;
export type CampoEscritura = (typeof CAMPOS_ESCRITURA)[number];

/** Convierte un inventario leído del ERP en el cuerpo de escritura equivalente (objeto COMPLETO). */
export function cuerpoEscrituraDesde(inv: InventarioErp): Record<CampoEscritura, unknown> {
  const d = inv.datos;
  const idDe = (k: string) => idValido(sub(d[k], 'id'));
  return {
    id: inv.id,
    codigo: inv.codigo,
    descripcion: txt(d.descripcion),
    idUnidadMedida: idDe('unidadMedida'),
    senActivo: typeof d.senActivo === 'boolean' ? d.senActivo : true,
    idInventarioClasificacion: idDe('inventarioClasificacion'),
    idCentroCosto: idDe('centroCosto'),
    idInventarioGrupo: idDe('grupo'),
    idInventarioTipoImpuestoVenta: idValido(d.tipoImpuestoVentaId),
    idContabilizacion: idDe('contabilizacion'),
  };
}

/**
 * Arma el cuerpo de una EDICIÓN: parte del inventario actual del ERP y le aplica SOLO los cambios indicados.
 * La documentación no aclara si el PUT reemplaza o fusiona; por eso siempre se envía el objeto completo
 * (así un campo que no queremos cambiar nunca se borra ni se pone en su valor por defecto).
 * Rechaza claves que World Office no acepta y cambios de `id`.
 */
export function combinarParaEdicion(actual: InventarioErp, cambios: Record<string, unknown>): Record<CampoEscritura, unknown> {
  const permitidas = new Set<string>(CAMPOS_ESCRITURA);
  const base = cuerpoEscrituraDesde(actual);
  for (const [k, v] of Object.entries(cambios)) {
    if (!permitidas.has(k)) throw new Error(`Campo no permitido en la edición: ${k}`);
    if (k === 'id' && String(v) !== String(actual.id)) throw new Error('No se puede cambiar el id del inventario');
    (base as Record<string, unknown>)[k] = v;
  }
  return base;
}

export interface ResultadoEscritura {
  status: number;
  /** null si World Office respondió 2xx pero no se pudo leer el inventario (la escritura SÍ ocurrió: verificar con consultarPorCodigo). */
  inventario: InventarioErp | null;
}

/** Crea un inventario. UNA sola llamada, sin reintentos. El llamador debe haber comprobado antes con consultarPorCodigo. */
export async function crearInventario(cliente: ClienteWorldOffice, cuerpo: Record<string, unknown>): Promise<ResultadoEscritura> {
  if ('id' in cuerpo && cuerpo.id) throw new Error('Al crear no se envía id');
  const { status, cuerpo: resp } = await cliente.ejecutar('inventarios.crear', { cuerpo });
  const e = extraerEntidad(resp);
  return { status, inventario: e ? normalizarInventario(e) : null };
}

/** Edita un inventario (el cuerpo debe ser el objeto completo; ver combinarParaEdicion). UNA sola llamada. */
export async function editarInventario(
  cliente: ClienteWorldOffice,
  id: string | number,
  cuerpo: Record<string, unknown>,
): Promise<ResultadoEscritura> {
  const { status, cuerpo: resp } = await cliente.ejecutar('inventarios.editar', { parametros: { id }, cuerpo });
  const e = extraerEntidad(resp);
  return { status, inventario: e ? normalizarInventario(e) : null };
}
