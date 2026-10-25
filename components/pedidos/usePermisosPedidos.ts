'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface PermisosPedidos {
  cargado: boolean;
  /** Pedidos: crear solicitudes de cotización. */
  crear: boolean;
  /** Pedidos: registrar costos, responder agotados. */
  editar: boolean;
  /** Pedidos (ganador): elegir el proveedor ganador. */
  ganadorEditar: boolean;
  /** Pedidos (ganador): generar órdenes de compra. */
  ganadorCrear: boolean;
  /** Proveedores: crear (nuevo proveedor desde Pedidos). */
  provCrear: boolean;
  /** Proveedores: editar condiciones comerciales utilizadas al emitir órdenes. */
  provEditar: boolean;
  /** Ítems: crear (ítem real con código ERP desde Pedidos). */
  itemsCrear: boolean;
}

const VACIO: PermisosPedidos = {
  cargado: false, crear: false, editar: false, ganadorEditar: false, ganadorCrear: false,
  provCrear: false, provEditar: false, itemsCrear: false,
};

/**
 * Qué botones mostrar en Pedidos. Es solo UX: la base de datos vuelve a exigir cada permiso en cada
 * RPC; lo que decide es la configuración de roles (módulos pedidos, pedidos_ganador, Proveedores, Items).
 */
export function usePermisosPedidos(supabase: SupabaseClient, organizacionId: string): PermisosPedidos {
  const [p, setP] = useState<PermisosPedidos>(VACIO);

  useEffect(() => {
    let vivo = true;
    const pedir = async (modulo: string, accion: string) => {
      const { data } = await supabase.rpc('tiene_permiso', {
        p_organizacion_id: organizacionId,
        p_modulo: modulo,
        p_accion: accion,
      });
      return data === true;
    };
    Promise.all([
      pedir('pedidos', 'crear'),
      pedir('pedidos', 'editar'),
      pedir('pedidos_ganador', 'editar'),
      pedir('pedidos_ganador', 'crear'),
      pedir('Proveedores', 'crear'),
      pedir('Proveedores', 'editar'),
      pedir('Items', 'crear'),
    ]).then(([crear, editar, ganadorEditar, ganadorCrear, provCrear, provEditar, itemsCrear]) => {
      if (vivo) setP({ cargado: true, crear, editar, ganadorEditar, ganadorCrear, provCrear, provEditar, itemsCrear });
    });
    return () => {
      vivo = false;
    };
  }, [supabase, organizacionId]);

  return p;
}
