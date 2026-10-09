'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import Combobox from '@/components/Combobox';
import { useTiempoReal } from '@/components/useTiempoReal';
import {
  fecha, idVisible, InsigniaEstado, pesos, RESPUESTAS, TABLAS_PEDIDOS, textoCajas, textoUltimaOrden, type Pedido, type SedePedido,
} from '@/components/pedidos/comun';
import TablaExcel from '@/components/TablaExcel';

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
      <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={onVolver}>← Volver a pedidos</button>
      <h2 className="mod-h2 mod-mt-3 mod-mb-1">
        Item {idVisible(pedido.item_id, pedido.provisional, pedido.codigo)} — {pedido.nombre_base}
      </h2>
      <div className="mod-text mod-mb-3">
        Línea: {pedido.linea ?? '-'} · IVA de venta: {Math.round((pedido.iva ?? 0) * 100)}% ·{' '}
        Cantidad sugerida total: {pedido.cantidad_sugerida ?? '-'} {pedido.unidad_medida ?? ''} ·{' '}
        Estado: <InsigniaEstado estado={pedido.estado} />
        {pedido.origen === 'manual' && (
          <> · Iniciado por Compras (sin agotado){pedido.provisional ? ' · ítem provisional (sin ID del ERP)' : ''}</>
        )}
        {pedido.ultima_orden_numero && (
          <> · Última orden: {textoUltimaOrden(pedido.ultima_orden_numero, pedido.ultima_orden_fecha, pedido.ultima_orden_cantidad)}</>
        )}
      </div>

      {error && <p className="mod-text">Error: {error}</p>}

      {pedido.estado === 'agotado_proveedor' && (
        <p className="mod-text">
          Todos los proveedores consultados respondieron sin disponibilidad.{' '}
          <button
            type="button"
            className="ui-btn ui-btn--sm"
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
        <p className="mod-text">
          Ninguna sede reportó este ítem como agotado: la gestión la inició Compras.
        </p>
      ) : (
        <>
        <h3 className="mod-h3 mod-mt-3 mod-mb-1">Cantidad sugerida por sede</h3>
        <TablaExcel clave="detallecotizacion-1" etiqueta="Tabla de cotización"><table className="mod-table mod-table--auto">
            <thead>
              <tr>
                {['Sede', 'Usuario', 'Cant. sugerida', 'Nota', 'Fecha solicitud', 'Respuesta Compras (manual)'].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pedido.sedes.map((s) => (
                <tr key={s.sede_id}>
                  <td>{s.sede}</td>
                  <td>{s.usuario ?? ''}</td>
                  <td>{s.cantidad_sugerida ?? ''}</td>
                  <td className="mod-prewrap" style={{ maxWidth: 260 }}>{s.notas ?? ''}</td>
                  <td>{fecha(s.fecha)}</td>
                  <td>
                    <select
                      value={s.respuesta_compras ?? ''}
                      aria-label={`Respuesta para ${s.sede}`}
                      className="ui-input ui-input--sm mod-auto"
                      onChange={(e) => responder(s, e.target.value)}
                    >
                      <option value="" disabled>Sin respuesta</option>
                      {RESPUESTAS.map((r) => (
                        <option key={r.valor} value={r.valor}>{r.texto}</option>
                      ))}
                    </select>
                    {s.respuesta_compras === 'no_se_pide' && s.motivo_compras && (
                      <div className="mod-sub" style={{ maxWidth: 220 }}>Motivo: {s.motivo_compras}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></TablaExcel>
        </>
      )}

      <h3 className="mod-h3 mod-mt-4 mod-mb-1">Cotizaciones por proveedor</h3>
      <TablaExcel clave="detallecotizacion-2" etiqueta="Tabla de cotización"><table className="mod-table">
          <thead>
            <tr>
              {[
                'Proveedor', 'Referencia', 'Cant. a cotizar', 'Precio ERP', 'Costo unitario', 'IVA',
                'Costo con IVA', 'Disponible', 'Días entrega', 'Flete ($)', 'Und/caja', 'Observación',
                '', 'Ganador',
              ].map((h) => (
                <th key={h}>{h}</th>
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
                <td colSpan={14}>
                  Aún no hay cotizaciones. Crea una solicitud por proveedor (pestaña Por proveedor) o agrega un proveedor aquí abajo.
                </td>
              </tr>
            )}
          </tbody>
        </table></TablaExcel>
      <p className="mod-sub mod-mt-1 mod-mb-0">
        Flete vacío = no paga flete. La cantidad a pedir se define al elegir el ganador. Los ítems ganadores se agrupan en la pestaña “Órdenes de compra”.
      </p>

      {editable && (
        <AgregarProveedor pedido={pedido} activas={activas} accion={accion} />
      )}

      <label className="mod-block mod-mt-4 mod-mb-1 mod-text">
        <input type="checkbox" checked={historial} onChange={(e) => setHistorial(e.target.checked)} />{' '}
        Ver historial de cotizaciones anteriores
      </label>
      {historial && (
        <TablaExcel clave="detallecotizacion-3" etiqueta="Tabla de cotización"><table className="mod-table mod-table--auto">
            <thead>
              <tr>
                {['Solicitud', 'Proveedor', 'Fecha', 'Costo unitario', 'Costo con IVA', 'Disponible', 'Días', 'Flete', 'Observación', 'Fue ganador'].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {antiguas.map((c) => (
                <tr key={c.cotizacion_id}>
                  <td>{c.solicitud_numero}</td>
                  <td>{c.proveedor}</td>
                  <td>{fecha(c.fecha_respuesta ?? c.fecha_solicitud)}</td>
                  <td>{pesos(c.costo_unitario)}</td>
                  <td>{pesos(c.costo_con_iva)}</td>
                  <td>{c.disponible === null ? '' : <span className={c.disponible ? 'ui-badge ui-badge--success' : 'ui-badge ui-badge--danger'}>{c.disponible ? 'Sí' : 'No'}</span>}</td>
                  <td>{c.dias_entrega ?? ''}</td>
                  <td>{pesos(c.flete)}</td>
                  <td>{c.observacion ?? ''}</td>
                  <td>{c.seleccionado ? 'Sí' : ''}</td>
                </tr>
              ))}
              {antiguas.length === 0 && (
                <tr><td colSpan={10}>Sin historial</td></tr>
              )}
            </tbody>
          </table></TablaExcel>
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
  // IVA de COMPRA (del proveedor); se puede ajustar si el proveedor informa otra tarifa
  const [ivaPct, setIvaPct] = useState(String(Math.round(c.iva * 10000) / 100));
  const ivaNum = ivaPct.trim() === '' ? NaN : Number(ivaPct.replace(',', '.')) / 100;
  const ivaValido = Number.isFinite(ivaNum) && ivaNum >= 0 && ivaNum <= 1;

  const conIva = costo === '' || !ivaValido ? null : Math.round(Number(costo) * (1 + ivaNum) * 100) / 100;
  const puedeElegir = c.disponible === true && c.costo_unitario !== null;
  const esMejor = mejor !== null && c.disponible === true && c.costo_con_iva === mejor;

  function guardar() {
    if (disp === '') {
      avisar('Indica si el proveedor tiene disponibilidad');
      return;
    }
    if (!ivaValido) {
      avisar('Escribe el IVA como porcentaje entre 0 y 100');
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
      p_iva: ivaNum,
    });
  }

  function guardarCantidadPedir() {
    const n = Number(cantPedir);
    if (!n || n <= 0 || n === c.cantidad_pedir) return;
    accion('cotizacion_elegir', { p_cotizacion: c.cotizacion_id, p_cantidad_pedir: n });
  }

  return (
    <tr className={c.seleccionado ? 'is-selected' : undefined}>
      <td>
        {c.proveedor}
        <div className="mod-sub">{c.solicitud_numero}</div>
      </td>
      <td>{c.referencia ?? ''}</td>
      <td>{c.cantidad_a_cotizar ?? ''}</td>
      <td>{pesos(c.precio_erp)}</td>
      <td>
        <input
          value={costo}
          inputMode="decimal"
          disabled={!editable}
          onChange={(e) => setCosto(soloNumero(e.target.value))}
          className="ui-input ui-input--sm mod-cell-input" style={{ width: 90 }}
          aria-label={`Costo unitario ${c.proveedor}`}
        />
      </td>
      <td>
        <input
          value={ivaPct}
          inputMode="decimal"
          disabled={!editable}
          onChange={(e) => setIvaPct(soloNumero(e.target.value))}
          className="ui-input ui-input--sm mod-cell-input" style={{ width: 52 }}
          aria-label={`IVA de compra ${c.proveedor}`}
        />
        %
      </td>
      <td className={esMejor ? 'is-strong' : undefined}>
        {conIva !== null ? pesos(conIva) : ''}
        {esMejor && <div className="mod-sub mod-star">★ mejor costo</div>}
      </td>
      <td>
        <select
          value={disp}
          disabled={!editable}
          onChange={(e) => setDisp(e.target.value as '' | 'si' | 'no')}
          className="ui-input ui-input--sm mod-cell-input"
          aria-label={`Disponible ${c.proveedor}`}
        >
          <option value="" disabled>—</option>
          <option value="si">Sí</option>
          <option value="no">No</option>
        </select>
      </td>
      <td>
        <input value={dias} inputMode="numeric" disabled={!editable}
          onChange={(e) => setDias(e.target.value.replace(/\D/g, ''))}
          className="ui-input ui-input--sm mod-cell-input" style={{ width: 50 }} aria-label={`Días de entrega ${c.proveedor}`} />
      </td>
      <td>
        <input value={flete} inputMode="decimal" disabled={!editable}
          onChange={(e) => setFlete(soloNumero(e.target.value))}
          className="ui-input ui-input--sm mod-cell-input" style={{ width: 80 }} aria-label={`Flete ${c.proveedor}`} />
      </td>
      <td>
        <input value={porCaja} inputMode="numeric" disabled={!editable}
          onChange={(e) => setPorCaja(e.target.value.replace(/\D/g, ''))}
          className="ui-input ui-input--sm mod-cell-input" style={{ width: 60 }} aria-label={`Unidades por caja ${c.proveedor}`} />
      </td>
      <td>
        <textarea value={obs} rows={2} disabled={!editable}
          onChange={(e) => setObs(e.target.value)}
          className="ui-input ui-input--sm mod-cell-input" style={{ width: 160 }} aria-label={`Observación ${c.proveedor}`} />
        {c.fecha_respuesta && (
          <div className="mod-sub">Resp.: {fecha(c.fecha_respuesta)}{c.respondio ? ` · ${c.respondio}` : ''}</div>
        )}
      </td>
      <td>
        {editable && <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" onClick={guardar}>Guardar</button>}
      </td>
      <td>
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
        {!puedeElegir && <div className="mod-sub">Guarda costo y disponibilidad</div>}
        {c.seleccionado && (
          <div className="mod-mt-1">
            Cant. a pedir:{' '}
            <input
              value={cantPedir}
              inputMode="numeric"
              onChange={(e) => setCantPedir(e.target.value.replace(/\D/g, ''))}
              onBlur={guardarCantidadPedir}
              className="ui-input ui-input--sm mod-cell-input" style={{ width: 70 }}
              aria-label="Cantidad a pedir"
            />
            <div className="mod-sub">{textoCajas(Number(cantPedir), c.unidades_por_caja)}</div>
            <button type="button" className="ui-btn ui-btn--sm mod-mt-1"
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
  const [provId, setProvId] = useState<number | null>(null);
  const [tipo, setTipo] = useState('NIT');
  const [documento, setDocumento] = useState('');
  const [nombre, setNombre] = useState('');
  const [referencia, setReferencia] = useState('');
  const [porCaja, setPorCaja] = useState('');

  const disponibles = pedido.proveedores.filter(
    (p) => !activas.some((c) => c.proveedor_id === p.proveedor_id),
  );

  function elegirExistente(id: string) {
    const p = pedido.proveedores.find((x) => String(x.proveedor_id) === id);
    if (!p) return;
    const [t, ...resto] = (p.documento ?? '').split(' ');
    setProvId(p.proveedor_id);
    setTipo(t || 'NIT');
    setDocumento(resto.join(' '));
    setNombre(p.proveedor);
    setReferencia(p.codigo ?? '');
    setPorCaja(p.unidades_por_caja?.toString() ?? '');
  }

  async function agregar() {
    const ok = await accion('cotizacion_agregar_proveedor', {
      p_item: pedido.item_id,
      p_proveedor: provId,
      p_tipo_documento: tipo,
      p_documento: provId ? null : documento.trim() || null,
      p_nombre: nombre.trim() || null,
      p_referencia: referencia.trim() || null,
      p_unidades_por_caja: porCaja === '' ? null : Number(porCaja),
    });
    if (ok) {
      setProvId(null); setDocumento(''); setNombre(''); setReferencia(''); setPorCaja('');
    }
  }

  return (
    <div className="mod-card mod-mt-4">
      <div className="mod-semibold mod-mb-2 mod-md">Agregar proveedor a esta cotización</div>
      <div className="mod-flex mod-gap-2 mod-wrap mod-center">
        <Combobox
          opciones={disponibles.map((p) => ({
            valor: String(p.proveedor_id),
            texto: p.proveedor,
            detalle: [p.documento, p.codigo ? `ref ${p.codigo}` : ''].filter(Boolean).join(' · '),
          }))}
          valor={provId !== null && disponibles.some((p) => p.proveedor_id === provId) ? String(provId) : ''}
          onCambio={elegirExistente}
          etiqueta="Proveedor del ítem"
          placeholder="Proveedor ya vinculado al ítem…"
          ancho={280}
        />
        <span className="mod-text">o uno nuevo:</span>
        <select value={tipo} onChange={(e) => { setTipo(e.target.value); setProvId(null); }} className="ui-input ui-input--sm mod-auto" aria-label="Tipo de documento">
          {['NIT', 'CC', 'CE', 'PAS', 'OTRO'].map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <input value={documento} placeholder="Documento (sin guiones ni DV)"
          onChange={(e) => { setDocumento(e.target.value.replace(/[^A-Za-z0-9]/g, '')); setProvId(null); }} className="ui-input ui-input--sm" style={{ width: 190 }} />
        <input value={nombre} placeholder="Nombre del proveedor"
          onChange={(e) => setNombre(e.target.value)} className="ui-input ui-input--sm" style={{ width: 220 }} />
        <input value={referencia} placeholder="Referencia (opcional)"
          onChange={(e) => setReferencia(e.target.value)} className="ui-input ui-input--sm" style={{ width: 170 }} />
        <input value={porCaja} inputMode="numeric" placeholder="Und/caja (opcional)"
          onChange={(e) => setPorCaja(e.target.value.replace(/\D/g, ''))} className="ui-input ui-input--sm" style={{ width: 140 }} />
        <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" disabled={!provId && !documento} onClick={agregar}>Agregar</button>
      </div>
      <p className="mod-sub mod-mt-2 mod-mb-0">
        Si el documento no existe se crea el proveedor (el nombre es obligatorio) y queda vinculado al ítem.
      </p>
    </div>
  );
}
