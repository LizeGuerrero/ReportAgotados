import { notFound } from 'next/navigation';
import { AppHeader } from '@/components/app/AppHeader';
import type { ModuloNav } from '@/components/app/NavModulos';
import { obtenerContextoOrg } from '@/lib/orgContext';

// Cabecera compartida por los módulos de la organización. No toca el contenido
// ni los estilos de cada módulo: solo añade navegación arriba.
export default async function OrganizacionLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await obtenerContextoOrg(slug);
  if (!ctx) notFound();

  const base = `/app/${encodeURIComponent(slug)}`;
  const modulos: ModuloNav[] = [];
  if (ctx.permisos.agotados) modulos.push({ clave: 'agotados', texto: 'Agotados', href: `${base}/agotados` });
  // El botón de Pedidos solo existe para quien tiene permiso de ver ese módulo.
  if (ctx.permisos.pedidos) modulos.push({ clave: 'pedidos', texto: 'Pedidos', href: `${base}/pedidos` });
  if (ctx.permisos.items) modulos.push({ clave: 'items', texto: 'Ítems', href: `${base}/items` });
  if (ctx.permisos.proveedores) modulos.push({ clave: 'proveedores', texto: 'Proveedores', href: `${base}/proveedores` });
  // Cuentas por pagar: entra por la cartera, o por Pagados si solo tiene ese permiso.
  if (ctx.permisos.cxp) modulos.push({ clave: 'cxp', texto: 'Cuentas por pagar', href: `${base}/cxp` });
  else if (ctx.permisos.cxpPagos) modulos.push({ clave: 'cxp', texto: 'Cuentas por pagar', href: `${base}/cxp-pagados` });
  // Panel de la organización: solo administradores.
  if (ctx.esAdmin) modulos.push({ clave: 'admin', texto: 'Administración', href: `${base}/admin` });

  return (
    <>
      <AppHeader
        nombreOrganizacion={ctx.organizacion.nombre}
        nombreUsuario={ctx.nombreUsuario}
        iniciales={ctx.iniciales}
        modulos={modulos}
      />
      {children}
    </>
  );
}
