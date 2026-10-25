'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Botón que abre un panel flotante (se cierra con clic afuera o Escape). */
export default function MenuPop({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto]);

  return (
    <div className="cxp-pop-wrap" ref={ref}>
      <button
        type="button"
        className={abierto ? 'ui-btn is-active' : 'ui-btn'}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
      >
        {etiqueta}
      </button>
      {abierto && (
        <div className="cxp-pop" role="dialog" aria-label={etiqueta}>
          {children}
        </div>
      )}
    </div>
  );
}
