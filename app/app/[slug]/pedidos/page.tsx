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
    <main className="mod-page">
      <div className="mod-head">
        <h1 className="mod-title">Pedidos</h1>
      </div>
      <PedidosCompras organizacionId={organizacion.id} />
    </main>
  );
}
