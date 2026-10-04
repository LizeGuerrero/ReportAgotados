'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { LoginForm } from '@/components/LoginForm';
import { RegisterForm } from '@/components/RegisterForm';
import { AuthShell } from '@/components/auth/AuthShell';
import { GoogleIcon, MailIcon } from '@/components/ui/icons';

export default function LoginPage() {
  const supabase = createClient();
  const [modo, setModo] = useState<'login' | 'registro'>('login');
  const [metodo, setMetodo] = useState<'email' | null>(null);
  // Si se llegó desde un enlace de invitación (?invite=TOKEN) se muestra a qué organización
  // y se abre directamente el registro. El token en sí lo guarda el proxy en una cookie.
  const [invitacion, setInvitacion] = useState<{ organizacion: string; email: string } | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('invite');
    if (!token) return;
    supabase.rpc('info_invitacion', { p_token: token }).then(({ data }) => {
      const fila = Array.isArray(data) ? data[0] : null;
      if (fila?.valida && fila.organizacion && fila.email) {
        setInvitacion({ organizacion: fila.organizacion, email: fila.email });
        setModo('registro');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        invitacion
          ? `Te invitaron a unirte a ${invitacion.organizacion}. Usa el correo ${invitacion.email} para aceptar la invitación.`
          : registrando
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

      {metodo === 'email' && modo === 'login' && (
        <LoginForm onVolver={() => setMetodo(null)} emailInicial={invitacion?.email} />
      )}
      {metodo === 'email' && modo === 'registro' && (
        <RegisterForm
          onVolver={() => setMetodo(null)}
          onIrALogin={() => setModo('login')}
          emailInvitacion={invitacion?.email}
        />
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
