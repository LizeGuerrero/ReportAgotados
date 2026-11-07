'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Preferencias de presencia de cada persona. Viven en este navegador (localStorage, por usuario):
 * no hay nada que guardar en la base de datos y no afectan a nadie más.
 *
 * Regla de reciprocidad: quien decide NO compartir su actividad tampoco ve la de los demás.
 */
export interface PreferenciasPresencia {
  /** Mostrar el indicador de personas conectadas en la barra superior. */
  ver: boolean;
  /** Aparecer como conectado (módulo y pestaña) para el resto de la organización. */
  compartir: boolean;
}

export const PREFERENCIAS_POR_DEFECTO: PreferenciasPresencia = { ver: true, compartir: true };

const clave = (usuarioId: string) => `pref:presencia:${usuarioId}`;
const EVENTO = 'pref-presencia';

export function leerPreferencias(raw: string | null): PreferenciasPresencia {
  if (!raw) return PREFERENCIAS_POR_DEFECTO;
  try {
    const o = JSON.parse(raw) as Partial<PreferenciasPresencia>;
    return {
      ver: typeof o.ver === 'boolean' ? o.ver : true,
      compartir: typeof o.compartir === 'boolean' ? o.compartir : true,
    };
  } catch {
    return PREFERENCIAS_POR_DEFECTO;
  }
}

/** Lo que realmente se aplica: sin compartir no hay indicador. */
export const veIndicador = (p: PreferenciasPresencia) => p.compartir && p.ver;

// useSyncExternalStore exige una referencia estable mientras el valor no cambie.
const cache = new Map<string, { raw: string | null; valor: PreferenciasPresencia }>();
function snapshot(usuarioId: string): PreferenciasPresencia {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(clave(usuarioId));
  } catch {
    /* sin almacenamiento: valores por defecto */
  }
  const previo = cache.get(usuarioId);
  if (previo && previo.raw === raw) return previo.valor;
  const valor = leerPreferencias(raw);
  cache.set(usuarioId, { raw, valor });
  return valor;
}

function suscribir(avisar: () => void) {
  window.addEventListener('storage', avisar); // otra pestaña
  window.addEventListener(EVENTO, avisar); // esta pestaña
  return () => {
    window.removeEventListener('storage', avisar);
    window.removeEventListener(EVENTO, avisar);
  };
}

export function usePreferenciasPresencia(usuarioId: string) {
  const prefs = useSyncExternalStore(
    suscribir,
    () => snapshot(usuarioId),
    () => PREFERENCIAS_POR_DEFECTO,
  );

  const cambiar = useCallback(
    (parcial: Partial<PreferenciasPresencia>) => {
      const nuevo = { ...snapshot(usuarioId), ...parcial };
      try {
        localStorage.setItem(clave(usuarioId), JSON.stringify(nuevo));
      } catch {
        /* sin almacenamiento: el cambio no se recuerda */
      }
      window.dispatchEvent(new Event(EVENTO));
    },
    [usuarioId],
  );

  return [prefs, cambiar] as const;
}
