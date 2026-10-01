import type { ReactNode } from 'react';

interface Props {
  id: string;
  label: string;
  /** Texto de ayuda bajo el campo. Enlázalo en el input con aria-describedby={`${id}-hint`}. */
  hint?: ReactNode;
  /** Elemento a la derecha de la etiqueta (p. ej. "¿Olvidaste tu contraseña?"). */
  action?: ReactNode;
  children: ReactNode;
}

/** Etiqueta visible + control + ayuda. Un solo patrón para todos los formularios. */
export function Field({ id, label, hint, action, children }: Props) {
  return (
    <div className="ui-field">
      <div className="ui-field__head">
        <label htmlFor={id} className="ui-label">
          {label}
        </label>
        {action}
      </div>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="ui-hint">
          {hint}
        </p>
      )}
    </div>
  );
}
