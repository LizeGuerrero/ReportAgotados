import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  // Construimos la respuesta PRIMERO y las cookies de borrado se escriben
  // directo sobre ella (mismo patrón que en el middleware). Si en vez de esto
  // se usa cookies() de next/headers y se devuelve un NextResponse aparte,
  // las cookies de sesión pueden no llegar a borrarse en el navegador.
  const response = NextResponse.redirect(new URL('/login', request.url));

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

  await supabase.auth.signOut();

  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  return response;
}
