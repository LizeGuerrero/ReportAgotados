'use client';

import { useState } from 'react';
import { useMesa } from '@/components/pedidos/MesaContexto';
import { avisosCompra, ofertaDe, proveedorDe, resumenCompra } from '@/components/pedidos/reglas';
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
  const { d, editable, permisos, llamar } = useMesa();
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
          <h3 className="mod-h3 mod-mt-0">Qué revisar</h3>
          <ul className="pm-avisos">
            {avisos.map((a, i) => <li key={i} className={a.nivel}>{a.texto}</li>)}
          </ul>
        </div>
      )}

      <h3 className="mod-h3 mod-mt-0">Qué se compra y a quién</h3>
      <div className="mod-scroll mod-mb-3">
        <table className="mod-table">
          <thead><tr><th>Producto</th><th>Cantidad</th><th>Asignación</th><th>Subtotal c/IVA</th><th style={{ minWidth: 220 }}>Por qué (nota)</th></tr></thead>
          <tbody>
            {d.lineas.map((l) => {
              if (l.ordenada || l.asignaciones.length === 0) {
                return (
                  <tr key={l.id} className={l.ordenada ? '' : 'pm-fila-alerta'}>
                    <td>{l.nombre}</td><td>{l.cantidad}</td>
                    <td colSpan={3}>{l.ordenada ? <Badge tono="verde">Con orden</Badge> : <Badge tono="ambar">Sin asignar</Badge>}</td>
                  </tr>
                );
              }
              return l.asignaciones.map((a, k) => {
                const p = proveedorDe(d, a.proveedor_id);
                const x = res.proveedores.find((r) => r.proveedor.proveedor_id === a.proveedor_id)?.lineas.find((y) => y.linea.id === l.id);
                return (
                  <tr key={`${l.id}-${a.proveedor_id}`}>
                    <td>{k === 0 ? l.nombre : ''}</td><td>{k === 0 ? l.cantidad : ''}</td>
                    <td><span className="pm-chip">{a.cantidad} · {p?.nombre}</span> <Badge>{MOTIVO[a.motivo]}</Badge></td>
                    <td>{x ? pesos(x.costo * a.cantidad + x.ivaMonto) : '—'}</td>
                    <td>
                      <input
                        key={`${l.id}-${a.proveedor_id}-${a.nota ?? ''}`}
                        className="ui-input ui-input--sm" style={{ width: '100%' }}
                        defaultValue={a.nota ?? ''} disabled={!editable || !permisos.ganadorEditar}
                        placeholder="Ej.: entrega rápida, ya lo conocemos…"
                        aria-label={`Nota de la decisión de ${l.nombre} con ${p?.nombre}`}
                        onBlur={(e) => e.currentTarget.value.trim() !== (a.nota ?? '') && llamar('compra_nota_asignacion', { p_compra: d.compra.id, p_linea: l.id, p_proveedor: a.proveedor_id, p_nota: e.currentTarget.value })}
                      />
                    </td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>

      {res.proveedores.length > 0 && (
        <>
          <h3 className="mod-h3 mod-mt-0">Totales por proveedor</h3>
          <div className="mod-scroll">
            <table className="mod-table">
              <thead>
                <tr>
                  <th>Proveedor</th><th>Productos</th><th>Subtotal</th><th>IVA</th><th>Flete</th><th>Total con IVA</th>
                  <th title="Subtotal sin IVA + flete: lo que cuesta si el IVA de compra es descontable">Neto (sin IVA + flete)</th><th>Condiciones</th>
                </tr>
              </thead>
              <tbody>
                {res.proveedores.map((r) => (
                  <tr key={r.proveedor.proveedor_id}>
                    <td>{r.proveedor.nombre}</td><td>{r.lineas.length}</td><td>{pesos(r.subtotal)}</td><td>{pesos(r.iva)}</td>
                    <td>{r.flete > 0 ? pesos(r.flete) : <span className="mod-sub">gratis</span>}</td><td><b>{pesos(r.total)}</b></td><td>{pesos(r.neto)}</td>
                    <td>
                      {r.proveedor.pedido_minimo !== null && (r.cumpleMinimo ? <Badge tono="verde">mínimo ok</Badge> : <Badge tono="rojo">bajo el mínimo</Badge>)}{' '}
                      {r.faltaParaFleteGratis !== undefined && <Badge>faltan {pesos(r.faltaParaFleteGratis)} p/ flete gratis</Badge>}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={2}><b>Total de la compra</b></td><td>{pesos(res.subtotal)}</td><td>{pesos(res.iva)}</td><td>{pesos(res.flete)}</td>
                  <td><b>{pesos(res.total)}</b></td><td><b>{pesos(res.neto)}</b></td><td />
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      {editable && (
        <div className="mod-flex mod-gap-2 mod-center mod-wrap mod-mt-3">
          {permisos.ganadorCrear && (
            <button type="button" className="ui-btn ui-btn--primary" disabled={res.proveedores.length === 0} onClick={() => setEmitiendo(true)}>
              Revisar y emitir {res.proveedores.length} orden(es)
            </button>
          )}
          {permisos.ganadorEditar && <button type="button" className="ui-btn" onClick={() => setEscenarios(true)}>Comparar propuestas</button>}
          <span className="mod-sub">Genera una orden por proveedor. Después la compra no se puede modificar.</span>
        </div>
      )}
      {escenarios && <ModalEscenarios onCerrar={() => setEscenarios(false)} />}
      {emitiendo && <ModalEmitir onCerrar={() => setEmitiendo(false)} onEmitidas={() => { setEmitiendo(false); alEmitir(); }} />}
    </div>
  );
}

export { ofertaDe };
