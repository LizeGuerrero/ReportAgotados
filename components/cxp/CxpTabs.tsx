import Link from 'next/link';

/** Pestañas de la aplicación de Cuentas por pagar. Solo muestra lo que el usuario puede ver. */
export function CxpTabs({
  slug,
  activa,
  verCartera,
  verPagados,
}: {
  slug: string;
  activa: 'cartera' | 'pagados';
  verCartera: boolean;
  verPagados: boolean;
}) {
  const base = `/app/${encodeURIComponent(slug)}`;
  const pestanas = [
    verCartera && { clave: 'cartera', texto: 'Cartera', href: `${base}/cxp` },
    verPagados && { clave: 'pagados', texto: 'Pagados', href: `${base}/cxp-pagados` },
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
