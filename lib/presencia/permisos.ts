import type { ContextoOrg } from '@/lib/orgContext';

/**
 * Pantallas (primer segmento de /app/<slug>/<segmento>) a las que la persona puede ir según sus permisos.
 * Es exactamente la misma regla que decide qué botones ve en la barra superior (ver app/[slug]/layout.tsx).
 * Es solo comodidad de interfaz: quien decide de verdad es proxy.ts y la base de datos en cada consulta.
 */
export function segmentosNavegables(ctx: Pick<ContextoOrg, 'permisos' | 'esAdmin'>): string[] {
  const p = ctx.permisos;
  const s: string[] = ['configuracion']; // personal: basta con ser miembro
  if (p.agotados) s.push('agotados');
  if (p.pedidos) s.push('pedidos');
  if (p.items) s.push('items');
  if (p.proveedores) s.push('proveedores');
  if (p.mensajes || p.cxpMensajes) s.push('mensajes');
  if (p.cxp) s.push('cxp');
  if (p.cxpPagos) s.push('cxp-pagados');
  if (p.cxpReglas) s.push('cxp-reglas');
  if (p.cxpImportar) s.push('cxp-cargar');
  if (p.cxpMensajes) s.push('cxp-mensajes');
  if (ctx.esAdmin) s.push('admin');
  return s;
}

/**
 * ¿Puedo ir a la pantalla donde está otra persona?
 *  - string: sí, es esa ruta (de mi misma organización y con permiso)
 *  - false: la ruta es válida pero mi rol no da acceso a ese módulo
 *  - null: no se sabe a dónde ir (el otro navegador no envió una ruta utilizable, otra organización, inicio…)
 */
export function destinoPermitido(ruta: string, slug: string, segmentos: string[]): string | false | null {
  const base = `/app/${encodeURIComponent(slug)}/`;
  if (!ruta.startsWith(base)) return null;
  const [segmento, sub] = ruta.slice(base.length).split('/');
  if (!segmento) return null;
  // /cxp/excluidas es de la misma pantalla de Cuentas por pagar; otras subrutas no se reconocen
  if (segmento === 'cxp' && sub !== undefined && sub !== 'excluidas') return null;
  if (segmento !== 'cxp' && sub !== undefined) return null;
  return segmentos.includes(segmento) ? ruta : false;
}
