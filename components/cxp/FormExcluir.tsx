'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CONTEXTOS, moneda, type FilaCxp } from './tipos';

/** Deja un documento del ERP fuera de la cartera (crea una regla por documento). */
export default function FormExcluir({
  supabase,
  organizacionId,
  fila,
  onCerrar,
  onGuardado,
}: {
  supabase: SupabaseClient;
  organizacionId: string;
  fila: FilaCxp;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [contexto, setContexto] = useState('');
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onCerrar]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!contexto.trim()) return setError('Elige o escribe un contexto: es la nota para contabilidad.');
    setGuardando(true);
    const { error } = await supabase.rpc('cxp_regla_guardar', {
      p_org: organizacionId,
      p_id: null,
      p_datos: {
        tipo: 'documento',
        tercero: fila.tercero,
        documento_erp: fila.documento_erp,
        nombre_ref: fila.nombre,
        contexto,
        nota,
      },
    });
    setGuardando(false);
    if (error) return setError(error.message);
    onGuardado();
  }

  return (
    <div className="cxp-modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <form className="cxp-modal__card" role="dialog" aria-modal="true" aria-labelledby="cxp-excl-titulo" onSubmit={guardar}>
        <h2 id="cxp-excl-titulo" className="cxp-modal__title">Excluir de la cartera</h2>
        <p className="ui-hint">
          <strong>{fila.nombre}</strong> · {fila.documento_erp} · {moneda(fila.val_pagar)}
          <br />
          Solo se excluye este documento. Seguirá visible en la pestaña Excluidas, y puedes quitar la exclusión cuando quieras.
        </p>
        <div className="cxp-form__grid">
          <div className="ui-field cxp-form__completo">
            <label className="ui-label" htmlFor="ex-ctx">Contexto (nota para contabilidad) *</label>
            <input id="ex-ctx" className="ui-input" list="ex-contextos" autoFocus value={contexto}
              onChange={(e) => setContexto(e.target.value)} placeholder="DE EQUIPO CONTAB, CRUZAR, REVISAR, ELIMINAR…" />
            <datalist id="ex-contextos">{CONTEXTOS.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div className="ui-field cxp-form__completo">
            <label className="ui-label" htmlFor="ex-nota">Nota</label>
            <textarea id="ex-nota" className="ui-input" rows={2} maxLength={500} value={nota} onChange={(e) => setNota(e.target.value)} />
          </div>
        </div>
        {error && <p className="ui-alert ui-alert--error" role="alert">{error}</p>}
        <div className="cxp-modal__acciones">
          <button type="button" className="ui-btn" onClick={onCerrar} disabled={guardando}>Cancelar</button>
          <button type="submit" className="ui-btn ui-btn--primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Excluir'}</button>
        </div>
      </form>
    </div>
  );
}
