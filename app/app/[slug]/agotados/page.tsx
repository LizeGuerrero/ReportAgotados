import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ReporteAgotados from '@/components/ReporteAgotados';

export const metadata = { title: 'Agotados' };

export default async function AgotadosPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: organizacion } = await supabase
    .from('organizaciones')
    .select('id, nombre')
    .eq('slug', slug)
    .maybeSingle();

  if (!organizacion) notFound();

  return (
    <main className="ag-page">
      <div className="ag-head">
        <h1 className="ag-title">Reporte de agotados</h1>
        <p className="ag-lead">Busca un ítem, márcalo como agotado y solicita el pedido a Compras.</p>
      </div>
      <ReporteAgotados organizacionId={organizacion.id} />
    </main>
  );
}
