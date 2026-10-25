import { notFound } from 'next/navigation';
import '@/styles/pedidos.css';
import { NoAutorizado } from '@/components/app/NoAutorizado';
import PedidosCompras from '@/components/PedidosCompras';
import { obtenerContextoOrg } from '@/lib/orgContext';

export const metadata = { title: 'Pedidos' };

export default async function PedidosPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await obtenerContextoOrg(slug);
  if (!ctx) notFound();
  if (!ctx.permisos.pedidos) return <NoAutorizado modulo="Pedidos" />;

  return (
    <main className="mod-page">
      <div className="mod-head"><h1 className="mod-title">Pedidos</h1></div>
      <PedidosCompras organizacionId={ctx.organizacion.id} />
    </main>
  );
}
