/**
 * Mensaje para el proveedor cuando se le paga (se envía por WhatsApp con las facturas pagadas).
 * La plantilla la configura cada organización en "Mensajes"; aquí solo está la lógica de armarlo.
 */
export interface ConfigMensaje {
  /** Texto del mensaje. Marcadores: {proveedor} {nit} {facturas} {cantidad} {total} {fecha} {empresa} {usuario} */
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
};

export const MARCADORES_CUERPO: { marca: string; ayuda: string }[] = [
  { marca: '{proveedor}', ayuda: 'Nombre del proveedor' },
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

function reemplazar(plantilla: string, valores: Record<string, string>): string {
  // Los marcadores que no existen se dejan tal cual: así se nota el error de escritura en la vista previa.
  return plantilla.replace(/\{([a-z_]+)\}/g, (m, k: string) => (k in valores ? valores[k] : m));
}

export function armarMensaje(
  cfg: ConfigMensaje,
  grupo: GrupoProveedor,
  contexto: { empresa: string; usuario: string; fecha: string },
): string {
  const lineas = grupo.docs.map((d) =>
    reemplazar(cfg.linea, {
      factura: numeroFactura(d),
      documento: d.documento_erp ?? '',
      vencimiento: fecha(d.fecha_vcto),
      valor: dinero(d.val_pagar),
      total_factura: dinero(d.total_factura),
    }),
  );
  return reemplazar(cfg.cuerpo, {
    proveedor: grupo.nombre,
    nit: grupo.tercero ?? '',
    facturas: lineas.join('\n'),
    cantidad: String(grupo.docs.length),
    total: dinero(grupo.total),
    fecha: contexto.fecha,
    empresa: contexto.empresa,
    usuario: contexto.usuario,
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
  };
}
