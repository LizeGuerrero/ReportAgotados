'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { boton, celda, fecha, pesos, PanelTexto, textoCajas } from '@/components/pedidos/comun';

interface LineaPorGenerar {
  cotizacion_id: string;
  item_id: number;
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
  items: number;
  total_con_iva: number;
  lineas: LineaPorGenerar[];
}

interface LineaOrden {
  item_id: number;
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
      {error && <p style={{ fontSize: 13 }}>Error: {error}</p>}

      {texto && (
        <PanelTexto titulo={texto.titulo} texto={texto.texto} onCerrar={() => setTexto(null)} />
      )}

      <h3 style={{ fontSize: 15, margin: '0 0 8px' }}>Por generar (ganadores elegidos, agrupados por proveedor)</h3>
      {porGenerar.length === 0 && (
        <p style={{ fontSize: 13 }}>No hay ítems ganadores pendientes. Elige un ganador en el detalle de cotización de cada ítem.</p>
      )}
      {porGenerar.map((p) => (
        <div key={p.proveedor_id} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 4 }}>
            <strong style={{ fontSize: 14 }}>{p.proveedor} (NIT {p.proveedor_id})</strong>
            <span style={{ fontSize: 13 }}>{p.items} ítem(s) · Total con IVA {pesos(p.total_con_iva)}</span>
            <button
              type="button"
              style={{ ...boton, fontWeight: 600 }}
              disabled={generando === p.proveedor_id}
              onClick={() => generar(p)}
            >
              Generar orden de compra
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  {['Item', 'Nombre Base', 'Línea', 'Referencia', 'Cantidad', 'Cajas', 'Costo unit.', 'Costo con IVA', 'Flete'].map((h) => (
                    <th key={h} style={{ ...celda, fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {p.lineas.map((l) => (
                  <tr key={l.cotizacion_id}>
                    <td style={celda}>{l.item_id}</td>
                    <td style={celda}>{l.nombre_base}</td>
                    <td style={celda}>{l.linea ?? ''}</td>
                    <td style={celda}>{l.referencia ?? ''}</td>
                    <td style={celda}>{l.cantidad}</td>
                    <td style={celda}>{textoCajas(l.cantidad, l.unidades_por_caja)}</td>
                    <td style={celda}>{pesos(l.costo_unitario)}</td>
                    <td style={celda}>{pesos(l.costo_con_iva)}</td>
                    <td style={celda}>{pesos(l.flete)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <h3 style={{ fontSize: 15, margin: '24px 0 8px' }}>Historial de órdenes</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              {['N°', 'Proveedor', 'Sede', 'Fecha', 'Total con IVA', 'Creó', 'Ítems', 'Acción'].map((h) => (
                <th key={h} style={{ ...celda, fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordenes.map((o) => (
              <tr key={o.id}>
                <td style={celda}>{o.numero_texto}</td>
                <td style={celda}>{o.proveedor}</td>
                <td style={celda}>{o.sede ?? ''}</td>
                <td style={celda}>{fecha(o.fecha)}</td>
                <td style={celda}>{pesos(o.total_oc)}</td>
                <td style={celda}>{o.creado_por ?? ''}</td>
                <td style={celda}>
                  <details>
                    <summary style={{ cursor: 'pointer' }}>{o.items.length} ítem(s)</summary>
                    {o.items.map((l) => (
                      <div key={l.item_id} style={{ fontSize: 12 }}>
                        {l.item_id} · {l.nombre_base} · {l.cantidad}
                        {l.unidades_por_caja ? ` (${textoCajas(l.cantidad, l.unidades_por_caja)})` : ''} · {pesos(l.costo_unitario)}
                      </div>
                    ))}
                  </details>
                </td>
                <td style={celda}>
                  <button type="button" style={boton} onClick={() => verTexto(o.id, o.numero_texto, o.proveedor)}>
                    Ver / copiar
                  </button>
                </td>
              </tr>
            ))}
            {ordenes.length === 0 && (
              <tr><td style={celda} colSpan={8}>Aún no hay órdenes de compra</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
