'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Barra que se pliega con animación (como la cinta de Excel o los menús de Sheets).
 * Plegada queda fuera del orden de tabulación y de los lectores de pantalla (`inert`).
 * Mientras anima recorta su contenido; ya abierta lo deja salir, para que los menús desplegables no se corten.
 */
export function Barra({
  visible,
  etiqueta,
  className = '',
  children,
}: {
  visible: boolean;
  etiqueta: string;
  className?: string;
  children: ReactNode;
}) {
  const interior = useRef<HTMLDivElement>(null);
  const [estable, setEstable] = useState(visible);

  useEffect(() => {
    if (interior.current) (interior.current as HTMLElement & { inert: boolean }).inert = !visible;
    setEstable(false);
    const t = setTimeout(() => setEstable(true), 260); // respaldo si no llega transitionend (movimiento reducido)
    return () => clearTimeout(t);
  }, [visible]);

  return (
    <div
      className={`agx-collapse ${className}`}
      data-abierta={visible}
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget) setEstable(true);
      }}
    >
      <div
        ref={interior}
        className={`agx-collapse__in${visible && estable ? ' is-estable' : ''}`}
        aria-hidden={!visible}
        role="group"
        aria-label={etiqueta}
      >
        {children}
      </div>
    </div>
  );
}

/** Conjunto de botones de la cinta, con su nombre debajo (como los grupos de Excel). */
export function GrupoH({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="agx-grupo" role="group" aria-label={titulo}>
      <div className="agx-grupo__botones">{children}</div>
      <span className="agx-grupo__titulo" aria-hidden="true">
        {titulo}
      </span>
    </div>
  );
}

export function SepH() {
  return <span className="agx-sep" aria-hidden="true" />;
}

/** Botón de herramienta: icono + texto (el texto se puede ocultar desde la configuración). */
export function BotonH({
  icono,
  texto,
  nombre,
  ayuda,
  onClick,
  activo,
  deshabilitado,
  cargando,
  solo,
  tono,
}: {
  icono: ReactNode;
  texto: string;
  /** Nombre completo para lectores de pantalla cuando `texto` es una versión corta (debe contener `texto`). */
  nombre?: string;
  /** Texto largo al pasar el mouse. Si no hay, se usa `texto`. */
  ayuda?: string;
  onClick?: () => void;
  /** Muestra el botón como interruptor (aria-pressed). */
  activo?: boolean;
  deshabilitado?: boolean;
  cargando?: boolean;
  /** Fuerza solo icono. */
  solo?: boolean;
  tono?: 'primario';
}) {
  return (
    <button
      type="button"
      className={`agx-tb${activo ? ' is-activo' : ''}${cargando ? ' is-cargando' : ''}${tono ? ` agx-tb--${tono}` : ''}`}
      aria-pressed={activo === undefined ? undefined : activo}
      aria-label={nombre ?? (solo ? texto : undefined)}
      title={ayuda ?? texto}
      disabled={deshabilitado}
      onClick={onClick}
    >
      {icono}
      {!solo && <span className="agx-tb__txt">{texto}</span>}
    </button>
  );
}

/** Elección única entre pocas opciones, con iconos (p. ej. densidad de filas). */
export function Segmentado<V extends string>({
  etiqueta,
  valor,
  opciones,
  onCambio,
}: {
  etiqueta: string;
  valor: V;
  opciones: { valor: V; texto: string; icono: ReactNode }[];
  onCambio: (v: V) => void;
}) {
  return (
    <div className="agx-seg" role="radiogroup" aria-label={etiqueta}>
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={valor === o.valor}
          aria-label={o.texto}
          title={o.texto}
          className={`agx-seg__op${valor === o.valor ? ' is-activo' : ''}`}
          onClick={() => onCambio(o.valor)}
        >
          {o.icono}
        </button>
      ))}
    </div>
  );
}
