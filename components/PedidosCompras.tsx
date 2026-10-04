'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import Combobox from '@/components/Combobox';
import { useTiempoReal } from '@/components/useTiempoReal';
import SelectorLinea from '@/components/SelectorLinea';
import DetalleCotizacion from '@/components/pedidos/DetalleCotizacion';
import Solicitudes from '@/components/pedidos/Solicitudes';
import OrdenesCompra from '@/components/pedidos/OrdenesCompra';
import PorProveedor from '@/components/pedidos/PorProveedor';
import Comparativo from '@/components/pedidos/Comparativo';
import ItemsProvisionales from '@/components/pedidos/ItemsProvisionales';
import {
  boton, campo, celda, ESTADOS, idVisible, pesos, TABLAS_PEDIDOS, textoUltimaOrden, type Pedido,
} from '@/components/pedidos/comun';

type Pestana = 'pedidos' | 'proveedor' | 'comparativo' | 'solicitudes' | 'ordenes' | 'provisionales';

const PESTANAS: { valor: Pestana; texto: string }[] = [
  { valor: 'pedidos', texto: 'Pedidos' },
  { valor: 'proveedor', texto: 'Por proveedor' },
  { valor: 'comparativo', texto: 'Comparativo' },
  { valor: 'solicitudes', texto: 'Solicitudes de cotización' },
  { valor: 'ordenes', texto: 'Órdenes de compra' },
  { valor: 'provisionales', texto: 'Ítems provisionales' },
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
      {pestana === 'proveedor' && <PorProveedor supabase={supabase} organizacionId={organizacionId} />}
      {pestana === 'comparativo' && <Comparativo supabase={supabase} organizacionId={organizacionId} />}
      {pestana === 'solicitudes' && <Solicitudes supabase={supabase} organizacionId={organizacionId} />}
      {pestana === 'ordenes' && <OrdenesCompra supabase={supabase} organizacionId={organizacionId} />}
      {pestana === 'provisionales' && <ItemsProvisionales supabase={supabase} organizacionId={organizacionId} />}
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
  const [aviso, setAviso] = useState('');

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

  // El detalle abierto se mantiene al día cuando la lista se recarga. Si el ítem ya no está en la
  // página actual (cambió de estado y de posición, o lo gestionó otra persona) se consulta solo a él:
  // así el detalle no queda con información vieja y, si ya no está pendiente, se avisa.
  useEffect(() => {
    if (!detalle) return;
    const enPagina = filas.find((f) => f.item_id === detalle.item_id);
    if (enPagina) {
      if (enPagina !== detalle) setDetalle(enPagina);
      return;
    }
    let vigente = true;
    supabase
      .rpc('listar_pedidos', {
        p_org: organizacionId,
        p_busqueda: String(detalle.item_id),
        p_limit: 20,
        p_offset: 0,
      })
      .then(({ data, error }) => {
        if (!vigente || error) return;
        const f = ((data ?? []) as Pedido[]).find((x) => x.item_id === detalle.item_id);
        if (!f) {
          setAviso(`El ítem ${idVisible(detalle.item_id, detalle.provisional, detalle.codigo)} — ${detalle.nombre_base} ya no está pendiente de gestión.`);
          setDetalle(null);
        } else if (JSON.stringify({ ...f, total: 0 }) !== JSON.stringify({ ...detalle, total: 0 })) {
          setDetalle(f);
        }
      });
    return () => {
      vigente = false;
    };
  }, [filas, detalle, supabase, organizacionId]);

  const alCambiarEnVivo = useCallback(() => {
    cargar();
    cargarLineas();
  }, [cargar, cargarLineas]);
  // Agotados, solicitudes, cotizaciones y órdenes: cualquier cambio refresca la lista de trabajo
  useTiempoReal(supabase, organizacionId, TABLAS_PEDIDOS, alCambiarEnVivo);

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
        <Combobox
          opciones={Object.entries(ESTADOS).map(([valor, textoEstado]) => ({ valor, texto: textoEstado }))}
          valor={estado}
          onCambio={(v) => {
            setEstado(v);
            setPagina(0);
          }}
          etiqueta="Estado"
          vacio="Todos los estados"
          ancho={240}
        />
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar por ítem, nombre o referencia"
          style={{ ...campo, minWidth: 300 }}
        />
      </div>

      {error && <p style={{ color: '#000', fontSize: 13 }}>Error: {error}</p>}
      {aviso && (
        <p style={{ fontSize: 13 }}>
          {aviso}{' '}
          <button type="button" style={boton} onClick={() => setAviso('')}>Entendido</button>
        </p>
      )}

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
                <td style={celda}>{idVisible(p.item_id, p.provisional, p.codigo)}</td>
                <td style={celda}>
                  {p.nombre_base}
                  {p.origen === 'manual' && (
                    <div style={{ fontSize: 11 }}>
                      Iniciado por Compras (sin agotado){p.provisional ? ' · ítem provisional' : ''}
                    </div>
                  )}
                  {p.ultima_orden_numero && (
                    <div style={{ fontSize: 11 }}>
                      Última orden: {textoUltimaOrden(p.ultima_orden_numero, p.ultima_orden_fecha, p.ultima_orden_cantidad)}
                    </div>
                  )}
                </td>
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
                <td style={celda} colSpan={9}>No hay ítems en gestión</td>
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
