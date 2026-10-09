'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { ChevronDownIcon } from '@/components/ui/icons';

function normalizar(texto: string) {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

const campo: React.CSSProperties = {
  padding: 6,
  border: '1px solid #000',
  color: '#000',
  background: '#fff',
  fontSize: 14,
};

export default function SelectorLinea({
  lineas,
  valor,
  onCambio,
  variante = 'ui',
}: {
  lineas: string[];
  valor: string;
  onCambio: (v: string) => void;
  /**
   * 'ui' (por defecto) usa las clases del sistema de diseño (Agotados, Pedidos,
   * modo claro/oscuro). 'clasica' conserva el aspecto antiguo, sin soporte de tema.
   */
  variante?: 'clasica' | 'ui';
}) {
  const ui = variante === 'ui';
  const idLista = useId();
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const entrada = useRef<HTMLInputElement>(null);

  // La primera opción ("") es "Todas las líneas" y solo aparece cuando no se está filtrando
  const opciones = useMemo(() => {
    const q = normalizar(texto.trim());
    const filtradas = q ? lineas.filter((l) => normalizar(l).includes(q)) : lineas;
    return q ? filtradas : ['', ...filtradas];
  }, [lineas, texto]);

  function elegir(v: string) {
    onCambio(v);
    setTexto('');
    setAbierto(false);
    entrada.current?.blur();
  }

  function teclado(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAbierto(true);
      setActivo((a) => Math.min(a + 1, opciones.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActivo((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (abierto && opciones.length > 0) elegir(opciones[Math.min(activo, opciones.length - 1)]);
    } else if (e.key === 'Escape') {
      setAbierto(false);
      setTexto('');
      entrada.current?.blur();
    }
  }

  const hayFiltro = valor !== '' || texto !== '';

  return (
    <div className={ui ? 'ui-combo' : undefined} style={ui ? undefined : { position: 'relative', width: 280 }}>
      <input
        ref={entrada}
        className={ui ? 'ui-input' : undefined}
        aria-controls={abierto ? idLista : undefined}
        aria-autocomplete="list"
        value={abierto ? texto : valor}
        placeholder={valor || 'Todas las líneas'}
        role="combobox"
        aria-expanded={abierto}
        aria-label="Línea"
        onFocus={() => {
          setTexto('');
          setActivo(0);
          setAbierto(true);
        }}
        onBlur={() => {
          setAbierto(false);
          setTexto('');
        }}
        onChange={(e) => {
          setTexto(e.target.value);
          setActivo(0);
          setAbierto(true);
        }}
        onKeyDown={teclado}
        style={ui ? undefined : { ...campo, width: '100%', boxSizing: 'border-box', paddingRight: 46 }}
      />
      {hayFiltro && (
        <button
          type="button"
          aria-label="Quitar filtro de línea"
          className={ui ? 'ui-combo__clear' : undefined}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onCambio('');
            setTexto('');
          }}
          style={
            ui
              ? undefined
              : {
                  position: 'absolute',
                  right: 24,
                  top: 4,
                  border: 0,
                  background: 'transparent',
                  color: '#000',
                  fontSize: 18,
                  lineHeight: 1,
                  cursor: 'pointer',
                  padding: '2px 4px',
                }
          }
        >
          ×
        </button>
      )}
      {ui ? (
        <ChevronDownIcon className="ui-combo__chevron" />
      ) : (
        <span
          aria-hidden
          style={{ position: 'absolute', right: 8, top: 8, pointerEvents: 'none', fontSize: 12, color: '#000' }}
        >
          ▾
        </span>
      )}
      {abierto && (
        <ul
          id={idLista}
          role="listbox"
          className={ui ? 'ui-combo__list' : undefined}
          onMouseDown={(e) => e.preventDefault()}
          style={
            ui
              ? undefined
              : {
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  zIndex: 10,
                  margin: '2px 0 0',
                  padding: 0,
                  listStyle: 'none',
                  maxHeight: 260,
                  overflowY: 'auto',
                  border: '1px solid #000',
                  background: '#fff',
                  color: '#000',
                  fontSize: 14,
                }
          }
        >
          {opciones.length === 0 && (
            <li className={ui ? 'ui-combo__empty' : undefined} style={ui ? undefined : { padding: '6px 8px' }}>
              Sin coincidencias
            </li>
          )}
          {opciones.map((op, i) => (
            <li
              key={op || '__todas'}
              role="option"
              aria-selected={op === valor}
              ref={i === activo ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
              onClick={() => elegir(op)}
              onMouseEnter={() => setActivo(i)}
              className={ui ? (i === activo ? 'ui-combo__option is-active' : 'ui-combo__option') : undefined}
              style={
                ui
                  ? undefined
                  : {
                      padding: '6px 8px',
                      cursor: 'pointer',
                      background: i === activo ? '#ddd' : '#fff',
                      fontWeight: op === valor ? 600 : 400,
                    }
              }
            >
              {op || 'Todas las líneas'}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
