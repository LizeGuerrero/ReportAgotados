import Link from 'next/link';
import { PantallaCentrada } from '@/components/app/PantallaCentrada';
import { ChevronRightIcon } from '@/components/ui/icons';
import '@/styles/cxp.css';

export interface Aplicacion {
  clave: string;
  titulo: string;
  descripcion: string;
  href: string;
}

/** Pantalla para elegir a qué aplicación entrar. Solo se muestra a quien tiene acceso a más de una. */
export function SelectorAplicacion({
  organizacion,
  aplicaciones,
}: {
  organizacion: string;
  aplicaciones: Aplicacion[];
}) {
  return (
    <PantallaCentrada titulo={`¿A dónde quieres entrar en ${organizacion}?`}>
      <ul className="org-list">
        {aplicaciones.map((a) => (
          <li key={a.clave}>
            <Link href={a.href}>
              <span>
                {a.titulo}
                <span className="cxp-apps__desc">{a.descripcion}</span>
              </span>
              <ChevronRightIcon />
            </Link>
          </li>
        ))}
      </ul>
    </PantallaCentrada>
  );
}
