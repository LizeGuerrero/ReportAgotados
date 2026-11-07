'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ESTANDAR, textoErr, type Lista, type ProvFila, type Tipo } from './tipos';

const PAGINA = 50;

/**
 * Qué estructura usa cada proveedor. Asignar solo mueve un puntero: nunca modifica una plantilla.
 * Permite filtrar, ver si al proveedor le faltan datos (contacto, WhatsApp, correo) y asignar en bloque.
 */
export default function AsignacionProveedores({
  supabase, organizacionId, tipo, lista, puedeEditar, nombrePredOrg, alCambiar,
}: {
  supabase: SupabaseClient; organizacionId: string; tipo: Tipo; lista: Lista | null; puedeEditar: boolean;
  nombrePredOrg: string; alCambiar: () => void;
}) {
  const [filas, setFilas] = useState<ProvFila[]>([]);
  const [total, setTotal] = useState(0);
  const [buscar, setBuscar] = useState('');
  const [solo, setSolo] = useState<'' | 'propios' | 'heredan'>('');
  const [elegidos, setElegidos] = useState<Set<number>>(new Set());
  const [destino, setDestino] = useState<string>('');
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const variantes = lista?.variantes ?? [];

  const cargar = useCallback(async (desde: number, acumular: boolean) => {
    const { data, error: e } = await supabase.rpc('mensaje_proveedores_listar', {
      p_org: organizacionId, p_tipo: tipo, p_busqueda: buscar.trim() || null, p_limit: PAGINA, p_offset: desde, p_solo: solo || null,
    });
    if (e) { setError(textoErr(e)); return; }
    const nuevas = (data ?? []) as ProvFila[];
    setError('');
    setFilas((f) => (acumular ? [...f, ...nuevas] : nuevas));
    setTotal(nuevas[0]?.total ?? 0);
  }, [supabase, organizacionId, tipo, buscar, solo]);

  useEffect(() => { const t = setTimeout(() => { setElegidos(new Set()); void cargar(0, false); }, 250); return () => clearTimeout(t); }, [cargar]);

  async function asignar(ids: number[], estructura: string | null) {
    setOcupado(true); setError(''); setAviso('');
    const { error: e } = await supabase.rpc('mensaje_proveedores_asignar', { p_org: organizacionId, p_tipo: tipo, p_proveedores: ids, p_estructura: estructura });
    setOcupado(false);
    if (e) { setError(textoErr(e)); return; }
    setAviso(`Listo: ${ids.length} proveedor(es) actualizados.`);
    setElegidos(new Set());
    await cargar(0, false);
    alCambiar();
  }

  const alternar = (id: number) => setElegidos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const todos = filas.length > 0 && filas.every((f) => elegidos.has(f.proveedor_id));
  const valorSelect = (f: ProvFila) => (f.origen === 'proveedor' ? f.estructura_id : '');

  return (
    <section className="msj-asig" aria-label="Estructura de cada proveedor">
      <div className="msj-asig__barra">
        <input className="msj-input msj-input--buscar" placeholder="Buscar proveedor, NIT o contacto" value={buscar} onChange={(e) => setBuscar(e.target.value)} aria-label="Buscar proveedor" />
        <div className="msj-seg" role="group" aria-label="Filtrar">
          {([['', 'Todos'], ['propios', 'Con estructura propia'], ['heredan', 'Usan la predeterminada']] as const).map(([v, t]) => (
            <button key={v} type="button" className={solo === v ? 'msj-seg__op is-on' : 'msj-seg__op'} aria-pressed={solo === v} onClick={() => setSolo(v)}>{t}</button>
          ))}
        </div>
        <span className="msj-sub">{total} proveedor(es)</span>
      </div>
      <p className="msj-sub">
        “Predeterminada” sigue a la de la organización (<b>{nombrePredOrg}</b>). Elegir una estructura aquí no cambia su contenido: solo dice cuál usa el proveedor por defecto.
        {!puedeEditar && ' Solo lectura: no tienes permiso para cambiar asignaciones.'}
      </p>
      {error && <div className="msj-aviso msj-aviso--error" role="alert">{error}</div>}
      {aviso && <div className="msj-aviso msj-aviso--ok" role="status">{aviso}</div>}

      {puedeEditar && elegidos.size > 0 && (
        <div className="msj-bulk" role="group" aria-label="Asignar a los seleccionados">
          <b>{elegidos.size} seleccionado(s)</b>
          <select className="msj-input msj-input--sel" value={destino} onChange={(e) => setDestino(e.target.value)} aria-label="Estructura a asignar">
            <option value="">La predeterminada de la organización</option>
            <option value={ESTANDAR}>Estándar</option>
            {variantes.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
          </select>
          <button type="button" className="msj-btn msj-btn--primary" disabled={ocupado} onClick={() => asignar(Array.from(elegidos), destino || null)}>Asignar</button>
          <button type="button" className="msj-btn msj-btn--ghost" onClick={() => setElegidos(new Set())}>Cancelar</button>
        </div>
      )}

      <div className="msj-tabla" role="table">
        <div className="msj-tabla__cab" role="row">
          <span role="columnheader">{puedeEditar && <input type="checkbox" checked={todos} onChange={() => setElegidos(todos ? new Set() : new Set(filas.map((f) => f.proveedor_id)))} aria-label="Seleccionar todos" />}</span>
          <span role="columnheader">Proveedor</span>
          <span role="columnheader">Datos para los mensajes</span>
          <span role="columnheader">Estructura</span>
        </div>
        {filas.map((f) => (
          <div key={f.proveedor_id} className={elegidos.has(f.proveedor_id) ? 'msj-tabla__fila is-sel' : 'msj-tabla__fila'} role="row">
            <span role="cell">{puedeEditar && <input type="checkbox" checked={elegidos.has(f.proveedor_id)} onChange={() => alternar(f.proveedor_id)} aria-label={`Seleccionar ${f.nombre}`} />}</span>
            <span role="cell" className="msj-tabla__nom"><b>{f.nombre}</b><span className="msj-sub">{f.documento}</span></span>
            <span role="cell" className="msj-datos">
              <span className={f.contacto ? 'msj-dato is-ok' : 'msj-dato'} title={f.contacto ?? 'Sin contacto: {contacto} saldrá vacío'}>Contacto</span>
              <span className={f.whatsapp ? 'msj-dato is-ok' : 'msj-dato'} title={f.whatsapp ?? (f.telefono ? 'Sin WhatsApp: se usará su teléfono' : 'Sin WhatsApp ni teléfono')}>WhatsApp</span>
              <span className={f.correo ? 'msj-dato is-ok' : 'msj-dato'} title={f.correo ?? 'Sin correo'}>Correo</span>
            </span>
            <span role="cell">
              <select className="msj-input msj-input--sel" disabled={!puedeEditar || ocupado} value={valorSelect(f)} aria-label={`Estructura de ${f.nombre}`}
                onChange={(e) => asignar([f.proveedor_id], e.target.value === '' ? null : e.target.value)}>
                <option value="">Predeterminada ({nombrePredOrg})</option>
                <option value={ESTANDAR}>Estándar</option>
                {variantes.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              </select>
            </span>
          </div>
        ))}
        {filas.length === 0 && <div className="msj-vacio">No hay proveedores con ese filtro.</div>}
      </div>
      {filas.length < total && (
        <button type="button" className="msj-btn" onClick={() => cargar(filas.length, true)}>Cargar más ({total - filas.length} restantes)</button>
      )}
    </section>
  );
}
