'use client';

import { useState } from 'react';
import { useMesa } from '@/components/pedidos/MesaContexto';
import { avisosCompra, costoBase, esComparable, ofertaDe, proveedorDe, resumenCompra } from '@/components/pedidos/reglas';
import { colorCelda } from '@/components/pedidos/colores';
import { ModalEmitir } from '@/components/pedidos/modales';
import { ModalEscenarios } from '@/components/pedidos/Escenarios';
import { MOTIVO } from '@/components/pedidos/tipos';
import { pesos } from '@/components/pedidos/comun';
import { Badge, Vacio } from '@/components/pedidos/ui';

/**
 * Decisión: qué se le compra a quién, por qué, cuánto cuesta en total (con IVA y flete) y qué falta resolver
 * antes de emitir. Cada asignación guarda su motivo (automático o nota propia): es la trazabilidad.
 */
export default function Decision({ alEmitir }: { alEmitir: () => void }) {
  const { d, editable, permisos, llamar, ajustes } = useMesa();
  const [emitiendo, setEmitiendo] = useState(false);
  const [escenarios, setEscenarios] = useState(false);
  const res = resumenCompra(d);
  const avisos = avisosCompra(d);

  if (res.proveedores.length === 0 && editable) {
    return <Vacio titulo="Aún no hay decisiones" texto="Asigna productos a proveedores en la pestaña “Productos y ofertas”: con un clic en una oferta, o aplicando una estrategia a toda la compra." />;
  }

  return (
    <div>
      {avisos.length > 0 && editable && (
        <div className="mod-mb-3">
          <h3 className="mod-h3 mod-mt-0 pm-seccion">Qué revisar</h3>
          <ul className="pm-avisos">
            {avisos.map((a, i) => <li key={i} className={a.nivel}>{a.texto}</li>)}
          </ul>
        </div>
      )}

      {editable && (
        <div className="mod-flex mod-gap-2 mod-center mod-wrap mod-mb-2">
          {permisos.ganadorCrear && (
            <button type="button" className="ui-btn ui-btn--primary" disabled={res.proveedores.length === 0} onClick={() => setEmitiendo(true)}>
              Revisar y emitir {res.proveedores.length} orden(es)
            </button>
          )}
          {permisos.ganadorEditar && <button type="button" className="ui-btn" onClick={() => setEscenarios(true)}>Comparar propuestas</button>}
          <span className="mod-sub">Genera una orden por proveedor. Después la compra no se puede modificar.</span>
        </div>
      )}
      {res.proveedores.length > 0 && (
        <details className="pm-notas">
          <summary>Por qué se eligió cada uno (notas de la decisión)</summary>
          <div className="mod-scroll">
            <table className="mod-table">
              <thead><tr><th>Producto</th><th>Proveedor</th><th>Cantidad</th><th>Motivo</th><th style={{ minWidth: 240 }}>Nota</th></tr></thead>
              <tbody>
                {d.lineas.flatMap((l) => l.asignaciones.map((a) => {
                  const p = proveedorDe(d, a.proveedor_id);
                  return (
                    <tr key={`${l.id}-${a.proveedor_id}`}>
                      <td>{l.nombre}</td><td>{p?.nombre}</td><td>{a.cantidad}</td><td><Badge>{MOTIVO[a.motivo]}</Badge></td>
                      <td>
                        <input key={`${l.id}-${a.proveedor_id}-${a.nota ?? ''}`} className="ui-input ui-input--sm" style={{ width: '100%' }} defaultValue={a.nota ?? ''} disabled={!editable || !permisos.ganadorEditar}
                          placeholder="Ej.: entrega rápida, ya lo conocemos…" aria-label={`Nota de la decisión de ${l.nombre} con ${p?.nombre}`}
                          onBlur={(e) => e.currentTarget.value.trim() !== (a.nota ?? '') && llamar('compra_nota_asignacion', { p_compra: d.compra.id, p_linea: l.id, p_proveedor: a.proveedor_id, p_nota: e.currentTarget.value })} />
                      </td>
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <h3 className="mod-h3 mod-mt-0 pm-seccion">Comparativo de la compra</h3>
      <p className="mod-sub mod-mt-0">Cada fila es un producto y cada columna un proveedor. Clic en una celda para elegir ese proveedor para todo el producto. Los colores son los de “Productos y ofertas”.</p>
      <div className="mod-scroll">
        <table className="mod-table pm-matriz">
          <thead>
            <tr>
              <th>Producto</th><th>Cantidad</th>
              {d.proveedores.map((p) => <th key={p.proveedor_id}>{p.nombre}<div className="pm-chico" style={{ fontWeight: 400 }}>{p.cobra_iva ? `IVA ${Math.round(p.iva_compra * 100)}%` : 'No cobra IVA'}{p.pedido_minimo ? ` · mín. ${pesos(p.pedido_minimo)}` : ''}</div></th>)}
            </tr>
          </thead>
          <tbody>
            {d.lineas.map((l) => (
              <tr key={l.id} className={!l.ordenada && l.asignaciones.length === 0 ? 'pm-fila-alerta' : undefined}>
                <td><strong>{l.nombre}</strong>{l.ordenada && <> <Badge tono="verde">con orden</Badge></>}</td>
                <td>{l.cantidad}{!l.cantidad_confirmada && <> <Badge tono="ambar">por confirmar</Badge></>}</td>
                {d.proveedores.map((p) => {
                  const o = ofertaDe(l, p.proveedor_id);
                  const a = l.asignaciones.find((x) => x.proveedor_id === p.proveedor_id);
                  const pint = colorCelda(d, l, p, d.compra.base_costo, ajustes.colores);
                  const puede = editable && permisos.ganadorEditar && !l.ordenada && esComparable(o);
                  return (
                    <td key={p.proveedor_id} title={pint?.porque} style={{ ...(pint ? { backgroundColor: `color-mix(in srgb, ${pint.color} 55%, transparent)` } : {}), cursor: puede ? 'pointer' : 'default' }}
                      onClick={() => {
                        if (!puede) return;
                        const ya = l.asignaciones.length === 1 && l.asignaciones[0].proveedor_id === p.proveedor_id && l.asignaciones[0].cantidad === l.cantidad;
                        llamar('compra_asignar', { p_linea: l.id, p_asignaciones: ya ? [] : [{ proveedor_id: p.proveedor_id, cantidad: l.cantidad, motivo: 'manual' }] });
                      }}>
                      {esComparable(o) ? (
                        <>
                          <strong>{pesos(costoBase(o.costo, p, d.compra.base_costo))}</strong>
                          <span className="pm-chico">{o.dias !== null ? `${o.dias} d` : ''}{o.estado !== 'respondida' ? ' · sin confirmar' : ''}</span>
                        </>
                      ) : <span className="pm-chico">{o?.estado === 'no_disponible' ? 'No lo tiene' : 'Sin costo'}</span>}
                      {a && <div><Badge tono="verde">✔ {a.cantidad} · {MOTIVO[a.motivo]}</Badge></div>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          {res.proveedores.length > 0 && (
            <tfoot>
              {([
                ['Subtotal', (x: (typeof res.proveedores)[number]) => pesos(x.subtotal)],
                ['IVA', (x) => pesos(x.iva)],
                ['Flete', (x) => (typeof x.proveedor.flete_cotizado === 'number' ? `${pesos(x.flete)} (cotizado)` : x.flete > 0 ? pesos(x.flete) : 'gratis')],
                ['Total con IVA', (x) => pesos(x.total)],
                ['Neto (sin IVA + flete)', (x) => pesos(x.neto)],
              ] as [string, (x: (typeof res.proveedores)[number]) => string][]).map(([titulo, f]) => (
                <tr key={titulo} className={titulo === 'Total con IVA' ? 'pm-total' : undefined}>
                  <td colSpan={2}><strong>{titulo}</strong></td>
                  {d.proveedores.map((p) => {
                    const x = res.proveedores.find((r) => r.proveedor.proveedor_id === p.proveedor_id);
                    return <td key={p.proveedor_id}>{x ? <strong>{f(x)}</strong> : '—'}</td>;
                  })}
                </tr>
              ))}
              <tr>
                <td colSpan={2}><strong>Condiciones</strong></td>
                {d.proveedores.map((p) => {
                  const x = res.proveedores.find((r) => r.proveedor.proveedor_id === p.proveedor_id);
                  return (
                    <td key={p.proveedor_id}>
                      {x && p.pedido_minimo !== null && (x.cumpleMinimo ? <Badge tono="verde">mínimo ok</Badge> : <Badge tono="rojo">bajo el mínimo</Badge>)}{' '}
                      {x?.faltaParaFleteGratis !== undefined && <Badge>faltan {pesos(x.faltaParaFleteGratis)} p/ flete gratis</Badge>}
                    </td>
                  );
                })}
              </tr>
              <tr className="mod-sub"><td colSpan={2 + d.proveedores.length}>Grand total: <strong>{pesos(res.total)}</strong> con IVA y flete · neto {pesos(res.neto)}</td></tr>
            </tfoot>
          )}
        </table>
      </div>

      {escenarios && <ModalEscenarios onCerrar={() => setEscenarios(false)} />}
      {emitiendo && <ModalEmitir onCerrar={() => setEmitiendo(false)} onEmitidas={() => { setEmitiendo(false); alEmitir(); }} />}
    </div>
  );
}

export { ofertaDe };
