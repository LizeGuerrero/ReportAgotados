'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import SelectorLinea from '@/components/SelectorLinea';
import { boton, campo, celda, fecha, PanelTexto } from '@/components/pedidos/comun';

interface Solicitud {
  id: string;
  numero_texto: string;
  proveedor: string | null;
  estado: 'borrador' | 'enviada' | 'cerrada';
  fecha_creacion: string;
  fecha_envio: string | null;
  items: number;
  respondidos: number;
}

interface ProveedorLista {
  id: number;
  nombre: string;
  items_pendientes: number;
  solicitudes_abiertas: number;
}

interface ItemProveedor {
  item_id: number;
  nombre_base: string;
  linea: string | null;
  referencia: string | null;
  unidades_por_caja: number | null;
  cantidad_sugerida: number | null;
  ya_en_solicitud: boolean;
}

const ESTADO_TEXTO: Record<string, string> = {
  borrador: 'Por enviar',
  enviada: 'Enviada',
  cerrada: 'Cerrada',
};

export default function Solicitudes({
  supabase,
  organizacionId,
}: {
  supabase: SupabaseClient;
  organizacionId: string;
}) {
  const [nueva, setNueva] = useState(false);
  const [filas, setFilas] = useState<Solicitud[]>([]);
  const [estado, setEstado] = useState('');
  const [error, setError] = useState('');
  const [texto, setTexto] = useState<{ id: string; titulo: string; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.rpc('listar_solicitudes', {
      p_org: organizacionId,
      p_estado: estado || null,
      p_limit: 100,
      p_offset: 0,
    });
    if (error) setError(error.message);
    else {
      setError('');
      setFilas((data ?? []) as Solicitud[]);
    }
  }, [supabase, organizacionId, estado]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function verTexto(s: Solicitud) {
    const { data, error } = await supabase.rpc('solicitud_texto', { p_org: organizacionId, p_solicitud: s.id });
    if (error) setError(error.message);
    else setTexto({ id: s.id, titulo: `Solicitud ${s.numero_texto} — ${s.proveedor ?? ''}`, texto: data as string });
  }

  async function marcarEnviada(id: string) {
    await supabase.rpc('solicitud_marcar_enviada', { p_org: organizacionId, p_solicitud: id });
    cargar();
  }

  async function cerrar(s: Solicitud) {
    if (!window.confirm(`¿Cerrar la solicitud ${s.numero_texto}? Las cotizaciones quedan en el historial.`)) return;
    const { error } = await supabase.rpc('solicitud_cerrar', { p_org: organizacionId, p_solicitud: s.id });
    if (error) setError(error.message);
    else {
      setTexto(null);
      cargar();
    }
  }

  if (nueva) {
    return (
      <NuevaSolicitud
        supabase={supabase}
        organizacionId={organizacionId}
        onTerminar={() => {
          setNueva(false);
          cargar();
        }}
      />
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <button type="button" style={{ ...boton, fontWeight: 600 }} onClick={() => setNueva(true)}>
          + Nueva solicitud de cotización
        </button>
        <select value={estado} onChange={(e) => setEstado(e.target.value)} style={campo} aria-label="Estado">
          <option value="">Todas</option>
          <option value="borrador">Por enviar</option>
          <option value="enviada">Enviadas</option>
          <option value="cerrada">Cerradas</option>
        </select>
        <button type="button" style={boton} onClick={cargar}>Actualizar</button>
      </div>

      {error && <p style={{ fontSize: 13 }}>Error: {error}</p>}

      {texto && (
        <PanelTexto
          titulo={texto.titulo}
          texto={texto.texto}
          onCopiar={() => marcarEnviada(texto.id)}
          onCerrar={() => setTexto(null)}
        />
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              {['N°', 'Proveedor', 'Estado', 'Ítems', 'Respondidos', 'Creada', 'Enviada', 'Acción'].map((h) => (
                <th key={h} style={{ ...celda, fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((s) => (
              <tr key={s.id}>
                <td style={celda}>{s.numero_texto}</td>
                <td style={celda}>{s.proveedor}</td>
                <td style={celda}>{ESTADO_TEXTO[s.estado]}</td>
                <td style={celda}>{s.items}</td>
                <td style={celda}>{s.respondidos}/{s.items}</td>
                <td style={celda}>{fecha(s.fecha_creacion)}</td>
                <td style={celda}>{fecha(s.fecha_envio)}</td>
                <td style={celda}>
                  {s.estado !== 'cerrada' && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" style={boton} onClick={() => verTexto(s)}>Ver / copiar</button>
                      <button type="button" style={boton} onClick={() => cerrar(s)}>Cerrar</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {filas.length === 0 && (
              <tr><td style={celda} colSpan={8}>No hay solicitudes</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NuevaSolicitud({
  supabase,
  organizacionId,
  onTerminar,
}: {
  supabase: SupabaseClient;
  organizacionId: string;
  onTerminar: () => void;
}) {
  const [proveedores, setProveedores] = useState<ProveedorLista[]>([]);
  const [proveedor, setProveedor] = useState('');
  const [lineas, setLineas] = useState<string[]>([]);
  const [linea, setLinea] = useState('');
  const [textoBusqueda, setTextoBusqueda] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [items, setItems] = useState<ItemProveedor[]>([]);
  const [sel, setSel] = useState<Record<number, { on: boolean; cant: string }>>({});
  const [error, setError] = useState('');
  const [creada, setCreada] = useState<{ id: string; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setBusqueda(textoBusqueda), 300);
    return () => clearTimeout(t);
  }, [textoBusqueda]);

  useEffect(() => {
    supabase.rpc('listar_proveedores_pedidos', { p_org: organizacionId }).then(({ data, error }) => {
      if (error) setError(error.message);
      else setProveedores((data ?? []) as ProveedorLista[]);
    });
    supabase.rpc('listar_lineas_pedidos', { p_org: organizacionId }).then(({ data }) => {
      const lista = (data ?? []) as (string | { linea: string })[];
      setLineas(lista.map((d) => (typeof d === 'string' ? d : d.linea)));
    });
  }, [supabase, organizacionId]);

  const cargarItems = useCallback(async () => {
    if (!proveedor) {
      setItems([]);
      return;
    }
    const { data, error } = await supabase.rpc('listar_items_proveedor', {
      p_org: organizacionId,
      p_proveedor: Number(proveedor),
      p_linea: linea || null,
      p_busqueda: busqueda || null,
    });
    if (error) setError(error.message);
    else {
      setError('');
      setItems((data ?? []) as ItemProveedor[]);
    }
  }, [supabase, organizacionId, proveedor, linea, busqueda]);

  useEffect(() => {
    cargarItems();
  }, [cargarItems]);

  const efectivo = (i: ItemProveedor) =>
    sel[i.item_id] ?? { on: false, cant: i.cantidad_sugerida?.toString() ?? '' };
  const elegibles = items.filter((i) => !i.ya_en_solicitud);
  const marcados = elegibles.filter((i) => efectivo(i).on);

  function poner(i: ItemProveedor, cambio: Partial<{ on: boolean; cant: string }>) {
    setSel((s) => ({ ...s, [i.item_id]: { ...efectivo(i), ...cambio } }));
  }

  function marcarTodos(on: boolean) {
    setSel((s) => {
      const nuevo = { ...s };
      elegibles.forEach((i) => {
        nuevo[i.item_id] = { ...(s[i.item_id] ?? { cant: i.cantidad_sugerida?.toString() ?? '' }), on };
      });
      return nuevo;
    });
  }

  async function crear() {
    setGuardando(true);
    const payload = marcados.map((i) => {
      const c = efectivo(i).cant;
      return { item_id: i.item_id, cantidad: c === '' ? null : Number(c) };
    });
    const { data, error } = await supabase.rpc('solicitud_crear', {
      p_org: organizacionId,
      p_proveedor: Number(proveedor),
      p_items: payload,
    });
    if (error) {
      setError(error.message);
      setGuardando(false);
      return;
    }
    const id = data as string;
    const t = await supabase.rpc('solicitud_texto', { p_org: organizacionId, p_solicitud: id });
    if (t.error) setError(t.error.message);
    else setCreada({ id, texto: t.data as string });
    setGuardando(false);
  }

  if (creada) {
    return (
      <div>
        <p style={{ fontSize: 14 }}>Solicitud creada. Copia el texto y envíalo al proveedor (WhatsApp, correo…).</p>
        <PanelTexto
          titulo="Texto de la solicitud (sin costos)"
          texto={creada.texto}
          onCopiar={async () => {
            await supabase.rpc('solicitud_marcar_enviada', { p_org: organizacionId, p_solicitud: creada.id });
          }}
          onCerrar={() => {}}
        />
        <button type="button" style={boton} onClick={onTerminar}>Terminar</button>
      </div>
    );
  }

  return (
    <div>
      <button type="button" style={boton} onClick={onTerminar}>← Volver a solicitudes</button>
      <h2 style={{ fontSize: 17, margin: '12px 0' }}>Nueva solicitud de cotización</h2>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <select
          value={proveedor}
          onChange={(e) => {
            setProveedor(e.target.value);
            setSel({});
          }}
          style={{ ...campo, minWidth: 280 }}
          aria-label="Proveedor"
        >
          <option value="">Elige un proveedor…</option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre} ({p.items_pendientes} ítems pendientes)
            </option>
          ))}
        </select>
        <SelectorLinea lineas={lineas} valor={linea} onCambio={setLinea} />
        <input
          value={textoBusqueda}
          onChange={(e) => setTextoBusqueda(e.target.value)}
          placeholder="Buscar por ítem, nombre o referencia"
          style={{ ...campo, minWidth: 280 }}
        />
      </div>

      {error && <p style={{ fontSize: 13 }}>Error: {error}</p>}

      {!proveedor && <p style={{ fontSize: 13 }}>Elige un proveedor para ver los ítems pendientes que puede suministrar.</p>}

      {proveedor && (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ ...celda, fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      aria-label="Marcar todos"
                      checked={elegibles.length > 0 && marcados.length === elegibles.length}
                      onChange={(e) => marcarTodos(e.target.checked)}
                    />
                  </th>
                  {['Item', 'Nombre Base', 'Línea', 'Referencia', 'Und/caja', 'Cant. sugerida', 'Cant. a cotizar'].map((h) => (
                    <th key={h} style={{ ...celda, fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const e = efectivo(i);
                  return (
                    <tr key={i.item_id} style={{ opacity: i.ya_en_solicitud ? 0.5 : 1 }}>
                      <td style={celda}>
                        <input
                          type="checkbox"
                          disabled={i.ya_en_solicitud}
                          checked={e.on}
                          onChange={(ev) => poner(i, { on: ev.target.checked })}
                          aria-label={`Incluir ítem ${i.item_id}`}
                        />
                      </td>
                      <td style={celda}>{i.item_id}</td>
                      <td style={celda}>
                        {i.nombre_base}
                        {i.ya_en_solicitud && <div style={{ fontSize: 11 }}>Ya está en una solicitud abierta con este proveedor</div>}
                      </td>
                      <td style={celda}>{i.linea ?? ''}</td>
                      <td style={celda}>{i.referencia ?? ''}</td>
                      <td style={celda}>{i.unidades_por_caja ?? ''}</td>
                      <td style={celda}>{i.cantidad_sugerida ?? ''}</td>
                      <td style={celda}>
                        <input
                          value={e.cant}
                          inputMode="numeric"
                          disabled={i.ya_en_solicitud}
                          onChange={(ev) => poner(i, { cant: ev.target.value.replace(/\D/g, '') })}
                          style={{ width: 70, border: '1px solid #000', padding: 2 }}
                          aria-label={`Cantidad a cotizar ítem ${i.item_id}`}
                        />
                      </td>
                    </tr>
                  );
                })}
                {items.length === 0 && (
                  <tr><td style={celda} colSpan={8}>Este proveedor no tiene ítems pendientes con esos filtros</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              style={{ ...boton, fontWeight: 600 }}
              disabled={marcados.length === 0 || guardando}
              onClick={crear}
            >
              Crear solicitud ({marcados.length} ítems)
            </button>
            <span style={{ fontSize: 12 }}>
              Un mismo ítem puede ir en solicitudes a varios proveedores. Los costos se registran después en el detalle del ítem.
            </span>
          </div>
        </>
      )}
    </div>
  );
}
