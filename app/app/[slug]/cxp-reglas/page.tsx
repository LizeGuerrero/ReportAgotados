import { notFound } from 'next/navigation';
import { NoAutorizado } from '@/components/app/NoAutorizado';
import ReglasCxp from '@/components/cxp/ReglasCxp';
import { CxpTabs } from '@/components/cxp/CxpTabs';
import { obtenerContextoOrg } from '@/lib/orgContext';

export const metadata = { title: 'Cuentas por pagar · Reglas' };

export default async function CxpReglasPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await obtenerContextoOrg(slug);
  if (!ctx) notFound();
  if (!ctx.permisos.cxpReglas) return <NoAutorizado modulo="Reglas de exclusión" />;

  return (
    <main className="ag-page">
      <CxpTabs slug={slug} activa="reglas" permisos={ctx.permisos} />
      <ReglasCxp organizacionId={ctx.organizacion.id} />
    </main>
  );
}
