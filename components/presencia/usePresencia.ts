'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import {
  agruparUsuarios,
  INACTIVO_MS,
  type EstadoPresenciaCrudo,
  type PayloadPresencia,
  type UsuarioPresente,
} from '@/lib/presencia/logica';
import { componerPagina, leerPestanasDom, ubicacionDesdeRuta } from '@/lib/presencia/ubicacion';

export type ConexionPresencia = 'conectando' | 'conectado' | 'sin-conexion';

export interface OpcionesPresencia {
  supabase: SupabaseClient;
  organizacionId: string;
  slug: string;
  /** Ruta actual (usePathname). El hook no depende del router para poder probarse aparte. */
  pathname: string;
  usuario: { id: string; nombre: string; iniciales: string };
  /** Publicar mi ubicación a la organización. */
  compartir: boolean;
  /** Recibir y mostrar la de los demás. */
  ver: boolean;
}

const ESPERA_PUBLICAR_MS = 250;
const ESPERA_DOM_MS = 300;
const REVISAR_INACTIVIDAD_MS = 15_000;
const REINTENTOS_MS = [2_000, 5_000, 10_000, 30_000];

/**
 * Presencia en tiempo real con Supabase Realtime Presence (nada se escribe en la base de datos).
 *
 *  - Un canal PRIVADO por organización ("presencia:<id>"): el acceso lo decide el RLS de
 *    realtime.messages (migración 20261105210000_presencia_realtime.sql), así que solo los miembros
 *    activos de esa organización pueden entrar a su canal.
 *  - La clave de presencia es el id del usuario: varias pestañas de la misma persona llegan agrupadas
 *    y se muestran como una sola persona. Cada pestaña publica su propia ubicación.
 *  - Módulo y pantalla salen de la ruta y de las pestañas internas visibles (ver lib/presencia/ubicacion).
 *  - Inactividad: 5 min sin interacción -> "inactivo". Al cerrar la pestaña, cerrar sesión o perder la
 *    red, Supabase retira a la persona del canal (en segundos) sin que haya nada que limpiar.
 *  - Reconexión: cada vez que el canal vuelve a unirse se vuelve a publicar; si queda caído, se
 *    reintenta con espera creciente y también al volver la red.
 */
export function usePresencia(opciones: OpcionesPresencia): { usuarios: UsuarioPresente[]; conexion: ConexionPresencia } {
  const { supabase, organizacionId, slug, pathname, usuario, compartir, ver } = opciones;

  const [crudo, setCrudo] = useState<EstadoPresenciaCrudo>({});
  const [conexion, setConexion] = useState<ConexionPresencia>('conectando');
  const [generacion, setGeneracion] = useState(0); // subir para forzar un canal nuevo
  const [pestanasDom, setPestanasDom] = useState<string[]>([]);
  const [inactivo, setInactivo] = useState(false);
  const [visible, setVisible] = useState(true);

  // Identifica ESTA pestaña. Se genera al montar (no se guarda: duplicar una pestaña copiaría el id).
  const pestanaId = useRef('');
  if (!pestanaId.current) pestanaId.current = Math.random().toString(36).slice(2, 10);

  const canalRef = useRef<RealtimeChannel | null>(null);
  const unidoRef = useRef(false);
  const compartirRef = useRef(compartir);
  compartirRef.current = compartir;

  // ---- Ubicación actual (ruta + pestañas internas)
  const base = useMemo(() => ubicacionDesdeRuta(pathname, slug), [pathname, slug]);
  const pagina = componerPagina(base, pestanasDom);

  useEffect(() => {
    let temporizador: ReturnType<typeof setTimeout> | null = null;
    const leer = () => {
      const nuevas = leerPestanasDom(document);
      setPestanasDom((previas) => (previas.join('|') === nuevas.join('|') ? previas : nuevas));
    };
    const programar = () => {
      if (temporizador) clearTimeout(temporizador);
      temporizador = setTimeout(leer, ESPERA_DOM_MS);
    };
    programar(); // al montar y en cada cambio de ruta
    const observador = new MutationObserver(programar);
    observador.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-selected', 'aria-current'],
    });
    return () => {
      observador.disconnect();
      if (temporizador) clearTimeout(temporizador);
    };
  }, [pathname]);

  // ---- Actividad de la persona (para marcar inactividad)
  useEffect(() => {
    let ultima = Date.now();
    let marcadoInactivo = false;
    let ultimoRegistro = 0;

    const actividad = () => {
      const ahora = Date.now();
      if (ahora - ultimoRegistro < 1000) return; // los movimientos del ratón son muy frecuentes
      ultimoRegistro = ahora;
      ultima = ahora;
      if (marcadoInactivo) {
        marcadoInactivo = false;
        setInactivo(false);
      }
    };
    const revisar = () => {
      if (!marcadoInactivo && Date.now() - ultima >= INACTIVO_MS) {
        marcadoInactivo = true;
        setInactivo(true);
      }
    };
    const alCambiarVisibilidad = () => {
      setVisible(!document.hidden);
      if (!document.hidden) actividad();
    };

    const eventos = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;
    eventos.forEach((e) => window.addEventListener(e, actividad, { passive: true }));
    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    const intervalo = setInterval(revisar, REVISAR_INACTIVIDAD_MS);
    setVisible(!document.hidden);
    return () => {
      eventos.forEach((e) => window.removeEventListener(e, actividad));
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
      clearInterval(intervalo);
    };
  }, []);

  // ---- Lo que esta pestaña publica (siempre lo último, vía ref)
  const payloadRef = useRef<() => PayloadPresencia>(() => {
    throw new Error('payload no inicializado');
  });
  payloadRef.current = () => ({
    usuario_id: usuario.id,
    nombre: usuario.nombre,
    iniciales: usuario.iniciales,
    pestana_id: pestanaId.current,
    modulo: base.modulo,
    pagina,
    ruta: pathname,
    estado: inactivo ? 'inactivo' : 'activo',
    visible,
  });

  const publicar = () => {
    const canal = canalRef.current;
    if (!canal || !unidoRef.current || !compartirRef.current) return;
    void canal.track(payloadRef.current()).catch(() => {
      /* si falla, el próximo cambio o la reconexión lo vuelve a intentar */
    });
  };

  // Cambió la ubicación, la inactividad o la visibilidad: se actualiza lo publicado (agrupado en un solo envío).
  useEffect(() => {
    const t = setTimeout(publicar, ESPERA_PUBLICAR_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base.modulo, pagina, inactivo, visible, usuario.nombre, usuario.iniciales]);

  // Si deja de compartir con el canal abierto, se retira; si vuelve a compartir, se publica de nuevo.
  useEffect(() => {
    const canal = canalRef.current;
    if (!canal || !unidoRef.current) return;
    if (compartir) publicar();
    else void canal.untrack().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compartir]);

  // ---- Canal de presencia de la organización
  const conectar = compartir || ver;
  useEffect(() => {
    if (!conectar) {
      setCrudo({});
      return;
    }

    let cancelado = false;
    let reintento: ReturnType<typeof setTimeout> | null = null;
    let intentos = 0;
    setConexion('conectando');

    const canal = supabase.channel(`presencia:${organizacionId}`, {
      config: { private: true, presence: { key: usuario.id } },
    });
    canalRef.current = canal;

    canal.on('presence', { event: 'sync' }, () => {
      if (!cancelado) setCrudo({ ...(canal.presenceState() as EstadoPresenciaCrudo) });
    });

    const programarReintento = () => {
      if (reintento || cancelado) return;
      const espera = REINTENTOS_MS[Math.min(intentos, REINTENTOS_MS.length - 1)];
      intentos += 1;
      reintento = setTimeout(() => {
        reintento = null;
        if (!cancelado) setGeneracion((g) => g + 1); // canal nuevo
      }, espera);
    };

    canal.subscribe((estado, error) => {
      if (cancelado) return;
      if (estado === 'SUBSCRIBED') {
        unidoRef.current = true;
        intentos = 0;
        if (reintento) {
          clearTimeout(reintento);
          reintento = null;
        }
        setConexion('conectado');
        publicar(); // también tras cada reconexión: el servidor olvida lo publicado antes
      } else if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT' || estado === 'CLOSED') {
        unidoRef.current = false;
        setConexion('sin-conexion');
        if (estado !== 'CLOSED') console.warn('[presencia]', estado, error?.message ?? '');
        programarReintento();
      }
    });

    // Salir al instante (sin esperar el aviso de desconexión del servidor).
    const retirar = () => {
      if (unidoRef.current) void canal.untrack().catch(() => {});
    };
    const alCerrarSesion = (e: Event) => {
      const accion = (e.target as HTMLFormElement | null)?.action ?? '';
      if (accion.includes('/auth/signout')) retirar();
    };
    const alVolverRed = () => {
      if (!unidoRef.current) setGeneracion((g) => g + 1);
    };
    const alPerderRed = () => {
      unidoRef.current = false;
      setConexion('sin-conexion');
    };
    window.addEventListener('pagehide', retirar);
    window.addEventListener('online', alVolverRed);
    window.addEventListener('offline', alPerderRed);
    document.addEventListener('submit', alCerrarSesion, true);
    const auth = supabase.auth?.onAuthStateChange?.((evento) => {
      if (evento === 'SIGNED_OUT') retirar();
    });

    return () => {
      cancelado = true;
      unidoRef.current = false;
      if (reintento) clearTimeout(reintento);
      window.removeEventListener('pagehide', retirar);
      window.removeEventListener('online', alVolverRed);
      window.removeEventListener('offline', alPerderRed);
      document.removeEventListener('submit', alCerrarSesion, true);
      auth?.data?.subscription?.unsubscribe();
      if (canalRef.current === canal) canalRef.current = null;
      void canal.untrack().catch(() => {});
      void supabase.removeChannel(canal);
    };
    // publicar y los datos de ubicación se leen por ref: no deben recrear el canal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, organizacionId, usuario.id, conectar, generacion]);

  const usuarios = useMemo(
    () => (conexion === 'conectado' && ver ? agruparUsuarios(crudo, usuario.id) : []),
    [crudo, conexion, ver, usuario.id],
  );

  return { usuarios, conexion };
}
