import type { ReactNode } from 'react';
import { APP_NAME } from '@/lib/brand';
import { CheckCircleIcon, LogoMark } from '@/components/ui/icons';

const PUNTOS = [
  'Reporte de agotados por sede',
  'Cotizaciones a proveedores y órdenes de compra',
  'Acceso por organización y rol',
];

interface Props {
  titulo: string;
  subtitulo: string;
  /** Tarjeta más ancha (el formulario de registro tiene campos en dos columnas). */
  ancho?: boolean;
  children: ReactNode;
}

function Marca() {
  return (
    <div className="auth-brand">
      <span className="auth-brand__mark">
        <LogoMark />
      </span>
      {APP_NAME}
    </div>
  );
}

/**
 * Estructura común de Login y Registro: panel de marca en escritorio, marca
 * compacta en móvil y una tarjeta con el formulario.
 */
export function AuthShell({ titulo, subtitulo, ancho = false, children }: Props) {
  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <Marca />
        <div>
          <p className="auth-aside__title">Del faltante en tienda a la orden de compra.</p>
          <p className="auth-aside__lead">
            Reporta agotados, cotiza con tus proveedores y genera órdenes de compra desde un solo lugar.
          </p>
          <ul className="auth-points">
            {PUNTOS.map((p) => (
              <li key={p}>
                <CheckCircleIcon />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-brand--compact">
          <Marca />
        </div>
        <div className={ancho ? 'auth-card auth-card--wide' : 'auth-card'}>
          <h1 className="auth-title">{titulo}</h1>
          <p className="auth-subtitle">{subtitulo}</p>
          {children}
        </div>
      </main>
    </div>
  );
}
