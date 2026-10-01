import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from './lib/supabase/middleware';

// Rutas que no requieren sesión
const RUTAS_PUBLICAS = ['/login', '/auth/callback', '/recuperar-password', '/api/auth/login'];

// Requiere sesión, pero NO debe forzar "completa tu perfil" primero:
// si alguien está recuperando su contraseña, eso es más urgente.
const RUTAS_EXENTAS_DE_PERFIL = ['/actualizar-password'];

export async function proxy(request: NextRequest) {
  const { supabase, response } = createClient(request);
  const { pathname } = request.nextUrl;

  // Ninguna página HTML de este flujo debe venir del bfcache del navegador:
  // si no, el botón "atrás" puede mostrar una sesión que ya cerraste, o un
  // formulario que ya llenaste, sin volver a pasar por este proxy.
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const esRutaPublica = RUTAS_PUBLICAS.some((r) => pathname.startsWith(r));

  function sinCache(res: NextResponse) {
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res;
  }

  // 1. Sin sesión → a login (salvo rutas públicas)
  if (!user && !esRutaPublica) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return sinCache(NextResponse.redirect(url));
  }

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('perfil_completo')
      .eq('id', user.id)
      .single();

    const perfilIncompleto = !!profile && !profile.perfil_completo;

    // 2. Ya autenticado y con perfil completo → sácalo de /login y /completar-perfil
    //    (esto es lo que corrige el problema del botón "atrás": si ya inició
    //    sesión, jamás debe poder volver a ver esos formularios).
    if (!perfilIncompleto && (pathname === '/login' || pathname === '/completar-perfil')) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return sinCache(NextResponse.redirect(url));
    }

    // 3. Perfil incompleto (típico de Google) → forzar a completarlo
    //    (salvo si está recuperando su contraseña, eso va primero)
    if (
      perfilIncompleto &&
      pathname !== '/completar-perfil' &&
      !esRutaPublica &&
      !RUTAS_EXENTAS_DE_PERFIL.includes(pathname)
    ) {
      const url = request.nextUrl.clone();
      url.pathname = '/completar-perfil';
      return sinCache(NextResponse.redirect(url));
    }

    // 4. Ejemplo: exigir membresía activa para entrar a /app/[organizacion]
    if (!esRutaPublica && pathname.startsWith('/app/')) {
      const slugOrganizacion = pathname.split('/')[2];

      const { data: membresia } = await supabase
        .from('membresias')
        .select('estado_membresia, activo, organizaciones!inner(slug)')
        .eq('usuario_id', user.id)
        .eq('organizaciones.slug', slugOrganizacion)
        .eq('activo', true)
        .eq('estado_membresia', 'activa')
        .maybeSingle();

      if (!membresia) {
        const url = request.nextUrl.clone();
        url.pathname = '/sin-acceso';
        return NextResponse.redirect(url);
      }
    }
  }

  return sinCache(response);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
