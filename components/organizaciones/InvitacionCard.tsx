'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertIcon } from '@/components/ui/icons';
import { aceptarInvitacion, rechazarInvitacion, descartarInvitacion } from '@/app/unirse/actions';

interface Props {
  token: string;
  organizacion: string;
  emailInvitado: string;
  emailSesion: string;
}

export function InvitacionCard({ token, organizacion, emailInvitado, emailSesion }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const coincide = emailInvitado.toLowerCase() === emailSesion.toLowerCase();

  async function aceptar() {
    setError(null);
    setCargando(true);
    const r = await aceptarInvitacion(token);
    if (!r.ok) {
      setError(r.error);
      setCargando(false);
      return;
    }
    router.replace(r.slug ? `/app/${encodeURIComponent(r.slug)}` : '/');
    router.refresh();
  }

  async function rechazar() {
    setError(null);
    setCargando(true);
    const r = await rechazarInvitacion(token);
    if (!r.ok) {
      setError(r.error);
      setCargando(false);
      return;
    }
    router.replace('/');
    router.refresh();
  }

  async function ahoraNo() {
    await descartarInvitacion();
    router.replace('/');
    router.refresh();
  }

  function cerrarSesion() {
    // El enlace queda guardado: al entrar con el correo invitado se retoma la invitación.
    const form = document.createElement('form');
    form.method = 'post';
    form.action = '/auth/signout';
    document.body.appendChild(form);
    form.submit();
  }

  return (
    <div className="org-form">
      <p className="auth-subtitle" style={{ margin: 0 }}>
        Te invitaron a unirte a <strong>{organizacion}</strong>.
      </p>
      {!coincide && (
        <div role="alert" className="ui-alert ui-alert--error">
          <AlertIcon className="ui-alert__icon" />
          <p>
            Esta invitación es para <strong>{emailInvitado}</strong>, pero iniciaste sesión como{' '}
            <strong>{emailSesion}</strong>. Cierra sesión y entra con el correo invitado.
          </p>
        </div>
      )}
      {error && (
        <div role="alert" className="ui-alert ui-alert--error">
          <AlertIcon className="ui-alert__icon" />
          <p>{error}</p>
        </div>
      )}
      {coincide ? (
        <>
          <button type="button" onClick={aceptar} disabled={cargando} aria-busy={cargando} className="ui-btn ui-btn--primary ui-btn--block">
            {cargando ? 'Procesando...' : 'Aceptar invitación'}
          </button>
          <button type="button" onClick={rechazar} disabled={cargando} className="ui-btn ui-btn--ghost ui-btn--block">
            Rechazar
          </button>
        </>
      ) : (
        <button type="button" onClick={cerrarSesion} className="ui-btn ui-btn--primary ui-btn--block">
          Cerrar sesión
        </button>
      )}
      <button type="button" onClick={ahoraNo} disabled={cargando} className="ui-btn ui-btn--ghost ui-btn--block">
        Ahora no
      </button>
    </div>
  );
}
