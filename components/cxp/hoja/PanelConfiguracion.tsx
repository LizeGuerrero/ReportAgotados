'use client';

import { useEffect, useState } from 'react';
import {
  ANCHO_MAX_PREF,
  ANCHO_MIN_PREF,
  MAX_CONGELAR,
  MAX_CONGELAR_DER,
  MAX_FILAS_INFINITO,
  OPCIONES_POR_PAGINA,
  aplicarOrden,
  type AjusteTexto,
  type Alineacion,
  type ColumnaHoja,
  type Densidad,
  type GrupoHoja,
  type ModoCopiado,
  type PrefsGeneral,
  type PrefsHoja,
} from './tipos';

type Seccion = 'columnas' | 'porcolumna' | 'formato' | 'fijas' | 'copiado' | 'restablecer';
const SECCIONES: { clave: Seccion; titulo: string }[] = [
  { clave: 'columnas', titulo: 'Columnas visibles y orden' },
  { clave: 'porcolumna', titulo: 'Ajustes por columna' },
  { clave: 'formato', titulo: 'Formato y presentación' },
  { clave: 'fijas', titulo: 'Columnas fijas' },
  { clave: 'copiado', titulo: 'Copiado de valores' },
  { clave: 'restablecer', titulo: 'Restablecer' },
];

type ColumnaCfg = Pick<ColumnaHoja<unknown>, 'clave' | 'titulo' | 'grupo' | 'ancho' | 'ajustable' | 'alinear' | 'min'>;

/**
 * Configuración de CXP en una ventana propia, agrupada por secciones. Todo se guarda en las preferencias
 * del usuario (base de datos): no afecta a otras personas ni a otras pantallas, salvo «Copiado de valores»,
 * que vale para todas las pantallas de CXP del mismo usuario.
 */
export default function PanelConfiguracion({
  columnas,
  grupos,
  prefs,
  onPrefs,
  general,
  onGeneral,
  ocultasPorDefecto,
  conTramos,
  conSeleccion,
  onRestablecerPantalla,
  onRestablecerTodo,
  sincronizado,
  onCerrar,
}: {
  columnas: ColumnaCfg[];
  grupos: GrupoHoja[];
  prefs: PrefsHoja;
  onPrefs: (p: PrefsHoja) => void;
  general: PrefsGeneral;
  onGeneral: (g: PrefsGeneral) => void;
  ocultasPorDefecto: string[];
  conTramos: boolean;
  conSeleccion: boolean;
  onRestablecerPantalla: () => void;
  onRestablecerTodo: () => void;
  sincronizado: boolean;
  onCerrar: () => void;
}) {
  const [seccion, setSeccion] = useState<Seccion>('columnas');

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onCerrar]);

  const ordenadas = aplicarOrden(columnas, prefs.orden);
  const visibles = ordenadas.filter((c) => !prefs.ocultas.includes(c.clave));

  const radio = <V extends string>(nombre: string, valor: V, actual: V, texto: string, poner: (v: V) => void) => (
    <label className="cxp-panel__fila">
      <input type="radio" name={nombre} checked={actual === valor} onChange={() => poner(valor)} />
      {texto}
    </label>
  );

  // ---- Columnas: visibilidad, grupos y orden dentro del grupo ----
  const alternarColumna = (clave: string, ver: boolean) =>
    onPrefs({ ...prefs, ocultas: ver ? prefs.ocultas.filter((x) => x !== clave) : [...prefs.ocultas, clave] });
  const alternarGrupo = (clave: string, contraer: boolean) =>
    onPrefs({ ...prefs, contraidos: contraer ? [...prefs.contraidos, clave] : prefs.contraidos.filter((x) => x !== clave) });
  function mover(clave: string, grupo: string, delta: -1 | 1) {
    const dentro = ordenadas.filter((c) => c.grupo === grupo).map((c) => c.clave);
    const i = dentro.indexOf(clave);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= dentro.length) return;
    [dentro[i], dentro[j]] = [dentro[j], dentro[i]];
    // Se conserva el orden de los demás grupos y se reemplaza el de este.
    const resto = ordenadas.filter((c) => c.grupo !== grupo).map((c) => c.clave);
    onPrefs({ ...prefs, orden: [...resto, ...dentro] });
  }

  // ---- Por columna ----
  function ponerAncho(c: ColumnaCfg, valor: string) {
    const anchos = { ...prefs.anchos };
    const n = Math.round(Number(valor));
    if (valor.trim() === '' || !Number.isFinite(n)) delete anchos[c.clave];
    else anchos[c.clave] = Math.min(ANCHO_MAX_PREF, Math.max(c.min ?? ANCHO_MIN_PREF, n));
    onPrefs({ ...prefs, anchos });
  }
  function ponerAjuste(clave: string, valor: string) {
    const ajustes = { ...prefs.ajustes };
    if (valor === '') delete ajustes[clave];
    else ajustes[clave] = valor as AjusteTexto;
    onPrefs({ ...prefs, ajustes });
  }
  function ponerAlineacion(clave: string, valor: string) {
    const alineaciones = { ...prefs.alineaciones };
    if (valor === '') delete alineaciones[clave];
    else alineaciones[clave] = valor as Alineacion;
    onPrefs({ ...prefs, alineaciones });
  }

  // ---- Fijas a la derecha ----
  function alternarFijaDer(clave: string, fijar: boolean) {
    const fijasDer = fijar ? [...prefs.fijasDer, clave] : prefs.fijasDer.filter((x) => x !== clave);
    onPrefs({ ...prefs, fijasDer });
  }

  return (
    <div className="cxp-modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="cxp-modal__card cxp-modal__card--ancha cxp-config" role="dialog" aria-modal="true" aria-labelledby="cxp-config-titulo">
        <div className="cxp-config__cab">
          <h2 id="cxp-config-titulo" className="cxp-modal__title">Configuración de CXP</h2>
          <button type="button" className="ui-btn" onClick={onCerrar}>Cerrar</button>
        </div>
        <p className="ui-hint">
          Estas preferencias son <strong>solo tuyas</strong>: se guardan en tu usuario y las encuentras igual al volver a entrar.
        </p>
        {!sincronizado && (
          <div className="cxp-banner cxp-banner--aviso" role="alert">
            No se pudo conectar con tus preferencias guardadas: los cambios de esta sesión no se conservarán.
          </div>
        )}

        <div className="cxp-config__cuerpo">
          <nav className="cxp-config__nav" aria-label="Secciones de configuración">
            {SECCIONES.map((s) => (
              <button
                key={s.clave}
                type="button"
                className={seccion === s.clave ? 'cxp-config__tab is-active' : 'cxp-config__tab'}
                aria-current={seccion === s.clave ? 'page' : undefined}
                onClick={() => setSeccion(s.clave)}
              >
                {s.titulo}
              </button>
            ))}
          </nav>

          <div className="cxp-config__panel">
            {seccion === 'columnas' && (
              <>
                <p className="ui-hint">
                  Marca las columnas que quieres ver y usa ▲ ▼ para ordenarlas <strong>dentro de su grupo</strong>. Contraer un
                  grupo deja solo su columna principal.
                </p>
                {grupos.map((g) => {
                  const cols = ordenadas.filter((c) => c.grupo === g.clave);
                  if (cols.length === 0) return null;
                  return (
                    <fieldset key={g.clave} className="cxp-panel__grupo">
                      <legend>{g.titulo}</legend>
                      {cols.length > 1 && (
                        <label className="cxp-panel__fila cxp-panel__fila--grupo">
                          <input type="checkbox" checked={prefs.contraidos.includes(g.clave)} onChange={(e) => alternarGrupo(g.clave, e.target.checked)} />
                          Contraer este grupo
                        </label>
                      )}
                      {cols.map((c, i) => {
                        const unica = visibles.length === 1 && visibles[0].clave === c.clave;
                        return (
                          <div key={c.clave} className="cxp-panel__fila">
                            <label>
                              <input type="checkbox" checked={!prefs.ocultas.includes(c.clave)} disabled={unica} onChange={(e) => alternarColumna(c.clave, e.target.checked)} />
                              {c.titulo}
                            </label>
                            {cols.length > 1 && (
                              <span className="cxp-config__mover">
                                <button type="button" className="ui-btn ui-btn--sm" disabled={i === 0} aria-label={`Subir ${c.titulo}`} title="Mover antes" onClick={() => mover(c.clave, g.clave, -1)}>▲</button>
                                <button type="button" className="ui-btn ui-btn--sm" disabled={i === cols.length - 1} aria-label={`Bajar ${c.titulo}`} title="Mover después" onClick={() => mover(c.clave, g.clave, 1)}>▼</button>
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </fieldset>
                  );
                })}
                <button
                  type="button"
                  className="cxp-link"
                  onClick={() => onPrefs({ ...prefs, ocultas: ocultasPorDefecto, contraidos: [], orden: [] })}
                >
                  Restablecer columnas visibles y orden
                </button>
              </>
            )}

            {seccion === 'porcolumna' && (
              <>
                <p className="ui-hint">
                  Cada columna puede tener su propio ancho, ajuste de texto y alineación. El ajuste de texto aplica a las columnas de texto
                  (por ejemplo Detalles). También puedes cambiar el ancho arrastrando el borde del encabezado.
                </p>
                <div className="cxp-config__tabla" role="table" aria-label="Ajustes por columna">
                  <div className="cxp-config__fila cxp-config__fila--cab" role="row">
                    <span role="columnheader">Columna</span>
                    <span role="columnheader">Ancho (px)</span>
                    <span role="columnheader">Texto largo</span>
                    <span role="columnheader">Alineación</span>
                  </div>
                  {visibles.map((c) => (
                    <div key={c.clave} className="cxp-config__fila" role="row">
                      <span role="cell">{c.titulo}</span>
                      <span role="cell">
                        <input
                          type="number"
                          className="ui-input ui-input--sm"
                          min={c.min ?? ANCHO_MIN_PREF}
                          max={ANCHO_MAX_PREF}
                          step={10}
                          placeholder={String(c.ancho)}
                          aria-label={`Ancho de ${c.titulo}`}
                          value={prefs.anchos[c.clave] ?? ''}
                          onChange={(e) => ponerAncho(c, e.target.value)}
                        />
                      </span>
                      <span role="cell">
                        {c.ajustable ? (
                          <select className="ui-input ui-input--sm" aria-label={`Texto largo en ${c.titulo}`} value={prefs.ajustes[c.clave] ?? ''} onChange={(e) => ponerAjuste(c.clave, e.target.value)}>
                            <option value="">Según la tabla</option>
                            <option value="puntos">Una línea con … (truncar)</option>
                            <option value="cortar">Una línea, cortar</option>
                            <option value="ajustar">Ajustar (varias líneas)</option>
                          </select>
                        ) : (
                          <span className="cxp-config__na">No aplica</span>
                        )}
                      </span>
                      <span role="cell">
                        <select className="ui-input ui-input--sm" aria-label={`Alineación de ${c.titulo}`} value={prefs.alineaciones[c.clave] ?? ''} onChange={(e) => ponerAlineacion(c.clave, e.target.value)}>
                          <option value="">Predeterminada</option>
                          <option value="izq">Izquierda</option>
                          <option value="centro">Centro</option>
                          <option value="der">Derecha</option>
                        </select>
                      </span>
                    </div>
                  ))}
                </div>
                <button type="button" className="cxp-link" onClick={() => onPrefs({ ...prefs, anchos: {}, ajustes: {}, alineaciones: {} })}>
                  Restablecer ancho, texto y alineación de todas las columnas
                </button>
              </>
            )}

            {seccion === 'formato' && (
              <>
                <fieldset className="cxp-panel__grupo">
                  <legend>Texto largo (todas las columnas de texto)</legend>
                  {radio<AjusteTexto>('ajuste', 'puntos', prefs.ajuste, 'Una línea con puntos suspensivos (…)', (v) => onPrefs({ ...prefs, ajuste: v }))}
                  {radio<AjusteTexto>('ajuste', 'cortar', prefs.ajuste, 'Una línea, cortar', (v) => onPrefs({ ...prefs, ajuste: v }))}
                  {radio<AjusteTexto>('ajuste', 'ajustar', prefs.ajuste, 'Ajustar texto (varias líneas)', (v) => onPrefs({ ...prefs, ajuste: v }))}
                  <p className="ui-hint">Una columna con ajuste propio (sección «Ajustes por columna») ignora esta opción.</p>
                </fieldset>
                <fieldset className="cxp-panel__grupo">
                  <legend>Alto de fila</legend>
                  {radio<Densidad>('densidad', 'compacta', prefs.densidad, 'Compacta (caben más registros)', (v) => onPrefs({ ...prefs, densidad: v }))}
                  {radio<Densidad>('densidad', 'normal', prefs.densidad, 'Normal', (v) => onPrefs({ ...prefs, densidad: v }))}
                  {radio<Densidad>('densidad', 'amplia', prefs.densidad, 'Amplia', (v) => onPrefs({ ...prefs, densidad: v }))}
                </fieldset>
                <fieldset className="cxp-panel__grupo">
                  <legend>Cómo se cargan las filas</legend>
                  {radio<PrefsHoja['modo']>('modo', 'paginas', prefs.modo, 'Por páginas', (v) => onPrefs({ ...prefs, modo: v }))}
                  {radio<PrefsHoja['modo']>('modo', 'infinito', prefs.modo, 'Scroll infinito', (v) => onPrefs({ ...prefs, modo: v }))}
                  <label className="cxp-panel__fila">
                    Filas por {prefs.modo === 'infinito' ? 'carga' : 'página'}
                    <select className="ui-input ui-input--sm cxp-panel__ajuste" value={prefs.porPagina} onChange={(e) => onPrefs({ ...prefs, porPagina: Number(e.target.value) })}>
                      {OPCIONES_POR_PAGINA.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  {prefs.modo === 'infinito' && <p className="ui-hint">Se cargan más filas al llegar al final, hasta {MAX_FILAS_INFINITO}. Para ver el resto, afina los filtros.</p>}
                </fieldset>
                {(conSeleccion || conTramos) && (
                  <fieldset className="cxp-panel__grupo">
                    <legend>Pantalla</legend>
                    {conSeleccion && (
                      <label className="cxp-panel__fila">
                        <input type="checkbox" checked={prefs.clicFila} onChange={(e) => onPrefs({ ...prefs, clicFila: e.target.checked })} />
                        Marcar la fila al tocar cualquier parte de ella (con Shift se marca un rango)
                      </label>
                    )}
                    {conTramos && (
                      <label className="cxp-panel__fila">
                        <input type="checkbox" checked={prefs.verTramos} onChange={(e) => onPrefs({ ...prefs, verTramos: e.target.checked })} />
                        Mostrar la antigüedad de lo vencido por tramos
                      </label>
                    )}
                  </fieldset>
                )}
              </>
            )}

            {seccion === 'fijas' && (
              <>
                <p className="ui-hint">
                  Las columnas fijas se quedan a la vista cuando te desplazas hacia los lados. La casilla de selección y la columna
                  Acciones siempre quedan fijas.
                </p>
                <fieldset className="cxp-panel__grupo">
                  <legend>A la izquierda</legend>
                  <label className="cxp-panel__fila">
                    Dejar fijas las primeras
                    <select className="ui-input ui-input--sm cxp-panel__ajuste" value={prefs.congelar} onChange={(e) => onPrefs({ ...prefs, congelar: Number(e.target.value) })}>
                      {Array.from({ length: MAX_CONGELAR + 1 }, (_, n) => (
                        <option key={n} value={n}>{n === 0 ? 'Ninguna' : `${n} columna(s)`}</option>
                      ))}
                    </select>
                  </label>
                </fieldset>
                <fieldset className="cxp-panel__grupo">
                  <legend>A la derecha (máximo {MAX_CONGELAR_DER}, junto a Acciones)</legend>
                  {visibles.map((c) => {
                    const fija = prefs.fijasDer.includes(c.clave);
                    const lleno = !fija && prefs.fijasDer.length >= MAX_CONGELAR_DER;
                    return (
                      <label key={c.clave} className="cxp-panel__fila">
                        <input type="checkbox" checked={fija} disabled={lleno} onChange={(e) => alternarFijaDer(c.clave, e.target.checked)} />
                        {c.titulo}
                      </label>
                    );
                  })}
                  <p className="ui-hint">Por ejemplo, fija «Val. a pagar» para verlo siempre junto a las acciones.</p>
                </fieldset>
                <button type="button" className="cxp-link" onClick={() => onPrefs({ ...prefs, congelar: 0, fijasDer: [] })}>Quitar todas las columnas fijas</button>
              </>
            )}

            {seccion === 'copiado' && (
              <fieldset className="cxp-panel__grupo">
                <legend>Al copiar un valor en pesos</legend>
                {radio<ModoCopiado>('copiado', 'entero', general.copiado, 'Copiar como entero sin formato: 1500000', (v) => onGeneral({ ...general, copiado: v }))}
                {radio<ModoCopiado>('copiado', 'moneda', general.copiado, 'Copiar con formato monetario: $ 1.500.000', (v) => onGeneral({ ...general, copiado: v }))}
                <p className="ui-hint">
                  Solo cambia lo que se envía al portapapeles (Ctrl+C sobre la tabla y el botón «Copiar total»); lo que ves en pantalla no cambia.
                  El entero no lleva símbolo, puntos, comas, espacios ni decimales (se redondea al peso más cercano).
                </p>
              </fieldset>
            )}

            {seccion === 'restablecer' && (
              <>
                <p className="ui-hint">Vuelve a los valores predeterminados. Solo afecta a tus preferencias.</p>
                <p>
                  <button type="button" className="ui-btn" onClick={() => window.confirm('¿Restablecer las preferencias de la tabla de esta pantalla?') && onRestablecerPantalla()}>
                    Restablecer la tabla de esta pantalla
                  </button>
                </p>
                <p className="ui-hint">Columnas, orden, anchos, formato y columnas fijas de esta pantalla.</p>
                <p>
                  <button type="button" className="ui-btn ui-btn--danger" onClick={() => window.confirm('¿Restablecer TODAS tus preferencias de esta pantalla y el copiado de valores?') && onRestablecerTodo()}>
                    Restablecer todo (incluye el copiado de valores)
                  </button>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
