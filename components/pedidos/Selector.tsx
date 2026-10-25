'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { textoError } from '@/components/pedidos/ui';

interface Opciones {
  predeterminada: { id: string; nombre: string; origen: string };
  opciones: { id: string; nombre: string }[];
}

/**
 * Como la firma de un correo: el mensaje sale con la estructura predeterminada (del proveedor o de la
 * organización), pero se puede cambiar en el momento y, si se quiere, dejarla como la del proveedor.
 */
export default function SelectorEstructura({
  supabase, organizacionId, tipo, proveedorId, proveedorNombre, valor, onCambio, puedeFijar, enlaceMensajes,
}: {
  supabase: SupabaseClient;
  organizacionId: string;
  tipo: 'solicitud_cotizacion' | 'orden_compra';
  proveedorId: number;
  proveedorNombre: string;
  /** null = la predeterminada de este proveedor. */
  valor: string | null;
  onCambio: (id: string | null) => void;
  puedeFijar: boolean;
  enlaceMensajes?: string;
}) {
  const [o, setO] = useState<Opciones | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    supabase.rpc('mensaje_opciones', { p_org: organizacionId, p_tipo: tipo, p_proveedor: proveedorId }).then(({ data, error: e }) => {
      if (e) setError(textoError(e));
      else setO(data as Opciones);
    });
  }, [supabase, organizacionId, tipo, proveedorId, version]);

  if (!o) return <span className="mod-sub">{error || 'Cargando estructuras…'}</span>;
  const actual = valor ?? o.predeterminada.id;
  const marca = (id: string) => {
    if (id !== o.predeterminada.id) return '';
    const primero = proveedorNombre.split(' ')[0];
    return o.predeterminada.origen === 'proveedor' ? ` · predeterminada de ${primero}`
      : o.predeterminada.origen === 'organizacion' ? ' · predeterminada de la organización' : ' · predeterminada';
  };

  async function dejarPredeterminada() {
    const { error: e } = await supabase.rpc('mensaje_proveedor_fijar', {
      p_org: organizacionId, p_proveedor: proveedorId, p_tipo: tipo, p_estructura: actual,
    });
    if (e) return setError(textoError(e));
    onCambio(null);
    setVersion((v) => v + 1);
  }

  return (
    <div className="mod-flex mod-gap-2 mod-center mod-wrap">
      <label className="mod-text">
        Estructura{' '}
        <select className="ui-input ui-input--sm mod-auto" value={actual} onChange={(e) => onCambio(e.target.value)} aria-label="Estructura del mensaje">
          {o.opciones.map((x) => <option key={x.id} value={x.id}>{x.nombre}{marca(x.id)}</option>)}
        </select>
      </label>
      {actual !== o.predeterminada.id && puedeFijar && (
        <button type="button" className="ui-btn ui-btn--sm" onClick={dejarPredeterminada}>
          Dejar como predeterminada de {proveedorNombre.split(' ')[0]}
        </button>
      )}
      {enlaceMensajes && <a className="mod-text" href={enlaceMensajes}>Editar estructuras →</a>}
      {error && <span className="mod-error">{error}</span>}
    </div>
  );
}
