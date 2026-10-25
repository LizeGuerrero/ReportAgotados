'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { SortIcon } from '@/components/ui/icons';
import type { AjusteTexto, ColumnaHoja, GrupoHoja, PrefsHoja } from './tipos';

const ANCHO_CHECK = 56;
const MIN_POR_DEFECTO = 60;
const MAX_ANCHO = 900;

export interface SeleccionHoja<T> {
  tiene: (fila: T) => boolean;
  /** conShift: marcar un rango desde la última fila marcada. */
  alternar: (fila: T, conShift: boolean) => void;
  /** ¿Están marcadas todas las filas visibles? */
  todos: boolean;
  alternarTodos: (marcar: boolean) => void;
}

interface Props<T> {
  columnas: ColumnaHoja<T>[];
  grupos: GrupoHoja[];
  filas: T[];
  idFila: (fila: T) => string;
  claseFila?: (fila: T) => string | undefined;
  prefs: PrefsHoja;
  onPrefs: (p: PrefsHoja) => void;
  orden: { clave: string; dir: 'asc' | 'desc' } | null;
  onOrden: (clave: string) => void;
  seleccion?: SeleccionHoja<T>;
  /** Columna final con botones; queda fija a la derecha. */
  acciones?: (fila: T) => ReactNode;
  anchoAcciones?: number;
  cargando: boolean;
  cargandoMas?: boolean;
  vacio: string;
  etiqueta: string;
  /** Scroll infinito: hay más filas por cargar y qué hacer al llegar al final. */
  hayMas?: boolean;
  alCentinela?: () => void;
  /** Cuando cambia este valor (filtros, orden, página) la tabla vuelve arriba. */
  reinicio?: string;
}

/**
 * Tabla estilo hoja de cálculo: encabezado fijo, columnas con ancho ajustable (arrastrando el borde),
 * grupos de columnas que se contraen, columnas fijas a la izquierda y texto largo configurable.
 */
export default function HojaTabla<T>({
  columnas,
  grupos,
  filas,
  idFila,
  claseFila,
  prefs,
  onPrefs,
  orden,
  onOrden,
  seleccion,
  acciones,
  anchoAcciones = 250,
  cargando,
  cargandoMas = false,
  vacio,
  etiqueta,
  hayMas = false,
  alCentinela,
  reinicio,
}: Props<T>) {
  const [vivo, setVivo] = useState<{ clave: string; w: number } | null>(null);
  const contenedor = useRef<HTMLDivElement>(null);
  const centinela = useRef<HTMLTableRowElement>(null);

  const anchoDe = (c: ColumnaHoja<T>) => (vivo?.clave === c.clave ? vivo.w : (prefs.anchos[c.clave] ?? c.ancho));
  const contraido = (g: string) => prefs.contraidos.includes(g);

  // Columnas que se ven: las que el usuario no ocultó y, en un grupo contraído, solo la principal.
  const visibles = columnas.filter((c) => !prefs.ocultas.includes(c.clave) && (!contraido(c.grupo) || c.resumen));

  // Columnas fijas a la izquierda: la casilla de selección y las primeras N columnas.
  const nFijas = Math.min(prefs.congelar, visibles.length);
  const izquierda: Record<string, number> = {};
  let acum = seleccion ? ANCHO_CHECK : 0;
  visibles.slice(0, nFijas).forEach((c) => {
    izquierda[c.clave] = acum;
    acum += anchoDe(c);
  });
  const ultimaFija = nFijas > 0 ? visibles[nFijas - 1].clave : null;

  const anchoTotal = (seleccion ? ANCHO_CHECK : 0) + visibles.reduce((s, c) => s + anchoDe(c), 0) + (acciones ? anchoAcciones : 0);
  const nColumnas = (seleccion ? 1 : 0) + visibles.length + (acciones ? 1 : 0);

  const segmentos = grupos
    .map((g) => ({
      g,
      visibles: visibles.filter((c) => c.grupo === g.clave),
      todas: columnas.filter((c) => c.grupo === g.clave && !prefs.ocultas.includes(c.clave)),
    }))
    .filter((s) => s.visibles.length > 0);

  const ajusteDe = (c: ColumnaHoja<T>): AjusteTexto => (c.ajustable ? (prefs.ajustes[c.clave] ?? prefs.ajuste) : 'puntos');

  function alternarGrupo(clave: string) {
    const contraidos = contraido(clave) ? prefs.contraidos.filter((x) => x !== clave) : [...prefs.contraidos, clave];
    onPrefs({ ...prefs, contraidos });
  }

  // ---- Cambiar el ancho de una columna: arrastrar el borde, o flechas con el borde enfocado ----
  function iniciarArrastre(e: React.PointerEvent, c: ColumnaHoja<T>) {
    e.preventDefault();
    e.stopPropagation();
    const inicio = e.clientX;
    const base = anchoDe(c);
    const min = c.min ?? MIN_POR_DEFECTO;
    let ultimo = base;
    const anteriorSeleccion = document.body.style.userSelect;
    const anteriorCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    const mover = (ev: PointerEvent) => {
      ultimo = Math.min(MAX_ANCHO, Math.max(min, Math.round(base + ev.clientX - inicio)));
      setVivo({ clave: c.clave, w: ultimo });
    };
    const soltar = () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', soltar);
      document.body.style.userSelect = anteriorSeleccion;
      document.body.style.cursor = anteriorCursor;
      setVivo(null);
      if (ultimo !== base) onPrefs({ ...prefs, anchos: { ...prefs.anchos, [c.clave]: ultimo } });
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', soltar);
  }

  function teclaBorde(e: React.KeyboardEvent, c: ColumnaHoja<T>) {
    const paso = e.shiftKey ? 50 : 10;
    const min = c.min ?? MIN_POR_DEFECTO;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const w = Math.min(MAX_ANCHO, Math.max(min, anchoDe(c) + (e.key === 'ArrowRight' ? paso : -paso)));
      onPrefs({ ...prefs, anchos: { ...prefs.anchos, [c.clave]: w } });
    } else if (e.key === 'Enter' || e.key === 'Home') {
      e.preventDefault();
      restablecerAncho(c);
    }
  }

  function restablecerAncho(c: ColumnaHoja<T>) {
    const anchos = { ...prefs.anchos };
    delete anchos[c.clave];
    onPrefs({ ...prefs, anchos });
  }

  // ---- Scroll infinito: al ver la fila centinela se pide el siguiente bloque ----
  useEffect(() => {
    if (!alCentinela || !hayMas) return;
    const el = centinela.current;
    const raiz = contenedor.current;
    if (!el || !raiz) return;
    const obs = new IntersectionObserver(
      (entradas) => {
        if (entradas[0]?.isIntersecting) alCentinela();
      },
      { root: raiz, rootMargin: '300px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [alCentinela, hayMas, filas.length]);

  // Al cambiar filtros, orden o página, vuelve al principio.
  useEffect(() => {
    contenedor.current?.scrollTo({ top: 0 });
  }, [reinicio]);

  // Tocar cualquier parte de la fila la marca (se ignoran los botones, campos y celdas editables).
  function alClicFila(e: React.MouseEvent, f: T) {
    if (!seleccion || !prefs.clicFila) return;
    const destino = e.target as HTMLElement;
    if (destino.closest('button, a, input, select, textarea, label, [role="separator"], .cxp-celda')) return;
    if (window.getSelection()?.toString()) return; // se estaba seleccionando texto
    seleccion.alternar(f, e.shiftKey);
  }

  const estiloFijo = (c: ColumnaHoja<T>) => (izquierda[c.clave] !== undefined ? { left: izquierda[c.clave] } : undefined);
  const claseColumna = (c: ColumnaHoja<T>, extra = '') =>
    [
      c.alinear === 'der' ? 'cxp-num' : '',
      izquierda[c.clave] !== undefined ? 'cxp-hoja__cong' : '',
      c.clave === ultimaFija ? 'is-ultima' : '',
      extra,
    ]
      .filter(Boolean)
      .join(' ');

  return (
    <div
      ref={contenedor}
      className={cargando ? 'cxp-hoja is-loading' : 'cxp-hoja'}
      data-densidad={prefs.densidad}
      data-clic-fila={seleccion && prefs.clicFila ? 'si' : undefined}
      role="region"
      aria-label={etiqueta}
      aria-busy={cargando}
      tabIndex={0}
    >
      <table className="cxp-hoja__tabla" style={{ width: anchoTotal }}>
        <colgroup>
          {seleccion && <col style={{ width: ANCHO_CHECK }} />}
          {visibles.map((c) => (
            <col key={c.clave} style={{ width: anchoDe(c) }} />
          ))}
          {acciones && <col style={{ width: anchoAcciones }} />}
        </colgroup>

        <thead>
          <tr className="cxp-hoja__grupos">
            {seleccion && <th className="cxp-hoja__check" scope="col" />}
            {segmentos.map((s) => {
              const cerrado = contraido(s.g.clave);
              return (
                <th key={s.g.clave} colSpan={s.visibles.length} scope="colgroup" className="cxp-hoja__grupo">
                  {s.todas.length > 1 ? (
                    <button
                      type="button"
                      className="cxp-hoja__grupo-btn"
                      aria-expanded={!cerrado}
                      title={cerrado ? 'Expandir el grupo' : 'Contraer el grupo (queda solo su columna principal)'}
                      onClick={() => alternarGrupo(s.g.clave)}
                    >
                      <span aria-hidden="true">{cerrado ? '▸' : '▾'}</span> {s.g.titulo}
                    </button>
                  ) : (
                    <span className="cxp-hoja__grupo-txt">{s.g.titulo}</span>
                  )}
                </th>
              );
            })}
            {acciones && <th className="cxp-hoja__acc" scope="col" />}
          </tr>
          <tr>
            {seleccion && (
              <th className="cxp-hoja__check" scope="col" onClick={() => seleccion.alternarTodos(!seleccion.todos)} title="Marcar o desmarcar todas las filas que ves">
                <input
                  type="checkbox"
                  aria-label="Seleccionar todos los de esta lista"
                  checked={seleccion.todos}
                  onChange={() => undefined}
                />
              </th>
            )}
            {visibles.map((c) => {
              const activa = !!c.orden && orden?.clave === c.orden;
              const ariaSort = c.orden
                ? activa ? (orden!.dir === 'asc' ? ('ascending' as const) : ('descending' as const)) : ('none' as const)
                : undefined;
              return (
                <th
                  key={c.clave}
                  scope="col"
                  aria-sort={ariaSort}
                  className={claseColumna(c, 'cxp-hoja__th')}
                  style={estiloFijo(c)}
                >
                  {c.orden ? (
                    <button type="button" className="ag-sort" onClick={() => onOrden(c.orden!)} title={`Ordenar por ${c.titulo}`}>
                      <span className="ag-sort__label">{c.titulo}</span>
                      <SortIcon />
                    </button>
                  ) : (
                    <span className="cxp-hoja__th-txt">{c.titulo}</span>
                  )}
                  <span
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Ancho de ${c.titulo}: arrastra el borde o usa las flechas; Enter lo restablece`}
                    aria-valuenow={anchoDe(c)}
                    aria-valuemin={c.min ?? MIN_POR_DEFECTO}
                    aria-valuemax={MAX_ANCHO}
                    tabIndex={0}
                    className="cxp-hoja__resize"
                    onPointerDown={(e) => iniciarArrastre(e, c)}
                    onDoubleClick={() => restablecerAncho(c)}
                    onKeyDown={(e) => teclaBorde(e, c)}
                  />
                </th>
              );
            })}
            {acciones && <th className="cxp-hoja__acc" scope="col"><span className="cxp-hoja__th-txt">Acciones</span></th>}
          </tr>
        </thead>

        <tbody>
          {filas.map((f) => (
            <tr
              key={idFila(f)}
              className={[claseFila?.(f), seleccion?.tiene(f) ? 'is-seleccionada' : ''].filter(Boolean).join(' ') || undefined}
              onClick={(e) => alClicFila(e, f)}
            >
              {seleccion && (
                <td
                  className="cxp-hoja__check"
                  onClick={(e) => {
                    e.stopPropagation();
                    seleccion.alternar(f, e.shiftKey);
                  }}
                >
                  <input type="checkbox" aria-label="Seleccionar esta fila" checked={seleccion.tiene(f)} onChange={() => undefined} />
                </td>
              )}
              {visibles.map((c) => (
                <td
                  key={c.clave}
                  className={claseColumna(c, `aj-${ajusteDe(c)}`)}
                  style={{ ...estiloFijo(c), ...c.estiloCelda?.(f) }}
                  title={c.tooltip?.(f) ?? undefined}
                >
                  {c.render(f)}
                </td>
              ))}
              {acciones && <td className="cxp-hoja__acc">{acciones(f)}</td>}
            </tr>
          ))}

          {!cargando && filas.length === 0 && (
            <tr>
              <td className="cxp-hoja__vacio" colSpan={nColumnas}>{vacio}</td>
            </tr>
          )}
          {cargando && filas.length === 0 && (
            <tr>
              <td className="cxp-hoja__vacio" colSpan={nColumnas}>Cargando…</td>
            </tr>
          )}
          {alCentinela && hayMas && (
            <tr ref={centinela} className="cxp-hoja__centinela">
              <td colSpan={nColumnas}>{cargandoMas ? 'Cargando más filas…' : ' '}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
