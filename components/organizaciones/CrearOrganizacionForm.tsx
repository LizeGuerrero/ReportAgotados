'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Field } from '@/components/ui/Field';
import { AlertIcon, ArrowLeftIcon } from '@/components/ui/icons';

export function CrearOrganizacionForm() {
  const supabase = createClient();
  const router = useRouter();
  const [nombre, setNombre] = useState('');
  const [identificacion, setIdentificacion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);

    // La función de base de datos crea la organización, sus roles y sedes base y deja a
    // quien la llama como administrador. Desde el navegador no se puede escribir en esas tablas.
    const { data, error: rpcError } = await supabase.rpc('crear_organizacion', {
      p_nombre: nombre,
      p_identificacion: identificacion,
    });

    if (rpcError || typeof data !== 'string') {
      setError(rpcError?.message ?? 'No se pudo crear la organización.');
      setCargando(false);
      return;
    }

    router.replace(`/app/${encodeURIComponent(data)}/admin`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      <Field id="org-nombre" label="Nombre de la organización">
        <input
          id="org-nombre"
          className="ui-input"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          maxLength={120}
          autoComplete="organization"
          required
        />
      </Field>
      <Field
        id="org-identificacion"
        label="Identificación (NIT, cédula u otra)"
        hint="Sirve para que otras personas encuentren tu organización. No es una contraseña: nadie entra solo por conocerla."
      >
        <input
          id="org-identificacion"
          className="ui-input"
          value={identificacion}
          onChange={(e) => setIdentificacion(e.target.value)}
          maxLength={30}
          aria-describedby="org-identificacion-hint"
          autoCapitalize="characters"
          spellCheck={false}
          required
        />
      </Field>
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
        {cargando ? 'Creando...' : 'Crear organización'}
      </button>
      <button type="button" onClick={() => router.push('/')} className="ui-btn ui-btn--ghost ui-btn--block">
        <ArrowLeftIcon />
        Volver
      </button>
    </form>
  );
}
