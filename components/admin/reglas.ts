import type { MiembroOrg } from '@/types/auth.types';

/**
 * Reglas de jerarquía sobre un miembro, para decidir qué botones ofrecer. Son las MISMAS que
 * aplica la base de datos (la base es la que realmente las exige; aquí solo se evita ofrecer
 * un botón que fallaría):
 *   · nadie cambia su propio rol ni su propio estado;
 *   · nadie cambia el rol ni el estado del propietario;
 *   · con propietario, solo él puede quitarle el rol de admin, o suspender/retirar, a otro admin.
 */
export function reglasMiembro(
  m: Pick<MiembroOrg, 'usuario_id' | 'rol_nombre' | 'estado'>,
  usuarioActualId: string,
  propietarioId: string | null
) {
  const esYo = m.usuario_id === usuarioActualId;
  const esPropietario = propietarioId !== null && m.usuario_id === propietarioId;
  const soyPropietario = propietarioId !== null && usuarioActualId === propietarioId;
  const esAdmin = m.rol_nombre === 'admin';
  const adminProtegido = esAdmin && propietarioId !== null && !soyPropietario;
  const activa = m.estado === 'activa';
  const suspendida = m.estado === 'suspendida';

  return {
    esYo,
    esPropietario,
    soyPropietario,
    esAdmin,
    rolBloqueado: esYo || esPropietario || adminProtegido,
    puedeTransferir: soyPropietario && esAdmin && !esYo && activa,
    puedeGestionarEstado: !esYo && !esPropietario && !adminProtegido && (activa || suspendida),
  };
}
