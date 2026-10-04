'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface PermisosItems {
  cargado: boolean;
  itemsCrear: boolean;
  itemsEditar: boolean;
  provVer: boolean;
  provCrear: boolean;
  provEditar: boolean;
  provEliminar: boolean;
}

const VACIO: PermisosItems = {
  cargado: false, itemsCrear: false, itemsEditar: false,
  provVer: false, provCrear: false, provEditar: false, provEliminar: false,
};

/**
 * Qué botones mostrar. Es solo UX: la base de datos vuelve a exigir cada permiso en cada RPC,
 * y la configuración de roles (módulos Items y Proveedores) es lo que decide.
 */
export function usePermisos(supabase: SupabaseClient, organizacionId: string): PermisosItems {
  const [p, setP] = useState<PermisosItems>(VACIO);

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
      pedir('Items', 'crear'),
      pedir('Items', 'editar'),
      pedir('Proveedores', 'ver'),
      pedir('Proveedores', 'crear'),
      pedir('Proveedores', 'editar'),
      pedir('Proveedores', 'eliminar'),
    ]).then(([itemsCrear, itemsEditar, provVer, provCrear, provEditar, provEliminar]) => {
      if (vivo) setP({ cargado: true, itemsCrear, itemsEditar, provVer, provCrear, provEditar, provEliminar });
    });
    return () => {
      vivo = false;
    };
  }, [supabase, organizacionId]);

  return p;
}
