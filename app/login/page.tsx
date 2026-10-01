'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { LoginForm } from '@/components/LoginForm';
import { RegisterForm } from '@/components/RegisterForm';
import { AuthShell } from '@/components/auth/AuthShell';
import { GoogleIcon, MailIcon } from '@/components/ui/icons';

export default function LoginPage() {
  const supabase = createClient();
  const [modo, setModo] = useState<'login' | 'registro'>('login');
  const [metodo, setMetodo] = useState<'email' | null>(null);

  async function iniciarConGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // Fuerza a que Google siempre muestre el selector de cuenta, en vez
        // de reautenticar en silencio con la sesión de Google ya abierta en
        // el navegador. No cierra la sesión de Google (eso no le compete a
        // esta app), pero hace explícito que el usuario está eligiendo entrar.
        queryParams: { prompt: 'select_account' },
      },
    });
  }

  const registrando = modo === 'registro';

  return (
    <AuthShell
      titulo={registrando ? 'Crea tu cuenta' : 'Inicia sesión'}
      subtitulo={
        registrando
          ? 'Completa tus datos para empezar a usar la plataforma.'
          : 'Accede con tu cuenta para continuar.'
      }
      ancho={registrando && metodo === 'email'}
    >
      {!metodo && (
        <div className="auth-methods">
          <button type="button" onClick={iniciarConGoogle} className="ui-btn ui-btn--block">
            <GoogleIcon />
            Continuar con Google
          </button>
          <div className="ui-divider" aria-hidden="true">
            o
          </div>
          <button
            type="button"
            onClick={() => setMetodo('email')}
            className="ui-btn ui-btn--primary ui-btn--block"
          >
            <MailIcon />
            Continuar con correo
          </button>
        </div>
      )}

      {metodo === 'email' && modo === 'login' && <LoginForm onVolver={() => setMetodo(null)} />}
      {metodo === 'email' && modo === 'registro' && (
        <RegisterForm onVolver={() => setMetodo(null)} onIrALogin={() => setModo('login')} />
      )}

      <p className="auth-switch">
        {modo === 'login' ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? '}
        <button
          type="button"
          onClick={() => {
            setModo(modo === 'login' ? 'registro' : 'login');
            setMetodo(null);
          }}
          className="ui-link"
        >
          {modo === 'login' ? 'Regístrate' : 'Inicia sesión'}
        </button>
      </p>
    </AuthShell>
  );
}
