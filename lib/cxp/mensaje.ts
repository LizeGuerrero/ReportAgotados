import { CLAVES_PROVEEDOR, primerNombre, reemplazarVariables, varsVacias, type ValoresVariables } from '@/lib/mensajes/variables';

/**
 * Mensaje para el proveedor cuando se le paga (se envía por WhatsApp o correo con las facturas pagadas).
 * La estructura la define cada organización en "Mensajes" (la misma mecánica de estructuras que Pedidos);
 * aquí solo está la lógica de armarlo. Las variables del proveedor (contacto, WhatsApp, correo…) vienen de la base.
 */
export type FormatoFacturaErp = 'completo' | 'numeros' | 'prefijo_comun';
export type FormatoTotalErp = 'numero' | 'miles' | 'moneda';

/** Descripción corta para copiar al ERP (p. ej. «PP.TRANSF 1730500 FE-1122, 1123»). */
export interface ConfigErp {
  /** Plantilla. Marcadores: {total} {facturas} {documentos} {cantidad} {proveedor} {nit} {fecha} {usuario} {empresa} {sede}. Vacía = no se muestra. */
  erp_plantilla: string;
  /** completo: tal cual · numeros: sin el prefijo de letras · prefijo_comun: el prefijo una vez y luego los números. */
  erp_formato_factura: FormatoFacturaErp;
  /** Lo que va entre una factura y otra. */
  erp_separador: string;
  /** Junta los consecutivos (1122, 1123, 1124 → 1122-1124). Aplica a «numeros» y «prefijo_comun». */
  erp_agrupar_rangos: boolean;
  /** numero: 1730500 · miles: 1.730.500 · moneda: $1.730.500 */
  erp_formato_total: FormatoTotalErp;
}

export const ERP_POR_DEFECTO: ConfigErp = {
  erp_plantilla: 'PP.TRANSF {total} {facturas}',
  erp_formato_factura: 'completo',
  erp_separador: ', ',
  erp_agrupar_rangos: false,
  erp_formato_total: 'numero',
};

export interface ConfigMensaje extends ConfigErp {
  /** Texto del mensaje. Marcadores: los de proveedor/remitente (ver lib/mensajes/variables) y {facturas} {cantidad} {total} {fecha} */
  cuerpo: string;
  /** Cómo se escribe cada factura dentro de {facturas}. Marcadores: {factura} {documento} {vencimiento} {valor} {total_factura} */
  linea: string;
  /** Indicativo del país que se antepone a los celulares de 10 dígitos (Colombia: 57). */
  indicativo: string;
}

export const CONFIG_POR_DEFECTO: ConfigMensaje = {
  cuerpo:
    'Hola {proveedor}, te informamos que realizamos el pago de las siguientes facturas:\n\n{facturas}\n\nTotal pagado: {total}\nFecha de pago: {fecha}\n\nCualquier novedad nos avisas. Gracias.\n{empresa}',
  linea: '• {factura} — {valor}',
  indicativo: '57',
  ...ERP_POR_DEFECTO,
};

export const MARCADORES_CUERPO: { marca: string; ayuda: string }[] = [
  { marca: '{proveedor}', ayuda: 'Nombre del proveedor' },
  { marca: '{contacto}', ayuda: 'Asesor comercial del proveedor' },
  { marca: '{primer_nombre}', ayuda: 'Primer nombre del asesor' },
  { marca: '{saludo}', ayuda: 'Buen día / Buenas tardes / Buenas noches' },
  { marca: '{nit}', ayuda: 'NIT o documento del proveedor' },
  { marca: '{facturas}', ayuda: 'Lista de facturas pagadas (obligatorio)' },
  { marca: '{cantidad}', ayuda: 'Cuántas facturas se pagaron' },
  { marca: '{total}', ayuda: 'Suma de lo pagado' },
  { marca: '{fecha}', ayuda: 'Fecha del pago (hoy)' },
  { marca: '{empresa}', ayuda: 'Nombre de tu empresa' },
  { marca: '{usuario}', ayuda: 'Quién envía el mensaje' },
];

export const MARCADORES_LINEA: { marca: string; ayuda: string }[] = [
  { marca: '{factura}', ayuda: 'Número de la factura del proveedor' },
  { marca: '{documento}', ayuda: 'Número del documento en el ERP' },
  { marca: '{vencimiento}', ayuda: 'Fecha de vencimiento' },
  { marca: '{valor}', ayuda: 'Valor pagado de esa factura' },
  { marca: '{total_factura}', ayuda: 'Valor total de la factura' },
];

/** Lo mínimo que se necesita de cada documento pagado. */
export interface DocumentoMensaje {
  tercero: string | null;
  nombre: string;
  docto_proveedor: string | null;
  documento_erp: string | null;
  fecha_vcto: string | null;
  val_pagar: number;
  total_factura: number;
  sede?: string | null;
}

export interface GrupoProveedor<T extends DocumentoMensaje = DocumentoMensaje> {
  clave: string;
  nombre: string;
  tercero: string | null;
  docs: T[];
  total: number;
}

const FORMATO = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const dinero = (n: number) => FORMATO.format(n).replace(/\s/g, '');

function fecha(iso: string | null): string {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export function numeroFactura(d: DocumentoMensaje): string {
  return d.docto_proveedor?.trim() || d.documento_erp?.trim() || 'sin número';
}

/** Un grupo por proveedor (por NIT; si no tiene, por nombre), con sus documentos ordenados por vencimiento. */
export function agruparPorProveedor<T extends DocumentoMensaje>(docs: T[]): GrupoProveedor<T>[] {
  const mapa = new Map<string, GrupoProveedor<T>>();
  for (const d of docs) {
    const clave = d.tercero ? `t:${d.tercero}` : `n:${d.nombre.trim().toLowerCase()}`;
    let g = mapa.get(clave);
    if (!g) {
      g = { clave, nombre: d.nombre, tercero: d.tercero, docs: [], total: 0 };
      mapa.set(clave, g);
    }
    g.docs.push(d);
    g.total += d.val_pagar;
  }
  const grupos = Array.from(mapa.values());
  for (const g of grupos) {
    g.docs.sort((a, b) => (a.fecha_vcto ?? '').localeCompare(b.fecha_vcto ?? '') || numeroFactura(a).localeCompare(numeroFactura(b)));
  }
  return grupos.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/** Datos de contexto del armado: quién envía, cuándo y los datos reales del proveedor (si se conocen). */
export interface ContextoMensaje {
  empresa: string;
  usuario: string;
  fecha: string;
  /** Variables del proveedor tal como las entrega la base (`cxp_mensaje_datos`). Lo que falte queda vacío. */
  vars?: Partial<ValoresVariables> | null;
}

export function armarMensaje(cfg: ConfigMensaje, grupo: GrupoProveedor, contexto: ContextoMensaje): string {
  const v = { ...varsVacias(CLAVES_PROVEEDOR), ...(contexto.vars ?? {}) } as ValoresVariables;
  // Respaldo con lo que sí trae el pago cuando el proveedor no está en el maestro
  const base: ValoresVariables = {
    ...v,
    proveedor: v.proveedor || grupo.nombre,
    nit: v.nit || (grupo.tercero ?? ''),
    primer_nombre: v.primer_nombre || primerNombre(v.contacto),
    empresa: v.empresa || contexto.empresa,
    usuario: v.usuario || contexto.usuario,
  };
  const lineas = grupo.docs.map((d) =>
    reemplazarVariables(cfg.linea, {
      factura: numeroFactura(d),
      documento: d.documento_erp ?? '',
      vencimiento: fecha(d.fecha_vcto),
      valor: dinero(d.val_pagar),
      total_factura: dinero(d.total_factura),
    }),
  );
  return reemplazarVariables(cfg.cuerpo, {
    ...base,
    facturas: lineas.join('\n'),
    cantidad: String(grupo.docs.length),
    total: dinero(grupo.total),
    fecha: contexto.fecha,
  }).trim();
}

/** Deja solo dígitos y antepone el indicativo a los celulares de 10 dígitos. null si no sirve para WhatsApp. */
export function normalizarTelefono(texto: string | null | undefined, indicativo: string): string | null {
  if (!texto) return null;
  let d = texto.replace(/\D/g, '').replace(/^0+/, '');
  if (d.length === 10 && indicativo) d = indicativo + d;
  return d.length >= 11 && d.length <= 15 ? d : null;
}

/** Enlace que abre WhatsApp con el mensaje escrito. Sin teléfono, WhatsApp deja elegir el contacto. */
export function enlaceWhatsApp(telefono: string | null, mensaje: string): string {
  return `https://wa.me/${telefono ?? ''}?text=${encodeURIComponent(mensaje)}`;
}

export function configValida(v: unknown): ConfigMensaje {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<ConfigMensaje>;
  return {
    cuerpo: typeof o.cuerpo === 'string' && o.cuerpo.trim() ? o.cuerpo : CONFIG_POR_DEFECTO.cuerpo,
    linea: typeof o.linea === 'string' && o.linea.trim() ? o.linea : CONFIG_POR_DEFECTO.linea,
    indicativo: typeof o.indicativo === 'string' ? o.indicativo.replace(/\D/g, '').slice(0, 4) : CONFIG_POR_DEFECTO.indicativo,
    // Una plantilla vacía es válida: significa «no mostrar la descripción para el ERP»
    erp_plantilla: typeof o.erp_plantilla === 'string' ? o.erp_plantilla : ERP_POR_DEFECTO.erp_plantilla,
    erp_formato_factura: o.erp_formato_factura === 'numeros' || o.erp_formato_factura === 'prefijo_comun' ? o.erp_formato_factura : 'completo',
    erp_separador: typeof o.erp_separador === 'string' && o.erp_separador !== '' ? o.erp_separador.slice(0, 10) : ERP_POR_DEFECTO.erp_separador,
    erp_agrupar_rangos: o.erp_agrupar_rangos === true,
    erp_formato_total: o.erp_formato_total === 'miles' || o.erp_formato_total === 'moneda' ? o.erp_formato_total : 'numero',
  };
}

/* ------------------------------------------------------------------------------------------------------------
 * Descripción para el ERP
 * ------------------------------------------------------------------------------------------------------------ */

/** Separa el prefijo de letras/símbolos del resto: «FE-1122» → { prefijo: 'FE-', resto: '1122' }. */
function partirFactura(s: string): { prefijo: string; resto: string } {
  const m = /^(\D*)(.*)$/.exec(s) as RegExpExecArray;
  return { prefijo: m[1], resto: m[2] };
}

const esNumero = (r: string) => /^\d{1,15}$/.test(r);

/** Quita repetidos y, si se pide, junta los consecutivos numéricos: 1122,1123,1124,1130 → «1122-1124», «1130». */
function comprimir(restos: string[], agrupar: boolean): string[] {
  const unicos = Array.from(new Set(restos));
  if (!agrupar) return unicos;
  const nums = unicos.filter(esNumero).sort((a, b) => Number(a) - Number(b));
  const otros = unicos.filter((r) => !esNumero(r));
  const salida: string[] = [];
  for (let i = 0; i < nums.length; ) {
    let j = i;
    while (j + 1 < nums.length && Number(nums[j + 1]) === Number(nums[j]) + 1) j++;
    salida.push(j > i ? `${nums[i]}-${nums[j]}` : nums[i]);
    i = j + 1;
  }
  return [...salida, ...otros];
}

/**
 * Escribe una lista de números de factura (o de documento) según el formato elegido:
 *  - completo:       FE-1122, FE-1123
 *  - numeros:        1122, 1123               (sin el prefijo de letras/símbolos del comienzo)
 *  - prefijo_comun:  FE-1122, 1123            (cada prefijo una sola vez, seguido de sus números)
 */
export function formatearFacturasErp(lista: string[], formato: FormatoFacturaErp, separador: string, agrupar: boolean): string {
  const limpias = lista.map((x) => x.trim()).filter(Boolean);
  if (formato === 'completo') return Array.from(new Set(limpias)).join(separador);
  const partes = limpias.map((x) => {
    const p = partirFactura(x);
    return p.resto ? p : { prefijo: '', resto: x }; // sin dígitos ni resto: se deja entero
  });
  if (formato === 'numeros') return comprimir(partes.map((p) => p.resto), agrupar).join(separador);
  const grupos = new Map<string, string[]>();
  for (const p of partes) grupos.set(p.prefijo, [...(grupos.get(p.prefijo) ?? []), p.resto]);
  return Array.from(grupos, ([pre, restos]) => pre + comprimir(restos, agrupar).join(separador)).join(separador);
}

export function formatearTotalErp(n: number, formato: FormatoTotalErp): string {
  const r = Math.round(n * 100) / 100;
  if (formato === 'moneda') return dinero(r);
  if (formato === 'miles') return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(r);
  return Number.isInteger(r) ? String(r) : r.toFixed(2).replace('.', ',');
}

/** Descripción de una sola línea para pegar en el ERP. Cadena vacía si la plantilla está vacía. */
export function armarDescripcionErp(cfg: ConfigErp, grupo: GrupoProveedor, contexto: ContextoMensaje): string {
  if (!cfg.erp_plantilla.trim()) return '';
  const v = { ...varsVacias(CLAVES_PROVEEDOR), ...(contexto.vars ?? {}) } as ValoresVariables;
  const sedes = Array.from(new Set(grupo.docs.map((d) => (d.sede ?? '').trim()).filter(Boolean))).join(' / ');
  const fmt = (xs: string[]) => formatearFacturasErp(xs, cfg.erp_formato_factura, cfg.erp_separador, cfg.erp_agrupar_rangos);
  return reemplazarVariables(cfg.erp_plantilla, {
    proveedor: v.proveedor || grupo.nombre,
    nit: v.nit || (grupo.tercero ?? ''),
    empresa: v.empresa || contexto.empresa,
    usuario: v.usuario || contexto.usuario,
    fecha: contexto.fecha,
    total: formatearTotalErp(grupo.total, cfg.erp_formato_total),
    facturas: fmt(grupo.docs.map(numeroFactura)),
    documentos: fmt(grupo.docs.map((d) => d.documento_erp ?? '')),
    cantidad: String(grupo.docs.length),
    sede: sedes,
  }).replace(/\s+/g, ' ').trim();
}
