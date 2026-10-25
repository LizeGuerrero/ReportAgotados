'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CONTEXTOS, moneda, type FilaCxp } from './tipos';

/** Deja fuera de la cartera varios documentos del ERP a la vez, con el mismo contexto y nota. */
export default function FormExcluirSeleccion({
  supabase,
  organizacionId,
  filas,
  onCerrar,
  onHecho,
}: {
  supabase: SupabaseClient;
  organizacionId: string;
  filas: FilaCxp[];
  onCerrar: () => void;
  /** excluidos: cuántos quedaron fuera; ids: los documentos que se intentaron excluir. */
  onHecho: (excluidos: number, ids: string[]) => void;
}) {
  const erp = filas.filter((f) => f.origen === 'erp');
  const manuales = filas.length - erp.length;
  const [contexto, setContexto] = useState('');
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !guardando) onCerrar();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onCerrar, guardando]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (erp.length === 0) return setError('Los pendientes escritos a mano no se excluyen: se eliminan o se pagan.');
    if (!contexto.trim()) return setError('Elige o escribe un contexto: es la nota para contabilidad.');
    setGuardando(true);
    const ids = erp.map((f) => f.id);
    const { data, error } = await supabase.rpc('cxp_excluir_documentos', {
      p_org: organizacionId,
      p_ids: ids,
      p_contexto: contexto,
      p_nota: nota,
    });
    setGuardando(false);
    if (error) return setError(error.message);
    onHecho(Number((data as { excluidos?: number } | null)?.excluidos ?? 0), ids);
  }

  const total = erp.reduce((s, f) => s + f.val_pagar, 0);

  return (
    <div className="cxp-modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && !guardando && onCerrar()}>
      <form className="cxp-modal__card" role="dialog" aria-modal="true" aria-labelledby="cxp-exsel-titulo" onSubmit={guardar}>
        <h2 id="cxp-exsel-titulo" className="cxp-modal__title">Excluir {erp.length} documento(s) de la cartera</h2>
        <p className="ui-hint">
          Salen de la cartera por <strong>{moneda(total)}</strong>, pero no se borran: quedan en la pestaña Excluidas con la
          nota para contabilidad, y se pueden devolver cuando quieras.
          {manuales > 0 && <> <strong>{manuales}</strong> pendiente(s) escrito(s) a mano no se excluyen.</>}
        </p>

        <ul className="cxp-exsel__lista">
          {erp.slice(0, 8).map((f) => (
            <li key={f.id}>{f.nombre} · {f.documento_erp} · {moneda(f.val_pagar)}</li>
          ))}
          {erp.length > 8 && <li>…y {erp.length - 8} más.</li>}
        </ul>

        <div className="cxp-form__grid">
          <div className="ui-field cxp-form__completo">
            <label className="ui-label" htmlFor="exs-ctx">Contexto (nota para contabilidad) *</label>
            <input id="exs-ctx" className="ui-input" list="exs-contextos" autoFocus value={contexto}
              onChange={(e) => setContexto(e.target.value)} placeholder="DE EQUIPO CONTAB, CRUZAR, REVISAR, ELIMINAR…" />
            <datalist id="exs-contextos">{CONTEXTOS.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div className="ui-field cxp-form__completo">
            <label className="ui-label" htmlFor="exs-nota">Nota</label>
            <textarea id="exs-nota" className="ui-input" rows={2} maxLength={500} value={nota} onChange={(e) => setNota(e.target.value)} />
          </div>
        </div>

        {error && <p className="ui-alert ui-alert--error" role="alert">{error}</p>}
        <div className="cxp-modal__acciones">
          <button type="button" className="ui-btn" onClick={onCerrar} disabled={guardando}>Cancelar</button>
          <button type="submit" className="ui-btn ui-btn--primary" disabled={guardando || erp.length === 0}>
            {guardando ? 'Excluyendo…' : `Excluir ${erp.length}`}
          </button>
        </div>
      </form>
    </div>
  );
}
