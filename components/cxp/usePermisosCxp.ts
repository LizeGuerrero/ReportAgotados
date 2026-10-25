'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface PermisosCxp {
  cargado: boolean;
  crear: boolean;
  editar: boolean;
  eliminar: boolean;
  pagar: boolean;
  /** Excluir un documento (crear regla). */
  excluir: boolean;
  /** Quitar una exclusión (eliminar regla). */
  quitar: boolean;
}

const VACIO: PermisosCxp = { cargado: false, crear: false, editar: false, eliminar: false, pagar: false, excluir: false, quitar: false };

/**
 * Qué botones mostrar. Es solo UX: la base de datos vuelve a exigir cada permiso en cada RPC,
 * y lo que decide es la configuración de roles (módulos "cxp" y "cxp_pagos").
 */
export function usePermisosCxp(supabase: SupabaseClient, organizacionId: string): PermisosCxp {
  const [p, setP] = useState<PermisosCxp>(VACIO);

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
      pedir('cxp', 'crear'),
      pedir('cxp', 'editar'),
      pedir('cxp', 'eliminar'),
      pedir('cxp_pagos', 'editar'),
      pedir('cxp_reglas', 'crear'),
      pedir('cxp_reglas', 'eliminar'),
    ]).then(([crear, editar, eliminar, pagar, excluir, quitar]) => {
      if (vivo) setP({ cargado: true, crear, editar, eliminar, pagar, excluir, quitar });
    });
    return () => {
      vivo = false;
    };
  }, [supabase, organizacionId]);

  return p;
}
