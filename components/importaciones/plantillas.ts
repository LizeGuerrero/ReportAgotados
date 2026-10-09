import { crearXlsx } from '@/components/importaciones/archivo';

export type TipoCarga = 'proveedores' | 'items' | 'item_proveedor';

export interface CampoCarga {
  clave: string;
  titulo: string;
  obligatorio: boolean;
  /** Se guarda como texto en la plantilla para no perder ceros a la izquierda. */
  texto?: boolean;
  alias: string[];
  descripcion: string;
  ejemplo: string;
}

export interface DefCarga {
  tipo: TipoCarga;
  nombre: string;
  disponible: boolean;
  resumen: string;
  campos: CampoCarga[];
  reglas: string[];
  archivo: string;
}

export const DEFINICIONES: DefCarga[] = [
  {
    tipo: 'proveedores',
    nombre: 'Proveedores',
    disponible: true,
    archivo: 'plantilla-proveedores.xlsx',
    resumen: 'Crea proveedores nuevos y actualiza los existentes (se identifican por tipo y número de documento).',
    campos: [
      { clave: 'tipo_documento', titulo: 'Tipo de documento', obligatorio: false, texto: true,
        alias: ['tipo', 'tipodedocumento', 'tipoid', 'tipoidentificacion', 'tipodeidentificacion'],
        descripcion: 'NIT, CC, CE, PAS u OTRO. Si lo dejas vacío se usa NIT.', ejemplo: 'NIT' },
      { clave: 'numero_documento', titulo: 'Número de documento', obligatorio: true, texto: true,
        alias: ['numerodocumento', 'documento', 'nit', 'identificacion', 'numeroidentificacion', 'nitproveedor', 'cedula'],
        descripcion: 'Sin puntos, guiones ni dígito de verificación (3 a 20 letras o números).', ejemplo: '900123456' },
      { clave: 'nombre', titulo: 'Nombre', obligatorio: true,
        alias: ['razonsocial', 'proveedor', 'nombreproveedor', 'nombredelproveedor'],
        descripcion: 'Obligatorio cuando el proveedor es nuevo.', ejemplo: 'Distribuidora Andina S.A.S.' },
      { clave: 'contacto', titulo: 'Contacto', obligatorio: false,
        alias: ['nombrecontacto', 'contactoprincipal'], descripcion: 'Persona de contacto.', ejemplo: 'Laura Gómez' },
      { clave: 'telefono', titulo: 'Teléfono', obligatorio: false, texto: true,
        alias: ['tel', 'celular', 'telefonocontacto'], descripcion: 'Teléfono o celular.', ejemplo: '3001234567' },
      { clave: 'email', titulo: 'Correo', obligatorio: false,
        alias: ['correo', 'correoelectronico', 'mail'], descripcion: 'Correo electrónico.', ejemplo: 'ventas@andina.co' },
      { clave: 'notas', titulo: 'Notas', obligatorio: false,
        alias: ['observaciones', 'comentarios', 'nota'], descripcion: 'Cualquier observación.', ejemplo: '' },
      { clave: 'cobra_iva', titulo: 'Cobra IVA', obligatorio: false,
        alias: ['cobraiva', 'responsableiva'], descripcion: 'Sí o No. Vacío = en proveedores nuevos Sí; en existentes no cambia.', ejemplo: 'Sí' },
      { clave: 'iva_compra', titulo: 'IVA de compra', obligatorio: false,
        alias: ['ivacompra', 'tarifaiva', 'porcentajeiva', 'iva'],
        descripcion: 'Porcentaje: 19, 19% o 0,19. Vacío = en proveedores nuevos 19 %; en existentes no cambia.', ejemplo: '19' },
    ],
    reglas: [
      'Un proveedor se identifica por su tipo y número de documento. Si ya existe, se actualiza; si no, se crea.',
      'Una celda vacía NUNCA borra el dato que ya existe en el sistema.',
      'Si el mismo documento aparece dos veces en el archivo, la segunda fila se marca con error.',
      'Las filas con error no se cargan; el resto sí. Puedes descargar un archivo con los errores para corregirlos.',
    ],
  },
  { tipo: 'items', nombre: 'Ítems', disponible: false, archivo: '', resumen: 'Próximamente.', campos: [], reglas: [] },
  { tipo: 'item_proveedor', nombre: 'Ítems por proveedor (referencias)', disponible: false, archivo: '', resumen: 'Próximamente.', campos: [], reglas: [] },
];

export const definicion = (tipo: TipoCarga) => DEFINICIONES.find((d) => d.tipo === tipo)!;

/** Minúsculas, sin tildes ni símbolos: "Número de documento" → "numerodedocumento". */
export const normalizar = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

/** Propone qué columna del archivo corresponde a cada campo (el usuario puede corregirlo). */
export function mapeoAutomatico(def: DefCarga, columnas: string[]): Record<string, number | null> {
  const usadas = new Set<number>();
  const out: Record<string, number | null> = {};
  for (const c of def.campos) {
    const buscados = new Set([normalizar(c.clave), normalizar(c.titulo), ...c.alias]);
    const idx = columnas.findIndex((col, i) => !usadas.has(i) && buscados.has(normalizar(col)));
    out[c.clave] = idx >= 0 ? idx : null;
    if (idx >= 0) usadas.add(idx);
  }
  return out;
}

export function plantillaXlsx(def: DefCarga): Uint8Array {
  const datos = [def.campos.map((c) => c.titulo + (c.obligatorio ? ' *' : '')), def.campos.map((c) => c.ejemplo)];
  const instrucciones: (string | number)[][] = [
    ['Columna', '¿Obligatoria?', 'Qué escribir', 'Ejemplo'],
    ...def.campos.map((c) => [c.titulo, c.obligatorio ? 'Sí' : 'No', c.descripcion, c.ejemplo]),
    [''],
    ['Reglas'],
    ...def.reglas.map((r) => [r]),
    [''],
    ['Escribe tus datos en la hoja "Datos", desde la fila 2 (puedes borrar la fila de ejemplo). No cambies los títulos.'],
  ];
  return crearXlsx([
    {
      nombre: 'Datos',
      filas: datos,
      textoCols: def.campos.map((c, i) => (c.texto ? i : -1)).filter((i) => i >= 0),
      anchos: def.campos.map((c) => Math.max(16, c.titulo.length + 6)),
    },
    { nombre: 'Instrucciones', filas: instrucciones, anchos: [24, 14, 70, 28] },
  ]);
}
