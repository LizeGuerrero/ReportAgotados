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
  /** Colores de las celdas de la matriz de ofertas, por criterio. */
  colores: ReglaColor[];
  pegado: ConfigPegado;
}

export type ClaveColor = 'asignado' | 'mejor_precio' | 'mas_rapido' | 'no_tiene' | 'sobre_erp' | 'erp_sin_confirmar';
export interface ReglaColor { clave: ClaveColor; activa: boolean; color: string }
export const REGLAS_COLOR: Record<ClaveColor, { nombre: string; porque: string }> = {
  asignado: { nombre: 'Elegida (asignada)', porque: 'es la oferta que se eligió para comprar' },
  mejor_precio: { nombre: 'La más barata', porque: 'es la opción más barata' },
  mas_rapido: { nombre: 'La más rápida', porque: 'es la opción con menor tiempo de entrega' },
  no_tiene: { nombre: 'No lo tiene', porque: 'el proveedor respondió que no lo tiene' },
  sobre_erp: { nombre: 'Más cara que el ERP', porque: 'cotizó más de 5 % por encima del precio del ERP' },
  erp_sin_confirmar: { nombre: 'Solo precio del ERP', porque: 'es el precio del ERP, aún sin confirmar con el proveedor' },
};
/** Orden en que se evalúan: la primera regla activa que se cumple pinta la celda. */
export const ORDEN_COLOR: ClaveColor[] = ['asignado', 'no_tiene', 'mejor_precio', 'mas_rapido', 'sobre_erp', 'erp_sin_confirmar'];
const COLORES_POR_DEFECTO: ReglaColor[] = [
  { clave: 'asignado', activa: true, color: '#fde047' },
  { clave: 'no_tiene', activa: true, color: '#fca5a5' },
  { clave: 'mejor_precio', activa: true, color: '#86efac' },
  { clave: 'mas_rapido', activa: false, color: '#93c5fd' },
  { clave: 'sobre_erp', activa: true, color: '#fdba74' },
  { clave: 'erp_sin_confirmar', activa: false, color: '#d1d5db' },
];

/** Cómo se interpreta lo que se pega al "Pegar precios". */
export type CampoPegado = 'producto' | 'costo' | 'dias' | 'observacion' | 'referencia' | 'ignorar';
export type Separador = 'auto' | 'tab' | 'espacio' | 'coma' | 'punto_coma' | 'barra' | 'otro';
export interface ConfigPegado { separador: Separador; otro: string; columnas: CampoPegado[]; primeraEsEncabezado: boolean }
export const PEGADO_POR_DEFECTO: ConfigPegado = { separador: 'auto', otro: '', columnas: ['producto', 'costo', 'dias'], primeraEsEncabezado: false };

const POR_DEFECTO: AjustesPedidos = {
  tolerancia: 5, soloSinAsignar: false, verNecesidades: 'pendiente', agruparNecesidades: false,
  colores: COLORES_POR_DEFECTO, pegado: PEGADO_POR_DEFECTO,
};
const CLAVE = 'pedidos.ajustes.v1';

export function useAjustesPedidos() {
  const [ajustes, setAjustes] = useState<AjustesPedidos>(POR_DEFECTO);

  useEffect(() => {
    try {
      const guardado = window.localStorage.getItem(CLAVE);
      if (guardado) {
        const g = JSON.parse(guardado);
        // Se completan las reglas de color que no existían cuando se guardó
        const colores = COLORES_POR_DEFECTO.map((r) => ({ ...r, ...(g.colores?.find((x: ReglaColor) => x.clave === r.clave) ?? {}) }));
        setAjustes({ ...POR_DEFECTO, ...g, colores, pegado: { ...PEGADO_POR_DEFECTO, ...(g.pegado ?? {}) } });
      }
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
