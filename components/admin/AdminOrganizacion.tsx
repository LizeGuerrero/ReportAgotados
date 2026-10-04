'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ROL_PREDETERMINADO } from '@/lib/roles';
import { AlertIcon } from '@/components/ui/icons';
import type { InvitacionOrg, MiembroOrg, ModuloOpt, PermisoRol } from '@/types/auth.types';
import type { RolOpt, SedeOpt } from './tipos';
import { SolicitudesPanel } from './SolicitudesPanel';
import { MiembrosPanel } from './MiembrosPanel';
import { InvitacionesPanel } from './InvitacionesPanel';
import { RolesPanel } from './RolesPanel';
import { SedesPanel } from './SedesPanel';
import { HistorialPanel } from './HistorialPanel';
import { miembrosSinSede } from './sinSede';
import { nombrePersona } from './tipos';

interface Props {
  organizacionId: string;
  slug: string;
  nombreOrganizacion: string;
  identificacion: string | null;
  usuarioActualId: string;
  /** Propietario inicial (se vuelve a leer al recargar, por si se transfiere). */
  propietarioInicial: string | null;
}

type Pestana = 'solicitudes' | 'miembros' | 'invitaciones' | 'roles' | 'sedes' | 'historial';

// Todo lo que muestra y hace este panel pasa por funciones de base de datos que vuelven a
// comprobar que quien llama es admin de esta organización: ocultar el panel no es la defensa.
export function AdminOrganizacion({
  organizacionId,
  slug,
  nombreOrganizacion,
  identificacion,
  usuarioActualId,
  propietarioInicial,
}: Props) {
  const supabase = createClient();
  const [pestana, setPestana] = useState<Pestana>('solicitudes');
  const [miembros, setMiembros] = useState<MiembroOrg[]>([]);
  const [invitaciones, setInvitaciones] = useState<InvitacionOrg[]>([]);
  const [roles, setRoles] = useState<RolOpt[]>([]);
  const [sedes, setSedes] = useState<SedeOpt[]>([]);
  const [propietarioId, setPropietarioId] = useState<string | null>(propietarioInicial);
  const [permisos, setPermisos] = useState<PermisoRol[]>([]);
  const [modulos, setModulos] = useState<Pick<ModuloOpt, 'id' | 'nombre'>[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [m, i, r, s, o, pe, mo] = await Promise.all([
      supabase.rpc('listar_miembros', { p_org: organizacionId }),
      supabase.rpc('listar_invitaciones', { p_org: organizacionId }),
      supabase.from('roles').select('id, nombre').eq('organizacion_id', organizacionId).order('nombre'),
      supabase.from('sedes').select('id, nombre').eq('organizacion_id', organizacionId).order('nombre'),
      supabase.from('organizaciones').select('propietario_id').eq('id', organizacionId).maybeSingle(),
      supabase.rpc('listar_permisos_org', { p_org: organizacionId }),
      supabase.from('modulos').select('id, nombre'),
    ]);
    const fallo = m.error ?? i.error ?? r.error ?? s.error;
    if (fallo) setError(fallo.message);
    setMiembros((m.data ?? []) as MiembroOrg[]);
    setInvitaciones((i.data ?? []) as InvitacionOrg[]);
    // Predeterminado primero, luego el resto por nombre.
    const lista = ((r.data ?? []) as RolOpt[]).slice().sort((a, b) =>
      a.nombre === ROL_PREDETERMINADO ? -1 : b.nombre === ROL_PREDETERMINADO ? 1 : a.nombre.localeCompare(b.nombre, 'es')
    );
    setRoles(lista);
    setSedes((s.data ?? []) as SedeOpt[]);
    // permisos y módulos solo alimentan el aviso de "miembros sin sede": si faltan (migración sin aplicar), no hay aviso
    setPermisos(pe.error ? [] : ((pe.data ?? []) as PermisoRol[]));
    setModulos((mo.data ?? []) as Pick<ModuloOpt, 'id' | 'nombre'>[]);
    // si la columna aún no existe (parche sin aplicar) simplemente no hay propietario
    setPropietarioId(o.error ? null : ((o.data as { propietario_id: string | null } | null)?.propietario_id ?? null));
    setCargando(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizacionId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const alCambiar = (texto: string) => {
    setError(null);
    setMensaje(texto);
    cargar();
  };
  const alFallar = (texto: string) => {
    setMensaje(null);
    setError(texto);
  };

  const solicitudes = miembros.filter((m) => m.estado === 'pendiente');
  const activos = miembros.filter((m) => m.estado !== 'pendiente');
  const pendientesInv = invitaciones.filter((i) => i.estado === 'pendiente').length;
  const sinSede = miembrosSinSede(activos, modulos, permisos);

  const tabs: { clave: Pestana; texto: string; cuenta?: number }[] = [
    { clave: 'solicitudes', texto: 'Solicitudes', cuenta: solicitudes.length },
    { clave: 'miembros', texto: 'Miembros', cuenta: activos.length },
    { clave: 'invitaciones', texto: 'Invitaciones', cuenta: pendientesInv },
    { clave: 'roles', texto: 'Roles' },
    { clave: 'sedes', texto: 'Sedes' },
    { clave: 'historial', texto: 'Historial' },
  ];

  return (
    <main className="adm-page">
      <header className="adm-head">
        <h1 className="adm-title">Administración</h1>
        <p className="adm-lead">
          {nombreOrganizacion}
          {identificacion ? ` · ${identificacion}` : ''}
        </p>
      </header>

      <div className="adm-tabs" role="tablist" aria-label="Secciones de administración">
        {tabs.map((t) => (
          <button
            key={t.clave}
            type="button"
            role="tab"
            aria-selected={pestana === t.clave}
            className="adm-tab"
            onClick={() => setPestana(t.clave)}
          >
            {t.texto}
            {t.cuenta !== undefined && t.cuenta > 0 && (
              <span className={`ui-badge ${t.clave === 'solicitudes' ? 'ui-badge--warning' : 'ui-badge--muted'}`}>{t.cuenta}</span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="ui-alert ui-alert--error" style={{ marginBottom: '1rem' }}>
          <AlertIcon className="ui-alert__icon" />
          <p>{error}</p>
        </div>
      )}
      {mensaje && !error && (
        <div role="status" className="org-mensaje-ok" style={{ marginBottom: '1rem' }}>
          <p>{mensaje}</p>
        </div>
      )}

      {cargando ? (
        <p className="adm-vacio" aria-busy="true">
          Cargando...
        </p>
      ) : (
        <div role="tabpanel">
          {pestana === 'solicitudes' && (
            <SolicitudesPanel solicitudes={solicitudes} roles={roles} sedes={sedes} onCambio={alCambiar} onError={alFallar} />
          )}
          {pestana === 'miembros' && sinSede.length > 0 && (
            <div className="org-aviso" role="status" style={{ marginTop: 0, marginBottom: '1rem' }}>
              <p>
                <strong>
                  {sinSede.length === 1 ? '1 persona no podrá' : `${sinSede.length} personas no podrán`} usar Agotados ni Pedidos
                </strong>{' '}
                porque su rol da acceso pero no tienen sede asignada: {sinSede.map((m) => nombrePersona(m)).join(', ')}. Asígnales
                una sede en la columna Sede.
              </p>
            </div>
          )}
          {pestana === 'miembros' && (
            <MiembrosPanel
              miembros={activos}
              roles={roles}
              sedes={sedes}
              usuarioActualId={usuarioActualId}
              organizacionId={organizacionId}
              propietarioId={propietarioId}
              onCambio={alCambiar}
              onError={alFallar}
            />
          )}
          {pestana === 'roles' && (
            <RolesPanel
              organizacionId={organizacionId}
              miembros={miembros}
              onIrAMiembros={() => setPestana('miembros')}
              onCambio={alCambiar}
              onError={alFallar}
            />
          )}
          {pestana === 'sedes' && <SedesPanel organizacionId={organizacionId} onCambio={alCambiar} onError={alFallar} />}
          {pestana === 'historial' && <HistorialPanel organizacionId={organizacionId} onError={alFallar} />}
          {pestana === 'invitaciones' && (
            <InvitacionesPanel
              slug={slug}
              invitaciones={invitaciones}
              roles={roles}
              sedes={sedes}
              onCambio={alCambiar}
              onError={alFallar}
            />
          )}
        </div>
      )}
    </main>
  );
}
