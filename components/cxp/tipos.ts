export interface FilaCxp {
  id: string;
  origen: 'erp' | 'manual';
  empresa: string | null;
  tercero: string | null;
  nombre: string;
  cond_pago: string | null;
  docto_proveedor: string | null;
  documento_erp: string | null;
  fecha_dcto: string | null;
  fecha_vcto: string | null;
  plazo: number | null;
  dias_venc: number;
  vencido: boolean;
  sede: string | null;
  anticipos: number;
  descuentos: number;
  retenciones: number;
  total_factura: number;
  val_pagar: number;
  detalles: string | null;
  estado: 'pendiente' | 'pagado';
  fecha_pago: string | null;
  pagado_por: string | null;
  total: number;
}

export interface TotalesCxp {
  suma_total: number;
  suma_vencido: number;
  suma_por_vencer: number;
  n_total: number;
  n_vencido: number;
  n_por_vencer: number;
}

export const TOTALES_VACIOS: TotalesCxp = {
  suma_total: 0, suma_vencido: 0, suma_por_vencer: 0, n_total: 0, n_vencido: 0, n_por_vencer: 0,
};

export interface ProveedorFiltro {
  tercero: string | null;
  nombre: string;
  documentos: number;
}

export interface SugerenciaTercero {
  tercero: string;
  nombre: string;
  cond_pago: string | null;
  fuente: 'cartera' | 'proveedores';
}

/** Condiciones de pago con el mismo texto que usa el ERP, y sus días de crédito. */
export const CONDICIONES_PAGO: { texto: string; dias: number }[] = [
  { texto: '01 CONTADO', dias: 0 },
  { texto: '02 CREDITO A 8 DIAS', dias: 8 },
  { texto: '03 CREDITO A 15 DIAS', dias: 15 },
  { texto: '04 CREDITO A 30 DIAS', dias: 30 },
  { texto: '05 CREDITO A 45 DIAS', dias: 45 },
  { texto: '06 CREDITO A 60 DIAS', dias: 60 },
];

const FORMATO_MONEDA = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function moneda(n: number | null | undefined): string {
  return FORMATO_MONEDA.format(Number(n ?? 0));
}

/** "2026-10-06" -> "06/10/2026" (sin pasar por Date, para no correr el día por la zona horaria). */
export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

/** Fecha y hora de un instante (para "fecha de pago"), en hora de Colombia. */
export function fechaHora(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Hoy como "AAAA-MM-DD" en la hora local del navegador. */
export function hoyIso(): string {
  const d = new Date();
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

/** Suma días a una fecha "AAAA-MM-DD". */
export function sumarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d + dias));
  return f.toISOString().slice(0, 10);
}

/** Número de un campo de texto: acepta "1.234,5" y "1234.5". Vacío = 0. NaN si no es un número. */
export function aNumero(texto: string): number {
  const t = texto.trim().replace(/\s/g, '').replace(/\$/g, '');
  if (t === '') return 0;
  let normal = t;
  if (t.includes(',')) normal = t.replace(/\./g, '').replace(',', '.'); // 1.234,50
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) normal = t.replace(/\./g, ''); // 600.000
  return /^-?\d+(\.\d+)?$/.test(normal) ? Number(normal) : NaN;
}
