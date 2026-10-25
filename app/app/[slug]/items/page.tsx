import { notFound } from 'next/navigation';
import { NoAutorizado } from '@/components/app/NoAutorizado';
import ItemsMaestro from '@/components/items/ItemsMaestro';
import { obtenerContextoOrg } from '@/lib/orgContext';

export const metadata = { title: 'Ítems' };

export default async function ItemsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await obtenerContextoOrg(slug);
  if (!ctx) notFound();
  if (!ctx.permisos.items) return <NoAutorizado modulo="Ítems" />;

  return (
    <main className="mod-page">
      <div className="mod-head"><h1 className="mod-title">Ítems</h1></div>
      <ItemsMaestro organizacionId={ctx.organizacion.id} />
    </main>
  );
}
