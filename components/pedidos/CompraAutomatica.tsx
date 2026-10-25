'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Modal, textoError } from '@/components/pedidos/ui';
import { numeroDeTexto } from '@/components/pedidos/reglas';

interface Prov { proveedor_id: number; nombre: string; documento: string; productos: number }

/**
 * Compra nueva armada de una vez, SIN pasar por los agotados: por línea (todos los productos de las líneas
 * elegidas) o por proveedor (lo consulta y trae todo lo que suministra). Cada producto entra con la cantidad
 * por defecto, ya con el precio del ERP; luego se ajusta en la tabla de la compra.
 */
export default function CompraAutomatica({
  modo, supabase, organizacionId, onCerrar, onCreada,
}: {
  modo: 'linea' | 'proveedor';
  supabase: SupabaseClient;
  organizacionId: string;
  onCerrar: () => void;
  onCreada: (id: string) => void;
}) {
  const [titulo, setTitulo] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [proveedor, setProveedor] = useState<number | null>(null);
  const [proveedores, setProveedores] = useState<Prov[]>([]);
  const [buscar, setBuscar] = useState('');
  const [lineas, setLineas] = useState<string[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [soloExclusivos, setSoloExclusivos] = useState(false);
  const [n, setN] = useState(0);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (modo !== 'proveedor') return;
    const t = setTimeout(async () => {
      const { data, error: e } = await supabase.rpc('compra_proveedores_listar', { p_org: organizacionId, p_busqueda: buscar.trim() || null, p_limit: 100 });
      if (e) setError(textoError(e)); else setProveedores((data ?? []) as Prov[]);
    }, 250);
    return () => clearTimeout(t);
  }, [supabase, organizacionId, modo, buscar]);

  useEffect(() => {
    if (modo === 'proveedor' && proveedor === null) { setLineas([]); return; }
    supabase.rpc('compra_lineas_disponibles', { p_org: organizacionId, p_proveedor: modo === 'proveedor' ? proveedor : null })
      .then(({ data }) => setLineas(((data ?? []) as (string | { linea: string })[]).map((x) => (typeof x === 'string' ? x : x.linea))));
  }, [supabase, organizacionId, modo, proveedor]);

  const elegidas = [...sel].filter((l) => lineas.includes(l));

  useEffect(() => {
    if (modo === 'linea' && elegidas.length === 0) { setN(0); return; }
    if (modo === 'proveedor' && proveedor === null) { setN(0); return; }
    supabase.rpc('compra_contar_filtro', {
      p_org: organizacionId, p_lineas: elegidas.length ? elegidas : null, p_proveedor: modo === 'proveedor' ? proveedor : null, p_solo_exclusivos: soloExclusivos,
    }).then(({ data }) => setN(Number(data ?? 0)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, organizacionId, modo, proveedor, soloExclusivos, elegidas.join('|')]);

  async function crear() {
    const cant = numeroDeTexto(cantidad);
    if (cant === undefined || cant <= 0) return setError('Escribe una cantidad por defecto mayor que cero.');
    setOcupado(true);
    setError('');
    const { data, error: e } = modo === 'linea'
      ? await supabase.rpc('compra_crear_por_linea', { p_org: organizacionId, p_titulo: titulo || null, p_lineas: elegidas, p_cantidad: cant, p_solo_exclusivos: soloExclusivos, p_incluir_sin_proveedor: false })
      : await supabase.rpc('compra_crear_por_proveedor', { p_org: organizacionId, p_titulo: titulo || null, p_proveedor: proveedor, p_lineas: elegidas.length ? elegidas : null, p_cantidad: cant, p_solo_exclusivos: soloExclusivos });
    setOcupado(false);
    if (e) return setError(textoError(e));
    onCreada(String(data));
  }

  return (
    <Modal titulo={modo === 'linea' ? 'Nueva compra por línea' : 'Nueva compra por proveedor'} onCerrar={onCerrar} ancha>
      <p className="mod-text mod-mt-0">
        {modo === 'linea'
          ? 'Elige una o varias líneas: la compra se arma con todos sus productos que tengan proveedor, ya con el precio del ERP.'
          : 'Elige un proveedor: la compra ya lo consulta y trae todo lo que suministra (o solo ciertas líneas), con su precio del ERP.'}
        {' '}No depende de los agotados reportados.
      </p>
      {modo === 'proveedor' && (
        <div className="mod-mb-2">
          <input className="ui-input ui-input--sm" style={{ width: 280 }} placeholder="Buscar proveedor" value={buscar} onChange={(e) => setBuscar(e.target.value)} aria-label="Buscar proveedor" />
          <div className="pm-lista mod-mt-2" style={{ maxHeight: 180 }}>
            <table className="mod-table">
              <tbody>
                {proveedores.map((p) => (
                  <tr key={p.proveedor_id} className={proveedor === p.proveedor_id ? 'is-selected is-clickable' : 'is-clickable'}
                    onClick={() => { setProveedor(p.proveedor_id); setSel(new Set()); }}>
                    <td><input type="radio" checked={proveedor === p.proveedor_id} readOnly aria-label={`Elegir ${p.nombre}`} /></td>
                    <td>{p.nombre}<span className="pm-chico">{p.documento}</span></td><td>{p.productos} producto(s)</td>
                  </tr>
                ))}
                {proveedores.length === 0 && <tr><td>Sin proveedores</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {(modo === 'linea' || proveedor !== null) && (
        <fieldset className="mod-mb-2" style={{ border: 0, padding: 0 }}>
          <legend className="mod-semibold">{modo === 'linea' ? 'Líneas *' : 'Solo estas líneas (vacío = todo lo que suministra)'}</legend>
          <div className="mod-flex mod-gap-2 mod-wrap">
            {lineas.map((l) => (
              <label key={l} className="ui-badge" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={sel.has(l)} onChange={() => setSel((s) => { const x = new Set(s); if (x.has(l)) x.delete(l); else x.add(l); return x; })} aria-label={`Línea ${l}`} /> {l}
              </label>
            ))}
            {lineas.length === 0 && <span className="mod-sub">No hay líneas disponibles.</span>}
          </div>
        </fieldset>
      )}
      <div className="mod-flex mod-gap-3 mod-center mod-wrap mod-mb-2">
        <label className="mod-text">Cantidad por defecto{' '}
          <input className="ui-input ui-input--sm" style={{ width: 80 }} inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} aria-label="Cantidad por defecto" />
        </label>
        <label className="mod-text"><input type="checkbox" checked={soloExclusivos} onChange={(e) => setSoloExclusivos(e.target.checked)} /> Solo los que maneja un único proveedor</label>
      </div>
      <label className="ui-field">
        <span className="ui-label">Título (opcional)</span>
        <input className="ui-input" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={modo === 'linea' ? 'Línea …' : 'Compra a …'} />
      </label>
      <p className="mod-sub">Se agregarán <b>{n}</b> producto(s). La cantidad la ajustas después en la tabla de la compra.</p>
      {error && <p className="mod-error">{error}</p>}
      <div className="pm-modal__acciones">
        <button type="button" className="ui-btn" onClick={onCerrar}>Cancelar</button>
        <button type="button" className="ui-btn ui-btn--primary" disabled={n === 0 || ocupado} onClick={crear}>Crear compra con {n} producto(s)</button>
      </div>
    </Modal>
  );
}
