'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_CONGELAR, OPCIONES_POR_PAGINA, type PrefsHoja } from './tipos';

const AJUSTES = ['puntos', 'cortar', 'ajustar'];

/** Lee lo guardado y descarta lo que no sea válido: las preferencias viejas o dañadas nunca rompen la tabla. */
function leer(clave: string, defecto: PrefsHoja): PrefsHoja {
  try {
    const crudo = window.localStorage.getItem(clave);
    if (!crudo) return defecto;
    const p = JSON.parse(crudo) as Partial<PrefsHoja>;
    const anchos: Record<string, number> = {};
    for (const [k, v] of Object.entries(p.anchos ?? {})) {
      if (typeof v === 'number' && v >= 40 && v <= 1200) anchos[k] = v;
    }
    const ajustes: PrefsHoja['ajustes'] = {};
    for (const [k, v] of Object.entries(p.ajustes ?? {})) {
      if (AJUSTES.includes(v as string)) ajustes[k] = v as PrefsHoja['ajustes'][string];
    }
    return {
      v: 1,
      anchos,
      ocultas: Array.isArray(p.ocultas) ? p.ocultas.filter((x) => typeof x === 'string') : defecto.ocultas,
      contraidos: Array.isArray(p.contraidos) ? p.contraidos.filter((x) => typeof x === 'string') : [],
      ajuste: AJUSTES.includes(p.ajuste as string) ? (p.ajuste as PrefsHoja['ajuste']) : defecto.ajuste,
      ajustes,
      densidad: ['compacta', 'normal', 'amplia'].includes(p.densidad as string) ? (p.densidad as PrefsHoja['densidad']) : defecto.densidad,
      modo: p.modo === 'infinito' ? 'infinito' : 'paginas',
      porPagina: OPCIONES_POR_PAGINA.includes(p.porPagina as number) ? (p.porPagina as number) : defecto.porPagina,
      congelar: Number.isInteger(p.congelar) && (p.congelar as number) >= 0 && (p.congelar as number) <= MAX_CONGELAR ? (p.congelar as number) : 0,
      verTramos: typeof p.verTramos === 'boolean' ? p.verTramos : true,
      clicFila: typeof p.clicFila === 'boolean' ? p.clicFila : true,
    };
  } catch {
    return defecto;
  }
}

/**
 * Preferencias de la tabla (columnas, anchos, formato...) guardadas en este navegador, por organización y pantalla.
 * `listo` pasa a true cuando ya se leyó lo guardado: conviene esperarlo antes de pedir datos para no consultar dos veces.
 */
export function usePrefsHoja(clave: string, defecto: PrefsHoja) {
  const defRef = useRef(defecto);
  defRef.current = defecto;
  const [prefs, setPrefs] = useState<PrefsHoja>(defecto);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    setPrefs(leer(clave, defRef.current));
    setListo(true);
  }, [clave]);

  const cambiar = useCallback(
    (p: PrefsHoja) => {
      setPrefs(p);
      try {
        window.localStorage.setItem(clave, JSON.stringify(p));
      } catch {
        /* sin almacenamiento: la tabla funciona igual, solo no recuerda */
      }
    },
    [clave],
  );

  const restablecer = useCallback(() => {
    setPrefs(defRef.current);
    try {
      window.localStorage.removeItem(clave);
    } catch {
      /* nada */
    }
  }, [clave]);

  return { prefs, cambiar, restablecer, listo };
}
