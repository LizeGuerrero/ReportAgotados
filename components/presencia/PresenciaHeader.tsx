'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { destinoPermitido } from '@/lib/presencia/permisos';
import type { SesionUsuario } from '@/lib/presencia/logica';
import { usePreferenciasPresencia, veIndicador } from '@/lib/presencia/preferencias';
import { PresenciaIndicador } from '@/components/presencia/PresenciaIndicador';
import { usePresencia } from '@/components/presencia/usePresencia';

interface Props {
  organizacionId: string;
  slug: string;
  /** Pantallas a las que puede ir esta persona (por rol). */
  segmentosPermitidos: string[];
  usuario: { id: string; nombre: string; iniciales: string };
}

/** Cuántos avatares caben según el ancho: en pantallas estrechas siempre el icono con contador. */
function useMaxAvatares() {
  const [max, setMax] = useState(3);
  useEffect(() => {
    const anchas = window.matchMedia('(min-width: 64rem)');
    const medias = window.matchMedia('(min-width: 40rem)');
    const calcular = () => setMax(anchas.matches ? 5 : medias.matches ? 3 : 0);
    calcular();
    anchas.addEventListener('change', calcular);
    medias.addEventListener('change', calcular);
    return () => {
      anchas.removeEventListener('change', calcular);
      medias.removeEventListener('change', calcular);
    };
  }, []);
  return max;
}

/** Une el canal de presencia con el indicador de la barra superior. */
export function PresenciaHeader({ organizacionId, slug, segmentosPermitidos, usuario }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [prefs] = usePreferenciasPresencia(usuario.id);
  const maxAvatares = useMaxAvatares();

  const { usuarios, conexion } = usePresencia({
    supabase,
    organizacionId,
    slug,
    pathname,
    usuario,
    compartir: prefs.compartir,
    ver: veIndicador(prefs),
  });

  if (!veIndicador(prefs)) return null;
  return (
    <PresenciaIndicador
      usuarios={usuarios}
      conexion={conexion}
      maxAvatares={maxAvatares}
      destinoDe={(s: SesionUsuario) => destinoPermitido(s.ruta, slug, segmentosPermitidos)}
      irA={(href) => router.push(href)}
    />
  );
}
