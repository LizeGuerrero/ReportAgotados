import { notFound } from 'next/navigation';
import { NoAutorizado } from '@/components/app/NoAutorizado';
import ProveedoresMaestro from '@/components/proveedores/ProveedoresMaestro';
import { obtenerContextoOrg } from '@/lib/orgContext';

export const metadata = { title: 'Proveedores' };

export default async function ProveedoresPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await obtenerContextoOrg(slug);
  if (!ctx) notFound();
  if (!ctx.permisos.proveedores) return <NoAutorizado modulo="Proveedores" />;

  return (
    <main className="mod-page">
      <div className="mod-head"><h1 className="mod-title">Proveedores</h1></div>
      <ProveedoresMaestro organizacionId={ctx.organizacion.id} />
    </main>
  );
}
