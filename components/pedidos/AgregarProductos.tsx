'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { idVisible } from '@/components/pedidos/comun';
import { Modal, textoError } from '@/components/pedidos/ui';
import { numeroDeTexto } from '@/components/pedidos/reglas';

interface Necesidad { item_id: number; codigo: string | null; nombre_base: string; linea: string | null; cantidad_sugerida: number | null }
interface ItemCat { item_id: number; codigo: string | null; nombre_base: string; linea: string | null; unidad_medida: string | null; proveedores: number }

/**
 * Agregar productos a la compra en lote: desde los agotados pendientes (la cantidad sale de lo sugerido
 * por las sedes) o desde el catálogo (con la cantidad que digites).
 */
export default function AgregarProductos({
  supabase, organizacionId, compraId, onCerrar, onAgregado,
}: {
  supabase: SupabaseClient;
  organizacionId: string;
  compraId: string;
  onCerrar: () => void;
  onAgregado: () => void;
}) {
  const [origen, setOrigen] = useState<'agotados' | 'catalogo'>('agotados');
  const [texto, setTexto] = useState('');
  const [necesidades, setNecesidades] = useState<Necesidad[]>([]);
  const [catalogo, setCatalogo] = useState<ItemCat[]>([]);
  const [marcados, setMarcados] = useState<Record<number, string>>({});
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (origen === 'agotados') {
        const { data, error: e } = await supabase.rpc('compra_necesidades', {
          p_org: organizacionId, p_linea: null, p_busqueda: texto.trim() || null, p_limit: 100, p_offset: 0,
        });
        if (e) setError(textoError(e));
        else setNecesidades((data ?? []) as Necesidad[]);
      } else {
        const { data, error: e } = await supabase.rpc('compra_buscar_items', {
          p_org: organizacionId, p_busqueda: texto.trim() || null, p_limit: 50,
        });
        if (e) setError(textoError(e));
        else setCatalogo((data ?? []) as ItemCat[]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [supabase, organizacionId, origen, texto]);

  const ids = Object.keys(marcados).map(Number);
  const lista = origen === 'agotados' ? necesidades : catalogo;

  async function agregar() {
    const items = ids.map((id) => {
      const c = numeroDeTexto(marcados[id] ?? '');
      const base = origen === 'catalogo' ? { item_id: id, sin_agotados: true } : { item_id: id };
      return c && c > 0 ? { ...base, cantidad: c } : base;
    });
    if (origen === 'catalogo' && items.some((i) => !('cantidad' in i))) return setError('Digita la cantidad de cada producto marcado.');
    setOcupado(true);
    const { error: e } = await supabase.rpc('compra_agregar_items', { p_org: organizacionId, p_compra: compraId, p_items: items });
    setOcupado(false);
    if (e) return setError(textoError(e));
    onAgregado();
    onCerrar();
  }

  return (
    <Modal titulo="Agregar productos a la compra" onCerrar={onCerrar} ancha>
      <p className="mod-text mod-mt-0">
        {origen === 'agotados'
          ? 'Agotados que reportaron las sedes y no están en otra compra: la cantidad sale de lo sugerido (o la que escribas) y quedan atendidos por esta compra.'
          : 'Cualquier producto del catálogo, aunque nadie lo haya reportado como agotado: escribe la cantidad de cada uno.'}
      </p>
      <div className="mod-flex mod-gap-2 mod-mb-2">
        {(['agotados', 'catalogo'] as const).map((o) => (
          <button key={o} type="button" className={origen === o ? 'ui-btn ui-btn--sm ui-btn--primary' : 'ui-btn ui-btn--sm'}
            onClick={() => { setOrigen(o); setMarcados({}); setError(''); }}>
            {o === 'agotados' ? 'Agotados pendientes' : 'Catálogo'}
          </button>
        ))}
        <input className="ui-input ui-input--sm" style={{ flex: 1 }} placeholder="Buscar por ítem, nombre o referencia"
          value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Buscar productos" />
      </div>
      {error && <p className="mod-error">{error}</p>}
      <div className="pm-lista">
        <table className="mod-table">
          <thead>
            <tr><th className="mod-check" /><th>Ítem</th><th>Nombre</th><th>Línea</th><th>{origen === 'agotados' ? 'Cant. sugerida' : 'Cantidad'}</th></tr>
          </thead>
          <tbody>
            {lista.map((f) => {
              const on = f.item_id in marcados;
              const sugerida = 'cantidad_sugerida' in f ? f.cantidad_sugerida : null;
              return (
                <tr key={f.item_id} className={on ? 'is-selected' : ''}>
                  <td className="mod-check">
                    <input type="checkbox" checked={on} aria-label={`Marcar ${f.nombre_base}`}
                      onChange={(e) => setMarcados((m) => {
                        const n = { ...m };
                        if (e.target.checked) n[f.item_id] = origen === 'agotados' ? '' : '1';
                        else delete n[f.item_id];
                        return n;
                      })} />
                  </td>
                  <td>{idVisible(f.item_id, false, f.codigo)}</td>
                  <td>{f.nombre_base}</td>
                  <td>{f.linea ?? ''}</td>
                  <td>
                    {origen === 'agotados' ? (
                      on ? (
                        <input className="ui-input ui-input--sm" style={{ width: 90 }} placeholder={String(sugerida ?? '')}
                          value={marcados[f.item_id]} onChange={(e) => setMarcados({ ...marcados, [f.item_id]: e.target.value })}
                          aria-label="Cantidad (vacío = la sugerida)" />
                      ) : (sugerida ?? '')
                    ) : (
                      on && (
                        <input className="ui-input ui-input--sm" style={{ width: 90 }} value={marcados[f.item_id]}
                          onChange={(e) => setMarcados({ ...marcados, [f.item_id]: e.target.value })} aria-label="Cantidad" />
                      )
                    )}
                  </td>
                </tr>
              );
            })}
            {lista.length === 0 && <tr><td colSpan={5}>{origen === 'agotados' ? 'No hay agotados pendientes' : 'Sin resultados'}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="pm-modal__acciones">
        <button type="button" className="ui-btn" onClick={onCerrar}>Cancelar</button>
        <button type="button" className="ui-btn ui-btn--primary" disabled={ids.length === 0 || ocupado} onClick={agregar}>
          Agregar {ids.length || ''} producto(s)
        </button>
      </div>
    </Modal>
  );
}
