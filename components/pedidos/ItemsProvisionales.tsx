'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useTiempoReal } from '@/components/useTiempoReal';
import { fecha, idVisible, TABLAS_PEDIDOS } from '@/components/pedidos/comun';
import TablaExcel from '@/components/TablaExcel';

interface Provisional {
  item_id: number;
  nombre_base: string;
  linea: string | null;
  iva: number | null;
  creado: string;
  solicitudes_activas: number;
  ordenes: number;
}

/**
 * Ítems que Compras creó porque el proveedor los ofreció y el ERP aún no los tiene.
 * Cuando el ERP les asigna su ID, un administrador los vincula aquí:
 *  - si el ID ya existe en el catálogo, el provisional se fusiona con ese ítem (era uno existente);
 *  - si no existe, se crea con ese ID (el ERP lo registró como nuevo).
 * En ambos casos las solicitudes, órdenes y proveedores del provisional pasan al ítem real.
 */
export default function ItemsProvisionales({
  supabase,
  organizacionId,
}: {
  supabase: SupabaseClient;
  organizacionId: string;
}) {
  const [filas, setFilas] = useState<Provisional[]>([]);
  const [ids, setIds] = useState<Record<number, string>>({});
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [puedeVincular, setPuedeVincular] = useState(false);
  const [trabajando, setTrabajando] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.rpc('listar_items_provisionales', { p_org: organizacionId });
    if (error) setError(error.message);
    else {
      setError('');
      setFilas((data ?? []) as Provisional[]);
    }
  }, [supabase, organizacionId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Vincular reasigna varias tablas y no se puede deshacer: la base lo reserva a quien puede editar ítems
  useEffect(() => {
    supabase
      .rpc('tiene_permiso', { p_organizacion_id: organizacionId, p_modulo: 'Items', p_accion: 'editar' })
      .then(({ data }) => setPuedeVincular(data === true));
  }, [supabase, organizacionId]);

  useTiempoReal(supabase, organizacionId, TABLAS_PEDIDOS, cargar);

  async function vincular(f: Provisional) {
    const real = (ids[f.item_id] ?? '').trim();
    if (!real) {
      setError('Escribe el código que el ERP asignó al ítem');
      return;
    }
    const ok = window.confirm(
      `¿Vincular “${f.nombre_base}” con el código ${real}?\n\n` +
        'Si ese código ya existe en el catálogo, se fusionará con ese ítem. Esta acción no se puede deshacer.',
    );
    if (!ok) return;
    setTrabajando(f.item_id);
    const { error } = await supabase.rpc('item_provisional_vincular', {
      p_org: organizacionId,
      p_provisional: f.item_id,
      p_codigo: real,
    });
    setTrabajando(null);
    if (error) {
      setError(error.message);
      return;
    }
    setError('');
    setAviso(`“${f.nombre_base}” quedó vinculado al ítem ${real}.`);
    setIds((x) => {
      const nuevo = { ...x };
      delete nuevo[f.item_id];
      return nuevo;
    });
    cargar();
  }

  return (
    <div>
      <p className="mod-text mod-mt-0 mod-mb-3">
        Ítems creados desde “Por proveedor” que aún no tienen su ID del ERP.
        {puedeVincular
          ? ' Cuando el ERP los registre, escribe aquí su ID para vincularlos.'
          : ' Un administrador los vincula cuando el ERP les asigne su ID.'}
      </p>

      {error && <p className="mod-text">Error: {error}</p>}
      {aviso && (
        <p className="mod-text">
          {aviso}{' '}
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => setAviso('')}>Entendido</button>
        </p>
      )}

      <TablaExcel clave="itemsprovisionales-1" etiqueta="Tabla de ítems provisionales"><table className="mod-table">
          <thead>
            <tr>
              {['Ref.', 'Nombre', 'Línea', 'IVA', 'Creado', 'Solicitudes activas', 'Órdenes', 'Código del ERP'].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.item_id}>
                <td>{idVisible(f.item_id, true)}</td>
                <td>{f.nombre_base}</td>
                <td>{f.linea ?? ''}</td>
                <td>{f.iva === null ? '' : `${Math.round(f.iva * 100)}%`}</td>
                <td>{fecha(f.creado)}</td>
                <td>{f.solicitudes_activas}</td>
                <td>{f.ordenes}</td>
                <td>
                  {puedeVincular ? (
                    <div className="mod-flex mod-gap-2">
                      <input
                        value={ids[f.item_id] ?? ''}
                        placeholder="Código ERP"
                        onChange={(e) => setIds((x) => ({ ...x, [f.item_id]: e.target.value.replace(/\D/g, '') }))}
                        className="ui-input ui-input--sm" style={{ width: 110 }}
                        aria-label={`ID del ERP para ${f.nombre_base}`}
                      />
                      <button
                        type="button"
                        className="ui-btn ui-btn--sm ui-btn--primary"
                        disabled={trabajando === f.item_id || !ids[f.item_id]}
                        onClick={() => vincular(f)}
                      >
                        Vincular
                      </button>
                    </div>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
            {filas.length === 0 && (
              <tr><td colSpan={8}>No hay ítems provisionales pendientes</td></tr>
            )}
          </tbody>
        </table></TablaExcel>
    </div>
  );
}
