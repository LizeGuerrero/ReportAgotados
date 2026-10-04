'use client';

import { useEffect, useMemo, useState } from 'react';
import { etiquetaRol, ROLES_BASE } from '@/lib/roles';
import type { MiembroOrg, ModuloOpt, PermisoRol, RolAdmin } from '@/types/auth.types';
import { nombrePersona } from './tipos';

type Celda = { ver: boolean; crear: boolean; editar: boolean; eliminar: boolean };
type Matriz = Record<string, Celda>;
const VACIA: Celda = { ver: false, crear: false, editar: false, eliminar: false };

// Módulo reservado al rol admin (la base de datos también lo exige) y módulo sin efecto hoy.
const MODULO_RESERVADO = 'Roles';
const MODULO_SIN_EFECTO = 'Reportes';

interface Props {
  rol: RolAdmin;
  modulos: ModuloOpt[];
  permisos: PermisoRol[];
  /** Miembros (activos o suspendidos) que tienen este rol. */
  miembrosDelRol: MiembroOrg[];
  ocupado: boolean;
  onGuardarDatos: (nombre: string, descripcion: string) => void;
  onGuardarPermisos: (matriz: { modulo_id: string; ver: boolean; crear: boolean; editar: boolean; eliminar: boolean }[]) => void;
  onEliminar: () => void;
  onRestablecer: () => void;
  onIrAMiembros: () => void;
}

function aMatriz(modulos: ModuloOpt[], permisos: PermisoRol[]): Matriz {
  const m: Matriz = {};
  for (const mod of modulos) {
    const p = permisos.find((x) => x.modulo_id === mod.id);
    m[mod.id] = p
      ? { ver: p.puede_ver, crear: p.puede_crear, editar: p.puede_editar, eliminar: p.puede_eliminar }
      : { ...VACIA };
  }
  return m;
}

export function RolEditor({
  rol,
  modulos,
  permisos,
  miembrosDelRol,
  ocupado,
  onGuardarDatos,
  onGuardarPermisos,
  onEliminar,
  onRestablecer,
  onIrAMiembros,
}: Props) {
  const original = useMemo(() => aMatriz(modulos, permisos), [modulos, permisos]);
  const [matriz, setMatriz] = useState<Matriz>(original);
  const [nombre, setNombre] = useState(rol.nombre);
  const [descripcion, setDescripcion] = useState(rol.descripcion ?? '');

  // Al cambiar de rol (o recargar tras guardar) se parte de lo que está en la base de datos.
  useEffect(() => {
    setMatriz(original);
    setNombre(rol.nombre);
    setDescripcion(rol.descripcion ?? '');
  }, [original, rol.rol_id, rol.nombre, rol.descripcion]);

  const modulosOrdenados = useMemo(
    () =>
      modulos
        .slice()
        .sort((a, b) =>
          a.nombre === MODULO_RESERVADO ? 1 : b.nombre === MODULO_RESERVADO ? -1 : a.nombre.localeCompare(b.nombre, 'es')
        ),
    [modulos]
  );

  const esAdmin = rol.nombre === 'admin';
  const soloLectura = rol.protegido;
  const hayCambioPermisos = modulos.some((m) => {
    const a = matriz[m.id] ?? VACIA;
    const o = original[m.id] ?? VACIA;
    return a.ver !== o.ver || a.crear !== o.crear || a.editar !== o.editar || a.eliminar !== o.eliminar;
  });
  const hayCambioDatos = nombre.trim() !== rol.nombre || descripcion.trim() !== (rol.descripcion ?? '');
  const puedeEliminar = !rol.protegido && rol.miembros === 0 && rol.invitaciones_pendientes === 0;
  const esBase = !rol.protegido && ROLES_BASE.includes(rol.nombre);

  function alternar(moduloId: string, campo: keyof Celda, valor: boolean) {
    setMatriz((prev) => {
      const c = { ...(prev[moduloId] ?? VACIA), [campo]: valor };
      // Coherencia: crear/editar/eliminar suponen ver; quitar ver quita todo.
      if (campo !== 'ver' && valor) c.ver = true;
      if (campo === 'ver' && !valor) return { ...prev, [moduloId]: { ...VACIA } };
      return { ...prev, [moduloId]: c };
    });
  }

  function guardarPermisos() {
    onGuardarPermisos(modulos.map((m) => ({ modulo_id: m.id, ...(matriz[m.id] ?? VACIA) })));
  }

  const columnas: { campo: keyof Celda; texto: string }[] = [
    { campo: 'ver', texto: 'Ver' },
    { campo: 'crear', texto: 'Crear' },
    { campo: 'editar', texto: 'Editar' },
    { campo: 'eliminar', texto: 'Eliminar' },
  ];

  return (
    <div className="adm-card">
      <div className="adm-editor__head">
        <h2>{etiquetaRol(rol.nombre)}</h2>
        {rol.protegido && <span className="ui-badge ui-badge--info">Rol del sistema</span>}
        <span className="ui-badge ui-badge--muted">
          {rol.miembros} {rol.miembros === 1 ? 'miembro' : 'miembros'}
        </span>
      </div>

      {rol.protegido && (
        <p className="ui-hint" style={{ marginTop: 0 }}>
          {esAdmin
            ? 'El administrador tiene acceso a todo y este rol no se puede modificar.'
            : 'Es el rol inicial de quien se une: no da acceso a ningún módulo y no se puede modificar.'}
        </p>
      )}

      {!soloLectura && (
        <div className="adm-editor__datos">
          <div>
            <label className="ui-label" htmlFor="rol-nombre">
              Nombre
            </label>
            <input
              id="rol-nombre"
              className="ui-input"
              value={nombre}
              maxLength={40}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>
          <div>
            <label className="ui-label" htmlFor="rol-desc">
              Descripción (opcional)
            </label>
            <input
              id="rol-desc"
              className="ui-input"
              value={descripcion}
              maxLength={200}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="ui-btn"
            disabled={ocupado || !hayCambioDatos || nombre.trim().length < 2}
            onClick={() => onGuardarDatos(nombre, descripcion)}
          >
            Guardar nombre
          </button>
        </div>
      )}

      <div className="adm-tabla-wrap">
        <table className="adm-tabla adm-tabla--matriz">
          <caption className="ui-hint" style={{ textAlign: 'left', paddingBottom: '0.5rem' }}>
            Permisos por módulo
          </caption>
          <thead>
            <tr>
              <th>Módulo</th>
              {columnas.map((c) => (
                <th key={c.campo}>{c.texto}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modulosOrdenados.map((m) => {
              const reservado = m.nombre === MODULO_RESERVADO && !esAdmin;
              const celda = matriz[m.id] ?? VACIA;
              return (
                <tr key={m.id}>
                  <td>
                    <div className="adm-modulo">
                      <strong>{m.nombre}</strong>
                      {m.descripcion && <span>{m.descripcion}</span>}
                      {reservado && <span>Reservado al administrador.</span>}
                      {m.nombre === MODULO_SIN_EFECTO && <span>Sin efecto por ahora: ninguna pantalla lo usa todavía.</span>}
                    </div>
                  </td>
                  {columnas.map((c) => (
                    <td key={c.campo}>
                      <input
                        type="checkbox"
                        className="adm-check"
                        aria-label={`${m.nombre}: ${c.texto.toLowerCase()}`}
                        checked={celda[c.campo]}
                        disabled={soloLectura || reservado || ocupado}
                        onChange={(e) => alternar(m.id, c.campo, e.target.checked)}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {miembrosDelRol.length > 0 && (
        <>
          <h3 className="adm-subtitulo">Miembros con este rol</h3>
          <ul className="adm-miembros-rol">
            {miembrosDelRol.map((m) => (
              <li key={m.membresia_id}>
                <strong>{nombrePersona(m)}</strong>
                <span>{m.email}</span>
                {m.estado === 'suspendida' && <span className="ui-badge ui-badge--warning">Suspendido</span>}
              </li>
            ))}
          </ul>
          <button type="button" className="ui-btn ui-btn--sm" style={{ marginTop: '0.75rem' }} onClick={onIrAMiembros}>
            Cambiar el rol de alguien en Miembros
          </button>
        </>
      )}

      {!soloLectura && (
        <div className="adm-editor__pie">
          <span className="ui-hint" style={{ margin: 0 }}>
            {rol.miembros > 0
              ? `Los cambios afectan de inmediato a ${rol.miembros} ${rol.miembros === 1 ? 'miembro' : 'miembros'}.`
              : 'Aún nadie tiene este rol.'}
          </span>
          <div className="adm-acciones">
            {esBase && (
              <button
                type="button"
                className="ui-btn"
                disabled={ocupado}
                onClick={() => {
                  if (
                    window.confirm(
                      `¿Restablecer "${rol.nombre}" a sus permisos originales? Se pierden los cambios hechos a su matriz` +
                        (rol.miembros > 0 ? ` y afecta de inmediato a ${rol.miembros} ${rol.miembros === 1 ? 'miembro' : 'miembros'}.` : '.')
                    )
                  )
                    onRestablecer();
                }}
              >
                Restablecer originales
              </button>
            )}
            <button
              type="button"
              className="ui-btn ui-btn--danger"
              disabled={ocupado || !puedeEliminar}
              title={
                puedeEliminar
                  ? undefined
                  : rol.miembros > 0
                  ? 'Cambia primero el rol de sus miembros'
                  : 'Cancela primero sus invitaciones pendientes'
              }
              onClick={() => {
                if (window.confirm(`¿Eliminar el rol "${rol.nombre}"? Esta acción no se puede deshacer.`)) onEliminar();
              }}
            >
              Eliminar rol
            </button>
            <button
              type="button"
              className="ui-btn ui-btn--primary"
              disabled={ocupado || !hayCambioPermisos}
              onClick={guardarPermisos}
            >
              Guardar permisos
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
