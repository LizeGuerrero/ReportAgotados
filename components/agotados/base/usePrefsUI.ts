'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Preferencias de interfaz POR USUARIO (y por organización) para cualquier pantalla tipo «hoja».
 *
 *  - Siempre se guardan en este navegador, con el id del usuario en la clave: en un equipo compartido las
 *    preferencias de una persona nunca se heredan a la siguiente.
 *  - Si se indica `rpc`, además se sincronizan con la base de datos (patrón de cxp_prefs_*). Si la base no
 *    responde (por ejemplo, falta aplicar la migración) se avisa y se sigue con la copia del navegador.
 *  - `legado` permite traer, una sola vez, preferencias de una versión anterior de la pantalla.
 *  - `listo` pasa a true cuando ya se leyó lo guardado: conviene esperarlo antes de pintar o pedir datos.
 */
export interface RpcPrefs {
  obtener: string;
  guardar: string;
  restablecer: string;
}

export interface OpcionesPrefsUI<T extends object> {
  supabase: SupabaseClient;
  organizacionId: string;
  usuarioId: string;
  /** Identifica la pantalla, p. ej. 'agotados'. */
  clave: string;
  defecto: T;
  /** Valida lo guardado y descarta lo que no sirva: preferencias viejas o dañadas nunca rompen la pantalla. */
  normalizar: (crudo: unknown, defecto: T) => T;
  rpc?: RpcPrefs | null;
  legado?: { leer: () => unknown; limpiar: () => void };
}

const ESPERA_MS = 400;

function leerLocal(clave: string): unknown {
  try {
    const crudo = window.localStorage.getItem(clave);
    return crudo ? JSON.parse(crudo) : null;
  } catch {
    return null;
  }
}
function escribirLocal(clave: string, valor: unknown) {
  try {
    window.localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    /* sin almacenamiento: las preferencias valen solo para esta sesión */
  }
}
function quitarLocal(clave: string) {
  try {
    window.localStorage.removeItem(clave);
  } catch {
    /* nada */
  }
}

export function usePrefsUI<T extends object>(opciones: OpcionesPrefsUI<T>) {
  const { supabase, organizacionId, usuarioId, clave } = opciones;
  const op = useRef(opciones);
  op.current = opciones;
  const claveLocal = `hoja-ui:${clave}:${usuarioId}:${organizacionId}`;

  const [prefs, setPrefs] = useState<T>(opciones.defecto);
  const prefsRef = useRef<T>(opciones.defecto);
  const [listo, setListo] = useState(false);
  const [aviso, setAviso] = useState('');
  const [origen, setOrigen] = useState<'local' | 'remoto'>('local');
  const pendiente = useRef<T | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remotoOk = useRef(false);

  const aplicar = useCallback((p: T) => {
    prefsRef.current = p;
    setPrefs(p);
  }, []);

  const volcar = useCallback(async () => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
    const valor = pendiente.current;
    pendiente.current = null;
    if (!valor) return;
    const o = op.current;
    escribirLocal(`hoja-ui:${o.clave}:${o.usuarioId}:${o.organizacionId}`, valor);
    if (o.rpc && remotoOk.current) {
      const { error } = await o.supabase.rpc(o.rpc.guardar, { p_org: o.organizacionId, p_clave: o.clave, p_valor: valor });
      setAviso(error ? `No se pudieron sincronizar tus preferencias: ${error.message}` : '');
    }
  }, []);

  // Lectura inicial
  useEffect(() => {
    let vivo = true;
    setListo(false);
    (async () => {
      const o = op.current;
      const local = leerLocal(claveLocal);

      if (o.rpc) {
        const { data, error } = await supabase.rpc(o.rpc.obtener, { p_org: organizacionId, p_clave: clave });
        if (!vivo) return;
        if (!error) {
          remotoOk.current = true;
          setOrigen('remoto');
          setAviso('');
          if (data && typeof data === 'object') {
            aplicar(o.normalizar(data, o.defecto));
          } else {
            // Primera vez en la base: se sube lo que ya tenía este navegador (o la versión anterior)
            const base = local ?? o.legado?.leer() ?? null;
            if (base) {
              const n = o.normalizar(base, o.defecto);
              aplicar(n);
              const r = await supabase.rpc(o.rpc.guardar, { p_org: organizacionId, p_clave: clave, p_valor: n });
              if (!r.error) o.legado?.limpiar();
            } else aplicar(o.defecto);
          }
          setListo(true);
          return;
        }
        setAviso(`No se pudieron leer tus preferencias guardadas (${error.message}). Se usa la copia de este navegador.`);
      }

      remotoOk.current = false;
      setOrigen('local');
      if (local) aplicar(o.normalizar(local, o.defecto));
      else {
        const viejo = o.legado?.leer();
        if (viejo) {
          const n = o.normalizar(viejo, o.defecto);
          aplicar(n);
          escribirLocal(claveLocal, n);
          o.legado?.limpiar();
        } else aplicar(o.defecto);
      }
      setListo(true);
    })();
    return () => {
      vivo = false;
    };
  }, [supabase, organizacionId, usuarioId, clave, claveLocal, aplicar]);

  // Lo pendiente se guarda al salir de la pantalla o al ocultar la pestaña.
  useEffect(() => {
    const vaciar = () => {
      if (pendiente.current) void volcar();
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
  }, [volcar]);

  /** Recibe una función (estado actual → nuevo) para no pisar cambios hechos casi a la vez. */
  const cambiar = useCallback(
    (fn: (actual: T) => T) => {
      const nuevo = fn(prefsRef.current);
      if (nuevo === prefsRef.current) return;
      aplicar(nuevo);
      pendiente.current = nuevo;
      if (temporizador.current) clearTimeout(temporizador.current);
      temporizador.current = setTimeout(() => void volcar(), ESPERA_MS);
    },
    [aplicar, volcar],
  );

  const restablecer = useCallback(async () => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
    pendiente.current = null;
    const o = op.current;
    aplicar(o.defecto);
    quitarLocal(`hoja-ui:${o.clave}:${o.usuarioId}:${o.organizacionId}`);
    o.legado?.limpiar();
    if (o.rpc && remotoOk.current) {
      const { error } = await o.supabase.rpc(o.rpc.restablecer, { p_org: o.organizacionId, p_clave: o.clave });
      setAviso(error ? `No se pudieron restablecer tus preferencias: ${error.message}` : '');
    }
  }, [aplicar]);

  return { prefs, cambiar, restablecer, listo, aviso, origen };
}
