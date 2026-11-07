import { notFound } from 'next/navigation';
import { ConfiguracionWeb } from '@/components/configuracion/ConfiguracionWeb';
import { obtenerContextoOrg } from '@/lib/orgContext';

export const metadata = { title: 'Configuración' };

// Configuración general de la web. Las preferencias de esta pantalla son personales: no abren datos de
// la organización, así que basta con ser miembro (obtenerContextoOrg ya lo comprueba).
export default async function ConfiguracionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await obtenerContextoOrg(slug);
  if (!ctx) notFound();

  return (
    <main className="mod-page">
      <div className="mod-head">
        <h1 className="mod-title">Configuración</h1>
      </div>
      <ConfiguracionWeb usuarioId={ctx.usuarioId} esAdmin={ctx.esAdmin} />
    </main>
  );
}
