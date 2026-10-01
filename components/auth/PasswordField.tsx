'use client';

import { useState, type ReactNode } from 'react';
import { Field } from '@/components/ui/Field';
import { EyeIcon, EyeOffIcon } from '@/components/ui/icons';

interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (valor: string) => void;
  autoComplete: 'current-password' | 'new-password';
  minLength?: number;
  hint?: ReactNode;
  action?: ReactNode;
  /** Contenido entre el campo y la ayuda (p. ej. la barra de fortaleza). */
  extra?: ReactNode;
}

/** Campo de contraseña con botón para mostrar/ocultar (útil sobre todo en móvil). */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  minLength,
  hint,
  action,
  extra,
}: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <Field id={id} label={label} hint={hint} action={action}>
      <div className="ui-password">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          className="ui-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          minLength={minLength}
          aria-describedby={hint ? `${id}-hint` : undefined}
          required
        />
        <button
          type="button"
          className="ui-password__toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={visible}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      {extra}
    </Field>
  );
}
