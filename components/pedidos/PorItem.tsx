'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import Combobox from '@/components/Combobox';
import { useTiempoReal } from '@/components/useTiempoReal';
import {
  idVisible, pesos, TABLAS_PEDIDOS, textoUltimaOrden, type ProveedorLista,
} from '@/components/pedidos/comun';
import type { SolicitudCreada } from '@/components/pedidos/ResultadoSolicitudes';

const POR_PAGINA = 50;

interface ProveedorDeItem {
  proveedor_id: number;
  proveedor: string;
  documento: string;
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
  codigo: string | null;
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
  preIds,
  onCreadas,
}: {
  supabase: SupabaseClient;
  organizacionId: string;
  linea: string;
  busqueda: string;
  proveedores: ProveedorLista[];
  /** Ítems que llegan marcados desde Solicitudes (o recién creados): se muestran primero y quedan marcados. */
  preIds: number[];
  /** Se llama al crear las solicitudes; Cotizar muestra los mensajes. */
  onCreadas: (creadas: SolicitudCreada[], omitidos: number) => void;
}) {
  const [items, setItems] = useState<ItemCatalogo[]>([]);
  const [pagina, setPagina] = useState(0);
  const [sel, setSel] = useState<Record<number, Seleccion>>({});
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const peticion = useRef(0);
  const yaMarcados = useRef<Set<number>>(new Set());
  const hayFiltro = linea !== '' || busqueda.trim() !== '';
  // Con ítems preseleccionados y sin filtro, la lista es esa selección; con filtro se busca en todo el catálogo
  const soloPre = preIds.length > 0 && !hayFiltro;

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
      p_items: soloPre ? preIds : null,
    });
    if (n !== peticion.current) return;
    if (error) setError(error.message);
    else {
      setError('');
      setItems((data ?? []) as ItemCatalogo[]);
    }
  }, [supabase, organizacionId, linea, busqueda, pagina, soloPre, preIds]);

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

  // Los ítems que llegan de Solicitudes (o recién creados) quedan marcados, una sola vez por ítem
  useEffect(() => {
    items.forEach((i) => {
      if (preIds.includes(i.item_id) && !yaMarcados.current.has(i.item_id)) {
        yaMarcados.current.add(i.item_id);
        cambiar(i, { on: true });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, preIds]);

  function marcarPagina(on: boolean) {
    items.forEach((i) => {
      if (elegidos(i).length > 0 || !on) cambiar(i, { on });
    });
  }

  // Asigna un proveedor a todos los ítems marcados (aunque algunos no estén en esta página)
  function agregarATodos(valor: string) {
    if (!valor) return;
    const id = Number(valor);
    setSel((todo) => {
      const nuevo = { ...todo };
      Object.entries(todo).forEach(([k, s]) => {
        if (!s.on) return;
        nuevo[Number(k)] = {
          ...s,
          extra: s.extra.includes(id) ? s.extra : [...s.extra, id],
          provs: Array.from(new Set([...(s.provs ?? []), id])),
        };
      });
      return nuevo;
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
    const creadas = (data?.creadas ?? []) as SolicitudCreada[];
    const omitidos = (data?.omitidos ?? []) as unknown[];
    setSel({});
    yaMarcados.current = new Set();
    setGuardando(false);
    onCreadas(creadas, omitidos.length);
  }

  return (
    <div>
      <p className="mod-text mod-mt-0 mod-mb-2">
        {soloPre
          ? 'Estos son los ítems que marcaste en Solicitudes. Escribe una búsqueda o elige una línea para sumar otros del catálogo.'
          : hayFiltro
            ? 'Ítems que coinciden con el filtro; los que tienen agotado reportado salen primero.'
            : 'Elige una línea o escribe una búsqueda para ver ítems. Mientras tanto, estos son los ítems con agotado reportado.'}{' '}
        Marca los ítems y los proveedores a los que les vas a pedir cotización.
      </p>

      {error && <p className="mod-text">Error: {error}</p>}

      <div className="mod-scroll">
        <table className="mod-table">
          <thead>
            <tr>
              <th className="mod-check">
                <input
                  type="checkbox"
                  aria-label="Marcar todos los de esta página"
                  checked={items.length > 0 && items.every((i) => actual(i).on)}
                  onChange={(e) => marcarPagina(e.target.checked)}
                />
              </th>
              {['Item', 'Nombre Base', 'Línea', 'Agotado en', 'Cant. sugerida', 'Última orden', 'Cant. a cotizar', 'Proveedores a consultar'].map((h) => (
                <th key={h}>{h}</th>
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
                .map((p) => ({ valor: String(p.id), texto: p.nombre, detalle: p.documento }));
              return (
                <tr key={i.item_id} >
                  <td>
                    <input
                      type="checkbox"
                      checked={s.on}
                      onChange={(e) => cambiar(i, { on: e.target.checked })}
                      aria-label={`Incluir ítem ${i.item_id}`}
                    />
                  </td>
                  <td>{idVisible(i.item_id, i.provisional, i.codigo)}</td>
                  <td>
                    {i.nombre_base}
                    {i.provisional && <div className="mod-sub">Ítem provisional (aún sin ID del ERP)</div>}
                    {i.en_gestion && <div className="mod-sub">Ya está en cotización con algún proveedor</div>}
                  </td>
                  <td>{i.linea ?? ''}</td>
                  <td>{i.agotado_sedes?.join(', ') ?? ''}</td>
                  <td>{i.cantidad_sugerida ?? ''}</td>
                  <td>
                    {textoUltimaOrden(i.ultima_orden_numero, i.ultima_orden_fecha, i.ultima_orden_cantidad)}
                  </td>
                  <td>
                    <input
                      value={s.cant}
                      inputMode="numeric"
                      onChange={(e) => cambiar(i, { cant: e.target.value.replace(/\D/g, '') })}
                      className={falta ? 'ui-input ui-input--sm mod-cell-input is-missing' : 'ui-input ui-input--sm mod-cell-input'} style={{ width: 70 }}
                      aria-label={`Cantidad a cotizar ítem ${i.item_id}`}
                    />
                    {falta && <div className="mod-sub">Obligatoria</div>}
                  </td>
                  <td>
                    {i.proveedores.length === 0 && extras.length === 0 && (
                      <div className="mod-sub">Sin proveedor vinculado: agrega uno</div>
                    )}
                    {i.proveedores.map((p) => (
                      <label key={p.proveedor_id} className="mod-block mod-text">
                        <input
                          type="checkbox"
                          disabled={p.ya_en_solicitud}
                          checked={!p.ya_en_solicitud && elegidosAhora.includes(p.proveedor_id)}
                          onChange={(e) => alternarProveedor(i, p.proveedor_id, e.target.checked)}
                        />{' '}
                        {p.proveedor}
                        <span className="mod-sub">
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
                      <label key={id} className="mod-block mod-text">
                        <input
                          type="checkbox"
                          checked={elegidosAhora.includes(id)}
                          onChange={(e) => alternarProveedor(i, id, e.target.checked)}
                        />{' '}
                        {nombreProv(id)}
                        <span className="mod-sub"> · se vinculará al ítem</span>
                      </label>
                    ))}
                    <div className="mod-mt-1">
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
                <td colSpan={9}>
                  {hayFiltro ? 'Ningún ítem coincide con el filtro' : 'No hay ítems con agotado reportado pendientes'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mod-pager">
        <button type="button" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>Anterior</button>
        <span>Página {pagina + 1} de {paginas} ({total} ítems)</span>
        <button type="button" disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)}>Siguiente</button>
      </div>

      <div className="mod-mt-3 mod-flex mod-gap-2 mod-center mod-wrap">
        <button
          type="button"
          className="ui-btn ui-btn--sm mod-semibold"
          disabled={marcados.length === 0 || guardando || sinCantidad.length > 0 || sinProveedor.length > 0}
          onClick={crear}
        >
          Crear solicitudes ({marcados.length} ítems → {nSolicitudes} proveedores)
        </button>
        {marcados.length > 0 && (
          <>
            <Combobox
              opciones={proveedores.map((p) => ({ valor: String(p.id), texto: p.nombre, detalle: p.documento }))}
              valor=""
              onCambio={agregarATodos}
              etiqueta="Agregar un proveedor a todos los marcados"
              placeholder="+ Proveedor para todos los marcados…"
              ancho={280}
            />
            <button type="button" className="ui-btn ui-btn--sm" onClick={() => setSel({})}>Limpiar selección</button>
          </>
        )}
        {sinCantidad.length > 0 && (
          <span className="mod-sub">Falta la cantidad en {sinCantidad.length} ítem(s) sin agotado reportado.</span>
        )}
        {sinProveedor.length > 0 && (
          <span className="mod-sub">Hay {sinProveedor.length} ítem(s) marcados sin proveedor elegido.</span>
        )}
      </div>
    </div>
  );
}
