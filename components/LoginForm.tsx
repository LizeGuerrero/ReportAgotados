'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Field } from '@/components/ui/Field';
import { PasswordField } from '@/components/auth/PasswordField';
import { AlertIcon, ArrowLeftIcon } from '@/components/ui/icons';

interface Props {
  onVolver: () => void;
}

export function LoginForm({ onVolver }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);

    // Pasa por nuestro propio endpoint (no llama a Supabase directo desde el
    // navegador) para que el rate limiting de intentos fallidos aplique.
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? 'No se pudo iniciar sesión.');
      setCargando(false);
      return;
    }

    router.replace('/');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      <Field id="login-email" label="Correo electrónico">
        <input
          id="login-email"
          type="email"
          className="ui-input"
          placeholder="nombre@empresa.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
      </Field>
      <PasswordField
        id="login-password"
        label="Contraseña"
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
        action={
          <a href="/recuperar-password" className="ui-link auth-forgot">
            ¿Olvidaste tu contraseña?
          </a>
        }
      />
      {error && (
        <div role="alert" className="ui-alert ui-alert--error">
          <AlertIcon className="ui-alert__icon" />
          <p>{error}</p>
        </div>
      )}
      <button
        type="submit"
        disabled={cargando}
        aria-busy={cargando}
        className={`ui-btn ui-btn--primary ui-btn--block${cargando ? ' is-loading' : ''}`}
      >
        {cargando ? 'Ingresando...' : 'Ingresar'}
      </button>
      <button type="button" onClick={onVolver} className="ui-btn ui-btn--ghost ui-btn--block">
        <ArrowLeftIcon />
        Otras opciones
      </button>
    </form>
  );
}
