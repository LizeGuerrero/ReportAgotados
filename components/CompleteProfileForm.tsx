'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { OPCIONES_PAIS, validarCelular, limpiarCelular } from '@/lib/phoneRules';
import type { CompletarPerfilInput, TipoDocumento } from '@/types/auth.types';

interface Props {
  userId: string;
  nombresIniciales?: string;
  apellidosIniciales?: string;
}

const inicial: CompletarPerfilInput = {
  nombres: '',
  apellidos: '',
  tipo_documento: 'CC',
  numero_documento: '',
  username: '',
  codigo_pais: '+57',
  numero_celular: '',
  foto_perfil: null,
};

export function CompleteProfileForm({ userId, nombresIniciales = '', apellidosIniciales = '' }: Props) {
  const supabase = createClient();
  const router = useRouter();
  const [form, setForm] = useState<CompletarPerfilInput>({
    ...inicial,
    nombres: nombresIniciales,
    apellidos: apellidosIniciales,
  });
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  function set<K extends keyof CompletarPerfilInput>(campo: K, valor: CompletarPerfilInput[K]) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const errorCelular = validarCelular(form.codigo_pais, form.numero_celular);
    if (errorCelular) {
      setError(errorCelular);
      return;
    }

    setCargando(true);

    let fotoUrl: string | undefined;

    if (form.foto_perfil) {
      const ruta = `${userId}/${Date.now()}-${form.foto_perfil.name}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(ruta, form.foto_perfil, { upsert: true });

      if (uploadError) {
        setError(uploadError.message);
        setCargando(false);
        return;
      }
      fotoUrl = supabase.storage.from('avatars').getPublicUrl(ruta).data.publicUrl;
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        nombres: form.nombres,
        apellidos: form.apellidos,
        tipo_documento: form.tipo_documento,
        numero_documento: form.numero_documento,
        username: form.username,
        codigo_pais: form.codigo_pais,
        numero_celular: limpiarCelular(form.numero_celular),
        ...(fotoUrl ? { foto_perfil: fotoUrl } : {}),
        perfil_completo: true,
      })
      .eq('id', userId);

    if (updateError) {
      setError(updateError.message);
      setCargando(false);
      return;
    }

    router.replace('/');
    router.refresh();
  }

  return (
    <main style={{ maxWidth: 380, margin: '60px auto', padding: 24 }}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Completa tu perfil</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
        Necesitamos algunos datos más para continuar.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            placeholder="Nombres"
            value={form.nombres}
            onChange={(e) => set('nombres', e.target.value)}
            required
            style={{ ...inputStyle, flex: 1 }}
          />
          <input
            type="text"
            placeholder="Apellidos"
            value={form.apellidos}
            onChange={(e) => set('apellidos', e.target.value)}
            required
            style={{ ...inputStyle, flex: 1 }}
          />
        </div>
        <input
          type="text"
          placeholder="Nombre de usuario"
          value={form.username}
          onChange={(e) => set('username', e.target.value)}
          required
          style={inputStyle}
        />

        <div style={{ display: 'flex', gap: 8 }}>
          <select
            value={form.tipo_documento}
            onChange={(e) => set('tipo_documento', e.target.value as TipoDocumento)}
            style={{ ...inputStyle, flex: 1 }}
          >
            <option value="CC">CC</option>
            <option value="CE">CE</option>
            <option value="TI">TI</option>
            <option value="PASAPORTE">Pasaporte</option>
            <option value="OTRO">Otro</option>
          </select>
          <input
            type="text"
            placeholder="Número de documento"
            value={form.numero_documento}
            onChange={(e) => set('numero_documento', e.target.value)}
            required
            style={{ ...inputStyle, flex: 2 }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <select
            value={form.codigo_pais}
            onChange={(e) => set('codigo_pais', e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
          >
            {OPCIONES_PAIS.map((p) => (
              <option key={p.codigo} value={p.codigo}>
                {p.etiqueta}
              </option>
            ))}
          </select>
          <input
            type="tel"
            placeholder="Número de celular"
            value={form.numero_celular}
            onChange={(e) => set('numero_celular', e.target.value)}
            required
            style={{ ...inputStyle, flex: 2 }}
          />
        </div>

        <label style={{ fontSize: 13 }}>
          Foto de perfil (opcional)
          <input
            type="file"
            accept="image/*"
            onChange={(e) => set('foto_perfil', e.target.files?.[0] ?? null)}
            style={{ display: 'block', marginTop: 4 }}
          />
        </label>

        {error && <p style={{ color: '#dc2626', fontSize: 13 }}>{error}</p>}

        <button type="submit" disabled={cargando} style={submitStyle}>
          {cargando ? 'Guardando...' : 'Guardar y continuar'}
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
  width: '100%',
  boxSizing: 'border-box',
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
