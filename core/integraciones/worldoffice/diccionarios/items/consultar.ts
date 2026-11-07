import type { Correspondencia, Diccionario } from '../../../empalme';

/**
 * ITEMS · World Office → app · lectura (consultaCodigo / listarInventarios)
 *
 * Define lo que se puede incorporar a la aplicación (ítems que solo existen en el ERP) y lo que se actualiza en
 * ítems ya vinculados. El ERP manda sobre: código, nombre, unidad, IVA de venta y estado activo.
 * NUNCA toca los campos propios de la aplicación (línea, marca, notas, logística, proveedores…).
 *
 * `campoErp` lee del inventario normalizado (ver normalizarInventario): rutas del objeto del ERP más los
 * derivados `tipoImpuestoVentaId`, `impuestosAmbiguos` y `tarifasVenta`.
 */
const EP = 'POST /api/v1/inventarios/listarInventarios · GET /api/v1/inventarios/consultaCodigo/{codigo}';

export interface OpcionesConsultarItems {
  /**
   * true (por defecto): un ítem del ERP sin un IVA único resuelto NO se importa. Evita crear ítems con IVA vacío,
   * que hacen que la cotización use IVA 0 sin avisar. Decisión de negocio pendiente de confirmar.
   */
  ivaObligatorio?: boolean;
}

const base = { origenApp: 'items', endpoint: EP, confirmado: false } as const;

const sinApp = (campoErp: string, observaciones: string): Correspondencia => ({
  ...base,
  obligatorio: false,
  campoApp: null,
  campoErp,
  tipoApp: null,
  tipoErp: 'texto',
  estado: 'NO_APLICA',
  propietario: 'erp',
  observaciones,
});

export function crearDiccionarioConsultarItems(opciones: OpcionesConsultarItems = {}): Diccionario {
  const ivaObligatorio = opciones.ivaObligatorio ?? true;

  const correspondencias: Correspondencia[] = [
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
        { tipo: 'obligatorio', mensaje: 'Código: el ítem de World Office no tiene código' },
        { tipo: 'longitudMax', max: 40, mensaje: 'Código: supera los 40 caracteres que admite la aplicación (no se recorta)' },
        { tipo: 'patron', patron: '^[A-Za-z0-9][A-Za-z0-9._-]*$', mensaje: 'Código: el código de World Office tiene caracteres que la aplicación no admite (solo letras, números, punto, guion y guion bajo)' },
      ],
      estado: 'REQUIERE_ADAPTACION',
      propietario: 'erp',
      observaciones: 'Si el código no cumple las reglas locales el ítem queda como "no importable"; la regla local no se cambia sin aprobación.',
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
      campoErp: 'unidadMedida.id',
      tipoApp: 'texto',
      tipoErp: 'id',
      etiqueta: 'Unidad de medida',
      transformacion: [{ nombre: 'equivalenciaInversa', params: { catalogo: 'unidad', nombreCatalogo: 'unidades de medida' } }],
      validaciones: [{ tipo: 'obligatorio' }],
      estado: 'REQUIERE_ADAPTACION',
      propietario: 'erp',
      observaciones: 'El texto local de la unidad lo define la equivalencia confirmada por la organización (no se inventa a partir del nombre del ERP).',
    },
    {
      ...base,
      obligatorio: ivaObligatorio,
      campoApp: 'iva',
      campoErp: 'tipoImpuestoVentaId',
      tipoApp: 'numero',
      tipoErp: 'id',
      etiqueta: 'IVA de venta',
      transformacion: [
        { nombre: 'equivalenciaInversa', params: { catalogo: 'impuesto_venta', nombreCatalogo: 'impuestos de venta' } },
        { nombre: 'cadenaANumero' },
      ],
      // La regla "obligatorio" solo se declara si el IVA es obligatorio: declararla siempre lo volvería obligatorio.
      validaciones: ivaObligatorio
        ? [
            {
              tipo: 'obligatorio',
              mensaje: 'IVA de venta: el ítem de World Office no tiene un único tipo de impuesto de venta (ninguno o varios); no se puede determinar el IVA.',
            },
          ]
        : [],
      estado: 'REQUIERE_ADAPTACION',
      propietario: 'erp',
      observaciones: 'Equivalencia confirmada por organización: tipo de impuesto → tarifa local. Si el ítem tiene varios impuestos se reporta, no se adivina.',
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
    // ---- Datos del ERP que se conservan solo como referencia (snapshot del vínculo), sin campo en `items` ----
    sinApp('inventarioClasificacion.id', 'Se guarda en el snapshot del vínculo.'),
    sinApp('centroCosto.id', 'Se guarda en el snapshot del vínculo.'),
    sinApp('grupo.id', 'Se guarda en el snapshot del vínculo; no se asume equivalente a `grupo` de la app.'),
    sinApp('contabilizacion.id', 'Se guarda en el snapshot del vínculo; no se asume equivalente a `grupo_contable`.'),
    sinApp('codigoInternacional', 'Sin campo en la aplicación.'),
    sinApp('senFacturarSinExistencias', 'Sin campo en la aplicación; escritura no documentada.'),
    sinApp('senManejaSeriales', 'Sin campo en la aplicación; escritura no documentada.'),
    sinApp('senManejaLotes', 'Sin campo en la aplicación; escritura no documentada.'),
    sinApp('utilidadEstimada', 'Sin campo en la aplicación; escritura no documentada.'),
  ];

  return { id: 'worldoffice.items.consultar', modulo: 'items', sentido: 'erp_a_app', endpoint: EP, version: 1, correspondencias };
}

export const DICCIONARIO_CONSULTAR_ITEMS: Diccionario = crearDiccionarioConsultarItems();

/** Campos de `items` que manda el ERP y que se comparan para detectar diferencias. */
export const CAMPOS_ITEM_QUE_MANDA_EL_ERP = ['codigo_erp', 'nombre_base', 'unidad_medida', 'iva', 'activo'] as const;
