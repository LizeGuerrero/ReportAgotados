'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Field } from '@/components/ui/Field';
import type { SedeAdmin } from '@/types/auth.types';

interface Props {
  organizacionId: string;
  onCambio: (mensaje: string) => void;
  onError: (mensaje: string) => void;
}

// Todo pasa por funciones de base de datos que comprueban que quien llama es admin de esta
// organización. Una sede con miembros o con registros (agotados, bodegas, órdenes) no se elimina.
export function SedesPanel({ organizacionId, onCambio, onError }: Props) {
  const supabase = createClient();
  const [sedes, setSedes] = useState<SedeAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [nombre, setNombre] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [editando, setEditando] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editCiudad, setEditCiudad] = useState('');

  const recargar = useCallback(async () => {
    const { data, error } = await supabase.rpc('listar_sedes_org', { p_org: organizacionId });
    if (error) onError(error.message);
    setSedes((data ?? []) as SedeAdmin[]);
    setCargando(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizacionId]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true);
    const { error } = await supabase.rpc('crear_sede', {
      p_org: organizacionId,
      p_nombre: nombre,
      p_ciudad: ciudad || null,
    });
    if (error) {
      setOcupado(false);
      return onError(error.message);
    }
    const creada = nombre.trim();
    setNombre('');
    setCiudad('');
    await recargar();
    setOcupado(false);
    onCambio(`Sede "${creada}" creada.`);
  }

  async function guardarEdicion(sede: SedeAdmin) {
    setOcupado(true);
    const { error } = await supabase.rpc('editar_sede', {
      p_sede: sede.sede_id,
      p_nombre: editNombre,
      p_ciudad: editCiudad || null,
    });
    if (error) {
      setOcupado(false);
      return onError(error.message);
    }
    setEditando(null);
    await recargar();
    setOcupado(false);
    onCambio(`Sede "${editNombre.trim()}" actualizada.`);
  }

  async function eliminar(sede: SedeAdmin) {
    if (!window.confirm(`¿Eliminar la sede "${sede.nombre}"? Esta acción no se puede deshacer.`)) return;
    setOcupado(true);
    const { error } = await supabase.rpc('eliminar_sede', { p_sede: sede.sede_id });
    if (error) {
      setOcupado(false);
      return onError(error.message);
    }
    await recargar();
    setOcupado(false);
    onCambio(`Sede "${sede.nombre}" eliminada.`);
  }

  if (cargando) {
    return (
      <p className="adm-vacio" aria-busy="true">
        Cargando...
      </p>
    );
  }

  return (
    <>
      <div className="adm-card">
        <h2 className="adm-card__title">Nueva sede</h2>
        <form className="adm-invitar" onSubmit={crear}>
          <Field id="sede-nombre" label="Nombre">
            <input
              id="sede-nombre"
              className="ui-input"
              value={nombre}
              maxLength={60}
              onChange={(e) => setNombre(e.target.value)}
              required
            />
          </Field>
          <Field id="sede-ciudad" label="Ciudad (opcional)">
            <input
              id="sede-ciudad"
              className="ui-input"
              value={ciudad}
              maxLength={60}
              onChange={(e) => setCiudad(e.target.value)}
            />
          </Field>
          <button type="submit" className="ui-btn ui-btn--primary" disabled={ocupado || nombre.trim().length < 2}>
            Crear sede
          </button>
        </form>
      </div>

      <div className="adm-card">
        <h2 className="adm-card__title">Sedes</h2>
        <div className="adm-tabla-wrap">
          <table className="adm-tabla">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Ciudad</th>
                <th>Miembros</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sedes.map((s) => {
                const enEdicion = editando === s.sede_id;
                const unica = sedes.length <= 1;
                const puedeEliminar = !unica && s.miembros === 0;
                return (
                  <tr key={s.sede_id}>
                    <td>
                      {enEdicion ? (
                        <input
                          className="ui-input ui-input--sm"
                          aria-label={`Nombre de la sede ${s.nombre}`}
                          value={editNombre}
                          maxLength={60}
                          onChange={(e) => setEditNombre(e.target.value)}
                        />
                      ) : (
                        <strong>{s.nombre}</strong>
                      )}
                    </td>
                    <td>
                      {enEdicion ? (
                        <input
                          className="ui-input ui-input--sm"
                          aria-label={`Ciudad de la sede ${s.nombre}`}
                          value={editCiudad}
                          maxLength={60}
                          onChange={(e) => setEditCiudad(e.target.value)}
                        />
                      ) : (
                        (s.ciudad ?? '—')
                      )}
                    </td>
                    <td>{s.miembros}</td>
                    <td>
                      <div className="adm-acciones">
                        {enEdicion ? (
                          <>
                            <button
                              type="button"
                              className="ui-btn ui-btn--primary ui-btn--sm"
                              disabled={ocupado || editNombre.trim().length < 2}
                              onClick={() => guardarEdicion(s)}
                            >
                              Guardar
                            </button>
                            <button type="button" className="ui-btn ui-btn--sm" disabled={ocupado} onClick={() => setEditando(null)}>
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="ui-btn ui-btn--sm"
                              disabled={ocupado}
                              onClick={() => {
                                setEditando(s.sede_id);
                                setEditNombre(s.nombre);
                                setEditCiudad(s.ciudad ?? '');
                              }}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="ui-btn ui-btn--danger ui-btn--sm"
                              disabled={ocupado || !puedeEliminar}
                              title={
                                puedeEliminar
                                  ? undefined
                                  : unica
                                  ? 'La organización debe conservar al menos una sede'
                                  : 'Cambia primero la sede de sus miembros'
                              }
                              onClick={() => eliminar(s)}
                            >
                              Eliminar
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
