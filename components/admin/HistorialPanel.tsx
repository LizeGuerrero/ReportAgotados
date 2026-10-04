'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { AuditoriaItem } from '@/types/auth.types';

interface Props {
  organizacionId: string;
  onError: (mensaje: string) => void;
}

const LIMITE = 100;

const fmtFechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });

/** Últimos cambios de la organización (quién hizo qué y cuándo). Solo lectura. */
export function HistorialPanel({ organizacionId, onError }: Props) {
  const supabase = createClient();
  const [items, setItems] = useState<AuditoriaItem[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase.rpc('listar_auditoria', { p_org: organizacionId, p_limite: LIMITE });
    if (error) onError(error.message);
    setItems((data ?? []) as AuditoriaItem[]);
    setCargando(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizacionId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <div className="adm-card">
      <div className="adm-editor__head" style={{ justifyContent: 'space-between' }}>
        <h2 className="adm-card__title" style={{ margin: 0 }}>
          Historial de cambios
        </h2>
        <button type="button" className="ui-btn ui-btn--sm" onClick={cargar} disabled={cargando}>
          Actualizar
        </button>
      </div>
      {cargando ? (
        <p className="adm-vacio" aria-busy="true">
          Cargando...
        </p>
      ) : items.length === 0 ? (
        <p className="adm-vacio">Todavía no hay cambios registrados.</p>
      ) : (
        <>
          <div className="adm-tabla-wrap">
            <table className="adm-tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Cambio</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td className="adm-nowrap">{fmtFechaHora(i.fecha)}</td>
                    <td>
                      <strong>{i.usuario}</strong> {i.descripcion}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="adm-leyenda">Se muestran los últimos {LIMITE} cambios.</p>
        </>
      )}
    </div>
  );
}
