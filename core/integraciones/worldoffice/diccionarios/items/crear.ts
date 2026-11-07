import type { Correspondencia, Diccionario } from '../../../empalme';

/**
 * ITEMS · app → World Office · POST /api/v1/inventarios/crearInventario
 *
 * Es CONFIGURACIÓN: no contiene lógica de negocio. El motor genérico la interpreta.
 *
 * Obligatoriedad: la documentación solo la indica en prosa (los seis IDs + código y descripción);
 * el esquema formal no se guardó. Por eso `confirmado: false` hasta que la sonda de contrato lo verifique.
 * Los IDs que la aplicación no tiene (clasificación, centro de costo, grupo, contabilización) salen de la
 * configuración de la organización y NUNCA de un valor arbitrario: si no están elegidos, se reportan como faltante.
 */
const EP = 'POST /api/v1/inventarios/crearInventario';

const MSG = (que: string) => `Falta elegir ${que} predeterminado(a) de la organización (Configuración › World Office).`;

const base = {
  origenApp: 'items',
  endpoint: EP,
  obligatorio: true,
  confirmado: false,
} as const;

const correspondencias: Correspondencia[] = [
  {
    ...base,
    campoApp: 'codigo_erp',
    campoErp: 'codigo',
    tipoApp: 'texto',
    tipoErp: 'texto',
    etiqueta: 'Código',
    transformacion: [{ nombre: 'texto' }],
    validaciones: [
      { tipo: 'obligatorio', mensaje: 'Código: es obligatorio (un ítem provisional no tiene código: asígnalo antes de enviarlo)' },
      { tipo: 'longitudMax', max: 40 },
      { tipo: 'patron', patron: '^[A-Za-z0-9][A-Za-z0-9._-]*$', mensaje: 'Código: solo letras, números, punto, guion y guion bajo, y debe empezar con letra o número' },
    ],
    estado: 'REQUIERE_ADAPTACION',
    propietario: 'erp',
    observaciones: 'Reglas locales (≤ 40, patrón) validadas aquí; el límite real de World Office está sin documentar (ERROR_CANTIDAD_MAXIMA_CARACTERES_PERMITIDOS).',
  },
  {
    ...base,
    campoApp: 'nombre_base',
    campoErp: 'descripcion',
    tipoApp: 'texto',
    tipoErp: 'texto',
    etiqueta: 'Nombre',
    transformacion: [{ nombre: 'texto' }],
    validaciones: [{ tipo: 'obligatorio' }, { tipo: 'longitudMax', max: 300 }],
    estado: 'REQUIERE_ADAPTACION',
    propietario: 'erp',
    observaciones: 'descripcion_2 no se concatena (decisión de negocio pendiente). Longitud máxima en World Office: sin documentar.',
  },
  {
    ...base,
    campoApp: 'unidad_medida',
    campoErp: 'idUnidadMedida',
    tipoApp: 'texto',
    tipoErp: 'id',
    etiqueta: 'Unidad de medida',
    transformacion: [{ nombre: 'texto' }, { nombre: 'equivalencia', params: { catalogo: 'unidad', nombreCatalogo: 'unidades de medida' } }],
    validaciones: [{ tipo: 'obligatorio', mensaje: 'Unidad de medida: es obligatoria para crear el ítem en World Office' }],
    estado: 'REQUIERE_ADAPTACION',
    propietario: 'erp',
    observaciones: 'Texto libre → id de GLO-14 mediante equivalencia confirmada por organización. Inmutable en World Office si el ítem ya se usó.',
  },
  {
    ...base,
    campoApp: 'iva',
    campoErp: 'idInventarioTipoImpuestoVenta',
    tipoApp: 'numero',
    tipoErp: 'id',
    etiqueta: 'IVA de venta',
    transformacion: [{ nombre: 'numeroNormalizado', params: { decimales: 4 } }, { nombre: 'equivalencia', params: { catalogo: 'impuesto_venta', nombreCatalogo: 'impuestos de venta' } }],
    validaciones: [{ tipo: 'obligatorio', mensaje: 'IVA de venta: es obligatorio para crear el ítem en World Office' }],
    estado: 'REQUIERE_ADAPTACION',
    propietario: 'erp',
    observaciones: 'Tarifa local (fracción) → tipo de impuesto de venta (INV-07). La misma tarifa NO implica el mismo tratamiento tributario: cada equivalencia la confirma un administrador.',
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
    observaciones: 'El Swagger lo incluye en el cuerpo; la prosa no lo describe.',
  },
  {
    ...base,
    campoApp: null,
    campoErp: 'idInventarioClasificacion',
    tipoApp: null,
    tipoErp: 'id',
    etiqueta: 'Clasificación de inventario',
    valorPredeterminado: { origen: 'config', clave: 'clasificacion_id', mensajeFaltante: MSG('la clasificación de inventario') },
    estado: 'FALTA_EN_APP',
    propietario: 'config',
    observaciones: 'Define producto/servicio y si afecta el costo promedio. Se elige de la lista real de World Office (INV-02).',
  },
  {
    ...base,
    campoApp: null,
    campoErp: 'idCentroCosto',
    tipoApp: null,
    tipoErp: 'id',
    etiqueta: 'Centro de costo',
    valorPredeterminado: { origen: 'config', clave: 'centro_costo_id', mensajeFaltante: MSG('el centro de costo') },
    estado: 'FALTA_EN_APP',
    propietario: 'config',
    observaciones: 'Se elige de la lista real de World Office (GLO-01).',
  },
  {
    ...base,
    campoApp: null,
    campoErp: 'idInventarioGrupo',
    tipoApp: null,
    tipoErp: 'id',
    etiqueta: 'Grupo de inventario',
    valorPredeterminado: { origen: 'config', clave: 'grupo_inventario_id', mensajeFaltante: MSG('el grupo de inventario') },
    estado: 'FALTA_EN_APP',
    propietario: 'config',
    observaciones: 'El campo local `grupo` NO se asume equivalente (solo informativo en la app). Si el negocio lo confirma, se agrega una equivalencia de grupos.',
  },
  {
    ...base,
    campoApp: null,
    campoErp: 'idContabilizacion',
    tipoApp: null,
    tipoErp: 'id',
    etiqueta: 'Contabilización',
    valorPredeterminado: { origen: 'config', clave: 'contabilizacion_id', mensajeFaltante: MSG('la contabilización') },
    estado: 'FALTA_EN_APP',
    propietario: 'config',
    observaciones: 'El campo local `grupo_contable` NO se asume equivalente. Se elige de la lista real de World Office (CNT-04).',
  },
  // ---- Campos de la aplicación sin correspondencia en este endpoint (documentación de la matriz) ----
  ...(['linea', 'codigo_linea', 'categoria', 'grupo', 'grupo_contable', 'marca', 'descripcion_2', 'notas', 'informacion_tecnica', 'aplicacion_tecnica'] as const).map(
    (campo): Correspondencia => ({
      ...base,
      obligatorio: false,
      campoApp: campo,
      campoErp: '(sin equivalente)',
      tipoApp: 'texto',
      tipoErp: 'texto',
      estado: 'NO_APLICA',
      propietario: 'app',
      observaciones: 'Dato propio de la aplicación: la sincronización nunca lo envía ni lo sobrescribe.',
    }),
  ),
];

export const DICCIONARIO_CREAR_ITEMS: Diccionario = {
  id: 'worldoffice.items.crear',
  modulo: 'items',
  sentido: 'app_a_erp',
  endpoint: EP,
  version: 1,
  correspondencias,
};
