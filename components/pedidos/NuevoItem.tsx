'use client';

import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import FormItemNuevo from '@/components/items/FormItemNuevo';
import type { PermisosPedidos } from '@/components/pedidos/usePermisosPedidos';

const IVAS = [
  { valor: '0.19', texto: '19%' },
  { valor: '0.05', texto: '5%' },
  { valor: '0', texto: '0% (excluido / exento)' },
];

/**
 * Alta de un ítem sin salir de Pedidos. Dos caminos:
 *  - Ítem del ERP: el mismo formulario del módulo Ítems (código ERP + nombre). Queda como un ítem real.
 *  - Provisional: Compras habló con el proveedor y le ofreció algo que aún no existe en el ERP. Se crea
 *    con un ID propio; cuando el ERP le asigne su código, un administrador lo vincula desde "Ítems provisionales".
 * Al crearse, el ítem queda disponible de inmediato en el flujo (lo marca Cotizar).
 */
export default function NuevoItem({
  supabase,
  organizacionId,
  lineas,
  permisos,
  onCreado,
  onCancelar,
}: {
  supabase: SupabaseClient;
  organizacionId: string;
  lineas: string[];
  permisos: PermisosPedidos;
  onCreado: (id: number, nombre: string) => void;
  onCancelar: () => void;
}) {
  const [tipo, setTipo] = useState<'erp' | 'provisional'>(permisos.itemsCrear ? 'erp' : 'provisional');

  return (
    <div className="mod-card mod-mb-3">
      <div className="mod-flex mod-gap-2 mod-mb-2 mod-center mod-wrap">
        <span className="mod-semibold mod-md">Ítem nuevo</span>
        {permisos.itemsCrear && (
          <button type="button" className={tipo === 'erp' ? 'ui-btn ui-btn--sm ui-btn--primary' : 'ui-btn ui-btn--sm'}
            onClick={() => setTipo('erp')}>Con código del ERP</button>
        )}
        {permisos.crear && (
          <button type="button" className={tipo === 'provisional' ? 'ui-btn ui-btn--sm ui-btn--primary' : 'ui-btn ui-btn--sm'}
            onClick={() => setTipo('provisional')}>Provisional (aún sin código)</button>
        )}
      </div>
      <p className="mod-sub mod-mt-0 mod-mb-2">
        Antes de crearlo, busca en el catálogo completo: puede que ya exista con otro nombre.
      </p>
      {tipo === 'erp' && permisos.itemsCrear ? (
        <FormItemNuevo
          supabase={supabase}
          organizacionId={organizacionId}
          lineas={lineas}
          onCreado={onCreado}
          onCancelar={onCancelar}
        />
      ) : (
        <Provisional supabase={supabase} organizacionId={organizacionId} lineas={lineas} onCreado={onCreado} onCancelar={onCancelar} />
      )}
    </div>
  );
}

function Provisional({
  supabase, organizacionId, lineas, onCreado, onCancelar,
}: {
  supabase: SupabaseClient;
  organizacionId: string;
  lineas: string[];
  onCreado: (id: number, nombre: string) => void;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState('');
  const [iva, setIva] = useState('0.19');
  const [linea, setLinea] = useState('');
  const [unidad, setUnidad] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setGuardando(true);
    const { data, error } = await supabase.rpc('item_provisional_crear', {
      p_org: organizacionId,
      p_nombre: nombre,
      p_iva: Number(iva),
      p_linea: linea.trim() || null,
      p_unidad_medida: unidad.trim() || null,
    });
    setGuardando(false);
    if (error) {
      setError(error.message);
      return;
    }
    onCreado(Number(data), nombre.trim());
  }

  return (
    <div>
      <p className="mod-sub mod-mt-0 mod-mb-2">
        El IVA es obligatorio porque se usa para calcular el costo con IVA.
      </p>
      <div className="mod-flex mod-gap-2 mod-wrap mod-center">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del ítem"
          className="ui-input ui-input--sm" style={{ width: 300 }} aria-label="Nombre del ítem nuevo" />
        <select value={iva} onChange={(e) => setIva(e.target.value)} className="ui-input ui-input--sm mod-auto" aria-label="IVA">
          {IVAS.map((o) => <option key={o.valor} value={o.valor}>IVA {o.texto}</option>)}
        </select>
        <input value={linea} onChange={(e) => setLinea(e.target.value)} list="lineas-item-provisional"
          placeholder="Línea (opcional)" className="ui-input ui-input--sm" style={{ width: 180 }} aria-label="Línea" />
        <datalist id="lineas-item-provisional">
          {lineas.map((l) => <option key={l} value={l} />)}
        </datalist>
        <input value={unidad} onChange={(e) => setUnidad(e.target.value)} placeholder="Unidad (opcional)"
          className="ui-input ui-input--sm" style={{ width: 130 }} aria-label="Unidad de medida" />
        <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" disabled={guardando || nombre.trim() === ''} onClick={guardar}>
          {guardando ? 'Guardando…' : 'Crear'}
        </button>
        <button type="button" className="ui-btn ui-btn--sm" onClick={onCancelar}>Cancelar</button>
      </div>
      {error && <p className="mod-error mod-text mod-mt-2 mod-mb-0">Error: {error}</p>}
    </div>
  );
}
