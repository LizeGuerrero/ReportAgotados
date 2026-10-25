'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useTiempoReal } from '@/components/useTiempoReal';
import type { PermisosPedidos } from '@/components/pedidos/usePermisosPedidos';
import { fecha, pesos } from '@/components/pedidos/comun';
import { ESTADO_COMPRA, numeroCompra, type CompraDetalle } from '@/components/pedidos/tipos';
import { resumenCompra, siguientePaso } from '@/components/pedidos/reglas';
import { Badge, Modal, Vacio, textoError } from '@/components/pedidos/ui';
import CompraAutomatica from '@/components/pedidos/CompraAutomatica';

/** Detalle de las compras de la organización (en curso, o todas) para listarlas y calcular su avance. */
export function useComprasDetalle(supabase: SupabaseClient, organizacionId: string, soloCurso: boolean) {
  const [compras, setCompras] = useState<CompraDetalle[]>([]);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('compras_detalle', { p_org: organizacionId, p_solo_curso: soloCurso, p_limit: 60 });
    setCargando(false);
    if (e) setError(textoError(e));
    else { setError(''); setCompras((data ?? []) as CompraDetalle[]); }
  }, [supabase, organizacionId, soloCurso]);
  useEffect(() => { cargar(); }, [cargar]);
  useTiempoReal(supabase, organizacionId, ['compras', 'compra_lineas', 'compra_ofertas', 'compra_asignaciones', 'ordenes_compra'], cargar);
  return { compras, error, cargando, recargar: cargar };
}

/** Compras: cada una reúne productos, ofertas de proveedores, la decisión y las órdenes que salen de ella. */
export default function ListaCompras({
  supabase, organizacionId, permisos, onAbrir, onIrANecesidades,
}: {
  supabase: SupabaseClient; organizacionId: string; permisos: PermisosPedidos; onAbrir: (id: string) => void; onIrANecesidades: () => void;
}) {
  const [ver, setVer] = useState<'curso' | 'todas'>('curso');
  const { compras, error, cargando } = useComprasDetalle(supabase, organizacionId, ver === 'curso');
  const [nueva, setNueva] = useState(false);
  const [auto, setAuto] = useState<null | 'linea' | 'proveedor'>(null);
  const [titulo, setTitulo] = useState('');
  const [errorNueva, setErrorNueva] = useState('');

  async function crearVacia() {
    const { data, error: e } = await supabase.rpc('compra_crear', { p_org: organizacionId, p_titulo: titulo, p_items: null, p_proveedores: null });
    if (e) return setErrorNueva(textoError(e));
    setNueva(false); setTitulo('');
    onAbrir(String(data));
  }

  return (
    <div>
      <div className="pm-cab">
        <p className="mod-text mod-mt-0" style={{ maxWidth: 560 }}>
          Cada compra reúne productos, ofertas de proveedores, la decisión y las órdenes que salen de ella.
        </p>
        <div className="mod-flex mod-gap-2 mod-wrap">
          {permisos.crear && (
            <>
              <button type="button" className="ui-btn ui-btn--sm" onClick={() => { setErrorNueva(''); setNueva(true); }}>+ Compra vacía</button>
              <button type="button" className="ui-btn ui-btn--sm" onClick={() => setAuto('linea')}>+ Compra por línea</button>
              <button type="button" className="ui-btn ui-btn--sm" onClick={() => setAuto('proveedor')}>+ Compra por proveedor</button>
            </>
          )}
          <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" onClick={onIrANecesidades}>Crear desde agotados</button>
        </div>
      </div>

      <div className="mod-toolbar mod-toolbar--top">
        <select className="ui-input ui-input--sm mod-auto" value={ver} onChange={(e) => setVer(e.target.value as 'curso' | 'todas')} aria-label="Filtro">
          <option value="curso">En curso</option><option value="todas">Todas (incluye cerradas)</option>
        </select>
      </div>
      {error && <p className="mod-error">{error}</p>}

      {!cargando && compras.length === 0 ? (
        <Vacio titulo="No hay compras" texto="Crea una a partir de los agotados pendientes, o una vacía, por línea o por proveedor.">
          <button type="button" className="ui-btn ui-btn--primary" onClick={onIrANecesidades}>Ver agotados por atender</button>
        </Vacio>
      ) : (
        <div className="mod-scroll">
          <table className="mod-table">
            <thead>
              <tr>
                <th>N°</th><th>Título</th><th>Estado</th><th>Productos</th><th>Asignados</th><th>Proveedores</th><th>Decidido</th><th>Siguiente paso</th><th>Creada</th>
              </tr>
            </thead>
            <tbody>
              {compras.map((c) => {
                const res = resumenCompra(c);
                const e = ESTADO_COMPRA[c.compra.estado];
                return (
                  <tr key={c.compra.id} className="is-clickable" onClick={() => onAbrir(c.compra.id)}>
                    <td><b>{numeroCompra(c.compra.numero)}</b></td>
                    <td>{c.compra.titulo}</td>
                    <td><Badge tono={e.tono}>{e.texto}</Badge></td>
                    <td>{c.lineas.length}</td>
                    <td>{res.completas.length}/{c.lineas.length}</td>
                    <td>{c.proveedores.length}</td>
                    <td>{res.total > 0 ? pesos(res.total) : '—'}</td>
                    <td className="mod-sub">{siguientePaso(c).texto}</td>
                    <td className="mod-sub">{fecha(c.compra.creada)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {auto && (
        <CompraAutomatica modo={auto} supabase={supabase} organizacionId={organizacionId}
          onCerrar={() => setAuto(null)} onCreada={(id) => { setAuto(null); onAbrir(id); }} />
      )}
      {nueva && (
        <Modal titulo="Nueva compra vacía" onCerrar={() => setNueva(false)}>
          <label className="ui-field">
            <span className="ui-label">Título *</span>
            <input className="ui-input" value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus />
          </label>
          {errorNueva && <p className="mod-error">{errorNueva}</p>}
          <div className="pm-modal__acciones">
            <button type="button" className="ui-btn" onClick={() => setNueva(false)}>Cancelar</button>
            <button type="button" className="ui-btn ui-btn--primary" disabled={titulo.trim().length < 3} onClick={crearVacia}>Crear</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
