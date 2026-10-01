import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import PedidosCompras from '@/components/PedidosCompras';

export default async function PedidosPage({ params }: { params: Promise<{ slug: string }> }) {
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
      <h1 style={{ fontSize: 20, margin: '0 0 12px' }}>Pedidos</h1>
      <PedidosCompras organizacionId={organizacion.id} />
    </main>
  );
}
