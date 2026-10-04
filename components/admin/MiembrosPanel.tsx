'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { etiquetaRol, ROL_PREDETERMINADO } from '@/lib/roles';
import type { MiembroOrg } from '@/types/auth.types';
import { fmtFecha, nombrePersona, type RolOpt, type SedeOpt } from './tipos';

interface Props {
  miembros: MiembroOrg[];
  roles: RolOpt[];
  sedes: SedeOpt[];
  usuarioActualId: string;
  organizacionId: string;
  /** Propietario de la organización (null = organización sin propietario). */
  propietarioId: string | null;
  onCambio: (mensaje: string) => void;
  onError: (mensaje: string) => void;
}

function Fila({
  m,
  roles,
  sedes,
  usuarioActualId,
  organizacionId,
  propietarioId,
  onCambio,
  onError,
}: Omit<Props, 'miembros'> & { m: MiembroOrg }) {
  const supabase = createClient();
  const [rolId, setRolId] = useState(m.rol_id);
  const [sedeId, setSedeId] = useState(m.sede_id ?? '');
  const [trabajando, setTrabajando] = useState(false);

  const esYo = m.usuario_id === usuarioActualId;
  const esPropietario = propietarioId !== null && m.usuario_id === propietarioId;
  const soyPropietario = propietarioId !== null && usuarioActualId === propietarioId;
  const esAdmin = m.rol_nombre === 'admin';
  // Mismas reglas que aplica la base de datos (aquí solo evitan ofrecer un botón que fallaría):
  // nadie cambia su propio rol, nadie cambia el del propietario, y con propietario solo él
  // puede quitarle el rol de admin a otro admin.
  const rolBloqueado = esYo || esPropietario || (esAdmin && propietarioId !== null && !soyPropietario);
  const puedeTransferir = soyPropietario && esAdmin && !esYo;
  const cambioRol = rolId !== m.rol_id;
  const cambioSede = sedeId !== (m.sede_id ?? '');
  const rolNombre = roles.find((r) => r.id === rolId)?.nombre;

  async function guardar() {
    setTrabajando(true);
    const { error } = await supabase.rpc('cambiar_rol_miembro', {
      p_membresia: m.membresia_id,
      p_rol: rolId,
      p_sede: cambioSede && sedeId ? sedeId : null,
    });
    setTrabajando(false);
    if (error) return onError(error.message);
    onCambio(`Se actualizó a ${nombrePersona(m)}.`);
  }

  async function transferir() {
    const ok = window.confirm(
      `¿Transferir la propiedad de la organización a ${nombrePersona(m)}?\n\n` +
        'Seguirás siendo administrador, pero ya no serás propietario y esa persona podrá cambiar tu rol.'
    );
    if (!ok) return;
    setTrabajando(true);
    const { error } = await supabase.rpc('transferir_propiedad', {
      p_org: organizacionId,
      p_nuevo: m.usuario_id,
    });
    setTrabajando(false);
    if (error) return onError(error.message);
    onCambio(`${nombrePersona(m)} es ahora la persona propietaria.`);
  }

  return (
    <tr>
      <td>
        <div className="adm-persona">
          <strong>
            {nombrePersona(m)}
            {esYo ? ' (tú)' : ''}
            {esPropietario && (
              <>
                {' '}
                <span className="ui-badge ui-badge--info">Propietario</span>
              </>
            )}
          </strong>
          <span>{m.email}</span>
        </div>
      </td>
      <td>{m.numero_documento ? `${m.tipo_documento ?? ''} ${m.numero_documento}` : '—'}</td>
      <td>{fmtFecha(m.fecha_ingreso)}</td>
      <td>
        <select
          className="ui-input ui-input--sm adm-select"
          aria-label={`Rol de ${nombrePersona(m)}`}
          value={rolId}
          onChange={(e) => setRolId(e.target.value)}
          disabled={rolBloqueado}
        >
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {etiquetaRol(r.nombre)}
            </option>
          ))}
        </select>
        {rolBloqueado && (
          <div className="ui-hint">
            {esPropietario
              ? esYo
                ? 'Eres el propietario: tu rol no se puede cambiar.'
                : 'El rol del propietario no se puede cambiar.'
              : esYo
              ? 'Otro administrador debe cambiar tu rol.'
              : 'Solo el propietario puede quitar el rol de administrador.'}
          </div>
        )}
      </td>
      <td>
        <select
          className="ui-input ui-input--sm adm-select"
          aria-label={`Sede de ${nombrePersona(m)}`}
          value={sedeId}
          onChange={(e) => setSedeId(e.target.value)}
        >
          {!m.sede_id && <option value="">Sin sede</option>}
          {sedes.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nombre}
            </option>
          ))}
        </select>
        {!sedeId && rolNombre && rolNombre !== ROL_PREDETERMINADO && (
          <div className="ui-hint">Sin sede no podrá usar Agotados ni Pedidos.</div>
        )}
      </td>
      <td>
        <div className="adm-acciones">
          <button
            type="button"
            className="ui-btn ui-btn--primary ui-btn--sm"
            disabled={trabajando || (!cambioRol && !cambioSede)}
            onClick={guardar}
          >
            Guardar
          </button>
          {puedeTransferir && (
            <button type="button" className="ui-btn ui-btn--sm" disabled={trabajando} onClick={transferir}>
              Hacer propietario
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

export function MiembrosPanel({ miembros, ...resto }: Props) {
  if (miembros.length === 0) return <p className="adm-vacio">Aún no hay miembros.</p>;
  return (
    <div className="adm-card">
      <div className="adm-tabla-wrap">
        <table className="adm-tabla">
          <thead>
            <tr>
              <th>Persona</th>
              <th>Documento</th>
              <th>Ingreso</th>
              <th>Rol</th>
              <th>Sede</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {miembros.map((m) => (
              <Fila key={`${m.membresia_id}:${m.rol_id}:${m.sede_id}`} m={m} {...resto} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
