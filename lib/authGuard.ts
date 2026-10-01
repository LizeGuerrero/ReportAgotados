import { createClient } from './supabase/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface ContextoAutorizado {
  supabase: SupabaseClient;
  user: User;
  rol: string;
}

/**
 * Exige: sesión activa + membresía activa en la organización dada +
 * (opcionalmente) que el rol esté dentro de `rolesPermitidos`.
 *
 * Úsalo al inicio de cualquier route handler que necesite proteger por rol:
 *
 *   const { user, rol } = await exigirRol(slugOrganizacion, ['admin', 'editor']);
 *
 * Lanza AuthError (401/403) si no cumple — captúrala en el route handler.
 */
export async function exigirRol(
  slugOrganizacion: string,
  rolesPermitidos?: string[]
): Promise<ContextoAutorizado> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new AuthError('No autenticado', 401);
  }

  const { data: membresia, error } = await supabase
    .from('membresias')
    .select('estado_membresia, activo, roles!inner(nombre), organizaciones!inner(slug)')
    .eq('usuario_id', user.id)
    .eq('organizaciones.slug', slugOrganizacion)
    .eq('activo', true)
    .eq('estado_membresia', 'activa')
    .maybeSingle();

  if (error || !membresia) {
    throw new AuthError('No tienes una membresía activa en esta organización', 403);
  }

  // El join viene como array o como objeto según la versión del cliente; normalizamos.
  const rolNombre = Array.isArray(membresia.roles)
    ? membresia.roles[0]?.nombre
    : (membresia.roles as { nombre: string })?.nombre;

  if (rolesPermitidos && (!rolNombre || !rolesPermitidos.includes(rolNombre))) {
    throw new AuthError(`Se requiere rol: ${rolesPermitidos.join(' o ')}`, 403);
  }

  return { supabase, user, rol: rolNombre };
}
