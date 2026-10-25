import { notFound } from 'next/navigation';
import EstructurasMensajes from '@/components/mensajes/EstructurasMensajes';
import { obtenerContextoOrg } from '@/lib/orgContext';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Mensajes' };

export default async function MensajesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await obtenerContextoOrg(slug);
  if (!ctx) notFound();
  const supabase = await createClient();
  const { data: puedeEditar } = await supabase.rpc('tiene_permiso', {
    p_organizacion_id: ctx.organizacion.id,
    p_modulo: 'mensajes',
    p_accion: 'editar',
  });

  return (
    <main className="mod-page">
      <div className="mod-head"><h1 className="mod-title">Mensajes</h1></div>
      <EstructurasMensajes organizacionId={ctx.organizacion.id} puedeEditar={puedeEditar === true} />
    </main>
  );
}
