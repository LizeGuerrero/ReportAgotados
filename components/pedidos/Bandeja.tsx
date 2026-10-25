'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import Combobox from '@/components/Combobox';
import { useTiempoReal } from '@/components/useTiempoReal';
import SelectorLinea from '@/components/SelectorLinea';
import DetalleCotizacion from '@/components/pedidos/DetalleCotizacion';
import type { PermisosPedidos } from '@/components/pedidos/usePermisosPedidos';
import {
  ESTADOS, idVisible, pesos, RESPUESTAS, TABLAS_PEDIDOS, textoUltimaOrden, type Pedido,
} from '@/components/pedidos/comun';

const POR_PAGINA = 50;
/** Máximo de resultados que "seleccionar todos los resultados" trae de una vez. */
const MAX_SELECCION = 2000;
/** Estados en los que todavía tiene sentido pedir cotización. */
const COTIZABLES = ['por_cotizar', 'en_cotizacion', 'cotizado'];

/**
 * Solicitudes: lo que Comercial notificó (agotados) y lo que Compras inició a mano. Es la entrada
 * del flujo: se marcan uno, varios o todos y se pasa directo a cotizar, o se responde en bloque.
 * El clic en una fila abre el detalle del ítem (igual que en Ítems y Proveedores).
 */
export default function Bandeja({
  supabase,
  organizacionId,
  permisos,
  onCotizar,
}: {
  supabase: SupabaseClient;
  organizacionId: string;
  permisos: PermisosPedidos;
  /** Lleva la selección al paso "Cotizar". */
  onCotizar: (itemIds: number[]) => void;
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
  // Selección: id del ítem → su estado (se conserva al cambiar de página y de filtro)
  const [sel, setSel] = useState<Record<number, string>>({});
  const [trayendo, setTrayendo] = useState(false);
  const [respuesta, setRespuesta] = useState('');
  const [motivo, setMotivo] = useState('');
  const [aplicando, setAplicando] = useState(false);

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

  // ---- selección ----
  const nSel = Object.keys(sel).length;
  const idsCotizables = Object.entries(sel).filter(([, e]) => COTIZABLES.includes(e)).map(([id]) => Number(id));
  const paginaMarcada = filas.length > 0 && filas.every((f) => f.item_id in sel);
  // Si toda la página está marcada pero hay más resultados que no, se ofrece marcarlos todos
  const faltanPorMarcar = paginaMarcada && total > filas.length && Object.keys(sel).length < total;

  function alternar(p: Pedido, on: boolean) {
    setSel((s) => {
      const n = { ...s };
      if (on) n[p.item_id] = p.estado;
      else delete n[p.item_id];
      return n;
    });
  }

  function alternarPagina(on: boolean) {
    setSel((s) => {
      const n = { ...s };
      filas.forEach((f) => {
        if (on) n[f.item_id] = f.estado;
        else delete n[f.item_id];
      });
      return n;
    });
  }

  async function seleccionarTodosLosResultados() {
    setTrayendo(true);
    const acumulado: Record<number, string> = {};
    for (let off = 0; off < MAX_SELECCION; off += 200) {
      const { data, error } = await supabase.rpc('listar_pedidos', {
        p_org: organizacionId,
        p_linea: linea || null,
        p_busqueda: busqueda || null,
        p_estado: estado || null,
        p_limit: 200,
        p_offset: off,
      });
      if (error) {
        setError(error.message);
        break;
      }
      const rows = (data ?? []) as Pedido[];
      rows.forEach((r) => {
        acumulado[r.item_id] = r.estado;
      });
      if (rows.length < 200) break;
    }
    setSel((s) => ({ ...s, ...acumulado }));
    if (total > MAX_SELECCION) setAviso(`Se seleccionaron los primeros ${MAX_SELECCION} de ${total} resultados. Filtra para acotar.`);
    setTrayendo(false);
  }

  function cotizarSeleccion() {
    if (idsCotizables.length === 0) {
      setAviso('Ninguno de los ítems marcados está pendiente de cotizar (ya tienen respuesta o están agotados en proveedor).');
      return;
    }
    const excluidos = nSel - idsCotizables.length;
    if (excluidos > 0) setAviso(`${excluidos} ítem(s) marcados no se incluyeron porque ya tienen respuesta.`);
    onCotizar(idsCotizables);
  }

  async function responderSeleccion() {
    if (!respuesta) return;
    if (respuesta === 'no_se_pide' && !motivo.trim()) {
      setError('Escribe el motivo por el que no se pide.');
      return;
    }
    setAplicando(true);
    setError('');
    const { data, error } = await supabase.rpc('agotados_responder_masivo', {
      p_org: organizacionId,
      p_items: Object.keys(sel).map(Number),
      p_respuesta: respuesta,
      p_motivo: respuesta === 'no_se_pide' ? motivo.trim() : null,
    });
    setAplicando(false);
    if (error) {
      setError(error.message);
      return;
    }
    const n = Number(data ?? 0);
    const sinAgotado = nSel - n;
    setAviso(
      `Se respondieron ${n} ítem(s).` +
        (sinAgotado > 0 ? ` ${sinAgotado} no tenían un agotado pendiente (ya respondido o iniciado por Compras) y quedaron igual.` : ''),
    );
    setSel({});
    setRespuesta('');
    setMotivo('');
    await cargar();
  }

  if (detalle) {
    return (
      <DetalleCotizacion
        supabase={supabase}
        organizacionId={organizacionId}
        pedido={detalle}
        permisos={permisos}
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
      <p className="mod-text mod-mt-0 mod-mb-2">
        Lo que Comercial notificó como agotado y lo que Compras inició. Marca uno, varios o todos para cotizar
        o responder en bloque; haz clic en una fila para ver su detalle.
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
          className="ui-input ui-input--sm mod-auto" style={{ minWidth: 300 }}
        />
      </div>

      {error && <p className="mod-text">Error: {error}</p>}
      {aviso && (
        <p className="mod-notice mod-text">
          {aviso}{' '}
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => setAviso('')}>Entendido</button>
        </p>
      )}

      {nSel > 0 && (
        <div className="mod-bulkbar" role="region" aria-label="Acciones sobre la selección">
          <span className="mod-semibold">{nSel} seleccionado(s)</span>
          {permisos.crear && (
            <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" onClick={cotizarSeleccion}>
              Cotizar{idsCotizables.length !== nSel ? ` (${idsCotizables.length} de ${nSel})` : ` (${nSel})`}
            </button>
          )}
          {permisos.editar && (
            <>
              <span className="mod-text">o responder:</span>
              <Combobox
                opciones={RESPUESTAS.map((r) => ({ valor: r.valor, texto: r.texto }))}
                valor={respuesta}
                onCambio={setRespuesta}
                etiqueta="Respuesta para los marcados"
                placeholder="Elegir respuesta…"
                ancho={260}
              />
              {respuesta === 'no_se_pide' && (
                <input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Motivo (obligatorio)"
                  className="ui-input ui-input--sm" style={{ width: 240 }}
                  aria-label="Motivo por el que no se pide"
                />
              )}
              {respuesta && (
                <button type="button" className="ui-btn ui-btn--sm" disabled={aplicando} onClick={responderSeleccion}>
                  {aplicando ? 'Aplicando…' : 'Aplicar a los marcados'}
                </button>
              )}
            </>
          )}
          <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => setSel({})}>Quitar selección</button>
        </div>
      )}

      {faltanPorMarcar && (
        <p className="mod-text mod-mt-0 mod-mb-2">
          Marcaste los {filas.length} de esta página.{' '}
          <button type="button" className="ui-btn ui-btn--sm" disabled={trayendo} onClick={seleccionarTodosLosResultados}>
            {trayendo ? 'Marcando…' : `Marcar los ${total} resultados`}
          </button>
        </p>
      )}

      <div className="mod-scroll">
        <table className="mod-table">
          <thead>
            <tr>
              <th className="mod-check">
                <input
                  type="checkbox"
                  aria-label="Marcar todos los de esta página"
                  checked={paginaMarcada}
                  onChange={(e) => alternarPagina(e.target.checked)}
                />
              </th>
              {['Item', 'Nombre Base', 'Línea', 'Cant. sugerida', 'Estado', 'Cotizaciones', 'Mejor costo', 'Proveedor elegido', ''].map((h, k) => (
                <th key={`${h}-${k}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((p) => (
              <tr
                key={p.item_id}
                className={p.item_id in sel ? 'is-clickable is-selected' : 'is-clickable'}
                onClick={() => setDetalle(p)}
              >
                <td className="mod-check" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={p.item_id in sel}
                    onChange={(e) => alternar(p, e.target.checked)}
                    aria-label={`Marcar ítem ${idVisible(p.item_id, p.provisional, p.codigo)}`}
                  />
                </td>
                <td>{idVisible(p.item_id, p.provisional, p.codigo)}</td>
                <td>
                  {p.nombre_base}
                  {p.origen === 'manual' && (
                    <div className="mod-sub">
                      Iniciado por Compras (sin agotado){p.provisional ? ' · ítem provisional' : ''}
                    </div>
                  )}
                  {p.ultima_orden_numero && (
                    <div className="mod-sub">
                      Última orden: {textoUltimaOrden(p.ultima_orden_numero, p.ultima_orden_fecha, p.ultima_orden_cantidad)}
                    </div>
                  )}
                </td>
                <td>{p.linea ?? ''}</td>
                <td>
                  {p.cantidad_sugerida ?? ''}
                  {p.sedes.length > 1 && <div className="mod-sub">{p.sedes.length} sedes</div>}
                </td>
                <td>{ESTADOS[p.estado] ?? p.estado}</td>
                <td>
                  {p.cotizaciones_esperadas > 0 ? `${p.cotizaciones_recibidas}/${p.cotizaciones_esperadas}` : '—'}
                </td>
                <td>
                  {p.mejor_costo !== null ? (
                    <>
                      {pesos(p.mejor_costo)}
                      <div className="mod-sub">{p.mejor_proveedor}</div>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td>{p.proveedor_elegido ?? '—'}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  {p.estado === 'agotado_proveedor' && permisos.editar && (
                    <button type="button" className="ui-btn ui-btn--sm" onClick={() => reabrir(p)}>Volver a cotizar</button>
                  )}
                </td>
              </tr>
            ))}
            {!cargando && filas.length === 0 && (
              <tr>
                <td colSpan={10}>No hay ítems en gestión</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mod-pager">
        <button disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>Anterior</button>
        <span>Página {pagina + 1} de {paginas} ({total} ítems)</span>
        <button disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)}>Siguiente</button>
      </div>
    </div>
  );
}
