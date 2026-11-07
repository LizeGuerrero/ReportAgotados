'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface ItemMenu { texto: string; onClick: () => void; peligro?: boolean; deshabilitado?: boolean; ayuda?: string }

/** Menú desplegable simple (botón ⋯). Se cierra con clic fuera, Escape o al elegir. */
export default function Menu({ etiqueta, items, children }: { etiqueta: string; items: (ItemMenu | 'sep')[]; children?: ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', tecla); };
  }, [abierto]);

  return (
    <div className="msj-menu" ref={raiz}>
      <button type="button" className="msj-btn msj-btn--ghost" aria-haspopup="menu" aria-expanded={abierto} aria-label={etiqueta}
        onClick={() => setAbierto((a) => !a)}>{children ?? '⋯'}</button>
      {abierto && (
        <div className="msj-menu__lista" role="menu">
          {items.map((it, i) => it === 'sep'
            ? <div key={`s${i}`} className="msj-menu__sep" role="separator" />
            : (
              <button key={it.texto} type="button" role="menuitem" disabled={it.deshabilitado} title={it.ayuda}
                className={it.peligro ? 'msj-menu__item msj-menu__item--peligro' : 'msj-menu__item'}
                onClick={() => { setAbierto(false); it.onClick(); }}>{it.texto}</button>
            ))}
        </div>
      )}
    </div>
  );
}
