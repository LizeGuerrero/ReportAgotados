'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Inicio, { type Destino } from '@/components/pedidos/Inicio';
import Necesidades from '@/components/pedidos/Necesidades';
import ListaCompras from '@/components/pedidos/ListaCompras';
import Mesa from '@/components/pedidos/Mesa';
import OrdenesCompra from '@/components/pedidos/OrdenesCompra';
import Historial from '@/components/pedidos/Historial';
import ItemsProvisionales from '@/components/pedidos/ItemsProvisionales';
import { usePermisosPedidos } from '@/components/pedidos/usePermisosPedidos';

type Pestana = 'inicio' | 'agotados' | 'compras' | 'ordenes' | 'historial' | 'provisionales';

/**
 * Pedidos. El flujo del prototipo, alimentado por los agotados reales:
 *   Agotados por atender (las necesidades) → Compras (cotizar, comparar, decidir) → Órdenes de compra.
 * Con Inicio (qué necesita atención) e Historial de todo lo decidido. Los mensajes se configuran en el módulo Mensajes.
 */
export default function PedidosCompras({ organizacionId }: { organizacionId: string }) {
  const [supabase] = useState(() => createClient());
  const permisos = usePermisosPedidos(supabase, organizacionId);
  const [pestana, setPestana] = useState<Pestana>('inicio');
  const [compraId, setCompraId] = useState<string | null>(null);
  const { slug } = useParams<{ slug: string }>();
  const [verMensajes, setVerMensajes] = useState(false);
  useEffect(() => {
    supabase.rpc('tiene_permiso', { p_organizacion_id: organizacionId, p_modulo: 'mensajes', p_accion: 'ver' }).then(({ data }) => setVerMensajes(data === true));
  }, [supabase, organizacionId]);

  const ir = (d: Destino) => { setPestana(d.pestana); setCompraId(d.pestana === 'compras' ? (d.compraId ?? null) : null); };
  const abrirCompra = (id: string) => ir({ pestana: 'compras', compraId: id });

  const pestanas: { valor: Pestana; texto: string }[] = [
    { valor: 'inicio', texto: 'Inicio' },
    { valor: 'agotados', texto: 'Agotados por atender' },
    { valor: 'compras', texto: 'Compras' },
    { valor: 'ordenes', texto: 'Órdenes de compra' },
    { valor: 'historial', texto: 'Historial' },
    { valor: 'provisionales', texto: 'Ítems provisionales' },
  ];

  return (
    <div>
      {/* Dentro de una compra el menú general se oculta (una sola fila de pestañas); "← Compras" regresa a él. */}
      {!(pestana === 'compras' && compraId) && (
      <div className="mod-tabs" role="tablist">
        {pestanas.map((p) => (
          <button key={p.valor} type="button" role="tab" aria-selected={pestana === p.valor} aria-current={pestana === p.valor}
            className={pestana === p.valor ? 'mod-tab is-active' : 'mod-tab'}
            onClick={() => { setPestana(p.valor); if (p.valor !== 'compras') setCompraId(null); }}>
            {p.texto}
          </button>
        ))}
        {verMensajes && (
          <a className="mod-tab" href={`/app/${slug}/mensajes`} style={{ marginLeft: 'auto' }} title="Estructuras de los mensajes a proveedores (cotizaciones y órdenes)">✉ Mensajes</a>
        )}
      </div>
      )}

      {pestana === 'inicio' && <Inicio supabase={supabase} organizacionId={organizacionId} onIr={ir} />}
      {pestana === 'agotados' && <Necesidades supabase={supabase} organizacionId={organizacionId} permisos={permisos} onAbrirCompra={abrirCompra} />}
      {pestana === 'compras' && (compraId
        ? <Mesa key={compraId} supabase={supabase} organizacionId={organizacionId} compraId={compraId} permisos={permisos} onVolver={() => setCompraId(null)} onAbrirCompra={abrirCompra} />
        : <ListaCompras supabase={supabase} organizacionId={organizacionId} permisos={permisos} onAbrir={abrirCompra} onIrANecesidades={() => ir({ pestana: 'agotados' })} />)}
      {pestana === 'ordenes' && <OrdenesCompra supabase={supabase} organizacionId={organizacionId} permisos={permisos} onAbrirCompra={abrirCompra} />}
      {pestana === 'historial' && <Historial supabase={supabase} organizacionId={organizacionId} onAbrirCompra={abrirCompra} />}
      {pestana === 'provisionales' && <ItemsProvisionales supabase={supabase} organizacionId={organizacionId} />}
    </div>
  );
}
