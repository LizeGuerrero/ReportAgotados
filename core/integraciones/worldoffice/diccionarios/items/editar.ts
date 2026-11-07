import type { Correspondencia, Diccionario } from '../../../empalme';

/**
 * ITEMS · app → World Office · PUT /api/v1/inventarios/editarInventario/{id}
 *
 * Solo contiene los campos que la aplicación puede cambiar en el ERP. Los demás campos del cuerpo
 * (clasificación, centro de costo, grupo, contabilización) NO se toman de la configuración de la
 * organización —eso pisaría valores que ya tiene el ítem en World Office—, sino del propio inventario del ERP:
 * ver `combinarParaEdicion` en ../../inventarios.ts, que siempre envía el objeto completo.
 */
const EP = 'PUT /api/v1/inventarios/editarInventario/{id}';

const base = { origenApp: 'items', endpoint: EP, confirmado: false } as const;

const correspondencias: Correspondencia[] = [
  {
    ...base,
    obligatorio: true,
    campoApp: 'wo_id',
    campoErp: 'id',
    tipoApp: 'entero',
    tipoErp: 'id',
    etiqueta: 'Id en World Office',
    validaciones: [{ tipo: 'obligatorio', mensaje: 'El ítem no está vinculado a World Office (falta su id).' }],
    estado: 'HOMOLOGADO',
    propietario: 'erp',
    observaciones: 'Viene de la tabla de vínculo (no de `items`). También va en la ruta.',
  },
  {
    ...base,
    obligatorio: true,
    campoApp: 'codigo_erp',
    campoErp: 'codigo',
    tipoApp: 'texto',
    tipoErp: 'texto',
    etiqueta: 'Código',
    transformacion: [{ nombre: 'texto' }],
    validaciones: [
      { tipo: 'obligatorio' },
      { tipo: 'longitudMax', max: 40 },
      { tipo: 'patron', patron: '^[A-Za-z0-9][A-Za-z0-9._-]*$', mensaje: 'Código: solo letras, números, punto, guion y guion bajo, y debe empezar con letra o número' },
    ],
    estado: 'REQUIERE_ADAPTACION',
    propietario: 'erp',
  },
  {
    ...base,
    obligatorio: true,
    campoApp: 'nombre_base',
    campoErp: 'descripcion',
    tipoApp: 'texto',
    tipoErp: 'texto',
    etiqueta: 'Nombre',
    transformacion: [{ nombre: 'texto' }],
    validaciones: [{ tipo: 'obligatorio' }, { tipo: 'longitudMax', max: 300 }],
    estado: 'REQUIERE_ADAPTACION',
    propietario: 'erp',
  },
  {
    ...base,
    obligatorio: true,
    campoApp: 'unidad_medida',
    campoErp: 'idUnidadMedida',
    tipoApp: 'texto',
    tipoErp: 'id',
    etiqueta: 'Unidad de medida',
    transformacion: [{ nombre: 'texto' }, { nombre: 'equivalencia', params: { catalogo: 'unidad', nombreCatalogo: 'unidades de medida' } }],
    validaciones: [{ tipo: 'obligatorio' }],
    estado: 'REQUIERE_ADAPTACION',
    propietario: 'erp',
    observaciones: 'World Office rechaza el cambio de unidad si el ítem ya se usó en documentos (ERROR_UNIDAD_DE_MEDIDA).',
  },
  {
    ...base,
    obligatorio: true,
    campoApp: 'iva',
    campoErp: 'idInventarioTipoImpuestoVenta',
    tipoApp: 'numero',
    tipoErp: 'id',
    etiqueta: 'IVA de venta',
    transformacion: [{ nombre: 'numeroNormalizado', params: { decimales: 4 } }, { nombre: 'equivalencia', params: { catalogo: 'impuesto_venta', nombreCatalogo: 'impuestos de venta' } }],
    validaciones: [{ tipo: 'obligatorio' }],
    estado: 'REQUIERE_ADAPTACION',
    propietario: 'erp',
  },
  {
    ...base,
    obligatorio: false,
    campoApp: 'activo',
    campoErp: 'senActivo',
    tipoApp: 'booleano',
    tipoErp: 'booleano',
    etiqueta: 'Activo',
    transformacion: [{ nombre: 'booleano' }],
    estado: 'HOMOLOGADO',
    propietario: 'erp',
  },
];

export const DICCIONARIO_EDITAR_ITEMS: Diccionario = {
  id: 'worldoffice.items.editar',
  modulo: 'items',
  sentido: 'app_a_erp',
  endpoint: EP,
  version: 1,
  correspondencias,
};
