import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const MAX_INTENTOS = 5;
const VENTANA_BLOQUEO_MINUTOS = 15;

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Correo y contraseña requeridos' }, { status: 400 });
    }

    const admin = createAdminClient();
    const emailNormalizado = String(email).trim().toLowerCase();

    // 1. ¿Está bloqueado ahora mismo?
    const { data: registro } = await admin
      .from('intentos_login')
      .select('intentos, bloqueado_hasta')
      .eq('email', emailNormalizado)
      .maybeSingle();

    if (registro?.bloqueado_hasta && new Date(registro.bloqueado_hasta) > new Date()) {
      const minutosRestantes = Math.ceil(
        (new Date(registro.bloqueado_hasta).getTime() - Date.now()) / 60000
      );
      return NextResponse.json(
        { error: `Demasiados intentos fallidos. Intenta de nuevo en ${minutosRestantes} minuto(s).` },
        { status: 429 }
      );
    }

    // 2. Intentar el login real. Construimos la respuesta PRIMERO para que,
    //    si es exitoso, las cookies de sesión se escriban directo sobre ella
    //    (mismo patrón que ya usamos en signout).
    const response = NextResponse.json({ success: true });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: emailNormalizado,
      password,
    });

    if (signInError) {
      // 3. Falló: sumar el intento y, si toca, bloquear.
      const intentosNuevos = (registro?.intentos ?? 0) + 1;
      const bloqueado = intentosNuevos >= MAX_INTENTOS;

      await admin.from('intentos_login').upsert({
        email: emailNormalizado,
        intentos: bloqueado ? 0 : intentosNuevos, // al bloquear, reinicia el contador
        bloqueado_hasta: bloqueado
          ? new Date(Date.now() + VENTANA_BLOQUEO_MINUTOS * 60_000).toISOString()
          : null,
        ultimo_intento: new Date().toISOString(),
      });

      if (bloqueado) {
        return NextResponse.json(
          { error: `Demasiados intentos fallidos. Intenta de nuevo en ${VENTANA_BLOQUEO_MINUTOS} minutos.` },
          { status: 429 }
        );
      }

      // Mensaje genérico a propósito: no revela si el correo existe o no.
      return NextResponse.json({ error: 'Correo o contraseña incorrectos.' }, { status: 401 });
    }

    // 4. Login correcto: reinicia el contador de intentos.
    await admin.from('intentos_login').delete().eq('email', emailNormalizado);

    return response;
  } catch (err) {
    // Cualquier error inesperado (variable de entorno faltante, DB caída, etc.)
    // siempre devuelve JSON — nunca un 500 con cuerpo vacío que rompa el fetch.
    console.error('Error en /api/auth/login:', err);
    return NextResponse.json(
      { error: 'Error interno del servidor. Intenta de nuevo en unos minutos.' },
      { status: 500 }
    );
  }
}
