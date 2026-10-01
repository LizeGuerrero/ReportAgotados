import { useEffect, useRef } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Vuelve a llamar `recargar` cada vez que la tabla "agotados" cambia para esta
 * organización (otra pestaña, otro usuario, Compras o Comercial). Los cambios
 * seguidos en un lapso corto se agrupan en un solo refetch (debounce), para no
 * disparar una petición por cada tecla o autoguardado.
 */
export function useAgotadosTiempoReal(
  supabase: SupabaseClient,
  organizacionId: string,
  recargar: () => void,
  esperaMs = 400,
) {
  // Un ref evita que el canal tenga que recrearse cada vez que "recargar" cambia
  // de identidad (por ejemplo, al cambiar de página o de filtro).
  const recargarRef = useRef(recargar);
  useEffect(() => {
    recargarRef.current = recargar;
  }, [recargar]);

  useEffect(() => {
    let temporizador: ReturnType<typeof setTimeout> | null = null;

    const canal = supabase
      .channel(`agotados-org-${organizacionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agotados', filter: `organizacion_id=eq.${organizacionId}` },
        () => {
          if (temporizador) clearTimeout(temporizador);
          temporizador = setTimeout(() => recargarRef.current(), esperaMs);
        },
      )
      .subscribe();

    return () => {
      if (temporizador) clearTimeout(temporizador);
      supabase.removeChannel(canal);
    };
  }, [supabase, organizacionId, esperaMs]);
}
