'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

const COOKIE_INVITACION = 'invite_token';

type Resultado = { ok: true; slug?: string } | { ok: false; error: string };

// Acepta con la sesión de quien llama: la función de base de datos exige que el correo
// confirmado de esa sesión sea el de la invitación, que no esté usada ni vencida, etc.
export async function aceptarInvitacion(token: string): Promise<Resultado> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('aceptar_invitacion', { p_token: token });
  if (error) return { ok: false, error: error.message };
  (await cookies()).delete(COOKIE_INVITACION);
  return { ok: true, slug: typeof data === 'string' ? data : undefined };
}

export async function rechazarInvitacion(token: string): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('rechazar_invitacion', { p_token: token });
  if (error) return { ok: false, error: error.message };
  (await cookies()).delete(COOKIE_INVITACION);
  return { ok: true };
}

// Olvida el enlace guardado (si no, la página de inicio seguiría enviando a /unirse).
export async function descartarInvitacion(): Promise<void> {
  (await cookies()).delete(COOKIE_INVITACION);
}
