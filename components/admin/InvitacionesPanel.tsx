'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Field } from '@/components/ui/Field';
import { CopyIcon } from '@/components/ui/icons';
import { etiquetaRol, ROL_PREDETERMINADO } from '@/lib/roles';
import type { EstadoInvitacion, InvitacionOrg } from '@/types/auth.types';
import { fmtFecha, type RolOpt, type SedeOpt } from './tipos';

interface Props {
  slug: string;
  invitaciones: InvitacionOrg[];
  roles: RolOpt[];
  sedes: SedeOpt[];
  onCambio: (mensaje: string) => void;
  onError: (mensaje: string) => void;
}

const BADGE: Record<EstadoInvitacion, string> = {
  pendiente: 'ui-badge--warning',
  aceptada: 'ui-badge--success',
  rechazada: 'ui-badge--muted',
  cancelada: 'ui-badge--muted',
  vencida: 'ui-badge--danger',
};

interface Resultado {
  enlace: string;
  correoEnviado: boolean;
  aviso: string | null;
  email: string;
}

export function InvitacionesPanel({ slug, invitaciones, roles, sedes, onCambio, onError }: Props) {
  const supabase = createClient();
  const predeterminado = roles.find((r) => r.nombre === ROL_PREDETERMINADO)?.id ?? '';
  const [email, setEmail] = useState('');
  const [rolId, setRolId] = useState(predeterminado);
  const [sedeId, setSedeId] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function invitar(correo: string, rol: string, sede: string) {
    setEnviando(true);
    setResultado(null);
    setCopiado(false);
    const res = await fetch(`/api/organizaciones/${encodeURIComponent(slug)}/invitaciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: correo, rol_id: rol, sede_id: sede || null }),
    });
    const data = await res.json().catch(() => ({}));
    setEnviando(false);
    if (!res.ok) return onError(data.error ?? 'No se pudo crear la invitación.');
    setResultado({ enlace: data.enlace, correoEnviado: data.correoEnviado, aviso: data.aviso, email: correo });
    setEmail('');
    onCambio(data.correoEnviado ? `Invitación enviada a ${correo}.` : `Invitación creada para ${correo}.`);
  }

  async function copiar() {
    if (!resultado) return;
    try {
      await navigator.clipboard.writeText(resultado.enlace);
      setCopiado(true);
    } catch {
      onError('No se pudo copiar automáticamente. Selecciona el enlace y cópialo.');
    }
  }

  async function cancelar(inv: InvitacionOrg) {
    const { error } = await supabase.rpc('cancelar_invitacion', { p_id: inv.id });
    if (error) return onError(error.message);
    onCambio(`Invitación a ${inv.email} cancelada.`);
  }

  function reenviar(inv: InvitacionOrg) {
    const sede = sedes.find((s) => s.nombre === inv.sede_nombre)?.id ?? '';
    return invitar(inv.email, inv.rol_id, sede);
  }

  return (
    <>
      <div className="adm-card">
        <h2 className="adm-card__title">Invitar a una persona</h2>
        <form
          className="adm-invitar"
          onSubmit={(e) => {
            e.preventDefault();
            invitar(email, rolId, sedeId);
          }}
        >
          <Field id="inv-email" label="Correo">
            <input
              id="inv-email"
              type="email"
              className="ui-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="persona@empresa.com"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
          </Field>
          <Field id="inv-rol" label="Rol">
            <select id="inv-rol" className="ui-input" value={rolId} onChange={(e) => setRolId(e.target.value)}>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {etiquetaRol(r.nombre)}
                </option>
              ))}
            </select>
          </Field>
          <Field id="inv-sede" label="Sede (opcional)">
            <select id="inv-sede" className="ui-input" value={sedeId} onChange={(e) => setSedeId(e.target.value)}>
              <option value="">Sin sede</option>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </Field>
          <button type="submit" className="ui-btn ui-btn--primary" disabled={enviando || !rolId}>
            {enviando ? 'Creando...' : 'Invitar'}
          </button>
        </form>

        {resultado && (
          <div role="status" style={{ marginTop: '1rem' }}>
            <div className="org-mensaje-ok">
              <p>
                {resultado.correoEnviado
                  ? `Enviamos la invitación a ${resultado.email}. También puedes compartir el enlace:`
                  : `${resultado.aviso ?? 'Invitación creada.'} Enlace para ${resultado.email}:`}
              </p>
            </div>
            <div className="adm-enlace">
              <input
                className="ui-input"
                readOnly
                value={resultado.enlace}
                aria-label="Enlace de invitación"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button type="button" className="ui-btn" onClick={copiar}>
                <CopyIcon />
                {copiado ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            <p className="ui-hint">
              Vence en 7 días, sirve una sola vez y solo funciona con ese correo. Por seguridad no se vuelve a mostrar.
            </p>
          </div>
        )}
      </div>

      <div className="adm-card">
        <h2 className="adm-card__title">Invitaciones</h2>
        {invitaciones.length === 0 ? (
          <p className="adm-vacio">Todavía no has enviado invitaciones.</p>
        ) : (
          <div className="adm-tabla-wrap">
            <table className="adm-tabla">
              <thead>
                <tr>
                  <th>Correo</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Creada</th>
                  <th>Vence</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {invitaciones.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <div className="adm-persona">
                        <strong>{inv.email}</strong>
                        {inv.invitado_por_nombre && <span>por {inv.invitado_por_nombre}</span>}
                      </div>
                    </td>
                    <td>
                      {etiquetaRol(inv.rol_nombre)}
                      {inv.sede_nombre ? ` · ${inv.sede_nombre}` : ''}
                    </td>
                    <td>
                      <span className={`ui-badge ${BADGE[inv.estado]}`}>{inv.estado}</span>
                    </td>
                    <td>{fmtFecha(inv.creada_en)}</td>
                    <td>{fmtFecha(inv.expira_en)}</td>
                    <td>
                      <div className="adm-acciones">
                        {(inv.estado === 'pendiente' || inv.estado === 'vencida' || inv.estado === 'cancelada') && (
                          <button type="button" className="ui-btn ui-btn--sm" disabled={enviando} onClick={() => reenviar(inv)}>
                            Reenviar
                          </button>
                        )}
                        {inv.estado === 'pendiente' && (
                          <button type="button" className="ui-btn ui-btn--danger ui-btn--sm" onClick={() => cancelar(inv)}>
                            Cancelar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
