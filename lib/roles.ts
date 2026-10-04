/** El rol "viewer" es el Predeterminado: existe en cada organización y no tiene ningún permiso. */
export const ROL_PREDETERMINADO = 'viewer';

export function etiquetaRol(nombre: string): string {
  return nombre === ROL_PREDETERMINADO ? 'Predeterminado' : nombre;
}
