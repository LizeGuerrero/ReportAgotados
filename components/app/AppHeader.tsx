import Link from 'next/link';
import { LogoMark } from '@/components/ui/icons';
import { NavModulos, type ModuloNav } from '@/components/app/NavModulos';
import { ThemeToggle } from '@/components/app/ThemeToggle';

interface Props {
  nombreOrganizacion: string;
  nombreUsuario: string;
  iniciales: string;
  modulos: ModuloNav[];
}

export function AppHeader({ nombreOrganizacion, nombreUsuario, iniciales, modulos }: Props) {
  return (
    <header className="app-header">
      <div className="app-header__inner">
        <Link href="/" className="app-brand">
          <span className="app-brand__mark">
            <LogoMark width={18} height={18} />
          </span>
          <span className="app-brand__name">{nombreOrganizacion}</span>
        </Link>

        <NavModulos modulos={modulos} />

        <div className="app-user">
          <ThemeToggle />
          <span className="app-user__avatar" aria-hidden="true">
            {iniciales}
          </span>
          <span className="app-user__name">{nombreUsuario}</span>
          <form action="/auth/signout" method="post">
            <button type="submit" className="ui-btn ui-btn--sm">
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
