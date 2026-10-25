'use client';

import { useState } from 'react';
import type { createClient } from '@/lib/supabase/client';

/**
 * Formulario de alta de un ítem del ERP (código + nombre). Es el mismo en el módulo Ítems y en
 * Pedidos: la validación real la hace la RPC item_crear (permiso Items/crear, código único).
 */
export default function FormItemNuevo({
  supabase,
  organizacionId,
  onCreado,
  onCancelar,
  lineas,
}: {
  supabase: ReturnType<typeof createClient>;
  organizacionId: string;
  /** Recibe el id interno y el nombre del ítem recién creado. */
  onCreado: (id: number, nombre: string) => void;
  onCancelar?: () => void;
  /** Sugerencias de línea (opcional). */
  lineas?: string[];
}) {
  const [v, setV] = useState({ codigo_erp: '', nombre_base: '', unidad_medida: '', linea: '' });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function crear() {
    setError('');
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(v.codigo_erp.trim())) return setError('El código solo puede tener letras, números, punto, guion y guion bajo (máx. 40).');
    if (!v.nombre_base.trim()) return setError('Escribe el nombre del ítem.');
    setGuardando(true);
    const { data, error } = await supabase.rpc('item_crear', { p_org: organizacionId, p_datos: v });
    setGuardando(false);
    if (error) return setError(error.message);
    onCreado(Number(data), v.nombre_base.trim());
  }

  return (
    <div className="mod-card mod-mb-3">
      <div className="mod-semibold mod-mb-2">Nuevo ítem</div>
      <div className="mod-flex mod-gap-2 mod-wrap">
        <input className="ui-input ui-input--sm" style={{ width: 130 }} placeholder="Código ERP *" value={v.codigo_erp}
          onChange={(e) => setV({ ...v, codigo_erp: e.target.value })} />
        <input className="ui-input ui-input--sm mod-auto" style={{ minWidth: 300 }} placeholder="Nombre *" value={v.nombre_base}
          onChange={(e) => setV({ ...v, nombre_base: e.target.value })} />
        <input className="ui-input ui-input--sm" style={{ width: 120 }} placeholder="Unidad" value={v.unidad_medida}
          onChange={(e) => setV({ ...v, unidad_medida: e.target.value })} />
        <input className="ui-input ui-input--sm" style={{ width: 160 }} placeholder="Línea" value={v.linea}
          list="lineas-form-item-nuevo" onChange={(e) => setV({ ...v, linea: e.target.value })} />
        <datalist id="lineas-form-item-nuevo">
          {(lineas ?? []).map((l) => <option key={l} value={l} />)}
        </datalist>
        <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" disabled={guardando} onClick={crear}>
          {guardando ? 'Guardando…' : 'Crear'}
        </button>
        {onCancelar && <button type="button" className="ui-btn ui-btn--sm" onClick={onCancelar}>Cancelar</button>}
      </div>
      <p className="mod-sub mod-mt-2 mod-mb-0">
        El resto de los datos (IVA, logística, proveedores) se completan dentro del ítem.
      </p>
      {error && <p className="mod-error mod-text mod-mt-2 mod-mb-0">{error}</p>}
    </div>
  );
}
