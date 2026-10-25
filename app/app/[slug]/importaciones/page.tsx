import { notFound } from 'next/navigation';
import Importaciones from '@/components/importaciones/Importaciones';
import { obtenerContextoOrg } from '@/lib/orgContext';

export const metadata = { title: 'Importaciones' };

export default async function ImportacionesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await obtenerContextoOrg(slug);
  if (!ctx) notFound();

  return (
    <main style={{ padding: 16 }}>
      <h1 style={{ fontSize: 20, margin: '0 0 12px' }}>Importaciones</h1>
      <Importaciones organizacionId={ctx.organizacion.id} />
    </main>
  );
}
