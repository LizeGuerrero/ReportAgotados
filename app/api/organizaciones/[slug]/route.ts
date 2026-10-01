import { NextResponse, type NextRequest } from 'next/server';
import { exigirRol, AuthError } from '@/lib/authGuard';

// GET /api/organizaciones/[slug]  → cualquier miembro con membresía activa puede ver
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const { supabase } = await exigirRol(slug); // sin lista de roles = solo exige membresía activa

    const { data: organizacion, error } = await supabase
      .from('organizaciones')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error) throw error;

    return NextResponse.json(organizacion);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// PATCH /api/organizaciones/[slug]  → SOLO admin puede editar
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const { supabase } = await exigirRol(slug, ['admin']);

    const body = await request.json();
    const { nombre } = body;

    if (!nombre || typeof nombre !== 'string') {
      return NextResponse.json({ error: 'Falta el campo "nombre"' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('organizaciones')
      .update({ nombre })
      .eq('slug', slug)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
