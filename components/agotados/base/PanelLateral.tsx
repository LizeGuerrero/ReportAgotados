'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IcCerrar } from '../iconos';

export const PANEL_ANCHO_MIN = 240;
export const PANEL_ANCHO_MAX = 560;

/**
 * Panel acoplado a la derecha: se abre y se cierra, y su ancho se cambia arrastrando el borde izquierdo
 * (o con las flechas, si el borde tiene el foco). En pantallas estrechas se muestra encima de la tabla.
 */
export function PanelLateral({
  abierto,
  ancho,
  onAncho,
  titulo,
  onCerrar,
  children,
}: {
  abierto: boolean;
  ancho: number;
  onAncho: (px: number) => void;
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
}) {
  const raiz = useRef<HTMLElement>(null);
  const arrastre = useRef<{ x: number; base: number } | null>(null);
  const [moviendo, setMoviendo] = useState(false);
  const limitar = (n: number) => Math.min(PANEL_ANCHO_MAX, Math.max(PANEL_ANCHO_MIN, Math.round(n)));

  useEffect(() => {
    if (raiz.current) (raiz.current as HTMLElement & { inert: boolean }).inert = !abierto;
  }, [abierto]);

  return (
    <aside
      ref={raiz}
      className={`agx-panel${abierto ? ' is-abierto' : ''}${moviendo ? ' is-moviendo' : ''}`}
      style={{ ['--agx-panel-w' as string]: `${abierto ? limitar(ancho) : 0}px` }}
      aria-label={titulo}
      aria-hidden={!abierto}
    >
      <div
        className="agx-panel__tirador"
        role="separator"
        aria-orientation="vertical"
        aria-label={`Cambiar ancho del panel ${titulo}`}
        aria-valuenow={limitar(ancho)}
        aria-valuemin={PANEL_ANCHO_MIN}
        aria-valuemax={PANEL_ANCHO_MAX}
        tabIndex={0}
        title="Arrastra para cambiar el ancho"
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          arrastre.current = { x: e.clientX, base: limitar(ancho) };
          setMoviendo(true);
        }}
        onPointerMove={(e) => {
          const a = arrastre.current;
          if (a) onAncho(limitar(a.base + (a.x - e.clientX)));
        }}
        onPointerUp={(e) => {
          arrastre.current = null;
          setMoviendo(false);
          if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          arrastre.current = null;
          setMoviendo(false);
        }}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          onAncho(limitar(ancho + (e.key === 'ArrowLeft' ? 24 : -24)));
        }}
      />
      <div className="agx-panel__in" style={{ width: limitar(ancho) }}>
        <header className="agx-panel__cab">
          <h2 className="agx-panel__tit">{titulo}</h2>
          <button type="button" className="agx-ico-btn" onClick={onCerrar} aria-label={`Cerrar panel ${titulo}`} title="Cerrar panel">
            <IcCerrar />
          </button>
        </header>
        <div className="agx-panel__cuerpo">{children}</div>
      </div>
    </aside>
  );
}
