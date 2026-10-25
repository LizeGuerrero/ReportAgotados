'use client';

import { Fragment, useState } from 'react';
import { useMesa } from '@/components/pedidos/MesaContexto';
import { propuestaDeEstrategia, resumenCompra, simularEstrategia, type Estrategia, type OpcionesEstrategia } from '@/components/pedidos/reglas';
import type { BaseCosto } from '@/components/pedidos/tipos';
import { pesos } from '@/components/pedidos/comun';
import { Modal } from '@/components/pedidos/ui';

interface Escenario { clave: string; etiqueta: string; tipo: Estrategia; base: BaseCosto }

/**
 * Cada fila es una PROPUESTA DE COMPRA completa para toda la compra: reparte los productos entre uno o varios
 * proveedores. Se compara sin aplicar nada: qué proveedores entran, cuánto sale de caja (total con IVA) y cuánto
 * cuesta realmente si el IVA de compra es descontable (neto = subtotal sin IVA + flete).
 */
export function ModalEscenarios({ onCerrar }: { onCerrar: () => void }) {
  const { d, llamar, ajustes } = useMesa();
  const [abierta, setAbierta] = useState<string | null>(null);
  const tol = ajustes.tolerancia;
  const escenarios: Escenario[] = [
    { clave: 'p-iva', etiqueta: 'Más barato (comparando con IVA)', tipo: 'precio', base: 'con_iva' },
    { clave: 'p-sin', etiqueta: 'Más barato (comparando sin IVA)', tipo: 'precio', base: 'sin_iva' },
    { clave: 'plazo', etiqueta: 'Más rápido', tipo: 'plazo', base: d.compra.base_costo },
    { clave: 'c-iva', etiqueta: `Consolidar ${tol}% (con IVA)`, tipo: 'consolidar', base: 'con_iva' },
    { clave: 'c-sin', etiqueta: `Consolidar ${tol}% (sin IVA)`, tipo: 'consolidar', base: 'sin_iva' },
  ];
  const opciones = (e: Escenario): OpcionesEstrategia => ({ tolerancia: tol / 100, base: e.base, soloSinAsignar: ajustes.soloSinAsignar });
  const filas = escenarios.map((e) => ({ e, r: simularEstrategia(d, e.tipo, opciones(e)) }));
  const validas = filas.filter((f) => f.r.proveedores.length > 0);
  const minTotal = Math.min(...validas.map((f) => f.r.total));
  const minNeto = Math.min(...validas.map((f) => f.r.neto));
  const hoy = resumenCompra(d);
  const nombres = (r: ReturnType<typeof resumenCompra>) => r.proveedores.map((x) => x.proveedor.nombre).join(' · ');

  const aplicar = async (e: Escenario) => {
    const { items } = propuestaDeEstrategia(d, e.tipo, opciones(e));
    const previas = d.lineas.filter((l) => items.some((i) => i.linea_id === l.id));
    const r = await llamar('compra_asignar_masivo', { p_compra: d.compra.id, p_items: items, p_detalle: e.etiqueta },
      `${e.etiqueta}: ${items.length} producto(s) asignados`, {
        texto: e.etiqueta,
        accion: async () => {
          const x = await llamar('compra_asignar_masivo', {
            p_compra: d.compra.id,
            p_items: previas.map((l) => ({ linea_id: l.id, asignaciones: l.asignaciones.map((a) => ({ proveedor_id: a.proveedor_id, cantidad: a.cantidad, motivo: a.motivo, nota: a.nota })) })),
          });
          return { error: x.ok ? null : { message: 'No se pudo deshacer' } };
        },
      });
    if (r.ok) onCerrar();
  };

  return (
    <Modal titulo="Comparar propuestas de compra" onCerrar={onCerrar} ancha>
      <p className="mod-text mod-mt-0">
        Cada fila es una <b>propuesta completa</b> para esta compra: reparte los productos entre uno o varios proveedores (y de cada uno saldría una orden).
        <b> Total con IVA</b> es lo que sale de caja; <b>Neto</b> es subtotal sin IVA + flete, lo que cuesta si el IVA de compra es descontable.
        Si la misma propuesta gana en ambos, la decisión es clara; si no, depende de ese criterio. Abre una para ver qué le toca a cada proveedor.
      </p>
      <div className="mod-scroll">
        <table className="mod-table">
          <thead>
            <tr><th>Propuesta</th><th>Proveedores (una orden por cada uno)</th><th>Subtotal</th><th>IVA</th><th>Flete</th><th>Total con IVA</th><th>Neto (sin IVA + flete)</th><th /></tr>
          </thead>
          <tbody>
            {hoy.proveedores.length > 0 && (
              <tr className="is-selected">
                <td><b>Estado actual</b><span className="pm-chico">{hoy.completas.length} producto(s) asignados</span></td>
                <td>{nombres(hoy)}</td><td>{pesos(hoy.subtotal)}</td><td>{pesos(hoy.iva)}</td><td>{pesos(hoy.flete)}</td><td>{pesos(hoy.total)}</td><td>{pesos(hoy.neto)}</td><td />
              </tr>
            )}
            {filas.map(({ e, r }) => (
              <Fragment key={e.clave}>
                <tr>
                  <td><b>{e.etiqueta}</b>{r.proveedores.length > 0 && <span className="pm-chico">{r.completas.length} producto(s) asignados</span>}</td>
                  {r.proveedores.length === 0 ? <td colSpan={6}>Sin ofertas con costo para decidir</td> : (
                    <>
                      <td>{r.proveedores.map((x) => <span key={x.proveedor.proveedor_id} className="ui-badge" style={{ marginRight: 4 }}>{x.proveedor.nombre} · {pesos(x.total)}</span>)}</td>
                      <td>{pesos(r.subtotal)}</td><td>{pesos(r.iva)}</td><td>{r.flete > 0 ? pesos(r.flete) : 'gratis'}</td>
                      <td style={r.total === minTotal ? { fontWeight: 700, color: 'var(--color-success, #15803d)' } : undefined}>{pesos(r.total)}{r.total === minTotal && ' ✓'}</td>
                      <td style={r.neto === minNeto ? { fontWeight: 700, color: 'var(--color-success, #15803d)' } : undefined}>{pesos(r.neto)}{r.neto === minNeto && ' ✓'}</td>
                    </>
                  )}
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button type="button" className="ui-btn ui-btn--sm" disabled={r.proveedores.length === 0} aria-expanded={abierta === e.clave}
                      onClick={() => setAbierta(abierta === e.clave ? null : e.clave)}>{abierta === e.clave ? 'Ocultar' : 'Ver detalle'}</button>{' '}
                    <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" disabled={r.proveedores.length === 0} onClick={() => aplicar(e)}>Aplicar</button>
                  </td>
                </tr>
                {abierta === e.clave && (
                  <tr>
                    <td colSpan={8}>
                      <table className="mod-table">
                        <thead><tr><th>Proveedor</th><th>Productos que le tocan</th><th>Subtotal</th><th>Flete</th><th>Total con IVA</th><th>Neto</th><th>Condiciones</th></tr></thead>
                        <tbody>
                          {r.proveedores.map((x) => (
                            <tr key={x.proveedor.proveedor_id}>
                              <td><b>{x.proveedor.nombre}</b>{!x.proveedor.cobra_iva && <span className="pm-chico">No cobra IVA</span>}</td>
                              <td>{x.lineas.map((y) => `${y.cantidad} × ${y.linea.nombre}`).join('; ')}</td>
                              <td>{pesos(x.subtotal)}</td><td>{x.flete > 0 ? pesos(x.flete) : 'gratis'}</td><td>{pesos(x.total)}</td><td>{pesos(x.neto)}</td>
                              <td>
                                {x.proveedor.pedido_minimo !== null && (x.cumpleMinimo ? <span className="ui-badge ui-badge--success">mínimo ok</span> : <span className="ui-badge ui-badge--danger">bajo el mínimo</span>)}{' '}
                                {x.faltaParaFleteGratis !== undefined && <span className="ui-badge">faltan {pesos(x.faltaParaFleteGratis)} p/ flete gratis</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mod-sub mod-mt-2">✓ = el menor de la columna. Lo que ya elegiste a mano no se modifica{ajustes.soloSinAsignar ? ' y solo se deciden los productos sin asignar (ajuste activo)' : ''}.</p>
    </Modal>
  );
}
