import { notFound } from 'next/navigation';
import { NoAutorizado } from '@/components/app/NoAutorizado';
import MensajesConfig from '@/components/cxp/MensajesConfig';
import { CxpTabs } from '@/components/cxp/CxpTabs';
import { obtenerContextoOrg } from '@/lib/orgContext';

export const metadata = { title: 'Cuentas por pagar · Mensajes' };

export default async function CxpMensajesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await obtenerContextoOrg(slug);
  if (!ctx) notFound();
  if (!ctx.permisos.cxpMensajes) return <NoAutorizado modulo="Mensajes al proveedor" />;

  return (
    <main className="ag-page">
      <CxpTabs slug={slug} activa="mensajes" permisos={ctx.permisos} />
      <MensajesConfig organizacionId={ctx.organizacion.id} empresa={ctx.organizacion.nombre} usuario={ctx.nombreUsuario} />
    </main>
  );
}
