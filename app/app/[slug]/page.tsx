import { notFound, redirect } from 'next/navigation';
import { PantallaCentrada } from '@/components/app/PantallaCentrada';
import { obtenerContextoOrg } from '@/lib/orgContext';

// Entrada a una organización: Agotados es el módulo principal; si el usuario
// no tiene acceso a él pero sí a Pedidos, entra por Pedidos.
export default async function OrganizacionInicio({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await obtenerContextoOrg(slug);
  if (!ctx) notFound();

  const base = `/app/${encodeURIComponent(slug)}`;
  if (ctx.permisos.agotados) redirect(`${base}/agotados`);
  if (ctx.permisos.pedidos) redirect(`${base}/pedidos`);

  return (
    <PantallaCentrada titulo="Aún no tienes módulos habilitados">
      <p>Tu rol en {ctx.organizacion.nombre} todavía no tiene acceso a ningún módulo. Contacta a soporte.</p>
    </PantallaCentrada>
  );
}
