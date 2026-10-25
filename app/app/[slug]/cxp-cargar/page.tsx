import { notFound } from 'next/navigation';
import { NoAutorizado } from '@/components/app/NoAutorizado';
import CargarCxp from '@/components/cxp/CargarCxp';
import { CxpTabs } from '@/components/cxp/CxpTabs';
import { obtenerContextoOrg } from '@/lib/orgContext';

export const metadata = { title: 'Cuentas por pagar · Cargar archivo' };

export default async function CxpCargarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await obtenerContextoOrg(slug);
  if (!ctx) notFound();
  if (!ctx.permisos.cxpImportar) return <NoAutorizado modulo="Cargar archivo del ERP" />;

  return (
    <main className="ag-page">
      <CxpTabs slug={slug} activa="cargar" permisos={ctx.permisos} />
      <CargarCxp organizacionId={ctx.organizacion.id} />
    </main>
  );
}
