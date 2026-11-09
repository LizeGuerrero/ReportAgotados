import {
  ANCHO_DEFECTO,
  ANCHO_MAX,
  ANCHO_MIN,
  BUSQUEDA_INICIAL,
  COLUMNAS,
  GRUPOS,
  MAX_CONGELAR,
  MODOS,
  OPCIONES_POR_PAGINA,
  limitar,
  type ConfigBusqueda,
} from './tipos';

export type Densidad = 'compacta' | 'normal' | 'amplia';

/**
 * Preferencias de interfaz de AGOTADOS, por usuario. Una sola «hoja» de valores: lo que se pliega, lo que se
 * ve, cómo se ve y cómo se busca. Cualquier campo que falte o venga dañado se rellena con el predeterminado.
 */
export interface PrefsAgotados {
  v: 1;
  barras: { herramientas: boolean; estado: boolean; panel: boolean };
  /** Modo enfocado: oculta todo y deja la tabla sola. Las barras recuerdan su estado para cuando se salga. */
  enfoque: boolean;
  /** Mostrar el texto junto a los iconos de la cinta. */
  etiquetas: boolean;
  panelAncho: number;
  columnas: {
    ocultas: string[];
    orden: string[];
    anchos: Record<string, number>;
    plegados: string[];
    /** Columnas que quedan fijas a la izquierda al desplazarse. */
    congelar: number;
  };
  tabla: {
    densidad: Densidad;
    /** Texto largo en varias líneas en vez de cortarlo con puntos suspensivos. */
    ajustarTexto: boolean;
    cebra: boolean;
    cuadricula: boolean;
    porPagina: number;
  };
  busqueda: ConfigBusqueda;
}

export const PREFS_POR_DEFECTO: PrefsAgotados = {
  v: 1,
  barras: { herramientas: true, estado: true, panel: false },
  enfoque: false,
  etiquetas: true,
  panelAncho: 300,
  columnas: { ocultas: [], orden: [], anchos: {}, plegados: [], congelar: 2 },
  tabla: { densidad: 'normal', ajustarTexto: false, cebra: false, cuadricula: true, porPagina: 50 },
  busqueda: BUSQUEDA_INICIAL,
};

const esTexto = (x: unknown): x is string => typeof x === 'string';
const bool = (x: unknown, d: boolean) => (typeof x === 'boolean' ? x : d);
const claves = new Set(COLUMNAS.map((c) => c.clave));
const clavesOcultables = new Set(COLUMNAS.filter((c) => !c.esencial).map((c) => c.clave));
const clavesGrupo = new Set(GRUPOS.map((g) => g.clave as string));
const unicos = (xs: string[]) => Array.from(new Set(xs));

export function normalizarBusqueda(crudo: unknown, d: ConfigBusqueda): ConfigBusqueda {
  const c = { ...d, ...(crudo && typeof crudo === 'object' ? (crudo as Partial<ConfigBusqueda>) : {}) } as ConfigBusqueda;
  if (!MODOS.some((m) => m.valor === c.modo)) c.modo = d.modo;
  c.item = bool(c.item, true);
  c.nombre = bool(c.nombre, true);
  c.referencia = bool(c.referencia, true);
  if (!c.item && !c.nombre && !c.referencia) return d;
  return { modo: c.modo, item: c.item, nombre: c.nombre, referencia: c.referencia };
}

/** Valida lo guardado y descarta lo que no sirva: las preferencias viejas o dañadas nunca rompen la pantalla. */
export function normalizarPrefs(crudo: unknown, d: PrefsAgotados = PREFS_POR_DEFECTO): PrefsAgotados {
  if (!crudo || typeof crudo !== 'object') return d;
  const p = crudo as Record<string, unknown>;
  const b = (p.barras && typeof p.barras === 'object' ? p.barras : {}) as Record<string, unknown>;
  const c = (p.columnas && typeof p.columnas === 'object' ? p.columnas : {}) as Record<string, unknown>;
  const t = (p.tabla && typeof p.tabla === 'object' ? p.tabla : {}) as Record<string, unknown>;

  const anchos: Record<string, number> = {};
  for (const [k, v] of Object.entries((c.anchos && typeof c.anchos === 'object' ? c.anchos : {}) as Record<string, unknown>)) {
    if (k in ANCHO_DEFECTO && typeof v === 'number' && Number.isFinite(v)) anchos[k] = limitar(v, ANCHO_MIN, ANCHO_MAX);
  }
  const lista = (x: unknown) => (Array.isArray(x) ? x.filter(esTexto) : []);
  const congelar = Number.isInteger(c.congelar) ? limitar(c.congelar as number, 0, MAX_CONGELAR) : d.columnas.congelar;

  return {
    v: 1,
    barras: {
      herramientas: bool(b.herramientas, d.barras.herramientas),
      estado: bool(b.estado, d.barras.estado),
      panel: bool(b.panel, d.barras.panel),
    },
    enfoque: bool(p.enfoque, d.enfoque),
    etiquetas: bool(p.etiquetas, d.etiquetas),
    panelAncho: typeof p.panelAncho === 'number' && Number.isFinite(p.panelAncho) ? limitar(Math.round(p.panelAncho), 240, 560) : d.panelAncho,
    columnas: {
      ocultas: unicos(lista(c.ocultas)).filter((k) => clavesOcultables.has(k)),
      orden: unicos(lista(c.orden)).filter((k) => claves.has(k)),
      anchos,
      plegados: unicos(lista(c.plegados)).filter((k) => clavesGrupo.has(k)),
      congelar,
    },
    tabla: {
      densidad: t.densidad === 'compacta' || t.densidad === 'amplia' || t.densidad === 'normal' ? t.densidad : d.tabla.densidad,
      ajustarTexto: bool(t.ajustarTexto, d.tabla.ajustarTexto),
      cebra: bool(t.cebra, d.tabla.cebra),
      cuadricula: bool(t.cuadricula, d.tabla.cuadricula),
      porPagina: OPCIONES_POR_PAGINA.includes(t.porPagina as number) ? (t.porPagina as number) : d.tabla.porPagina,
    },
    busqueda: normalizarBusqueda(p.busqueda, d.busqueda),
  };
}

// ---------- Versión anterior de la pantalla (solo navegador, sin usuario) ----------
const CLAVE_BUSQUEDA_LEGADA = 'agotados:config-busqueda';
const CLAVE_VISTA_LEGADA = 'agotados:vista';

/** Preferencias de la versión anterior (búsqueda, grupos plegados, anchos), con la forma de PrefsAgotados. */
export function leerLegado(): unknown {
  try {
    const b = window.localStorage.getItem(CLAVE_BUSQUEDA_LEGADA);
    const v = window.localStorage.getItem(CLAVE_VISTA_LEGADA);
    if (!b && !v) return null;
    const busqueda = b ? JSON.parse(b) : undefined;
    const vista = v ? JSON.parse(v) : {};
    const plegados = Object.entries(vista?.grupos ?? {})
      .filter(([, x]) => x === true)
      .map(([k]) => k);
    return { v: 1, busqueda, columnas: { plegados, anchos: vista?.anchos ?? {} } };
  } catch {
    return null;
  }
}
export function limpiarLegado() {
  try {
    window.localStorage.removeItem(CLAVE_BUSQUEDA_LEGADA);
    window.localStorage.removeItem(CLAVE_VISTA_LEGADA);
  } catch {
    /* nada */
  }
}

/**
 * ¿Se guardan también en la base de datos? Hoy NO: ninguna tabla de preferencias existente admite las claves de
 * AGOTADOS sin modificar SQL compartido (ver database/PROPUESTA_agotados_preferencias.sql, pendiente de aprobación).
 * Cuando se apruebe y se aplique la migración, basta con poner esto en `true`: la pantalla subirá a la base lo que
 * cada usuario ya tenga en su navegador.
 */
export const PERSISTENCIA_SQL = false;
export const RPC_PREFS = { obtener: 'ui_prefs_obtener', guardar: 'ui_prefs_guardar', restablecer: 'ui_prefs_restablecer' };
