import { createClient } from '@/lib/supabase/client';
import {
  guardarClienteCorreo, guardarClienteWhatsApp, type ClienteCorreo, type ClienteWhatsApp,
} from '@/lib/mensajes/enviar';

/**
 * Preferencias de envío POR USUARIO (con qué se abren el correo y WhatsApp), guardadas en la base
 * (`usuario_preferencias`) para que acompañen a la cuenta en cualquier equipo. El navegador conserva una copia local
 * (localStorage) solo para que el botón aparezca bien al instante; si la base responde, esa respuesta manda.
 */
const K_CORREO = 'mensajes.clienteCorreo';
const K_WHATSAPP = 'mensajes.clienteWhatsApp';

export interface PreferenciasEnvio { correo: ClienteCorreo | null; whatsapp: ClienteWhatsApp | null }

export async function cargarPreferenciasEnvio(): Promise<PreferenciasEnvio> {
  const vacio: PreferenciasEnvio = { correo: null, whatsapp: null };
  try {
    const { data, error } = await createClient().rpc('usuario_preferencias_obtener');
    if (error || !data) return vacio;
    const o = data as Record<string, string>;
    const correo = o[K_CORREO] === 'gmail' || o[K_CORREO] === 'outlook' || o[K_CORREO] === 'app' ? (o[K_CORREO] as ClienteCorreo) : null;
    const whatsapp = o[K_WHATSAPP] === 'web' || o[K_WHATSAPP] === 'app' || o[K_WHATSAPP] === 'wa' ? (o[K_WHATSAPP] as ClienteWhatsApp) : null;
    if (correo) guardarClienteCorreo(correo);
    if (whatsapp) guardarClienteWhatsApp(whatsapp);
    return { correo, whatsapp };
  } catch {
    return vacio;
  }
}

/** Guarda en este navegador y en la cuenta. (La llamada a la base solo se envía al usar .then.) */
export function recordarClienteCorreo(c: ClienteCorreo): void {
  guardarClienteCorreo(c);
  createClient().rpc('usuario_preferencia_guardar', { p_clave: K_CORREO, p_valor: c }).then(() => undefined, () => undefined);
}

export function recordarClienteWhatsApp(c: ClienteWhatsApp): void {
  guardarClienteWhatsApp(c);
  createClient().rpc('usuario_preferencia_guardar', { p_clave: K_WHATSAPP, p_valor: c }).then(() => undefined, () => undefined);
}
