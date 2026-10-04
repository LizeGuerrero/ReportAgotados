import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from './lib/supabase/middleware';
import { MODULOS_PROTEGIDOS } from './lib/modulos';

// Rutas que no requieren sesión
const RUTAS_PUBLICAS = ['/login', '/auth/callback', '/recuperar-password', '/api/auth/login'];

// Requiere sesión, pero NO debe forzar "completa tu perfil" primero:
// si alguien está recuperando su contraseña, eso es más urgente.
const RUTAS_EXENTAS_DE_PERFIL = ['/actualizar-password'];

// Enlace de invitación (/unirse?invite=TOKEN o /login?invite=TOKEN): el token se guarda en
// una cookie httpOnly para que sobreviva al registro, a la confirmación del correo, a Google
// y a "completar perfil". Quien tenga la cookie es enviado a /unirse desde la página de inicio.
const COOKIE_INVITACION = 'invite_token';
const FORMATO_TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

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

  const tokenParam = request.nextUrl.searchParams.get('invite');
  const tokenInvitacion =
    (pathname === '/unirse' || pathname === '/login') && tokenParam && FORMATO_TOKEN.test(tokenParam)
      ? tokenParam
      : null;

  function sinCache(res: NextResponse) {
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    if (tokenInvitacion) {
      res.cookies.set(COOKIE_INVITACION, tokenInvitacion, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 24 * 3,
      });
    }
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

    // 4. Exigir membresía activa para entrar a /app/[organizacion] y, dentro de ella,
    //    permiso de "ver" para los módulos protegidos (la base de datos igual lo exige en cada RPC;
    //    esto evita mostrar la pantalla del módulo a quien solo conoce la URL).
    if (!esRutaPublica && pathname.startsWith('/app/')) {
      const slugOrganizacion = pathname.split('/')[2];

      const { data: membresia } = await supabase
        .from('membresias')
        .select('estado_membresia, activo, organizaciones!inner(id, slug)')
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

      const segmento = pathname.split('/')[3];
      const modulo = segmento ? MODULOS_PROTEGIDOS[segmento] : undefined;
      if (modulo) {
        const org = Array.isArray(membresia.organizaciones)
          ? membresia.organizaciones[0]
          : membresia.organizaciones;
        const { data: permitido } = await supabase.rpc('tiene_permiso', {
          p_organizacion_id: org?.id,
          p_modulo: modulo.permiso,
          p_accion: 'ver',
        });

        if (permitido !== true) {
          // rewrite (no redirect): la URL no cambia y se muestra la pantalla "No autorizado"
          // dentro del layout de la organización.
          const url = request.nextUrl.clone();
          url.pathname = `/app/${slugOrganizacion}/no-autorizado`;
          url.search = '';
          url.searchParams.set('modulo', segmento);
          const res = NextResponse.rewrite(url);
          // conserva las cookies de sesión que el cliente de Supabase haya refrescado
          response.cookies.getAll().forEach((c) => res.cookies.set(c));
          return sinCache(res);
        }
      }
    }
  }

  return sinCache(response);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
