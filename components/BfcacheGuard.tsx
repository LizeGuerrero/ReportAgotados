'use client';

import { useEffect } from 'react';

/**
 * Chrome (y otros navegadores) pueden restaurar una página completa desde su
 * caché interna (bfcache) al usar "atrás"/"adelante", SIN volver a pasar por
 * el servidor ni por proxy.ts. El header Cache-Control: no-store debería
 * evitarlo, pero en dev (Turbopack/HMR) a veces no es suficiente.
 *
 * Este componente es la red de seguridad: si detecta que la página fue
 * restaurada desde bfcache (evento 'pageshow' con persisted = true), fuerza
 * una recarga real, que sí vuelve a pasar por el proxy y re-valida la sesión.
 */
export function BfcacheGuard() {
  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        window.location.reload();
      }
    }

    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  return null;
}
