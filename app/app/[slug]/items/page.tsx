import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ItemsMaestro from '@/components/items/ItemsMaestro';

export const metadata = { title: 'Ítems' };

// El acceso al módulo lo valida proxy.ts (permiso "ver" de Items) y cada RPC lo vuelve a exigir en la BD.
export default async function ItemsPage({ params }: { params: Promise<{ slug: string }> }) {
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
      <h1 style={{ fontSize: 20, margin: '0 0 12px' }}>Ítems</h1>
      <ItemsMaestro organizacionId={organizacion.id} />
    </main>
  );
}
