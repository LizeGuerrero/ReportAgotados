'use client';

import { useEffect, useState } from 'react';
import { MoonIcon, SunIcon } from '@/components/ui/icons';

type Tema = 'light' | 'dark';

/**
 * Alterna entre modo claro y oscuro. El tema vive en <html data-theme="...">;
 * el script de app/layout.tsx lo fija antes de pintar (evita el parpadeo) y
 * este botón solo lo cambia y lo recuerda en localStorage ("tema").
 */
export function ThemeToggle() {
  const [tema, setTema] = useState<Tema | null>(null);

  useEffect(() => {
    setTema(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  }, []);

  function alternar() {
    const nuevo: Tema = tema === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = nuevo;
    try {
      localStorage.setItem('tema', nuevo);
    } catch {
      /* sin almacenamiento: el cambio vale solo para esta visita */
    }
    setTema(nuevo);
  }

  const oscuro = tema === 'dark';
  const texto = oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';

  return (
    <button type="button" className="app-theme" onClick={alternar} aria-label={texto} title={texto}>
      {oscuro ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
