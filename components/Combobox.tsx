'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { ChevronDownIcon } from '@/components/ui/icons';

export interface OpcionCombo {
  valor: string;
  texto: string;
  /** Línea secundaria (por ejemplo, el NIT o un conteo). También se usa al buscar. */
  detalle?: string;
}

function normalizar(texto: string) {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

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
    <div className="ui-combo ui-combo--fixed" style={{ width: ancho }}>
      <input
        ref={entrada}
        className="ui-input"
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
      />
      {hayFiltro && vacio !== undefined && (
        <button
          type="button"
          aria-label={`Quitar filtro: ${etiqueta}`}
          className="ui-combo__clear"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onCambio('');
            setTexto('');
          }}
        >
          ×
        </button>
      )}
      <ChevronDownIcon className="ui-combo__chevron" />
      {abierto && (
        <ul
          id={idLista}
          role="listbox"
          className="ui-combo__list"
          onMouseDown={(e) => e.preventDefault()}
          style={{ minWidth: ancho }}
        >
          {visibles.length === 0 && <li className="ui-combo__empty">Sin coincidencias</li>}
          {visibles.map((op, i) => (
            <li
              key={op.valor || '__vacio'}
              role="option"
              aria-selected={op.valor === valor}
              ref={i === activo ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
              onClick={() => elegir(op.valor)}
              onMouseEnter={() => setActivo(i)}
              className={i === activo ? 'ui-combo__option is-active' : 'ui-combo__option'}
            >
              {op.texto}
              {op.detalle && <div className="ui-combo__detail">{op.detalle}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
