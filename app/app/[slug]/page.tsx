import { notFound, redirect } from 'next/navigation';
import { PantallaCentrada } from '@/components/app/PantallaCentrada';
import { obtenerContextoOrg } from '@/lib/orgContext';
import { createClient } from '@/lib/supabase/server';
import { etiquetaRol } from '@/lib/roles';

// Entrada a una organización: Agotados es el módulo principal; si el usuario
// no tiene acceso a él pero sí a Pedidos, entra por Pedidos.
export default async function OrganizacionInicio({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await obtenerContextoOrg(slug);
  if (!ctx) notFound();

  const base = `/app/${encodeURIComponent(slug)}`;
  if (ctx.permisos.agotados) redirect(`${base}/agotados`);
  if (ctx.permisos.pedidos) redirect(`${base}/pedidos`);

  if (ctx.esAdmin) redirect(`${base}/admin`);

  // Sin módulos (rol Predeterminado): solo sus datos básicos y los de la organización.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: perfil }, { data: org }, { data: membresia }] = await Promise.all([
    supabase.from('profiles').select('nombres, apellidos, tipo_documento, numero_documento').eq('id', user!.id).maybeSingle(),
    // identificacion se pide aparte: si la columna aún no existe, esto no rompe nada.
    supabase.from('organizaciones').select('identificacion').eq('id', ctx.organizacion.id).maybeSingle(),
    supabase
      .from('membresias')
      .select('roles!inner(nombre)')
      .eq('usuario_id', user!.id)
      .eq('organizacion_id', ctx.organizacion.id)
      .eq('activo', true)
      .eq('estado_membresia', 'activa')
      .maybeSingle(),
  ]);
  const rolNombre = Array.isArray(membresia?.roles)
    ? membresia?.roles[0]?.nombre
    : (membresia?.roles as { nombre: string } | null | undefined)?.nombre;
  const nombreCompleto = [perfil?.nombres, perfil?.apellidos].filter(Boolean).join(' ') || ctx.nombreUsuario;

  return (
    <PantallaCentrada titulo="Aún no tienes módulos habilitados">
      <p>Un administrador de {ctx.organizacion.nombre} debe asignarte un rol para que puedas usar los módulos.</p>
      <dl className="org-datos">
        <dt>Organización</dt>
        <dd>{ctx.organizacion.nombre}</dd>
        {org?.identificacion && (
          <>
            <dt>Identificación</dt>
            <dd>{org.identificacion}</dd>
          </>
        )}
        <dt>Nombre</dt>
        <dd>{nombreCompleto}</dd>
        <dt>Correo</dt>
        <dd>{user?.email}</dd>
        {perfil?.numero_documento && (
          <>
            <dt>Documento</dt>
            <dd>
              {perfil.tipo_documento} {perfil.numero_documento}
            </dd>
          </>
        )}
        <dt>Rol</dt>
        <dd>{etiquetaRol(rolNombre ?? 'viewer')}</dd>
      </dl>
    </PantallaCentrada>
  );
}
