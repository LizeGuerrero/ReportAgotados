'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SettingsIcon } from '@/components/ui/icons';

/** Engranaje de la barra superior: entrada a la configuración general de la web. */
export function AjustesLink({ slug }: { slug: string }) {
  const ruta = usePathname();
  const href = `/app/${encodeURIComponent(slug)}/configuracion`;
  return (
    <Link
      href={href}
      className="app-theme app-ajustes"
      aria-label="Configuración"
      title="Configuración"
      aria-current={ruta.startsWith(href) ? 'page' : undefined}
    >
      <SettingsIcon />
    </Link>
  );
}
