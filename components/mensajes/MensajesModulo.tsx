'use client';

import { useState } from 'react';
import EstructurasMensajes from '@/components/mensajes/EstructurasMensajes';
import MensajesConfig from '@/components/cxp/MensajesConfig';

type Pestana = 'pedidos' | 'cxp';

/**
 * Módulo único de Mensajes: una pestaña por cada proceso que envía mensajes a proveedores. Hoy: Pedidos (solicitudes
 * de cotización y órdenes de compra, con estructuras con nombre) y Cuentas por pagar (aviso de pago).
 */
export default function MensajesModulo({
  organizacionId, empresa, usuario, puedeEditarPedidos, verPedidos, verCxp,
}: {
  organizacionId: string; empresa: string; usuario: string; puedeEditarPedidos: boolean; verPedidos: boolean; verCxp: boolean;
}) {
  const pestanas = ([verPedidos && { valor: 'pedidos', texto: 'Pedidos' }, verCxp && { valor: 'cxp', texto: 'Cuentas por pagar' }].filter(Boolean)) as { valor: Pestana; texto: string }[];
  const [pestana, setPestana] = useState<Pestana>(pestanas[0]?.valor ?? 'pedidos');

  return (
    <div>
      {pestanas.length > 1 && (
        <div className="mod-tabs" role="tablist">
          {pestanas.map((p) => (
            <button key={p.valor} type="button" role="tab" aria-selected={pestana === p.valor} aria-current={pestana === p.valor}
              className={pestana === p.valor ? 'mod-tab is-active' : 'mod-tab'} onClick={() => setPestana(p.valor)}>{p.texto}</button>
          ))}
        </div>
      )}
      {pestana === 'pedidos' && verPedidos && <EstructurasMensajes organizacionId={organizacionId} puedeEditar={puedeEditarPedidos} />}
      {pestana === 'cxp' && verCxp && <MensajesConfig organizacionId={organizacionId} empresa={empresa} usuario={usuario} />}
    </div>
  );
}
