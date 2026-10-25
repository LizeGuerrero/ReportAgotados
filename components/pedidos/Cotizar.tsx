'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import Combobox from '@/components/Combobox';
import SelectorLinea from '@/components/SelectorLinea';
import { useTiempoReal } from '@/components/useTiempoReal';
import FormProveedorNuevo from '@/components/proveedores/FormProveedorNuevo';
import PorItem from '@/components/pedidos/PorItem';
import NuevoItem from '@/components/pedidos/NuevoItem';
import ResultadoSolicitudes, { type SolicitudCreada } from '@/components/pedidos/ResultadoSolicitudes';
import type { PermisosPedidos } from '@/components/pedidos/usePermisosPedidos';
import {
  idVisible, pesos, TABLAS_PEDIDOS, textoUltimaOrden, type ProveedorLista,
} from '@/components/pedidos/comun';

interface ItemProveedor {
  item_id: number;
  codigo: string | null;
  nombre_base: string;
  linea: string | null;
  referencia: string | null;
  unidades_por_caja: number | null;
  /** Suma de lo sugerido por las sedes (solo si hay agotado pendiente). */
  cantidad_sugerida: number | null;
  ya_en_solicitud: boolean;
  /** false = viene del catálogo completo o de la selección y aún no está ligado a este proveedor. */
  vinculado: boolean;
  provisional: boolean;
  precio_erp: number | null;
  dias_entrega: number | null;
  /** Sedes con agotado pendiente de este ítem; null si ninguna lo reportó. */
  agotado_sedes: string[] | null;
  ultima_orden_numero: string | null;
  ultima_orden_fecha: string | null;
  ultima_orden_cantidad: number | null;
}

interface Seleccion {
  on: boolean;
  cant: string;
}

type Modo = 'item' | 'proveedor';

/**
 * Paso 2 — Cotizar. Compras decide cómo trabajar sobre la misma lista de ítems:
 *  - Por ítem: parte de los ítems (los que marcó en Solicitudes, o los que busque) y elige a qué
 *    proveedores les pide cotización; se crea una solicitud por proveedor.
 *  - Por proveedor: parte del proveedor y ve TODO lo que suministra (no solo lo reportado como agotado),
 *    además de los ítems que llegaron de Solicitudes. Así puede sumar productos que nadie reportó.
 * Desde aquí también se crea un proveedor o un ítem nuevo sin salir de Pedidos.
 */
export default function Cotizar({
  supabase,
  organizacionId,
  permisos,
  preseleccion,
  onIrAComparativo,
}: {
  supabase: SupabaseClient;
  organizacionId: string;
  permisos: PermisosPedidos;
  /** Ítems marcados en Solicitudes. */
  preseleccion: number[];
  onIrAComparativo: () => void;
}) {
  const [modo, setModo] = useState<Modo>('item');
  const [proveedores, setProveedores] = useState<ProveedorLista[]>([]);
  const [proveedor, setProveedor] = useState('');
  const [lineas, setLineas] = useState<string[]>([]);
  const [linea, setLinea] = useState('');
  const [textoBusqueda, setTextoBusqueda] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [catalogo, setCatalogo] = useState(false);
  const [items, setItems] = useState<ItemProveedor[]>([]);
  const [sel, setSel] = useState<Record<number, Seleccion>>({});
  const [preIds, setPreIds] = useState<number[]>(preseleccion);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [panel, setPanel] = useState<'' | 'proveedor' | 'item'>('');
  const [resultado, setResultado] = useState<{ creadas: SolicitudCreada[]; omitidos: number } | null>(null);
  // Para ignorar respuestas viejas si el usuario escribe más rápido de lo que responde el servidor
  const peticion = useRef(0);
  const yaMarcados = useRef<Set<number>>(new Set());

  // Una nueva selección desde Solicitudes reemplaza a la anterior
  useEffect(() => {
    setPreIds(preseleccion);
    yaMarcados.current = new Set();
    setResultado(null);
  }, [preseleccion]);

  useEffect(() => {
    const t = setTimeout(() => setBusqueda(textoBusqueda), 300);
    return () => clearTimeout(t);
  }, [textoBusqueda]);

  const cargarProveedores = useCallback(async () => {
    const { data, error } = await supabase.rpc('listar_proveedores_pedidos', { p_org: organizacionId });
    if (error) setError(error.message);
    else setProveedores((data ?? []) as ProveedorLista[]);
  }, [supabase, organizacionId]);

  const cargarLineas = useCallback(async () => {
    const { data } = await supabase.rpc('listar_lineas_catalogo', { p_org: organizacionId });
    // Con una sola columna, PostgREST devuelve texto plano en vez de objetos; se aceptan ambos formatos
    const lista = (data ?? []) as (string | { linea: string })[];
    setLineas(lista.map((d) => (typeof d === 'string' ? d : d.linea)));
  }, [supabase, organizacionId]);

  useEffect(() => {
    cargarProveedores();
    cargarLineas();
  }, [cargarProveedores, cargarLineas]);

  const cargarItems = useCallback(async () => {
    const n = ++peticion.current;
    // En modo catálogo el servidor exige un texto de búsqueda (son miles de ítems)
    if (modo !== 'proveedor' || !proveedor || (catalogo && !busqueda.trim())) {
      setItems([]);
      return;
    }
    const { data, error } = await supabase.rpc('listar_items_proveedor', {
      p_org: organizacionId,
      p_proveedor: Number(proveedor),
      p_linea: linea || null,
      p_busqueda: busqueda || null,
      p_catalogo: catalogo,
      p_items: preIds.length > 0 ? preIds : null,
    });
    if (n !== peticion.current) return;
    if (error) setError(error.message);
    else {
      setError('');
      setItems((data ?? []) as ItemProveedor[]);
    }
  }, [supabase, organizacionId, modo, proveedor, linea, busqueda, catalogo, preIds]);

  useEffect(() => {
    cargarItems();
  }, [cargarItems]);

  // Un agotado nuevo o cerrado, una solicitud de otra persona o una orden recién generada
  // actualizan las marcas de la lista sin recargar la página.
  const alCambiarEnVivo = useCallback(() => {
    cargarProveedores();
    cargarItems();
  }, [cargarProveedores, cargarItems]);
  useTiempoReal(supabase, organizacionId, TABLAS_PEDIDOS, alCambiarEnVivo);

  const efectivo = (i: ItemProveedor): Seleccion =>
    sel[i.item_id] ?? { on: false, cant: i.cantidad_sugerida?.toString() ?? '' };
  // Los que ya están en una solicitud abierta con este proveedor no se pueden volver a pedir
  const elegibles = items.filter((i) => !i.ya_en_solicitud);
  const marcados = elegibles.filter((i) => efectivo(i).on);
  const tieneAgotado = (i: ItemProveedor) => (i.agotado_sedes?.length ?? 0) > 0;
  // Misma regla que el servidor: sin agotado, la cantidad la digita Compras
  const sinCantidad = marcados.filter((i) => !tieneAgotado(i) && !(Number(efectivo(i).cant) > 0));

  function poner(i: ItemProveedor, cambio: Partial<Seleccion>) {
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

  // Los ítems que llegan de Solicitudes (o recién creados) aparecen marcados, una sola vez por ítem
  useEffect(() => {
    if (modo !== 'proveedor') return;
    const nuevos = items.filter((i) => preIds.includes(i.item_id) && !yaMarcados.current.has(i.item_id) && !i.ya_en_solicitud);
    if (nuevos.length === 0) return;
    nuevos.forEach((i) => yaMarcados.current.add(i.item_id));
    setSel((s) => {
      const n = { ...s };
      nuevos.forEach((i) => {
        n[i.item_id] = { ...(s[i.item_id] ?? { cant: i.cantidad_sugerida?.toString() ?? '' }), on: true };
      });
      return n;
    });
  }, [items, preIds, modo]);

  async function crearPorProveedor() {
    if (sinCantidad.length > 0) {
      setError(`Digita la cantidad de: ${sinCantidad.map((i) => i.nombre_base).join(', ')}`);
      return;
    }
    setGuardando(true);
    setError('');
    const payload = marcados.map((i) => {
      const c = efectivo(i).cant;
      return { item_id: i.item_id, cantidad: c === '' ? null : Number(c), proveedores: [Number(proveedor)] };
    });
    const { data, error } = await supabase.rpc('solicitudes_crear_multi', { p_org: organizacionId, p_items: payload });
    setGuardando(false);
    if (error) {
      setError(error.message);
      return;
    }
    alCrear((data?.creadas ?? []) as SolicitudCreada[], ((data?.omitidos ?? []) as unknown[]).length);
  }

  function alCrear(creadas: SolicitudCreada[], omitidos: number) {
    setResultado({ creadas, omitidos });
    setSel({});
    setPreIds([]);
    yaMarcados.current = new Set();
  }

  function terminar() {
    setResultado(null);
    cargarProveedores();
  }

  function limpiarFiltros() {
    setLinea('');
    setTextoBusqueda('');
    setBusqueda('');
  }

  const nombreProveedor = (id: number) => proveedores.find((p) => p.id === id)?.nombre ?? String(id);

  if (resultado) {
    return (
      <ResultadoSolicitudes
        supabase={supabase}
        organizacionId={organizacionId}
        creadas={resultado.creadas}
        omitidos={resultado.omitidos}
        nombreProveedor={nombreProveedor}
        onTerminar={terminar}
        onIrAComparativo={onIrAComparativo}
      />
    );
  }

  const proveedorActual = proveedores.find((p) => String(p.id) === proveedor);

  return (
    <div>
      <div className="mod-flex mod-gap-2 mod-mb-2 mod-wrap mod-center">
        <span className="mod-semibold">Cotizar:</span>
        <button type="button" className={modo === 'item' ? 'ui-btn ui-btn--sm ui-btn--primary' : 'ui-btn ui-btn--sm'}
          aria-pressed={modo === 'item'} onClick={() => setModo('item')}>Por ítem</button>
        <button type="button" className={modo === 'proveedor' ? 'ui-btn ui-btn--sm ui-btn--primary' : 'ui-btn ui-btn--sm'}
          aria-pressed={modo === 'proveedor'} onClick={() => setModo('proveedor')}>Por proveedor</button>
        <span className="mod-sub">
          {modo === 'item'
            ? 'Partes de los ítems y eliges a qué proveedores consultar.'
            : 'Partes de un proveedor y ves todo lo que suministra.'}
        </span>
      </div>

      {preIds.length > 0 && (
        <p className="mod-notice mod-text">
          {preIds.length} ítem(s) llegaron marcados desde Solicitudes.{' '}
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => { setPreIds([]); yaMarcados.current = new Set(); }}>
            Ver todo el catálogo
          </button>
        </p>
      )}

      <div className="mod-flex mod-gap-2 mod-mb-2 mod-wrap mod-start">
        {modo === 'proveedor' && (
          <Combobox
            opciones={proveedores.map((p) => ({
              valor: String(p.id),
              texto: p.nombre,
              detalle: `${p.documento} · ${p.items_pendientes} con agotado · ${p.items_total} ítems`,
            }))}
            valor={proveedor}
            onCambio={(v) => {
              setProveedor(v);
              setSel({});
              yaMarcados.current = new Set();
            }}
            etiqueta="Proveedor"
            placeholder="Elegir proveedor…"
            ancho={340}
          />
        )}
        <SelectorLinea lineas={lineas} valor={linea} onCambio={setLinea} />
        <input
          value={textoBusqueda}
          onChange={(e) => setTextoBusqueda(e.target.value)}
          placeholder="Buscar por ítem, nombre o referencia"
          className="ui-input ui-input--sm mod-auto" style={{ minWidth: 280 }}
        />
        {permisos.provCrear && (
          <button type="button" className={panel === 'proveedor' ? 'ui-btn ui-btn--sm' : 'ui-btn ui-btn--sm ui-btn--soft'}
            onClick={() => setPanel(panel === 'proveedor' ? '' : 'proveedor')}>
            {panel === 'proveedor' ? 'Cancelar proveedor' : '+ Nuevo proveedor'}
          </button>
        )}
        {(permisos.itemsCrear || permisos.crear) && (
          <button type="button" className={panel === 'item' ? 'ui-btn ui-btn--sm' : 'ui-btn ui-btn--sm ui-btn--soft'}
            onClick={() => setPanel(panel === 'item' ? '' : 'item')}>
            {panel === 'item' ? 'Cancelar ítem' : '+ Nuevo ítem'}
          </button>
        )}
      </div>

      {modo === 'proveedor' && proveedor && (
        <div className="mod-mb-2 mod-text">
          <label>
            <input type="checkbox" checked={catalogo} onChange={(e) => setCatalogo(e.target.checked)} />{' '}
            Incluir el catálogo completo (ítems que este proveedor aún no tiene vinculados)
          </label>
        </div>
      )}

      {panel === 'proveedor' && (
        <FormProveedorNuevo
          supabase={supabase}
          organizacionId={organizacionId}
          onCancelar={() => setPanel('')}
          onCreado={async (id) => {
            setPanel('');
            await cargarProveedores();
            // El proveedor recién creado queda elegido para seguir con el pedido
            setModo('proveedor');
            setProveedor(String(id));
            setSel({});
            yaMarcados.current = new Set();
          }}
        />
      )}

      {panel === 'item' && (
        <NuevoItem
          supabase={supabase}
          organizacionId={organizacionId}
          lineas={lineas}
          permisos={permisos}
          onCancelar={() => setPanel('')}
          onCreado={(id) => {
            // El ítem nuevo queda disponible de inmediato: sin filtros, preseleccionado y marcado
            setPanel('');
            limpiarFiltros();
            setCatalogo(false);
            setPreIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
          }}
        />
      )}

      {error && <p className="mod-text">Error: {error}</p>}

      {/* Sigue montado al cambiar de modo para no perder lo que se marcó */}
      <div style={modo === 'item' ? undefined : { display: 'none' }}>
        <PorItem
          supabase={supabase}
          organizacionId={organizacionId}
          linea={linea}
          busqueda={busqueda}
          proveedores={proveedores}
          preIds={preIds}
          onCreadas={alCrear}
        />
      </div>

      {modo === 'proveedor' && !proveedor && (
        <p className="mod-text">Elige un proveedor para ver todo lo que suministra, o crea uno nuevo.</p>
      )}
      {modo === 'proveedor' && proveedor && catalogo && !busqueda.trim() && (
        <p className="mod-text">Escribe un nombre, ítem o referencia para buscar en el catálogo completo.</p>
      )}

      {modo === 'proveedor' && proveedor && (
        <>
          <div className="mod-scroll">
            <table className="mod-table">
              <thead>
                <tr>
                  <th className="mod-check">
                    <input
                      type="checkbox"
                      aria-label="Marcar todos"
                      checked={elegibles.length > 0 && marcados.length === elegibles.length}
                      onChange={(e) => marcarTodos(e.target.checked)}
                    />
                  </th>
                  {[
                    'Item', 'Nombre Base', 'Línea', 'Referencia', 'Und/caja', 'Costo ERP', 'Días',
                    'Agotado en', 'Cant. sugerida', 'Última orden', 'Cant. a cotizar',
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const e = efectivo(i);
                  const falta = e.on && !tieneAgotado(i) && !(Number(e.cant) > 0);
                  return (
                    <tr key={i.item_id} className={i.ya_en_solicitud ? 'is-faded' : e.on ? 'is-selected' : undefined}>
                      <td className="mod-check">
                        <input
                          type="checkbox"
                          disabled={i.ya_en_solicitud}
                          checked={e.on}
                          onChange={(ev) => poner(i, { on: ev.target.checked })}
                          aria-label={`Incluir ítem ${i.item_id}`}
                        />
                      </td>
                      <td>{idVisible(i.item_id, i.provisional, i.codigo)}</td>
                      <td>
                        {i.nombre_base}
                        {i.provisional && <div className="mod-sub">Ítem provisional (aún sin ID del ERP)</div>}
                        {!i.vinculado && <div className="mod-sub">Se vinculará a este proveedor al crear la solicitud</div>}
                        {i.ya_en_solicitud && <div className="mod-sub">Ya está en una solicitud abierta con este proveedor</div>}
                      </td>
                      <td>{i.linea ?? ''}</td>
                      <td>{i.referencia ?? ''}</td>
                      <td>{i.unidades_por_caja ?? ''}</td>
                      <td>{pesos(i.precio_erp)}</td>
                      <td>{i.dias_entrega ?? ''}</td>
                      <td>{i.agotado_sedes?.join(', ') ?? ''}</td>
                      <td>{i.cantidad_sugerida ?? ''}</td>
                      <td>
                        {textoUltimaOrden(i.ultima_orden_numero, i.ultima_orden_fecha, i.ultima_orden_cantidad)}
                      </td>
                      <td>
                        <input
                          value={e.cant}
                          inputMode="numeric"
                          disabled={i.ya_en_solicitud}
                          onChange={(ev) => poner(i, { cant: ev.target.value.replace(/\D/g, '') })}
                          className={falta ? 'ui-input ui-input--sm mod-cell-input is-missing' : 'ui-input ui-input--sm mod-cell-input'} style={{ width: 70 }}
                          aria-label={`Cantidad a cotizar ítem ${i.item_id}`}
                        />
                        {falta && <div className="mod-sub">Obligatoria</div>}
                      </td>
                    </tr>
                  );
                })}
                {items.length === 0 && !(catalogo && !busqueda.trim()) && (
                  <tr>
                    <td colSpan={12}>
                      {catalogo
                        ? 'El catálogo no tiene ítems con esa búsqueda'
                        : `${proveedorActual?.nombre ?? 'Este proveedor'} no tiene ítems vinculados con esos filtros. Activa “Incluir el catálogo completo” para agregar uno.`}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mod-bulkbar mod-bulkbar--sticky">
            <button
              type="button"
              className="ui-btn ui-btn--sm ui-btn--primary"
              disabled={marcados.length === 0 || guardando || sinCantidad.length > 0 || !permisos.crear}
              onClick={crearPorProveedor}
            >
              Crear solicitud de cotización ({marcados.length} ítems)
            </button>
            {sinCantidad.length > 0 && (
              <span className="mod-sub">
                Falta la cantidad en {sinCantidad.length} ítem(s) sin agotado reportado.
              </span>
            )}
            <span className="mod-sub">
              Un mismo ítem puede ir en solicitudes a varios proveedores. Los costos se registran en el Comparativo.
            </span>
          </div>
        </>
      )}
    </div>
  );
}
