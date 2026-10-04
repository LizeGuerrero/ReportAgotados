import { createHash, randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { exigirRol, AuthError } from '@/lib/authGuard';
import { enviarCorreoInvitacion } from '@/lib/enviarCorreo';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/organizaciones/[slug]/invitaciones  → SOLO admin
// Body: { email, rol_id, sede_id? }
// Genera el token aquí (32 bytes aleatorios), guarda únicamente su hash en la base de datos y
// devuelve el enlace UNA sola vez. Reenviar = volver a llamar: la invitación anterior queda cancelada.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const { supabase, user } = await exigirRol(slug, ['admin']);

    const body = await request.json().catch(() => null);
    const email = String(body?.email ?? '').trim().toLowerCase();
    const rolId = String(body?.rol_id ?? '');
    const sedeId = body?.sede_id ? String(body.sede_id) : null;

    if (!email || !UUID.test(rolId) || (sedeId && !UUID.test(sedeId))) {
      return NextResponse.json({ error: 'Datos de invitación incompletos' }, { status: 400 });
    }

    const { data: org } = await supabase
      .from('organizaciones')
      .select('id, nombre')
      .eq('slug', slug)
      .single();
    if (!org) return NextResponse.json({ error: 'Organización no encontrada' }, { status: 404 });

    const token = randomBytes(32).toString('base64url');
    const hash = createHash('sha256').update(token).digest('hex');

    // La función valida: admin de la organización, rol/sede de esa organización, correo, etc.
    const { error } = await supabase.rpc('crear_invitacion', {
      p_org: org.id,
      p_email: email,
      p_rol: rolId,
      p_sede: sedeId,
      p_token_hash: hash,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const base = (process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin).replace(/\/+$/, '');
    const enlace = `${base}/unirse?invite=${token}`;

    const { data: perfil } = await supabase
      .from('profiles')
      .select('nombres, apellidos')
      .eq('id', user.id)
      .maybeSingle();
    const invitadoPor =
      [perfil?.nombres, perfil?.apellidos].filter(Boolean).join(' ') || user.email || 'Un administrador';

    const envio = await enviarCorreoInvitacion({ para: email, organizacion: org.nombre, invitadoPor, enlace });

    return NextResponse.json({ enlace, correoEnviado: envio.enviado, aviso: envio.motivo ?? null });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
