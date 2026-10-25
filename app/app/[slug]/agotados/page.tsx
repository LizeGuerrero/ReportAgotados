import { notFound } from 'next/navigation';
import ReporteAgotados from '@/components/ReporteAgotados';
import { obtenerContextoOrg } from '@/lib/orgContext';

export const metadata = { title: 'Agotados' };

export default async function AgotadosPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await obtenerContextoOrg(slug);
  if (!ctx) notFound();
  if (!ctx.permisos.agotados) {
    return <main className="ag-page"><h1 className="mod-title">No tienes permiso para consultar Agotados.</h1></main>;
  }

  return (
    <main className="ag-page">
      <div className="ag-head">
        <h1 className="ag-title">Reporte de agotados</h1>
        <p className="ag-lead">Busca un ítem, márcalo como agotado y solicita el pedido a Compras.</p>
      </div>
      <ReporteAgotados organizacionId={ctx.organizacion.id} />
    </main>
  );
}
