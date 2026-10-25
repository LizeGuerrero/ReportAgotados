'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import Combobox from '@/components/Combobox';
import SelectorLinea from '@/components/SelectorLinea';
import { useTiempoReal } from '@/components/useTiempoReal';
import type { PermisosPedidos } from '@/components/pedidos/usePermisosPedidos';
import {
  idVisible, pesos, TABLAS_PEDIDOS, textoCajas, type ProveedorLista,
} from '@/components/pedidos/comun';

const POR_PAGINA = 50;

interface Celda {
  cotizacion_id: string;
  proveedor_id: number;
  proveedor: string;
  solicitud_numero: string;
  solicitud_estado: string;
  costo_unitario: number | null;
  costo_con_iva: number | null;
  iva: number;
  disponible: boolean | null;
  dias_entrega: number | null;
  flete: number | null;
  unidades_por_caja: number | null;
  observacion: string | null;
  fecha_respuesta: string | null;
  seleccionado: boolean;
  cantidad_pedir: number | null;
  precio_erp: number | null;
  referencia: string | null;
}

interface FilaMatriz {
  item_id: number;
  codigo: string | null;
  nombre_base: string;
  linea: string | null;
  unidad_medida: string | null;
  iva: number | null;
  provisional: boolean;
  origen: 'agotado' | 'manual';
  cantidad_a_cotizar: number | null;
  agotado_sedes: string[] | null;
  cotizaciones: Celda[];
  total: number;
}

type Accion = (fn: string, args: Record<string, unknown>) => Promise<void>;

const num = (v: string) => (v === '' ? null : Number(v));

const FILTROS_ESTADO = [
  { valor: 'sin_ganador', texto: 'Sin ganador elegido' },
  { valor: 'con_ganador', texto: 'Con ganador elegido' },
  { valor: 'faltan', texto: 'Faltan respuestas' },
];

/** Si cambia algo de ESTA celda en la base, la celda se reinicia; las demás conservan lo que se esté escribiendo. */
const firma = (c: Celda) =>
  [c.cotizacion_id, c.fecha_respuesta, c.seleccionado, c.cantidad_pedir, c.costo_unitario, c.disponible,
    c.dias_entrega, c.flete, c.unidades_por_caja, c.observacion].join('|');

/**
 * Paso 3 — Comparativo. Una fila por ítem en cotización y una columna por proveedor consultado (como la
 * matriz del Excel "PEDIDO LATON"). Se digitan los costos en la misma tabla, ★ marca el mejor costo con
 * IVA de cada ítem y se elige el ganador sin salir de aquí: de a uno, o en bloque ("el más barato en todos",
 * "todo de este proveedor"). Lo elegido se resume abajo y de ahí se pasa directo a las órdenes de compra.
 */
export default function Comparativo({
  supabase,
  organizacionId,
  permisos,
  onIrAOrdenes,
}: {
  supabase: SupabaseClient;
  organizacionId: string;
  permisos: PermisosPedidos;
  onIrAOrdenes: () => void;
}) {
  const [lineas, setLineas] = useState<string[]>([]);
  const [linea, setLinea] = useState('');
  const [textoBusqueda, setTextoBusqueda] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [proveedores, setProveedores] = useState<ProveedorLista[]>([]);
  const [pagina, setPagina] = useState(0);
  const [filas, setFilas] = useState<FilaMatriz[]>([]);
  const [porGenerar, setPorGenerar] = useState<{ proveedor_id: number; items: number; total_con_iva: number }[]>([]);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [confirmaQuitar, setConfirmaQuitar] = useState(false);
  const peticion = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setBusqueda(textoBusqueda);
      setPagina(0);
    }, 300);
    return () => clearTimeout(t);
  }, [textoBusqueda]);

  useEffect(() => {
    supabase.rpc('listar_lineas_catalogo', { p_org: organizacionId }).then(({ data }) => {
      const lista = (data ?? []) as (string | { linea: string })[];
      setLineas(lista.map((d) => (typeof d === 'string' ? d : d.linea)));
    });
    supabase.rpc('listar_proveedores_pedidos', { p_org: organizacionId }).then(({ data }) => {
      setProveedores((data ?? []) as ProveedorLista[]);
    });
  }, [supabase, organizacionId]);

  const cargar = useCallback(async () => {
    const n = ++peticion.current;
    // Los filtros de proveedor y estado los aplica el servidor: valen para TODOS los ítems, no solo la página
    const [m, g] = await Promise.all([
      supabase.rpc('matriz_cotizaciones', {
        p_org: organizacionId,
        p_linea: linea || null,
        p_busqueda: busqueda || null,
        p_limit: POR_PAGINA,
        p_offset: pagina * POR_PAGINA,
        p_proveedor: proveedor ? Number(proveedor) : null,
        p_estado: estado || null,
      }),
      supabase.rpc('listar_ordenes_por_generar', { p_org: organizacionId }),
    ]);
    if (n !== peticion.current) return;
    if (m.error) setError(m.error.message);
    else {
      setError('');
      setFilas((m.data ?? []) as FilaMatriz[]);
    }
    if (!g.error) setPorGenerar((g.data ?? []) as { proveedor_id: number; items: number; total_con_iva: number }[]);
  }, [supabase, organizacionId, linea, busqueda, pagina, proveedor, estado]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Otro comprador registra un precio, elige un ganador o crea solicitudes: se ve aquí sin recargar
  useTiempoReal(supabase, organizacionId, TABLAS_PEDIDOS, cargar);

  const accion: Accion = async (fn, args) => {
    const { error } = await supabase.rpc(fn, { p_org: organizacionId, ...args });
    setError(error ? error.message : '');
    await cargar();
  };

  // Columnas: todos los proveedores que aparecen en esta página (o solo el filtrado)
  const proveedoresPagina = useMemo(() => {
    const mapa = new Map<number, string>();
    filas.forEach((f) => f.cotizaciones.forEach((c) => mapa.set(c.proveedor_id, c.proveedor)));
    return Array.from(mapa, ([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [filas]);

  const columnas = proveedor ? proveedoresPagina.filter((p) => String(p.id) === proveedor) : proveedoresPagina;

  const total = filas[0]?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const conGanador = filas.filter((f) => f.cotizaciones.some((c) => c.seleccionado)).length;

  // ---- elegir en bloque (solo sobre los ítems de esta página, los que se ven) ----
  const elegible = (c: Celda) => c.disponible === true && c.costo_unitario !== null;
  const sinGanadorConOferta = filas.filter(
    (f) => !f.cotizaciones.some((c) => c.seleccionado) && f.cotizaciones.some(elegible),
  );
  const delProveedor = proveedor
    ? filas.filter((f) => f.cotizaciones.some((c) => String(c.proveedor_id) === proveedor && elegible(c)))
    : [];
  const nombreProveedorFiltro = proveedores.find((p) => String(p.id) === proveedor)?.nombre ?? '';
  const nombreItem = (id: number | string) => filas.find((f) => String(f.item_id) === String(id))?.nombre_base ?? String(id);

  async function elegirEnBloque(items: { item_id: number; proveedor_id?: number }[], quitar = false) {
    setTrabajando(true);
    setError('');
    setAviso('');
    const { data, error } = await supabase.rpc('cotizacion_elegir_masivo', {
      p_org: organizacionId,
      p_items: items,
      p_quitar: quitar,
    });
    setTrabajando(false);
    setConfirmaQuitar(false);
    if (error) {
      setError(error.message);
      return;
    }
    const omitidos = ((data?.omitidos ?? []) as { item_id: number | string; motivo: string }[]);
    setAviso(
      `${quitar ? 'Se quitó la elección de' : 'Se eligió proveedor para'} ${data?.procesados ?? 0} ítem(s).` +
        (omitidos.length > 0
          ? ` No se pudo en ${omitidos.length}: ${omitidos.slice(0, 5).map((o) => `${nombreItem(o.item_id)} (${o.motivo})`).join('; ')}${omitidos.length > 5 ? '…' : ''}`
          : ''),
    );
    await cargar();
  }

  const totalElegido = porGenerar.reduce((suma, g) => suma + Number(g.total_con_iva ?? 0), 0);
  const itemsElegidos = porGenerar.reduce((suma, g) => suma + Number(g.items ?? 0), 0);

  return (
    <div>
      <p className="mod-text mod-mt-0 mod-mb-2">
        Compara lo que respondió cada proveedor. Digita el costo antes de IVA y sal del campo para guardarlo;
        marca “No disponible” si no lo tiene. ★ es el mejor costo con IVA de cada ítem. Elige el ganador de cada
        ítem, o usa las acciones en bloque; lo elegido se resume abajo y pasa a “Órdenes de compra”.
      </p>

      <div className="mod-toolbar mod-toolbar--top">
        <SelectorLinea
          lineas={lineas}
          valor={linea}
          onCambio={(v) => {
            setLinea(v);
            setPagina(0);
          }}
        />
        <input
          value={textoBusqueda}
          onChange={(e) => setTextoBusqueda(e.target.value)}
          placeholder="Buscar por ítem o nombre"
          className="ui-input ui-input--sm mod-auto" style={{ minWidth: 240 }}
        />
        <Combobox
          opciones={proveedores.map((p) => ({ valor: String(p.id), texto: p.nombre, detalle: p.documento }))}
          valor={proveedor}
          onCambio={(v) => {
            setProveedor(v);
            setPagina(0);
          }}
          etiqueta="Proveedor"
          vacio="Todos los proveedores"
          ancho={260}
        />
        <Combobox
          opciones={FILTROS_ESTADO}
          valor={estado}
          onCambio={(v) => {
            setEstado(v);
            setPagina(0);
          }}
          etiqueta="Estado"
          vacio="Todos los estados"
          ancho={230}
        />
        <button type="button" className="ui-btn ui-btn--sm" onClick={cargar}>Actualizar</button>
      </div>

      {error && <p className="mod-text">Error: {error}</p>}
      {aviso && (
        <p className="mod-notice mod-text">
          {aviso}{' '}
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => setAviso('')}>Entendido</button>
        </p>
      )}

      <div className="mod-text mod-mb-2">
        {total} ítem(s) en cotización{(estado || proveedor) ? ' con el filtro' : ''} · {conGanador} con ganador en esta página
      </div>

      {permisos.ganadorEditar && filas.length > 0 && (
        <div className="mod-bulkbar" role="region" aria-label="Elegir en bloque">
          <span className="mod-semibold">Elegir en bloque (esta página):</span>
          <button
            type="button"
            className="ui-btn ui-btn--sm ui-btn--primary"
            disabled={trabajando || sinGanadorConOferta.length === 0}
            onClick={() => elegirEnBloque(sinGanadorConOferta.map((f) => ({ item_id: f.item_id })))}
          >
            El más barato en los {sinGanadorConOferta.length} sin ganador
          </button>
          {proveedor && (
            <button
              type="button"
              className="ui-btn ui-btn--sm"
              disabled={trabajando || delProveedor.length === 0}
              onClick={() => elegirEnBloque(delProveedor.map((f) => ({ item_id: f.item_id, proveedor_id: Number(proveedor) })))}
            >
              Todo con {nombreProveedorFiltro} ({delProveedor.length})
            </button>
          )}
          {conGanador > 0 && !confirmaQuitar && (
            <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => setConfirmaQuitar(true)}>
              Quitar elecciones
            </button>
          )}
          {confirmaQuitar && (
            <>
              <span className="mod-text">¿Quitar el ganador de los ítems de esta página?</span>
              <button
                type="button"
                className="ui-btn ui-btn--sm"
                disabled={trabajando}
                onClick={() => elegirEnBloque(filas.filter((f) => f.cotizaciones.some((c) => c.seleccionado)).map((f) => ({ item_id: f.item_id })), true)}
              >
                Sí, quitar
              </button>
              <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => setConfirmaQuitar(false)}>No</button>
            </>
          )}
          <span className="mod-sub">Solo se eligen cotizaciones con costo y disponibilidad; la cantidad sale de la solicitud.</span>
        </div>
      )}

      <div className="mod-scroll">
        <table className="mod-table">
          <thead>
            <tr>
              {['Item', 'Nombre Base', 'Cant.'].map((h) => (
                <th key={h}>{h}</th>
              ))}
              {columnas.map((p) => (
                <th key={p.id} style={{ minWidth: 190 }}>{p.nombre}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const conIva = f.cotizaciones
                .filter((c) => c.disponible === true && c.costo_con_iva !== null)
                .map((c) => c.costo_con_iva as number);
              const mejor = conIva.length > 0 ? Math.min(...conIva) : null;
              return (
                <tr key={f.item_id} >
                  <td>{idVisible(f.item_id, f.provisional, f.codigo)}</td>
                  <td>
                    {f.nombre_base}
                    {f.agotado_sedes && <div className="mod-sub">Agotado en {f.agotado_sedes.join(', ')}</div>}
                    {f.origen === 'manual' && <div className="mod-sub">Iniciado por Compras</div>}
                    {f.provisional && <div className="mod-sub">Ítem provisional</div>}
                  </td>
                  <td>{f.cantidad_a_cotizar ?? ''}</td>
                  {columnas.map((p) => {
                    const c = f.cotizaciones.find((x) => x.proveedor_id === p.id);
                    return (
                      <td key={p.id}>
                        {c ? (
                          <CeldaCotizacion
                            key={firma(c)}
                            c={c}
                            fila={f}
                            esMejor={mejor !== null && c.disponible === true && c.costo_con_iva === mejor}
                            accion={accion}
                            avisar={setError}
                            puedeElegirGanador={permisos.ganadorEditar}
                          />
                        ) : (
                          <span className="mod-sub">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {filas.length === 0 && (
              <tr>
                <td colSpan={3 + columnas.length}>
                  {(estado || proveedor || linea || busqueda)
                    ? 'Ningún ítem coincide con el filtro'
                    : 'No hay ítems en cotización. Crea solicitudes en el paso 2 (Cotizar).'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mod-pager">
        <button type="button" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>Anterior</button>
        <span>Página {pagina + 1} de {paginas}</span>
        <button type="button" disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)}>Siguiente</button>
      </div>

      <div className="mod-bulkbar mod-bulkbar--sticky" role="region" aria-label="Resumen de lo elegido">
        {porGenerar.length > 0 ? (
          <>
            <span className="mod-semibold">
              Elegido en total: {itemsElegidos} ítem(s) · {porGenerar.length} proveedor(es) · {pesos(totalElegido)} con IVA
            </span>
            <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" onClick={onIrAOrdenes}>
              Revisar y generar {porGenerar.length} orden(es) de compra →
            </button>
          </>
        ) : (
          <span className="mod-text">Aún no hay ganadores elegidos. Lo que elijas aparece aquí y se convierte en órdenes de compra.</span>
        )}
      </div>
    </div>
  );
}

function CeldaCotizacion({
  c, fila, esMejor, accion, avisar, puedeElegirGanador,
}: {
  c: Celda;
  fila: FilaMatriz;
  esMejor: boolean;
  accion: Accion;
  avisar: (mensaje: string) => void;
  /** Permiso pedidos_ganador / editar: sin él, la celda solo registra costos. */
  puedeElegirGanador: boolean;
}) {
  const [pidiendo, setPidiendo] = useState(false);
  const [cantNueva, setCantNueva] = useState('');
  const [costo, setCosto] = useState(c.costo_unitario?.toString() ?? '');
  const [nd, setNd] = useState(c.disponible === false);
  const [mas, setMas] = useState(false);
  const [dias, setDias] = useState(c.dias_entrega?.toString() ?? '');
  const [flete, setFlete] = useState(c.flete?.toString() ?? '');
  const [porCaja, setPorCaja] = useState(c.unidades_por_caja?.toString() ?? '');
  const [obs, setObs] = useState(c.observacion ?? '');
  const [cantPedir, setCantPedir] = useState(c.cantidad_pedir?.toString() ?? '');

  const conIva = costo === '' ? null : Math.round(Number(costo) * (1 + c.iva) * 100) / 100;
  const puedeElegir = c.disponible === true && c.costo_unitario !== null;

  function guardar(noDisponible: boolean) {
    if (!noDisponible && !(Number(costo) > 0)) {
      avisar('Digita el costo unitario o marca “No disponible”');
      return;
    }
    accion('cotizacion_guardar', {
      p_cotizacion: c.cotizacion_id,
      p_disponible: !noDisponible,
      p_costo: noDisponible ? null : Number(costo),
      p_dias: num(dias),
      p_flete: noDisponible ? null : num(flete),
      p_observacion: obs.trim() || null,
      p_unidades_por_caja: num(porCaja),
    });
  }

  function elegir() {
    if (c.seleccionado) {
      accion('cotizacion_elegir', { p_cotizacion: c.cotizacion_id, p_elegir: false });
      return;
    }
    const cantidad = c.cantidad_pedir ?? fila.cantidad_a_cotizar;
    if (cantidad === null) {
      // Un agotado sin cantidad sugerida: Compras la define aquí mismo, en la celda
      setPidiendo(true);
      return;
    }
    accion('cotizacion_elegir', { p_cotizacion: c.cotizacion_id, p_cantidad_pedir: cantidad });
  }

  function confirmarCantidad() {
    const n = Number(cantNueva);
    if (!(n > 0)) {
      avisar('Cantidad no válida');
      return;
    }
    setPidiendo(false);
    accion('cotizacion_elegir', { p_cotizacion: c.cotizacion_id, p_cantidad_pedir: n });
  }

  function guardarCantidadPedir() {
    const n = Number(cantPedir);
    if (!n || n <= 0 || n === c.cantidad_pedir) return;
    accion('cotizacion_elegir', { p_cotizacion: c.cotizacion_id, p_cantidad_pedir: n });
  }

  return (
    <div className={c.seleccionado ? 'mod-pick is-selected' : 'mod-pick'}>
      <div className="mod-flex mod-gap-1 mod-center">
        {esMejor && <span aria-label="Mejor costo" title="Mejor costo con IVA">★</span>}
        <input
          value={costo}
          inputMode="decimal"
          disabled={nd}
          placeholder="Costo sin IVA"
          onChange={(e) => setCosto(e.target.value.replace(/[^\d.]/g, ''))}
          onBlur={() => {
            if (!nd && costo !== '' && costo !== (c.costo_unitario?.toString() ?? '')) guardar(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          className="ui-input ui-input--sm mod-cell-input" style={{ width: 100 }}
          aria-label={`Costo ${c.proveedor}, ítem ${fila.item_id}`}
        />
      </div>

      {conIva !== null && !nd && <div className="mod-sub">{pesos(conIva)} con IVA</div>}
      {c.fecha_respuesta === null && !nd && costo === '' && <div className="mod-sub">Sin respuesta</div>}
      {(c.dias_entrega !== null || (c.flete ?? 0) > 0) && !nd && (
        <div className="mod-sub">
          {[c.dias_entrega !== null ? `${c.dias_entrega} d` : '', (c.flete ?? 0) > 0 ? `flete ${pesos(c.flete)}` : '']
            .filter(Boolean).join(' · ')}
        </div>
      )}
      {c.precio_erp !== null && <div className="mod-sub">ERP {pesos(c.precio_erp)}</div>}

      <label className="mod-sub mod-block">
        <input
          type="checkbox"
          checked={nd}
          onChange={(e) => {
            setNd(e.target.checked);
            if (e.target.checked) guardar(true);
          }}
        />{' '}
        No disponible
      </label>

      <label className="mod-sub mod-block">
        <input
          type="checkbox"
          checked={c.seleccionado || pidiendo}
          disabled={!puedeElegir || !puedeElegirGanador}
          title={!puedeElegirGanador ? 'No tienes permiso para elegir el proveedor ganador' : undefined}
          onChange={elegir}
        /> Elegir
      </label>
      {pidiendo && !c.seleccionado && (
        <div className="mod-sub">
          Cant. a pedir:{' '}
          <input
            value={cantNueva}
            inputMode="numeric"
            autoFocus
            onChange={(e) => setCantNueva(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter') confirmarCantidad(); }}
            className="ui-input ui-input--sm mod-cell-input" style={{ width: 60 }}
            aria-label={`Cantidad a pedir a ${c.proveedor}, ítem ${fila.item_id}`}
          />{' '}
          <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" onClick={confirmarCantidad}>Elegir</button>{' '}
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => setPidiendo(false)}>Cancelar</button>
        </div>
      )}
      {c.seleccionado && (
        <div className="mod-sub">
          Cant. a pedir:{' '}
          <input
            value={cantPedir}
            inputMode="numeric"
            onChange={(e) => setCantPedir(e.target.value.replace(/\D/g, ''))}
            onBlur={guardarCantidadPedir}
            className="ui-input ui-input--sm mod-cell-input" style={{ width: 60 }}
            aria-label={`Cantidad a pedir a ${c.proveedor}, ítem ${fila.item_id}`}
          />
          <div className="mod-sub">{textoCajas(Number(cantPedir), c.unidades_por_caja)}</div>
        </div>
      )}

      <button type="button" className="ui-btn ui-btn--sm mod-mt-1" onClick={() => setMas((m) => !m)}>
        {mas ? 'Menos' : 'Más'}
      </button>
      {mas && (
        <div className="mod-sub mod-mt-1 mod-grid mod-gap-1">
          <label>Días <input value={dias} inputMode="numeric" onChange={(e) => setDias(e.target.value.replace(/\D/g, ''))} className="ui-input ui-input--sm mod-cell-input" style={{ width: 50 }} /></label>
          <label>Flete <input value={flete} inputMode="decimal" onChange={(e) => setFlete(e.target.value.replace(/[^\d.]/g, ''))} className="ui-input ui-input--sm mod-cell-input" style={{ width: 80 }} /></label>
          <label>Und/caja <input value={porCaja} inputMode="numeric" onChange={(e) => setPorCaja(e.target.value.replace(/\D/g, ''))} className="ui-input ui-input--sm mod-cell-input" style={{ width: 50 }} /></label>
          <label>Obs. <input value={obs} onChange={(e) => setObs(e.target.value)} className="ui-input ui-input--sm mod-cell-input" style={{ width: 130 }} /></label>
          <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" onClick={() => guardar(nd)}>Guardar detalle</button>
        </div>
      )}
      <div className="mod-sub">{c.solicitud_numero}</div>
    </div>
  );
}
