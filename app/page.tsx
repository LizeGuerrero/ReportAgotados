import Link from 'next/link';
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
    return (
      <PantallaCentrada titulo={`Bienvenido, ${nombre}`} completa cerrarSesion>
        <p>Aún no perteneces a una organización. Contacta a soporte.</p>
      </PantallaCentrada>
    );
  }

  // Una sola organización: directo a Agotados (o Pedidos si es lo único que puede ver).
  if (organizaciones.length === 1) {
    const { slug } = organizaciones[0];
    const ctx = await obtenerContextoOrg(slug);
    const base = `/app/${encodeURIComponent(slug)}`;
    if (ctx?.permisos.agotados) redirect(`${base}/agotados`);
    if (ctx?.permisos.pedidos) redirect(`${base}/pedidos`);
    return (
      <PantallaCentrada titulo={`Bienvenido, ${nombre}`} completa cerrarSesion>
        <p>
          Perteneces a {organizaciones[0].nombre}, pero tu rol todavía no tiene módulos habilitados.
          Contacta a soporte.
        </p>
      </PantallaCentrada>
    );
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
