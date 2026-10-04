/**
 * Módulos protegidos por permiso, indexados por el segmento de la URL
 * (/app/[slug]/<segmento>). `permiso` es el nombre en la tabla `modulos` que valida
 * tiene_permiso() en la base de datos.
 */
export const MODULOS_PROTEGIDOS: Record<string, { permiso: string; nombre: string }> = {
  agotados: { permiso: 'reporte_agotados', nombre: 'Agotados' },
  pedidos: { permiso: 'pedidos', nombre: 'Pedidos' },
  items: { permiso: 'Items', nombre: 'Ítems' },
};

/** Nombre para mostrar de un segmento de URL protegido (incluye el panel de administración). */
export function nombreModulo(segmento: string): string {
  if (segmento === 'admin') return 'Administración';
  return MODULOS_PROTEGIDOS[segmento]?.nombre ?? 'Este módulo';
}
