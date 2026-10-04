'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { etiquetaRol, ROL_PREDETERMINADO } from '@/lib/roles';
import type { MiembroOrg } from '@/types/auth.types';
import { fmtFecha, nombrePersona, type RolOpt, type SedeOpt } from './tipos';

interface Props {
  solicitudes: MiembroOrg[];
  roles: RolOpt[];
  sedes: SedeOpt[];
  onCambio: (mensaje: string) => void;
  onError: (mensaje: string) => void;
}

function Fila({ s, roles, sedes, onCambio, onError }: Omit<Props, 'solicitudes'> & { s: MiembroOrg }) {
  const supabase = createClient();
  const predeterminado = roles.find((r) => r.nombre === ROL_PREDETERMINADO)?.id ?? '';
  const [rolId, setRolId] = useState(predeterminado);
  const [sedeId, setSedeId] = useState('');
  const [trabajando, setTrabajando] = useState(false);

  async function resolver(aceptar: boolean) {
    setTrabajando(true);
    const { error } = await supabase.rpc('resolver_solicitud', {
      p_membresia: s.membresia_id,
      p_aceptar: aceptar,
      p_rol: aceptar ? rolId || null : null,
      p_sede: aceptar && sedeId ? sedeId : null,
    });
    setTrabajando(false);
    if (error) return onError(error.message);
    onCambio(aceptar ? `${nombrePersona(s)} fue aceptado.` : `Solicitud de ${nombrePersona(s)} rechazada.`);
  }

  return (
    <tr>
      <td>
        <div className="adm-persona">
          <strong>{nombrePersona(s)}</strong>
          <span>{s.email}</span>
        </div>
      </td>
      <td>{s.numero_documento ? `${s.tipo_documento ?? ''} ${s.numero_documento}` : '—'}</td>
      <td>{fmtFecha(s.fecha_ingreso)}</td>
      <td>
        <select
          className="ui-input ui-input--sm adm-select"
          aria-label={`Rol para ${nombrePersona(s)}`}
          value={rolId}
          onChange={(e) => setRolId(e.target.value)}
        >
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {etiquetaRol(r.nombre)}
            </option>
          ))}
        </select>
      </td>
      <td>
        <select
          className="ui-input ui-input--sm adm-select"
          aria-label={`Sede para ${nombrePersona(s)}`}
          value={sedeId}
          onChange={(e) => setSedeId(e.target.value)}
        >
          <option value="">Sin sede</option>
          {sedes.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nombre}
            </option>
          ))}
        </select>
      </td>
      <td>
        <div className="adm-acciones">
          <button type="button" className="ui-btn ui-btn--primary ui-btn--sm" disabled={trabajando} onClick={() => resolver(true)}>
            Aceptar
          </button>
          <button type="button" className="ui-btn ui-btn--danger ui-btn--sm" disabled={trabajando} onClick={() => resolver(false)}>
            Rechazar
          </button>
        </div>
      </td>
    </tr>
  );
}

export function SolicitudesPanel({ solicitudes, ...resto }: Props) {
  if (solicitudes.length === 0) {
    return <p className="adm-vacio">No hay solicitudes pendientes.</p>;
  }
  return (
    <div className="adm-card">
      <div className="adm-tabla-wrap">
        <table className="adm-tabla">
          <thead>
            <tr>
              <th>Persona</th>
              <th>Documento</th>
              <th>Solicitud</th>
              <th>Rol</th>
              <th>Sede</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {solicitudes.map((s) => (
              <Fila key={s.membresia_id} s={s} {...resto} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
