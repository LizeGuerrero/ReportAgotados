import { notFound } from 'next/navigation';
import { NoAutorizado } from '@/components/app/NoAutorizado';
import CxpCartera from '@/components/cxp/CxpCartera';
import { CxpTabs } from '@/components/cxp/CxpTabs';
import { obtenerContextoOrg } from '@/lib/orgContext';

export const metadata = { title: 'Cuentas por pagar' };

// El acceso lo valida proxy.ts (permiso "ver" de cxp) y cada RPC lo vuelve a exigir en la BD.
export default async function CxpPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await obtenerContextoOrg(slug);
  if (!ctx) notFound();
  if (!ctx.permisos.cxp) return <NoAutorizado modulo="Cuentas por pagar" />;

  return (
    <main className="ag-page">
      <CxpTabs slug={slug} activa="cartera" verCartera={ctx.permisos.cxp} verPagados={ctx.permisos.cxpPagos} />
      <CxpCartera
        organizacionId={ctx.organizacion.id}
        estado="pendiente"
        titulo="Cuentas por pagar"
        descripcion="Lo que se le debe a cada proveedor. Anota descuentos y retenciones, y marca como pagado."
      />
    </main>
  );
}
