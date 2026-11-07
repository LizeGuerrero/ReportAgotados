'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import Combobox from '@/components/Combobox';
import SelectorLinea from '@/components/SelectorLinea';
import { numeroDeTexto } from '@/components/pedidos/reglas';
import { idVisible, pesos } from '@/components/pedidos/comun';
import { numeroCompra } from '@/components/pedidos/tipos';
import { Badge, textoError } from '@/components/pedidos/ui';

export interface FilaCatalogo {
  item_id: number; codigo: string | null; nombre_base: string; linea: string | null; unidad_medida: string | null;
  referencia: string | null; nombre_proveedor: string | null; precio_lista: number | null; proveedores: number; exclusivo: boolean;
  agotados_pendientes: number | null; en_compra_id: string | null; en_compra_numero: number | null; en_esta_compra: boolean; total: number;
}
export interface Elegido { item_id: number; nombre: string; cantidad: string; linea: string | null }
export interface ContextoSeleccion { lineas: string[]; proveedor: string | null }
const POR_PAGINA = 100;

/**
 * Selector de productos del catálogo, igual de cómodo que Agotados: barra de búsqueda, línea y proveedor como filtros,
 * tabla con selección por fila y un bloque con lo ya elegido (que se conserva al cambiar de filtro o de página).
 * Cada fila admite su cantidad; si se deja vacía se usa la "cantidad por defecto" y, si tampoco hay, el producto se
 * cotiza sin cantidad (se confirma antes de emitir la orden).
 */
export default function SelectorProductos({
  supabase, organizacionId, compraId = null, proveedorFijo = null, conProveedor = false, proveedorInicial = '', lineaInicial = '',
  textoAceptar, onAceptar, onProveedorCambia, onContexto,
}: {
  supabase: SupabaseClient; organizacionId: string; compraId?: string | null;
  /** Catálogo de un proveedor concreto (no se puede cambiar). */
  proveedorFijo?: number | null;
  /** Muestra el filtro de proveedor (para "Nueva compra"). */
  conProveedor?: boolean; proveedorInicial?: string; lineaInicial?: string;
  textoAceptar: (n: number) => string;
  onAceptar: (items: { item_id: number; cantidad?: number }[], proveedor: number | null) => Promise<void> | void;
  onProveedorCambia?: (p: number | null) => void;
  /** Avisa qué líneas y proveedor se están usando (para nombrar la compra sola). */
  onContexto?: (c: ContextoSeleccion) => void;
}) {
  const [texto, setTexto] = useState('');
  const [q, setQ] = useState('');
  const [linea, setLinea] = useState(lineaInicial);
  const [prov, setProv] = useState(proveedorInicial);
  const [exclusivos, setExclusivos] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [lineas, setLineas] = useState<string[]>([]);
  const [provs, setProvs] = useState<{ valor: string; texto: string; detalle?: string }[]>([]);
  const [filas, setFilas] = useState<FilaCatalogo[]>([]);
  const [total, setTotal] = useState(0);
  const [sel, setSel] = useState<Map<number, Elegido>>(new Map());
  const [defecto, setDefecto] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const provId = proveedorFijo ?? (prov ? Number(prov) : null);

  useEffect(() => { const t = setTimeout(() => { setQ(texto.trim()); setPagina(0); }, 300); return () => clearTimeout(t); }, [texto]);
  useEffect(() => {
    supabase.rpc('compra_lineas_disponibles', { p_org: organizacionId, p_proveedor: provId }).then(({ data }) =>
      setLineas(((data ?? []) as (string | { linea: string })[]).map((x) => (typeof x === 'string' ? x : x.linea))));
  }, [supabase, organizacionId, provId]);
  useEffect(() => {
    if (!conProveedor) return;
    supabase.rpc('compra_proveedores_listar', { p_org: organizacionId, p_busqueda: null, p_limit: 300 }).then(({ data }) =>
      setProvs(((data ?? []) as { proveedor_id: number; nombre: string; documento: string; productos: number }[]).map((p) => ({ valor: String(p.proveedor_id), texto: p.nombre, detalle: `${p.documento} · ${p.productos} producto(s)` }))));
  }, [supabase, organizacionId, conProveedor]);

  const filtro = useCallback((limit: number, offset: number) => ({
    p_org: organizacionId, p_compra: compraId, p_proveedor: provId, p_lineas: linea ? [linea] : null, p_busqueda: q || null,
    p_solo_exclusivos: exclusivos, p_solo_con_proveedor: true, p_limit: limit, p_offset: offset,
  }), [organizacionId, compraId, provId, linea, q, exclusivos]);

  useEffect(() => {
    let vigente = true;
    supabase.rpc('compra_catalogo', filtro(POR_PAGINA, pagina * POR_PAGINA)).then(({ data, error: e }) => {
      if (!vigente) return;
      if (e) return setError(textoError(e));
      setError('');
      const l = (data ?? []) as FilaCatalogo[];
      setFilas(l);
      setTotal(l[0]?.total ?? 0);
    });
    return () => { vigente = false; };
  }, [supabase, filtro, pagina]);

  const seleccionable = (f: FilaCatalogo) => !f.en_compra_id;
  const visibles = filas.filter(seleccionable);
  const todasVisibles = visibles.length > 0 && visibles.every((f) => sel.has(f.item_id));

  const alternar = (f: FilaCatalogo) => {
    if (!seleccionable(f)) return;
    setSel((s) => { const n = new Map(s); if (n.has(f.item_id)) n.delete(f.item_id); else n.set(f.item_id, { item_id: f.item_id, nombre: f.nombre_base, cantidad: '', linea: f.linea }); return n; });
  };
  const ponerCantidad = (f: FilaCatalogo, valor: string) =>
    setSel((s) => { const n = new Map(s); n.set(f.item_id, { item_id: f.item_id, nombre: f.nombre_base, cantidad: valor, linea: f.linea }); return n; });

  async function elegirTodos() {
    setOcupado(true);
    const n = new Map(sel);
    for (let off = 0; off < Math.min(total, 3000); off += 500) {
      const { data, error: e } = await supabase.rpc('compra_catalogo', filtro(500, off));
      if (e) { setError(textoError(e)); break; }
      for (const f of (data ?? []) as FilaCatalogo[]) if (!f.en_compra_id && !n.has(f.item_id)) n.set(f.item_id, { item_id: f.item_id, nombre: f.nombre_base, cantidad: '', linea: f.linea });
    }
    setSel(n);
    setOcupado(false);
  }

  const elegidos = [...sel.values()];
  const cantidadDe = (e: Elegido): number | undefined => {
    const t = e.cantidad.trim() !== '' ? e.cantidad : defecto;
    const v = t.trim() !== '' ? numeroDeTexto(t) : undefined;
    return v !== undefined && v > 0 ? v : undefined;
  };
  const invalidas = elegidos.filter((e) => { const t = (e.cantidad.trim() !== '' ? e.cantidad : defecto).trim(); return t !== '' && cantidadDe(e) === undefined; });
  const sinCantidad = elegidos.filter((e) => cantidadDe(e) === undefined && invalidas.indexOf(e) < 0).length;
  const nombresChips = useMemo(() => elegidos.slice(0, 14), [elegidos]);
  const claveContexto = `${[...new Set(elegidos.map((e) => e.linea ?? 'Sin línea'))].sort().join('|')}#${linea}#${provId ?? ''}`;
  useEffect(() => {
    if (!onContexto) return;
    const deElegidos = [...new Set(elegidos.map((e) => e.linea ?? 'Sin línea'))].sort((a, b) => a.localeCompare(b, 'es'));
    onContexto({
      lineas: deElegidos.length > 0 ? deElegidos : linea ? [linea] : [],
      proveedor: provId ? (provs.find((p) => p.valor === String(provId))?.texto ?? null) : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveContexto, provs]);

  async function aceptar() {
    setOcupado(true);
    try {
      await onAceptar(elegidos.map((e) => { const c = cantidadDe(e); return c !== undefined ? { item_id: e.item_id, cantidad: c } : { item_id: e.item_id }; }), provId);
    } finally { setOcupado(false); }
  }

  return (
    <div>
      <div className="mod-toolbar mod-toolbar--top">
        <div className="ag-search" style={{ flex: '1 1 300px', minWidth: 300, maxWidth: 400 }}>
          <input className="ui-input" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por código, nombre o referencia" aria-label="Buscar productos" autoFocus />
        </div>
        <SelectorLinea lineas={lineas} valor={linea} onCambio={(v) => { setLinea(v); setPagina(0); }} />
        {conProveedor && (
          <Combobox opciones={provs} valor={prov} onCambio={(v) => { setProv(v); setPagina(0); onProveedorCambia?.(v ? Number(v) : null); }}
            etiqueta="Proveedor" vacio="Todos los proveedores" ancho={260} />
        )}
        <label className="mod-flex mod-gap-1 mod-center mod-text"><input type="checkbox" checked={exclusivos} onChange={(e) => { setExclusivos(e.target.checked); setPagina(0); }} /> Solo los de un único proveedor</label>
        <label className="mod-text">Cantidad por defecto{' '}
          <input className="ui-input ui-input--sm" style={{ width: 110 }} inputMode="decimal" value={defecto} placeholder="opcional" onChange={(e) => setDefecto(e.target.value)} aria-label="Cantidad por defecto" />
        </label>
      </div>

      <div className="mod-bulkbar" role="region" aria-label="Productos elegidos">
        <span className="mod-semibold">{elegidos.length} elegido(s)</span>
        <button type="button" className="ui-btn ui-btn--sm" disabled={ocupado || total === 0} onClick={elegirTodos}>Elegir los {total} resultados</button>
        {elegidos.length > 0 && <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => setSel(new Map())}>Quitar selección</button>}
        <span className="pm-sep" />
        <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" disabled={ocupado || elegidos.length === 0 || invalidas.length > 0} onClick={aceptar}>{textoAceptar(elegidos.length)}</button>
      </div>
      {elegidos.length > 0 && (
        <div className="mod-flex mod-gap-1 mod-wrap mod-mb-2" style={{ maxHeight: '4.25rem', overflowY: 'auto' }}>
          {nombresChips.map((e) => (
            <span key={e.item_id} className="pm-chip">{e.nombre}{cantidadDe(e) !== undefined ? ` · ${cantidadDe(e)}` : ''} <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" aria-label={`Quitar ${e.nombre}`} onClick={() => setSel((s) => { const n = new Map(s); n.delete(e.item_id); return n; })}>×</button></span>
          ))}
          {elegidos.length > nombresChips.length && <span className="mod-sub">y {elegidos.length - nombresChips.length} más</span>}
        </div>
      )}
      {sinCantidad > 0 && <p className="mod-sub mod-mt-0">{sinCantidad} sin cantidad: se cotizan igual y la confirmas en la compra antes de emitir la orden.</p>}
      {invalidas.length > 0 && <p className="mod-error">Hay cantidades que no son un número mayor que cero.</p>}
      {error && <p className="mod-error">{error}</p>}

      <div className="pm-tabla-selector">
        <table className="mod-table">
          <thead>
            <tr>
              <th className="pm-ck"><input type="checkbox" tabIndex={-1} checked={todasVisibles} disabled={visibles.length === 0} aria-label="Elegir todos los de esta página"
                onChange={(e) => setSel((s) => { const n = new Map(s); visibles.forEach((f) => { if (e.target.checked) { if (!n.has(f.item_id)) n.set(f.item_id, { item_id: f.item_id, nombre: f.nombre_base, cantidad: '', linea: f.linea }); } else n.delete(f.item_id); }); return n; })} /></th>
              <th>Ítem</th><th>Producto</th><th>Línea</th><th>Ref. proveedor</th><th>Precio ERP</th><th>Cantidad</th><th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const on = sel.has(f.item_id);
              const bloqueada = !seleccionable(f);
              return (
                <tr key={f.item_id} className={`${on ? 'is-selected ' : ''}${bloqueada ? 'is-faded' : 'is-clickable'}`} onClick={() => alternar(f)}>
                  <td className="pm-ck" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" tabIndex={-1} checked={on} disabled={bloqueada} onChange={() => alternar(f)} aria-label={`Elegir ${f.nombre_base}`} />
                  </td>
                  <td><b>{idVisible(f.item_id, false, f.codigo)}</b></td>
                  <td>{f.nombre_base}{f.agotados_pendientes ? <span className="pm-chico">hay {f.agotados_pendientes} en agotados pendientes</span> : null}</td>
                  <td>{f.linea ?? 'Sin línea'}</td>
                  <td>{f.referencia ?? '—'}</td>
                  <td>{pesos(f.precio_lista)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {on && (
                      <input className="ui-input ui-input--sm" style={{ width: 84 }} inputMode="decimal" value={sel.get(f.item_id)?.cantidad ?? ''} placeholder={defecto || 'cantidad'}
                        aria-label={`Cantidad de ${f.nombre_base}`} data-cant={f.item_id}
                        onChange={(e) => ponerCantidad(f, e.target.value)}
                        onKeyDown={(e) => {
                          const ids = filas.filter((x) => sel.has(x.item_id)).map((x) => x.item_id);
                          const i = ids.indexOf(f.item_id);
                          const ir = (k: number) => { const id = ids[i + k]; if (id !== undefined) document.querySelector<HTMLInputElement>(`input[data-cant="${id}"]`)?.focus(); };
                          if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); ir(1); } else if (e.key === 'ArrowUp') { e.preventDefault(); ir(-1); }
                        }} />
                    )}
                  </td>
                  <td>
                    {f.en_esta_compra ? <Badge tono="azul">ya está en esta compra</Badge>
                      : f.en_compra_numero ? <Badge tono="ambar" titulo="Quítalo de esa compra o elimínala para usarlo aquí">en {numeroCompra(f.en_compra_numero)}</Badge>
                      : f.proveedores === 0 ? <Badge tono="rojo">sin proveedor</Badge> : f.exclusivo ? <Badge>único proveedor</Badge> : null}
                  </td>
                </tr>
              );
            })}
            {filas.length === 0 && <tr><td colSpan={8}>No hay productos con ese filtro.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mod-pager pm-pager-selector">
        <button disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>Anterior</button>
        <span>Página {pagina + 1} de {Math.max(1, Math.ceil(total / POR_PAGINA))} ({total} productos)</span>
        <button disabled={(pagina + 1) * POR_PAGINA >= total} onClick={() => setPagina((p) => p + 1)}>Siguiente</button>
      </div>
    </div>
  );
}
