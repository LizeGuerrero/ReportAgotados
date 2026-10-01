'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { validarFortalezaPassword } from '@/lib/passwordRules';
import { PasswordStrengthBar } from '@/components/PasswordStrengthBar';

export default function ActualizarPasswordPage() {
  const supabase = createClient();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const errorPassword = validarFortalezaPassword(password);
    if (errorPassword) {
      setError(errorPassword);
      return;
    }
    if (password !== confirmar) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setCargando(true);
    const { error } = await supabase.auth.updateUser({ password });
    setCargando(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.replace('/');
    router.refresh();
  }

  return (
    <main style={{ maxWidth: 380, margin: '60px auto', padding: 24 }}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Crea una nueva contraseña</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
        Esta reemplaza tu contraseña anterior.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          type="password"
          placeholder="Nueva contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          style={inputStyle}
        />
        <PasswordStrengthBar password={password} />
        <input
          type="password"
          placeholder="Confirma la nueva contraseña"
          value={confirmar}
          onChange={(e) => setConfirmar(e.target.value)}
          required
          minLength={8}
          style={inputStyle}
        />
        {error && <p style={{ color: '#dc2626', fontSize: 13 }}>{error}</p>}
        <button type="submit" disabled={cargando} style={submitStyle}>
          {cargando ? 'Guardando...' : 'Guardar nueva contraseña'}
        </button>
      </form>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  fontSize: 14,
};

const submitStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: 'none',
  background: '#111827',
  color: '#fff',
  cursor: 'pointer',
  fontSize: 14,
};
