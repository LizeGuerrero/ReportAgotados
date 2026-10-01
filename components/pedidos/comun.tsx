'use client';

import { useState } from 'react';

export const celda: React.CSSProperties = {
  border: '1px solid #000',
  padding: '4px 8px',
  fontSize: 13,
  color: '#000',
  verticalAlign: 'top',
  textAlign: 'left',
};

export const campo: React.CSSProperties = {
  padding: 6,
  border: '1px solid #000',
  color: '#000',
  background: '#fff',
  fontSize: 14,
};

export const boton: React.CSSProperties = {
  padding: '4px 10px',
  border: '1px solid #000',
  background: '#fff',
  color: '#000',
  fontSize: 13,
  cursor: 'pointer',
};

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
  por_cotizar: '⚪ Por cotizar',
  en_cotizacion: '🟡 En cotización',
  cotizado: '🟢 Cotizado',
  pedido_solicitado: '✅ Pedido solicitado',
  agotado_proveedor: '🔴 Agotado en proveedor',
  repartir_sedes: '🔁 Repartir entre sedes',
};

export const RESPUESTAS: { valor: string; texto: string }[] = [
  { valor: 'pedido_solicitado', texto: 'Pedido solicitado a proveedor' },
  { valor: 'agotado_proveedor', texto: 'Agotado en proveedor' },
  { valor: 'repartir_sedes', texto: 'Repartir entre sedes' },
];

export interface ProveedorItem {
  proveedor_id: number;
  proveedor: string;
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
  respuesta_compras: 'pedido_solicitado' | 'agotado_proveedor' | 'repartir_sedes' | null;
}

export interface Pedido {
  item_id: number;
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
  total: number;
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
    <div style={{ border: '1px solid #000', padding: 12, margin: '12px 0' }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{titulo}</div>
      <textarea
        readOnly
        value={texto}
        rows={Math.min(20, texto.split('\n').length + 1)}
        style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #000', padding: 6, fontFamily: 'monospace', fontSize: 13 }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
        <button type="button" style={boton} onClick={alCopiar}>Copiar</button>
        <button type="button" style={boton} onClick={onCerrar}>Cerrar</button>
        {aviso && <span style={{ fontSize: 13 }}>{aviso}</span>}
      </div>
    </div>
  );
}
