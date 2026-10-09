'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { ChevronDownIcon } from '@/components/ui/icons';
import type { ProveedorFiltro } from './tipos';

function normalizar(texto: string) {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Clave estable del proveedor: el NIT si lo tiene; si no, el nombre. */
export const claveProveedor = (p: ProveedorFiltro) => (p.tercero ? `t:${p.tercero}` : `n:${p.nombre}`);

/** Lista desplegable con búsqueda para filtrar por proveedor (mismo aspecto que el filtro de línea de Agotados). */
export default function ComboProveedor({
  proveedores,
  valor,
  onCambio,
}: {
  proveedores: ProveedorFiltro[];
  valor: string;
  onCambio: (clave: string) => void;
}) {
  const idLista = useId();
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const entrada = useRef<HTMLInputElement>(null);

  const actual = proveedores.find((p) => claveProveedor(p) === valor);

  const opciones = useMemo(() => {
    const q = normalizar(texto.trim());
    const filtradas = q
      ? proveedores.filter((p) => normalizar(`${p.nombre} ${p.tercero ?? ''}`).includes(q))
      : proveedores;
    return filtradas.slice(0, 100);
  }, [proveedores, texto]);

  function elegir(clave: string) {
    onCambio(clave);
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
      const op = opciones[Math.min(activo, opciones.length - 1)];
      if (abierto && op) elegir(claveProveedor(op));
    } else if (e.key === 'Escape') {
      setAbierto(false);
      setTexto('');
      entrada.current?.blur();
    }
  }

  return (
    <div className="ui-combo">
      <input
        ref={entrada}
        className="ui-input"
        role="combobox"
        aria-expanded={abierto}
        aria-controls={abierto ? idLista : undefined}
        aria-autocomplete="list"
        aria-label="Proveedor"
        value={abierto ? texto : actual?.nombre ?? ''}
        placeholder={actual?.nombre ?? 'Todos los proveedores'}
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
      {(valor !== '' || texto !== '') && (
        <button
          type="button"
          className="ui-combo__clear"
          aria-label="Quitar filtro de proveedor"
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
        <ul id={idLista} role="listbox" className="ui-combo__list" onMouseDown={(e) => e.preventDefault()}>
          {texto === '' && (
            <li
              role="option"
              aria-selected={valor === ''}
              className="ui-combo__option"
              onClick={() => elegir('')}
            >
              Todos los proveedores
            </li>
          )}
          {opciones.length === 0 && <li className="ui-combo__empty">Sin coincidencias</li>}
          {opciones.map((p, i) => (
            <li
              key={claveProveedor(p)}
              role="option"
              aria-selected={claveProveedor(p) === valor}
              className={i === activo ? 'ui-combo__option is-active' : 'ui-combo__option'}
              onMouseEnter={() => setActivo(i)}
              onClick={() => elegir(claveProveedor(p))}
            >
              {p.nombre}
              <span className="cxp-combo__nit">{p.tercero ?? 'sin NIT'} · {p.documentos}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
