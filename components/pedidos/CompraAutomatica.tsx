'use client';

import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import SelectorProductos from '@/components/pedidos/SelectorProductos';
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
  const [error, setError] = useState('');

  async function crear(items: { item_id: number; cantidad?: number }[], proveedor: number | null) {
    setError('');
    const { data, error: e } = await supabase.rpc('compra_crear', {
      p_org: organizacionId, p_titulo: titulo || null,
      p_items: items.map((i) => ({ ...i, sin_agotados: true })), p_proveedores: proveedor ? [proveedor] : null,
    });
    if (e) return setError(textoError(e));
    onCreada(String(data));
  }

  return (
    <Modal titulo="Nueva compra por proveedor o línea" onCerrar={onCerrar} ancha>
      <label className="ui-field mod-mb-2">
        <span className="ui-label">Título (opcional)</span>
        <input className="ui-input" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Compra a …" />
      </label>
      {error && <p className="mod-error">{error}</p>}
      <SelectorProductos supabase={supabase} organizacionId={organizacionId} conProveedor textoAceptar={(n) => `Crear compra con ${n} producto(s)`} onAceptar={crear} />
    </Modal>
  );
}
