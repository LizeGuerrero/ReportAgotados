'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LineaCompra, ProveedorCompra } from '@/components/pedidos/tipos';
import { ESTADO_OFERTA } from '@/components/pedidos/tipos';
import {
  avisosCompra, costoBase, costoConIva, esComparable, numeroDeTexto, ofertaDe, resumenCompra, variacionErp,
} from '@/components/pedidos/reglas';
import { analizarPegado } from '@/components/pedidos/pegado';
import { pesos } from '@/components/pedidos/comun';
import { useMesa } from '@/components/pedidos/MesaContexto';
import { Badge, Modal, textoError } from '@/components/pedidos/ui';
import NuevoItem from '@/components/pedidos/NuevoItem';
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

const ESTADO_FILA = { ok: 'Se registrará', sin_coincidencia: 'No se encontró el producto', sin_costo: 'Falta el costo', repetida: 'Repetida' } as const;

export function ModalPegarPrecios({ prov, onCerrar }: { prov: ProveedorCompra; onCerrar: () => void }) {
  const { d, llamar } = useMesa();
  const [texto, setTexto] = useState('');
  const filas = useMemo(() => analizarPegado(d, prov.proveedor_id, texto), [d, prov, texto]);
  const ok = filas.filter((f) => f.estado === 'ok');
  const ejemplo = d.lineas.filter((l) => ofertaDe(l, prov.proveedor_id)).slice(0, 2)
    .map((l, k) => `${ofertaDe(l, prov.proveedor_id)?.referencia ?? l.codigo}   ${k === 0 ? '38.000   3' : '2.750'}`).join('\n');

  return (
    <Modal titulo={`Pegar precios de ${prov.nombre}`} onCerrar={onCerrar} ancha>
      <p className="mod-text mod-mt-0">
        Pega lo que te envió el proveedor (correo, WhatsApp o filas de Excel): una línea por producto con su <b>referencia</b>, <b>código interno</b> o <b>nombre</b>,
        el <b>costo unitario sin IVA</b> y, si quieres, los <b>días de entrega</b> al final. Se empatan con los productos de esta compra y ves el resultado antes de registrarlo.
      </p>
      <textarea className="ui-input mod-mono" rows={6} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={ejemplo} aria-label="Precios pegados" autoFocus />
      {filas.length > 0 && (
        <div className="mod-scroll mod-mt-2" style={{ maxHeight: 260 }}>
          <table className="mod-table">
            <thead><tr><th>Línea pegada</th><th>Producto</th><th>Costo (sin IVA)</th><th>Días</th><th>Resultado</th></tr></thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={i} className={f.estado === 'ok' ? undefined : 'is-faded'}>
                  <td>{f.original}</td><td>{f.producto ?? '—'}</td><td>{f.costo !== undefined ? pesos(f.costo) : '—'}</td>
                  <td>{f.dias ?? '—'}</td><td>{ESTADO_FILA[f.estado]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="pm-modal__acciones">
        <span className="mod-sub">{filas.length > ok.length ? `${filas.length - ok.length} línea(s) no se registrarán.` : ''}</span>
        <button type="button" className="ui-btn" onClick={onCerrar}>Cancelar</button>
        <button type="button" className="ui-btn ui-btn--primary" disabled={ok.length === 0}
          onClick={async () => {
            const r = await llamar('oferta_guardar_masivo', {
              p_compra: d.compra.id, p_proveedor: prov.proveedor_id,
              p_filas: ok.map((f) => ({ linea_id: f.lineaId, costo: f.costo, dias: f.dias ?? null })),
            }, (n) => `${n} precio(s) registrados`);
            if (r.ok) onCerrar();
          }}>
          Registrar {ok.length} precio(s)
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

interface ItemCat { item_id: number; codigo: string | null; nombre_base: string; linea: string | null; unidad_medida: string | null; proveedores: number }

export function ModalAgregarProducto({ onCerrar }: { onCerrar: () => void }) {
  const { d, supabase, organizacionId, llamar, permisos } = useMesa();
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState<ItemCat[]>([]);
  const [rev, setRev] = useState<Record<number, string[]>>({});
  const [item, setItem] = useState<ItemCat | null>(null);
  const [cantidad, setCantidad] = useState('');
  const [creando, setCreando] = useState(false);
  const [lineasCat, setLineasCat] = useState<string[]>([]);
  const [lineaSel, setLineaSel] = useState('');
  const [cantLinea, setCantLinea] = useState('1');
  const [soloExclusivos, setSoloExclusivos] = useState(false);
  const [nLinea, setNLinea] = useState(0);
  const [error, setError] = useState('');
  const enCompra = new Set(d.lineas.map((l) => l.item_id));

  useEffect(() => {
    supabase.rpc('compra_lineas_disponibles', { p_org: organizacionId, p_proveedor: null })
      .then(({ data }) => setLineasCat(((data ?? []) as (string | { linea: string })[]).map((x) => (typeof x === 'string' ? x : x.linea))));
  }, [supabase, organizacionId]);

  useEffect(() => {
    const t = setTimeout(async () => {
      const { data, error: e } = await supabase.rpc('compra_buscar_items', { p_org: organizacionId, p_busqueda: q.trim() || null, p_limit: 30 });
      if (e) return setError(textoError(e));
      const lista = ((data ?? []) as ItemCat[]).filter((i) => !enCompra.has(i.item_id)).slice(0, 8);
      setResultados(lista);
      if (lista.length > 0) {
        const r = await supabase.rpc('items_revision', { p_org: organizacionId, p_items: lista.map((i) => i.item_id) });
        setRev(Object.fromEntries(((r.data ?? []) as { item_id: number; motivos: string[] }[]).map((x) => [x.item_id, x.motivos])));
      }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, organizacionId, q, d.lineas.length]);

  useEffect(() => {
    if (!lineaSel) { setNLinea(0); return; }
    supabase.rpc('compra_contar_filtro', { p_org: organizacionId, p_lineas: [lineaSel], p_proveedor: null, p_solo_exclusivos: soloExclusivos })
      .then(({ data }) => setNLinea(Number(data ?? 0)));
  }, [supabase, organizacionId, lineaSel, soloExclusivos, d.lineas.length]);

  const agregar = async (seguir: boolean) => {
    const c = numeroDeTexto(cantidad);
    if (!item) return;
    if (c === undefined || c <= 0) return setError('Escribe la cantidad (un número mayor que cero).');
    setError('');
    const r = await llamar('compra_agregar_items', { p_compra: d.compra.id, p_items: [{ item_id: item.item_id, cantidad: c, sin_agotados: true }] }, `${item.nombre_base} agregado`);
    if (!r.ok) return;
    if (seguir) { setItem(null); setCantidad(''); } else onCerrar();
  };

  return (
    <Modal titulo="Agregar productos a la compra" onCerrar={onCerrar} ancha>
      <p className="mod-text mod-mt-0">No tiene que haber sido reportado como agotado: cualquier ítem del catálogo se puede comprar.</p>
      <div className="mod-card mod-mb-2">
        <h3 className="mod-h3 mod-mt-0">Toda una línea de una vez</h3>
        <div className="mod-flex mod-gap-2 mod-center mod-wrap">
          <select className="ui-input ui-input--sm mod-auto" value={lineaSel} onChange={(e) => setLineaSel(e.target.value)} aria-label="Línea a agregar">
            <option value="">Elige una línea…</option>
            {lineasCat.map((l) => <option key={l}>{l}</option>)}
          </select>
          <label className="mod-text">Cantidad por defecto{' '}
            <input className="ui-input ui-input--sm" style={{ width: 80 }} inputMode="decimal" value={cantLinea} onChange={(e) => setCantLinea(e.target.value)} aria-label="Cantidad por defecto de la línea" />
          </label>
          <label className="mod-flex mod-gap-1 mod-center mod-text"><input type="checkbox" checked={soloExclusivos} onChange={(e) => setSoloExclusivos(e.target.checked)} /> Solo los que maneja un único proveedor</label>
          <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" disabled={!lineaSel || nLinea === 0}
            onClick={async () => {
              const c = numeroDeTexto(cantLinea);
              if (c === undefined || c <= 0) return setError('La cantidad por defecto debe ser mayor que cero.');
              const r = await llamar('compra_agregar_por_filtro', { p_compra: d.compra.id, p_lineas: [lineaSel], p_proveedor: null, p_solo_exclusivos: soloExclusivos, p_cantidad: c }, `Línea “${lineaSel}” agregada`);
              if (r.ok) onCerrar();
            }}>
            Agregar la línea ({nLinea})
          </button>
        </div>
        <p className="mod-sub mod-mb-0">Se dejan fuera los productos sin proveedor (no se pueden cotizar) y los que ya están en la compra.</p>
      </div>

      <h3 className="mod-h3">O uno por uno</h3>
      {creando ? (
        <NuevoItem supabase={supabase} organizacionId={organizacionId} lineas={lineasCat} permisos={permisos}
          onCancelar={() => setCreando(false)}
          onCreado={(id, nombre) => { setCreando(false); setItem({ item_id: id, codigo: null, nombre_base: nombre, linea: null, unidad_medida: null, proveedores: 0 }); }} />
      ) : (
        <>
          <input className="ui-input" style={{ width: '100%' }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por código, nombre o línea…" aria-label="Buscar ítem" autoFocus />
          <div className="pm-lista mod-mt-2" style={{ maxHeight: 240 }}>
            <table className="mod-table"><tbody>
              {resultados.map((i) => {
                const falta = (rev[i.item_id] ?? []).some((m) => m.startsWith('Falta'));
                return (
                  <tr key={i.item_id} className={`is-clickable${item?.item_id === i.item_id ? ' is-selected' : ''}`} onClick={() => setItem(i)}>
                    <td><b>{i.codigo}</b> · {i.nombre_base}<span className="pm-chico">{i.linea ?? 'Sin línea'} · {i.proveedores} proveedor(es)</span></td>
                    <td>
                      {i.proveedores === 0 && <Badge tono="rojo" titulo="No se puede cotizar hasta vincularle un proveedor">sin proveedor</Badge>}{' '}
                      {falta && <Badge tono="ambar" titulo="Faltan datos del ítem">revisar</Badge>}
                    </td>
                  </tr>
                );
              })}
              {resultados.length === 0 && <tr><td className="mod-sub">Ningún ítem coincide con la búsqueda.</td></tr>}
            </tbody></table>
          </div>
          {(permisos.itemsCrear || permisos.crear) && (
            <div className="mod-flex mod-gap-2 mod-center mod-mt-2"><span className="mod-sub">¿No existe?</span><button type="button" className="ui-btn ui-btn--sm" onClick={() => setCreando(true)}>Crear ítem nuevo</button></div>
          )}
        </>
      )}
      {item && (
        <div className="mod-mt-2">
          <p><b>{item.codigo ? `${item.codigo} · ` : ''}{item.nombre_base}</b>{item.proveedores === 0 && <> <Badge tono="ambar">sin proveedores: al consultar uno se vinculará</Badge></>}</p>
          <div className="mod-flex mod-gap-2 mod-center mod-wrap">
            <label className="ui-field">
              <span className="ui-label">Cantidad{item.unidad_medida ? ` (${item.unidad_medida})` : ''} *</span>
              <input className="ui-input" inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} autoFocus />
            </label>
            <button type="button" className="ui-btn ui-btn--primary" onClick={() => agregar(false)}>Agregar a la compra</button>
            <button type="button" className="ui-btn" onClick={() => agregar(true)}>Agregar y seguir</button>
          </div>
        </div>
      )}
      {error && <p className="mod-error">{error}</p>}
    </Modal>
  );
}

/* ------------------------------------------------------------------ catálogo de un proveedor (agregar en lote con cantidades) */

interface FilaCatalogo {
  item_id: number; codigo: string | null; nombre_base: string; linea: string | null; unidad_medida: string | null;
  referencia: string | null; nombre_proveedor: string | null; precio_lista: number | null; exclusivo: boolean;
  agotados_pendientes: number | null; total: number;
}

export function ModalCatalogoProveedor({ prov, onCerrar }: { prov: ProveedorCompra; onCerrar: () => void }) {
  const { d, supabase, organizacionId, llamar } = useMesa();
  const [q, setQ] = useState('');
  const [linea, setLinea] = useState('');
  const [soloSuyos, setSoloSuyos] = useState(false);
  const [lineas, setLineas] = useState<string[]>([]);
  const [filas, setFilas] = useState<FilaCatalogo[]>([]);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [cantDefecto, setCantDefecto] = useState('1');
  const [cant, setCant] = useState<Record<number, string>>({});
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.rpc('compra_lineas_disponibles', { p_org: organizacionId, p_proveedor: prov.proveedor_id })
      .then(({ data }) => setLineas(((data ?? []) as (string | { linea: string })[]).map((x) => (typeof x === 'string' ? x : x.linea))));
  }, [supabase, organizacionId, prov.proveedor_id]);

  useEffect(() => {
    const t = setTimeout(async () => {
      const { data, error: e } = await supabase.rpc('compra_catalogo_proveedor', {
        p_org: organizacionId, p_compra: d.compra.id, p_proveedor: prov.proveedor_id,
        p_busqueda: q.trim() || null, p_linea: linea || null, p_solo_exclusivos: soloSuyos, p_limit: 300, p_offset: 0,
      });
      if (e) setError(textoError(e));
      else { setError(''); setFilas((data ?? []) as FilaCatalogo[]); }
    }, 250);
    return () => clearTimeout(t);
  }, [supabase, organizacionId, d.compra.id, d.lineas.length, prov.proveedor_id, q, linea, soloSuyos]);

  const visiblesSel = filas.filter((f) => sel.has(f.item_id));
  const todas = filas.length > 0 && visiblesSel.length === filas.length;
  const alternar = (id: number) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const cantidadDe = (id: number) => numeroDeTexto(cant[id] ?? '') ?? numeroDeTexto(cantDefecto);

  const agregar = async (ids: number[], texto: string) => {
    const items = ids.map((id) => ({ item_id: id, cantidad: cantidadDe(id), sin_agotados: true }));
    if (items.some((i) => !i.cantidad || i.cantidad <= 0)) return setError('Hay productos sin cantidad: escribe una cantidad por defecto o la de cada uno.');
    const r = await llamar('compra_agregar_items', { p_compra: d.compra.id, p_items: items }, texto);
    if (r.ok) onCerrar();
  };

  return (
    <Modal titulo={`Catálogo de ${prov.nombre}`} onCerrar={onCerrar} ancha>
      <p className="mod-text mod-mt-0">
        Productos que este proveedor suministra y aún no están en la compra. Marca varios (o toda una línea) y se agregan de una vez, ya con su precio del ERP.
        Los que no tengan cantidad propia entran con la <b>cantidad por defecto</b>; luego la ajustas en la tabla de la compra.
      </p>
      <div className="mod-flex mod-gap-2 mod-center mod-wrap mod-mb-2">
        <input className="ui-input ui-input--sm" style={{ flex: '1 1 220px' }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por código, nombre o referencia" aria-label="Buscar" autoFocus />
        <select className="ui-input ui-input--sm mod-auto" value={linea} onChange={(e) => setLinea(e.target.value)} aria-label="Línea">
          <option value="">Todas las líneas</option>
          {lineas.map((l) => <option key={l}>{l}</option>)}
        </select>
        <label className="mod-text"><input type="checkbox" checked={soloSuyos} onChange={(e) => setSoloSuyos(e.target.checked)} /> Solo los que únicamente maneja este proveedor</label>
      </div>
      <div className="mod-flex mod-gap-2 mod-center mod-wrap mod-mb-2">
        <label className="mod-text">Cantidad por defecto{' '}
          <input className="ui-input ui-input--sm" style={{ width: 80 }} inputMode="decimal" value={cantDefecto} onChange={(e) => setCantDefecto(e.target.value)} aria-label="Cantidad por defecto" />
        </label>
        {linea && (
          <button type="button" className="ui-btn ui-btn--sm" disabled={filas.length === 0} onClick={() => agregar(filas.map((f) => f.item_id), `Línea “${linea}”: ${filas.length} producto(s) agregados`)}>
            Agregar toda la línea “{linea}” ({filas.length})
          </button>
        )}
        <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" disabled={visiblesSel.length === 0}
          onClick={() => agregar(visiblesSel.map((f) => f.item_id), `${visiblesSel.length} producto(s) agregados`)}>
          Agregar seleccionados ({visiblesSel.length})
        </button>
      </div>
      {error && <p className="mod-error">{error}</p>}
      <div className="pm-lista">
        <table className="mod-table">
          <thead>
            <tr>
              <th className="mod-check"><input type="checkbox" checked={todas} disabled={filas.length === 0} aria-label="Seleccionar todos los visibles"
                onChange={(e) => setSel((s) => { const n = new Set(s); filas.forEach((f) => (e.target.checked ? n.add(f.item_id) : n.delete(f.item_id))); return n; })} /></th>
              <th>Producto</th><th>Ref.</th><th>Precio lista</th><th>Cantidad</th><th />
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.item_id} className={sel.has(f.item_id) ? 'is-selected' : ''}>
                <td className="mod-check"><input type="checkbox" checked={sel.has(f.item_id)} onChange={() => alternar(f.item_id)} aria-label={`Seleccionar ${f.nombre_base}`} /></td>
                <td>
                  <b>{f.codigo}</b> · {f.nombre_base}
                  <span className="pm-chico">
                    {f.linea ?? 'Sin línea'}{f.exclusivo ? ' · solo este proveedor' : ''}
                    {f.agotados_pendientes ? ` · hay ${f.agotados_pendientes} en agotados pendientes` : ''}
                  </span>
                </td>
                <td>{f.referencia ?? '—'}</td>
                <td>{pesos(f.precio_lista)}</td>
                <td><input className="ui-input ui-input--sm" style={{ width: 80 }} inputMode="decimal" value={cant[f.item_id] ?? ''} placeholder={cantDefecto || '—'}
                  onChange={(e) => setCant({ ...cant, [f.item_id]: e.target.value })} aria-label={`Cantidad de ${f.nombre_base}`} /></td>
                <td><button type="button" className="ui-btn ui-btn--sm" onClick={() => agregar([f.item_id], `${f.nombre_base} agregado`)}>Agregar</button></td>
              </tr>
            ))}
            {filas.length === 0 && <tr><td colSpan={6}>No hay productos de este proveedor por agregar con ese filtro.</td></tr>}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

export { costoBase, variacionErp };
