import { useEffect, useRef } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Tablas por las que se puede escuchar cambios. Todas deben estar en la publicación
 * `supabase_realtime` (ver migración 01_migracion_pedidos_v1.sql).
 */
export type TablaTiempoReal =
  | 'agotados'
  | 'solicitudes_cotizacion'
  | 'ordenes_compra'
  | 'solicitud_items'
  | 'cotizacion_precios';

// Estas tienen organizacion_id y se filtran en el propio canal. solicitud_items y
// cotizacion_precios no lo tienen: Realtime solo entrega las filas que el usuario puede
// leer según RLS, así que igualmente solo llegan las de su organización.
const CON_ORGANIZACION = new Set<TablaTiempoReal>(['agotados', 'solicitudes_cotizacion', 'ordenes_compra']);

/**
 * Vuelve a llamar `recargar` cada vez que cambia alguna de las `tablas` (otra pestaña, otro
 * usuario, Compras o Comercial). Los cambios seguidos en un lapso corto se agrupan en un solo
 * refetch (debounce). Se vuelve a pedir la información al servidor en vez de parchear una copia
 * local, así nunca se muestra algo que otra persona ya cambió.
 */
export function useTiempoReal(
  supabase: SupabaseClient,
  organizacionId: string,
  tablas: readonly TablaTiempoReal[],
  recargar: () => void,
  esperaMs = 400,
) {
  // Un ref evita recrear el canal cada vez que "recargar" cambia de identidad.
  const recargarRef = useRef(recargar);
  useEffect(() => {
    recargarRef.current = recargar;
  }, [recargar]);

  // Nombre único por instancia: dos componentes montados a la vez no comparten canal.
  const idInstancia = useRef(Math.random().toString(36).slice(2, 8));
  // La lista se compara por contenido, no por identidad del arreglo.
  const clave = tablas.join(',');

  useEffect(() => {
    let temporizador: ReturnType<typeof setTimeout> | null = null;
    const alCambiar = () => {
      if (temporizador) clearTimeout(temporizador);
      temporizador = setTimeout(() => recargarRef.current(), esperaMs);
    };

    let canal = supabase.channel(`tr-${organizacionId}-${idInstancia.current}`);
    for (const tabla of clave.split(',') as TablaTiempoReal[]) {
      canal = canal.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: tabla,
          ...(CON_ORGANIZACION.has(tabla) ? { filter: `organizacion_id=eq.${organizacionId}` } : {}),
        },
        alCambiar,
      );
    }
    canal.subscribe();

    return () => {
      if (temporizador) clearTimeout(temporizador);
      supabase.removeChannel(canal);
    };
  }, [supabase, organizacionId, clave, esperaMs]);
}
