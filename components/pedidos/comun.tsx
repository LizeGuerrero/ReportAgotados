'use client';

import { useState } from 'react';
import type { TablaTiempoReal } from '@/components/useTiempoReal';

export function fecha(valor: string | null) {
  if (!valor) return '';
  return new Date(valor).toLocaleString('es-CO', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  });
}

export function pesos(valor: number | null | undefined) {
  if (valor === null || valor === undefined) return '';
  return Number(valor).toLocaleString('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

export const ESTADOS: Record<string, string> = {
  por_cotizar: 'Por cotizar',
  en_cotizacion: 'En cotización',
  cotizado: 'Cotizado',
  pedido_solicitado: 'Pedido solicitado',
  agotado_proveedor: 'Agotado en proveedor',
  repartir_sedes: 'Repartir entre sedes',
  no_se_pide: 'No se pide',
};

/** Color de cada estado: el mismo criterio de las insignias de Agotados (verde = hecho, rojo = agotado, ámbar = en proceso o no se pide). */
const INSIGNIA_ESTADO: Record<string, string> = {
  por_cotizar: '',
  en_cotizacion: 'ui-badge--warning',
  cotizado: 'ui-badge--success',
  pedido_solicitado: 'ui-badge--success',
  agotado_proveedor: 'ui-badge--danger',
  repartir_sedes: 'ui-badge--violet',
  no_se_pide: 'ui-badge--warning',
};

export function InsigniaEstado({ estado }: { estado: string }) {
  return <span className={`ui-badge ${INSIGNIA_ESTADO[estado] ?? ''}`.trim()}>{ESTADOS[estado] ?? estado}</span>;
}

/** Tablas que, al cambiar, deben refrescar las pantallas de Pedidos (ver useTiempoReal). */
export const TABLAS_PEDIDOS: readonly TablaTiempoReal[] = [
  'agotados',
  'solicitud_items',
  'solicitudes_cotizacion',
  'cotizacion_precios',
  'ordenes_compra',
];

export const RESPUESTAS: { valor: string; texto: string }[] = [
  { valor: 'pedido_solicitado', texto: 'Pedido solicitado a proveedor' },
  { valor: 'agotado_proveedor', texto: 'Agotado en proveedor' },
  { valor: 'repartir_sedes', texto: 'Repartir entre sedes' },
  { valor: 'no_se_pide', texto: 'No se pide (con motivo)' },
];

export interface ProveedorItem {
  proveedor_id: number;
  proveedor: string;
  /** Tipo y número de documento, p. ej. "NIT 900123456". */
  documento: string;
  codigo: string | null;
  precio_erp: number | null;
  dias: number | null;
  preferido: boolean;
  unidades_por_caja: number | null;
}

export interface SedePedido {
  sede_id: string;
  sede: string;
  cantidad_sugerida: number | null;
  notas: string | null;
  usuario: string | null;
  fecha: string | null;
  respuesta_compras: 'pedido_solicitado' | 'agotado_proveedor' | 'repartir_sedes' | 'no_se_pide' | null;
  /** Motivo escrito por Compras; solo existe cuando la respuesta es 'no_se_pide'. */
  motivo_compras: string | null;
}

export interface Pedido {
  item_id: number;
  codigo: string | null;
  nombre_base: string;
  linea: string | null;
  unidad_medida: string | null;
  iva: number | null;
  cantidad_sugerida: number | null;
  sedes: SedePedido[];
  estado: string;
  cotizaciones_recibidas: number;
  cotizaciones_esperadas: number;
  mejor_costo: number | null;
  mejor_proveedor: string | null;
  proveedor_elegido: string | null;
  proveedores: ProveedorItem[];
  fecha_estado: string | null;
  /** 'agotado': lo reportó una sede. 'manual': lo inició Compras (sin agotado). */
  origen: 'agotado' | 'manual';
  /** Ítem creado por Compras que aún no tiene su ID real del ERP. */
  provisional: boolean;
  ultima_orden_numero: string | null;
  ultima_orden_fecha: string | null;
  ultima_orden_cantidad: number | null;
  total: number;
}

/** Fila de listar_proveedores_pedidos (selector de proveedor de las vistas de cotización). */
export interface ProveedorLista {
  id: number;
  nombre: string;
  documento: string;
  items_pendientes: number;
  solicitudes_abiertas: number;
  items_total: number;
}

/** Los ítems provisionales tienen ID negativo interno: se muestran como P1, P2… */
/** Código que ve el usuario: el del ERP (codigo_erp); si es provisional, P + número. item_id es la clave interna. */
export function idVisible(itemId: number, provisional: boolean, codigo?: string | null) {
  if (codigo) return codigo;
  return provisional ? `P${Math.abs(itemId)}` : String(itemId);
}

/** "OC-0012 · 12/09/26 · 100 und" (vacío si el ítem nunca se ha pedido) */
export function textoUltimaOrden(
  numero: string | null,
  fechaOrden: string | null,
  cantidad: number | null,
) {
  if (!numero) return '';
  const dia = fechaOrden
    ? new Date(fechaOrden).toLocaleDateString('es-CO', { dateStyle: 'short', timeZone: 'America/Bogota' })
    : '';
  return [numero, dia, cantidad !== null ? `${cantidad} und` : ''].filter(Boolean).join(' · ');
}

/** "6 cajas de 200" o "5 completas + 1 incompleta (100 und)" */
export function textoCajas(cantidad: number, porCaja: number | null | undefined) {
  if (!porCaja || !cantidad || cantidad <= 0) return '';
  const completas = Math.floor(cantidad / porCaja);
  const resto = cantidad % porCaja;
  if (resto === 0) return `${completas} caja(s) de ${porCaja}`;
  if (completas === 0) return `1 caja incompleta (${resto} de ${porCaja})`;
  return `${completas} caja(s) completa(s) + 1 incompleta (${resto} und)`;
}

export function PanelTexto({
  titulo,
  texto,
  onCopiar,
  onCerrar,
}: {
  titulo: string;
  texto: string;
  onCopiar?: () => void | Promise<void>;
  onCerrar: () => void;
}) {
  const [aviso, setAviso] = useState('');

  async function alCopiar() {
    const ok = await copiar(texto);
    setAviso(ok ? 'Copiado' : 'No se pudo copiar: selecciona el texto y usa Ctrl+C');
    if (ok && onCopiar) await onCopiar();
  }

  return (
    <div className="mod-card mod-mt-3 mod-mb-3">
      <div className="mod-semibold mod-mb-2">{titulo}</div>
      <textarea
        readOnly
        value={texto}
        rows={Math.min(20, texto.split('\n').length + 1)}
        className="ui-input mod-mono"
      />
      <div className="mod-flex mod-gap-2 mod-mt-2 mod-center">
        <button type="button" className="ui-btn ui-btn--sm" onClick={alCopiar}>Copiar</button>
        <button type="button" className="ui-btn ui-btn--sm" onClick={onCerrar}>Cerrar</button>
        {aviso && <span className="mod-text">{aviso}</span>}
      </div>
    </div>
  );
}
