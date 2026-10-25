'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { useEffect } from 'react';
import type { LineaCompra, OfertaCompra, ProveedorCompra, BaseCosto } from '@/components/pedidos/tipos';
import { ESTADO_OFERTA, MOTIVO } from '@/components/pedidos/tipos';
import { Badge, Vacio } from '@/components/pedidos/ui';
import {
  costoBase, esComparable, estadoOfertasProveedor, mejorOferta, numeroDeTexto, ofertaDe, porConfirmarErp, porPedir,
  propuestaDeEstrategia, totalAsignado, variacionErp, type Estrategia,
} from '@/components/pedidos/reglas';
import { idVisible, pesos } from '@/components/pedidos/comun';
import { useMesa } from '@/components/pedidos/MesaContexto';
import { ModalAgregarProducto, ModalCatalogoProveedor, ModalConsultar, ModalOferta, ModalPegarPrecios, ModalRepartir } from '@/components/pedidos/modales';
import { ModalEscenarios } from '@/components/pedidos/Escenarios';
import MensajeProveedor from '@/components/pedidos/MensajeProveedor';

type Modal =
  | null
  | { tipo: 'oferta'; linea: LineaCompra; prov: ProveedorCompra }
  | { tipo: 'repartir'; linea: LineaCompra }
  | { tipo: 'pegar'; prov: ProveedorCompra }
  | { tipo: 'mensaje'; prov: ProveedorCompra }
  | { tipo: 'escenarios' }
  | { tipo: 'agregar' }
  | { tipo: 'consultar' }
  | { tipo: 'catalogo'; prov: ProveedorCompra };

interface Edicion { l: number; p: number; texto: string; seleccionar: boolean }

const ATAJOS: [string, string][] = [
  ['← ↑ ↓ →', 'Moverte entre celdas'],
  ['Escribir un número', 'Editar el costo (sin IVA) de la celda: ej. 38000 o 38.000'],
  ['Enter · F2', 'Editar el costo actual. Al guardar baja a la fila siguiente'],
  ['Tab · Mayús+Tab', 'Guardar y pasar al proveedor siguiente / anterior'],
  ['costo/días', 'Al editar, "38000/3" guarda costo 38.000 y 3 días de entrega'],
  ['Esc', 'Cancelar la edición'],
  ['Espacio', 'Asignar todo el producto a ese proveedor (otra vez, quitarlo)'],
  ['E', 'Igual al ERP: confirma esta celda con el precio del ERP'],
  ['N', 'El proveedor no lo tiene'],
  ['Ctrl+Z', 'Deshacer la última acción'],
];

/** Tolerancia de "Consolidar" (%): conserva lo que se escribe y guarda el ajuste cuando el valor es válido. */
function CampoTolerancia() {
  const { ajustes, cambiarAjustes } = useMesa();
  const [texto, setTexto] = useState(String(ajustes.tolerancia));
  const n = numeroDeTexto(texto);
  const valido = n !== undefined && n >= 0 && n <= 50;
  return (
    <label className="mod-text">
      tolerancia{' '}
      <input className="ui-input ui-input--sm" style={{ width: 56, borderColor: valido ? undefined : 'var(--color-danger, #b91c1c)' }}
        inputMode="decimal" value={texto} aria-label="Tolerancia de consolidación (%)" aria-invalid={!valido}
        title="Entre 0 y 50. Se guarda para la próxima vez"
        onChange={(e) => {
          setTexto(e.target.value);
          const v = numeroDeTexto(e.target.value);
          if (v !== undefined && v >= 0 && v <= 50) cambiarAjustes({ tolerancia: v });
        }} />
      %
    </label>
  );
}

/**
 * Vista por producto: una fila por producto, una columna por proveedor consultado. Es una CUADRÍCULA con teclado:
 * las flechas mueven entre celdas, escribir un número edita el costo en la misma celda y Enter lo guarda.
 * Un clic en una oferta con precio asigna todo el producto a ese proveedor; un clic sobre el precio lo edita.
 * La cantidad de cada producto se escribe en su columna. Las estrategias deciden todos los productos de una
 * vez y no pisan lo elegido a mano.
 */
export default function Matriz() {
  const { d, editable, permisos, ajustes, llamar, avisar, supabase, organizacionId, ultimoDeshacer, deshacer, cambiarAjustes } = useMesa();
  const [modal, setModal] = useState<Modal>(null);
  const [verAtajos, setVerAtajos] = useState(false);
  const [edit, setEditState] = useState<Edicion | null>(null);
  const editRef = useRef<Edicion | null>(null);
  const celdas = useRef(new Map<string, HTMLElement | null>());
  const [foco, setFoco] = useState<{ l: number; p: number } | null>(null);
  const base = d.compra.base_costo;
  const puedeOfertar = editable && permisos.editar;
  const puedeDecidir = editable && permisos.ganadorEditar;
  const lineas = d.lineas;
  const provs = d.proveedores;

  const setEdit = (v: Edicion | null) => { editRef.current = v; setEditState(v); };
  const enfocar = (l: number, p: number) => setTimeout(() => celdas.current.get(`${l}:${p}`)?.focus(), 0);
  const mover = (l: number, p: number, dl: number, dp: number) => {
    const nl = Math.min(Math.max(l + dl, 0), lineas.length - 1);
    const np = Math.min(Math.max(p + dp, 0), provs.length - 1);
    setFoco({ l: nl, p: np });
    enfocar(nl, np);
  };

  /* ---------- acciones con su "deshacer" ---------- */

  const deshacerOferta = (l: LineaCompra, p: ProveedorCompra, o: OfertaCompra | undefined) => ({
    texto: `${l.nombre} · ${p.nombre}`,
    accion: () => supabase.rpc('oferta_restaurar', {
      p_org: organizacionId, p_linea: l.id, p_proveedor: p.proveedor_id, p_existia: !!o,
      p_estado: o?.estado ?? null, p_fuente: o?.fuente ?? null, p_costo: o?.costo ?? null, p_dias: o?.dias ?? null, p_observacion: o?.observacion ?? null,
    }),
  });

  const deshacerAsignacion = (ls: LineaCompra[], texto: string) => ({
    texto,
    accion: () => supabase.rpc('compra_asignar_masivo', {
      p_org: organizacionId, p_compra: d.compra.id,
      p_items: ls.map((l) => ({ linea_id: l.id, asignaciones: l.asignaciones.map((a) => ({ proveedor_id: a.proveedor_id, cantidad: a.cantidad, motivo: a.motivo, nota: a.nota })) })),
    }),
  });

  const asignarTodo = (l: LineaCompra, p: ProveedorCompra) => {
    if (!puedeDecidir || l.ordenada) return;
    if (!esComparable(ofertaDe(l, p.proveedor_id))) return;
    const ya = l.asignaciones.length === 1 && l.asignaciones[0].proveedor_id === p.proveedor_id && l.asignaciones[0].cantidad === l.cantidad;
    return llamar('compra_asignar', {
      p_linea: l.id,
      p_asignaciones: ya ? [] : [{ proveedor_id: p.proveedor_id, cantidad: l.cantidad, motivo: 'manual' }],
    }, undefined, deshacerAsignacion([l], `asignación de ${l.nombre}`));
  };

  const estrategia = async (tipo: Estrategia) => {
    const { items, sinOferta } = propuestaDeEstrategia(d, tipo, { tolerancia: ajustes.tolerancia / 100, base, soloSinAsignar: ajustes.soloSinAsignar });
    if (items.length === 0) return avisar('error', 'No hay productos con ofertas con costo para decidir (o ya tienen asignación a mano).');
    const previas = d.lineas.filter((l) => items.some((i) => i.linea_id === l.id));
    const nombre = tipo === 'precio' ? 'Más barato' : tipo === 'plazo' ? 'Más rápido' : `Consolidar ${ajustes.tolerancia}%`;
    await llamar('compra_asignar_masivo', { p_compra: d.compra.id, p_items: items, p_detalle: nombre },
      `${items.length} producto(s) asignados${sinOferta ? ` · ${sinOferta} sin ofertas con costo` : ''}`,
      deshacerAsignacion(previas, nombre));
  };

  const limpiar = async () => {
    const con = d.lineas.filter((l) => !l.ordenada && l.asignaciones.length > 0);
    if (con.length === 0) return;
    await llamar('compra_asignar_masivo', { p_compra: d.compra.id, p_items: con.map((l) => ({ linea_id: l.id, asignaciones: [] })), p_detalle: 'Se quitaron las asignaciones' },
      'Asignaciones quitadas', deshacerAsignacion(con, 'quitar asignaciones'));
  };

  const confirmarErpCelda = (l: LineaCompra, p: ProveedorCompra, o: OfertaCompra | undefined) =>
    llamar('oferta_confirmar_erp', { p_compra: d.compra.id, p_proveedor: p.proveedor_id, p_linea: l.id }, undefined, deshacerOferta(l, p, o));

  const noLoTiene = (l: LineaCompra, p: ProveedorCompra, o: OfertaCompra | undefined) =>
    llamar('oferta_guardar', { p_linea: l.id, p_proveedor: p.proveedor_id, p_costo: null, p_dias: null, p_observacion: o?.observacion ?? null, p_disponible: false },
      undefined, deshacerOferta(l, p, o));

  /* ---------- edición de costos en la celda ---------- */

  const iniciarEdicion = (l: number, p: number, inicial?: string) => {
    if (!puedeOfertar || lineas[l].ordenada) return;
    const o = ofertaDe(lineas[l], provs[p].proveedor_id);
    setFoco({ l, p });
    setEdit({ l, p, texto: inicial ?? (typeof o?.costo === 'number' ? String(o.costo) : ''), seleccionar: inicial === undefined });
  };

  const confirmarEdicion = async (dl: number, dp: number) => {
    const e = editRef.current;
    if (!e) return;
    const l = lineas[e.l];
    const p = provs[e.p];
    const o = ofertaDe(l, p.proveedor_id);
    const [textoCosto, textoDias] = e.texto.split('/');
    if (textoCosto.trim() === '') { setEdit(null); mover(e.l, e.p, 0, 0); return; }
    const costo = numeroDeTexto(textoCosto);
    if (costo === undefined || costo <= 0) return avisar('error', 'Costo no válido: escribe un número, por ejemplo 38000 o 38.000');
    let dias: number | undefined;
    if (textoDias !== undefined && textoDias.trim() !== '') {
      dias = numeroDeTexto(textoDias);
      if (dias === undefined || !Number.isInteger(dias) || dias < 0) return avisar('error', 'Días no válidos: usa un número entero, por ejemplo 38000/3');
    }
    const sinCambio = o && o.estado === 'respondida' && o.costo === costo && (dias === undefined || dias === o.dias);
    if (!sinCambio) {
      // Escribir el mismo valor del ERP equivale a "igual al ERP": la oferta conserva esa marca.
      const igualErp = !!o && o.fuente === 'erp' && o.estado !== 'respondida' && o.precio_erp === costo && dias === undefined;
      const r = igualErp
        ? await confirmarErpCelda(l, p, o)
        : await llamar('oferta_guardar', { p_linea: l.id, p_proveedor: p.proveedor_id, p_costo: costo, p_dias: dias ?? o?.dias ?? null, p_observacion: o?.observacion ?? null, p_disponible: true },
            undefined, deshacerOferta(l, p, o));
      if (!r.ok) return;
    }
    setEdit(null);
    mover(e.l, e.p, dl, dp);
  };

  const cancelarEdicion = () => {
    const e = editRef.current;
    setEdit(null);
    if (e) mover(e.l, e.p, 0, 0);
  };

  /* ---------- teclado de la cuadrícula ---------- */

  const teclaEnCelda = (ev: KeyboardEvent<HTMLElement>, li: number, pi: number) => {
    if (ev.target !== ev.currentTarget || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const l = lineas[li];
    const p = provs[pi];
    const o = ofertaDe(l, p.proveedor_id);
    const k = ev.key;
    const flechas: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (flechas[k]) { ev.preventDefault(); mover(li, pi, flechas[k][0], flechas[k][1]); return; }
    if (!editable || l.ordenada) return;
    if (k === 'Enter' || k === 'F2') { ev.preventDefault(); iniciarEdicion(li, pi); }
    else if (/^[0-9]$/.test(k)) { ev.preventDefault(); iniciarEdicion(li, pi, k); }
    else if (k === ' ') { ev.preventDefault(); asignarTodo(l, p); }
    else if ((k === 'e' || k === 'E') && puedeOfertar) { ev.preventDefault(); if (o) confirmarErpCelda(l, p, o); }
    else if ((k === 'n' || k === 'N') && puedeOfertar) { ev.preventDefault(); noLoTiene(l, p, o); }
  };

  const teclaEnInput = (ev: KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === 'Enter') { ev.preventDefault(); confirmarEdicion(1, 0); }
    else if (ev.key === 'Tab') { ev.preventDefault(); confirmarEdicion(0, ev.shiftKey ? -1 : 1); }
    else if (ev.key === 'Escape') { ev.preventDefault(); cancelarEdicion(); }
  };

  const cambiarCantidad = (l: LineaCompra, texto: string) => {
    const n = numeroDeTexto(texto);
    if (n === undefined || n <= 0) return avisar('error', 'La cantidad debe ser un número mayor que cero.');
    if (n === l.cantidad) return;
    llamar('compra_cambiar_cantidad', { p_compra: d.compra.id, p_linea: l.id, p_cantidad: n }, undefined, {
      texto: `cantidad de ${l.nombre}`,
      accion: () => supabase.rpc('compra_cambiar_cantidad', { p_org: organizacionId, p_compra: d.compra.id, p_linea: l.id, p_cantidad: l.cantidad }),
    });
  };

  const quitarLinea = async (l: LineaCompra) => {
    if (!confirm(`¿Quitar "${l.nombre}" de la compra?${l.necesidades > 0 ? ' Sus agotados vuelven a pendientes.' : ''}`)) return;
    await llamar('compra_quitar_linea', { p_compra: d.compra.id, p_linea: l.id }, `${l.nombre} quitado`);
  };

  const [revision, setRevision] = useState<Record<number, string[]>>({});
  const idsItems = lineas.map((l) => l.item_id).join(',');
  useEffect(() => {
    if (!idsItems) return;
    supabase.rpc('items_revision', { p_org: organizacionId, p_items: idsItems.split(',').map(Number) }).then(({ data }) =>
      setRevision(Object.fromEntries(((data ?? []) as { item_id: number; motivos: string[] }[]).map((x) => [x.item_id, x.motivos]))));
  }, [supabase, organizacionId, idsItems]);

  /* ---------------- una celda ---------------- */

  const celda = (l: LineaCompra, li: number, p: ProveedorCompra, pi: number) => {
    const o = ofertaDe(l, p.proveedor_id);
    const asign = l.asignaciones.find((a) => a.proveedor_id === p.proveedor_id);
    const editando = edit?.l === li && edit?.p === pi;
    const conFoco = foco ? foco.l === li && foco.p === pi : li === 0 && pi === 0;
    const propsCelda = {
      ref: (el: HTMLElement | null) => { celdas.current.set(`${li}:${pi}`, el); },
      tabIndex: conFoco ? 0 : -1,
      onFocus: () => setFoco({ l: li, p: pi }),
      onKeyDown: (ev: KeyboardEvent<HTMLElement>) => teclaEnCelda(ev, li, pi),
    };
    const entrada = (
      <div onClick={(ev) => ev.stopPropagation()}>
        <input
          autoFocus className="ui-input ui-input--sm" style={{ width: '100%' }} inputMode="decimal" value={edit?.texto ?? ''}
          aria-label={`Costo sin IVA de ${l.nombre} con ${p.nombre}`}
          onFocus={(ev) => { const e = editRef.current; if (e?.seleccionar) ev.currentTarget.select(); else ev.currentTarget.setSelectionRange(ev.currentTarget.value.length, ev.currentTarget.value.length); }}
          onChange={(ev) => editRef.current && setEdit({ ...editRef.current, texto: ev.target.value })}
          onKeyDown={teclaEnInput}
          onBlur={() => { if (editRef.current) confirmarEdicion(0, 0); }}
        />
        <div className="pm-chico">sin IVA · Enter guarda ↓ · Tab → · Esc cancela · costo/días</div>
      </div>
    );

    if (!o) {
      return (
        <td key={p.proveedor_id}>
          <div role="gridcell" className="pm-oferta is-sinprecio" {...propsCelda} aria-label={`${p.nombre}: sin vínculo. Escribe un costo para consultarlo igual`}>
            {editando ? entrada : (
              <span>
                Sin vínculo<br /><span className="pm-chico">escribe un costo para consultarlo</span><br />
                <button type="button" tabIndex={-1} className="ui-btn ui-btn--sm" disabled={!puedeOfertar || l.ordenada} onClick={() => setModal({ tipo: 'oferta', linea: l, prov: p })}>Consultar igual</button>
              </span>
            )}
          </div>
        </td>
      );
    }
    const comparable = esComparable(o);
    const valor = comparable ? costoBase(o.costo, p, base) : undefined;
    const otro = comparable ? costoBase(o.costo, p, base === 'con_iva' ? 'sin_iva' : 'con_iva') : undefined;
    const e = ESTADO_OFERTA[o.estado];
    const mejor = mejorOferta(d, l, 'precio', base);
    const vErp = comparable && o.fuente === 'cotizacion' ? variacionErp(o) : undefined;
    const accion = () => {
      if (!editable || editando || l.ordenada) return;
      if (comparable) asignarTodo(l, p);
      else setModal({ tipo: 'oferta', linea: l, prov: p });
    };
    return (
      <td key={p.proveedor_id}>
        <div role="gridcell" className={`pm-oferta${asign ? ' is-elegida' : ''}${comparable ? '' : ' is-sinprecio'}`} {...propsCelda} onClick={accion}
          aria-label={`${p.nombre}: ${valor ? pesos(valor) : e.texto}${asign ? `, asignado ${asign.cantidad}` : ''}`}>
          {editando ? entrada : (
            <>
              <div>
                <div className="pm-precio">
                  <span title={puedeOfertar ? 'Clic para editar el costo (sin IVA)' : undefined}
                    style={puedeOfertar && !l.ordenada ? { cursor: 'text', borderBottom: '1px dotted var(--color-text-subtle)' } : undefined}
                    onClick={(ev) => { if (puedeOfertar && !l.ordenada) { ev.stopPropagation(); iniciarEdicion(li, pi); } }}>
                    {valor !== undefined ? pesos(valor) : o.estado === 'no_disponible' ? 'No lo tiene' : 'Sin precio'}
                  </span>
                  {mejor?.proveedor_id === p.proveedor_id && comparable && <span className="pm-mejor" title={`Mejor costo ${base === 'con_iva' ? 'con' : 'sin'} IVA`}> ★</span>}
                </div>
                {otro !== undefined && otro !== valor && <div className="pm-chico">{base === 'con_iva' ? 'sin IVA' : 'con IVA'} {pesos(otro)}</div>}
                <Badge tono={e.tono} titulo={e.ayuda}>{e.texto}</Badge>{' '}
                {o.fuente === 'erp' && o.estado === 'respondida' && <Badge tono="verde" titulo="El proveedor confirmó el precio del ERP">= ERP</Badge>}
                {vErp !== undefined && Math.abs(vErp) >= 0.0005 && <Badge tono={vErp > 0.05 ? 'ambar' : 'gris'} titulo="Variación frente al precio del ERP">{vErp > 0 ? '+' : ''}{(vErp * 100).toFixed(1)}% ERP</Badge>}
                <div className="pm-chico">{o.dias !== null ? `${o.dias} d` : ''}{o.observacion ? ` · ${o.observacion}` : ''}</div>
              </div>
              <div className="pm-lado">
                {puedeOfertar && !l.ordenada && (
                  <button type="button" tabIndex={-1} className="ui-btn ui-btn--sm ui-btn--ghost" aria-label={`Editar la oferta de ${p.nombre}`} title="Costo, días y observación"
                    onClick={(ev) => { ev.stopPropagation(); setModal({ tipo: 'oferta', linea: l, prov: p }); }}>✎</button>
                )}
                {asign && <Badge tono="verde">✔ {asign.cantidad}</Badge>}
              </div>
            </>
          )}
        </div>
      </td>
    );
  };

  const sinOfertasDe = (l: LineaCompra) => !l.ofertas.some((o) => esComparable(o));

  return (
    <div onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !(e.target as HTMLElement).matches('input')) { e.preventDefault(); deshacer(); } }}>
      {editable && (
        <div className="mod-toolbar mod-toolbar--top">
          {permisos.editar && (
            <>
              <button type="button" className="ui-btn ui-btn--sm" onClick={() => setModal({ tipo: 'agregar' })}>+ Agregar producto</button>
              <button type="button" className="ui-btn ui-btn--sm" onClick={() => setModal({ tipo: 'consultar' })}>+ Consultar proveedor</button>
              <span className="pm-sep" />
            </>
          )}
          <label className="mod-text" title="Con IVA = lo que se paga. Sin IVA = costo neto, si el IVA de compra es descontable">
            Comparar por{' '}
            <select className="ui-input ui-input--sm mod-auto" value={base} aria-label="Comparar por" disabled={!permisos.editar}
              onChange={(e) => llamar('compra_base_costo', { p_compra: d.compra.id, p_base: e.target.value })}>
              <option value="con_iva">Costo con IVA</option><option value="sin_iva">Costo sin IVA</option>
            </select>
          </label>
          {puedeDecidir && (
            <>
              <span className="mod-sub">Decidir todo:</span>
              <button type="button" className="ui-btn ui-btn--sm" onClick={() => estrategia('precio')} title="El menor costo por producto, según la base elegida">Más barato</button>
              <button type="button" className="ui-btn ui-btn--sm" onClick={() => estrategia('plazo')} title="El menor tiempo de entrega por producto">Más rápido</button>
              <button type="button" className="ui-btn ui-btn--sm" onClick={() => estrategia('consolidar')} title="Concentra en pocos proveedores aceptando pagar hasta la tolerancia más que el mejor precio">Consolidar</button>
              <CampoTolerancia />
              <label className="mod-flex mod-gap-1 mod-center mod-text" title="Las estrategias solo deciden lo que aún no tiene asignación">
                <input type="checkbox" checked={ajustes.soloSinAsignar} onChange={(e) => cambiarAjustes({ soloSinAsignar: e.target.checked })} /> solo sin asignar
              </label>
              <button type="button" className="ui-btn ui-btn--sm" onClick={() => setModal({ tipo: 'escenarios' })}>Comparar propuestas</button>
              <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={limpiar}>Limpiar</button>
            </>
          )}
        </div>
      )}
      <div className="mod-flex mod-gap-2 mod-center mod-mb-2">
        <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" disabled={!ultimoDeshacer} onClick={deshacer} title="Ctrl+Z">↶ Deshacer{ultimoDeshacer ? `: ${ultimoDeshacer}` : ''}</button>
        <button type="button" className="ui-btn ui-btn--sm" aria-expanded={verAtajos} onClick={() => setVerAtajos(!verAtajos)}>⌨ Atajos de teclado</button>
        <span className="mod-sub">Usa las flechas para moverte por los precios y escribe un número para cambiar un costo, sin abrir el lápiz.</span>
      </div>
      {verAtajos && (
        <div className="mod-card mod-mb-2">
          <table className="mod-table"><tbody>{ATAJOS.map(([k, t]) => <tr key={k}><td style={{ whiteSpace: 'nowrap' }}><kbd>{k}</kbd></td><td>{t}</td></tr>)}</tbody></table>
        </div>
      )}

      {lineas.length === 0 ? (
        <Vacio titulo="Esta compra aún no tiene productos"
          texto={provs.length > 0 ? 'Ya consultas a un proveedor, pero no hay productos que cotizarle. Trae su catálogo o agrega productos.' : 'Agrégalos desde los agotados pendientes o directamente desde el catálogo.'}>
          {editable && permisos.editar && (
            <div className="mod-flex mod-gap-2 mod-wrap" style={{ justifyContent: 'center' }}>
              {provs.map((p) => <button key={p.proveedor_id} type="button" className="ui-btn ui-btn--primary" onClick={() => setModal({ tipo: 'catalogo', prov: p })}>Traer catálogo de {p.nombre}</button>)}
              <button type="button" className={provs.length > 0 ? 'ui-btn' : 'ui-btn ui-btn--primary'} onClick={() => setModal({ tipo: 'agregar' })}>+ Agregar productos</button>
              <button type="button" className="ui-btn" onClick={() => setModal({ tipo: 'consultar' })}>+ Consultar proveedor</button>
            </div>
          )}
        </Vacio>
      ) : (
        <div className="mod-scroll">
          <table className="pm-matriz" role="grid" aria-label="Productos y ofertas por proveedor">
            <thead>
              <tr>
                <th style={{ minWidth: 240 }}>Producto</th>
                {provs.map((p) => {
                  const est = estadoOfertasProveedor(d, p.proveedor_id);
                  const nErp = porConfirmarErp(d, p.proveedor_id);
                  return (
                    <th key={p.proveedor_id} style={{ minWidth: 170 }}>
                      {p.nombre}
                      <div className="pm-chico" style={{ fontWeight: 400 }}>{est.respondidas}/{est.total} cotizadas{est.pedidas > 0 && ` · ${est.pedidas} pedidas`}</div>
                      {puedeOfertar && (
                        <div className="mod-flex mod-gap-1 mod-wrap" style={{ marginTop: 4 }}>
                          <button type="button" className="ui-btn ui-btn--sm" onClick={() => setModal({ tipo: 'mensaje', prov: p })}>Pedir cotización</button>
                          <button type="button" className="ui-btn ui-btn--sm" title="Pega los precios que te envió el proveedor (Excel, WhatsApp, correo)" onClick={() => setModal({ tipo: 'pegar', prov: p })}>Pegar precios</button>
                          {nErp > 0 && (
                            <button type="button" className="ui-btn ui-btn--sm" title="El proveedor cotizó lo mismo que el ERP: confirma todos los productos con precio ERP de una vez"
                              onClick={() => llamar('oferta_confirmar_erp', { p_compra: d.compra.id, p_proveedor: p.proveedor_id }, (n) => `${n} producto(s) confirmados al precio del ERP`)}>✓ Igual al ERP ({nErp})</button>
                          )}
                          <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" aria-label={`Quitar a ${p.nombre}`} title="Quitar de la compra"
                            onClick={() => window.confirm(`¿Quitar a ${p.nombre}? Se pierden sus ofertas y asignaciones en esta compra.`) && llamar('compra_quitar_proveedor', { p_compra: d.compra.id, p_proveedor: p.proveedor_id }, `${p.nombre} quitado`)}>✕</button>
                        </div>
                      )}
                    </th>
                  );
                })}
                <th style={{ minWidth: 190 }}>Decisión</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l, li) => {
                const falta = (revision[l.item_id] ?? []).filter((m) => m.startsWith('Falta'));
                const asignado = totalAsignado(l);
                const sinOfertas = sinOfertasDe(l);
                return (
                  <tr key={l.id} className={l.asignaciones.length === 0 && !l.ordenada ? 'pm-fila-alerta' : undefined}>
                    <td>
                      <strong>{l.nombre}</strong>
                      <div className="pm-chico">
                        {idVisible(l.item_id, false, l.codigo)} · {l.linea ?? 'Sin línea'}
                        {falta.length > 0 && <> · <Badge tono="ambar" titulo={falta.join('\n')}>revisar ítem</Badge></>}
                      </div>
                      <div className="pm-chico">
                        {l.necesidades > 0 ? `Agotado en ${l.sedes.map((s) => s.sede).join(', ')}` : 'Agregado por Compras'}
                        {l.ordenada && <> · <Badge tono="verde">con orden</Badge></>}
                      </div>
                      <div className="mod-flex mod-gap-1 mod-center" style={{ marginTop: 4 }}>
                        <input
                          key={`${l.id}-${l.cantidad}`} className="ui-input ui-input--sm" style={{ width: 84 }} inputMode="decimal"
                          defaultValue={String(l.cantidad)} disabled={!puedeOfertar || l.ordenada} aria-label={`Cantidad de ${l.nombre}`}
                          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                          onBlur={(e) => {
                            const v = numeroDeTexto(e.currentTarget.value);
                            if (v === l.cantidad) return;
                            if (v === undefined || v <= 0) { avisar('error', 'La cantidad debe ser un número mayor que cero.'); e.currentTarget.value = String(l.cantidad); return; }
                            cambiarCantidad(l, e.currentTarget.value);
                          }}
                        />
                        <span className="pm-chico">{l.unidad ?? ''}</span>
                      </div>
                    </td>
                    {provs.map((p, pi) => celda(l, li, p, pi))}
                    <td>
                      {l.asignaciones.length === 0 ? (
                        l.ordenada ? <Badge tono="verde">Con orden</Badge>
                          : <Badge tono={sinOfertas ? 'rojo' : 'ambar'}>{sinOfertas ? 'Sin ofertas con costo' : 'Sin asignar'}</Badge>
                      ) : l.asignaciones.map((a) => (
                        <div key={a.proveedor_id}>
                          <span className="pm-chip">{a.cantidad} · {provs.find((x) => x.proveedor_id === a.proveedor_id)?.nombre.split(' ')[0]}</span>
                          <div className="pm-chico">{MOTIVO[a.motivo]}</div>
                        </div>
                      ))}
                      {asignado > 0 && asignado !== l.cantidad && <div style={{ color: 'var(--color-danger, #b91c1c)' }} className="pm-chico">Falta asignar {l.cantidad - asignado}</div>}
                      {puedeOfertar && !l.ordenada && (
                        <div className="mod-flex mod-gap-1" style={{ marginTop: 4 }}>
                          <button type="button" className="ui-btn ui-btn--sm" disabled={sinOfertas || !permisos.ganadorEditar} onClick={() => setModal({ tipo: 'repartir', linea: l })}>Repartir</button>
                          <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" title="Quitar el producto de la compra" aria-label={`Quitar ${l.nombre}`} onClick={() => quitarLinea(l)}>Quitar</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {provs.length === 0 && lineas.length > 0 && editable && (
        <p className="mod-sub mod-mt-2">Aún no consultas a ningún proveedor. Usa “+ Consultar proveedor”: te sugiere los que cubren más productos de esta compra.</p>
      )}
      {lineas.length > 0 && provs.length > 0 && (
        <p className="mod-sub mod-mt-2">
          ★ mejor costo ({base === 'con_iva' ? 'con IVA' : 'sin IVA'}) · clic en una oferta para asignar todo el producto · clic sobre el precio (o escribe un número) para editarlo ·
          “ERP” = precio del ERP aún sin confirmar · “✓ Igual al ERP” confirma de una vez los que cotiza al precio del ERP.
        </p>
      )}

      {modal?.tipo === 'oferta' && <ModalOferta linea={modal.linea} prov={modal.prov} onCerrar={() => setModal(null)} />}
      {modal?.tipo === 'repartir' && <ModalRepartir linea={modal.linea} onCerrar={() => setModal(null)} />}
      {modal?.tipo === 'pegar' && <ModalPegarPrecios prov={modal.prov} onCerrar={() => setModal(null)} />}
      {modal?.tipo === 'mensaje' && <MensajeProveedor tipo="cotizacion" proveedor={modal.prov} onCerrar={() => setModal(null)} />}
      {modal?.tipo === 'escenarios' && <ModalEscenarios onCerrar={() => setModal(null)} />}
      {modal?.tipo === 'agregar' && <ModalAgregarProducto onCerrar={() => setModal(null)} />}
      {modal?.tipo === 'consultar' && <ModalConsultar onCerrar={() => setModal(null)} />}
      {modal?.tipo === 'catalogo' && <ModalCatalogoProveedor prov={modal.prov} onCerrar={() => setModal(null)} />}
    </div>
  );
}

export type { BaseCosto };
