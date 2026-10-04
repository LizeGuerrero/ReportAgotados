'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Field } from '@/components/ui/Field';
import { AlertIcon } from '@/components/ui/icons';

export function SolicitarUnionForm() {
  const supabase = createClient();
  const router = useRouter();
  const [identificador, setIdentificador] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviadaA, setEnviadaA] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviadaA(null);
    setCargando(true);

    // Solo ubica la organización y crea una solicitud PENDIENTE sin permisos.
    // El acceso real lo decide un administrador.
    const { data, error: rpcError } = await supabase.rpc('solicitar_union', { p_identificador: identificador });
    setCargando(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setEnviadaA(String(data));
    setIdentificador('');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      <Field
        id="uni-identificador"
        label="Identificación de la organización"
        hint="El NIT o identificador que te dio el administrador. Solo sirve para encontrarla: un administrador debe aprobar tu solicitud."
      >
        <input
          id="uni-identificador"
          className="ui-input"
          value={identificador}
          onChange={(e) => setIdentificador(e.target.value)}
          aria-describedby="uni-identificador-hint"
          autoCapitalize="none"
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
      {enviadaA && (
        <div role="status" className="org-mensaje-ok">
          <p>
            Solicitud enviada a <strong>{enviadaA}</strong>. Cuando un administrador la apruebe podrás entrar.
          </p>
        </div>
      )}
      <button
        type="submit"
        disabled={cargando}
        aria-busy={cargando}
        className={`ui-btn ui-btn--primary ui-btn--block${cargando ? ' is-loading' : ''}`}
      >
        {cargando ? 'Enviando...' : 'Solicitar unirme'}
      </button>
    </form>
  );
}
