import { notFound } from 'next/navigation';
import ReporteAgotados from '@/components/ReporteAgotados';
import { obtenerContextoOrg } from '@/lib/orgContext';
// Estilos propios del espacio de trabajo de AGOTADOS (prefijo agx-). No reemplazan a agotados.css, que otros módulos aún usan.
import '@/styles/agotados-hoja.css';

export const metadata = { title: 'Agotados' };

export default async function AgotadosPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await obtenerContextoOrg(slug);
  if (!ctx) notFound();
  if (!ctx.permisos.agotados) {
    return <main className="ag-page"><h1 className="mod-title">No tienes permiso para consultar Agotados.</h1></main>;
  }

  // El título y la descripción del módulo viven ahora en la franja superior del espacio de trabajo.
  return (
    <main className="agx-page">
      <ReporteAgotados organizacionId={ctx.organizacion.id} usuarioId={ctx.usuarioId} />
    </main>
  );
}
