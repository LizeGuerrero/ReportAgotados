import { notFound } from 'next/navigation';
import { NoAutorizado } from '@/components/app/NoAutorizado';
import CxpCartera from '@/components/cxp/CxpCartera';
import { CxpTabs } from '@/components/cxp/CxpTabs';
import { obtenerContextoOrg } from '@/lib/orgContext';

export const metadata = { title: 'Cuentas pagadas' };

// El acceso lo valida proxy.ts (permiso "ver" de cxp_pagos) y cada RPC lo vuelve a exigir en la BD.
export default async function CxpPagadosPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await obtenerContextoOrg(slug);
  if (!ctx) notFound();
  if (!ctx.permisos.cxpPagos) return <NoAutorizado modulo="Cuentas pagadas" />;

  return (
    <main className="ag-page">
      <CxpTabs slug={slug} activa="pagados" verCartera={ctx.permisos.cxp} verPagados={ctx.permisos.cxpPagos} />
      <CxpCartera
        organizacionId={ctx.organizacion.id}
        estado="pagado"
        titulo="Cuentas pagadas"
        descripcion="Documentos marcados como pagados, con la fecha y quién los pagó."
      />
    </main>
  );
}
