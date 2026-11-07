'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { seccionesVisibles, type ContextoSeccion } from '@/components/configuracion/secciones';

/**
 * Configuración general de la web: navegación por categorías a la izquierda (arriba en móvil) y el
 * contenido de la categoría elegida a la derecha. La categoría queda en la URL (#colaboracion).
 */
export function ConfiguracionWeb(props: ContextoSeccion) {
  const secciones = seccionesVisibles(props);
  const [clave, setClave] = useState(secciones[0]?.clave ?? '');
  const botones = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    const desdeHash = () => {
      const h = window.location.hash.replace('#', '');
      if (secciones.some((s) => s.clave === h)) setClave(h);
    };
    desdeHash();
    window.addEventListener('hashchange', desdeHash);
    return () => window.removeEventListener('hashchange', desdeHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function elegir(nueva: string, enfocar = false) {
    setClave(nueva);
    window.history.replaceState(null, '', `#${nueva}`);
    if (enfocar) botones.current[nueva]?.focus();
  }

  function teclado(e: KeyboardEvent) {
    const i = secciones.findIndex((s) => s.clave === clave);
    let j = i;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') j = (i + 1) % secciones.length;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') j = (i - 1 + secciones.length) % secciones.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = secciones.length - 1;
    else return;
    e.preventDefault();
    elegir(secciones[j].clave, true);
  }

  const actual = secciones.find((s) => s.clave === clave) ?? secciones[0];
  if (!actual) return null;
  const { Componente } = actual;

  return (
    <div className="cfg">
      <nav className="cfg-nav" aria-label="Categorías de configuración">
        <div className="cfg-nav__lista" role="tablist" aria-orientation="vertical" onKeyDown={teclado}>
          {secciones.map((s) => (
            <button
              key={s.clave}
              ref={(el) => {
                botones.current[s.clave] = el;
              }}
              id={`cfg-tab-${s.clave}`}
              type="button"
              role="tab"
              aria-selected={s.clave === actual.clave}
              aria-controls={`cfg-panel-${s.clave}`}
              tabIndex={s.clave === actual.clave ? 0 : -1}
              className="cfg-tab"
              onClick={() => elegir(s.clave)}
            >
              <s.Icono width={18} height={18} />
              <span className="cfg-tab__txt">
                <span className="cfg-tab__titulo">{s.titulo}</span>
                <span className="cfg-tab__desc">{s.descripcion}</span>
              </span>
            </button>
          ))}
        </div>
      </nav>

      <section
        className="cfg-panel"
        role="tabpanel"
        id={`cfg-panel-${actual.clave}`}
        aria-labelledby={`cfg-tab-${actual.clave}`}
      >
        <h2 className="cfg-panel__titulo">{actual.titulo}</h2>
        <Componente usuarioId={props.usuarioId} esAdmin={props.esAdmin} />
      </section>
    </div>
  );
}
