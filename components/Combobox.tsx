'use client';

import { useId, useMemo, useRef, useState } from 'react';

export interface OpcionCombo {
  valor: string;
  texto: string;
  /** Línea secundaria (por ejemplo, el NIT o un conteo). También se usa al buscar. */
  detalle?: string;
}

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

/**
 * Lista desplegable con búsqueda: se escribe para filtrar las opciones (sin tildes ni mayúsculas),
 * se navega con las flechas, Enter elige y Esc cierra. Mismo comportamiento que SelectorLinea,
 * pero para cualquier lista de opciones (proveedores, estados…).
 *
 * `vacio` es el texto de la opción "sin filtro" (p. ej. "Todos los estados"); si no se pasa, no hay
 * opción vacía y siempre hay que elegir una.
 */
export default function Combobox({
  opciones,
  valor,
  onCambio,
  etiqueta,
  vacio,
  placeholder,
  ancho = 280,
}: {
  opciones: OpcionCombo[];
  valor: string;
  onCambio: (v: string) => void;
  etiqueta: string;
  vacio?: string;
  /** Texto de ayuda cuando no hay nada elegido y no hay opción vacía. */
  placeholder?: string;
  ancho?: number;
}) {
  const idLista = useId();
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const entrada = useRef<HTMLInputElement>(null);

  const actual = opciones.find((o) => o.valor === valor);

  // La opción vacía solo aparece cuando no se está escribiendo un filtro
  const visibles = useMemo(() => {
    const q = normalizar(texto.trim());
    const filtradas = q
      ? opciones.filter((o) => normalizar(`${o.texto} ${o.detalle ?? ''}`).includes(q))
      : opciones;
    return !q && vacio !== undefined ? [{ valor: '', texto: vacio } as OpcionCombo, ...filtradas] : filtradas;
  }, [opciones, texto, vacio]);

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
      setActivo((a) => Math.min(a + 1, visibles.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActivo((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (abierto && visibles.length > 0) elegir(visibles[Math.min(activo, visibles.length - 1)].valor);
    } else if (e.key === 'Escape') {
      setAbierto(false);
      setTexto('');
      entrada.current?.blur();
    }
  }

  const hayFiltro = valor !== '' || texto !== '';

  return (
    <div style={{ position: 'relative', width: ancho }}>
      <input
        ref={entrada}
        aria-controls={abierto ? idLista : undefined}
        aria-autocomplete="list"
        value={abierto ? texto : actual?.texto ?? ''}
        placeholder={actual?.texto ?? vacio ?? placeholder ?? 'Escribe para buscar…'}
        role="combobox"
        aria-expanded={abierto}
        aria-label={etiqueta}
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
        style={{ ...campo, width: '100%', boxSizing: 'border-box', paddingRight: 46 }}
      />
      {hayFiltro && vacio !== undefined && (
        <button
          type="button"
          aria-label={`Quitar filtro: ${etiqueta}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onCambio('');
            setTexto('');
          }}
          style={{
            position: 'absolute', right: 24, top: 4, border: 0, background: 'transparent',
            color: '#000', fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: '2px 4px',
          }}
        >
          ×
        </button>
      )}
      <span
        aria-hidden
        style={{ position: 'absolute', right: 8, top: 8, pointerEvents: 'none', fontSize: 12, color: '#000' }}
      >
        ▾
      </span>
      {abierto && (
        <ul
          id={idLista}
          role="listbox"
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, minWidth: ancho, zIndex: 10,
            margin: '2px 0 0', padding: 0, listStyle: 'none', maxHeight: 280, overflowY: 'auto',
            border: '1px solid #000', background: '#fff', color: '#000', fontSize: 14,
          }}
        >
          {visibles.length === 0 && <li style={{ padding: '6px 8px' }}>Sin coincidencias</li>}
          {visibles.map((op, i) => (
            <li
              key={op.valor || '__vacio'}
              role="option"
              aria-selected={op.valor === valor}
              ref={i === activo ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
              onClick={() => elegir(op.valor)}
              onMouseEnter={() => setActivo(i)}
              style={{
                padding: '6px 8px', cursor: 'pointer',
                background: i === activo ? '#ddd' : '#fff',
                fontWeight: op.valor === valor ? 600 : 400,
              }}
            >
              {op.texto}
              {op.detalle && <div style={{ fontSize: 11, fontWeight: 400 }}>{op.detalle}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
