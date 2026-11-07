import type { EntradaCatalogo } from '../empalme';
import type { ClienteWorldOffice, OperacionId } from './cliente';
import { descargarTodo, type OpcionesListado } from './paginacion';

export type ClaveCatalogo = 'unidad' | 'clasificacion' | 'centro_costo' | 'grupo' | 'impuesto_venta' | 'contabilizacion';

const esObjeto = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);
const txt = (x: unknown): string | null => (typeof x === 'string' && x.trim() !== '' ? x : null);
const idDe = (x: unknown): string | number | null => (typeof x === 'number' || (typeof x === 'string' && x !== '') ? x : null);

export interface DefinicionCatalogo {
  clave: ClaveCatalogo;
  etiqueta: string;
  operacion: OperacionId;
  /** Convierte un registro del ERP en una entrada normalizada. null = registro inutilizable (sin id). */
  mapear: (registro: unknown) => EntradaCatalogo | null;
  /** true = la estructura documentada tiene contradicciones: confirmar con la sonda de contrato. */
  verificar?: string;
}

function entrada(r: unknown, campos: { codigo?: string; nombre: string; activo?: string; carpeta?: string; borrador?: string }): EntradaCatalogo | null {
  if (!esObjeto(r)) return null;
  const id = idDe(r.id);
  if (id === null) return null;
  const bool = (k?: string) => (k && typeof r[k] === 'boolean' ? (r[k] as boolean) : null);
  return {
    idErp: id,
    codigo: campos.codigo ? txt(r[campos.codigo]) : null,
    nombre: txt(r[campos.nombre]),
    activo: bool(campos.activo),
    esCarpeta: bool(campos.carpeta) ?? undefined,
    borrador: bool(campos.borrador) ?? undefined,
    payload: r,
  };
}

/**
 * Los seis catálogos que necesita ITEMS. TODOS son de solo lectura.
 * Los campos salen de la documentación; lo marcado `verificar` se confirma con la sonda.
 */
export const CATALOGOS: Record<ClaveCatalogo, DefinicionCatalogo> = {
  unidad: {
    clave: 'unidad',
    etiqueta: 'Unidades de medida',
    operacion: 'catalogo.unidades',
    mapear: (r) => entrada(r, { codigo: 'codigo', nombre: 'nombre' }),
  },
  clasificacion: {
    clave: 'clasificacion',
    etiqueta: 'Clasificaciones de inventario',
    operacion: 'catalogo.clasificaciones',
    mapear: (r) => entrada(r, { codigo: 'codigo', nombre: 'nombre' }),
    verificar: 'La documentación del listado copia campos de empresa; la consulta de inventario muestra {id, nombre, senAfectaCostoPromedio, senDeSistema}.',
  },
  centro_costo: {
    clave: 'centro_costo',
    etiqueta: 'Centros de costo',
    operacion: 'catalogo.centrosCosto',
    mapear: (r) => entrada(r, { codigo: 'codigo', nombre: 'nombre', activo: 'senActivo', carpeta: 'folder', borrador: 'borrador' }),
  },
  grupo: {
    clave: 'grupo',
    etiqueta: 'Grupos de inventario',
    operacion: 'catalogo.grupos',
    mapear: (r) => entrada(r, { codigo: 'codigo', nombre: 'nombreGrupo', activo: 'senActivo', carpeta: 'folder', borrador: 'borrador' }),
  },
  impuesto_venta: {
    clave: 'impuesto_venta',
    etiqueta: 'Tipos de impuesto de venta',
    operacion: 'catalogo.impuestosVenta',
    mapear: (r) => entrada(r, { nombre: 'nombre' }),
    verificar: 'No trae tarifa: la tarifa se observa en los inventarios existentes (ver impuestos.ts).',
  },
  contabilizacion: {
    clave: 'contabilizacion',
    etiqueta: 'Contabilizaciones',
    operacion: 'catalogo.contabilizaciones',
    mapear: (r) => entrada(r, { codigo: 'codigo', nombre: 'nombre' }),
  },
};

/** Descarga completa (todas las páginas) de un catálogo, sin duplicados por id. SOLO LECTURA. */
export async function descargarCatalogo(
  cliente: ClienteWorldOffice,
  clave: ClaveCatalogo,
  opciones?: OpcionesListado,
): Promise<{ entradas: EntradaCatalogo[]; descartados: number; total: number | null }> {
  const def = CATALOGOS[clave];
  const { registros, total } = await descargarTodo(cliente, def.operacion, opciones);
  const porId = new Map<string, EntradaCatalogo>();
  let descartados = 0;
  for (const r of registros) {
    const e = def.mapear(r);
    if (!e) descartados++;
    else porId.set(String(e.idErp), e);
  }
  return { entradas: [...porId.values()], descartados, total };
}
