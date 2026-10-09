'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import Combobox from '@/components/Combobox';
import SelectorLinea from '@/components/SelectorLinea';
import { useTiempoReal } from '@/components/useTiempoReal';
import PorItem from '@/components/pedidos/PorItem';
import {
  idVisible, PanelTexto, pesos, TABLAS_PEDIDOS, textoUltimaOrden, type ProveedorLista,
} from '@/components/pedidos/comun';
import TablaExcel from '@/components/TablaExcel';

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
  /** false = viene del catálogo completo y aún no está ligado a este proveedor. */
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

/**
 * Compras trabaja desde el proveedor: elige a quién le va a pedir y ve TODO lo que ese proveedor
 * suministra (no solo lo que alguna sede reportó). Los ítems con agotado pendiente salen primero y
 * traen la cantidad sugerida; para los demás Compras digita la cantidad.
 *
 * Se usa como pestaña "Por proveedor" y como pantalla "+ Nueva solicitud" de Solicitudes.
 */
export default function PorProveedor({
  supabase,
  organizacionId,
  onTerminar,
}: {
  supabase: SupabaseClient;
  organizacionId: string;
  /** Si se pasa, se muestra el botón "← Volver" y se llama al terminar. */
  onTerminar?: () => void;
}) {
  const [proveedores, setProveedores] = useState<ProveedorLista[]>([]);
  const [proveedor, setProveedor] = useState('');
  const [lineas, setLineas] = useState<string[]>([]);
  const [linea, setLinea] = useState('');
  const [textoBusqueda, setTextoBusqueda] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [catalogo, setCatalogo] = useState(false);
  const [items, setItems] = useState<ItemProveedor[]>([]);
  const [sel, setSel] = useState<Record<number, Seleccion>>({});
  const [error, setError] = useState('');
  const [creada, setCreada] = useState<{ id: string; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [itemNuevo, setItemNuevo] = useState(false);
  // Para ignorar respuestas viejas si el usuario escribe más rápido de lo que responde el servidor
  const peticion = useRef(0);

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
    if (!proveedor || (catalogo && !busqueda.trim())) {
      setItems([]);
      return;
    }
    const { data, error } = await supabase.rpc('listar_items_proveedor', {
      p_org: organizacionId,
      p_proveedor: Number(proveedor),
      p_linea: linea || null,
      p_busqueda: busqueda || null,
      p_catalogo: catalogo,
    });
    if (n !== peticion.current) return;
    if (error) setError(error.message);
    else {
      setError('');
      setItems((data ?? []) as ItemProveedor[]);
    }
  }, [supabase, organizacionId, proveedor, linea, busqueda, catalogo]);

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

  async function crear() {
    if (sinCantidad.length > 0) {
      setError(`Digita la cantidad de: ${sinCantidad.map((i) => i.nombre_base).join(', ')}`);
      return;
    }
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

  function terminar() {
    setCreada(null);
    setSel({});
    onTerminar?.();
  }

  if (creada) {
    return (
      <div>
        <p className="mod-md">Solicitud creada. Copia el texto y envíalo al proveedor (WhatsApp, correo…).</p>
        <PanelTexto
          titulo="Texto de la solicitud (sin costos)"
          texto={creada.texto}
          onCopiar={async () => {
            await supabase.rpc('solicitud_marcar_enviada', { p_org: organizacionId, p_solicitud: creada.id });
          }}
          onCerrar={() => {}}
        />
        <button type="button" className="ui-btn ui-btn--sm" onClick={terminar}>Terminar</button>
      </div>
    );
  }

  const proveedorActual = proveedores.find((p) => String(p.id) === proveedor);

  return (
    <div>
      {onTerminar && (
        <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={onTerminar}>← Volver a solicitudes</button>
      )}
      <h2 className="mod-h2 mod-mt-3 mod-mb-3">Cotizar: por proveedor o por ítem</h2>

      <div className="mod-flex mod-gap-2 mod-mb-2 mod-wrap mod-start">
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
            setItemNuevo(false);
          }}
          etiqueta="Proveedor"
          vacio="Todos los proveedores (cotizar por ítem)"
          ancho={340}
        />
        <SelectorLinea lineas={lineas} valor={linea} onCambio={setLinea} />
        <input
          value={textoBusqueda}
          onChange={(e) => setTextoBusqueda(e.target.value)}
          placeholder="Buscar por ítem, nombre o referencia"
          className="ui-input ui-input--sm mod-auto" style={{ minWidth: 280 }}
        />
      </div>

      {proveedor && (
        <div className="mod-flex mod-gap-4 mod-mb-3 mod-wrap mod-center mod-text">
          <label>
            <input type="checkbox" checked={catalogo} onChange={(e) => setCatalogo(e.target.checked)} />{' '}
            Buscar en todo el catálogo (ítems que este proveedor aún no tiene vinculados)
          </label>
          <button type="button" className={itemNuevo ? 'ui-btn ui-btn--sm' : 'ui-btn ui-btn--sm ui-btn--primary'} onClick={() => setItemNuevo((v) => !v)}>
            {itemNuevo ? 'Cancelar ítem nuevo' : '+ Ítem nuevo (no está en el catálogo)'}
          </button>
        </div>
      )}

      {proveedor && itemNuevo && (
        <NuevoItemProvisional
          supabase={supabase}
          organizacionId={organizacionId}
          lineas={lineas}
          onCreado={(id, nombre) => {
            // Se muestra el ítem recién creado ya marcado, listo para digitar la cantidad
            setItemNuevo(false);
            setCatalogo(true);
            setTextoBusqueda(nombre);
            setBusqueda(nombre);
            setSel((s) => ({ ...s, [id]: { on: true, cant: '' } }));
          }}
        />
      )}

      {error && <p className="mod-text">Error: {error}</p>}

      {/* Sin proveedor elegido se parte del ítem: se ven todos sus proveedores y se pide a varios a la vez */}
      {!proveedor && (
        <PorItem
          supabase={supabase}
          organizacionId={organizacionId}
          linea={linea}
          busqueda={busqueda}
          proveedores={proveedores}
        />
      )}
      {proveedor && catalogo && !busqueda.trim() && (
        <p className="mod-text">Escribe un nombre, ítem o referencia para buscar en el catálogo completo.</p>
      )}

      {proveedor && (
        <>
          <TablaExcel clave="porproveedor-1" etiqueta="Tabla de ítems del proveedor"><table className="mod-table">
              <thead>
                <tr>
                  <th>
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
                    <tr key={i.item_id} className={i.ya_en_solicitud ? 'is-faded' : undefined}>
                      <td>
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
                        : `${proveedorActual?.nombre ?? 'Este proveedor'} no tiene ítems vinculados con esos filtros. Activa “Buscar en todo el catálogo” para agregar uno.`}
                    </td>
                  </tr>
                )}
              </tbody>
            </table></TablaExcel>

          <div className="mod-mt-3 mod-flex mod-gap-2 mod-center mod-wrap">
            <button
              type="button"
              className="ui-btn ui-btn--sm mod-semibold"
              disabled={marcados.length === 0 || guardando || sinCantidad.length > 0}
              onClick={crear}
            >
              Crear solicitud ({marcados.length} ítems)
            </button>
            {sinCantidad.length > 0 && (
              <span className="mod-sub">
                Falta la cantidad en {sinCantidad.length} ítem(s) sin agotado reportado.
              </span>
            )}
            <span className="mod-sub">
              Un mismo ítem puede ir en solicitudes a varios proveedores. Los costos se registran después en el detalle del ítem.
            </span>
          </div>
        </>
      )}
    </div>
  );
}

const IVAS = [
  { valor: '0.19', texto: '19%' },
  { valor: '0.05', texto: '5%' },
  { valor: '0', texto: '0% (excluido / exento)' },
];

/**
 * Compras habló con el proveedor y este le ofreció algo que no está en el catálogo (o no se sabe
 * si ya existe). Se crea un ítem provisional con ID propio; cuando el ERP le asigne su ID real, un
 * administrador lo vincula desde la pestaña "Ítems provisionales".
 */
function NuevoItemProvisional({
  supabase,
  organizacionId,
  lineas,
  onCreado,
}: {
  supabase: SupabaseClient;
  organizacionId: string;
  lineas: string[];
  onCreado: (id: number, nombre: string) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [iva, setIva] = useState('0.19');
  const [linea, setLinea] = useState('');
  const [unidad, setUnidad] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setGuardando(true);
    const { data, error } = await supabase.rpc('item_provisional_crear', {
      p_org: organizacionId,
      p_nombre: nombre,
      p_iva: Number(iva),
      p_linea: linea.trim() || null,
      p_unidad_medida: unidad.trim() || null,
    });
    setGuardando(false);
    if (error) {
      setError(error.message);
      return;
    }
    onCreado(Number(data), nombre.trim());
  }

  return (
    <div className="mod-card mod-mb-3">
      <div className="mod-semibold mod-mb-1 mod-md">Ítem nuevo</div>
      <p className="mod-sub mod-mt-0 mod-mb-2">
        Antes de crearlo, busca en el catálogo completo: puede que ya exista con otro nombre.
        El IVA es obligatorio porque se usa para calcular el costo con IVA.
      </p>
      <div className="mod-flex mod-gap-2 mod-wrap mod-center">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre del ítem"
          className="ui-input ui-input--sm" style={{ width: 300 }}
          aria-label="Nombre del ítem nuevo"
        />
        <select value={iva} onChange={(e) => setIva(e.target.value)} className="ui-input ui-input--sm mod-auto" aria-label="IVA">
          {IVAS.map((o) => (
            <option key={o.valor} value={o.valor}>IVA {o.texto}</option>
          ))}
        </select>
        <input
          value={linea}
          onChange={(e) => setLinea(e.target.value)}
          list="lineas-item-nuevo"
          placeholder="Línea (opcional)"
          className="ui-input ui-input--sm" style={{ width: 180 }}
          aria-label="Línea"
        />
        <datalist id="lineas-item-nuevo">
          {lineas.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
        <input
          value={unidad}
          onChange={(e) => setUnidad(e.target.value)}
          placeholder="Unidad (opcional)"
          className="ui-input ui-input--sm" style={{ width: 130 }}
          aria-label="Unidad de medida"
        />
        <button
          type="button"
          className="ui-btn ui-btn--sm mod-semibold"
          disabled={guardando || nombre.trim() === ''}
          onClick={guardar}
        >
          Crear ítem
        </button>
      </div>
      {error && <p className="mod-text mod-mt-2 mod-mb-0">Error: {error}</p>}
    </div>
  );
}
