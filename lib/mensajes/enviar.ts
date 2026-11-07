/**
 * Apertura del correo del mensaje: Gmail (web) como opción principal, con Outlook web y la app de correo del equipo
 * (mailto:) como alternativas. Conserva destinatario, asunto y contenido; si el mensaje es demasiado largo para ir en
 * el enlace, se abre el correo sin cuerpo y se avisa para pegarlo (el texto ya queda copiado).
 */
export type ClienteCorreo = 'gmail' | 'outlook' | 'app';

export interface DatosCorreo { para: string; asunto: string; cuerpo: string }

export const CLIENTES_CORREO: { valor: ClienteCorreo; texto: string; ayuda: string }[] = [
  { valor: 'gmail', texto: 'Gmail', ayuda: 'Abre la redacción de Gmail en el navegador' },
  { valor: 'outlook', texto: 'Outlook web', ayuda: 'Abre la redacción de Outlook en el navegador' },
  { valor: 'app', texto: 'App de correo del equipo', ayuda: 'Usa el programa de correo instalado (mailto:)' },
];

/** Largo máximo (ya codificado) del cuerpo que se mete en el enlace, según el cliente. */
export const LIMITE_CUERPO: Record<ClienteCorreo, number> = { gmail: 6000, outlook: 6000, app: 1800 };

const CLAVE_PREFERENCIA = 'mensajes.clienteCorreo';

/** Varios correos separados por ; , o espacios → "a@x.com,b@y.com". */
export function destinatarios(texto: string | null | undefined): string {
  return (texto ?? '').split(/[;,\s]+/).filter(Boolean).join(',');
}

const enc = encodeURIComponent;

export function enlaceGmail(d: DatosCorreo): string {
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${enc(destinatarios(d.para))}&su=${enc(d.asunto)}&body=${enc(d.cuerpo)}`;
}

export function enlaceOutlookWeb(d: DatosCorreo): string {
  return `https://outlook.office.com/mail/deeplink/compose?to=${enc(destinatarios(d.para))}&subject=${enc(d.asunto)}&body=${enc(d.cuerpo)}`;
}

export function enlaceMailto(d: DatosCorreo): string {
  return `mailto:${destinatarios(d.para)}?subject=${enc(d.asunto)}&body=${enc(d.cuerpo)}`;
}

/** Arma el enlace del cliente elegido; si el cuerpo no cabe, lo omite y lo indica en `recortado`. */
export function prepararCorreo(cliente: ClienteCorreo, d: DatosCorreo): { url: string; recortado: boolean } {
  const recortado = enc(d.cuerpo).length > LIMITE_CUERPO[cliente];
  const datos = recortado ? { ...d, cuerpo: '' } : d;
  const url = cliente === 'gmail' ? enlaceGmail(datos) : cliente === 'outlook' ? enlaceOutlookWeb(datos) : enlaceMailto(datos);
  return { url, recortado };
}

export function leerClienteCorreo(): ClienteCorreo {
  try {
    const v = window.localStorage.getItem(CLAVE_PREFERENCIA);
    if (v === 'gmail' || v === 'outlook' || v === 'app') return v;
  } catch { /* sin almacenamiento: se usa Gmail */ }
  return 'gmail';
}

export function guardarClienteCorreo(c: ClienteCorreo): void {
  try { window.localStorage.setItem(CLAVE_PREFERENCIA, c); } catch { /* no es crítico */ }
}

/** Abre el correo. Debe llamarse dentro de un clic (para que el navegador no bloquee la ventana). */
export function abrirCorreo(cliente: ClienteCorreo, d: DatosCorreo): { recortado: boolean } {
  const { url, recortado } = prepararCorreo(cliente, d);
  if (recortado) void navigator.clipboard?.writeText(d.cuerpo).catch(() => undefined);
  if (cliente === 'app') window.location.href = url;
  else window.open(url, '_blank', 'noopener,noreferrer');
  return { recortado };
}

/* ------------------------------------------------------------------------------------------------------------
 * WhatsApp directo. Los enlaces wa.me / api.whatsapp.com SIEMPRE pasan por una página intermedia de WhatsApp
 * («Continuar al chat»), y eso no se puede evitar desde nuestro lado. Para ir directo al chat se usa:
 *   - WhatsApp Web (web.whatsapp.com/send): abre el chat con el mensaje escrito (pide QR solo si no hay sesión).
 *   - La app instalada (whatsapp://send): abre la app de escritorio o del celular sin pasar por el navegador.
 *   - wa.me: respaldo con la página intermedia.
 * ------------------------------------------------------------------------------------------------------------ */
export type ClienteWhatsApp = 'web' | 'app' | 'wa';

export const CLIENTES_WHATSAPP: { valor: ClienteWhatsApp; texto: string; ayuda: string }[] = [
  { valor: 'web', texto: 'WhatsApp Web', ayuda: 'Abre el chat directo en el navegador (recomendado en computador)' },
  { valor: 'app', texto: 'App de WhatsApp', ayuda: 'Abre la app instalada (escritorio o celular), sin pasar por el navegador' },
  { valor: 'wa', texto: 'Enlace wa.me', ayuda: 'Respaldo: pasa por la página «Continuar al chat» de WhatsApp' },
];

/** Largo máximo (ya codificado) del texto dentro del enlace de WhatsApp. */
export const LIMITE_TEXTO_WHATSAPP = 4000;
const CLAVE_WHATSAPP = 'mensajes.clienteWhatsApp';

export function enlaceWhatsAppDirecto(cliente: ClienteWhatsApp, telefono: string | null, mensaje: string): string {
  const t = encodeURIComponent(mensaje);
  const tel = telefono ?? '';
  if (cliente === 'web') return `https://web.whatsapp.com/send?${tel ? `phone=${tel}&` : ''}text=${t}&app_absent=0`;
  if (cliente === 'app') return `whatsapp://send?${tel ? `phone=${tel}&` : ''}text=${t}`;
  return `https://wa.me/${tel}?text=${t}`;
}

/** En celular se prefiere la app; en computador, WhatsApp Web. */
export function clienteWhatsAppPorDefecto(): ClienteWhatsApp {
  const movil = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  return movil ? 'app' : 'web';
}

export function leerClienteWhatsApp(): ClienteWhatsApp {
  try {
    const v = window.localStorage.getItem(CLAVE_WHATSAPP);
    if (v === 'web' || v === 'app' || v === 'wa') return v;
  } catch { /* sin almacenamiento */ }
  return clienteWhatsAppPorDefecto();
}

export function guardarClienteWhatsApp(c: ClienteWhatsApp): void {
  try { window.localStorage.setItem(CLAVE_WHATSAPP, c); } catch { /* no es crítico */ }
}

/** Abre el chat directo. Debe llamarse dentro de un clic. Si el texto no cabe en el enlace, se copia y se avisa. */
export function abrirWhatsApp(cliente: ClienteWhatsApp, telefono: string | null, mensaje: string): { recortado: boolean } {
  const recortado = encodeURIComponent(mensaje).length > LIMITE_TEXTO_WHATSAPP;
  if (recortado) void navigator.clipboard?.writeText(mensaje).catch(() => undefined);
  const url = enlaceWhatsAppDirecto(cliente, telefono, recortado ? '' : mensaje);
  if (cliente === 'app') window.location.href = url;
  else window.open(url, '_blank', 'noopener,noreferrer');
  return { recortado };
}
