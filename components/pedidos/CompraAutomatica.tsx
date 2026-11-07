'use client';

import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import SelectorProductos, { type ContextoSeleccion } from '@/components/pedidos/SelectorProductos';
import { Modal, textoError } from '@/components/pedidos/ui';

/**
 * Nueva compra desde el catálogo (sin depender de los agotados): se filtra por proveedor y/o línea con la barra de
 * búsqueda, se eligen los productos (o todos los resultados) y se arma la compra. Si hay un proveedor elegido, la
 * compra ya lo consulta.
 */
export default function CompraAutomatica({
  supabase, organizacionId, onCerrar, onCreada,
}: { supabase: SupabaseClient; organizacionId: string; onCerrar: () => void; onCreada: (id: string) => void }) {
  const [titulo, setTitulo] = useState('');
  const [ctx, setCtx] = useState<ContextoSeleccion>({ lineas: [], proveedor: null });
  const [error, setError] = useState('');
  // El nombre se arma solo con el proveedor y las líneas elegidas; si el usuario escribe uno, se respeta.
  const dia = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
  const lineasTxt = ctx.lineas.length === 0 ? '' : ctx.lineas.length <= 2 ? ctx.lineas.join(' + ') : `${ctx.lineas.length} líneas`;
  const automatico = `${[ctx.proveedor, lineasTxt].filter(Boolean).join(' · ') || 'Compra'} — ${dia}`.slice(0, 80);

  async function crear(items: { item_id: number; cantidad?: number }[], proveedor: number | null) {
    setError('');
    const { data, error: e } = await supabase.rpc('compra_crear', {
      p_org: organizacionId, p_titulo: titulo.trim() || automatico,
      p_items: items.map((i) => ({ ...i, sin_agotados: true })), p_proveedores: proveedor ? [proveedor] : null,
    });
    if (e) return setError(textoError(e));
    onCreada(String(data));
  }

  return (
    <Modal titulo="Nueva compra por proveedor o línea" onCerrar={onCerrar} ancha>
      <label className="ui-field mod-mb-2">
        <span className="ui-label">Nombre de la compra</span>
        <input className="ui-input" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={automatico} />
        <span className="mod-sub">Se nombra sola con el proveedor y las líneas que elijas; escribe aquí solo si quieres otro nombre.</span>
      </label>
      {error && <p className="mod-error">{error}</p>}
      <SelectorProductos supabase={supabase} organizacionId={organizacionId} conProveedor textoAceptar={(n) => `Crear compra con ${n} producto(s)`} onAceptar={crear} onContexto={setCtx} />
    </Modal>
  );
}
