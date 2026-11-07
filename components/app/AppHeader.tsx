import Link from 'next/link';
import { LogoMark } from '@/components/ui/icons';
import { NavModulos, type ModuloNav } from '@/components/app/NavModulos';
import { ThemeToggle } from '@/components/app/ThemeToggle';
import { AjustesLink } from '@/components/app/AjustesLink';
import { PresenciaHeader } from '@/components/presencia/PresenciaHeader';

interface Props {
  organizacionId: string;
  slug: string;
  usuarioId: string;
  /** Pantallas a las que este usuario puede ir (según sus permisos); lo usa la presencia. */
  segmentosPermitidos: string[];
  nombreOrganizacion: string;
  nombreUsuario: string;
  iniciales: string;
  modulos: ModuloNav[];
}

export function AppHeader({ organizacionId, slug, usuarioId, segmentosPermitidos, nombreOrganizacion, nombreUsuario, iniciales, modulos }: Props) {
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
          <PresenciaHeader organizacionId={organizacionId} slug={slug} segmentosPermitidos={segmentosPermitidos} usuario={{ id: usuarioId, nombre: nombreUsuario, iniciales }} />
          <ThemeToggle />
          <AjustesLink slug={slug} />
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
