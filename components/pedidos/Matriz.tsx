'use client';

import { useEffect, useMemo, useState } from 'react';
import TablaExcel from '@/components/TablaExcel';
import type { LineaCompra, OfertaCompra, ProveedorCompra } from '@/components/pedidos/tipos';
import { ESTADO_OFERTA, MOTIVO } from '@/components/pedidos/tipos';
import { Badge, Vacio } from '@/components/pedidos/ui';
import {
  costoBase, esComparable, estadoOfertasProveedor, mejorOferta, numeroDeTexto, ofertaDe, porConfirmarErp,
  propuestaDeEstrategia, totalAsignado, variacionErp, type Estrategia,
} from '@/components/pedidos/reglas';
import { ORDEN_COLOR, REGLAS_COLOR, type ClaveColor } from '@/components/pedidos/ajustes';
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
  | { tipo: 'catalogo'; prov: ProveedorCompra }
  | { tipo: 'escenarios' | 'agregar' | 'consultar' };

const AYUDA: [string, string][] = [
  ['Escribir en la celda', 'El costo (sin IVA) se escribe directamente en la celda del proveedor: no hay que abrir nada. Enter guarda y baja a la fila siguiente.'],
  ['costo/días', 'Escribe "38000/3" para guardar a la vez el costo (38.000) y los días de entrega (3).'],
  ['↑ ↓', 'Subir o bajar entre los costos de un mismo proveedor. Tab pasa al proveedor siguiente.'],
  ['Elegir', 'El botón “Elegir” asigna todo el producto a ese proveedor; “Repartir” lo divide entre varios.'],
  ['✕', 'El proveedor no tiene el producto.'],
  ['Ctrl+Z', 'Deshace la última acción (costos, asignaciones, repartos, cantidades).'],
];

/** Tolerancia de "Consolidar" (%): se guarda en cuanto el valor es válido. */
function CampoTolerancia() {
  const { ajustes, cambiarAjustes } = useMesa();
  const [texto, setTexto] = useState(String(ajustes.tolerancia));
  const n = numeroDeTexto(texto);
  const valido = n !== undefined && n >= 0 && n <= 50;
  return (
    <label className="pm-campo">
      <span>tolerancia</span>
      <input className="ui-input ui-input--sm" style={{ width: 56, borderColor: valido ? undefined : 'var(--color-danger, #b91c1c)' }}
        inputMode="decimal" value={texto} aria-label="Tolerancia de consolidación (%)" aria-invalid={!valido} title="Entre 0 y 50"
        onChange={(e) => { setTexto(e.target.value); const v = numeroDeTexto(e.target.value); if (v !== undefined && v >= 0 && v <= 50) cambiarAjustes({ tolerancia: v }); }} />
      <span>%</span>
    </label>
  );
}

/** Colores de las celdas: el usuario elige qué criterios pintar y con qué color. */
function PanelColores() {
  const { ajustes, cambiarAjustes } = useMesa();
  const poner = (clave: ClaveColor, cambio: { activa?: boolean; color?: string }) =>
    cambiarAjustes({ colores: ajustes.colores.map((r) => (r.clave === clave ? { ...r, ...cambio } : r)) });
  return (
    <div className="mod-card mod-mb-2">
      <strong>Colores de las celdas</strong>
      <p className="mod-sub mod-mt-0">Elige qué criterio se pinta y con qué color. Si una celda cumple varios, gana el primero de esta lista. Al pasar el cursor sobre una celda pintada verás por qué se pintó.</p>
      <table className="mod-table"><tbody>
        {ORDEN_COLOR.map((clave) => {
          const r = ajustes.colores.find((x) => x.clave === clave)!;
          return (
            <tr key={clave}>
              <td><label><input type="checkbox" checked={r.activa} onChange={(e) => poner(clave, { activa: e.target.checked })} /> {REGLAS_COLOR[clave].nombre}</label></td>
              <td className="mod-sub">Se pinta porque {REGLAS_COLOR[clave].porque}</td>
              <td><input type="color" value={r.color} onChange={(e) => poner(clave, { color: e.target.value })} aria-label={`Color de ${REGLAS_COLOR[clave].nombre}`} /></td>
            </tr>
          );
        })}
      </tbody></table>
    </div>
  );
}

/**
 * Vista por producto: una fila por producto, una columna por proveedor. El costo se escribe DENTRO de la celda del
 * proveedor (sin lápiz ni diálogos): Enter guarda y baja; Tab pasa al proveedor siguiente. La celda se pinta según las
 * reglas de color elegidas (p. ej. verde = la opción más barata). "Elegir" asigna todo el producto a ese proveedor.
 */
export default function Matriz() {
  const { d, editable, permisos, ajustes, llamar, avisar, supabase, organizacionId, ultimoDeshacer, deshacer, cambiarAjustes } = useMesa();
  const [modal, setModal] = useState<Modal>(null);
  const [verAyuda, setVerAyuda] = useState(false);
  const [verColores, setVerColores] = useState(false);
  const [revision, setRevision] = useState<Record<number, string[]>>({});
  const base = d.compra.base_costo;
  const lineas = d.lineas;
  const provs = d.proveedores;
  const puedeOfertar = editable && permisos.editar;
  const puedeDecidir = editable && permisos.ganadorEditar;

  const idsItems = lineas.map((l) => l.item_id).join(',');
  useEffect(() => {
    if (!idsItems) return;
    supabase.rpc('items_revision', { p_org: organizacionId, p_items: idsItems.split(',').map(Number) }).then(({ data }) =>
      setRevision(Object.fromEntries(((data ?? []) as { item_id: number; motivos: string[] }[]).map((x) => [x.item_id, x.motivos]))));
  }, [supabase, organizacionId, idsItems]);

  // Al entrar con productos sin cantidad, el cursor queda listo en la primera: se escribe, Enter y sigue la siguiente.
  const sinConfirmar = lineas.filter((l) => !l.cantidad_confirmada && !l.ordenada).length;
  useEffect(() => {
    if (!puedeOfertar || sinConfirmar === 0 || document.activeElement?.tagName === 'INPUT') return;
    const primero = lineas.findIndex((l) => !l.cantidad_confirmada && !l.ordenada);
    if (primero >= 0) document.querySelector<HTMLInputElement>(`input[data-qty="${primero}"]`)?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsItems, puedeOfertar]);

  /* ---------- deshacer ---------- */
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

  /* ---------- acciones ---------- */
  const alternarElegida = (l: LineaCompra, p: ProveedorCompra) => {
    if (!puedeDecidir || l.ordenada || !esComparable(ofertaDe(l, p.proveedor_id))) return;
    const ya = l.asignaciones.length === 1 && l.asignaciones[0].proveedor_id === p.proveedor_id && l.asignaciones[0].cantidad === l.cantidad;
    llamar('compra_asignar', { p_linea: l.id, p_asignaciones: ya ? [] : [{ proveedor_id: p.proveedor_id, cantidad: l.cantidad, motivo: 'manual' }] },
      undefined, deshacerAsignacion([l], `asignación de ${l.nombre}`));
  };

  const estrategia = async (tipo: Estrategia) => {
    const { items, sinOferta } = propuestaDeEstrategia(d, tipo, { tolerancia: ajustes.tolerancia / 100, base, soloSinAsignar: ajustes.soloSinAsignar });
    if (items.length === 0) return avisar('error', 'No hay productos con ofertas con costo para decidir (o ya tienen asignación a mano).');
    const previas = d.lineas.filter((l) => items.some((i) => i.linea_id === l.id));
    const nombre = tipo === 'precio' ? 'Más barato' : tipo === 'plazo' ? 'Más rápido' : `Consolidar ${ajustes.tolerancia}%`;
    await llamar('compra_asignar_masivo', { p_compra: d.compra.id, p_items: items, p_detalle: nombre },
      `${items.length} producto(s) asignados${sinOferta ? ` · ${sinOferta} sin ofertas con costo` : ''}`, deshacerAsignacion(previas, nombre));
  };

  const limpiar = async () => {
    const con = d.lineas.filter((l) => !l.ordenada && l.asignaciones.length > 0);
    if (con.length === 0) return;
    await llamar('compra_asignar_masivo', { p_compra: d.compra.id, p_items: con.map((l) => ({ linea_id: l.id, asignaciones: [] })), p_detalle: 'Se quitaron las asignaciones' },
      'Asignaciones quitadas', deshacerAsignacion(con, 'quitar asignaciones'));
  };

  const noLoTiene = (l: LineaCompra, p: ProveedorCompra, o: OfertaCompra | undefined) =>
    llamar('oferta_guardar', { p_linea: l.id, p_proveedor: p.proveedor_id, p_costo: null, p_dias: null, p_observacion: o?.observacion ?? null, p_disponible: false },
      undefined, deshacerOferta(l, p, o));

  /** Guarda lo escrito en la celda: "costo" o "costo/días". Devuelve false si el texto no es válido. */
  const guardarCelda = async (l: LineaCompra, p: ProveedorCompra, o: OfertaCompra | undefined, texto: string): Promise<boolean> => {
    const [tc, td] = texto.split('/');
    if (tc.trim() === '') return true;
    const costo = numeroDeTexto(tc);
    if (costo === undefined || costo <= 0) { avisar('error', 'Costo no válido: escribe un número, por ejemplo 38000 o 38.000'); return false; }
    let dias: number | undefined;
    if (td !== undefined && td.trim() !== '') {
      dias = numeroDeTexto(td);
      if (dias === undefined || !Number.isInteger(dias) || dias < 0) { avisar('error', 'Días no válidos: usa un número entero, por ejemplo 38000/3'); return false; }
    }
    if (o && o.estado === 'respondida' && o.costo === costo && (dias === undefined || dias === o.dias)) return true;
    // Escribir el mismo valor del ERP equivale a "igual al ERP": conserva esa marca
    const igualErp = !!o && o.fuente === 'erp' && o.estado !== 'respondida' && o.precio_erp === costo && dias === undefined;
    const r = igualErp
      ? await llamar('oferta_confirmar_erp', { p_compra: d.compra.id, p_proveedor: p.proveedor_id, p_linea: l.id }, undefined, deshacerOferta(l, p, o))
      : await llamar('oferta_guardar', { p_linea: l.id, p_proveedor: p.proveedor_id, p_costo: costo, p_dias: dias ?? o?.dias ?? null, p_observacion: o?.observacion ?? null, p_disponible: true },
          undefined, deshacerOferta(l, p, o));
    return r.ok;
  };

  const cambiarCantidad = (l: LineaCompra, texto: string) => {
    const n = numeroDeTexto(texto);
    llamar('compra_cambiar_cantidad', { p_compra: d.compra.id, p_linea: l.id, p_cantidad: n }, undefined, {
      texto: `cantidad de ${l.nombre}`,
      accion: () => supabase.rpc('compra_cambiar_cantidad', { p_org: organizacionId, p_compra: d.compra.id, p_linea: l.id, p_cantidad: l.cantidad }),
    });
  };

  const quitarLinea = async (l: LineaCompra) => {
    if (!window.confirm(`¿Quitar "${l.nombre}" de la compra?${l.necesidades > 0 ? ' Sus agotados vuelven a pendientes.' : ''}`)) return;
    await llamar('compra_quitar_linea', { p_compra: d.compra.id, p_linea: l.id }, `${l.nombre} quitado`);
  };

  /* ---------- colores ---------- */
  const reglas = useMemo(() => new Map(ajustes.colores.map((r) => [r.clave, r])), [ajustes.colores]);
  const colorDe = (l: LineaCompra, p: ProveedorCompra, o: OfertaCompra | undefined) => {
    const mejor = mejorOferta(d, l, 'precio', base);
    const rapido = mejorOferta(d, l, 'plazo', base);
    const v = o && o.fuente === 'cotizacion' ? variacionErp(o) : undefined;
    const cumple: Record<ClaveColor, boolean> = {
      asignado: l.asignaciones.some((a) => a.proveedor_id === p.proveedor_id),
      no_tiene: o?.estado === 'no_disponible',
      mejor_precio: !!o && esComparable(o) && mejor?.proveedor_id === p.proveedor_id && l.ofertas.filter(esComparable).length > 1,
      mas_rapido: !!o && esComparable(o) && rapido?.proveedor_id === p.proveedor_id && o.dias !== null && l.ofertas.filter(esComparable).length > 1,
      sobre_erp: v !== undefined && v > 0.05,
      erp_sin_confirmar: !!o && esComparable(o) && o.fuente === 'erp' && o.estado !== 'respondida',
    };
    for (const clave of ORDEN_COLOR) {
      const r = reglas.get(clave);
      if (r?.activa && cumple[clave]) return { color: r.color, clave };
    }
    return null;
  };

  /* ---------- una celda ---------- */
  const celda = (l: LineaCompra, li: number, p: ProveedorCompra, pi: number) => {
    const o = ofertaDe(l, p.proveedor_id);
    const asign = l.asignaciones.find((a) => a.proveedor_id === p.proveedor_id);
    const comparable = esComparable(o);
    const e = o ? ESTADO_OFERTA[o.estado] : null;
    const pintura = colorDe(l, p, o);
    const vErp = o && comparable && o.fuente === 'cotizacion' ? variacionErp(o) : undefined;
    const editableCelda = puedeOfertar && !l.ordenada;
    const guardarYBajar = async (el: HTMLInputElement, dl: number) => {
      const ok = await guardarCelda(l, p, o, el.value);
      if (!ok) { el.value = o?.costo != null ? String(o.costo) : ''; return; }
      if (dl !== 0) document.querySelector<HTMLInputElement>(`input[data-celda="${li + dl}:${pi}"]`)?.focus();
    };
    return (
      <td key={p.proveedor_id}
        style={pintura ? { backgroundColor: `color-mix(in srgb, ${pintura.color} 55%, transparent)` } : undefined}
        title={pintura ? `Se pinta porque ${REGLAS_COLOR[pintura.clave].porque}` : undefined}>
        <div className="pm-celda2">
          {editableCelda ? (
            <input
              key={`${l.id}-${p.proveedor_id}-${o?.costo ?? ''}-${o?.estado ?? ''}-${o?.dias ?? ''}`}
              data-celda={`${li}:${pi}`} className="ui-input ui-input--sm pm-costo" inputMode="decimal"
              defaultValue={o?.estado === 'no_disponible' ? '' : o?.costo != null ? String(o.costo) : ''}
              placeholder={o?.estado === 'no_disponible' ? 'no lo tiene' : o ? 'costo sin IVA' : 'escribe el costo'}
              aria-label={`Costo sin IVA de ${l.nombre} con ${p.nombre}`}
              onFocus={(ev) => ev.currentTarget.select()}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter') { ev.preventDefault(); guardarYBajar(ev.currentTarget, ev.shiftKey ? -1 : 1); }
                else if (ev.key === 'ArrowDown') { ev.preventDefault(); document.querySelector<HTMLInputElement>(`input[data-celda="${li + 1}:${pi}"]`)?.focus(); }
                else if (ev.key === 'ArrowUp') { ev.preventDefault(); document.querySelector<HTMLInputElement>(`input[data-celda="${li - 1}:${pi}"]`)?.focus(); }
                else if (ev.key === 'Escape') { ev.currentTarget.value = o?.costo != null ? String(o.costo) : ''; ev.currentTarget.blur(); }
              }}
              onBlur={(ev) => { guardarYBajar(ev.currentTarget, 0); }}
            />
          ) : (
            <strong>{comparable ? pesos(costoBase(o.costo, p, base)) : o?.estado === 'no_disponible' ? 'No lo tiene' : '—'}</strong>
          )}
          <div className="pm-datos">
            {comparable && <span>con IVA {pesos(costoBase(o.costo, p, 'con_iva'))}{o.dias !== null ? ` · ${o.dias} d` : ''}</span>}
            {pintura && (pintura.clave === 'mejor_precio' || pintura.clave === 'mas_rapido') && <b>{pintura.clave === 'mejor_precio' ? 'más barata' : 'más rápida'}</b>}
            {e && <Badge tono={e.tono} titulo={e.ayuda}>{e.texto}</Badge>}
            {o?.fuente === 'erp' && o.estado === 'respondida' && <Badge tono="verde" titulo="El proveedor confirmó el precio del ERP">= ERP</Badge>}
            {vErp !== undefined && Math.abs(vErp) >= 0.0005 && <Badge tono={vErp > 0.05 ? 'ambar' : 'gris'} titulo="Variación frente al precio del ERP">{vErp > 0 ? '+' : ''}{(vErp * 100).toFixed(1)}% ERP</Badge>}
          </div>
          {o?.observacion && <div className="pm-chico">{o.observacion}</div>}
          <div className="mod-flex mod-gap-1 mod-wrap">
            <button type="button" tabIndex={-1} className={asign ? 'ui-btn ui-btn--sm ui-btn--primary' : 'ui-btn ui-btn--sm'} aria-pressed={!!asign}
              disabled={!puedeDecidir || l.ordenada || !comparable} title={comparable ? 'Asignar todo el producto a este proveedor' : 'Primero necesita un costo'}
              onClick={() => alternarElegida(l, p)}>{asign ? `✔ ${asign.cantidad}` : 'Elegir'}</button>
            {editableCelda && (
              <>
                <button type="button" tabIndex={-1} className="ui-btn ui-btn--sm ui-btn--ghost" title="El proveedor no tiene este producto" aria-label={`${p.nombre} no tiene ${l.nombre}`}
                  disabled={o?.estado === 'no_disponible'} onClick={() => noLoTiene(l, p, o)}>✕</button>
                <button type="button" tabIndex={-1} className="ui-btn ui-btn--sm ui-btn--ghost" title="Observación y más opciones" aria-label={`Detalle de ${p.nombre} para ${l.nombre}`}
                  onClick={() => setModal({ tipo: 'oferta', linea: l, prov: p })}>⋯</button>
              </>
            )}
          </div>
        </div>
      </td>
    );
  };

  const sinOfertasDe = (l: LineaCompra) => !l.ofertas.some((o) => esComparable(o));

  return (
    <div onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !(e.target as HTMLElement).matches('input')) { e.preventDefault(); deshacer(); } }}>
      {editable && (
        <div className="pm-herramientas">
          <div className="pm-herramientas__fila">
            {permisos.editar && (
              <>
                <button type="button" className="ui-btn ui-btn--sm" onClick={() => setModal({ tipo: 'agregar' })}>+ Agregar producto</button>
                <button type="button" className="ui-btn ui-btn--sm" onClick={() => setModal({ tipo: 'consultar' })}>+ Consultar proveedor</button>
              </>
            )}
            <span className="pm-sep" />
            <label className="pm-campo" title="Con IVA = lo que se paga. Sin IVA = costo neto, si el IVA de compra es descontable">
              <span>Comparar por</span>
              <select className="ui-input ui-input--sm" value={base} aria-label="Comparar por" disabled={!permisos.editar}
                onChange={(e) => llamar('compra_base_costo', { p_compra: d.compra.id, p_base: e.target.value })}>
                <option value="con_iva">Costo con IVA</option><option value="sin_iva">Costo sin IVA</option>
              </select>
            </label>
            <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" disabled={!ultimoDeshacer} onClick={deshacer} title="Ctrl+Z">↶ Deshacer{ultimoDeshacer ? `: ${ultimoDeshacer}` : ''}</button>
            <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" aria-expanded={verColores} onClick={() => setVerColores(!verColores)}>🎨 Colores</button>
            <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" aria-expanded={verAyuda} onClick={() => setVerAyuda(!verAyuda)}>? Ayuda</button>
          </div>
          {puedeDecidir && (
            <div className="pm-herramientas__fila">
              <span className="pm-herramientas__titulo">Decidir todo</span>
              <button type="button" className="ui-btn ui-btn--sm" onClick={() => estrategia('precio')} title="El menor costo por producto, según la base elegida">Más barato</button>
              <button type="button" className="ui-btn ui-btn--sm" onClick={() => estrategia('plazo')} title="El menor tiempo de entrega por producto">Más rápido</button>
              <button type="button" className="ui-btn ui-btn--sm" onClick={() => estrategia('consolidar')} title="Concentra en pocos proveedores aceptando pagar hasta la tolerancia más que el mejor precio">Consolidar</button>
              <CampoTolerancia />
              <label className="pm-campo" title="Las estrategias solo deciden lo que aún no tiene asignación">
                <input type="checkbox" checked={ajustes.soloSinAsignar} onChange={(e) => cambiarAjustes({ soloSinAsignar: e.target.checked })} /> <span>solo sin asignar</span>
              </label>
              <span className="pm-sep" />
              <button type="button" className="ui-btn ui-btn--sm" onClick={() => setModal({ tipo: 'escenarios' })}>Comparar propuestas</button>
              <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={limpiar}>Limpiar</button>
            </div>
          )}
        </div>
      )}
      {verColores && <PanelColores />}
      {verAyuda && (
        <div className="mod-card mod-mb-2">
          <table className="mod-table"><tbody>{AYUDA.map(([k, t]) => <tr key={k}><td style={{ whiteSpace: 'nowrap' }}><kbd>{k}</kbd></td><td>{t}</td></tr>)}</tbody></table>
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
        <TablaExcel clave="pedidos-matriz" etiqueta="Productos y ofertas por proveedor">
          <table className="mod-table pm-matriz" aria-label="Productos y ofertas por proveedor">
            <thead>
              <tr>
                <th style={{ minWidth: 240 }}>Producto</th>
                {provs.map((p) => {
                  const est = estadoOfertasProveedor(d, p.proveedor_id);
                  const nErp = porConfirmarErp(d, p.proveedor_id);
                  return (
                    <th key={p.proveedor_id} style={{ minWidth: 190 }}>
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
                          key={`${l.id}-${l.cantidad}-${l.cantidad_confirmada}`} className="ui-input ui-input--sm" inputMode="decimal"
                          style={{ width: 84, borderColor: l.cantidad_confirmada ? undefined : 'var(--color-warning, #d97706)' }}
                          defaultValue={l.cantidad_confirmada ? String(l.cantidad) : ''} placeholder="cantidad" disabled={!puedeOfertar || l.ordenada}
                          aria-label={`Cantidad de ${l.nombre}`} data-qty={li}
                          onFocus={(e) => e.currentTarget.select()}
                          onKeyDown={(e) => {
                            // Enter o ↓ guarda y pasa a la cantidad del producto siguiente; ↑ a la anterior
                            const vecino = (k: number) => document.querySelector<HTMLInputElement>(`input[data-qty="${li + k}"]:not(:disabled)`);
                            if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); const sig = vecino(1); if (sig) sig.focus(); else e.currentTarget.blur(); }
                            else if (e.key === 'ArrowUp') { e.preventDefault(); vecino(-1)?.focus(); }
                          }}
                          onBlur={(e) => {
                            const t = e.currentTarget.value.trim();
                            if (t === '') return;
                            const v = numeroDeTexto(t);
                            if (v === l.cantidad && l.cantidad_confirmada) return;
                            if (v === undefined || v <= 0) { avisar('error', 'La cantidad debe ser un número mayor que cero.'); e.currentTarget.value = l.cantidad_confirmada ? String(l.cantidad) : ''; return; }
                            cambiarCantidad(l, t);
                          }}
                        />
                        <span className="pm-chico">{l.unidad ?? ''}</span>
                        {!l.cantidad_confirmada && <Badge tono="ambar" titulo="Se cotiza sin cantidad. Escríbela antes de emitir la orden.">por confirmar</Badge>}
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
        </TablaExcel>
      )}
      {provs.length === 0 && lineas.length > 0 && editable && (
        <p className="mod-sub mod-mt-2">Aún no consultas a ningún proveedor. Usa “+ Consultar proveedor”: te sugiere los que cubren más productos de esta compra.</p>
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
