import { notFound } from 'next/navigation';
import { NoAutorizado } from '@/components/app/NoAutorizado';
import { AdminOrganizacion } from '@/components/admin/AdminOrganizacion';
import { obtenerContextoOrg } from '@/lib/orgContext';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Administración' };

// Panel del administrador de la organización. Además de esta comprobación de servidor, cada
// función de base de datos que usa el panel vuelve a exigir el rol admin de esta organización.
export default async function AdminPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await obtenerContextoOrg(slug);
  if (!ctx) notFound();
  if (!ctx.esAdmin) return <NoAutorizado modulo="Administración" />;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Por separado: si la columna aún no existe, el panel igual funciona.
  const { data: org } = await supabase
    .from('organizaciones')
    .select('identificacion')
    .eq('id', ctx.organizacion.id)
    .maybeSingle();

  // También por separado: si el parche del propietario aún no está aplicado, no hay propietario.
  const { data: prop } = await supabase
    .from('organizaciones')
    .select('propietario_id')
    .eq('id', ctx.organizacion.id)
    .maybeSingle();

  return (
    <AdminOrganizacion
      organizacionId={ctx.organizacion.id}
      slug={slug}
      nombreOrganizacion={ctx.organizacion.nombre}
      identificacion={org?.identificacion ?? null}
      usuarioActualId={user!.id}
      propietarioInicial={prop?.propietario_id ?? null}
    />
  );
}
