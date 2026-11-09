'use client';

import { useState, type ReactNode } from 'react';
import type { SeccionConfig } from './base/CentroConfig';
import { Interruptor, OpcionCasilla, OpcionRadio, TituloSeccion } from './base/Controles';
import ListaColumnas from './ListaColumnas';
import { IcAjustes, IcColumnas, IcDensAmplia, IcDensCompacta, IcDensNormal, IcEnfoque, IcRestablecer, IcTabla, IcVista } from './iconos';
import type { Densidad, PrefsAgotados } from './prefs';
import { MODOS, OPCIONES_POR_PAGINA, MAX_CONGELAR, type ConfigBusqueda } from './tipos';
import type { Bloque } from './tipos';

export interface AccionesConfig {
  prefs: PrefsAgotados;
  cambiar: (fn: (p: PrefsAgotados) => PrefsAgotados) => void;
  onBusqueda: (nueva: ConfigBusqueda) => void;
  onPorPagina: (n: number) => void;
  onAlternarColumna: (clave: string) => void;
  onMoverColumna: (clave: string, dir: -1 | 1) => void;
  onAlternarGrupo: (g: Bloque) => void;
  onMostrarTodas: () => void;
  maxCongelar: number;
  onEnfoque: () => void;
  onRestablecerVista: () => void;
  onRestablecerTodo: () => void;
  vistaPersonalizada: boolean;
  origen: 'local' | 'remoto';
  aviso: string;
}

const DENSIDADES: { valor: Densidad; titulo: string; ayuda: string; icono: ReactNode }[] = [
  { valor: 'compacta', titulo: 'Compacta', ayuda: 'Más filas a la vez: ideal para revisar muchos ítems.', icono: <IcDensCompacta /> },
  { valor: 'normal', titulo: 'Normal', ayuda: 'Equilibrio entre espacio y comodidad.', icono: <IcDensNormal /> },
  { valor: 'amplia', titulo: 'Amplia', ayuda: 'Filas altas, más fáciles de leer y de tocar con el dedo.', icono: <IcDensAmplia /> },
];

function Restablecer({ a }: { a: AccionesConfig }) {
  const [confirmar, setConfirmar] = useState(false);
  return (
    <div className="agx-restab">
      <div className="agx-restab__caja">
        <h4>Vista de la tabla</h4>
        <p>Vuelve las columnas a su estado original: anchos, orden, columnas ocultas, grupos plegados y columnas congeladas. No toca la búsqueda ni las barras.</p>
        <button type="button" className="agx-btn" onClick={a.onRestablecerVista} disabled={!a.vistaPersonalizada}>
          <IcRestablecer /> Restablecer vista
        </button>
      </div>
      <div className="agx-restab__caja">
        <h4>Todas mis preferencias de AGOTADOS</h4>
        <p>Barras, paneles, densidad, búsqueda y columnas vuelven a los valores originales.</p>
        {!confirmar ? (
          <button type="button" className="agx-btn agx-btn--peligro" onClick={() => setConfirmar(true)}>
            <IcRestablecer /> Restablecer todo…
          </button>
        ) : (
          <div className="agx-restab__confirma" role="alert">
            <span>¿Seguro? Se pierde tu personalización de este módulo.</span>
            <button
              type="button"
              className="agx-btn agx-btn--peligro"
              onClick={() => {
                a.onRestablecerTodo();
                setConfirmar(false);
              }}
            >
              Sí, restablecer
            </button>
            <button type="button" className="agx-btn" onClick={() => setConfirmar(false)}>
              Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Secciones del centro de configuración de AGOTADOS. Todo lo que aquí se cambia es solo de este módulo y de este usuario. */
export function seccionesAgotados(a: AccionesConfig): SeccionConfig[] {
  const { prefs: p, cambiar } = a;
  const setBarra = (k: keyof PrefsAgotados['barras'], v: boolean) => cambiar((x) => ({ ...x, barras: { ...x.barras, [k]: v } }));
  const setTabla = <K extends keyof PrefsAgotados['tabla']>(k: K, v: PrefsAgotados['tabla'][K]) =>
    cambiar((x) => ({ ...x, tabla: { ...x.tabla, [k]: v } }));
  const b = p.busqueda;

  return [
    {
      clave: 'barras',
      titulo: 'Barras y paneles',
      icono: <IcVista />,
      descripcion: 'Decide qué herramientas ves. Ocultarlas deja más espacio a la tabla; las recuperas desde el menú «Vista» o con el botón flotante.',
      contenido: (
        <>
          <Interruptor titulo="Cinta de herramientas" ayuda="Ajustar, densidad, orden y copiado." marcado={p.barras.herramientas} onCambio={(v) => setBarra('herramientas', v)} />
          <Interruptor titulo="Barra de estado" ayuda="Total de ítems, selección y paginación." marcado={p.barras.estado} onCambio={(v) => setBarra('estado', v)} />
          <Interruptor titulo="Panel de columnas" ayuda="Lista lateral para mostrar, ocultar y ordenar columnas." marcado={p.barras.panel} onCambio={(v) => setBarra('panel', v)} />
          <TituloSeccion>Aspecto de la cinta</TituloSeccion>
          <Interruptor titulo="Mostrar texto junto a los iconos" ayuda="Apágalo para una cinta más estrecha, solo con iconos." marcado={p.etiquetas} onCambio={(v) => cambiar((x) => ({ ...x, etiquetas: v }))} />
          <TituloSeccion>Modo enfocado</TituloSeccion>
          <p className="agx-nota">Oculta todo y deja solo la tabla. Para volver: botón «Herramientas» arriba a la derecha o <kbd>Ctrl</kbd>+<kbd>Mayús</kbd>+<kbd>F</kbd>.</p>
          <button type="button" className="agx-btn" onClick={a.onEnfoque}>
            <IcEnfoque /> Activar modo enfocado
          </button>
        </>
      ),
    },
    {
      clave: 'busqueda',
      titulo: 'Búsqueda',
      icono: <IcAjustes />,
      descripcion: 'Dónde se busca el texto y cómo se ordenan los resultados.',
      contenido: (
        <>
          <TituloSeccion>Buscar en</TituloSeccion>
          {([
            ['item', 'Ítem', 'El código del ítem.'],
            ['nombre', 'Nombre', 'El nombre base.'],
            ['referencia', 'Referencia', 'Los códigos de proveedor.'],
          ] as const).map(([clave, etiqueta, ayuda]) => (
            <OpcionCasilla
              key={clave}
              titulo={etiqueta}
              ayuda={ayuda}
              marcado={b[clave]}
              onCambio={(v) => {
                const nueva = { ...b, [clave]: v };
                // siempre debe quedar al menos un campo activo
                if (!nueva.item && !nueva.nombre && !nueva.referencia) return;
                a.onBusqueda(nueva);
              }}
            />
          ))}
          <TituloSeccion>Coincidencia</TituloSeccion>
          {MODOS.map((m) => (
            <OpcionRadio key={m.valor} nombre="agx-modo" titulo={m.texto} marcado={b.modo === m.valor} onElegir={() => a.onBusqueda({ ...b, modo: m.valor })} />
          ))}
        </>
      ),
    },
    {
      clave: 'columnas',
      titulo: 'Columnas',
      icono: <IcColumnas />,
      descripcion: 'Qué columnas se ven y en qué orden. El orden solo cambia dentro de cada bloque, para que los grupos sigan juntos.',
      contenido: (
        <>
          <ListaColumnas
            ocultas={p.columnas.ocultas}
            orden={p.columnas.orden}
            plegados={p.columnas.plegados}
            onAlternar={a.onAlternarColumna}
            onMover={a.onMoverColumna}
            onAlternarGrupo={a.onAlternarGrupo}
            onMostrarTodas={a.onMostrarTodas}
          />
          <TituloSeccion>Columnas congeladas</TituloSeccion>
          <p className="agx-nota">Se quedan fijas a la izquierda al desplazarte. «Acción» siempre queda fija a la derecha.</p>
          <label className="agx-campo-linea">
            <span>Columnas fijas</span>
            <select
              className="agx-select"
              value={Math.min(p.columnas.congelar, a.maxCongelar)}
              onChange={(e) => cambiar((x) => ({ ...x, columnas: { ...x.columnas, congelar: Number(e.target.value) } }))}
            >
              {Array.from({ length: Math.min(MAX_CONGELAR, a.maxCongelar) + 1 }, (_, n) => (
                <option key={n} value={n}>
                  {n === 0 ? 'Ninguna' : n === 1 ? '1 columna' : `${n} columnas`}
                </option>
              ))}
            </select>
          </label>
        </>
      ),
    },
    {
      clave: 'tabla',
      titulo: 'Filas y tabla',
      icono: <IcTabla />,
      descripcion: 'Densidad, paginación y apariencia de la tabla.',
      contenido: (
        <>
          <TituloSeccion>Densidad de filas</TituloSeccion>
          {DENSIDADES.map((d) => (
            <OpcionRadio
              key={d.valor}
              nombre="agx-densidad"
              titulo={d.titulo}
              ayuda={d.ayuda}
              marcado={p.tabla.densidad === d.valor}
              onElegir={() => setTabla('densidad', d.valor)}
              extra={<span className="agx-radio__ico">{d.icono}</span>}
            />
          ))}
          <TituloSeccion>Paginación</TituloSeccion>
          <label className="agx-campo-linea">
            <span>Ítems por página</span>
            <select className="agx-select" value={p.tabla.porPagina} onChange={(e) => a.onPorPagina(Number(e.target.value))}>
              {OPCIONES_POR_PAGINA.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <TituloSeccion>Apariencia</TituloSeccion>
          <Interruptor titulo="Ajustar texto largo" ayuda="Muestra el texto en varias líneas en vez de cortarlo con puntos suspensivos." marcado={p.tabla.ajustarTexto} onCambio={(v) => setTabla('ajustarTexto', v)} />
          <Interruptor titulo="Mostrar cuadrícula" ayuda="Líneas entre celdas, como en una hoja de cálculo." marcado={p.tabla.cuadricula} onCambio={(v) => setTabla('cuadricula', v)} />
          <Interruptor titulo="Filas alternadas" ayuda="Un fondo suave en una de cada dos filas." marcado={p.tabla.cebra} onCambio={(v) => setTabla('cebra', v)} />
        </>
      ),
    },
    {
      clave: 'restablecer',
      titulo: 'Guardado y restablecer',
      icono: <IcRestablecer />,
      descripcion:
        a.origen === 'remoto'
          ? 'Tus preferencias se guardan en tu cuenta: te acompañan en cualquier equipo. Son solo tuyas y solo de este módulo.'
          : 'Tus preferencias se guardan en este navegador y solo para tu usuario. Son solo tuyas y solo de este módulo.',
      contenido: (
        <>
          {a.aviso && (
            <p className="agx-aviso" role="alert">
              {a.aviso}
            </p>
          )}
          <Restablecer a={a} />
        </>
      ),
    },
  ];
}

