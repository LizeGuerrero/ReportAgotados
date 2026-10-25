'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useTiempoReal } from '@/components/useTiempoReal';
import type { PermisosPedidos } from '@/components/pedidos/usePermisosPedidos';
import SelectorEstructura from '@/components/pedidos/Selector';
import { fecha, pesos } from '@/components/pedidos/comun';
import { ESTADO_ORDEN, MOTIVO, numeroCompra, numeroOrden, type OrdenDetalle } from '@/components/pedidos/tipos';
import { Badge, Modal, Vacio, copiarTexto, textoError } from '@/components/pedidos/ui';

/**
 * Órdenes de compra: una por proveedor, generadas desde una compra. Aquí se envían y se les hace seguimiento.
 * Con `compraId` solo muestra las de esa compra (pestaña Órdenes de la mesa).
 */
export default function OrdenesCompra({
  supabase, organizacionId, permisos, compraId, onAbrirCompra, alCambiar,
}: {
  supabase: SupabaseClient; organizacionId: string; permisos: PermisosPedidos; compraId?: string;
  onAbrirCompra?: (id: string) => void; alCambiar?: () => void;
}) {
  const [estado, setEstado] = useState('');
  const [ordenes, setOrdenes] = useState<OrdenDetalle[]>([]);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('ordenes_detalle', { p_org: organizacionId, p_compra: compraId ?? null, p_estado: estado || null, p_limit: 100 });
    setCargando(false);
    if (e) setError(textoError(e));
    else { setError(''); setOrdenes((data ?? []) as OrdenDetalle[]); }
  }, [supabase, organizacionId, compraId, estado]);

  useEffect(() => { cargar(); }, [cargar]);
  useTiempoReal(supabase, organizacionId, ['ordenes_compra'], cargar);

  return (
    <div>
      {!compraId && (
        <>
          <p className="mod-text mod-mt-0">Una orden por proveedor, generadas desde una compra. Aquí se envían y se les hace seguimiento.</p>
          <div className="mod-toolbar mod-toolbar--top">
            <select className="ui-input ui-input--sm mod-auto" value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Estado">
              <option value="">Todas</option><option value="emitida">Emitidas (sin enviar)</option><option value="enviada">Enviadas</option><option value="cancelada">Canceladas</option>
            </select>
          </div>
        </>
      )}
      {error && <p className="mod-error">{error}</p>}
      {!cargando && ordenes.length === 0 && (
        <Vacio titulo={compraId ? 'Aún no hay órdenes' : 'No hay órdenes'}
          texto={compraId ? 'Se generan en la pestaña Decisión, una por proveedor.' : 'Las órdenes salen de la pestaña Decisión de una compra.'} />
      )}
      {ordenes.map((o) => (
        <OrdenCard key={o.id} orden={o} conCompra={!compraId} supabase={supabase} organizacionId={organizacionId} permisos={permisos}
          onAbrirCompra={onAbrirCompra} alCambiar={() => { cargar(); alCambiar?.(); }} />
      ))}
    </div>
  );
}

/** Una orden de compra: resumen, mensaje para el proveedor (sin datos internos) y acciones. */
export function OrdenCard({
  orden: o, conCompra = true, supabase, organizacionId, permisos, onAbrirCompra, alCambiar,
}: {
  orden: OrdenDetalle; conCompra?: boolean; supabase: SupabaseClient; organizacionId: string; permisos: PermisosPedidos;
  onAbrirCompra?: (id: string) => void; alCambiar: () => void;
}) {
  const { slug } = useParams<{ slug: string }>();
  const [abierta, setAbierta] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [interno, setInterno] = useState(false);
  const [estructura, setEstructura] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [copiado, setCopiado] = useState('');
  const est = ESTADO_ORDEN[o.estado] ?? ESTADO_ORDEN.emitida;

  const pedirTexto = useCallback(async (esInterno: boolean, estr: string | null) => {
    const { data, error: e } = await supabase.rpc('orden_mensaje', { p_org: organizacionId, p_orden: o.id, p_interno: esInterno, p_estructura: estr });
    if (e) { setError(textoError(e)); return ''; }
    return String(data ?? '');
  }, [supabase, organizacionId, o.id]);

  useEffect(() => {
    if (!abierta) return;
    let vigente = true;
    pedirTexto(interno, estructura).then((t) => vigente && setTexto(t));
    return () => { vigente = false; };
  }, [abierta, interno, estructura, pedirTexto, o.estado]);

  async function enviar() {
    const { error: e } = await supabase.rpc('orden_marcar_enviada', { p_org: organizacionId, p_orden: o.id });
    if (e) setError(textoError(e)); else { setError(''); alCambiar(); }
  }
  async function cancelar() {
    const { error: e } = await supabase.rpc('orden_cancelar', { p_org: organizacionId, p_orden: o.id, p_motivo: motivo });
    if (e) return setError(textoError(e));
    setCancelando(false); setMotivo(''); setError(''); alCambiar();
  }

  return (
    <div className="mod-card mod-mb-3">
      <div className="mod-flex mod-gap-3 mod-center mod-wrap">
        <strong>{numeroOrden(o.numero)}</strong>
        <Badge tono={est.tono}>{est.texto}</Badge>
        <span>{o.proveedor}</span>
        {conCompra && o.compra_id && (
          <span className="mod-sub">· desde{' '}
            <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => onAbrirCompra?.(o.compra_id as string)}>{numeroCompra(o.compra_numero ?? 0)}</button>
          </span>
        )}
        <span className="pm-sep" />
        <span className="mod-sub">{o.lineas.length} producto(s) · {fecha(o.fecha)}</span>
        <strong>{pesos(o.total)}</strong>
        {(o.flete ?? 0) > 0 && <span className="mod-sub">+ flete {pesos(o.flete)}</span>}
      </div>
      {o.cancelada_motivo && <p className="mod-sub">Motivo de la cancelación: {o.cancelada_motivo}</p>}
      {error && <p className="mod-error">{error}</p>}
      <div className="mod-flex mod-gap-2 mod-wrap mod-mt-2">
        <button type="button" className="ui-btn ui-btn--sm" onClick={() => setAbierta(!abierta)}>{abierta ? 'Ocultar detalle' : 'Ver detalle y mensaje'}</button>
        {(o.estado === 'emitida' || o.estado === 'pendiente') && (
          <>
            <button type="button" className="ui-btn ui-btn--sm"
              onClick={async () => { const t = await pedirTexto(false, null); setCopiado((await copiarTexto(t)) ? 'Mensaje copiado' : 'No se pudo copiar'); }}>Copiar mensaje</button>
            {permisos.ganadorEditar && <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" onClick={enviar}>Marcar como enviada</button>}
          </>
        )}
        {o.estado !== 'cancelada' && permisos.ganadorEditar && <button type="button" className="ui-btn ui-btn--sm ui-btn--danger" onClick={() => setCancelando(true)}>Cancelar orden</button>}
        {copiado && <span className="mod-sub">{copiado}</span>}
      </div>

      {abierta && (
        <div className="mod-mt-2">
          <div className="mod-scroll mod-mb-2">
            <table className="mod-table">
              <thead><tr><th>Producto</th><th>Ref.</th><th>Cant.</th><th>Costo unit.</th><th>Subtotal</th><th>Por qué se eligió</th></tr></thead>
              <tbody>
                {o.lineas.map((l) => (
                  <tr key={l.item_id}>
                    <td>{l.nombre}<span className="pm-chico">{l.codigo}</span></td>
                    <td>{l.referencia ?? '—'}</td><td>{l.cantidad}</td><td>{pesos(l.costo)}</td><td>{pesos(l.costo * l.cantidad)}</td>
                    <td>{l.motivo ? <Badge>{MOTIVO[l.motivo]}</Badge> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mod-flex mod-gap-2 mod-mb-2">
            <button type="button" className={interno ? 'ui-btn ui-btn--sm' : 'ui-btn ui-btn--sm ui-btn--primary'} onClick={() => setInterno(false)}>Para el proveedor</button>
            <button type="button" className={interno ? 'ui-btn ui-btn--sm ui-btn--primary' : 'ui-btn ui-btn--sm'} onClick={() => setInterno(true)}>Copia interna</button>
          </div>
          <div className="mod-mb-2">
            <SelectorEstructura supabase={supabase} organizacionId={organizacionId} tipo="orden_compra" proveedorId={o.proveedor_id} proveedorNombre={o.proveedor}
              valor={estructura} onCambio={setEstructura} puedeFijar={permisos.editar} enlaceMensajes={`/app/${slug}/mensajes`} />
          </div>
          <div className="mod-sub mod-mb-2">{interno ? 'Copia interna: incluye datos que el proveedor no recibe.' : 'Esto es lo que recibe el proveedor, según la estructura elegida (definidas en “Mensajes”).'}</div>
          <pre className="pm-mensaje">{texto}</pre>
          <div className="mod-mt-2">
            <button type="button" className="ui-btn ui-btn--sm" onClick={async () => setCopiado((await copiarTexto(texto)) ? 'Mensaje copiado' : 'No se pudo copiar')}>Copiar {interno ? 'copia interna' : 'mensaje'}</button>
          </div>
        </div>
      )}

      {cancelando && (
        <Modal titulo={`Cancelar ${numeroOrden(o.numero)}`} onCerrar={() => setCancelando(false)}>
          <label className="ui-field">
            <span className="ui-label">Motivo *</span>
            <input className="ui-input" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
          </label>
          <p className="mod-sub">Cancelar no devuelve los productos a Agotados por atender; solo deja constancia. Si hay que volver a comprarlos, arma una compra nueva.</p>
          <div className="pm-modal__acciones">
            <button type="button" className="ui-btn" onClick={() => setCancelando(false)}>Volver</button>
            <button type="button" className="ui-btn ui-btn--danger-solid" disabled={!motivo.trim()} onClick={cancelar}>Cancelar la orden</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
