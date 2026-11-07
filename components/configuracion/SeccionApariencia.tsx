'use client';

import { useEffect, useState } from 'react';
import { MoonIcon, SunIcon } from '@/components/ui/icons';

type Preferencia = 'light' | 'dark' | 'system';

const OPCIONES: { valor: Preferencia; texto: string; ayuda: string }[] = [
  { valor: 'light', texto: 'Claro', ayuda: 'Fondo claro' },
  { valor: 'dark', texto: 'Oscuro', ayuda: 'Fondo oscuro' },
  { valor: 'system', texto: 'Automático', ayuda: 'Sigue a tu dispositivo' },
];

function leerPreferencia(): Preferencia {
  try {
    const t = localStorage.getItem('tema');
    return t === 'dark' || t === 'light' ? t : 'system';
  } catch {
    return 'system';
  }
}

/** Tema de la aplicación. Usa la misma clave ("tema") y el mismo atributo que el botón de la luna. */
export function SeccionApariencia() {
  const [pref, setPref] = useState<Preferencia>('system');

  useEffect(() => {
    setPref(leerPreferencia());
    // El botón de la luna también cambia el tema: se mantiene sincronizado.
    const obs = new MutationObserver(() => setPref(leerPreferencia()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  function elegir(valor: Preferencia) {
    const efectivo =
      valor === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : valor;
    document.documentElement.dataset.theme = efectivo;
    try {
      if (valor === 'system') localStorage.removeItem('tema');
      else localStorage.setItem('tema', valor);
    } catch {
      /* sin almacenamiento: vale solo para esta visita */
    }
    setPref(valor);
  }

  return (
    <div className="cfg-grupo">
      <h3 className="cfg-grupo__titulo">Tema</h3>
      <p className="cfg-grupo__ayuda">Elige cómo se ve la aplicación. También puedes cambiarlo con la luna de la barra superior.</p>
      <div className="cfg-opciones" role="radiogroup" aria-label="Tema de la aplicación">
        {OPCIONES.map((o) => (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={pref === o.valor}
            className="cfg-opcion"
            onClick={() => elegir(o.valor)}
          >
            <span className="cfg-opcion__icono" aria-hidden="true">
              {o.valor === 'dark' ? <MoonIcon /> : <SunIcon />}
            </span>
            <span className="cfg-opcion__texto">{o.texto}</span>
            <span className="cfg-opcion__ayuda">{o.ayuda}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
