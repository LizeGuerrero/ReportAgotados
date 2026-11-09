'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Barra } from './Barra';
import { PanelLateral } from './PanelLateral';
import { IcChevAbajo } from '../iconos';

export interface BarrasVisibles {
  herramientas: boolean;
  estado: boolean;
  panel: boolean;
}

/**
 * Marco de una pantalla tipo «hoja de cálculo»: ocupa la altura libre bajo la cabecera de la aplicación y
 * reparte el espacio entre franja superior, cinta de herramientas, zona central (la tabla),
 * panel lateral y barra de estado. Cada barra se oculta por separado y el «modo enfocado» las oculta todas
 * dejando solo un pequeño control flotante para volver (Ctrl+Mayús+F).
 */
export function EspacioTrabajo({
  listo,
  barras,
  enfoque,
  onEnfoque,
  franja,
  cinta,
  panel,
  tituloPanel,
  anchoPanel,
  onAnchoPanel,
  onCerrarPanel,
  estado,
  flotante,
  children,
}: {
  listo: boolean;
  barras: BarrasVisibles;
  enfoque: boolean;
  onEnfoque: (v: boolean) => void;
  /** Franja fina superior: título, filtro y búsqueda, accesos para mostrar/ocultar y configuración. */
  franja: ReactNode;
  cinta: ReactNode;
  panel: ReactNode;
  tituloPanel: string;
  anchoPanel: number;
  onAnchoPanel: (px: number) => void;
  onCerrarPanel: () => void;
  estado: ReactNode;
  /** Lo que sigue a mano en modo enfocado (p. ej. un paginador mínimo). */
  flotante?: ReactNode;
  children: ReactNode;
}) {
  // La cabecera de la aplicación es de otro módulo: solo se mide para repartir la altura restante.
  const [arriba, setArriba] = useState(0);
  useEffect(() => {
    const cab = document.querySelector<HTMLElement>('.app-header');
    if (!cab) return;
    const medir = () => setArriba(Math.round(cab.getBoundingClientRect().height));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(cab);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        onEnfoque(!enfoque);
      }
    }
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [enfoque, onEnfoque]);

  const ver = (b: boolean) => !enfoque && b;

  return (
    <section
      className={`agx-ws${listo ? '' : ' is-cargando'}${enfoque ? ' is-enfoque' : ''}`}
      style={{ ['--agx-top' as string]: `${arriba}px` }}
    >
      <Barra visible={!enfoque} etiqueta="Título y accesos" className="agx-b-franja">
        {franja}
      </Barra>
      <Barra visible={ver(barras.herramientas)} etiqueta="Herramientas" className="agx-b-cinta">
        {cinta}
      </Barra>

      <div className="agx-ws__cuerpo">
        <div className="agx-ws__centro">{children}</div>
        <PanelLateral
          abierto={ver(barras.panel)}
          ancho={anchoPanel}
          onAncho={onAnchoPanel}
          titulo={tituloPanel}
          onCerrar={onCerrarPanel}
        >
          {panel}
        </PanelLateral>
      </div>

      <Barra visible={ver(barras.estado)} etiqueta="Barra de estado" className="agx-b-estado">
        {estado}
      </Barra>

      {enfoque && (
        <div className="agx-flotante" role="group" aria-label="Controles del modo enfocado">
          {flotante}
          <button
            type="button"
            className="agx-flotante__btn"
            onClick={() => onEnfoque(false)}
            title="Mostrar herramientas (Ctrl+Mayús+F)"
            aria-label="Mostrar herramientas"
          >
            <IcChevAbajo />
            <span>Herramientas</span>
          </button>
        </div>
      )}
    </section>
  );
}
