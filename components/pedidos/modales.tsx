'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LineaCompra, ProveedorCompra } from '@/components/pedidos/tipos';
import { ESTADO_OFERTA } from '@/components/pedidos/tipos';
import {
  avisosCompra, costoBase, costoConIva, esComparable, numeroDeTexto, ofertaDe, resumenCompra, variacionErp,
} from '@/components/pedidos/reglas';
import { analizarPegado } from '@/components/pedidos/pegado';
import type { CampoPegado, ConfigPegado, Separador } from '@/components/pedidos/ajustes';
import { pesos } from '@/components/pedidos/comun';
import { useMesa } from '@/components/pedidos/MesaContexto';
import { Badge, Modal, textoError } from '@/components/pedidos/ui';
import NuevoItem from '@/components/pedidos/NuevoItem';
import SelectorProductos from '@/components/pedidos/SelectorProductos';
import FormProveedorNuevo from '@/components/proveedores/FormProveedorNuevo';

/* ------------------------------------------------------------------ oferta de un proveedor para un producto */

export function ModalOferta({ linea, prov, onCerrar }: { linea: LineaCompra; prov: ProveedorCompra; onCerrar: () => void }) {
  const { llamar, permisos } = useMesa();
  const o = ofertaDe(linea, prov.proveedor_id);
  const [disponible, setDisponible] = useState(o?.estado !== 'no_disponible');
  const [costo, setCosto] = useState(typeof o?.costo === 'number' ? String(o.costo) : '');
  const [dias, setDias] = useState(o?.dias !== null && o?.dias !== undefined ? String(o.dias) : '');
  const [obs, setObs] = useState(o?.observacion ?? '');
  const c = numeroDeTexto(costo);
  const erp = o?.precio_erp ?? null;
  const v = erp && c ? c / erp - 1 : undefined;

  const guardar = async (asignar: boolean) => {
    if (disponible && (c === undefined || c <= 0)) return;
    const d = dias.trim() ? numeroDeTexto(dias) : undefined;
    const r = await llamar('oferta_guardar', {
      p_linea: linea.id, p_proveedor: prov.proveedor_id, p_costo: disponible ? c : null,
      p_dias: d ?? null, p_observacion: obs.trim() || null, p_disponible: disponible,
    }, asignar ? undefined : 'Oferta registrada');
    if (r.ok && asignar) {
      const a = await llamar('compra_asignar', { p_linea: linea.id, p_asignaciones: [{ proveedor_id: prov.proveedor_id, cantidad: linea.cantidad, motivo: 'manual' }] }, 'Oferta guardada y asignada');
      if (!a.ok) return;
    }
    if (r.ok) onCerrar();
  };

  return (
    <Modal titulo={`${prov.nombre} · ${linea.nombre}`} onCerrar={onCerrar}>
      <p className="mod-text mod-mt-0">
        Cantidad pedida: <b>{linea.cantidad}{linea.unidad ? ` ${linea.unidad}` : ''}</b>
        {erp !== null && <> · Precio ERP: <b>{pesos(erp)}</b></>}
        {o?.unidades_caja ? <> · Caja de {o.unidades_caja}</> : null}
        {!o && <> · <span className="ui-badge ui-badge--warning">sin oferta: se vinculará al guardar</span></>}
      </p>
      {erp !== null && disponible && (
        <div className="mod-flex mod-gap-2 mod-center mod-mb-2">
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => setCosto(String(erp))}>Cotiza lo mismo que el ERP</button>
          {v !== undefined && (Math.abs(v) < 0.0005
            ? <span className="ui-badge ui-badge--success">igual al ERP</span>
            : <span className={v > 0.05 ? 'ui-badge ui-badge--warning' : 'ui-badge'}>{v > 0 ? '+' : ''}{(v * 100).toFixed(1)}% vs ERP</span>)}
        </div>
      )}
      <div className="mod-flex mod-gap-3 mod-mb-2">
        <label><input type="radio" checked={disponible} onChange={() => setDisponible(true)} /> Lo tiene</label>
        <label><input type="radio" checked={!disponible} onChange={() => setDisponible(false)} /> No lo tiene</label>
      </div>
      {disponible && (
        <div className="pm-form-grid">
          <label className="ui-field">
            <span className="ui-label">Costo unitario (sin IVA) *</span>
            <input className="ui-input" inputMode="decimal" value={costo} autoFocus onFocus={(e) => e.currentTarget.select()} onChange={(e) => setCosto(e.target.value)} />
            {c !== undefined && c > 0 && <span className="mod-sub">Con IVA: {pesos(costoConIva(c, prov))}</span>}
          </label>
          <label className="ui-field">
            <span className="ui-label">Días de entrega</span>
            <input className="ui-input" inputMode="numeric" value={dias} onChange={(e) => setDias(e.target.value)} />
          </label>
        </div>
      )}
      <label className="ui-field mod-mt-2">
        <span className="ui-label">Observación</span>
        <input className="ui-input" value={obs} onChange={(e) => setObs(e.target.value)} />
      </label>
      <div className="pm-modal__acciones">
        <button type="button" className="ui-btn" onClick={onCerrar}>Cancelar</button>
        {disponible && permisos.ganadorEditar && (
          <button type="button" className="ui-btn" disabled={c === undefined || c <= 0} onClick={() => guardar(true)}>Guardar y asignar a este proveedor</button>
        )}
        <button type="button" className="ui-btn ui-btn--primary" disabled={disponible && (c === undefined || c <= 0)} onClick={() => guardar(false)}>Guardar oferta</button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ repartir una línea entre proveedores */

export function ModalRepartir({ linea, onCerrar }: { linea: LineaCompra; onCerrar: () => void }) {
  const { d, llamar } = useMesa();
  const [cant, setCant] = useState<Record<number, string>>(Object.fromEntries(linea.asignaciones.map((a) => [a.proveedor_id, String(a.cantidad)])));
  const ofertas = linea.ofertas.filter((o) => esComparable(o) && d.proveedores.some((p) => p.proveedor_id === o.proveedor_id));
  const suma = ofertas.reduce((s, o) => s + (numeroDeTexto(cant[o.proveedor_id] ?? '') || 0), 0);
  const diferencia = linea.cantidad - suma;

  const guardar = async () => {
    const asignaciones = ofertas
      .map((o) => ({ proveedor_id: o.proveedor_id, cantidad: numeroDeTexto(cant[o.proveedor_id] ?? '') || 0, motivo: 'manual' }))
      .filter((a) => a.cantidad > 0);
    const previas = linea.asignaciones;
    const r = await llamar('compra_asignar', { p_linea: linea.id, p_asignaciones: asignaciones }, 'Reparto guardado', {
      texto: `reparto de ${linea.nombre}`,
      accion: async () => { const x = await llamar('compra_asignar', { p_linea: linea.id, p_asignaciones: previas.map((a) => ({ ...a })) }); return { error: x.ok ? null : { message: 'No se pudo deshacer' } }; },
    });
    if (r.ok) onCerrar();
  };

  return (
    <Modal titulo={`Repartir ${linea.nombre}`} onCerrar={onCerrar}>
      <p className="mod-text mod-mt-0">Necesitas <b>{linea.cantidad}</b>. Reparte entre los proveedores que tienen oferta con costo (un producto puede dividirse).</p>
      <div className="mod-scroll">
        <table className="mod-table">
          <thead><tr><th>Proveedor</th><th>Costo con IVA</th><th>Días</th><th>Cantidad</th></tr></thead>
          <tbody>
            {ofertas.map((o) => {
              const p = d.proveedores.find((x) => x.proveedor_id === o.proveedor_id)!;
              return (
                <tr key={o.proveedor_id}>
                  <td>{p.nombre} <Badge tono={ESTADO_OFERTA[o.estado].tono}>{ESTADO_OFERTA[o.estado].texto}</Badge></td>
                  <td>{pesos(costoConIva(o.costo as number, p))}</td>
                  <td>{o.dias ?? '—'}</td>
                  <td>
                    <input className="ui-input ui-input--sm" style={{ width: 90 }} inputMode="decimal" value={cant[o.proveedor_id] ?? ''}
                      onChange={(e) => setCant({ ...cant, [o.proveedor_id]: e.target.value })} aria-label={`Cantidad para ${p.nombre}`} />
                  </td>
                </tr>
              );
            })}
            {ofertas.length === 0 && <tr><td colSpan={4}>Ningún proveedor tiene una oferta con costo para este producto.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className={diferencia === 0 ? 'mod-text' : diferencia < 0 ? 'mod-error' : 'mod-text'}>
        {diferencia === 0 ? '✓ Cantidad completa' : diferencia > 0 ? `Faltan ${diferencia} por asignar (no se podrá emitir hasta completar)` : `Te pasaste por ${-diferencia}`}
      </p>
      <div className="pm-modal__acciones">
        <button type="button" className="ui-btn" onClick={onCerrar}>Cancelar</button>
        <button type="button" className="ui-btn ui-btn--primary" disabled={diferencia < 0} onClick={guardar}>Guardar reparto</button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ pegar precios */

const ESTADO_FILA = { ok: 'Se registrará', sin_coincidencia: 'No se encontró el producto', sin_costo: 'Falta el costo', repetida: 'Repetida', sin_producto: 'Sin producto' } as const;
const CAMPOS: { valor: CampoPegado; texto: string }[] = [
  { valor: 'producto', texto: 'Producto (referencia, código o nombre)' },
  { valor: 'costo', texto: 'Costo unitario sin IVA' },
  { valor: 'dias', texto: 'Días de entrega' },
  { valor: 'observacion', texto: 'Observación' },
  { valor: 'referencia', texto: 'Referencia del proveedor (actualiza el catálogo)' },
  { valor: 'ignorar', texto: 'Ignorar' },
];
const SEPARADORES: { valor: Separador; texto: string }[] = [
  { valor: 'auto', texto: 'Automático' }, { valor: 'tab', texto: 'Tabulador (Excel)' }, { valor: 'espacio', texto: 'Espacio' },
  { valor: 'coma', texto: 'Coma ( , )' }, { valor: 'punto_coma', texto: 'Punto y coma ( ; )' }, { valor: 'barra', texto: 'Barra ( | )' }, { valor: 'otro', texto: 'Otro carácter…' },
];

export function ModalPegarPrecios({ prov, onCerrar }: { prov: ProveedorCompra; onCerrar: () => void }) {
  const { d, llamar, ajustes, cambiarAjustes, permisos, avisar, editable } = useMesa();
  const cfg = ajustes.pegado;
  const [texto, setTexto] = useState('');
  const [fleteTexto, setFleteTexto] = useState(typeof prov.flete_cotizado === 'number' ? String(prov.flete_cotizado) : '');
  const [actualizarRef, setActualizarRef] = useState(true);
  const [config, setConfig] = useState(false);
  const r = useMemo(() => analizarPegado(d, prov.proveedor_id, texto, cfg), [d, prov, texto, cfg]);
  const ok = r.filas.filter((f) => f.estado === 'ok');
  const fleteEscrito = fleteTexto.trim() !== '' ? numeroDeTexto(fleteTexto) : undefined;
  const fleteFinal = r.flete ?? fleteEscrito;
  const hayRef = cfg.columnas.includes('referencia');
  // Siempre hay una columna más disponible para agregar otro campo (hasta 8)
  const nCols = Math.min(8, Math.max(cfg.columnas.length + 1, r.columnas, 3));
  const ponerCfg = (c: Partial<ConfigPegado>) => cambiarAjustes({ pegado: { ...cfg, ...c } });
  const ponerColumna = (i: number, valor: CampoPegado) => {
    const cols = [...cfg.columnas];
    while (cols.length < nCols) cols.push('ignorar');
    // un campo único (producto/costo/días) no puede estar en dos columnas
    if (valor !== 'ignorar') cols.forEach((c, k) => { if (k !== i && c === valor) cols[k] = 'ignorar'; });
    cols[i] = valor;
    while (cols.length > 1 && cols[cols.length - 1] === 'ignorar') cols.pop();
    ponerCfg({ columnas: cols });
  };
  const ejemplo = d.lineas.filter((l) => ofertaDe(l, prov.proveedor_id)).slice(0, 2).map((l, k) => `${ofertaDe(l, prov.proveedor_id)?.referencia ?? l.codigo}   ${k === 0 ? '38.000   3' : '2.750'}`).join('\n');

  async function registrar() {
    if (ok.length > 0) {
      const x = await llamar('oferta_guardar_masivo', {
        p_compra: d.compra.id, p_proveedor: prov.proveedor_id,
        p_filas: ok.map((f) => ({ linea_id: f.lineaId, costo: f.costo, dias: f.dias ?? null, observacion: f.observacion ?? null })),
      });
      if (!x.ok) return;
    }
    if (fleteFinal !== undefined && fleteFinal >= 0) {
      const f = await llamar('compra_proveedor_flete', { p_compra: d.compra.id, p_proveedor: prov.proveedor_id, p_flete: fleteFinal });
      if (!f.ok) return;
    }
    if (hayRef && actualizarRef) {
      let hechas = 0;
      for (const f of ok.filter((y) => y.referencia)) {
        const a = await llamar('compra_actualizar_referencia', { p_linea: f.lineaId, p_proveedor: prov.proveedor_id, p_referencia: f.referencia, p_nombre: null, p_confirmar: true });
        if (!a.ok) return;
        hechas++;
      }
      if (hechas > 0) avisar('ok', `${hechas} referencia(s) del proveedor actualizadas en el catálogo`);
    }
    onCerrar();
  }

  return (
    <Modal titulo={`Pegar precios de ${prov.nombre}`} onCerrar={onCerrar} ancha>
      <p className="mod-text mod-mt-0">
        Pega lo que te envió el proveedor (correo, WhatsApp o filas de Excel). Tú decides cómo se separan las columnas y qué es cada una; se empatan con los productos de
        esta compra y ves el resultado antes de registrarlo. Una línea “flete 25000” fija el flete que cotizó.
      </p>
      <div className="mod-flex mod-gap-2 mod-center mod-wrap mod-mb-2">
        <button type="button" className="ui-btn ui-btn--sm" aria-expanded={config} onClick={() => setConfig(!config)}>⚙ Configurar columnas</button>
        <span className="mod-sub">
          Separador: {SEPARADORES.find((s) => s.valor === cfg.separador)?.texto}{cfg.separador === 'otro' ? ` “${cfg.otro}”` : ''} · Columnas: {cfg.columnas.map((c) => CAMPOS.find((x) => x.valor === c)?.texto.split(' (')[0]).join(' | ')}
        </span>
      </div>
      {config && (
        <div className="mod-card mod-mb-2">
          <div className="mod-flex mod-gap-3 mod-center mod-wrap mod-mb-2">
            <label className="mod-text">Las columnas se separan con{' '}
              <select className="ui-input ui-input--sm mod-auto" value={cfg.separador} onChange={(e) => ponerCfg({ separador: e.target.value as Separador })} aria-label="Separador">
                {SEPARADORES.map((s) => <option key={s.valor} value={s.valor}>{s.texto}</option>)}
              </select>
            </label>
            {cfg.separador === 'otro' && (
              <label className="mod-text">carácter{' '}
                <input className="ui-input ui-input--sm" style={{ width: 64 }} maxLength={3} value={cfg.otro} onChange={(e) => ponerCfg({ otro: e.target.value })} aria-label="Carácter separador" />
              </label>
            )}
            <label className="mod-flex mod-gap-1 mod-center mod-text"><input type="checkbox" checked={cfg.primeraEsEncabezado} onChange={(e) => ponerCfg({ primeraEsEncabezado: e.target.checked })} /> La primera línea es el encabezado</label>
          </div>
          <div className="mod-flex mod-gap-2 mod-wrap">
            {Array.from({ length: nCols }).map((_, i) => (
              <label key={i} className="mod-text">Columna {i + 1}
                <select className="ui-input ui-input--sm" style={{ display: 'block' }} value={cfg.columnas[i] ?? 'ignorar'} onChange={(e) => ponerColumna(i, e.target.value as CampoPegado)} aria-label={`Columna ${i + 1}`}>
                  {CAMPOS.map((c) => <option key={c.valor} value={c.valor}>{c.texto}</option>)}
                </select>
              </label>
            ))}
          </div>
          <p className="mod-sub mod-mb-0">Se recuerda en este navegador. Con “Espacio”, el nombre del producto puede llevar varias palabras: los números del final son las demás columnas.</p>
        </div>
      )}
      <textarea className="ui-input mod-mono" rows={6} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={ejemplo} aria-label="Precios pegados" autoFocus />
      <div className="mod-flex mod-gap-3 mod-center mod-wrap mod-mt-2">
        <label className="mod-text">Flete cotizado (opcional){' '}
          <input className="ui-input ui-input--sm" style={{ width: 120 }} inputMode="decimal" value={r.flete !== undefined ? String(r.flete) : fleteTexto} disabled={r.flete !== undefined}
            onChange={(e) => setFleteTexto(e.target.value)} aria-label="Flete cotizado" placeholder="según condiciones" />
        </label>
        <span className="mod-sub">{r.flete !== undefined ? 'Tomado de la línea “flete” pegada.' : 'Vacío = se calcula con las condiciones del proveedor; 0 = sin flete.'}</span>
        {hayRef && permisos.provCrear !== undefined && (
          <label className="mod-flex mod-gap-1 mod-center mod-text" title="Usa la misma lógica del catálogo de ítems (con sus permisos y advertencias)">
            <input type="checkbox" checked={actualizarRef} onChange={(e) => setActualizarRef(e.target.checked)} /> Actualizar la referencia del proveedor en el catálogo
          </label>
        )}
      </div>
      {r.filas.length > 0 && (
        <div className="mod-scroll mod-mt-2" style={{ maxHeight: 260 }}>
          <table className="mod-table">
            <thead><tr><th>Línea pegada</th><th>Producto</th><th>Costo (sin IVA)</th><th>Días</th>{cfg.columnas.includes('observacion') && <th>Observación</th>}{hayRef && <th>Referencia nueva</th>}<th>Resultado</th></tr></thead>
            <tbody>
              {r.filas.map((f, i) => (
                <tr key={i} className={f.estado === 'ok' ? undefined : 'is-faded'}>
                  <td>{f.original}</td><td>{f.producto ?? '—'}</td><td>{f.costo !== undefined ? pesos(f.costo) : '—'}</td><td>{f.dias ?? '—'}</td>
                  {cfg.columnas.includes('observacion') && <td>{f.observacion ?? ''}</td>}{hayRef && <td>{f.referencia ?? ''}</td>}<td>{ESTADO_FILA[f.estado]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="pm-modal__acciones">
        <span className="mod-sub">{r.filas.length > ok.length ? `${r.filas.length - ok.length} línea(s) no se registrarán.` : ''}</span>
        <button type="button" className="ui-btn" onClick={onCerrar}>Cancelar</button>
        <button type="button" className="ui-btn ui-btn--primary" disabled={!editable || (ok.length === 0 && fleteFinal === undefined)} onClick={registrar}>
          Registrar {ok.length} precio(s){fleteFinal !== undefined ? ' y el flete' : ''}
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ emitir órdenes */

export function ModalEmitir({ onCerrar, onEmitidas }: { onCerrar: () => void; onEmitidas: () => void }) {
  const { d, llamar } = useMesa();
  const res = resumenCompra(d);
  const avisos = avisosCompra(d);
  const errores = avisos.filter((a) => a.nivel === 'error');
  const [dejarFuera, setDejarFuera] = useState(false);
  const bloqueado = errores.length > 0 || res.proveedores.length === 0 || (res.sinAsignar.length > 0 && !dejarFuera);

  return (
    <Modal titulo={`Emitir ${res.proveedores.length} orden(es) de compra`} onCerrar={onCerrar} ancha>
      <div className="mod-scroll mod-mb-2">
        <table className="mod-table">
          <thead><tr><th>Proveedor</th><th>Productos</th><th>Subtotal</th><th>IVA</th><th>Flete</th><th>Total</th></tr></thead>
          <tbody>
            {res.proveedores.map((r) => (
              <tr key={r.proveedor.proveedor_id}>
                <td>{r.proveedor.nombre}</td><td>{r.lineas.length}</td><td>{pesos(r.subtotal)}</td><td>{pesos(r.iva)}</td>
                <td>{pesos(r.flete)}</td><td><b>{pesos(r.total)}</b></td>
              </tr>
            ))}
            <tr><td colSpan={5}><b>Total</b></td><td><b>{pesos(res.total)}</b></td></tr>
          </tbody>
        </table>
      </div>
      {avisos.length > 0 && (
        <ul className="mod-text mod-mb-2">
          {avisos.map((a, i) => <li key={i} style={a.nivel === 'error' ? { color: 'var(--color-danger, #b91c1c)', fontWeight: 600 } : undefined}>{a.texto}</li>)}
        </ul>
      )}
      {res.sinAsignar.length > 0 && (
        <label className="mod-flex mod-gap-2 mod-center mod-mb-2">
          <input type="checkbox" checked={dejarFuera} onChange={(e) => setDejarFuera(e.target.checked)} />
          Dejar fuera {res.sinAsignar.length} producto(s) sin asignar (sus agotados vuelven a pendientes)
        </label>
      )}
      <p className="mod-sub">Al emitir, la compra queda “Ordenada” y ya no se puede modificar. Cada orden queda con el motivo de la decisión para consulta interna.</p>
      <div className="pm-modal__acciones">
        {errores.length > 0 && <span className="mod-error">Corrige los errores marcados antes de emitir.</span>}
        <button type="button" className="ui-btn" onClick={onCerrar}>Volver</button>
        <button type="button" className="ui-btn ui-btn--primary" disabled={bloqueado}
          onClick={async () => {
            const r = await llamar('compra_emitir_ordenes', { p_compra: d.compra.id, p_dejar_fuera: dejarFuera },
              (x) => `Se emitieron ${((x as { ordenes: unknown[] }).ordenes ?? []).length} orden(es)`);
            if (r.ok) onEmitidas();
          }}>
          Emitir órdenes
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ consultar a un proveedor */

interface ProvBusqueda {
  proveedor_id: number; nombre: string; documento: string; cubre: number; total: number; consultado: boolean;
  pedido_minimo: number | null; flete_gratis_desde: number | null; dias_tipicos: number | null;
}

export function ModalConsultar({ onCerrar }: { onCerrar: () => void }) {
  const { d, supabase, organizacionId, llamar, permisos } = useMesa();
  const [texto, setTexto] = useState('');
  const [lista, setLista] = useState<ProvBusqueda[]>([]);
  const [error, setError] = useState('');
  const [creando, setCreando] = useState(false);
  const [traer, setTraer] = useState(d.lineas.length === 0);
  const [cantTraer, setCantTraer] = useState('1');

  const buscar = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('compra_buscar_proveedores', {
      p_org: organizacionId, p_compra: d.compra.id, p_busqueda: texto.trim() || null, p_limit: 50,
    });
    if (e) setError(textoError(e));
    else setLista(((data ?? []) as ProvBusqueda[]).filter((p) => !p.consultado));
  }, [supabase, organizacionId, d.compra.id, texto]);

  useEffect(() => {
    const t = setTimeout(buscar, 250);
    return () => clearTimeout(t);
  }, [buscar, d.proveedores.length]);

  async function consultar(proveedorId: number, nombre: string) {
    const cant = numeroDeTexto(cantTraer);
    if (traer && (cant === undefined || cant <= 0)) { setError('Escribe una cantidad por defecto mayor que cero.'); return false; }
    const r = await llamar('compra_consultar_proveedor', {
      p_compra: d.compra.id, p_proveedor: proveedorId, p_con_catalogo: traer, p_cantidad: traer ? cant : null,
    }, (n) => `Se consultará a ${nombre}${Number(n) > 0 ? ` y se trajeron ${n} producto(s) de su catálogo` : ''}`);
    return r.ok;
  }

  return (
    <Modal titulo="Consultar a un proveedor" onCerrar={onCerrar} ancha>
      <p className="mod-text mod-mt-0">Ordenados por cuántos productos de esta compra pueden suministrar. Al consultarlo, sus precios de lista aparecen como referencia.</p>
      <div className="mod-flex mod-gap-3 mod-center mod-wrap mod-mb-2">
        <input className="ui-input ui-input--sm" style={{ minWidth: 260 }} placeholder="Buscar proveedor por nombre o documento" value={texto}
          onChange={(e) => setTexto(e.target.value)} autoFocus aria-label="Buscar proveedor" />
        <label className="mod-flex mod-gap-1 mod-center mod-text">
          <input type="checkbox" checked={traer} onChange={(e) => setTraer(e.target.checked)} /> Traer también todo su catálogo (lo que aún no está en la compra)
        </label>
        {traer && (
          <label className="mod-text">con cantidad{' '}
            <input className="ui-input ui-input--sm" style={{ width: 80 }} inputMode="decimal" value={cantTraer} onChange={(e) => setCantTraer(e.target.value)} aria-label="Cantidad por defecto del catálogo" />
          </label>
        )}
      </div>
      {error && <p className="mod-error">{error}</p>}
      <div className="pm-lista mod-mb-2">
        <table className="mod-table">
          <thead><tr><th>Proveedor</th><th>Cubre</th><th>Condiciones</th><th /></tr></thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.proveedor_id}>
                <td><b>{p.nombre}</b><span className="pm-chico">{p.documento}</span></td>
                <td>{p.cubre} de {p.total}</td>
                <td className="mod-sub">
                  {p.pedido_minimo !== null && <>Mínimo {pesos(p.pedido_minimo)}. </>}
                  {p.flete_gratis_desde !== null && <>Flete gratis desde {pesos(p.flete_gratis_desde)}. </>}
                  {p.dias_tipicos !== null && <>{p.dias_tipicos} d.</>}
                </td>
                <td><button type="button" className="ui-btn ui-btn--sm ui-btn--primary" onClick={async () => { if (await consultar(p.proveedor_id, p.nombre)) onCerrar(); }}>Consultar</button></td>
              </tr>
            ))}
            {lista.length === 0 && <tr><td colSpan={4}>Ya consultaste a todos los proveedores que coinciden.</td></tr>}
          </tbody>
        </table>
      </div>
      {creando ? (
        <div className="mod-card">
          <h3 className="mod-h3 mod-mt-0">Nuevo proveedor (se consulta de una vez)</h3>
          <FormProveedorNuevo supabase={supabase} organizacionId={organizacionId} onCancelar={() => setCreando(false)}
            onCreado={async (id, nombre) => { if (await consultar(id, nombre)) onCerrar(); else setCreando(false); }} />
        </div>
      ) : permisos.provCrear && <button type="button" className="ui-btn ui-btn--sm" onClick={() => setCreando(true)}>+ Crear proveedor nuevo</button>}
    </Modal>
  );
}

/* ------------------------------------------------------------------ agregar productos a la compra */

export function ModalAgregarProducto({ onCerrar }: { onCerrar: () => void }) {
  const { d, supabase, organizacionId, llamar, permisos } = useMesa();
  const [creando, setCreando] = useState(false);
  const [lineasCat, setLineasCat] = useState<string[]>([]);

  useEffect(() => {
    supabase.rpc('compra_lineas_disponibles', { p_org: organizacionId, p_proveedor: null })
      .then(({ data }) => setLineasCat(((data ?? []) as (string | { linea: string })[]).map((x) => (typeof x === 'string' ? x : x.linea))));
  }, [supabase, organizacionId]);

  return (
    <Modal titulo="Agregar productos a la compra" onCerrar={onCerrar} ancha>
      <p className="mod-text mod-mt-0">No tiene que haber sido reportado como agotado: cualquier ítem del catálogo se puede comprar. Filtra, elige varios (o todos los resultados) y se agregan de una vez.</p>
      {creando ? (
        <NuevoItem supabase={supabase} organizacionId={organizacionId} lineas={lineasCat} permisos={permisos} onCancelar={() => setCreando(false)}
          onCreado={async (id) => { setCreando(false); const r = await llamar('compra_agregar_items', { p_compra: d.compra.id, p_items: [{ item_id: id, sin_agotados: true }] }, 'Ítem creado y agregado'); if (r.ok) onCerrar(); }} />
      ) : (
        <>
          <SelectorProductos supabase={supabase} organizacionId={organizacionId} compraId={d.compra.id} textoAceptar={(n) => `Agregar ${n} producto(s)`}
            onAceptar={async (items) => { const r = await llamar('compra_agregar_items', { p_compra: d.compra.id, p_items: items.map((i) => ({ ...i, sin_agotados: true })) }, `${items.length} producto(s) agregados`); if (r.ok) onCerrar(); }} />
          {(permisos.itemsCrear || permisos.crear) && (
            <div className="mod-flex mod-gap-2 mod-center mod-mt-2"><span className="mod-sub">¿No existe?</span><button type="button" className="ui-btn ui-btn--sm" onClick={() => setCreando(true)}>Crear ítem nuevo</button></div>
          )}
        </>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ catálogo de un proveedor */

export function ModalCatalogoProveedor({ prov, onCerrar }: { prov: ProveedorCompra; onCerrar: () => void }) {
  const { d, supabase, organizacionId, llamar } = useMesa();
  return (
    <Modal titulo={`Catálogo de ${prov.nombre}`} onCerrar={onCerrar} ancha>
      <p className="mod-text mod-mt-0">Productos que este proveedor suministra y aún no están en una compra. Elige varios (o todos los resultados de una línea) y entran con su precio del ERP.</p>
      <SelectorProductos supabase={supabase} organizacionId={organizacionId} compraId={d.compra.id} proveedorFijo={prov.proveedor_id}
        textoAceptar={(n) => `Agregar ${n} producto(s)`}
        onAceptar={async (items) => { const r = await llamar('compra_agregar_items', { p_compra: d.compra.id, p_items: items.map((i) => ({ ...i, sin_agotados: true })) }, `${items.length} producto(s) agregados`); if (r.ok) onCerrar(); }} />
    </Modal>
  );
}

export { costoBase, variacionErp };
