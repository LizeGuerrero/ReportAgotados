'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function RecuperarPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [cargando, setCargando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // El callback intercambia el código por una sesión temporal de
      // recuperación y de ahí manda a /actualizar-password.
      redirectTo: `${window.location.origin}/auth/callback?next=/actualizar-password`,
    });

    setCargando(false);

    // Mostramos el mismo mensaje exista o no la cuenta (evita revelar
    // qué correos están registrados).
    if (error) {
      setError('Ocurrió un error, intenta de nuevo en unos minutos.');
      return;
    }
    setEnviado(true);
  }

  if (enviado) {
    return (
      <main style={{ maxWidth: 380, margin: '60px auto', padding: 24 }}>
        <h1 style={{ fontSize: 20 }}>Revisa tu correo</h1>
        <p style={{ color: 'var(--color-text-subtle)', fontSize: 14 }}>
          Si existe una cuenta con ese correo, te enviamos un link para restablecer tu contraseña.
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 380, margin: '60px auto', padding: 24 }}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Recupera tu contraseña</h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-subtle)', marginBottom: 16 }}>
        Te enviaremos un link a tu correo para crear una nueva contraseña.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          type="email"
          placeholder="Correo"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={inputStyle}
        />
        {error && <p style={{ color: 'var(--color-danger)', fontSize: 13 }}>{error}</p>}
        <button type="submit" disabled={cargando} style={submitStyle}>
          {cargando ? 'Enviando...' : 'Enviar link de recuperación'}
        </button>
        <a href="/login" style={linkStyle}>
          ← Volver a inicio de sesión
        </a>
      </form>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid var(--color-border)',
  background: 'var(--color-input)',
  color: 'var(--color-text)',
  fontSize: 14,
};

const submitStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: 'none',
  background: 'var(--color-primary)',
  color: '#fff',
  cursor: 'pointer',
  fontSize: 14,
};

const linkStyle: React.CSSProperties = {
  color: 'var(--color-accent)',
  fontSize: 13,
  textDecoration: 'none',
};
