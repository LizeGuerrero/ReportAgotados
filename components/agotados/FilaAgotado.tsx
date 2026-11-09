'use client';

import { useEffect, useRef, useState } from 'react';
import { COLUMNA_DE, RESPUESTAS, RESPUESTA_INSIGNIA, fecha, type Fila } from './tipos';
import { textoCeldaDe } from './columnas';

export interface Celda {
  r: number; // posición de la fila en la página actual
  c: number; // posición de la columna entre las visibles
}
export interface Rango {
  r1: number;
  r2: number;
  c1: number;
  c2: number;
  activa: Celda;
}

/** Clases que dibujan el rectángulo de selección: fondo en todas las celdas y borde solo en el contorno. */
export function claseSeleccion(r: number, c: number, s: Rango | null): string {
  if (!s || r < s.r1 || r > s.r2 || c < s.c1 || c > s.c2) return '';
  return [
    'agx-sel',
    r === s.r1 && 'agx-sel--t',
    r === s.r2 && 'agx-sel--b',
    c === s.c1 && 'agx-sel--l',
    c === s.c2 && 'agx-sel--r',
    r === s.activa.r && c === s.activa.c && 'agx-sel--activa',
  ]
    .filter(Boolean)
    .join(' ');
}

export interface Redim {
  down: (e: React.PointerEvent<HTMLElement>, altoActual: number) => void;
  move: (e: React.PointerEvent<HTMLElement>) => void;
  up: (e: React.PointerEvent<HTMLElement>) => void;
  reset: () => void;
}

export default function FilaAgotado({
  fila: f,
  indice,
  numero,
  rango,
  accion,
  columnas,
  ocultas,
  fijas,
  ultimaFija,
  altura,
  redim,
}: {
  fila: Fila;
  /** Posición de la fila en la página; junto con la columna identifica cada celda seleccionable. */
  indice: number;
  /** Número de fila en todo el resultado (1, 2, 3…), como el encabezado de fila de una hoja. */
  numero: number;
  rango: Rango | null;
  accion: (nombre: string, args: Record<string, unknown>) => Promise<void>;
  /** Claves de las columnas que se ven, en orden (g-* = resumen de un grupo plegado). */
  columnas: string[];
  ocultas: string[];
  /** Columnas congeladas: clave → distancia al borde izquierdo. */
  fijas: Record<string, number>;
  ultimaFija: string | null;
  altura?: number;
  redim: Redim;
}) {
  const [cantidad, setCantidad] = useState(f.cantidad_sugerida?.toString() ?? '');
  const [nota, setNota] = useState(f.notas ?? '');
  // Mientras el usuario está escribiendo, un refresco en segundo plano (por ejemplo porque Compras respondió
  // otro ítem) no debe borrar lo que todavía no ha guardado.
  const editandoCantidad = useRef(false);
  const editandoNota = useRef(false);

  useEffect(() => {
    if (!editandoCantidad.current) setCantidad(f.cantidad_sugerida?.toString() ?? '');
  }, [f.cantidad_sugerida]);
  useEffect(() => {
    if (!editandoNota.current) setNota(f.notas ?? '');
  }, [f.notas]);

  const activo = f.estado_comercial !== null;
  const agotado = f.respuesta_compras === 'agotado_proveedor';

  function guardarCantidad() {
    editandoCantidad.current = false;
    const nueva = cantidad === '' ? null : Number(cantidad);
    if (nueva === (f.cantidad_sugerida ?? null)) return;
    if (nueva !== null && nueva <= 0) return;
    accion('agotado_guardar_cantidad', { p_item: f.item_id, p_cantidad: nueva });
  }

  function guardarNota() {
    editandoNota.current = false;
    if (nota.trim() === (f.notas ?? '')) return;
    accion('agotado_guardar_nota', { p_item: f.item_id, p_nota: nota });
  }

  const insigniaRespuesta = f.respuesta_compras && (
    <>
      <span className={`ui-badge ${RESPUESTA_INSIGNIA[f.respuesta_compras]}`}>{RESPUESTAS[f.respuesta_compras]}</span>
      {f.respuesta_compras === 'no_se_pide' && f.motivo_compras && <span className="agx-motivo">{f.motivo_compras}</span>}
    </>
  );
  const insigniaSolicitud = activo && <span className="ui-badge ui-badge--info">Solicitar pedido</span>;
  const altoCampo = altura ? Math.max(altura - 1, 0) : undefined;

  const celdas: Record<string, React.ReactNode> = {
    item: f.codigo ?? f.item_id,
    nombre: f.nombre_base,
    referencia: f.referencia ?? '',
    linea: f.linea ?? '',
    sede: f.sede ?? '',
    usuario: f.usuario ?? '',
    solicitud: insigniaSolicitud,
    fecha_solicitud: fecha(f.fecha_estado),
    respuesta: insigniaRespuesta,
    fecha_respuesta: fecha(f.fecha_respuesta),
    cantidad: (
      <input
        value={cantidad}
        inputMode="numeric"
        aria-label={`Cantidad sugerida de ${f.nombre_base}`}
        className="agx-campo agx-campo--num"
        onFocus={() => (editandoCantidad.current = true)}
        onChange={(e) => setCantidad(e.target.value.replace(/\D/g, ''))}
        onBlur={guardarCantidad}
        style={altoCampo ? { height: altoCampo } : undefined}
      />
    ),
    nota: (
      <textarea
        value={nota}
        rows={1}
        aria-label={`Nota sobre ${f.nombre_base}`}
        className="agx-campo agx-campo--nota"
        style={altoCampo ? { height: altoCampo } : undefined}
        onFocus={() => (editandoNota.current = true)}
        onChange={(e) => setNota(e.target.value)}
        onBlur={guardarNota}
      />
    ),
    fecha_nota: fecha(f.fecha_nota),
    seguimiento: f.seguimiento && <span className="ui-badge ui-badge--warning">{f.seguimiento}</span>,
    accion: (
      <>
        {!activo && (
          <button
            type="button"
            className="agx-act agx-act--primario"
            onClick={() => accion('agotado_solicitar', { p_item: f.item_id, p_cantidad: cantidad === '' ? null : Number(cantidad) })}
          >
            Solicitar pedido
          </button>
        )}
        {activo && !agotado && (
          <button type="button" className="agx-act" onClick={() => accion('agotado_cerrar', { p_item: f.item_id })}>
            Cerrar
          </button>
        )}
        {activo && agotado && (
          <button type="button" className="agx-act agx-act--peligro" onClick={() => accion('agotado_cerrar', { p_item: f.item_id, p_cancelar: true })}>
            Cancelar
          </button>
        )}
      </>
    ),
    // Resumen de cada grupo cuando está plegado
    'g-solicitud': insigniaSolicitud,
    'g-respuesta': insigniaRespuesta,
    'g-nota':
      f.cantidad_sugerida !== null || f.notas ? (
        <span>
          {f.cantidad_sugerida ?? ''}
          {f.notas ? ' · con nota' : ''}
        </span>
      ) : null,
  };

  return (
    <tr className={activo ? 'agx-row--activo' : undefined} style={altura ? { height: altura } : undefined}>
      <td className="agx-gutter" data-fila={indice} title="Clic: seleccionar la fila">
        <span className="agx-gutter__n">{numero}</span>
        {/* Tirador de alto de fila, como en el encabezado de fila de una hoja de cálculo */}
        <span
          className="agx-rowresizer"
          role="separator"
          aria-orientation="horizontal"
          aria-label={`Cambiar alto de la fila del ítem ${f.item_id}`}
          title="Arrastra para cambiar el alto. Doble clic: alto natural"
          onPointerDown={(e) => redim.down(e, e.currentTarget.closest('tr')!.getBoundingClientRect().height)}
          onPointerMove={redim.move}
          onPointerUp={redim.up}
          onPointerCancel={redim.up}
          onDoubleClick={redim.reset}
        />
      </td>
      {columnas.map((k, c) => {
        const def = COLUMNA_DE[k];
        const esCampo = k === 'cantidad' || k === 'nota';
        const esAccion = k === 'accion';
        const izq = fijas[k];
        const clases = [
          'agx-td',
          def?.tipo === 'num' && 'agx-td--num',
          def?.tipo === 'fecha' && 'agx-td--fecha',
          esCampo && 'agx-td--campo',
          esAccion && 'agx-td--accion',
          izq !== undefined && 'agx-fija',
          ultimaFija === k && 'agx-fija--ultima',
          claseSeleccion(indice, c, rango),
        ]
          .filter(Boolean)
          .join(' ');
        const textoPlano = esCampo || esAccion ? undefined : textoCeldaDe(f, k, ocultas) || undefined;
        return (
          <td
            key={k}
            data-col={k}
            data-r={indice}
            data-c={c}
            className={clases}
            title={textoPlano}
            style={izq !== undefined ? { left: izq } : undefined}
          >
            {celdas[k]}
          </td>
        );
      })}
    </tr>
  );
}

