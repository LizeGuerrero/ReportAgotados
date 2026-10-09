import { notFound, redirect } from 'next/navigation';
import { PantallaCentrada } from '@/components/app/PantallaCentrada';
import { SelectorAplicacion, type Aplicacion } from '@/components/app/SelectorAplicacion';
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

  // Aplicaciones a las que tiene acceso. Con más de una elige; con una sola entra directo (como antes).
  const rutaPedidos = ctx.permisos.agotados
    ? `${base}/agotados`
    : ctx.permisos.pedidos
      ? `${base}/pedidos`
      : ctx.permisos.items
        ? `${base}/items`
        : ctx.permisos.proveedores
          ? `${base}/proveedores`
          : null;
  const rutaCxp = ctx.permisos.cxp ? `${base}/cxp` : ctx.permisos.cxpPagos ? `${base}/cxp-pagados` : null;
  if (rutaPedidos && rutaCxp) {
    const aplicaciones: Aplicacion[] = [
      { clave: 'pedidos', titulo: 'Pedidos', descripcion: 'Agotados, cotizaciones, órdenes de compra, ítems y proveedores', href: rutaPedidos },
      { clave: 'cxp', titulo: 'Cuentas por pagar', descripcion: 'Cartera por proveedor, vencimientos y pagos', href: rutaCxp },
    ];
    return <SelectorAplicacion organizacion={ctx.organizacion.nombre} aplicaciones={aplicaciones} />;
  }
  if (rutaPedidos) redirect(rutaPedidos);
  if (rutaCxp) redirect(rutaCxp);

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
