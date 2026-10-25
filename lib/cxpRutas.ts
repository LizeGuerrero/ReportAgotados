export interface PermisosCxp {
  cxp: boolean;
  cxpPagos: boolean;
  cxpReglas: boolean;
  cxpImportar: boolean;
  cxpMensajes: boolean;
}

/** ¿Tiene acceso a alguna pantalla de Cuentas por pagar? */
export const tieneAccesoCxp = (p: PermisosCxp) => p.cxp || p.cxpPagos || p.cxpReglas || p.cxpImportar || p.cxpMensajes;

/** Primera pantalla de Cuentas por pagar a la que puede entrar, o null si no tiene ninguna. */
export function rutaEntradaCxp(base: string, p: PermisosCxp): string | null {
  if (p.cxp) return `${base}/cxp`;
  if (p.cxpPagos) return `${base}/cxp-pagados`;
  if (p.cxpReglas) return `${base}/cxp-reglas`;
  if (p.cxpImportar) return `${base}/cxp-cargar`;
  if (p.cxpMensajes) return `${base}/cxp-mensajes`;
  return null;
}
