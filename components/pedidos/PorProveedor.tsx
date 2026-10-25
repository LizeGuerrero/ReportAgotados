'use client';

import { useEffect, useState } from 'react';
import { useMesa } from '@/components/pedidos/MesaContexto';
import { costoBase, esComparable, estadoOfertasProveedor, ofertaDe, porConfirmarErp, resumenCompra } from '@/components/pedidos/reglas';
import { ModalCatalogoProveedor, ModalConsultar } from '@/components/pedidos/modales';
import MensajeProveedor from '@/components/pedidos/MensajeProveedor';
import CondicionesProveedor from '@/components/pedidos/CondicionesProveedor';
import { ESTADO_OFERTA, type ProveedorCompra } from '@/components/pedidos/tipos';
import { Badge, Vacio } from '@/components/pedidos/ui';
import { pesos } from '@/components/pedidos/comun';

type Modal = null | { tipo: 'mensaje' | 'catalogo' | 'condiciones'; prov: ProveedorCompra } | { tipo: 'consultar' };
interface Sugerencia { proveedor_id: number; nombre: string; documento: string; cubre: number; total: number; consultado: boolean }

/**
 * Vista "por proveedor": cada proveedor consultado con lo que puede suministrar, su estado de cotización,
 * lo ya asignado y si cumple su pedido mínimo / flete gratis. Desde aquí se agregan productos de SU catálogo
 * aunque nadie los haya pedido (p. ej. "ya que le escribo, le pido también esto").
 */
export default function PorProveedor() {
  const { d, editable, permisos, llamar, supabase, organizacionId } = useMesa();
  const [modal, setModal] = useState<Modal>(null);
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);
  const res = resumenCompra(d);
  const base = d.compra.base_costo;
  const puede = editable && permisos.editar;

  useEffect(() => {
    if (!editable || d.lineas.length === 0) { setSugerencias([]); return; }
    supabase.rpc('compra_buscar_proveedores', { p_org: organizacionId, p_compra: d.compra.id, p_busqueda: null, p_limit: 40 }).then(({ data }) =>
      setSugerencias(((data ?? []) as Sugerencia[]).filter((s) => !s.consultado && s.cubre > 0).slice(0, 6)));
  }, [supabase, organizacionId, d.compra.id, d.proveedores.length, d.lineas.length, editable]);

  return (
    <div>
      {editable && permisos.editar && (
        <div className="mod-toolbar mod-toolbar--top">
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => setModal({ tipo: 'consultar' })}>+ Consultar proveedor</button>
        </div>
      )}
      {d.proveedores.length === 0 ? (
        <Vacio titulo="Aún no consultas a ningún proveedor" texto="Estos son los que mejor cubren los productos de esta compra:" />
      ) : (
        <div className="pm-tarjetas pm-tarjetas--anchas">
          {d.proveedores.map((p) => {
            const est = estadoOfertasProveedor(d, p.proveedor_id);
            const r = res.proveedores.find((x) => x.proveedor.proveedor_id === p.proveedor_id);
            const lineas = d.lineas.filter((l) => ofertaDe(l, p.proveedor_id));
            const sinOferta = d.lineas.filter((l) => !ofertaDe(l, p.proveedor_id));
            const nErp = porConfirmarErp(d, p.proveedor_id);
            return (
              <div key={p.proveedor_id} className="mod-card">
                <div className="mod-flex mod-gap-2 mod-center">
                  <strong>{p.nombre}</strong><span className="mod-sub">{p.documento}</span><span className="pm-sep" />
                  <Badge>{est.total} de {d.lineas.length} productos</Badge>
                </div>
                <div className="mod-sub mod-mb-2">
                  {p.pedido_minimo !== null && <>Pedido mínimo {pesos(p.pedido_minimo)}. </>}
                  {p.flete_gratis_desde !== null && <>Flete gratis desde {pesos(p.flete_gratis_desde)} (hoy {pesos(p.flete_estandar ?? 0)}). </>}
                  {p.dias_tipicos !== null && <>Entrega típica {p.dias_tipicos} d. </>}
                  {!p.cobra_iva && <>No cobra IVA.</>}
                  {permisos.editar && <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => setModal({ tipo: 'condiciones', prov: p })}>Editar condiciones</button>}
                </div>
                <div className="mod-flex mod-gap-1 mod-wrap mod-mb-2">
                  {est.respondidas > 0 && <Badge tono="verde">{est.respondidas} cotizadas</Badge>}
                  {est.pedidas > 0 && <Badge tono="ambar">{est.pedidas} pedidas</Badge>}
                  {est.estimadas > 0 && <Badge>{est.estimadas} con precio ERP</Badge>}
                  {est.noDisponibles > 0 && <Badge tono="rojo">{est.noDisponibles} no los tiene</Badge>}
                </div>
                <div className="mod-sub">Costos {base === 'con_iva' ? 'con IVA' : 'sin IVA'} (cámbialo en “Productos y ofertas”)</div>
                <table className="mod-table" style={{ fontSize: 12 }}>
                  <tbody>
                    {lineas.map((l) => {
                      const o = ofertaDe(l, p.proveedor_id)!;
                      const a = l.asignaciones.find((x) => x.proveedor_id === p.proveedor_id);
                      const e = ESTADO_OFERTA[o.estado];
                      return (
                        <tr key={l.id}>
                          <td>{l.nombre}<div className="mod-sub">{l.cantidad} {l.unidad ?? ''}</div></td>
                          <td>{esComparable(o) ? pesos(costoBase(o.costo, p, base)) : '—'}<div><Badge tono={e.tono} titulo={e.ayuda}>{e.texto}</Badge></div></td>
                          <td>
                            {a ? <Badge tono="verde">✔ {a.cantidad}</Badge> : (
                              <button type="button" className="ui-btn ui-btn--sm" disabled={!editable || l.ordenada || !permisos.ganadorEditar || !esComparable(o)}
                                onClick={() => llamar('compra_asignar', { p_linea: l.id, p_asignaciones: [{ proveedor_id: p.proveedor_id, cantidad: l.cantidad, motivo: 'manual' }] })}>Asignar</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {sinOferta.length > 0 && <p className="mod-sub">Sin oferta para: {sinOferta.map((l) => l.nombre).join(', ')}</p>}
                {r && (
                  <div className="mod-mt-2">
                    Asignado: <strong>{pesos(r.subtotal)}</strong> antes de IVA
                    {p.pedido_minimo !== null && <> · <span style={{ color: r.cumpleMinimo ? 'var(--color-success, #15803d)' : 'var(--color-danger, #b91c1c)' }}>{r.cumpleMinimo ? 'cumple el mínimo' : `falta ${pesos(p.pedido_minimo - r.subtotal)} para el mínimo`}</span></>}
                    {r.faltaParaFleteGratis !== undefined && <> · faltan {pesos(r.faltaParaFleteGratis)} para flete gratis</>}
                  </div>
                )}
                {puede && (
                  <div className="mod-flex mod-gap-1 mod-wrap mod-mt-2">
                    <button type="button" className="ui-btn ui-btn--sm" onClick={() => setModal({ tipo: 'mensaje', prov: p })}>Pedir cotización</button>
                    {nErp > 0 && (
                      <button type="button" className="ui-btn ui-btn--sm" title="El proveedor cotizó lo mismo que el ERP"
                        onClick={() => llamar('oferta_confirmar_erp', { p_compra: d.compra.id, p_proveedor: p.proveedor_id }, (n) => `${n} producto(s) confirmados al precio del ERP`)}>✓ Igual al ERP ({nErp})</button>
                    )}
                    <button type="button" className="ui-btn ui-btn--sm" onClick={() => setModal({ tipo: 'catalogo', prov: p })}>+ Productos de su catálogo</button>
                    <span className="pm-sep" />
                    <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost"
                      onClick={() => window.confirm(`¿Quitar a ${p.nombre}?`) && llamar('compra_quitar_proveedor', { p_compra: d.compra.id, p_proveedor: p.proveedor_id }, `${p.nombre} quitado`)}>Quitar</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editable && sugerencias.length > 0 && d.lineas.length > 0 && (
        <>
          <h3 className="mod-h3">Otros proveedores que podrían cubrir esta compra</h3>
          <div className="mod-scroll">
            <table className="mod-table">
              <tbody>
                {sugerencias.map((s) => (
                  <tr key={s.proveedor_id}>
                    <td><b>{s.nombre}</b> <span className="mod-sub">{s.documento}</span></td>
                    <td>cubre {s.cubre} de {s.total}</td>
                    <td>{permisos.editar && <button type="button" className="ui-btn ui-btn--sm" onClick={() => llamar('compra_consultar_proveedor', { p_compra: d.compra.id, p_proveedor: s.proveedor_id, p_con_catalogo: false, p_cantidad: null }, `Se consultará a ${s.nombre}`)}>Consultar</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {modal?.tipo === 'mensaje' && <MensajeProveedor tipo="cotizacion" proveedor={modal.prov} onCerrar={() => setModal(null)} />}
      {modal?.tipo === 'catalogo' && <ModalCatalogoProveedor prov={modal.prov} onCerrar={() => setModal(null)} />}
      {modal?.tipo === 'condiciones' && <CondicionesProveedor prov={modal.prov} onCerrar={() => setModal(null)} />}
      {modal?.tipo === 'consultar' && <ModalConsultar onCerrar={() => setModal(null)} />}
    </div>
  );
}
