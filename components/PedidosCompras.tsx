'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { useAgotadosTiempoReal } from '@/components/useAgotadosTiempoReal';
import SelectorLinea from '@/components/SelectorLinea';
import DetalleCotizacion from '@/components/pedidos/DetalleCotizacion';
import Solicitudes from '@/components/pedidos/Solicitudes';
import OrdenesCompra from '@/components/pedidos/OrdenesCompra';
import { boton, campo, celda, ESTADOS, pesos, type Pedido } from '@/components/pedidos/comun';

type Pestana = 'pedidos' | 'solicitudes' | 'ordenes';

const PESTANAS: { valor: Pestana; texto: string }[] = [
  { valor: 'pedidos', texto: 'Pedidos' },
  { valor: 'solicitudes', texto: 'Solicitudes de cotización' },
  { valor: 'ordenes', texto: 'Órdenes de compra' },
];

const POR_PAGINA = 50;

export default function PedidosCompras({ organizacionId }: { organizacionId: string }) {
  const [supabase] = useState(() => createClient());
  const [pestana, setPestana] = useState<Pestana>('pedidos');

  return (
    <div>
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid #000' }}>
        {PESTANAS.map((p) => (
          <button
            key={p.valor}
            type="button"
            onClick={() => setPestana(p.valor)}
            aria-current={pestana === p.valor}
            style={{
              padding: '8px 16px',
              border: '1px solid #000',
              borderBottom: pestana === p.valor ? '1px solid #fff' : '1px solid #000',
              marginBottom: -1,
              background: pestana === p.valor ? '#fff' : '#eee',
              color: '#000',
              fontSize: 14,
              fontWeight: pestana === p.valor ? 700 : 400,
              cursor: 'pointer',
            }}
          >
            {p.texto}
          </button>
        ))}
      </div>

      {pestana === 'pedidos' && <ListaPedidos supabase={supabase} organizacionId={organizacionId} />}
      {pestana === 'solicitudes' && <Solicitudes supabase={supabase} organizacionId={organizacionId} />}
      {pestana === 'ordenes' && <OrdenesCompra supabase={supabase} organizacionId={organizacionId} />}
    </div>
  );
}

function ListaPedidos({
  supabase,
  organizacionId,
}: {
  supabase: SupabaseClient;
  organizacionId: string;
}) {
  const [filas, setFilas] = useState<Pedido[]>([]);
  const [lineas, setLineas] = useState<string[]>([]);
  const [linea, setLinea] = useState('');
  const [estado, setEstado] = useState('');
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [detalle, setDetalle] = useState<Pedido | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setBusqueda(texto);
      setPagina(0);
    }, 300);
    return () => clearTimeout(t);
  }, [texto]);

  const cargarLineas = useCallback(async () => {
    const { data, error } = await supabase.rpc('listar_lineas_pedidos', { p_org: organizacionId });
    if (error) setError(error.message);
    else {
      // Con una sola columna, PostgREST devuelve texto plano en vez de objetos; se aceptan ambos formatos
      const lista = (data ?? []) as (string | { linea: string })[];
      setLineas(lista.map((d) => (typeof d === 'string' ? d : d.linea)));
    }
  }, [supabase, organizacionId]);

  useEffect(() => {
    cargarLineas();
  }, [cargarLineas]);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase.rpc('listar_pedidos', {
      p_org: organizacionId,
      p_linea: linea || null,
      p_busqueda: busqueda || null,
      p_estado: estado || null,
      p_limit: POR_PAGINA,
      p_offset: pagina * POR_PAGINA,
    });
    if (error) setError(error.message);
    else {
      setError('');
      setFilas((data ?? []) as Pedido[]);
    }
    setCargando(false);
  }, [supabase, organizacionId, linea, busqueda, estado, pagina]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // El detalle abierto se mantiene al día cuando la lista se recarga
  useEffect(() => {
    if (!detalle) return;
    const nuevo = filas.find((f) => f.item_id === detalle.item_id);
    if (nuevo && nuevo !== detalle) setDetalle(nuevo);
  }, [filas, detalle]);

  const alCambiarEnVivo = useCallback(() => {
    cargar();
    cargarLineas();
  }, [cargar, cargarLineas]);
  useAgotadosTiempoReal(supabase, organizacionId, alCambiarEnVivo);

  async function reabrir(p: Pedido) {
    const { error } = await supabase.rpc('pedido_reabrir', { p_org: organizacionId, p_item: p.item_id });
    if (error) setError(error.message);
    else await cargar();
  }

  const total = filas[0]?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  if (detalle) {
    return (
      <DetalleCotizacion
        supabase={supabase}
        organizacionId={organizacionId}
        pedido={detalle}
        onVolver={() => {
          setDetalle(null);
          cargar();
        }}
        onCambio={cargar}
      />
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <SelectorLinea
          lineas={lineas}
          valor={linea}
          onCambio={(v) => {
            setLinea(v);
            setPagina(0);
          }}
        />
        <select
          value={estado}
          onChange={(e) => {
            setEstado(e.target.value);
            setPagina(0);
          }}
          aria-label="Estado"
          style={campo}
        >
          <option value="">Todos los estados</option>
          {Object.entries(ESTADOS).map(([valor, textoEstado]) => (
            <option key={valor} value={valor}>{textoEstado}</option>
          ))}
        </select>
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar por ítem, nombre o referencia"
          style={{ ...campo, minWidth: 300 }}
        />
      </div>

      {error && <p style={{ color: '#000', fontSize: 13 }}>Error: {error}</p>}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              {['Item', 'Nombre Base', 'Línea', 'Cant. sugerida', 'Estado', 'Cotizaciones', 'Mejor costo', 'Proveedor elegido', 'Acción'].map((h) => (
                <th key={h} style={{ ...celda, fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((p) => (
              <tr key={p.item_id}>
                <td style={celda}>{p.item_id}</td>
                <td style={celda}>{p.nombre_base}</td>
                <td style={celda}>{p.linea ?? ''}</td>
                <td style={celda}>
                  {p.cantidad_sugerida ?? ''}
                  {p.sedes.length > 1 && <div style={{ fontSize: 11 }}>{p.sedes.length} sedes</div>}
                </td>
                <td style={celda}>{ESTADOS[p.estado] ?? p.estado}</td>
                <td style={celda}>
                  {p.cotizaciones_esperadas > 0 ? `${p.cotizaciones_recibidas}/${p.cotizaciones_esperadas}` : '—'}
                </td>
                <td style={celda}>
                  {p.mejor_costo !== null ? (
                    <>
                      {pesos(p.mejor_costo)}
                      <div style={{ fontSize: 11 }}>{p.mejor_proveedor}</div>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td style={celda}>{p.proveedor_elegido ?? '—'}</td>
                <td style={celda}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" style={boton} onClick={() => setDetalle(p)}>
                      {['por_cotizar', 'en_cotizacion'].includes(p.estado) ? 'Cotizar' : 'Ver'}
                    </button>
                    {p.estado === 'agotado_proveedor' && (
                      <button type="button" style={boton} onClick={() => reabrir(p)}>Volver a cotizar</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!cargando && filas.length === 0 && (
              <tr>
                <td style={celda} colSpan={9}>No hay solicitudes activas</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', fontSize: 13 }}>
        <button disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>Anterior</button>
        <span>Página {pagina + 1} de {paginas} ({total} ítems)</span>
        <button disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)}>Siguiente</button>
      </div>
    </div>
  );
}
