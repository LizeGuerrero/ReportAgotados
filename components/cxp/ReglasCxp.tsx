'use client';

import '@/styles/cxp.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AlertIcon, SearchIcon } from '@/components/ui/icons';
import { CONTEXTOS, moneda } from './tipos';

interface Regla {
  id: string;
  tipo: 'documento' | 'patron';
  tercero: string;
  nombre_ref: string | null;
  documento_erp: string | null;
  detalle: string | null;
  contexto: string;
  nota: string | null;
  activa: boolean;
  docs: number;
  valor: number;
  creado_por: string | null;
  created_at: string;
  total: number;
}

interface Previa {
  docs: number;
  valor: number;
  ejemplos: { nombre: string; documento: string; detalle: string | null; valor: number }[];
}

const POR_PAGINA = 100;

export default function ReglasCxp({ organizacionId }: { organizacionId: string }) {
  const [supabase] = useState(() => createClient());
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [contexto, setContexto] = useState('');
  const [pagina, setPagina] = useState(0);
  const [reglas, setReglas] = useState<Regla[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [formulario, setFormulario] = useState<{ editar: Regla | null } | null>(null);
  const [permisos, setPermisos] = useState({ crear: false, editar: false, eliminar: false });
  const peticion = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setBusqueda(texto);
      setPagina(0);
    }, 300);
    return () => clearTimeout(t);
  }, [texto]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(''), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  useEffect(() => {
    let vivo = true;
    const pedir = async (accion: string) => {
      const { data } = await supabase.rpc('tiene_permiso', {
        p_organizacion_id: organizacionId, p_modulo: 'cxp_reglas', p_accion: accion,
      });
      return data === true;
    };
    Promise.all([pedir('crear'), pedir('editar'), pedir('eliminar')]).then(([crear, editar, eliminar]) => {
      if (vivo) setPermisos({ crear, editar, eliminar });
    });
    return () => { vivo = false; };
  }, [supabase, organizacionId]);

  const cargar = useCallback(async () => {
    const mia = ++peticion.current;
    setCargando(true);
    const { data, error } = await supabase.rpc('cxp_reglas_listar', {
      p_org: organizacionId,
      p_busqueda: busqueda.trim() || null,
      p_contexto: contexto || null,
      p_limit: POR_PAGINA,
      p_offset: pagina * POR_PAGINA,
    });
    if (mia !== peticion.current) return;
    setCargando(false);
    if (error) return setError(error.message);
    setError('');
    const f = (data ?? []) as Regla[];
    setReglas(f);
    setTotal(f[0]?.total ?? 0);
  }, [supabase, organizacionId, busqueda, contexto, pagina]);

  useEffect(() => { cargar(); }, [cargar]);

  async function alternar(r: Regla) {
    const { error } = await supabase.rpc('cxp_regla_guardar', {
      p_org: organizacionId, p_id: r.id, p_datos: { activa: !r.activa },
    });
    if (error) return setError(error.message);
    setAviso(r.activa ? 'Regla desactivada: sus documentos vuelven a la cartera.' : 'Regla activada.');
    cargar();
  }

  async function eliminar(r: Regla) {
    const cuantos = r.docs ? `\n\nSus ${r.docs} documento(s) volverán a la cartera.` : '';
    if (!window.confirm(`¿Eliminar esta regla?\n\n${r.nombre_ref ?? r.tercero} · ${r.documento_erp ?? r.detalle}${cuantos}`)) return;
    const { error } = await supabase.rpc('cxp_regla_eliminar', { p_org: organizacionId, p_id: r.id });
    if (error) return setError(error.message);
    setAviso('Regla eliminada.');
    cargar();
  }

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <div>
      <div className="ag-head">
        <h1 className="ag-title">Reglas de exclusión (REC NO REV)</h1>
        <p className="ag-lead">
          Documentos del ERP que no son una cuenta por pagar real. No se borran: salen de la cartera y quedan
          en <strong>Excluidas</strong> con la nota para contabilidad. Una regla <strong>por documento</strong> solo afecta
          ese documento; una regla <strong>por detalle</strong> afecta todos los documentos del tercero con ese detalle exacto.
        </p>
      </div>

      <div className="ag-toolbar">
        <div className="ag-toolbar__filters">
          <div className="ag-search">
            <SearchIcon className="ag-search__icon" />
            <input type="search" className="ui-input" value={texto} onChange={(e) => setTexto(e.target.value)}
              placeholder="Buscar por proveedor, NIT, documento, detalle o nota" aria-label="Buscar" />
          </div>
          <select className="ui-input cxp-select" aria-label="Contexto" value={contexto}
            onChange={(e) => { setContexto(e.target.value); setPagina(0); }}>
            <option value="">Todos los contextos</option>
            {CONTEXTOS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {permisos.crear && (
          <button type="button" className="ui-btn ui-btn--primary" onClick={() => setFormulario({ editar: null })}>
            + Nueva regla
          </button>
        )}
      </div>

      {error && (
        <div className="ui-alert ui-alert--error ag-alert" role="alert">
          <AlertIcon className="ui-alert__icon" /><span>{error}</span>
        </div>
      )}

      <p className="ag-summary" aria-live="polite">{cargando ? 'Cargando…' : `${total} regla(s)`}</p>

      <div className={cargando ? 'ag-tablewrap is-loading' : 'ag-tablewrap'} role="region" aria-label="Reglas" tabIndex={0}>
        <table className="ag-table cxp-table">
          <thead>
            <tr>
              {['Regla', 'NIT', 'Proveedor', 'Documento / detalle', 'Contexto', 'Nota', 'Docs', 'Valor', 'Estado', 'Acciones']
                .map((t) => <th key={t} scope="col"><span className="ag-th__label cxp-th">{t}</span></th>)}
            </tr>
          </thead>
          <tbody>
            {reglas.map((r) => (
              <tr key={r.id} className={r.activa ? undefined : 'cxp-row--inactiva'}>
                <td>
                  <span className={r.tipo === 'documento' ? 'ui-badge ui-badge--info' : 'ui-badge ui-badge--warning'}
                    title={r.tipo === 'documento' ? 'Afecta un solo documento' : 'Afecta todos los documentos con ese detalle'}>
                    {r.tipo === 'documento' ? 'Documento' : 'Detalle (amplia)'}
                  </span>
                </td>
                <td>{r.tercero}</td>
                <td className="cxp-col-nombre">{r.nombre_ref ?? ''}</td>
                <td>{r.documento_erp ?? r.detalle}</td>
                <td>{r.contexto}</td>
                <td className="cxp-col-detalles">{r.nota ?? ''}</td>
                <td className="cxp-num">{r.docs}</td>
                <td className="cxp-num">{moneda(r.valor)}</td>
                <td>{r.activa ? 'Activa' : 'Inactiva'}</td>
                <td>
                  <div className="cxp-acciones">
                    {permisos.editar && (
                      <>
                        <button type="button" className="ui-btn ui-btn--sm" onClick={() => setFormulario({ editar: r })}>Editar</button>
                        <button type="button" className="ui-btn ui-btn--sm" onClick={() => alternar(r)}>
                          {r.activa ? 'Desactivar' : 'Activar'}
                        </button>
                      </>
                    )}
                    {permisos.eliminar && (
                      <button type="button" className="ui-btn ui-btn--sm ui-btn--danger" onClick={() => eliminar(r)}>Eliminar</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!cargando && reglas.length === 0 && (
              <tr><td className="ag-empty" colSpan={10}>No hay reglas con ese filtro.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="ag-pager">
        <button type="button" className="ui-btn ui-btn--sm" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>Anterior</button>
        <span>Página {pagina + 1} de {paginas}</span>
        <button type="button" className="ui-btn ui-btn--sm" disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)}>Siguiente</button>
      </div>

      <div role="status" aria-live="polite">{aviso && <div className="ag-toast">{aviso}</div>}</div>

      {formulario && (
        <FormRegla
          supabase={supabase}
          organizacionId={organizacionId}
          inicial={formulario.editar}
          onCerrar={() => setFormulario(null)}
          onGuardado={() => {
            const nueva = formulario.editar === null;
            setFormulario(null);
            setAviso(nueva ? 'Regla creada.' : 'Cambios guardados.');
            cargar();
          }}
        />
      )}
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function FormRegla({
  supabase, organizacionId, inicial, onCerrar, onGuardado,
}: {
  supabase: any;
  organizacionId: string;
  inicial: Regla | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [tipo, setTipo] = useState<'documento' | 'patron'>(inicial?.tipo ?? 'documento');
  const [tercero, setTercero] = useState(inicial?.tercero ?? '');
  const [nombre, setNombre] = useState(inicial?.nombre_ref ?? '');
  const [documento, setDocumento] = useState(inicial?.documento_erp ?? '');
  const [detalle, setDetalle] = useState(inicial?.detalle ?? '');
  const [contexto, setContexto] = useState(inicial?.contexto ?? '');
  const [nota, setNota] = useState(inicial?.nota ?? '');
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onCerrar]);

  // A cuántos documentos afectaría, antes de guardar.
  useEffect(() => {
    const clave = tipo === 'documento' ? documento : detalle;
    if (tercero.trim().length < 3 || clave.trim() === '') { setPrevia(null); return; }
    let vivo = true;
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('cxp_regla_previsualizar', {
        p_org: organizacionId,
        p_datos: { tipo, tercero, documento_erp: documento, detalle },
      });
      if (vivo) setPrevia(error ? null : (data as Previa));
    }, 350);
    return () => { vivo = false; clearTimeout(t); };
  }, [supabase, organizacionId, tipo, tercero, documento, detalle]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!tercero.trim()) return setError('Escribe el NIT del tercero.');
    if (tipo === 'documento' && !documento.trim()) return setError('Escribe el número de documento del ERP.');
    if (tipo === 'patron' && !detalle.trim()) return setError('Escribe el detalle exacto que trae el ERP.');
    if (!contexto.trim()) return setError('Elige o escribe un contexto.');
    setGuardando(true);
    const { error } = await supabase.rpc('cxp_regla_guardar', {
      p_org: organizacionId,
      p_id: inicial?.id ?? null,
      p_datos: { tipo, tercero, nombre_ref: nombre, documento_erp: documento, detalle, contexto, nota },
    });
    setGuardando(false);
    if (error) return setError(error.message);
    onGuardado();
  }

  return (
    <div className="cxp-modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <form className="cxp-modal__card" role="dialog" aria-modal="true" aria-labelledby="cxp-regla-titulo" onSubmit={guardar}>
        <h2 id="cxp-regla-titulo" className="cxp-modal__title">{inicial ? 'Editar regla' : 'Nueva regla de exclusión'}</h2>

        <fieldset className="cxp-form__tipo">
          <legend className="ui-label">¿Qué deja fuera?</legend>
          <label><input type="radio" name="tipo" checked={tipo === 'documento'} onChange={() => setTipo('documento')} /> Un documento (recomendado)</label>
          <label><input type="radio" name="tipo" checked={tipo === 'patron'} onChange={() => setTipo('patron')} /> Todos los documentos de un tercero con un detalle exacto</label>
        </fieldset>

        <div className="cxp-form__grid">
          <div className="ui-field">
            <label className="ui-label" htmlFor="rg-nit">NIT del tercero *</label>
            <input id="rg-nit" className="ui-input" autoFocus value={tercero} inputMode="numeric"
              onChange={(e) => setTercero(e.target.value)} placeholder="900123456" />
          </div>
          <div className="ui-field">
            <label className="ui-label" htmlFor="rg-nom">Proveedor (para reconocerla)</label>
            <input id="rg-nom" className="ui-input" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>

          {tipo === 'documento' ? (
            <div className="ui-field cxp-form__completo">
              <label className="ui-label" htmlFor="rg-doc">Documento del ERP *</label>
              <input id="rg-doc" className="ui-input" value={documento} onChange={(e) => setDocumento(e.target.value)} placeholder="FG-000578-00" />
            </div>
          ) : (
            <div className="ui-field cxp-form__completo">
              <label className="ui-label" htmlFor="rg-det">Detalle exacto *</label>
              <input id="rg-det" className="ui-input" value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="SALDOS INICIALES" />
              <p className="ui-hint">Debe ser igual a como lo escribe el ERP (el ERP lo corta a 40 caracteres).</p>
            </div>
          )}

          <div className="ui-field">
            <label className="ui-label" htmlFor="rg-ctx">Contexto (nota para contabilidad) *</label>
            <input id="rg-ctx" className="ui-input" list="rg-contextos" value={contexto} onChange={(e) => setContexto(e.target.value)} />
            <datalist id="rg-contextos">{CONTEXTOS.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div className="ui-field">
            <label className="ui-label" htmlFor="rg-nota">Nota</label>
            <input id="rg-nota" className="ui-input" maxLength={500} value={nota} onChange={(e) => setNota(e.target.value)} />
          </div>
        </div>

        {previa && (
          <div className={tipo === 'patron' && previa.docs > 1 ? 'ui-alert ui-alert--error' : 'ui-alert'} role="status">
            <AlertIcon className="ui-alert__icon" />
            <div>
              <p>
                {previa.docs === 0
                  ? 'Hoy no hay ningún documento pendiente que coincida (la regla quedará lista para cuando llegue).'
                  : `Dejaría fuera ${previa.docs} documento(s) pendiente(s) por ${moneda(previa.valor)}.`}
              </p>
              {tipo === 'patron' && previa.docs > 1 && <p><strong>Es una regla amplia: revisa que sean todos los que quieres excluir.</strong></p>}
              {previa.ejemplos.length > 0 && (
                <ul>{previa.ejemplos.map((x, i) => <li key={i}>{x.nombre} · {x.documento} · {x.detalle} · {moneda(x.valor)}</li>)}</ul>
              )}
            </div>
          </div>
        )}

        {error && <p className="ui-alert ui-alert--error" role="alert">{error}</p>}

        <div className="cxp-modal__acciones">
          <button type="button" className="ui-btn" onClick={onCerrar} disabled={guardando}>Cancelar</button>
          <button type="submit" className="ui-btn ui-btn--primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </div>
  );
}
