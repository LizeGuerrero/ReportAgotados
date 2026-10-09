import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { obtenerContextoOrg } from '@/lib/orgContext';
import { PantallaCentrada } from '@/components/app/PantallaCentrada';
import { ChevronRightIcon } from '@/components/ui/icons';

interface OrgMembresia {
  slug: string;
  nombre: string;
}

export default async function HomePage() {
  // Llegó desde un enlace de invitación (la cookie la puso el proxy): primero se resuelve eso.
  if ((await cookies()).get('invite_token')?.value) redirect('/unirse');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('nombres, username')
    .eq('id', user!.id)
    .single();

  // Organizaciones donde el usuario tiene una membresía activa.
  const { data: membresias } = await supabase
    .from('membresias')
    .select('fecha_ingreso, organizaciones!inner(slug, nombre)')
    .eq('usuario_id', user!.id)
    .eq('activo', true)
    .eq('estado_membresia', 'activa')
    .order('fecha_ingreso', { ascending: true });

  const organizaciones: OrgMembresia[] = (membresias ?? [])
    .map((m) => (Array.isArray(m.organizaciones) ? m.organizaciones[0] : m.organizaciones))
    .filter((o): o is OrgMembresia => !!o);

  const nombre = profile?.nombres ?? profile?.username ?? user?.email;

  // Sin organización: no hay a dónde enviarlo.
  if (organizaciones.length === 0) {
    // Solicitudes de ingreso pendientes (la RPC devuelve el nombre; la organización aún no es legible).
    const { data: solicitudes } = await supabase.rpc('mis_solicitudes');
    const pendientes = (solicitudes ?? []) as { organizacion: string }[];

    return (
      <PantallaCentrada titulo={`Bienvenido, ${nombre}`} completa cerrarSesion>
        <p>Aún no perteneces a una organización. Crea una o únete a una existente.</p>
        {pendientes.length > 0 && (
          <div className="org-aviso" role="status">
            {pendientes.map((s) => (
              <p key={s.organizacion}>
                Solicitud enviada a <strong>{s.organizacion}</strong>. Un administrador debe aprobarla.
              </p>
            ))}
          </div>
        )}
        <div className="org-acciones">
          <Link href="/crear-organizacion" className="ui-btn ui-btn--primary">
            Crear una organización
          </Link>
          <Link href="/unirse" className="ui-btn">
            Unirme a una organización
          </Link>
        </div>
      </PantallaCentrada>
    );
  }

  // Una sola organización: directo a Agotados (o Pedidos si es lo único que puede ver).
  if (organizaciones.length === 1) {
    const { slug } = organizaciones[0];
    const ctx = await obtenerContextoOrg(slug);
    const base = `/app/${encodeURIComponent(slug)}`;
    // Con acceso a Cuentas por pagar, la página de la organización decide: selector (si también
    // tiene Pedidos) o entrada directa a CXP. Sin CXP, nada cambia.
    if (ctx?.permisos.cxp || ctx?.permisos.cxpPagos) redirect(base);
    if (ctx?.permisos.agotados) redirect(`${base}/agotados`);
    if (ctx?.permisos.pedidos) redirect(`${base}/pedidos`);
    // Sin módulos (Predeterminado) o solo administración: la página de la organización lo resuelve.
    redirect(base);
  }

  // Varias organizaciones: que elija.
  return (
    <PantallaCentrada titulo={`Bienvenido, ${nombre}`} completa cerrarSesion>
      <p>Elige la organización a la que quieres entrar.</p>
      <ul className="org-list">
        {organizaciones.map((o) => (
          <li key={o.slug}>
            <Link href={`/app/${encodeURIComponent(o.slug)}`}>
              {o.nombre}
              <ChevronRightIcon />
            </Link>
          </li>
        ))}
      </ul>
    </PantallaCentrada>
  );
}
