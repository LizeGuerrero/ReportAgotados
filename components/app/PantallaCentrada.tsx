import type { ReactNode } from 'react';
import { BuildingIcon } from '@/components/ui/icons';

interface Props {
  titulo: string;
  children: ReactNode;
  /** Ocupa toda la pantalla (fuera de la cabecera de una organización). */
  completa?: boolean;
  /** Muestra "Cerrar sesión" (cuando no hay cabecera que lo ofrezca). */
  cerrarSesion?: boolean;
}

/** Mensaje centrado para estados sin contenido: sin organización, sin módulos, etc. */
export function PantallaCentrada({ titulo, children, completa = false, cerrarSesion = false }: Props) {
  return (
    <main className={completa ? 'status-page status-page--full' : 'status-page'}>
      <div className="status-card">
        <div className="status-card__icon">
          <BuildingIcon />
        </div>
        <h1 className="status-card__title">{titulo}</h1>
        <div className="status-card__body">{children}</div>
        {cerrarSesion && (
          <form action="/auth/signout" method="post" className="status-card__actions">
            <button type="submit" className="ui-btn">
              Cerrar sesión
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
