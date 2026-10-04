import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

export interface ContextoOrg {
  organizacion: { id: string; nombre: string; slug: string };
  nombreUsuario: string;
  iniciales: string;
  /** Módulos que el usuario puede ver, según tiene_permiso() en la base de datos. */
  permisos: { agotados: boolean; pedidos: boolean; items: boolean };
  /** Administrador activo de esta organización (rol "admin"). */
  esAdmin: boolean;
}

/**
 * Datos de la organización + qué módulos puede ver el usuario. Usa cache() de
 * React: el layout y la página piden lo mismo en una misma petición y solo se
 * consulta una vez.
 */
export const obtenerContextoOrg = cache(async (slug: string): Promise<ContextoOrg | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: organizacion } = await supabase
    .from('organizaciones')
    .select('id, nombre, slug')
    .eq('slug', slug)
    .maybeSingle();
  if (!organizacion) return null;

  const permiso = (modulo: string) =>
    supabase.rpc('tiene_permiso', {
      p_organizacion_id: organizacion.id,
      p_modulo: modulo,
      p_accion: 'ver',
    });

  const [perfil, agotados, pedidos, items, admin] = await Promise.all([
    supabase.from('profiles').select('nombres, apellidos, username').eq('id', user.id).maybeSingle(),
    permiso('reporte_agotados'),
    permiso('pedidos'),
    permiso('Items'),
    supabase.rpc('es_admin_org', { p_org: organizacion.id }),
  ]);

  const nombres = perfil.data?.nombres?.trim() ?? '';
  const apellidos = perfil.data?.apellidos?.trim() ?? '';
  const nombreUsuario =
    [nombres, apellidos].filter(Boolean).join(' ') || perfil.data?.username || user.email || 'Usuario';
  const iniciales =
    (nombres.charAt(0) + apellidos.charAt(0)).toUpperCase() || nombreUsuario.charAt(0).toUpperCase();

  return {
    organizacion,
    nombreUsuario,
    iniciales,
    permisos: { agotados: agotados.data === true, pedidos: pedidos.data === true, items: items.data === true },
    esAdmin: admin.data === true,
  };
});
