'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/** Botón + menú emergente que se cierra al hacer clic fuera o con Escape (y devuelve el foco al botón). */
export function MenuPop({
  boton,
  etiqueta,
  alineacion = 'der',
  className = '',
  children,
}: {
  /** Contenido del botón. */
  boton: ReactNode;
  etiqueta: string;
  alineacion?: 'izq' | 'der';
  className?: string;
  children: (cerrar: () => void) => ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const idMenu = useId();

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setAbierto(false);
        raiz.current?.querySelector<HTMLElement>('button')?.focus();
      }
    };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto]);

  return (
    <div className={`agx-pop ${className}`} ref={raiz}>
      <button
        type="button"
        className={`agx-btn${abierto ? ' is-activo' : ''}`}
        aria-haspopup="true"
        aria-expanded={abierto}
        aria-controls={abierto ? idMenu : undefined}
        aria-label={etiqueta}
        onClick={() => setAbierto((v) => !v)}
      >
        {boton}
      </button>
      {abierto && (
        <div id={idMenu} className={`agx-pop__menu agx-pop__menu--${alineacion}`} role="group" aria-label={etiqueta}>
          {children(() => setAbierto(false))}
        </div>
      )}
    </div>
  );
}
