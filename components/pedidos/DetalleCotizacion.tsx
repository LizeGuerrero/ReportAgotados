'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import Combobox from '@/components/Combobox';
import { useTiempoReal } from '@/components/useTiempoReal';
import {
  boton, campo, celda, ESTADOS, fecha, idVisible, pesos, RESPUESTAS, TABLAS_PEDIDOS, textoCajas,
  textoUltimaOrden, type Pedido, type SedePedido,
} from '@/components/pedidos/comun';

interface Cotizacion {
  cotizacion_id: string;
  solicitud_id: string;
  solicitud_numero: string;
  solicitud_estado: string;
  proveedor_id: number;
  proveedor: string;
  referencia: string | null;
  cantidad_a_cotizar: number | null;
  costo_unitario: number | null;
  iva: number;
  costo_con_iva: number | null;
  disponible: boolean | null;
  dias_entrega: number | null;
  flete: number | null;
  paga_flete: boolean;
  observacion: string | null;
  unidades_por_caja: number | null;
  precio_erp: number | null;
  fecha_solicitud: string;
  fecha_respuesta: string | null;
  respondio: string | null;
  seleccionado: boolean;
  cantidad_pedir: number | null;
  activa: boolean;
}

type Accion = (nombre: string, args: Record<string, unknown>) => Promise<boolean>;

const soloNumero = (v: string) => v.replace(/[^\d.]/g, '');
const num = (v: string) => (v === '' ? null : Number(v));

export default function DetalleCotizacion({
  supabase,
  organizacionId,
  pedido,
  onVolver,
  onCambio,
}: {
  supabase: SupabaseClient;
  organizacionId: string;
  pedido: Pedido;
  onVolver: () => void;
  onCambio: () => void;
}) {
  const [cots, setCots] = useState<Cotizacion[]>([]);
  const [historial, setHistorial] = useState(false);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase.rpc('obtener_cotizaciones_item', {
      p_org: organizacionId,
      p_item: pedido.item_id,
      p_historial: historial,
    });
    if (error) setError(error.message);
    else setCots((data ?? []) as Cotizacion[]);
    setCargando(false);
  }, [supabase, organizacionId, pedido.item_id, historial]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Si otro comprador registra un precio, elige ganador o cambia una respuesta, aquí se ve sin recargar.
  // Cada fila de cotización se reinicia solo si SU cotización cambió (ver la key más abajo), así que lo
  // que alguien esté escribiendo en otra fila no se pierde.
  useTiempoReal(supabase, organizacionId, TABLAS_PEDIDOS, () => {
    cargar();
    onCambio();
  });

  const accion: Accion = async (nombre, args) => {
    const { error } = await supabase.rpc(nombre, { p_org: organizacionId, ...args });
    if (error) {
      setError(error.message);
      return false;
    }
    setError('');
    await cargar();
    onCambio();
    return true;
  };

  async function responder(sede: SedePedido, respuesta: string) {
    let motivo: string | null = null;
    if (respuesta === 'no_se_pide') {
      const escrito = window.prompt(`Motivo por el que no se pide (${sede.sede}):`, sede.motivo_compras ?? '');
      if (escrito === null) return; // canceló: la respuesta queda como estaba
      if (escrito.trim() === '') {
        setError('Escribe el motivo por el que no se pide');
        return;
      }
      motivo = escrito.trim();
    }
    await accion('agotado_responder', {
      p_item: pedido.item_id,
      p_sede: sede.sede_id,
      p_respuesta: respuesta,
      p_motivo: motivo,
    });
  }

  const activas = cots.filter((c) => c.activa);
  const antiguas = cots.filter((c) => !c.activa);
  const conCosto = activas.filter((c) => c.disponible === true && c.costo_con_iva !== null);
  const mejor = conCosto.length ? Math.min(...conCosto.map((c) => c.costo_con_iva as number)) : null;
  const editable = ['por_cotizar', 'en_cotizacion', 'cotizado'].includes(pedido.estado);

  return (
    <div>
      <button type="button" style={boton} onClick={onVolver}>← Volver a pedidos</button>
      <h2 style={{ fontSize: 17, margin: '12px 0 4px' }}>
        Item {idVisible(pedido.item_id, pedido.provisional)} — {pedido.nombre_base}
      </h2>
      <div style={{ fontSize: 13, marginBottom: 12 }}>
        Línea: {pedido.linea ?? '-'} · IVA: {Math.round((pedido.iva ?? 0) * 100)}% ·{' '}
        Cantidad sugerida total: {pedido.cantidad_sugerida ?? '-'} {pedido.unidad_medida ?? ''} ·{' '}
        Estado: {ESTADOS[pedido.estado] ?? pedido.estado}
        {pedido.origen === 'manual' && (
          <> · Iniciado por Compras (sin agotado){pedido.provisional ? ' · ítem provisional (sin ID del ERP)' : ''}</>
        )}
        {pedido.ultima_orden_numero && (
          <> · Última orden: {textoUltimaOrden(pedido.ultima_orden_numero, pedido.ultima_orden_fecha, pedido.ultima_orden_cantidad)}</>
        )}
      </div>

      {error && <p style={{ fontSize: 13 }}>Error: {error}</p>}

      {pedido.estado === 'agotado_proveedor' && (
        <p style={{ fontSize: 13 }}>
          Todos los proveedores consultados respondieron sin disponibilidad.{' '}
          <button
            type="button"
            style={boton}
            onClick={async () => {
              const { error } = await supabase.rpc('pedido_reabrir', { p_org: organizacionId, p_item: pedido.item_id });
              if (error) setError(error.message);
              else onCambio();
            }}
          >
            Volver a cotizar
          </button>
        </p>
      )}

      {pedido.sedes.length === 0 ? (
        <p style={{ fontSize: 13 }}>
          Ninguna sede reportó este ítem como agotado: la gestión la inició Compras.
        </p>
      ) : (
        <>
        <h3 style={{ fontSize: 14, margin: '12px 0 4px' }}>Cantidad sugerida por sede</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Sede', 'Usuario', 'Cant. sugerida', 'Nota', 'Fecha solicitud', 'Respuesta Compras (manual)'].map((h) => (
                  <th key={h} style={{ ...celda, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pedido.sedes.map((s) => (
                <tr key={s.sede_id}>
                  <td style={celda}>{s.sede}</td>
                  <td style={celda}>{s.usuario ?? ''}</td>
                  <td style={celda}>{s.cantidad_sugerida ?? ''}</td>
                  <td style={{ ...celda, whiteSpace: 'pre-wrap', maxWidth: 260 }}>{s.notas ?? ''}</td>
                  <td style={celda}>{fecha(s.fecha)}</td>
                  <td style={celda}>
                    <select
                      value={s.respuesta_compras ?? ''}
                      aria-label={`Respuesta para ${s.sede}`}
                      style={{ ...campo, padding: 3, fontSize: 13 }}
                      onChange={(e) => responder(s, e.target.value)}
                    >
                      <option value="" disabled>Sin respuesta</option>
                      {RESPUESTAS.map((r) => (
                        <option key={r.valor} value={r.valor}>{r.texto}</option>
                      ))}
                    </select>
                    {s.respuesta_compras === 'no_se_pide' && s.motivo_compras && (
                      <div style={{ fontSize: 11, maxWidth: 220 }}>Motivo: {s.motivo_compras}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      <h3 style={{ fontSize: 14, margin: '16px 0 4px' }}>Cotizaciones por proveedor</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              {[
                'Proveedor', 'Referencia', 'Cant. a cotizar', 'Precio ERP', 'Costo unitario', 'IVA',
                'Costo con IVA', 'Disponible', 'Días entrega', 'Flete ($)', 'Und/caja', 'Observación',
                '', 'Ganador',
              ].map((h) => (
                <th key={h} style={{ ...celda, fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activas.map((c) => (
              <FilaCotizacion
                key={`${c.cotizacion_id}:${c.fecha_respuesta}:${c.seleccionado}:${c.cantidad_pedir}`}
                c={c}
                mejor={mejor}
                accion={accion}
                avisar={setError}
                editable={editable}
              />
            ))}
            {!cargando && activas.length === 0 && (
              <tr>
                <td style={celda} colSpan={14}>
                  Aún no hay cotizaciones. Crea una solicitud por proveedor (pestaña Por proveedor) o agrega un proveedor aquí abajo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, margin: '4px 0 0' }}>
        Flete vacío = no paga flete. La cantidad a pedir se define al elegir el ganador. Los ítems ganadores se agrupan en la pestaña “Órdenes de compra”.
      </p>

      {editable && (
        <AgregarProveedor pedido={pedido} activas={activas} accion={accion} />
      )}

      <label style={{ display: 'block', margin: '16px 0 4px', fontSize: 13 }}>
        <input type="checkbox" checked={historial} onChange={(e) => setHistorial(e.target.checked)} />{' '}
        Ver historial de cotizaciones anteriores
      </label>
      {historial && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Solicitud', 'Proveedor', 'Fecha', 'Costo unitario', 'Costo con IVA', 'Disponible', 'Días', 'Flete', 'Observación', 'Fue ganador'].map((h) => (
                  <th key={h} style={{ ...celda, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {antiguas.map((c) => (
                <tr key={c.cotizacion_id}>
                  <td style={celda}>{c.solicitud_numero}</td>
                  <td style={celda}>{c.proveedor}</td>
                  <td style={celda}>{fecha(c.fecha_respuesta ?? c.fecha_solicitud)}</td>
                  <td style={celda}>{pesos(c.costo_unitario)}</td>
                  <td style={celda}>{pesos(c.costo_con_iva)}</td>
                  <td style={celda}>{c.disponible === null ? '' : c.disponible ? 'Sí' : 'No'}</td>
                  <td style={celda}>{c.dias_entrega ?? ''}</td>
                  <td style={celda}>{pesos(c.flete)}</td>
                  <td style={celda}>{c.observacion ?? ''}</td>
                  <td style={celda}>{c.seleccionado ? 'Sí' : ''}</td>
                </tr>
              ))}
              {antiguas.length === 0 && (
                <tr><td style={celda} colSpan={10}>Sin historial</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilaCotizacion({
  c, mejor, accion, avisar, editable,
}: {
  c: Cotizacion;
  mejor: number | null;
  accion: Accion;
  avisar: (mensaje: string) => void;
  editable: boolean;
}) {
  const [costo, setCosto] = useState(c.costo_unitario?.toString() ?? '');
  const [disp, setDisp] = useState<'' | 'si' | 'no'>(c.disponible === null ? '' : c.disponible ? 'si' : 'no');
  const [dias, setDias] = useState(c.dias_entrega?.toString() ?? '');
  const [flete, setFlete] = useState(c.flete?.toString() ?? '');
  const [porCaja, setPorCaja] = useState(c.unidades_por_caja?.toString() ?? '');
  const [obs, setObs] = useState(c.observacion ?? '');
  const [cantPedir, setCantPedir] = useState(c.cantidad_pedir?.toString() ?? '');

  const conIva = costo === '' ? null : Math.round(Number(costo) * (1 + c.iva) * 100) / 100;
  const puedeElegir = c.disponible === true && c.costo_unitario !== null;
  const esMejor = mejor !== null && c.disponible === true && c.costo_con_iva === mejor;

  function guardar() {
    if (disp === '') {
      avisar('Indica si el proveedor tiene disponibilidad');
      return;
    }
    accion('cotizacion_guardar', {
      p_cotizacion: c.cotizacion_id,
      p_disponible: disp === 'si',
      p_costo: num(costo),
      p_dias: num(dias),
      p_flete: num(flete),
      p_observacion: obs.trim() || null,
      p_unidades_por_caja: num(porCaja),
    });
  }

  function guardarCantidadPedir() {
    const n = Number(cantPedir);
    if (!n || n <= 0 || n === c.cantidad_pedir) return;
    accion('cotizacion_elegir', { p_cotizacion: c.cotizacion_id, p_cantidad_pedir: n });
  }

  const entrada = { border: '1px solid #000', padding: 2, color: '#000', background: '#fff' } as const;

  return (
    <tr style={{ background: c.seleccionado ? '#e8e8e8' : '#fff' }}>
      <td style={celda}>
        {c.proveedor}
        <div style={{ fontSize: 11 }}>{c.solicitud_numero}</div>
      </td>
      <td style={celda}>{c.referencia ?? ''}</td>
      <td style={celda}>{c.cantidad_a_cotizar ?? ''}</td>
      <td style={celda}>{pesos(c.precio_erp)}</td>
      <td style={celda}>
        <input
          value={costo}
          inputMode="decimal"
          disabled={!editable}
          onChange={(e) => setCosto(soloNumero(e.target.value))}
          style={{ ...entrada, width: 90 }}
          aria-label={`Costo unitario ${c.proveedor}`}
        />
      </td>
      <td style={celda}>{Math.round(c.iva * 100)}%</td>
      <td style={{ ...celda, fontWeight: esMejor ? 700 : 400 }}>
        {conIva !== null ? pesos(conIva) : ''}
        {esMejor && <div style={{ fontSize: 11 }}>★ mejor costo</div>}
      </td>
      <td style={celda}>
        <select
          value={disp}
          disabled={!editable}
          onChange={(e) => setDisp(e.target.value as '' | 'si' | 'no')}
          style={{ ...entrada, padding: 3 }}
          aria-label={`Disponible ${c.proveedor}`}
        >
          <option value="" disabled>—</option>
          <option value="si">Sí</option>
          <option value="no">No</option>
        </select>
      </td>
      <td style={celda}>
        <input value={dias} inputMode="numeric" disabled={!editable}
          onChange={(e) => setDias(e.target.value.replace(/\D/g, ''))}
          style={{ ...entrada, width: 50 }} aria-label={`Días de entrega ${c.proveedor}`} />
      </td>
      <td style={celda}>
        <input value={flete} inputMode="decimal" disabled={!editable}
          onChange={(e) => setFlete(soloNumero(e.target.value))}
          style={{ ...entrada, width: 80 }} aria-label={`Flete ${c.proveedor}`} />
      </td>
      <td style={celda}>
        <input value={porCaja} inputMode="numeric" disabled={!editable}
          onChange={(e) => setPorCaja(e.target.value.replace(/\D/g, ''))}
          style={{ ...entrada, width: 60 }} aria-label={`Unidades por caja ${c.proveedor}`} />
      </td>
      <td style={celda}>
        <textarea value={obs} rows={2} disabled={!editable}
          onChange={(e) => setObs(e.target.value)}
          style={{ ...entrada, width: 160 }} aria-label={`Observación ${c.proveedor}`} />
        {c.fecha_respuesta && (
          <div style={{ fontSize: 11 }}>Resp.: {fecha(c.fecha_respuesta)}{c.respondio ? ` · ${c.respondio}` : ''}</div>
        )}
      </td>
      <td style={celda}>
        {editable && <button type="button" style={boton} onClick={guardar}>Guardar</button>}
      </td>
      <td style={celda}>
        <label>
          <input
            type="radio"
            name="ganador"
            checked={c.seleccionado}
            disabled={!puedeElegir || !editable}
            onChange={() => accion('cotizacion_elegir', { p_cotizacion: c.cotizacion_id })}
          />{' '}
          Elegir
        </label>
        {!puedeElegir && <div style={{ fontSize: 11 }}>Guarda costo y disponibilidad</div>}
        {c.seleccionado && (
          <div style={{ marginTop: 4 }}>
            Cant. a pedir:{' '}
            <input
              value={cantPedir}
              inputMode="numeric"
              onChange={(e) => setCantPedir(e.target.value.replace(/\D/g, ''))}
              onBlur={guardarCantidadPedir}
              style={{ ...entrada, width: 70 }}
              aria-label="Cantidad a pedir"
            />
            <div style={{ fontSize: 11 }}>{textoCajas(Number(cantPedir), c.unidades_por_caja)}</div>
            <button type="button" style={{ ...boton, marginTop: 4 }}
              onClick={() => accion('cotizacion_elegir', { p_cotizacion: c.cotizacion_id, p_elegir: false })}>
              Quitar elección
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

function AgregarProveedor({
  pedido, activas, accion,
}: {
  pedido: Pedido;
  activas: Cotizacion[];
  accion: Accion;
}) {
  const [nit, setNit] = useState('');
  const [nombre, setNombre] = useState('');
  const [referencia, setReferencia] = useState('');
  const [porCaja, setPorCaja] = useState('');

  const disponibles = pedido.proveedores.filter(
    (p) => !activas.some((c) => c.proveedor_id === p.proveedor_id),
  );

  function elegirExistente(id: string) {
    const p = pedido.proveedores.find((x) => String(x.proveedor_id) === id);
    if (!p) return;
    setNit(String(p.proveedor_id));
    setNombre(p.proveedor);
    setReferencia(p.codigo ?? '');
    setPorCaja(p.unidades_por_caja?.toString() ?? '');
  }

  async function agregar() {
    const ok = await accion('cotizacion_agregar_proveedor', {
      p_item: pedido.item_id,
      p_nit: Number(nit),
      p_nombre: nombre.trim() || null,
      p_referencia: referencia.trim() || null,
      p_unidades_por_caja: porCaja === '' ? null : Number(porCaja),
    });
    if (ok) {
      setNit(''); setNombre(''); setReferencia(''); setPorCaja('');
    }
  }

  return (
    <div style={{ border: '1px solid #000', padding: 12, marginTop: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Agregar proveedor a esta cotización</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Combobox
          opciones={disponibles.map((p) => ({
            valor: String(p.proveedor_id),
            texto: p.proveedor,
            detalle: [`NIT ${p.proveedor_id}`, p.codigo ? `ref ${p.codigo}` : ''].filter(Boolean).join(' · '),
          }))}
          valor={disponibles.some((p) => String(p.proveedor_id) === nit) ? nit : ''}
          onCambio={elegirExistente}
          etiqueta="Proveedor del ítem"
          placeholder="Proveedor ya vinculado al ítem…"
          ancho={280}
        />
        <span style={{ fontSize: 13 }}>o uno nuevo:</span>
        <input value={nit} inputMode="numeric" placeholder="NIT (sin guiones ni DV)"
          onChange={(e) => setNit(e.target.value.replace(/\D/g, ''))} style={{ ...campo, width: 170 }} />
        <input value={nombre} placeholder="Nombre del proveedor"
          onChange={(e) => setNombre(e.target.value)} style={{ ...campo, width: 220 }} />
        <input value={referencia} placeholder="Referencia (opcional)"
          onChange={(e) => setReferencia(e.target.value)} style={{ ...campo, width: 170 }} />
        <input value={porCaja} inputMode="numeric" placeholder="Und/caja (opcional)"
          onChange={(e) => setPorCaja(e.target.value.replace(/\D/g, ''))} style={{ ...campo, width: 140 }} />
        <button type="button" style={boton} disabled={!nit} onClick={agregar}>Agregar</button>
      </div>
      <p style={{ fontSize: 12, margin: '6px 0 0' }}>
        Si el NIT no existe se crea el proveedor (el nombre es obligatorio) y queda vinculado al ítem.
      </p>
    </div>
  );
}
