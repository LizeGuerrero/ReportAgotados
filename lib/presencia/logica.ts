/**
 * Lógica pura de la presencia de usuarios (sin React ni Supabase), para poder probarla aparte.
 *
 * Modelo: cada pestaña del navegador publica UNA sesión en el canal de la organización. La clave de
 * presencia es el id del usuario, así que Supabase agrupa todas sus pestañas bajo una misma entrada
 * y aquí se muestran como UNA persona con N sesiones (cada una con su propia ubicación).
 */

/** Tiempo sin tocar el teclado/ratón para considerar una pestaña inactiva. */
export const INACTIVO_MS = 5 * 60 * 1000;

export type EstadoSesion = 'activo' | 'inactivo';

/** Lo que cada pestaña publica en el canal. Nada de esto se guarda en la base de datos. */
export interface PayloadPresencia {
  usuario_id: string;
  nombre: string;
  iniciales: string;
  /** Identifica la pestaña (se genera al abrirla). */
  pestana_id: string;
  modulo: string;
  /** Pestaña/pantalla dentro del módulo, ej. "Pedidos › Comparativo". Puede ir vacía. */
  pagina: string;
  /** Ruta de la pantalla (/app/<slug>/<módulo>), para poder ir a ella. */
  ruta: string;
  estado: EstadoSesion;
  /** La pestaña está a la vista (no en segundo plano). */
  visible: boolean;
}

export interface SesionUsuario {
  pestanaId: string;
  modulo: string;
  pagina: string;
  /** Vacía si el otro navegador no la envió o no tiene la forma esperada. */
  ruta: string;
  estado: EstadoSesion;
  visible: boolean;
}

export interface UsuarioPresente {
  id: string;
  nombre: string;
  iniciales: string;
  esYo: boolean;
  /** Activo si alguna de sus pestañas lo está. */
  estado: EstadoSesion;
  /** Sesión que se muestra primero: la activa y visible más relevante. */
  principal: SesionUsuario;
  /** Todas sus pestañas abiertas (la principal va primero). */
  sesiones: SesionUsuario[];
}

/** Forma del estado que entrega Supabase: clave de presencia -> lista de payloads. */
export type EstadoPresenciaCrudo = Record<string, unknown[]>;

const MAX_TEXTO = 80;

/** Lo publica otro navegador: se trata como dato no confiable (tipo, largo y caracteres de control). */
function limpiarTexto(valor: unknown, max = MAX_TEXTO): string {
  if (typeof valor !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return valor.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Solo se acepta /app/<slug>[/<sub>[/<sub>]] con caracteres de URL seguros; cualquier otra cosa se descarta. */
function rutaValida(v: unknown): string {
  return typeof v === 'string' && v.length <= 200 && /^\/app\/[A-Za-z0-9._~%-]+(\/[A-Za-z0-9_-]+){0,2}$/.test(v) ? v : '';
}

function aSesion(m: unknown): (SesionUsuario & { nombre: string; iniciales: string }) | null {
  if (!m || typeof m !== 'object') return null;
  const o = m as Record<string, unknown>;
  const modulo = limpiarTexto(o.modulo);
  if (!modulo) return null;
  return {
    pestanaId: limpiarTexto(o.pestana_id, 40) || 'sin-id',
    modulo,
    pagina: limpiarTexto(o.pagina, 120),
    ruta: rutaValida(o.ruta),
    estado: o.estado === 'inactivo' ? 'inactivo' : 'activo',
    visible: o.visible !== false,
    nombre: limpiarTexto(o.nombre),
    iniciales: limpiarTexto(o.iniciales, 3).toUpperCase(),
  };
}

const rango = (s: SesionUsuario) => (s.estado === 'activo' ? 0 : 2) + (s.visible ? 0 : 1);

/**
 * Convierte el estado crudo en la lista de personas conectadas.
 * Orden: primero tú, luego los activos y al final los inactivos (empate: por nombre).
 */
export function agruparUsuarios(crudo: EstadoPresenciaCrudo, yoId: string): UsuarioPresente[] {
  const usuarios: UsuarioPresente[] = [];

  for (const [id, metas] of Object.entries(crudo ?? {})) {
    if (!Array.isArray(metas)) continue;
    const parseadas = metas.map(aSesion).filter((s): s is NonNullable<ReturnType<typeof aSesion>> => s !== null);
    if (parseadas.length === 0) continue;

    // Una misma pestaña no debe contarse dos veces (reconexión que deja un registro viejo).
    const vistas = new Set<string>();
    const sesiones = parseadas
      .filter((s) => (vistas.has(s.pestanaId) && s.pestanaId !== 'sin-id' ? false : (vistas.add(s.pestanaId), true)))
      .sort((a, b) => rango(a) - rango(b));

    const ref = parseadas[parseadas.length - 1]; // el registro más reciente trae el nombre
    const nombre = ref.nombre || 'Usuario';
    usuarios.push({
      id,
      nombre,
      iniciales: ref.iniciales || nombre.charAt(0).toUpperCase(),
      esYo: id === yoId,
      estado: sesiones.some((s) => s.estado === 'activo') ? 'activo' : 'inactivo',
      principal: sesiones[0],
      sesiones,
    });
  }

  return usuarios.sort((a, b) => {
    if (a.esYo !== b.esYo) return a.esYo ? -1 : 1;
    if (a.estado !== b.estado) return a.estado === 'activo' ? -1 : 1;
    return a.nombre.localeCompare(b.nombre, 'es');
  });
}

/** ¿Se muestran avatares sueltos o un solo icono con contador? */
export function modoIndicador(cantidad: number, maxAvatares: number): 'avatares' | 'resumen' {
  return cantidad <= maxAvatares ? 'avatares' : 'resumen';
}

/** "Pedidos › Comparativo" o solo el módulo si no hay pestaña. */
export function textoUbicacion(s: Pick<SesionUsuario, 'modulo' | 'pagina'>): string {
  return s.pagina ? `${s.modulo} › ${s.pagina}` : s.modulo;
}

/** Matiz de color estable (0-359) para el avatar de cada persona. */
export function matizAvatar(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}
