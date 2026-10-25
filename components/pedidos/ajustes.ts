'use client';

import { useCallback, useEffect, useState } from 'react';

/** Preferencias de trabajo de la mesa de compra (por navegador; no son datos de la organización). */
export interface AjustesPedidos {
  /** Tolerancia de "Consolidar", en %. */
  tolerancia: number;
  /** Las estrategias solo deciden lo que aún no tiene asignación. */
  soloSinAsignar: boolean;
  /** Agotados por atender: solo los pendientes o todos. */
  verNecesidades: 'pendiente' | 'todas';
  agruparNecesidades: boolean;
}

const POR_DEFECTO: AjustesPedidos = { tolerancia: 5, soloSinAsignar: false, verNecesidades: 'pendiente', agruparNecesidades: false };
const CLAVE = 'pedidos.ajustes.v1';

export function useAjustesPedidos() {
  const [ajustes, setAjustes] = useState<AjustesPedidos>(POR_DEFECTO);

  useEffect(() => {
    try {
      const guardado = window.localStorage.getItem(CLAVE);
      if (guardado) setAjustes({ ...POR_DEFECTO, ...JSON.parse(guardado) });
    } catch {
      /* sin almacenamiento: se usan los valores por defecto */
    }
  }, []);

  const cambiar = useCallback((cambio: Partial<AjustesPedidos>) => {
    setAjustes((a) => {
      const n = { ...a, ...cambio };
      try {
        window.localStorage.setItem(CLAVE, JSON.stringify(n));
      } catch {
        /* ignorar */
      }
      return n;
    });
  }, []);

  return { ajustes, cambiar };
}
