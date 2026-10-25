'use client';

import { useState } from 'react';
import { useMesa } from '@/components/pedidos/MesaContexto';
import type { ProveedorCompra } from '@/components/pedidos/tipos';
import { numeroDeTexto } from '@/components/pedidos/reglas';
import { Modal } from '@/components/pedidos/ui';

/** Condiciones comerciales del proveedor: pedido mínimo, flete gratis desde, flete estándar y días típicos. */
export default function CondicionesProveedor({ prov, onCerrar }: { prov: ProveedorCompra; onCerrar: () => void }) {
  const { llamar } = useMesa();
  const [v, setV] = useState({
    minimo: prov.pedido_minimo?.toString() ?? '', gratis: prov.flete_gratis_desde?.toString() ?? '',
    flete: prov.flete_estandar?.toString() ?? '', dias: prov.dias_tipicos?.toString() ?? '',
  });
  const [error, setError] = useState('');

  async function guardar() {
    const num = (s: string) => (s.trim() ? numeroDeTexto(s) : null);
    const valores = { minimo: num(v.minimo), gratis: num(v.gratis), flete: num(v.flete), dias: num(v.dias) };
    if (Object.values(valores).some((x) => x === undefined || (x !== null && x < 0))) return setError('Escribe números válidos (no negativos).');
    if (valores.dias !== null && !Number.isInteger(valores.dias)) return setError('Los días deben ser un número entero.');
    const r = await llamar('proveedor_condiciones_guardar', {
      p_proveedor: prov.proveedor_id, p_minimo: valores.minimo, p_flete_gratis: valores.gratis, p_flete: valores.flete, p_dias: valores.dias,
    }, 'Condiciones guardadas');
    if (r.ok) onCerrar();
  }

  const campo = (clave: keyof typeof v, etiqueta: string) => (
    <label className="ui-field">
      <span className="ui-label">{etiqueta}</span>
      <input className="ui-input" inputMode="decimal" value={v[clave]} onChange={(e) => setV({ ...v, [clave]: e.target.value })} />
    </label>
  );
  return (
    <Modal titulo={`Condiciones de ${prov.nombre}`} onCerrar={onCerrar}>
      <p className="mod-text mod-mt-0">Se aplican a todas las compras. El pedido mínimo bloquea la emisión de la orden; el flete gratis y el estándar se suman al total. Requiere permiso de edición en Proveedores.</p>
      <div className="pm-form-grid">
        {campo('minimo', 'Pedido mínimo (antes de IVA)')}
        {campo('gratis', 'Flete gratis desde')}
        {campo('flete', 'Flete estándar')}
        {campo('dias', 'Días de entrega típicos')}
      </div>
      {error && <p className="mod-error">{error}</p>}
      <div className="pm-modal__acciones">
        <button type="button" className="ui-btn" onClick={onCerrar}>Cancelar</button>
        <button type="button" className="ui-btn ui-btn--primary" onClick={guardar}>Guardar</button>
      </div>
    </Modal>
  );
}
