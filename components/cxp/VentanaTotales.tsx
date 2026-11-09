'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { copiarValor } from './copiado';
import type { GeometriaVentana, ModoCopiado } from './hoja/tipos';
import { moneda, type FilaCxp } from './tipos';

interface FilaTotal {
  clave: string;
  nit: string | null;
  nombre: string;
  documentos: number;
  vencido: number;
  total: number;
}
type Columna = 'nombre' | 'documentos' | 'vencido' | 'total';

const MIN_W = 300;
const MIN_H = 200;
const MARGEN = 8;

const limitar = (g: GeometriaVentana): GeometriaVentana => {
  const w = Math.min(Math.max(g.w, MIN_W), Math.max(MIN_W, window.innerWidth - MARGEN * 2));
  const h = Math.min(Math.max(g.h, MIN_H), Math.max(MIN_H, window.innerHeight - MARGEN * 2));
  return {
    w,
    h,
    x: Math.min(Math.max(g.x, MARGEN), Math.max(MARGEN, window.innerWidth - w - MARGEN)),
    y: Math.min(Math.max(g.y, MARGEN), Math.max(MARGEN, window.innerHeight - h - MARGEN)),
  };
};
const porDefecto = (): GeometriaVentana => limitar({ w: 440, h: 400, x: window.innerWidth - 440 - 24, y: 96 });

/**
 * Ventana flotante con el total por proveedor. Vive dentro de la página (no es otra ventana del navegador):
 * se arrastra por la barra de título, se redimensiona por la esquina inferior derecha y recuerda su lugar y tamaño.
 * Solo muestra números: no toca ningún documento.
 */
export default function VentanaTotales({
  supabase,
  geometria,
  onGeometria,
  seleccion,
  parametros,
  claveFiltros,
  modoCopiado,
  onCerrar,
}: {
  supabase: SupabaseClient;
  geometria?: GeometriaVentana;
  onGeometria: (g: GeometriaVentana) => void;
  seleccion: FilaCxp[];
  /** Filtros de la pantalla (los mismos de los totales de arriba). */
  parametros: Record<string, unknown>;
  claveFiltros: string;
  modoCopiado: ModoCopiado;
  onCerrar: () => void;
}) {
  const [geo, setGeo] = useState<GeometriaVentana>(() => limitar(geometria ?? porDefecto()));
  const geoRef = useRef(geo);
  geoRef.current = geo;
  const arrastre = useRef<{ modo: 'mover' | 'tamano'; px: number; py: number; inicio: GeometriaVentana } | null>(null);

  const [pestana, setPestana] = useState<'seleccion' | 'todos'>(seleccion.length > 0 ? 'seleccion' : 'todos');
  const [orden, setOrden] = useState<{ col: Columna; dir: 'asc' | 'desc' }>({ col: 'total', dir: 'desc' });
  const [todos, setTodos] = useState<FilaTotal[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [copiada, setCopiada] = useState<string | null>(null);
  const pedido = useRef(0);

  // Si la pantalla cambia de tamaño, la ventana no se pierde fuera de ella.
  useEffect(() => {
    const ajustar = () => setGeo((g) => limitar(g));
    window.addEventListener('resize', ajustar);
    return () => window.removeEventListener('resize', ajustar);
  }, []);

  // Totales de todo lo que muestran los filtros actuales (consulta en la base).
  useEffect(() => {
    if (pestana !== 'todos') return;
    const mio = ++pedido.current;
    setCargando(true);
    supabase.rpc('cxp_totales_proveedor', parametros).then(({ data, error: err }) => {
      if (mio !== pedido.current) return;
      setCargando(false);
      if (err) return setError(err.message);
      setError('');
      setTodos(
        ((data ?? []) as { tercero: string | null; nombre: string; documentos: number; vencido: number; total: number }[]).map((r) => ({
          clave: r.tercero ?? `n:${r.nombre.toLowerCase()}`,
          nit: r.tercero,
          nombre: r.nombre,
          documentos: Number(r.documentos),
          vencido: Number(r.vencido),
          total: Number(r.total),
        })),
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pestana, claveFiltros, supabase]);

  const deSeleccion = useMemo(() => {
    const m = new Map<string, FilaTotal>();
    for (const f of seleccion) {
      const clave = f.tercero ?? `n:${f.nombre.trim().toLowerCase()}`;
      const r = m.get(clave) ?? { clave, nit: f.tercero, nombre: f.nombre, documentos: 0, vencido: 0, total: 0 };
      r.documentos += 1;
      r.total += f.val_pagar;
      if (f.vencido) r.vencido += f.val_pagar;
      m.set(clave, r);
    }
    return Array.from(m.values());
  }, [seleccion]);

  const filas = useMemo(() => {
    const base = pestana === 'seleccion' ? deSeleccion : (todos ?? []);
    const k = orden.dir === 'asc' ? 1 : -1;
    return [...base].sort((a, b) =>
      orden.col === 'nombre' ? k * a.nombre.localeCompare(b.nombre, 'es') : k * (a[orden.col] - b[orden.col]) || a.nombre.localeCompare(b.nombre, 'es'),
    );
  }, [pestana, deSeleccion, todos, orden]);
  const sumaTotal = filas.reduce((s, r) => s + r.total, 0);
  const sumaDocs = filas.reduce((s, r) => s + r.documentos, 0);
  const sumaVenc = filas.reduce((s, r) => s + r.vencido, 0);

  function alternarOrden(col: Columna) {
    setOrden((o) => (o.col === col ? { col, dir: o.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: col === 'nombre' ? 'asc' : 'desc' }));
  }
  const flecha = (col: Columna) => (orden.col === col ? (orden.dir === 'asc' ? ' ▲' : ' ▼') : '');

  // ---- Mover y cambiar de tamaño (ratón, táctil y teclado) ----
  const empezar = (modo: 'mover' | 'tamano') => (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    arrastre.current = { modo, px: e.clientX, py: e.clientY, inicio: geoRef.current };
  };
  const mover = (e: React.PointerEvent) => {
    const a = arrastre.current;
    if (!a) return;
    const dx = e.clientX - a.px;
    const dy = e.clientY - a.py;
    setGeo(limitar(a.modo === 'mover' ? { ...a.inicio, x: a.inicio.x + dx, y: a.inicio.y + dy } : { ...a.inicio, w: a.inicio.w + dx, h: a.inicio.h + dy }));
  };
  const soltar = () => {
    if (!arrastre.current) return;
    arrastre.current = null;
    onGeometria(geoRef.current); // se guarda al terminar, no en cada movimiento
  };
  const teclado = useCallback(
    (e: React.KeyboardEvent) => {
      const paso = e.altKey ? 1 : 16;
      const d: Record<string, [number, number]> = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso] };
      const v = d[e.key];
      if (!v) return;
      e.preventDefault();
      const g = geoRef.current;
      const sig = limitar(e.shiftKey ? { ...g, w: g.w + v[0], h: g.h + v[1] } : { ...g, x: g.x + v[0], y: g.y + v[1] });
      setGeo(sig);
      onGeometria(sig);
    },
    [onGeometria],
  );

  async function copiar(r: FilaTotal) {
    try {
      await copiarValor(r.total, modoCopiado);
      setCopiada(r.clave);
      setTimeout(() => setCopiada((c) => (c === r.clave ? null : c)), 1400);
    } catch {
      /* sin permiso del navegador: no pasa nada */
    }
  }

  return (
    <section
      className="cxp-vent"
      role="dialog"
      aria-modal="false"
      aria-label="Totales por proveedor"
      style={{ left: geo.x, top: geo.y, width: geo.w, height: geo.h }}
      onKeyDown={(e) => e.key === 'Escape' && onCerrar()}
    >
      <header
        className="cxp-vent__cab"
        tabIndex={0}
        onPointerDown={empezar('mover')}
        onPointerMove={mover}
        onPointerUp={soltar}
        onPointerCancel={soltar}
        onKeyDown={teclado}
        title="Arrastra para mover. Con el teclado: flechas para mover y Mayús + flechas para cambiar el tamaño."
      >
        <strong>Totales por proveedor</strong>
        <button type="button" className="ui-btn ui-btn--sm" onClick={onCerrar} aria-label="Cerrar la ventana de totales">✕</button>
      </header>

      <div className="cxp-vent__tabs" role="tablist" aria-label="Qué totales ver">
        <button type="button" role="tab" aria-selected={pestana === 'seleccion'} className={pestana === 'seleccion' ? 'is-active' : undefined} onClick={() => setPestana('seleccion')}>
          Seleccionados ({seleccion.length})
        </button>
        <button type="button" role="tab" aria-selected={pestana === 'todos'} className={pestana === 'todos' ? 'is-active' : undefined} onClick={() => setPestana('todos')}>
          Todo lo filtrado
        </button>
      </div>

      <div className="cxp-vent__cuerpo">
        {error && <p className="cxp-rev__error" role="alert">{error}</p>}
        {pestana === 'seleccion' && seleccion.length === 0 ? (
          <p className="ui-hint">Marca documentos en la tabla y aquí verás cuánto vas a pagar a cada proveedor.</p>
        ) : cargando && !todos ? (
          <p className="ui-hint" role="status">Cargando…</p>
        ) : filas.length === 0 ? (
          <p className="ui-hint">No hay datos con estos filtros.</p>
        ) : (
          <table className="cxp-vent__tabla">
            <thead>
              <tr>
                <th scope="col"><button type="button" onClick={() => alternarOrden('nombre')}>Proveedor{flecha('nombre')}</button></th>
                <th scope="col" className="num"><button type="button" onClick={() => alternarOrden('documentos')}>Docs{flecha('documentos')}</button></th>
                <th scope="col" className="num"><button type="button" onClick={() => alternarOrden('vencido')}>Vencido{flecha('vencido')}</button></th>
                <th scope="col" className="num"><button type="button" onClick={() => alternarOrden('total')}>Total{flecha('total')}</button></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((r) => (
                <tr key={r.clave}>
                  <td title={r.nit ? `${r.nombre} · ${r.nit}` : r.nombre}>{r.nombre}</td>
                  <td className="num">{r.documentos}</td>
                  <td className="num">{r.vencido > 0 ? moneda(r.vencido) : '—'}</td>
                  <td className="num">
                    <button type="button" className="cxp-vent__copiar" onClick={() => copiar(r)} title="Copiar este total" aria-label={`Copiar el total de ${r.nombre}`}>
                      {copiada === r.clave ? '✓' : moneda(r.total)}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">{filas.length} proveedor(es)</th>
                <td className="num">{sumaDocs}</td>
                <td className="num">{sumaVenc > 0 ? moneda(sumaVenc) : '—'}</td>
                <td className="num">{moneda(sumaTotal)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      <div
        className="cxp-vent__asa"
        role="separator"
        aria-label="Cambiar el tamaño de la ventana"
        onPointerDown={empezar('tamano')}
        onPointerMove={mover}
        onPointerUp={soltar}
        onPointerCancel={soltar}
      />
    </section>
  );
}
