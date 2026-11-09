'use client';

import { IcBajar, IcChevAbajo, IcSubir } from './iconos';
import { ordenarColumnas } from './columnas';
import { COLUMNAS, GRUPOS, TITULO_BLOQUE, type Bloque } from './tipos';

const BLOQUES: Bloque[] = ['ident', 'g-solicitud', 'g-respuesta', 'g-nota', 'seg', 'acc'];

/**
 * Lista de columnas por bloque: mostrar/ocultar y subir/bajar dentro de su bloque. La usan el panel lateral y la
 * sección «Columnas» del centro de configuración (misma lista, mismas preferencias).
 */
export default function ListaColumnas({
  ocultas,
  orden,
  plegados,
  onAlternar,
  onMover,
  onAlternarGrupo,
  onMostrarTodas,
}: {
  ocultas: string[];
  orden: string[];
  plegados: string[];
  onAlternar: (clave: string) => void;
  onMover: (clave: string, dir: -1 | 1) => void;
  onAlternarGrupo: (grupo: Bloque) => void;
  onMostrarTodas: () => void;
}) {
  const todas = ordenarColumnas(COLUMNAS, orden);

  return (
    <div className="agx-cols">
      <div className="agx-cols__resumen">
        <span>
          <strong>{COLUMNAS.length - ocultas.length}</strong> de {COLUMNAS.length} columnas visibles
        </span>
        <button type="button" className="agx-link" onClick={onMostrarTodas} disabled={ocultas.length === 0}>
          Mostrar todas
        </button>
      </div>

      {BLOQUES.map((b) => {
        const cols = todas.filter((c) => c.bloque === b);
        const grupo = GRUPOS.find((g) => g.clave === b);
        const plegado = !!grupo && plegados.includes(b);
        return (
          <div key={b} className="agx-cols__bloque" role="group" aria-label={TITULO_BLOQUE[b]}>
            <div className="agx-cols__tit">
              <span>{TITULO_BLOQUE[b]}</span>
              {grupo && (
                <button
                  type="button"
                  className="agx-link agx-cols__plegar"
                  aria-pressed={plegado}
                  onClick={() => onAlternarGrupo(b)}
                  title={plegado ? 'Desplegar el grupo en la tabla' : 'Plegar el grupo en una sola columna'}
                >
                  <IcChevAbajo className={plegado ? 'agx-rot' : ''} />
                  {plegado ? 'Plegado' : 'Desplegado'}
                </button>
              )}
            </div>
            <ul className="agx-cols__lista">
              {cols.map((c, i) => {
                const oculta = ocultas.includes(c.clave);
                return (
                  <li key={c.clave} className={`agx-cols__fila${oculta ? ' is-oculta' : ''}`}>
                    <label className="agx-cols__nombre" title={c.esencial ? 'Esta columna no se puede ocultar' : undefined}>
                      <input
                        type="checkbox"
                        checked={!oculta}
                        disabled={c.esencial}
                        onChange={() => onAlternar(c.clave)}
                        aria-label={`Mostrar la columna ${c.titulo}`}
                      />
                      <span>{c.titulo}</span>
                    </label>
                    {cols.length > 1 && (
                      <span className="agx-cols__mover">
                        <button
                          type="button"
                          className="agx-ico-btn"
                          disabled={i === 0}
                          onClick={() => onMover(c.clave, -1)}
                          aria-label={`Mover ${c.titulo} hacia arriba`}
                          title="Subir (queda más a la izquierda)"
                        >
                          <IcSubir />
                        </button>
                        <button
                          type="button"
                          className="agx-ico-btn"
                          disabled={i === cols.length - 1}
                          onClick={() => onMover(c.clave, 1)}
                          aria-label={`Mover ${c.titulo} hacia abajo`}
                          title="Bajar (queda más a la derecha)"
                        >
                          <IcBajar />
                        </button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
