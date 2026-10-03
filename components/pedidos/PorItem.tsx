'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import Combobox from '@/components/Combobox';
import { useTiempoReal } from '@/components/useTiempoReal';
import {
  boton, celda, idVisible, PanelTexto, pesos, TABLAS_PEDIDOS, textoUltimaOrden,
  type ProveedorLista,
} from '@/components/pedidos/comun';

const POR_PAGINA = 50;

interface ProveedorDeItem {
  proveedor_id: number;
  proveedor: string;
  codigo: string | null;
  precio_erp: number | null;
  dias: number | null;
  preferido: boolean;
  unidades_por_caja: number | null;
  /** Ya hay una solicitud abierta de este ítem con este proveedor: no se puede repetir. */
  ya_en_solicitud: boolean;
}

interface ItemCatalogo {
  item_id: number;
  nombre_base: string;
  linea: string | null;
  unidad_medida: string | null;
  provisional: boolean;
  cantidad_sugerida: number | null;
  agotado_sedes: string[] | null;
  en_gestion: boolean;
  proveedores: ProveedorDeItem[];
  ultima_orden_numero: string | null;
  ultima_orden_fecha: string | null;
  ultima_orden_cantidad: number | null;
  total: number;
}

/**
 * Lo que se recuerda de cada ítem tocado. Guarda también el nombre y si tiene agotado para poder
 * validar y crear aunque el ítem ya no esté en la página que se está viendo.
 */
interface Seleccion {
  on: boolean;
  cant: string;
  nombre: string;
  agotado: boolean;
  /** Proveedores elegidos (null = todavía no se ha tocado: se usan todos los disponibles). */
  provs: number[] | null;
  /** Proveedores que Compras agregó a mano y que el ítem aún no tenía vinculados. */
  extra: number[];
}

interface Resultado {
  solicitudes: { id: string; proveedor: string; items: number; texto: string }[];
  omitidos: number;
}

/**
 * Vista "por ítem": no hay proveedor elegido, así que Compras parte del ítem. Ve a todos los
 * proveedores que lo suministran, marca a cuáles les va a pedir cotización y el sistema crea una
 * solicitud por proveedor. Después compara las respuestas en la pestaña "Comparativo".
 */
export default function PorItem({
  supabase,
  organizacionId,
  linea,
  busqueda,
  proveedores,
}: {
  supabase: SupabaseClient;
  organizacionId: string;
  linea: string;
  busqueda: string;
  proveedores: ProveedorLista[];
}) {
  const [items, setItems] = useState<ItemCatalogo[]>([]);
  const [pagina, setPagina] = useState(0);
  const [sel, setSel] = useState<Record<number, Seleccion>>({});
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const peticion = useRef(0);

  // Al cambiar de línea o de búsqueda se vuelve a la primera página (la selección se conserva)
  useEffect(() => {
    setPagina(0);
  }, [linea, busqueda]);

  const cargar = useCallback(async () => {
    const n = ++peticion.current;
    const { data, error } = await supabase.rpc('listar_items_catalogo', {
      p_org: organizacionId,
      p_linea: linea || null,
      p_busqueda: busqueda || null,
      p_limit: POR_PAGINA,
      p_offset: pagina * POR_PAGINA,
    });
    if (n !== peticion.current) return;
    if (error) setError(error.message);
    else {
      setError('');
      setItems((data ?? []) as ItemCatalogo[]);
    }
  }, [supabase, organizacionId, linea, busqueda, pagina]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Un agotado nuevo, o una solicitud de otra persona, actualiza las marcas sin recargar la página
  useTiempoReal(supabase, organizacionId, TABLAS_PEDIDOS, cargar);

  const total = items[0]?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  const tieneAgotado = (i: ItemCatalogo) => (i.agotado_sedes?.length ?? 0) > 0;
  const disponibles = (i: ItemCatalogo) => i.proveedores.filter((p) => !p.ya_en_solicitud).map((p) => p.proveedor_id);
  const nombreProv = (id: number) => proveedores.find((p) => p.id === id)?.nombre ?? String(id);

  const actual = (i: ItemCatalogo): Seleccion =>
    sel[i.item_id] ?? {
      on: false,
      cant: i.cantidad_sugerida?.toString() ?? '',
      nombre: i.nombre_base,
      agotado: tieneAgotado(i),
      provs: null,
      extra: [],
    };
  const elegidos = (i: ItemCatalogo): number[] => {
    const s = actual(i);
    return s.provs ?? [...disponibles(i), ...s.extra];
  };

  function cambiar(i: ItemCatalogo, cambio: Partial<Seleccion>) {
    setSel((todo) => {
      const base = todo[i.item_id] ?? actual(i);
      const nuevo = { ...base, ...cambio, agotado: tieneAgotado(i), nombre: i.nombre_base };
      // Al marcar, se fija la lista de proveedores (así vale aunque el ítem salga de la página)
      if (nuevo.on && nuevo.provs === null) nuevo.provs = [...disponibles(i), ...nuevo.extra];
      return { ...todo, [i.item_id]: nuevo };
    });
  }

  function alternarProveedor(i: ItemCatalogo, id: number, on: boolean) {
    const ahora = elegidos(i);
    cambiar(i, { provs: on ? Array.from(new Set([...ahora, id])) : ahora.filter((x) => x !== id) });
  }

  function agregarProveedor(i: ItemCatalogo, valor: string) {
    if (!valor) return;
    const id = Number(valor);
    const s = actual(i);
    cambiar(i, { extra: Array.from(new Set([...s.extra, id])), provs: Array.from(new Set([...elegidos(i), id])) });
  }

  const marcados = Object.entries(sel).filter(([, s]) => s.on);
  const sinCantidad = marcados.filter(([, s]) => !s.agotado && !(Number(s.cant) > 0));
  const sinProveedor = marcados.filter(([id]) => {
    const s = sel[Number(id)];
    return (s.provs ?? []).length === 0;
  });
  const nSolicitudes = new Set(marcados.flatMap(([, s]) => s.provs ?? [])).size;

  async function crear() {
    if (sinCantidad.length > 0) {
      setError(`Digita la cantidad de: ${sinCantidad.map(([, s]) => s.nombre).join(', ')}`);
      return;
    }
    if (sinProveedor.length > 0) {
      setError(`Elige al menos un proveedor para: ${sinProveedor.map(([, s]) => s.nombre).join(', ')}`);
      return;
    }
    setGuardando(true);
    setError('');
    const payload = marcados.map(([id, s]) => ({
      item_id: Number(id),
      cantidad: s.cant === '' ? null : Number(s.cant),
      proveedores: s.provs ?? [],
    }));
    const { data, error } = await supabase.rpc('solicitudes_crear_multi', {
      p_org: organizacionId,
      p_items: payload,
    });
    if (error) {
      setError(error.message);
      setGuardando(false);
      return;
    }
    const creadas = (data?.creadas ?? []) as { solicitud_id: string; proveedor_id: number; items: number }[];
    const omitidos = (data?.omitidos ?? []) as unknown[];
    const solicitudes: Resultado['solicitudes'] = [];
    for (const c of creadas) {
      const t = await supabase.rpc('solicitud_texto', { p_org: organizacionId, p_solicitud: c.solicitud_id });
      solicitudes.push({
        id: c.solicitud_id,
        proveedor: nombreProv(c.proveedor_id),
        items: c.items,
        texto: t.error ? `Error al generar el texto: ${t.error.message}` : (t.data as string),
      });
    }
    setResultado({ solicitudes, omitidos: omitidos.length });
    setSel({});
    setGuardando(false);
  }

  if (resultado) {
    return (
      <div>
        <p style={{ fontSize: 14 }}>
          {resultado.solicitudes.length === 0
            ? 'No se creó ninguna solicitud.'
            : `Se crearon ${resultado.solicitudes.length} solicitud(es), una por proveedor. Copia cada texto y envíalo.`}
        </p>
        {resultado.omitidos > 0 && (
          <p style={{ fontSize: 13 }}>
            {resultado.omitidos} combinación(es) ítem-proveedor se omitieron porque ya estaban en una solicitud abierta.
          </p>
        )}
        {resultado.solicitudes.map((s) => (
          <PanelTexto
            key={s.id}
            titulo={`${s.proveedor} — ${s.items} ítem(s) (sin costos)`}
            texto={s.texto}
            onCopiar={async () => {
              await supabase.rpc('solicitud_marcar_enviada', { p_org: organizacionId, p_solicitud: s.id });
            }}
            onCerrar={() => {}}
          />
        ))}
        <p style={{ fontSize: 13 }}>
          Cuando los proveedores respondan, registra los precios y compáralos en la pestaña “Comparativo”.
        </p>
        <button type="button" style={boton} onClick={() => setResultado(null)}>Terminar</button>
      </div>
    );
  }

  const hayFiltro = linea !== '' || busqueda.trim() !== '';

  return (
    <div>
      <p style={{ fontSize: 13, margin: '0 0 8px' }}>
        {hayFiltro
          ? 'Ítems que coinciden con el filtro; los que tienen agotado reportado salen primero.'
          : 'Elige una línea o escribe una búsqueda para ver ítems. Mientras tanto, estos son los ítems con agotado reportado.'}{' '}
        Marca los ítems y los proveedores a los que les vas a pedir cotización.
      </p>

      {error && <p style={{ fontSize: 13 }}>Error: {error}</p>}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ ...celda, fontWeight: 600 }}> </th>
              {['Item', 'Nombre Base', 'Línea', 'Agotado en', 'Cant. sugerida', 'Última orden', 'Cant. a cotizar', 'Proveedores a consultar'].map((h) => (
                <th key={h} style={{ ...celda, fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const s = actual(i);
              const falta = s.on && !s.agotado && !(Number(s.cant) > 0);
              const elegidosAhora = elegidos(i);
              const extras = s.extra.filter((id) => !i.proveedores.some((p) => p.proveedor_id === id));
              const candidatos = proveedores
                .filter((p) => !i.proveedores.some((x) => x.proveedor_id === p.id) && !s.extra.includes(p.id))
                .map((p) => ({ valor: String(p.id), texto: p.nombre, detalle: `NIT ${p.id}` }));
              return (
                <tr key={i.item_id} style={{ verticalAlign: 'top' }}>
                  <td style={celda}>
                    <input
                      type="checkbox"
                      checked={s.on}
                      onChange={(e) => cambiar(i, { on: e.target.checked })}
                      aria-label={`Incluir ítem ${i.item_id}`}
                    />
                  </td>
                  <td style={celda}>{idVisible(i.item_id, i.provisional)}</td>
                  <td style={celda}>
                    {i.nombre_base}
                    {i.provisional && <div style={{ fontSize: 11 }}>Ítem provisional (aún sin ID del ERP)</div>}
                    {i.en_gestion && <div style={{ fontSize: 11 }}>Ya está en cotización con algún proveedor</div>}
                  </td>
                  <td style={celda}>{i.linea ?? ''}</td>
                  <td style={celda}>{i.agotado_sedes?.join(', ') ?? ''}</td>
                  <td style={celda}>{i.cantidad_sugerida ?? ''}</td>
                  <td style={celda}>
                    {textoUltimaOrden(i.ultima_orden_numero, i.ultima_orden_fecha, i.ultima_orden_cantidad)}
                  </td>
                  <td style={celda}>
                    <input
                      value={s.cant}
                      inputMode="numeric"
                      onChange={(e) => cambiar(i, { cant: e.target.value.replace(/\D/g, '') })}
                      style={{ width: 70, border: falta ? '2px solid #000' : '1px solid #000', padding: 2 }}
                      aria-label={`Cantidad a cotizar ítem ${i.item_id}`}
                    />
                    {falta && <div style={{ fontSize: 11 }}>Obligatoria</div>}
                  </td>
                  <td style={celda}>
                    {i.proveedores.length === 0 && extras.length === 0 && (
                      <div style={{ fontSize: 11 }}>Sin proveedor vinculado: agrega uno</div>
                    )}
                    {i.proveedores.map((p) => (
                      <label key={p.proveedor_id} style={{ display: 'block', fontSize: 13 }}>
                        <input
                          type="checkbox"
                          disabled={p.ya_en_solicitud}
                          checked={!p.ya_en_solicitud && elegidosAhora.includes(p.proveedor_id)}
                          onChange={(e) => alternarProveedor(i, p.proveedor_id, e.target.checked)}
                        />{' '}
                        {p.proveedor}
                        <span style={{ fontSize: 11 }}>
                          {[
                            p.codigo ? `ref ${p.codigo}` : '',
                            p.precio_erp !== null ? `ERP ${pesos(p.precio_erp)}` : '',
                            p.dias !== null ? `${p.dias} d` : '',
                            p.ya_en_solicitud ? 'ya consultado' : '',
                          ].filter(Boolean).map((t) => ` · ${t}`).join('')}
                        </span>
                      </label>
                    ))}
                    {extras.map((id) => (
                      <label key={id} style={{ display: 'block', fontSize: 13 }}>
                        <input
                          type="checkbox"
                          checked={elegidosAhora.includes(id)}
                          onChange={(e) => alternarProveedor(i, id, e.target.checked)}
                        />{' '}
                        {nombreProv(id)}
                        <span style={{ fontSize: 11 }}> · se vinculará al ítem</span>
                      </label>
                    ))}
                    <div style={{ marginTop: 4 }}>
                      <Combobox
                        opciones={candidatos}
                        valor=""
                        onCambio={(v) => agregarProveedor(i, v)}
                        etiqueta={`Agregar proveedor al ítem ${i.item_id}`}
                        placeholder="+ Agregar proveedor…"
                        ancho={240}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td style={celda} colSpan={9}>
                  {hayFiltro ? 'Ningún ítem coincide con el filtro' : 'No hay ítems con agotado reportado pendientes'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', fontSize: 13 }}>
        <button type="button" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>Anterior</button>
        <span>Página {pagina + 1} de {paginas} ({total} ítems)</span>
        <button type="button" disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)}>Siguiente</button>
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          style={{ ...boton, fontWeight: 600 }}
          disabled={marcados.length === 0 || guardando || sinCantidad.length > 0 || sinProveedor.length > 0}
          onClick={crear}
        >
          Crear solicitudes ({marcados.length} ítems → {nSolicitudes} proveedores)
        </button>
        {marcados.length > 0 && (
          <button type="button" style={boton} onClick={() => setSel({})}>Limpiar selección</button>
        )}
        {sinCantidad.length > 0 && (
          <span style={{ fontSize: 12 }}>Falta la cantidad en {sinCantidad.length} ítem(s) sin agotado reportado.</span>
        )}
        {sinProveedor.length > 0 && (
          <span style={{ fontSize: 12 }}>Hay {sinProveedor.length} ítem(s) marcados sin proveedor elegido.</span>
        )}
      </div>
    </div>
  );
}
