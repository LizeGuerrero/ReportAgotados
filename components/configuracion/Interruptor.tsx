'use client';

import { useId } from 'react';

interface Props {
  titulo: string;
  descripcion?: string;
  activo: boolean;
  onCambio: (valor: boolean) => void;
  deshabilitado?: boolean;
  /** Texto bajo la descripción cuando está deshabilitado (explica por qué). */
  nota?: string;
}

/** Fila con interruptor accesible (role="switch"): se activa con clic, Espacio o Enter. */
export function Interruptor({ titulo, descripcion, activo, onCambio, deshabilitado, nota }: Props) {
  const id = useId();
  return (
    <div className="cfg-fila" data-off={deshabilitado ? 'true' : undefined}>
      <div className="cfg-fila__txt">
        <span id={`${id}-t`} className="cfg-fila__titulo">
          {titulo}
        </span>
        {descripcion && (
          <span id={`${id}-d`} className="cfg-fila__desc">
            {descripcion}
          </span>
        )}
        {deshabilitado && nota && <span className="cfg-fila__nota">{nota}</span>}
      </div>
      <button
        type="button"
        role="switch"
        className="cfg-switch"
        aria-checked={activo}
        aria-labelledby={`${id}-t`}
        aria-describedby={descripcion ? `${id}-d` : undefined}
        disabled={deshabilitado}
        onClick={() => onCambio(!activo)}
      >
        <span className="cfg-switch__pista" aria-hidden="true">
          <span className="cfg-switch__bola" />
        </span>
      </button>
    </div>
  );
}
