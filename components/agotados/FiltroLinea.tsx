'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { IcChevAbajo, IcCerrar, IcFiltro } from './iconos';

const normalizar = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Filtro por línea: botón compacto con lista buscable. Propio de AGOTADOS (SelectorLinea lo usan otros módulos). */
export default function FiltroLinea({
  lineas,
  valor,
  onCambio,
}: {
  lineas: string[];
  valor: string;
  onCambio: (v: string) => void;
}) {
  const idLista = useId();
  const raiz = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [activo, setActivo] = useState(0);

  // «Todas las líneas» solo aparece cuando no se está filtrando la lista
  const opciones = useMemo(() => {
    const q = normalizar(texto.trim());
    const f = q ? lineas.filter((l) => normalizar(l).includes(q)) : lineas;
    return q ? f : ['', ...f];
  }, [lineas, texto]);

  useEffect(() => {
    if (!abierto) return;
    entrada.current?.focus();
    const fuera = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto]);

  useEffect(() => setActivo(0), [texto]);
  useEffect(() => {
    if (abierto) document.getElementById(`${idLista}-${activo}`)?.scrollIntoView({ block: 'nearest' });
  }, [activo, abierto, idLista]);

  function elegir(v: string) {
    onCambio(v);
    setTexto('');
    setAbierto(false);
    raiz.current?.querySelector<HTMLElement>('.agx-btn')?.focus();
  }

  function teclado(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActivo((a) => Math.min(a + 1, opciones.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActivo((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (opciones[activo] !== undefined) elegir(opciones[activo]);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setAbierto(false);
      raiz.current?.querySelector<HTMLElement>('.agx-btn')?.focus();
    }
  }

  return (
    <div className="agx-pop agx-linea" ref={raiz}>
      <button
        type="button"
        className={`agx-btn agx-btn--campo${valor ? ' is-filtrando' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        title="Filtrar por línea"
      >
        <IcFiltro />
        <span className="agx-btn__txt">{valor || 'Todas las líneas'}</span>
        <IcChevAbajo />
      </button>
      {valor && (
        <button type="button" className="agx-ico-btn agx-linea__quitar" onClick={() => onCambio('')} aria-label="Quitar filtro de línea" title="Quitar filtro de línea">
          <IcCerrar />
        </button>
      )}
      {abierto && (
        <div className="agx-pop__menu agx-pop__menu--izq agx-linea__menu">
          <input
            ref={entrada}
            type="text"
            className="agx-linea__buscar"
            role="combobox"
            aria-expanded="true"
            aria-controls={idLista}
            aria-activedescendant={opciones.length ? `${idLista}-${activo}` : undefined}
            aria-label="Buscar línea"
            placeholder="Buscar línea…"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={teclado}
          />
          <ul id={idLista} role="listbox" className="agx-linea__lista" aria-label="Líneas">
            {opciones.map((l, i) => (
              <li
                key={l || '__todas'}
                id={`${idLista}-${i}`}
                role="option"
                aria-selected={l === valor}
                className={`agx-linea__op${i === activo ? ' is-activo' : ''}${l === valor ? ' is-elegida' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => elegir(l)}
                onMouseMove={() => setActivo(i)}
              >
                {l || 'Todas las líneas'}
              </li>
            ))}
            {opciones.length === 0 && <li className="agx-linea__vacio">Sin coincidencias</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
