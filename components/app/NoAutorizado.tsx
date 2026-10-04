import Link from 'next/link';
import { PantallaCentrada } from '@/components/app/PantallaCentrada';

/** Pantalla para quien llega a un módulo (p. ej. escribiendo la URL) sin tener permiso. */
export function NoAutorizado({ modulo }: { modulo: string }) {
  return (
    <PantallaCentrada titulo="No tienes autorización para acceder a este módulo">
      <p>
        Módulo: <strong>{modulo}</strong>
      </p>
      <p>Pide a un administrador de tu organización que te asigne un rol con acceso.</p>
      <div className="org-acciones">
        <Link href="/" className="ui-btn">
          Volver al inicio
        </Link>
      </div>
    </PantallaCentrada>
  );
}
