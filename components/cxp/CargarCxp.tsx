'use client';

import '@/styles/cxp.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AlertIcon, CheckCircleIcon } from '@/components/ui/icons';
import { fuenteExcelErp } from '@/lib/cxp/fuentes/excelErp';
import type { ResultadoLectura } from '@/lib/cxp/fuentes/tipos';
import { fechaHora, moneda } from './tipos';

interface Previa {
  total: number;
  nuevos: number;
  nuevos_excluidos: number;
  actualizados: number;
  sin_cambios: number;
  pagados_omitidos: number;
  pagados_saldo_distinto: { nombre: string; documento: string; saldo_pagado: number; saldo_erp: number }[];
  cambios_de_saldo: { nombre: string; documento: string; saldo_anterior: number; saldo_nuevo: number }[];
  ausentes: number;
  ausentes_lista: { nombre: string; documento: string; saldo: number }[];
  cruces: number;
  cruces_lista: { manual: string; factura: string | null; valor_manual: number; estado_manual: string; documento: string; saldo_erp: number }[];
  cos: { codigo: string; nombre: string | null; filas: number; sede_id: string | null }[];
  repetido: { fecha: string; archivo: string | null } | null;
}

interface Resultado {
  total: number;
  nuevos: number;
  actualizados: number;
  sin_cambios: number;
  pagados_omitidos: number;
  ausentes: number;
  excluidos: number;
  cruces?: number;
}

interface Importacion {
  id: string;
  fecha: string;
  archivo: string | null;
  usuario: string | null;
  filas: number;
  resumen: Partial<Resultado>;
}

type Fase = 'inicio' | 'leyendo' | 'vista' | 'guardando' | 'listo';

const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export default function CargarCxp({ organizacionId }: { organizacionId: string }) {
  const [supabase] = useState(() => createClient());
  const entrada = useRef<HTMLInputElement>(null);
  const [fase, setFase] = useState<Fase>('inicio');
  const [error, setError] = useState('');
  const [lectura, setLectura] = useState<ResultadoLectura | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [sedes, setSedes] = useState<{ id: string; nombre: string }[]>([]);
  const [mapeo, setMapeo] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [historial, setHistorial] = useState<Importacion[]>([]);

  const cargarHistorial = useCallback(async () => {
    const { data } = await supabase.rpc('cxp_importaciones_listar', { p_org: organizacionId, p_limit: 10 });
    setHistorial((data ?? []) as Importacion[]);
  }, [supabase, organizacionId]);

  useEffect(() => {
    cargarHistorial();
    supabase.rpc('cxp_listar_sedes', { p_org: organizacionId }).then(({ data }) => {
      setSedes((data ?? []) as { id: string; nombre: string }[]);
    });
  }, [supabase, organizacionId, cargarHistorial]);

  function reiniciar() {
    setFase('inicio');
    setError('');
    setLectura(null);
    setPrevia(null);
    setResultado(null);
    if (entrada.current) entrada.current.value = '';
  }

  async function alElegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setError('');
    setResultado(null);
    setFase('leyendo');
    try {
      const lec = await fuenteExcelErp.leer(archivo);
      setLectura(lec);
      if (lec.problemas.length > 0) {
        setPrevia(null);
        setFase('vista');
        return;
      }
      const { data, error } = await supabase.rpc('cxp_importar_previsualizar', {
        p_org: organizacionId,
        p_filas: lec.filas,
        p_hash: lec.hash,
      });
      if (error) throw new Error(error.message);
      const p = data as Previa;
      setPrevia(p);
      // Equivalencia C.O. ↔ sede: la guardada, o una sugerencia por nombre (Norte, Sur...). Se confirma al cargar.
      const m: Record<string, string> = {};
      for (const co of p.cos) {
        const sugerida = sedes.find((s) => co.nombre && norm(co.nombre).includes(norm(s.nombre)))?.id;
        m[co.codigo] = co.sede_id ?? sugerida ?? '';
      }
      setMapeo(m);
      setFase('vista');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer el archivo.');
      setFase('inicio');
    }
  }

  async function confirmar() {
    if (!lectura || !previa) return;
    setError('');
    setFase('guardando');
    try {
      // 1. Guarda las equivalencias que cambiaron (esto también corrige la sede de lo ya cargado)
      for (const co of previa.cos) {
        const elegida = mapeo[co.codigo] ?? '';
        if (elegida !== (co.sede_id ?? '') && (elegida !== '' || co.sede_id)) {
          const { error } = await supabase.rpc('cxp_co_sede_guardar', {
            p_org: organizacionId,
            p_codigo: co.codigo,
            p_nombre: co.nombre,
            p_sede: elegida || null,
          });
          if (error) throw new Error(error.message);
        }
      }
      // 2. Carga
      const { data, error } = await supabase.rpc('cxp_importar_confirmar', {
        p_org: organizacionId,
        p_filas: lectura.filas,
        p_archivo: lectura.archivo,
        p_hash: lectura.hash,
      });
      if (error) throw new Error(error.message);
      setResultado(data as Resultado);
      setFase('listo');
      cargarHistorial();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar.');
      setFase('vista');
    }
  }

  const ocupado = fase === 'leyendo' || fase === 'guardando';

  return (
    <div>
      <div className="ag-head">
        <h1 className="ag-title">Cargar archivo del ERP</h1>
        <p className="ag-lead">
          Sube el Excel que genera el ERP. Antes de guardar verás qué se agrega, qué cambia y qué se omite.
          Puedes volver a cargar el archivo cuantas veces quieras: lo que ya está no se duplica, y lo ya pagado no se vuelve a cargar.
        </p>
      </div>

      {error && (
        <div className="ui-alert ui-alert--error ag-alert" role="alert">
          <AlertIcon className="ui-alert__icon" />
          <span>{error}</span>
        </div>
      )}

      {(fase === 'inicio' || fase === 'leyendo') && (
        <div className="cxp-carga__caja">
          <label className="ui-label" htmlFor="cxp-archivo">Archivo Excel (.xlsx)</label>
          <input
            ref={entrada}
            id="cxp-archivo"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="cxp-carga__archivo"
            disabled={ocupado}
            onChange={alElegirArchivo}
          />
          {fase === 'leyendo' && <p className="ui-hint" role="status">Leyendo el archivo…</p>}
        </div>
      )}

      {fase !== 'inicio' && fase !== 'leyendo' && lectura && (
        <section className="cxp-carga__caja" aria-label="Archivo">
          <p>
            <strong>{lectura.archivo}</strong>
            {lectura.hoja && <> · hoja «{lectura.hoja}»</>} · {lectura.filas.length} fila(s)
          </p>
        </section>
      )}

      {fase === 'vista' && lectura && lectura.problemas.length > 0 && (
        <div className="ui-alert ui-alert--error ag-alert" role="alert">
          <AlertIcon className="ui-alert__icon" />
          <div>
            <p>No se puede cargar este archivo:</p>
            <ul>
              {lectura.problemas.slice(0, 20).map((p) => <li key={p}>{p}</li>)}
              {lectura.problemas.length > 20 && <li>…y {lectura.problemas.length - 20} más.</li>}
            </ul>
          </div>
        </div>
      )}

      {(fase === 'vista' || fase === 'guardando') && previa && (
        <>
          {previa.repetido && (
            <div className="ui-alert ag-alert" role="status">
              <AlertIcon className="ui-alert__icon" />
              <span>
                Este mismo archivo ya se cargó el {fechaHora(previa.repetido.fecha)}
                {previa.repetido.archivo ? ` (${previa.repetido.archivo})` : ''}. Volver a cargarlo no duplica nada.
              </span>
            </div>
          )}

          <div className="cxp-kpis" role="group" aria-label="Qué pasará al cargar">
            <Dato titulo="Nuevos" valor={previa.nuevos} detalle={previa.nuevos_excluidos ? `${previa.nuevos_excluidos} quedarán excluidos por regla` : 'se agregan a la cartera'} />
            <Dato titulo="Con cambios" valor={previa.actualizados} detalle="se actualiza lo que viene del ERP" />
            <Dato titulo="Sin cambios" valor={previa.sin_cambios} detalle="ya estaban iguales" />
            <Dato titulo="Ya pagados" valor={previa.pagados_omitidos} detalle="se omiten" />
            <Dato titulo="No vienen" valor={previa.ausentes} detalle="en cartera pero no en el archivo" tono={previa.ausentes ? 'warning' : undefined} />
          </div>

          {previa.cos.length > 0 && (
            <section className="cxp-carga__caja" aria-label="Centros de operación">
              <h2 className="cxp-carga__titulo">¿A qué sede corresponde cada C.O.?</h2>
              <p className="ui-hint">Se guarda al cargar y se usará en las próximas cargas.</p>
              <table className="cxp-carga__tabla">
                <thead><tr><th>C.O.</th><th>Descripción en el ERP</th><th>Filas</th><th>Sede</th></tr></thead>
                <tbody>
                  {previa.cos.map((co) => (
                    <tr key={co.codigo}>
                      <td>{co.codigo}</td>
                      <td>{co.nombre ?? ''}</td>
                      <td>{co.filas}</td>
                      <td>
                        <select
                          className="ui-input"
                          aria-label={`Sede del C.O. ${co.codigo}`}
                          value={mapeo[co.codigo] ?? ''}
                          onChange={(e) => setMapeo((m) => ({ ...m, [co.codigo]: e.target.value }))}
                        >
                          <option value="">Sin sede</option>
                          {sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <Detalle
            titulo={`Pendientes manuales que se cruzarán con el ERP (${previa.cruces})`}
            ayuda="Mismo NIT y misma factura del proveedor: el manual deja de contarse y el documento del ERP hereda lo anotado. Si el manual ya estaba pagado, el documento del ERP queda pagado."
            vacio="Ningún pendiente manual coincide con este archivo."
            cabecera={['Pendiente manual', 'Factura', 'Valor manual', 'Estado', 'Documento ERP', 'Saldo ERP']}
            filas={previa.cruces_lista.map((c) => [c.manual, c.factura ?? '', moneda(c.valor_manual), c.estado_manual, c.documento, moneda(c.saldo_erp)])}
          />
          <Detalle
            titulo={`Cambios de saldo (${previa.cambios_de_saldo.length})`}
            vacio="Ningún saldo cambió."
            cabecera={['Proveedor', 'Documento', 'Saldo anterior', 'Saldo nuevo']}
            filas={previa.cambios_de_saldo.map((c) => [c.nombre, c.documento, moneda(c.saldo_anterior), moneda(c.saldo_nuevo)])}
          />
          <Detalle
            titulo={`Ya pagados que vuelven a venir con otro saldo (${previa.pagados_saldo_distinto.length})`}
            ayuda="Se omiten igual. Revísalos: puede ser un pago parcial o un recibo aún sin hacer en el ERP."
            vacio="Ninguno."
            cabecera={['Proveedor', 'Documento', 'Saldo al pagar', 'Saldo en el archivo']}
            filas={previa.pagados_saldo_distinto.map((c) => [c.nombre, c.documento, moneda(c.saldo_pagado), moneda(c.saldo_erp)])}
          />
          <Detalle
            titulo={`En la cartera pero no en este archivo (${previa.ausentes})`}
            ayuda="No se toca nada: puede que ya se pagaron en el ERP o que el archivo sea parcial. Se pagan o se quitan a mano."
            vacio="Todo lo que está en la cartera viene en el archivo."
            cabecera={['Proveedor', 'Documento', 'Saldo']}
            filas={previa.ausentes_lista.map((c) => [c.nombre, c.documento, moneda(c.saldo)])}
          />

          <div className="cxp-modal__acciones">
            <button type="button" className="ui-btn" onClick={reiniciar} disabled={ocupado}>Cancelar</button>
            <button type="button" className="ui-btn ui-btn--primary" onClick={confirmar} disabled={ocupado}>
              {fase === 'guardando' ? 'Cargando…' : `Cargar ${previa.nuevos + previa.actualizados} cambio(s)`}
            </button>
          </div>
        </>
      )}

      {fase === 'vista' && lectura && lectura.problemas.length > 0 && (
        <div className="cxp-modal__acciones">
          <button type="button" className="ui-btn" onClick={reiniciar}>Elegir otro archivo</button>
        </div>
      )}

      {fase === 'listo' && resultado && (
        <div className="ui-alert ag-alert" role="status">
          <CheckCircleIcon className="ui-alert__icon" />
          <div>
            <p><strong>Carga lista.</strong></p>
            <p>
              {resultado.nuevos} nuevo(s) · {resultado.actualizados} actualizado(s) · {resultado.sin_cambios} sin cambios ·{' '}
              {resultado.pagados_omitidos} ya pagado(s) omitido(s). Excluidos por reglas: {resultado.excluidos}.
              {resultado.cruces ? ` ${resultado.cruces} pendiente(s) manual(es) cruzado(s) con el ERP.` : ''}
              {resultado.ausentes > 0 && ` ${resultado.ausentes} documento(s) de la cartera no venían en el archivo.`}
            </p>
            <button type="button" className="ui-btn ui-btn--sm" onClick={reiniciar}>Cargar otro archivo</button>
          </div>
        </div>
      )}

      <section className="cxp-carga__caja" aria-label="Cargas anteriores">
        <h2 className="cxp-carga__titulo">Cargas anteriores</h2>
        {historial.length === 0 ? (
          <p className="ui-hint">Todavía no se ha cargado ningún archivo.</p>
        ) : (
          <table className="cxp-carga__tabla">
            <thead><tr><th>Fecha</th><th>Archivo</th><th>Quién</th><th>Filas</th><th>Nuevos</th><th>Actualizados</th></tr></thead>
            <tbody>
              {historial.map((h) => (
                <tr key={h.id}>
                  <td>{fechaHora(h.fecha)}</td>
                  <td>{h.archivo ?? ''}</td>
                  <td>{h.usuario ?? ''}</td>
                  <td>{h.filas}</td>
                  <td>{h.resumen.nuevos ?? ''}</td>
                  <td>{h.resumen.actualizados ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Dato({ titulo, valor, detalle, tono }: { titulo: string; valor: number; detalle: string; tono?: 'warning' }) {
  return (
    <div className={tono ? `cxp-kpi cxp-kpi--${tono}` : 'cxp-kpi'}>
      <span className="cxp-kpi__titulo">{titulo}</span>
      <span className="cxp-kpi__valor">{valor}</span>
      <span className="cxp-kpi__cantidad">{detalle}</span>
    </div>
  );
}

function Detalle({
  titulo, ayuda, vacio, cabecera, filas,
}: {
  titulo: string;
  ayuda?: string;
  vacio: string;
  cabecera: string[];
  filas: string[][];
}) {
  return (
    <details className="cxp-carga__caja" open={filas.length > 0 && filas.length <= 8}>
      <summary className="cxp-carga__titulo">{titulo}</summary>
      {ayuda && <p className="ui-hint">{ayuda}</p>}
      {filas.length === 0 ? (
        <p className="ui-hint">{vacio}</p>
      ) : (
        <div className="ag-tablewrap" tabIndex={0}>
          <table className="cxp-carga__tabla">
            <thead><tr>{cabecera.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={i}>{f.map((v, j) => <td key={j}>{v}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}
