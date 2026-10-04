import type { MiembroOrg, ModuloOpt, PermisoRol } from '@/types/auth.types';

/**
 * Módulos cuyas funciones en la base de datos exigen que el usuario tenga una sede asignada
 * (Agotados y Pedidos). Un miembro con permisos sobre alguno de ellos pero sin sede recibe
 * "Tu usuario no tiene una sede asignada" al usarlos.
 */
export const MODULOS_CON_SEDE = ['Agotados', 'reporte_agotados', 'pedidos'];

/** Miembros ACTIVOS cuyo rol da acceso a un módulo que requiere sede, pero que no tienen sede. */
export function miembrosSinSede(
  miembros: MiembroOrg[],
  modulos: Pick<ModuloOpt, 'id' | 'nombre'>[],
  permisos: PermisoRol[]
): MiembroOrg[] {
  const idsModulo = new Set(modulos.filter((m) => MODULOS_CON_SEDE.includes(m.nombre)).map((m) => m.id));
  const rolesQueRequieren = new Set(
    permisos
      .filter(
        (p) =>
          idsModulo.has(p.modulo_id) && (p.puede_ver || p.puede_crear || p.puede_editar || p.puede_eliminar)
      )
      .map((p) => p.rol_id)
  );
  return miembros.filter((m) => m.estado === 'activa' && !m.sede_id && rolesQueRequieren.has(m.rol_id));
}
