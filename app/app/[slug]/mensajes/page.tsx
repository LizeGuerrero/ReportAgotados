import { notFound } from 'next/navigation';
import MensajesModulo from '@/components/mensajes/MensajesModulo';
import { obtenerContextoOrg } from '@/lib/orgContext';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Mensajes' };

/** Mensajes: una pestaña por proceso (Pedidos y Cuentas por pagar). */
export default async function MensajesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await obtenerContextoOrg(slug);
  if (!ctx) notFound();
  const supabase = await createClient();
  const [ver, editar] = await Promise.all([
    supabase.rpc('tiene_permiso', { p_organizacion_id: ctx.organizacion.id, p_modulo: 'mensajes', p_accion: 'ver' }),
    supabase.rpc('tiene_permiso', { p_organizacion_id: ctx.organizacion.id, p_modulo: 'mensajes', p_accion: 'editar' }),
  ]);
  const verCxp = ctx.permisos.cxpMensajes === true;
  const verPedidos = ver.data === true || editar.data === true;
  if (!verPedidos && !verCxp) notFound();

  return (
    <main className="mod-page">
      <div className="mod-head"><h1 className="mod-title">Mensajes</h1></div>
      <MensajesModulo
        organizacionId={ctx.organizacion.id} empresa={ctx.organizacion.nombre} usuario={ctx.nombreUsuario}
        puedeEditarPedidos={editar.data === true} verPedidos={verPedidos} verCxp={verCxp}
      />
    </main>
  );
}
