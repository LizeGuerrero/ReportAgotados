'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { IcCerrar } from '../iconos';

export interface SeccionConfig {
  clave: string;
  titulo: string;
  icono: ReactNode;
  /** Frase corta bajo el título de la sección. */
  descripcion?: string;
  contenido: ReactNode;
}

const ENFOCABLES = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Centro de configuración: ventana con índice de secciones a la izquierda y el contenido a la derecha.
 * Cada pantalla define sus secciones; la ventana solo pone el marco, el foco y el teclado.
 * Abre en la sección que se le indique (por ejemplo, desde el botón «Búsqueda»).
 */
export function CentroConfig({
  abierto,
  titulo,
  secciones,
  seccion,
  onSeccion,
  onCerrar,
  pie,
}: {
  abierto: boolean;
  titulo: string;
  secciones: SeccionConfig[];
  seccion: string;
  onSeccion: (clave: string) => void;
  onCerrar: () => void;
  pie?: ReactNode;
}) {
  const idTitulo = useId();
  const ventana = useRef<HTMLDivElement>(null);
  const previo = useRef<HTMLElement | null>(null);
  const actual = secciones.find((s) => s.clave === seccion) ?? secciones[0];

  // Foco: entra a la ventana y vuelve a donde estaba al cerrar
  useEffect(() => {
    if (!abierto) return;
    previo.current = document.activeElement as HTMLElement | null;
    ventana.current?.focus();
    return () => {
      previo.current?.focus?.();
    };
  }, [abierto]);

  if (!abierto || !actual) return null;

  function teclado(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onCerrar();
      return;
    }
    if (e.key !== 'Tab' || !ventana.current) return;
    const lista = Array.from(ventana.current.querySelectorAll<HTMLElement>(ENFOCABLES)).filter((n) => n.offsetParent !== null);
    if (lista.length === 0) return;
    const primero = lista[0];
    const ultimo = lista[lista.length - 1];
    if (e.shiftKey && (document.activeElement === primero || document.activeElement === ventana.current)) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primero.focus();
    }
  }

  return (
    <div
      className="agx-modal"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <div ref={ventana} className="agx-dialog" role="dialog" aria-modal="true" aria-labelledby={idTitulo} tabIndex={-1} onKeyDown={teclado}>
        <header className="agx-dialog__cab">
          <h2 id={idTitulo} className="agx-dialog__tit">
            {titulo}
          </h2>
          <button type="button" className="agx-ico-btn" onClick={onCerrar} aria-label="Cerrar configuración" title="Cerrar (Esc)">
            <IcCerrar />
          </button>
        </header>
        <div className="agx-dialog__cuerpo">
          <nav className="agx-dialog__nav" aria-label="Secciones de configuración">
            {secciones.map((s) => (
              <button
                key={s.clave}
                type="button"
                className={`agx-nav${s.clave === actual.clave ? ' is-activo' : ''}`}
                aria-current={s.clave === actual.clave ? 'page' : undefined}
                onClick={() => onSeccion(s.clave)}
              >
                {s.icono}
                <span>{s.titulo}</span>
              </button>
            ))}
          </nav>
          <section className="agx-dialog__sec" aria-labelledby={`${idTitulo}-s`}>
            <h3 id={`${idTitulo}-s`} className="agx-dialog__sec-tit">
              {actual.titulo}
            </h3>
            {actual.descripcion && <p className="agx-dialog__sec-desc">{actual.descripcion}</p>}
            {actual.contenido}
          </section>
        </div>
        {pie && <footer className="agx-dialog__pie">{pie}</footer>}
      </div>
    </div>
  );
}
