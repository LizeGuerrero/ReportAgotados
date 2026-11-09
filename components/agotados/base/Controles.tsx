'use client';

import { useId, type ReactNode } from 'react';

/** Interruptor accesible (checkbox con role="switch") con título y explicación. */
export function Interruptor({
  titulo,
  ayuda,
  marcado,
  onCambio,
  deshabilitado,
}: {
  titulo: string;
  ayuda?: string;
  marcado: boolean;
  onCambio: (v: boolean) => void;
  deshabilitado?: boolean;
}) {
  const id = useId();
  return (
    <label className={`agx-opt${deshabilitado ? ' is-off' : ''}`} htmlFor={id}>
      <span className="agx-opt__txt">
        <span className="agx-opt__tit">{titulo}</span>
        {ayuda && <span className="agx-opt__ayuda">{ayuda}</span>}
      </span>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="agx-switch"
        checked={marcado}
        disabled={deshabilitado}
        onChange={(e) => onCambio(e.target.checked)}
      />
    </label>
  );
}

/** Opción de una elección única (radio) con título y explicación. */
export function OpcionRadio({
  nombre,
  titulo,
  ayuda,
  marcado,
  onElegir,
  extra,
}: {
  nombre: string;
  titulo: string;
  ayuda?: string;
  marcado: boolean;
  onElegir: () => void;
  extra?: ReactNode;
}) {
  return (
    <label className={`agx-radio${marcado ? ' is-marcado' : ''}`}>
      <input type="radio" name={nombre} checked={marcado} onChange={onElegir} />
      <span className="agx-opt__txt">
        <span className="agx-opt__tit">{titulo}</span>
        {ayuda && <span className="agx-opt__ayuda">{ayuda}</span>}
      </span>
      {extra}
    </label>
  );
}

/** Casilla con título (varias a la vez). */
export function OpcionCasilla({
  titulo,
  ayuda,
  marcado,
  onCambio,
}: {
  titulo: string;
  ayuda?: string;
  marcado: boolean;
  onCambio: (v: boolean) => void;
}) {
  return (
    <label className="agx-radio">
      <input type="checkbox" checked={marcado} onChange={(e) => onCambio(e.target.checked)} />
      <span className="agx-opt__txt">
        <span className="agx-opt__tit">{titulo}</span>
        {ayuda && <span className="agx-opt__ayuda">{ayuda}</span>}
      </span>
    </label>
  );
}

export function TituloSeccion({ children }: { children: ReactNode }) {
  return <h3 className="agx-sec-tit">{children}</h3>;
}
