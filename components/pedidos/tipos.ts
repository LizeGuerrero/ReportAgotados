/** Forma de lo que devuelve compra_obtener (ver sql/migracion_pedidos_mesa_compra.sql). */
export type EstadoCompra = 'armando' | 'cotizando' | 'decidiendo' | 'ordenada' | 'cerrada';
export type BaseCosto = 'con_iva' | 'sin_iva';
export type EstadoOferta = 'estimada' | 'pedida' | 'respondida' | 'no_disponible';
export type MotivoAsignacion = 'mejor_precio' | 'mas_rapido' | 'consolidar' | 'manual';

export interface ProveedorCompra {
  proveedor_id: number;
  nombre: string;
  documento: string;
  cobra_iva: boolean;
  /** Fracción 0..1 */
  iva_compra: number;
  pedido_minimo: number | null;
  flete_gratis_desde: number | null;
  flete_estandar: number | null;
  dias_tipicos: number | null;
}

export interface OfertaCompra {
  proveedor_id: number;
  estado: EstadoOferta;
  /** 'erp': el costo viene del precio del ERP; 'cotizacion': lo dijo el proveedor. */
  fuente: 'erp' | 'cotizacion';
  /** Unitario, sin IVA */
  costo: number | null;
  dias: number | null;
  observacion: string | null;
  referencia: string | null;
  unidades_caja: number | null;
  precio_erp: number | null;
}

export interface AsignacionCompra {
  proveedor_id: number;
  cantidad: number;
  motivo: MotivoAsignacion;
  nota: string | null;
}

export interface LineaCompra {
  id: string;
  item_id: number;
  codigo: string | null;
  nombre: string;
  linea: string | null;
  unidad: string | null;
  iva: number | null;
  cantidad: number;
  ordenada: boolean;
  /** Cuántos agotados de las sedes atiende esta línea (0 = producto agregado por Compras). */
  necesidades: number;
  sedes: { sede: string; cantidad: number | null; nota: string | null }[];
  ofertas: OfertaCompra[];
  asignaciones: AsignacionCompra[];
}

export interface OrdenMesa {
  id: string;
  numero: number | null;
  estado: 'emitida' | 'enviada' | 'cancelada' | 'pendiente';
  proveedor_id: number;
  subtotal: number | null;
  iva: number | null;
  flete: number | null;
  total: number | null;
  fecha: string;
  enviada_en: string | null;
  cancelada_motivo: string | null;
}

export interface CompraDetalle {
  compra: { id: string; numero: number; titulo: string; estado: EstadoCompra; base_costo: BaseCosto; creada: string };
  proveedores: ProveedorCompra[];
  lineas: LineaCompra[];
  ordenes: OrdenMesa[];
}

export interface CompraResumen {
  id: string;
  numero: number;
  titulo: string;
  estado: EstadoCompra;
  created_at: string;
  productos: number;
  proveedores: number;
  ordenes: number;
}

export const ESTADO_COMPRA: Record<EstadoCompra, { texto: string; tono: Tono }> = {
  armando: { texto: 'Armando', tono: 'gris' },
  cotizando: { texto: 'Cotizando', tono: 'ambar' },
  decidiendo: { texto: 'Decidiendo', tono: 'azul' },
  ordenada: { texto: 'Ordenada', tono: 'verde' },
  cerrada: { texto: 'Cerrada', tono: 'gris' },
};

export type Tono = 'gris' | 'azul' | 'verde' | 'ambar' | 'rojo';
export const CLASE_TONO: Record<Tono, string> = {
  gris: 'ui-badge', azul: 'ui-badge ui-badge--info', verde: 'ui-badge ui-badge--success',
  ambar: 'ui-badge ui-badge--warning', rojo: 'ui-badge ui-badge--danger',
};

export const ESTADO_OFERTA: Record<EstadoOferta, { texto: string; tono: Tono; ayuda: string }> = {
  estimada: { texto: 'ERP', tono: 'gris', ayuda: 'Precio del ERP, sin cotización confirmada con el proveedor' },
  pedida: { texto: 'pedida', tono: 'ambar', ayuda: 'Se pidió cotización; aún sin respuesta' },
  respondida: { texto: 'cotizado', tono: 'verde', ayuda: 'El proveedor confirmó este precio' },
  no_disponible: { texto: 'no tiene', tono: 'rojo', ayuda: 'El proveedor respondió que no lo tiene' },
};

export const ESTADO_ORDEN: Record<string, { texto: string; tono: Tono }> = {
  emitida: { texto: 'Emitida', tono: 'ambar' },
  pendiente: { texto: 'Emitida', tono: 'ambar' },
  enviada: { texto: 'Enviada', tono: 'verde' },
  cancelada: { texto: 'Cancelada', tono: 'rojo' },
};

export const ETAPAS: EstadoCompra[] = ['armando', 'cotizando', 'decidiendo', 'ordenada', 'cerrada'];

export const MOTIVO: Record<MotivoAsignacion, string> = {
  mejor_precio: 'Mejor precio', mas_rapido: 'Más rápido', consolidar: 'Consolidar', manual: 'Elegido a mano',
};

export const numeroCompra = (n: number) => `C-${String(n).padStart(4, '0')}`;
export const numeroOrden = (n: number | null) => `OC-${String(n ?? 0).padStart(4, '0')}`;

/** Una orden con todo lo que muestra su tarjeta (RPC ordenes_detalle). */
export interface OrdenDetalle {
  id: string;
  numero: number | null;
  estado: 'emitida' | 'enviada' | 'cancelada' | 'pendiente';
  proveedor_id: number;
  proveedor: string;
  compra_id: string | null;
  compra_numero: number | null;
  compra_titulo: string | null;
  subtotal: number | null;
  iva: number | null;
  flete: number | null;
  total: number | null;
  fecha: string;
  enviada_en: string | null;
  cancelada_motivo: string | null;
  lineas: {
    item_id: number; codigo: string | null; nombre: string; nombre_interno: string; referencia: string | null;
    cantidad: number; costo: number; motivo: MotivoAsignacion | null;
  }[];
}
