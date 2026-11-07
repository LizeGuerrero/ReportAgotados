/**
 * ¿Dónde está trabajando la persona? Se resuelve con dos fuentes:
 *  1. La ruta (/app/<slug>/<módulo>[/<sub>]) -> módulo y, si la ruta ya lo implica, la pantalla.
 *  2. Las pestañas internas que muestran los módulos (Pedidos, Administración, Ítems…): son estado de
 *     React y no cambian la URL, así que se leen del DOM (role="tab" seleccionado). Así los módulos
 *     existentes no necesitan modificarse para reportar su pestaña.
 */

export interface UbicacionBase {
  modulo: string;
  /** Pantalla implícita en la ruta (ej. Cuentas por pagar › Pagados). */
  pagina: string;
}

const SIN_PAGINA = '';

// Segmento de la URL -> cómo se muestra. Mantener alineado con lib/modulos.ts y el layout de /app/[slug].
const RUTAS: Record<string, UbicacionBase> = {
  agotados: { modulo: 'Agotados', pagina: 'Reporte de agotados' },
  pedidos: { modulo: 'Pedidos', pagina: SIN_PAGINA },
  items: { modulo: 'Ítems', pagina: 'Catálogo' },
  proveedores: { modulo: 'Proveedores', pagina: 'Listado' },
  mensajes: { modulo: 'Mensajes', pagina: SIN_PAGINA },
  importaciones: { modulo: 'Importaciones', pagina: SIN_PAGINA },
  admin: { modulo: 'Administración', pagina: SIN_PAGINA },
  configuracion: { modulo: 'Configuración', pagina: SIN_PAGINA },
  'cxp-pagados': { modulo: 'Cuentas por pagar', pagina: 'Pagados' },
  'cxp-reglas': { modulo: 'Cuentas por pagar', pagina: 'Reglas (REC NO REV)' },
  'cxp-cargar': { modulo: 'Cuentas por pagar', pagina: 'Cargar archivo' },
  'cxp-mensajes': { modulo: 'Cuentas por pagar', pagina: 'Mensajes' },
};

/** Resuelve módulo y pantalla a partir de la ruta actual. */
export function ubicacionDesdeRuta(pathname: string, slug: string): UbicacionBase {
  const base = `/app/${encodeURIComponent(slug)}`;
  const resto = pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
  const [seg, sub] = resto.split('/').filter(Boolean);

  if (!seg) return { modulo: 'Inicio', pagina: SIN_PAGINA };
  if (seg === 'cxp') {
    return { modulo: 'Cuentas por pagar', pagina: sub === 'excluidas' ? 'Excluidas' : 'Cartera' };
  }
  return RUTAS[seg] ?? { modulo: 'Aplicación', pagina: SIN_PAGINA };
}

/** Quita la numeración de los pasos ("1. AGOTADOS" -> "AGOTADOS") y espacios sobrantes. */
export function limpiarEtiquetaPestana(texto: string): string {
  return texto.replace(/^\s*\d+\s*[.)]\s*/, '').replace(/\s+/g, ' ').trim();
}

/**
 * Texto propio de un botón de pestaña, ignorando insignias de conteo ("Solicitudes" + <span>3</span>).
 * Solo lee los nodos de texto directos del elemento.
 */
function textoPropio(el: Element): string {
  let t = '';
  el.childNodes.forEach((n) => {
    if (n.nodeType === 3) t += n.textContent ?? '';
  });
  return limpiarEtiquetaPestana(t || el.textContent || '');
}

/**
 * Pestañas seleccionadas en el contenido de la página (de la más externa a la más interna).
 * Cubre las pestañas con role="tab"/aria-selected y las de los módulos que marcan aria-current="true".
 * Ignora la barra superior y los menús desplegables.
 */
export function leerPestanasDom(doc: Document): string[] {
  const nodos = doc.querySelectorAll('[role="tab"][aria-selected="true"], button[aria-current="true"]');
  const vistos = new Set<Element>();
  const etiquetas: string[] = [];
  nodos.forEach((el) => {
    if (vistos.has(el) || el.closest('.app-header, [role="dialog"], [role="menu"]')) return;
    vistos.add(el);
    const t = textoPropio(el);
    if (t && !etiquetas.includes(t)) etiquetas.push(t);
  });
  return etiquetas;
}

/** Une la pantalla de la ruta con las pestañas internas: "Catálogo › Logística". */
export function componerPagina(base: UbicacionBase, pestanas: string[]): string {
  const partes = [base.pagina, ...pestanas].filter(Boolean);
  const sinRepetir = partes.filter((p, i) => p !== partes[i - 1]);
  return sinRepetir.join(' › ');
}
