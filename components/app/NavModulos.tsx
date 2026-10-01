'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface ModuloNav {
  clave: string;
  texto: string;
  href: string;
}

export function NavModulos({ modulos }: { modulos: ModuloNav[] }) {
  const ruta = usePathname();

  if (modulos.length === 0) return null;

  return (
    <nav className="app-nav" aria-label="Módulos">
      {modulos.map((m) => (
        <Link
          key={m.clave}
          href={m.href}
          className="app-nav__link"
          aria-current={ruta.startsWith(m.href) ? 'page' : undefined}
        >
          {m.texto}
        </Link>
      ))}
    </nav>
  );
}
