import { notFound } from 'next/navigation';
import { NoAutorizado } from '@/components/app/NoAutorizado';
import CxpCartera from '@/components/cxp/CxpCartera';
import { CxpTabs } from '@/components/cxp/CxpTabs';
import { obtenerContextoOrg } from '@/lib/orgContext';

export const metadata = { title: 'Cuentas por pagar · Excluidas' };

// Mismo permiso que la cartera (cxp · ver): proxy.ts lo valida y cada RPC lo exige en la BD.
export default async function CxpExcluidasPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await obtenerContextoOrg(slug);
  if (!ctx) notFound();
  if (!ctx.permisos.cxp) return <NoAutorizado modulo="Cuentas por pagar" />;

  return (
    <main className="ag-page">
      <CxpTabs slug={slug} activa="excluidas" permisos={ctx.permisos} />
      <CxpCartera
        organizacionId={ctx.organizacion.id}
        empresaNombre={ctx.organizacion.nombre}
        usuarioNombre={ctx.nombreUsuario}
        estado="excluido"
        titulo="Documentos excluidos"
        descripcion="Están en el ERP pero no son una cuenta por pagar real (REC NO REV). La nota indica qué debe hacer contabilidad."
      />
    </main>
  );
}
