import { createClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  // El proxy decide igual si hace falta completar perfil, etc.
  // 'next' solo indica a dónde ir cuando no aplique ninguna otra regla
  // (por ejemplo, /actualizar-password para el flujo de recuperación).
  return NextResponse.redirect(`${origin}${next}`);
}
