'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useTiempoReal } from '@/components/useTiempoReal';
import { fecha, pesos, PanelTexto, TABLAS_PEDIDOS, textoCajas } from '@/components/pedidos/comun';
import TablaExcel from '@/components/TablaExcel';

interface LineaPorGenerar {
  cotizacion_id: string;
  item_id: number;
  codigo: string | null;
  nombre_base: string;
  linea: string | null;
  referencia: string | null;
  cantidad: number;
  unidades_por_caja: number | null;
  cajas: number | null;
  costo_unitario: number;
  costo_con_iva: number;
  flete: number | null;
}

interface PorGenerar {
  proveedor_id: number;
  proveedor: string;
  documento: string;
  items: number;
  total_con_iva: number;
  lineas: LineaPorGenerar[];
}

interface LineaOrden {
  item_id: number;
  codigo: string | null;
  nombre_base: string;
  linea: string | null;
  cantidad: number;
  unidades_por_caja: number | null;
  costo_unitario: number;
  costo_con_iva: number | null;
}

interface Orden {
  id: string;
  numero_texto: string;
  proveedor_id: number;
  proveedor: string;
  documento: string;
  sede: string | null;
  fecha: string;
  total_oc: number | null;
  creado_por: string | null;
  items: LineaOrden[];
}

export default function OrdenesCompra({
  supabase,
  organizacionId,
}: {
  supabase: SupabaseClient;
  organizacionId: string;
}) {
  const [porGenerar, setPorGenerar] = useState<PorGenerar[]>([]);
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [error, setError] = useState('');
  const [generando, setGenerando] = useState<number | null>(null);
  const [texto, setTexto] = useState<{ titulo: string; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.rpc('listar_ordenes_por_generar', { p_org: organizacionId }),
      supabase.rpc('listar_ordenes_compra', { p_org: organizacionId, p_limit: 100, p_offset: 0 }),
    ]);
    if (a.error) setError(a.error.message);
    else if (b.error) setError(b.error.message);
    else {
      setError('');
      setPorGenerar((a.data ?? []) as PorGenerar[]);
      setOrdenes((b.data ?? []) as Orden[]);
    }
  }, [supabase, organizacionId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Lo que falta por pedir a cada proveedor cambia cuando alguien elige un ganador o genera una orden:
  // dos compradores a la vez ven lo mismo sin recargar (y la base impide generar dos veces la misma orden).
  useTiempoReal(supabase, organizacionId, TABLAS_PEDIDOS, cargar);

  async function verTexto(id: string, numero: string, proveedor: string) {
    const { data, error } = await supabase.rpc('orden_compra_texto', { p_org: organizacionId, p_orden: id });
    if (error) setError(error.message);
    else setTexto({ titulo: `Orden ${numero} — ${proveedor}`, texto: data as string });
  }

  async function generar(p: PorGenerar) {
    if (!window.confirm(`¿Generar la orden de compra para ${p.proveedor} con ${p.items} ítem(s)?`)) return;
    setGenerando(p.proveedor_id);
    const { data, error } = await supabase.rpc('orden_compra_generar', {
      p_org: organizacionId,
      p_proveedor: p.proveedor_id,
    });
    setGenerando(null);
    if (error) {
      setError(error.message);
      return;
    }
    setError('');
    await cargar();
    const id = data as string;
    const o = await supabase.rpc('listar_ordenes_compra', { p_org: organizacionId, p_proveedor: p.proveedor_id, p_limit: 1, p_offset: 0 });
    const numero = ((o.data ?? []) as Orden[])[0]?.numero_texto ?? '';
    await verTexto(id, numero, p.proveedor);
  }

  return (
    <div>
      {error && <p className="mod-text">Error: {error}</p>}

      {texto && (
        <PanelTexto titulo={texto.titulo} texto={texto.texto} onCerrar={() => setTexto(null)} />
      )}

      <h3 className="mod-h3 mod-mt-0 mod-mb-2">Por generar (ganadores elegidos, agrupados por proveedor)</h3>
      {porGenerar.length === 0 && (
        <p className="mod-text">No hay ítems ganadores pendientes. Elige un ganador en el detalle de cotización de cada ítem.</p>
      )}
      {porGenerar.map((p) => (
        <div key={p.proveedor_id} className="mod-mb-4">
          <div className="mod-flex mod-gap-3 mod-center mod-mb-1">
            <strong className="mod-md">{p.proveedor} ({p.documento})</strong>
            <span className="mod-text">{p.items} ítem(s) · Total con IVA {pesos(p.total_con_iva)}</span>
            <button
              type="button"
              className="ui-btn ui-btn--sm mod-semibold"
              disabled={generando === p.proveedor_id}
              onClick={() => generar(p)}
            >
              Generar orden de compra
            </button>
          </div>
          <TablaExcel clave="ordenescompra-1" etiqueta="Tabla de órdenes de compra"><table className="mod-table">
              <thead>
                <tr>
                  {['Item', 'Nombre Base', 'Línea', 'Referencia', 'Cantidad', 'Cajas', 'Costo unit.', 'Costo con IVA', 'Flete'].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {p.lineas.map((l) => (
                  <tr key={l.cotizacion_id}>
                    <td>{l.codigo ?? l.item_id}</td>
                    <td>{l.nombre_base}</td>
                    <td>{l.linea ?? ''}</td>
                    <td>{l.referencia ?? ''}</td>
                    <td>{l.cantidad}</td>
                    <td>{textoCajas(l.cantidad, l.unidades_por_caja)}</td>
                    <td>{pesos(l.costo_unitario)}</td>
                    <td>{pesos(l.costo_con_iva)}</td>
                    <td>{pesos(l.flete)}</td>
                  </tr>
                ))}
              </tbody>
            </table></TablaExcel>
        </div>
      ))}

      <h3 className="mod-h3 mod-mt-5 mod-mb-2">Historial de órdenes</h3>
      <TablaExcel clave="ordenescompra-2" etiqueta="Tabla de órdenes de compra"><table className="mod-table">
          <thead>
            <tr>
              {['N°', 'Proveedor', 'Sede', 'Fecha', 'Total con IVA', 'Creó', 'Ítems', 'Acción'].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordenes.map((o) => (
              <tr key={o.id}>
                <td>{o.numero_texto}</td>
                <td>{o.proveedor}</td>
                <td>{o.sede ?? ''}</td>
                <td>{fecha(o.fecha)}</td>
                <td>{pesos(o.total_oc)}</td>
                <td>{o.creado_por ?? ''}</td>
                <td>
                  <details>
                    <summary className="mod-pointer">{o.items.length} ítem(s)</summary>
                    {o.items.map((l) => (
                      <div key={l.item_id} className="mod-sub">
                        {l.codigo ?? l.item_id} · {l.nombre_base} · {l.cantidad}
                        {l.unidades_por_caja ? ` (${textoCajas(l.cantidad, l.unidades_por_caja)})` : ''} · {pesos(l.costo_unitario)}
                      </div>
                    ))}
                  </details>
                </td>
                <td>
                  <button type="button" className="ui-btn ui-btn--sm ui-btn--soft" onClick={() => verTexto(o.id, o.numero_texto, o.proveedor)}>
                    Ver / copiar
                  </button>
                </td>
              </tr>
            ))}
            {ordenes.length === 0 && (
              <tr><td colSpan={8}>Aún no hay órdenes de compra</td></tr>
            )}
          </tbody>
        </table></TablaExcel>
    </div>
  );
}
