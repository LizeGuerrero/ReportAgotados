import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * ⚠️ SOLO usar en código de servidor (route handlers, Server Components).
 * NUNCA importar esto desde un archivo con 'use client' — usa la secret key,
 * que se salta RLS por completo. Si termina en el bundle del navegador,
 * cualquiera tendría acceso total a la base de datos.
 *
 * La variable NO lleva el prefijo NEXT_PUBLIC_ a propósito: eso es lo que
 * evita que Next.js la incluya en el código del navegador.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const secretKey = process.env.SUPABASE_SECRET_KEY!;

  if (!secretKey) {
    throw new Error('Falta SUPABASE_SECRET_KEY en las variables de entorno del servidor');
  }

  return createSupabaseClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
