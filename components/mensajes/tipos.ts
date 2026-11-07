import type { ConfigErp } from '@/lib/cxp/mensaje';

export type Tipo = 'solicitud_cotizacion' | 'orden_compra' | 'cxp_pago';
export const ESTANDAR = 'estandar';
export const esCxp = (t: Tipo): boolean => t === 'cxp_pago';

export interface TipoInfo { valor: Tipo; texto: string; plural: string; ayuda: string; grupo: 'Pedidos' | 'Cuentas por pagar' }

export const TIPOS: TipoInfo[] = [
  { valor: 'solicitud_cotizacion', texto: 'Solicitud de cotización', plural: 'solicitudes de cotización', grupo: 'Pedidos',
    ayuda: 'Lo que se envía al proveedor para pedirle precio y disponibilidad.' },
  { valor: 'orden_compra', texto: 'Orden de compra', plural: 'órdenes de compra', grupo: 'Pedidos',
    ayuda: 'Lo que se envía al proveedor para confirmarle lo que se le compra.' },
  { valor: 'cxp_pago', texto: 'Aviso de pago', plural: 'avisos de pago', grupo: 'Cuentas por pagar',
    ayuda: 'Lo que se le envía al proveedor cuando se le paga, con las facturas pagadas.' },
];

export const AMBITOS: { valor: string; texto: string; ayuda: string }[] = [
  { valor: 'encabezado', texto: 'Encabezado', ayuda: 'Datos generales, una línea por campo, debajo del título.' },
  { valor: 'linea', texto: 'Cada producto', ayuda: 'Se arma una línea por producto con los campos visibles, en este orden.' },
  { valor: 'pie', texto: 'Pie', ayuda: 'Totales al final del mensaje.' },
];

export interface Campo {
  clave: string; ambito: string; etiqueta: string; etiqueta_defecto: string; orden: number; visible: boolean;
  destino: 'proveedor' | 'interno'; permite_proveedor: boolean;
}

/** Datos que la base agrega a toda configuración leída. */
export interface Meta { nombre?: string; protegida?: boolean; personalizada?: boolean; modificada?: boolean; copiada_de_nombre?: string | null }
export interface CfgPedidos extends Meta { encabezado: string; introduccion: string; pie: string; campos: Campo[] }
export interface CfgCxp extends Meta, ConfigErp { cuerpo: string; linea: string; indicativo: string }
export type Cfg = CfgPedidos | CfgCxp;

export const esCfgCxp = (c: Cfg): c is CfgCxp => 'cuerpo' in c;

export interface Variante { id: string; nombre: string; proveedores: number; copiada_de_nombre: string | null; modificada: boolean; actualizada: string }
export interface Lista { variantes: Variante[]; predeterminada_org: string | null; estandar_proveedores: number }

export interface ProvFila {
  proveedor_id: number; nombre: string; documento: string; nit: string; contacto: string | null; whatsapp: string | null;
  telefono: string | null; correo: string | null; estructura_id: string; estructura_nombre: string; origen: 'proveedor' | 'organizacion' | 'estandar'; total: number;
}

/** Lo que se compara para saber si hay cambios sin guardar. */
export function huella(c: Cfg | null): string {
  if (!c) return '';
  if (esCfgCxp(c)) return JSON.stringify([c.cuerpo, c.linea, c.indicativo, c.erp_plantilla, c.erp_formato_factura, c.erp_separador, c.erp_agrupar_rangos, c.erp_formato_total]);
  return JSON.stringify([c.encabezado, c.introduccion, c.pie, c.campos.map((x) => [x.clave, x.etiqueta, x.orden, x.visible, x.destino])]);
}

/** Lo que se envía a la base al guardar (sin los datos de solo lectura). */
export function cargaGuardar(c: Cfg): Record<string, unknown> {
  if (esCfgCxp(c)) {
    return {
      cuerpo: c.cuerpo, linea: c.linea, indicativo: c.indicativo, erp_plantilla: c.erp_plantilla, erp_formato_factura: c.erp_formato_factura,
      erp_separador: c.erp_separador, erp_agrupar_rangos: c.erp_agrupar_rangos, erp_formato_total: c.erp_formato_total,
    };
  }
  return {
    encabezado: c.encabezado, introduccion: c.introduccion, pie: c.pie,
    campos: c.campos.map((x) => ({ clave: x.clave, etiqueta: x.etiqueta, orden: x.orden, visible: x.visible, destino: x.destino })),
  };
}

export const textoErr = (e: { message: string } | null | undefined): string => (e ? e.message : '');
