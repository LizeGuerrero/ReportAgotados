/**
 * Contrato entre las FUENTES de datos (Excel del ERP hoy, API del nuevo ERP mañana) y el sistema.
 * Toda fuente entrega filas con esta forma; la validación, las reglas y la carga viven en la base de datos
 * y no saben de dónde vinieron los datos.
 */
export interface FilaErp {
  /** Número de fila en el archivo de origen (solo para mensajes de error). */
  fila: number;
  empresa: string | null;
  tercero: string;
  nombre: string;
  co_codigo: string | null;
  co_nombre: string | null;
  cond_pago: string | null;
  docto_proveedor: string | null;
  documento_erp: string;
  fecha_dcto: string | null; // AAAA-MM-DD
  fecha_vcto: string | null; // AAAA-MM-DD
  plazo: number | null;
  saldo: number | null;
  detalle: string | null;
  /** El resto de columnas del ERP, que no se muestran en la cartera pero se conservan. */
  raw: Record<string, string | number>;
}

export interface ResultadoLectura {
  fuente: 'excel' | 'api';
  archivo: string;
  /** Huella del contenido, para avisar si el mismo archivo ya se cargó. */
  hash: string;
  hoja: string;
  filas: FilaErp[];
  /** Cosas que impiden cargar (columnas o valores que faltan). Vacío = se puede continuar. */
  problemas: string[];
}

export interface FuenteCxp<Entrada> {
  nombre: string;
  leer(entrada: Entrada): Promise<ResultadoLectura>;
}
