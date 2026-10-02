import type { SupabaseClient } from '@supabase/supabase-js';
import { useTiempoReal } from '@/components/useTiempoReal';

const SOLO_AGOTADOS = ['agotados'] as const;

/**
 * Atajo de useTiempoReal para pantallas que solo dependen de la tabla "agotados"
 * (p. ej. el reporte de las sedes). Se mantiene con la misma firma de siempre.
 */
export function useAgotadosTiempoReal(
  supabase: SupabaseClient,
  organizacionId: string,
  recargar: () => void,
  esperaMs = 400,
) {
  useTiempoReal(supabase, organizacionId, SOLO_AGOTADOS, recargar, esperaMs);
}
