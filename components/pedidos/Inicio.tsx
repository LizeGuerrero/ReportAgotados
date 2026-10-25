'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useParams } from 'next/navigation';
import { useTiempoReal } from '@/components/useTiempoReal';
import { fecha, pesos } from '@/components/pedidos/comun';
import { avisosCompra, estadoOfertasProveedor, resumenCompra, siguientePaso } from '@/components/pedidos/reglas';
import { numeroCompra, type CompraDetalle } from '@/components/pedidos/tipos';
import { Etapas, Vacio } from '@/components/pedidos/ui';
import { useComprasDetalle } from '@/components/pedidos/ListaCompras';

interface Evento { id: number; fecha: string; tipo: string; texto: string; compra_numero: number | null }
export type Destino = { pestana: 'agotados' | 'compras' | 'ordenes' | 'historial'; compraId?: string };

/** Qué necesita atención hoy: lo pendiente de un vistazo; cada tarjeta lleva a donde se resuelve. */
export default function Inicio({
  supabase, organizacionId, onIr,
}: { supabase: SupabaseClient; organizacionId: string; onIr: (d: Destino) => void }) {
  const { slug } = useParams<{ slug: string }>();
  const { compras } = useComprasDetalle(supabase, organizacionId, true);
  const [pendientes, setPendientes] = useState(0);
  const [sinEnviar, setSinEnviar] = useState(0);
  const [porRevisar, setPorRevisar] = useState(0);
  const [eventos, setEventos] = useState<Evento[]>([]);

  const cargar = async () => {
    const [a, b, c, d] = await Promise.all([
      supabase.rpc('compra_atencion', { p_org: organizacionId }),
      supabase.rpc('items_por_revisar_count', { p_org: organizacionId }),
      supabase.rpc('historial_listar', { p_org: organizacionId, p_limit: 8, p_offset: 0 }),
      Promise.resolve(null),
    ]);
    void d;
    if (a.data) { setPendientes(a.data.agotados_pendientes); setSinEnviar(a.data.ordenes_sin_enviar); }
    if (typeof b.data === 'number') setPorRevisar(b.data);
    if (c.data) setEventos(c.data as Evento[]);
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [supabase, organizacionId]);
  useTiempoReal(supabase, organizacionId, ['agotados', 'compras', 'ordenes_compra'], cargar);

  const enCurso = compras.filter((c) => c.compra.estado !== 'ordenada');
  const sinConsultar = enCurso.filter((c) => c.proveedores.length === 0);
  const conPedidas = enCurso.filter((c) => c.proveedores.some((p) => estadoOfertasProveedor(c, p.proveedor_id).pedidas > 0));
  const pedidasTotal = conPedidas.reduce((s, c) => s + c.proveedores.reduce((x, p) => x + estadoOfertasProveedor(c, p.proveedor_id).pedidas, 0), 0);
  const porDecidir = enCurso.filter((c) => c.compra.estado === 'decidiendo');
  const conErrores = porDecidir.filter((c) => avisosCompra(c).some((a) => a.nivel === 'error'));
  const ir = (c?: CompraDetalle): Destino => (c ? { pestana: 'compras', compraId: c.compra.id } : { pestana: 'compras' });

  const tarjetas: { n: number; titulo: string; texto: string; destino: Destino | { href: string } }[] = [
    { n: pendientes, titulo: 'Agotados por atender', texto: 'Aún no están en ninguna compra', destino: { pestana: 'agotados' } },
    { n: sinConsultar.length, titulo: 'Compras sin proveedores', texto: 'Falta elegir a quién consultar', destino: ir(sinConsultar[0]) },
    { n: pedidasTotal, titulo: 'Cotizaciones sin respuesta', texto: `en ${conPedidas.length} compra(s)`, destino: ir(conPedidas[0]) },
    { n: porDecidir.length, titulo: 'Decisiones en curso', texto: conErrores.length ? `${conErrores.length} con errores por corregir` : 'Listas para revisar y emitir', destino: ir(porDecidir[0]) },
    { n: sinEnviar, titulo: 'Órdenes sin enviar', texto: 'Emitidas, pendientes de salir', destino: { pestana: 'ordenes' } },
    { n: porRevisar, titulo: 'Ítems por revisar', texto: 'Datos incompletos o sin proveedor', destino: { href: `/app/${slug}/items` } },
  ];
  const hayAtencion = tarjetas.some((t) => t.n > 0);

  return (
    <div>
      <div className="pm-cab">
        <div>
          <h2 className="mod-h2 mod-mt-0 mod-mb-0">Qué necesita atención</h2>
          <p className="mod-text mod-mt-0">Lo que está pendiente hoy, de un vistazo. Cada tarjeta lleva directo a donde se resuelve.</p>
        </div>
        <button type="button" className="ui-btn ui-btn--primary" onClick={() => onIr({ pestana: 'agotados' })}>Empezar una compra</button>
      </div>

      {!hayAtencion && <Vacio titulo="Todo al día" texto="No hay agotados, cotizaciones ni órdenes pendientes." />}
      <div className="pm-tarjetas">
        {tarjetas.map((t) => {
          const contenido = (
            <>
              <div className="pm-atencion__n">{t.n}</div>
              <strong>{t.titulo}</strong>
              <div className="mod-sub">{t.texto}</div>
            </>
          );
          const clase = `pm-atencion${t.n === 0 ? ' is-cero' : ''}`;
          return 'href' in t.destino
            ? <a key={t.titulo} href={t.destino.href} className={clase}>{contenido}</a>
            : <button key={t.titulo} type="button" className={clase} onClick={() => onIr(t.destino as Destino)}>{contenido}</button>;
        })}
      </div>

      <h3 className="mod-h3">Compras en curso</h3>
      {compras.length === 0 ? (
        <Vacio titulo="No hay compras en curso" texto="Agrupa los agotados pendientes en una compra para empezar a cotizar y decidir.">
          <button type="button" className="ui-btn ui-btn--primary" onClick={() => onIr({ pestana: 'agotados' })}>Ver agotados por atender</button>
        </Vacio>
      ) : (
        <div className="pm-tarjetas pm-tarjetas--anchas">
          {compras.map((c) => {
            const res = resumenCompra(c);
            const guia = siguientePaso(c);
            const pct = c.lineas.length ? Math.round((res.completas.length / c.lineas.length) * 100) : 0;
            return (
              <button key={c.compra.id} type="button" className="pm-atencion" onClick={() => onIr({ pestana: 'compras', compraId: c.compra.id })}>
                <div className="mod-flex mod-gap-2"><strong>{numeroCompra(c.compra.numero)}</strong><span className="pm-sep" /><span className="mod-sub">{c.lineas.length} producto(s)</span></div>
                <div className="mod-mb-1">{c.compra.titulo}</div>
                <Etapas estado={c.compra.estado} />
                <div className="pm-prog" title={`${pct}% de los productos asignados`}><i style={{ width: `${pct}%` }} /></div>
                <div className="mod-sub mod-mt-1">{guia.texto}</div>
                {res.total > 0 && <div className="mod-mt-1"><strong>{pesos(res.total)}</strong> decidido (con IVA y flete)</div>}
              </button>
            );
          })}
        </div>
      )}

      <h3 className="mod-h3">Actividad reciente</h3>
      <div className="mod-card">
        {eventos.length === 0 ? <span className="mod-sub">Sin actividad todavía.</span> : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {eventos.map((e) => <li key={e.id}><span className="mod-sub">{fecha(e.fecha)}</span> · {e.texto}</li>)}
          </ul>
        )}
        <div className="mod-mt-2"><button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => onIr({ pestana: 'historial' })}>Ver todo el historial →</button></div>
      </div>
    </div>
  );
}
