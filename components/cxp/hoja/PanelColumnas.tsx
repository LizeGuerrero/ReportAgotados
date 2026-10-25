'use client';

import type { AjusteTexto, GrupoHoja, PrefsHoja } from './tipos';

interface ColumnaBasica {
  clave: string;
  titulo: string;
  grupo: string;
  ajustable?: boolean;
}

/** Elegir qué columnas ver, contraer grupos y ajustar el texto de cada columna. */
export default function PanelColumnas({
  columnas,
  grupos,
  prefs,
  onPrefs,
  ocultasPorDefecto,
}: {
  columnas: ColumnaBasica[];
  grupos: GrupoHoja[];
  prefs: PrefsHoja;
  onPrefs: (p: PrefsHoja) => void;
  ocultasPorDefecto: string[];
}) {
  const visibles = columnas.filter((c) => !prefs.ocultas.includes(c.clave));

  function alternarColumna(clave: string, ver: boolean) {
    const ocultas = ver ? prefs.ocultas.filter((x) => x !== clave) : [...prefs.ocultas, clave];
    onPrefs({ ...prefs, ocultas });
  }
  function alternarGrupo(clave: string, contraer: boolean) {
    const contraidos = contraer ? [...prefs.contraidos, clave] : prefs.contraidos.filter((x) => x !== clave);
    onPrefs({ ...prefs, contraidos });
  }
  function ajustarColumna(clave: string, valor: string) {
    const ajustes = { ...prefs.ajustes };
    if (valor === '') delete ajustes[clave];
    else ajustes[clave] = valor as AjusteTexto;
    onPrefs({ ...prefs, ajustes });
  }

  return (
    <div className="cxp-panel">
      <div className="cxp-panel__cab">
        <strong>Columnas</strong>
        <button
          type="button"
          className="cxp-link"
          onClick={() => onPrefs({ ...prefs, ocultas: ocultasPorDefecto, contraidos: [], anchos: {}, ajustes: {} })}
        >
          Restablecer columnas
        </button>
      </div>
      <p className="ui-hint">
        Marca las que quieres ver. Para ganar espacio sin perder datos, <strong>contrae un grupo</strong>: queda solo su
        columna principal (también puedes tocar el nombre del grupo sobre la tabla).
      </p>

      {grupos.map((g) => {
        const cols = columnas.filter((c) => c.grupo === g.clave);
        if (cols.length === 0) return null;
        return (
          <fieldset key={g.clave} className="cxp-panel__grupo">
            <legend>{g.titulo}</legend>
            {cols.length > 1 && (
              <label className="cxp-panel__fila cxp-panel__fila--grupo">
                <input
                  type="checkbox"
                  checked={prefs.contraidos.includes(g.clave)}
                  onChange={(e) => alternarGrupo(g.clave, e.target.checked)}
                />
                Contraer este grupo
              </label>
            )}
            {cols.map((c) => {
              const unica = visibles.length === 1 && visibles[0].clave === c.clave;
              return (
                <div key={c.clave} className="cxp-panel__fila">
                  <label>
                    <input
                      type="checkbox"
                      checked={!prefs.ocultas.includes(c.clave)}
                      disabled={unica}
                      onChange={(e) => alternarColumna(c.clave, e.target.checked)}
                    />
                    {c.titulo}
                  </label>
                  {c.ajustable && (
                    <select
                      className="ui-input ui-input--sm cxp-panel__ajuste"
                      aria-label={`Texto largo en ${c.titulo}`}
                      value={prefs.ajustes[c.clave] ?? ''}
                      onChange={(e) => ajustarColumna(c.clave, e.target.value)}
                    >
                      <option value="">Según la tabla</option>
                      <option value="puntos">Puntos (…)</option>
                      <option value="cortar">Cortar</option>
                      <option value="ajustar">Ajustar</option>
                    </select>
                  )}
                </div>
              );
            })}
          </fieldset>
        );
      })}
    </div>
  );
}
