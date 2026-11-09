'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ANCHO_MAX_PREF,
  ANCHO_MIN_PREF,
  MAX_CONGELAR,
  MAX_CONGELAR_DER,
  OPCIONES_POR_PAGINA,
  PREFS_GENERAL_POR_DEFECTO,
  type PrefsGeneral,
  type PrefsHoja,
} from './tipos';

const AJUSTES = ['puntos', 'cortar', 'ajustar'];
const ALINEACIONES = ['izq', 'centro', 'der'];
const ESPERA_GUARDAR_MS = 500;

const texto = (x: unknown): x is string => typeof x === 'string';

/** Valida lo guardado y descarta lo que no sirva: las preferencias viejas o dañadas nunca rompen la tabla. Acepta la versión 1 (solo navegador). */
export function normalizarPrefsHoja(crudo: unknown, defecto: PrefsHoja): PrefsHoja {
  if (!crudo || typeof crudo !== 'object') return defecto;
  const p = crudo as Partial<PrefsHoja>;
  const anchos: Record<string, number> = {};
  for (const [k, v] of Object.entries(p.anchos ?? {})) {
    if (typeof v === 'number' && v >= ANCHO_MIN_PREF && v <= ANCHO_MAX_PREF) anchos[k] = v;
  }
  const ajustes: PrefsHoja['ajustes'] = {};
  for (const [k, v] of Object.entries(p.ajustes ?? {})) {
    if (AJUSTES.includes(v as string)) ajustes[k] = v as PrefsHoja['ajustes'][string];
  }
  const alineaciones: PrefsHoja['alineaciones'] = {};
  for (const [k, v] of Object.entries(p.alineaciones ?? {})) {
    if (ALINEACIONES.includes(v as string)) alineaciones[k] = v as PrefsHoja['alineaciones'][string];
  }
  const lista = (x: unknown, defecto: string[]) => (Array.isArray(x) ? x.filter(texto) : defecto);
  return {
    v: 2,
    anchos,
    ocultas: lista(p.ocultas, defecto.ocultas),
    contraidos: lista(p.contraidos, []),
    ajuste: AJUSTES.includes(p.ajuste as string) ? (p.ajuste as PrefsHoja['ajuste']) : defecto.ajuste,
    ajustes,
    densidad: ['compacta', 'normal', 'amplia'].includes(p.densidad as string) ? (p.densidad as PrefsHoja['densidad']) : defecto.densidad,
    modo: p.modo === 'infinito' ? 'infinito' : 'paginas',
    porPagina: OPCIONES_POR_PAGINA.includes(p.porPagina as number) ? (p.porPagina as number) : defecto.porPagina,
    congelar: Number.isInteger(p.congelar) && (p.congelar as number) >= 0 && (p.congelar as number) <= MAX_CONGELAR ? (p.congelar as number) : 0,
    fijasDer: lista(p.fijasDer, []).slice(0, MAX_CONGELAR_DER),
    alineaciones,
    orden: lista(p.orden, []),
    verTramos: typeof p.verTramos === 'boolean' ? p.verTramos : true,
    clicFila: typeof p.clicFila === 'boolean' ? p.clicFila : true,
    escalaDias: p.escalaDias === 'fija' ? 'fija' : 'relativa',
    busqueda: p.busqueda === 'ordenar' ? 'ordenar' : 'filtrar',
    ordenResto: p.ordenResto === 'nombre' || p.ordenResto === 'vencimiento' ? p.ordenResto : 'vencidos',
  };
}

export function normalizarPrefsGeneral(crudo: unknown, defecto: PrefsGeneral): PrefsGeneral {
  if (!crudo || typeof crudo !== 'object') return defecto;
  const p = crudo as Partial<PrefsGeneral>;
  const g = p.ventanaTotales;
  const ok = g && [g.x, g.y, g.w, g.h].every((n) => typeof n === 'number' && Number.isFinite(n)) && g.w >= 280 && g.h >= 160;
  return {
    v: 1,
    copiado: p.copiado === 'moneda' ? 'moneda' : p.copiado === 'entero' ? 'entero' : defecto.copiado,
    ...(ok ? { ventanaTotales: { x: Math.round(g.x), y: Math.round(g.y), w: Math.round(g.w), h: Math.round(g.h) } } : {}),
  };
}

function leerLocal(clave: string): unknown {
  try {
    const crudo = window.localStorage.getItem(clave);
    return crudo ? JSON.parse(crudo) : null;
  } catch {
    return null;
  }
}
function quitarLocal(clave: string) {
  try {
    window.localStorage.removeItem(clave);
  } catch {
    /* nada */
  }
}

/**
 * Preferencias de CXP guardadas en la base de datos, POR USUARIO (cxp_prefs_* ligadas a auth.uid()).
 *  - Si la persona aún no tiene nada guardado y este navegador tiene preferencias de la versión anterior
 *    (localStorage `claveLegada`), se pasan a su usuario una sola vez y se borran del navegador.
 *  - Si la base no responde (por ejemplo, falta aplicar la migración), se avisa y la pantalla sigue funcionando
 *    con los valores predeterminados; lo que se cambie en esa sesión no se guarda.
 *  - `listo` pasa a true cuando ya se leyó lo guardado: conviene esperarlo antes de pedir datos.
 */
function usePrefsRemotas<T extends object>(opts: {
  supabase: SupabaseClient;
  organizacionId: string;
  clave: string;
  claveLegada?: string;
  defecto: T;
  normalizar: (crudo: unknown, defecto: T) => T;
}) {
  const { supabase, organizacionId, clave, claveLegada } = opts;
  const defRef = useRef(opts.defecto);
  defRef.current = opts.defecto;
  const normRef = useRef(opts.normalizar);
  normRef.current = opts.normalizar;

  const [prefs, setPrefs] = useState<T>(opts.defecto);
  const [listo, setListo] = useState(false);
  const [sincronizado, setSincronizado] = useState(true);
  const [errorPrefs, setErrorPrefs] = useState('');
  const pendiente = useRef<T | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bloqueado = useRef(false); // sin base de datos: no se intenta guardar

  const enviar = useCallback(async () => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
    const valor = pendiente.current;
    pendiente.current = null;
    if (!valor || bloqueado.current) return;
    const { error } = await supabase.rpc('cxp_prefs_guardar', { p_org: organizacionId, p_clave: clave, p_valor: valor });
    if (error) setErrorPrefs(`No se pudieron guardar tus preferencias: ${error.message}`);
    else setErrorPrefs('');
  }, [supabase, organizacionId, clave]);

  useEffect(() => {
    let vivo = true;
    setListo(false);
    bloqueado.current = false;
    (async () => {
      const { data, error } = await supabase.rpc('cxp_prefs_obtener', { p_org: organizacionId, p_clave: clave });
      if (!vivo) return;
      if (error) {
        bloqueado.current = true;
        setSincronizado(false);
        setErrorPrefs(`No se pudieron leer tus preferencias (${error.message}). Se usan las predeterminadas y los cambios no se guardarán.`);
        setPrefs(defRef.current);
        setListo(true);
        return;
      }
      setSincronizado(true);
      setErrorPrefs('');
      if (data && typeof data === 'object') {
        setPrefs(normRef.current(data, defRef.current));
      } else {
        const legado = claveLegada ? leerLocal(claveLegada) : null;
        if (legado) {
          const migradas = normRef.current(legado, defRef.current);
          setPrefs(migradas);
          const r = await supabase.rpc('cxp_prefs_guardar', { p_org: organizacionId, p_clave: clave, p_valor: migradas });
          if (!r.error && claveLegada) quitarLocal(claveLegada); // ya son de este usuario: no se heredan al siguiente
        } else {
          setPrefs(defRef.current);
        }
      }
      setListo(true);
    })();
    return () => {
      vivo = false;
    };
  }, [supabase, organizacionId, clave, claveLegada]);

  // Lo pendiente se guarda al salir de la pantalla o al ocultar la pestaña.
  useEffect(() => {
    const vaciar = () => {
      if (pendiente.current) void enviar();
    };
    const oculta = () => {
      if (document.visibilityState === 'hidden') vaciar();
    };
    window.addEventListener('pagehide', vaciar);
    document.addEventListener('visibilitychange', oculta);
    return () => {
      window.removeEventListener('pagehide', vaciar);
      document.removeEventListener('visibilitychange', oculta);
      vaciar();
    };
  }, [enviar]);

  const cambiar = useCallback(
    (p: T) => {
      setPrefs(p);
      pendiente.current = p;
      if (temporizador.current) clearTimeout(temporizador.current);
      temporizador.current = setTimeout(() => void enviar(), ESPERA_GUARDAR_MS);
    },
    [enviar],
  );

  const restablecer = useCallback(async () => {
    if (temporizador.current) clearTimeout(temporizador.current);
    pendiente.current = null;
    setPrefs(defRef.current);
    if (claveLegada) quitarLocal(claveLegada);
    if (bloqueado.current) return;
    const { error } = await supabase.rpc('cxp_prefs_restablecer', { p_org: organizacionId, p_clave: clave });
    if (error) setErrorPrefs(`No se pudieron restablecer tus preferencias: ${error.message}`);
    else setErrorPrefs('');
  }, [supabase, organizacionId, clave, claveLegada]);

  return { prefs, cambiar, restablecer, listo, sincronizado, errorPrefs };
}

/** Preferencias de la tabla de una pantalla (Cartera, Excluidas o Pagados) del usuario actual. */
export function usePrefsHoja(supabase: SupabaseClient, organizacionId: string, estado: 'pendiente' | 'excluido' | 'pagado', defecto: PrefsHoja) {
  return usePrefsRemotas<PrefsHoja>({
    supabase,
    organizacionId,
    clave: `hoja_${estado}`,
    claveLegada: `cxp.hoja.v1:${organizacionId}:${estado}`,
    defecto,
    normalizar: normalizarPrefsHoja,
  });
}

/** Preferencias de CXP que valen para todas las pantallas (por ahora, el copiado de valores). */
export function usePrefsGeneral(supabase: SupabaseClient, organizacionId: string) {
  return usePrefsRemotas<PrefsGeneral>({
    supabase,
    organizacionId,
    clave: 'general',
    defecto: PREFS_GENERAL_POR_DEFECTO,
    normalizar: normalizarPrefsGeneral,
  });
}
