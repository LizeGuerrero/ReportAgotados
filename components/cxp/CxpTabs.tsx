import Link from 'next/link';

export type PestanaCxp = 'cartera' | 'excluidas' | 'pagados' | 'reglas' | 'cargar' | 'mensajes';

export interface PermisosTabsCxp {
  cxp: boolean;
  cxpPagos: boolean;
  cxpReglas: boolean;
  cxpImportar: boolean;
  cxpMensajes: boolean;
}

/** Pestañas de la aplicación de Cuentas por pagar. Solo muestra lo que el usuario puede ver. */
export function CxpTabs({
  slug,
  activa,
  permisos,
}: {
  slug: string;
  activa: PestanaCxp;
  permisos: PermisosTabsCxp;
}) {
  const base = `/app/${encodeURIComponent(slug)}`;
  const pestanas = [
    permisos.cxp && { clave: 'cartera', texto: 'Cartera', href: `${base}/cxp` },
    permisos.cxp && { clave: 'excluidas', texto: 'Excluidas', href: `${base}/cxp/excluidas` },
    permisos.cxpPagos && { clave: 'pagados', texto: 'Pagados', href: `${base}/cxp-pagados` },
    permisos.cxpReglas && { clave: 'reglas', texto: 'Reglas (REC NO REV)', href: `${base}/cxp-reglas` },
    permisos.cxpImportar && { clave: 'cargar', texto: 'Cargar archivo', href: `${base}/cxp-cargar` },
    permisos.cxpMensajes && { clave: 'mensajes', texto: 'Mensajes', href: `${base}/cxp-mensajes` },
  ].filter(Boolean) as { clave: string; texto: string; href: string }[];

  if (pestanas.length < 2) return null;

  return (
    <nav className="cxp-tabs" aria-label="Cuentas por pagar">
      {pestanas.map((t) => (
        <Link
          key={t.clave}
          href={t.href}
          className={t.clave === activa ? 'cxp-tab is-active' : 'cxp-tab'}
          aria-current={t.clave === activa ? 'page' : undefined}
        >
          {t.texto}
        </Link>
      ))}
    </nav>
  );
}
