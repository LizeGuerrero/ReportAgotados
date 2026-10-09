import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Importaciones from '@/components/importaciones/Importaciones';

export const metadata = { title: 'Importaciones' };

// El acceso lo valida proxy.ts (permiso "ver" de importaciones) y cada función vuelve a exigirlo en la BD.
export default async function ImportacionesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: organizacion } = await supabase
    .from('organizaciones')
    .select('id, nombre')
    .eq('slug', slug)
    .maybeSingle();

  if (!organizacion) notFound();

  return (
    <main style={{ padding: 16 }}>
      <h1 style={{ fontSize: 20, margin: '0 0 12px' }}>Importaciones</h1>
      <Importaciones organizacionId={organizacion.id} />
    </main>
  );
}
