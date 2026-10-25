'use client';

import {
  MAX_CONGELAR,
  MAX_FILAS_INFINITO,
  OPCIONES_POR_PAGINA,
  type AjusteTexto,
  type Densidad,
  type PrefsHoja,
} from './tipos';

/** Formato de la tabla: texto largo, alto de fila, columnas fijas y forma de cargar las filas. */
export default function PanelFormato({
  prefs,
  onPrefs,
  onRestablecer,
  conTramos,
  conSeleccion = false,
}: {
  prefs: PrefsHoja;
  onPrefs: (p: PrefsHoja) => void;
  onRestablecer: () => void;
  conTramos: boolean;
  conSeleccion?: boolean;
}) {
  const opcion = <V extends string>(nombre: string, valor: V, actual: V, texto: string, poner: (v: V) => void) => (
    <label className="cxp-panel__fila">
      <input type="radio" name={nombre} checked={actual === valor} onChange={() => poner(valor)} />
      {texto}
    </label>
  );

  return (
    <div className="cxp-panel">
      <div className="cxp-panel__cab">
        <strong>Formato de la tabla</strong>
        <button type="button" className="cxp-link" onClick={onRestablecer}>Restablecer todo</button>
      </div>

      <fieldset className="cxp-panel__grupo">
        <legend>Texto largo</legend>
        {opcion<AjusteTexto>('ajuste', 'puntos', prefs.ajuste, 'Puntos suspensivos (…)', (v) => onPrefs({ ...prefs, ajuste: v }))}
        {opcion<AjusteTexto>('ajuste', 'cortar', prefs.ajuste, 'Cortar', (v) => onPrefs({ ...prefs, ajuste: v }))}
        {opcion<AjusteTexto>('ajuste', 'ajustar', prefs.ajuste, 'Ajustar texto (varias líneas)', (v) => onPrefs({ ...prefs, ajuste: v }))}
        <p className="ui-hint">Cada columna de texto puede tener su propio ajuste en el panel Columnas.</p>
      </fieldset>

      <fieldset className="cxp-panel__grupo">
        <legend>Alto de fila</legend>
        {opcion<Densidad>('densidad', 'compacta', prefs.densidad, 'Compacta', (v) => onPrefs({ ...prefs, densidad: v }))}
        {opcion<Densidad>('densidad', 'normal', prefs.densidad, 'Normal', (v) => onPrefs({ ...prefs, densidad: v }))}
        {opcion<Densidad>('densidad', 'amplia', prefs.densidad, 'Amplia', (v) => onPrefs({ ...prefs, densidad: v }))}
      </fieldset>

      <fieldset className="cxp-panel__grupo">
        <legend>Columnas fijas</legend>
        <label className="cxp-panel__fila">
          Dejar fijas las primeras
          <select
            className="ui-input ui-input--sm cxp-panel__ajuste"
            value={prefs.congelar}
            onChange={(e) => onPrefs({ ...prefs, congelar: Number(e.target.value) })}
          >
            {Array.from({ length: MAX_CONGELAR + 1 }, (_, n) => (
              <option key={n} value={n}>{n === 0 ? 'Ninguna' : `${n} columna(s)`}</option>
            ))}
          </select>
        </label>
        <p className="ui-hint">Se quedan a la izquierda al desplazarte hacia los lados.</p>
      </fieldset>

      <fieldset className="cxp-panel__grupo">
        <legend>Cómo se cargan las filas</legend>
        {opcion<PrefsHoja['modo']>('modo', 'paginas', prefs.modo, 'Por páginas', (v) => onPrefs({ ...prefs, modo: v }))}
        {opcion<PrefsHoja['modo']>('modo', 'infinito', prefs.modo, 'Scroll infinito', (v) => onPrefs({ ...prefs, modo: v }))}
        <label className="cxp-panel__fila">
          Filas por {prefs.modo === 'infinito' ? 'carga' : 'página'}
          <select
            className="ui-input ui-input--sm cxp-panel__ajuste"
            value={prefs.porPagina}
            onChange={(e) => onPrefs({ ...prefs, porPagina: Number(e.target.value) })}
          >
            {OPCIONES_POR_PAGINA.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        {prefs.modo === 'infinito' && (
          <p className="ui-hint">Se cargan más filas al llegar al final, hasta {MAX_FILAS_INFINITO}. Para ver el resto, afina los filtros.</p>
        )}
      </fieldset>

      {conSeleccion && (
        <fieldset className="cxp-panel__grupo">
          <legend>Selección</legend>
          <label className="cxp-panel__fila">
            <input type="checkbox" checked={prefs.clicFila} onChange={(e) => onPrefs({ ...prefs, clicFila: e.target.checked })} />
            Marcar la fila al tocar cualquier parte de ella
          </label>
          <p className="ui-hint">Con Shift se marca un rango de filas de una vez.</p>
        </fieldset>
      )}

      {conTramos && (
        <label className="cxp-panel__fila">
          <input type="checkbox" checked={prefs.verTramos} onChange={(e) => onPrefs({ ...prefs, verTramos: e.target.checked })} />
          Mostrar la antigüedad por tramos
        </label>
      )}
    </div>
  );
}
