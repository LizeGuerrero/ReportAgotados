'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { etiquetaRol } from '@/lib/roles';
import type { MiembroOrg, ModuloOpt, PermisoRol, RolAdmin } from '@/types/auth.types';
import { RolEditor } from './RolEditor';
import { RolesComparacion } from './RolesComparacion';

interface Props {
  organizacionId: string;
  miembros: MiembroOrg[];
  onIrAMiembros: () => void;
  onCambio: (mensaje: string) => void;
  onError: (mensaje: string) => void;
}

// Todo pasa por funciones de base de datos que comprueban que quien llama es admin de esta
// organización, que el rol le pertenece y que no se toca un rol del sistema.
export function RolesPanel({ organizacionId, miembros, onIrAMiembros, onCambio, onError }: Props) {
  const supabase = createClient();
  const [roles, setRoles] = useState<RolAdmin[]>([]);
  const [permisos, setPermisos] = useState<PermisoRol[]>([]);
  const [modulos, setModulos] = useState<ModuloOpt[]>([]);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [copiarDe, setCopiarDe] = useState('');
  const [vista, setVista] = useState<'editar' | 'comparar'>('editar');

  const recargar = useCallback(
    async (preferido?: string | null) => {
      const [r, p, m] = await Promise.all([
        supabase.rpc('listar_roles_org', { p_org: organizacionId }),
        supabase.rpc('listar_permisos_org', { p_org: organizacionId }),
        supabase.from('modulos').select('id, nombre, descripcion').order('nombre'),
      ]);
      const fallo = r.error ?? p.error ?? m.error;
      if (fallo) onError(fallo.message);
      const lista = (r.data ?? []) as RolAdmin[];
      setRoles(lista);
      setPermisos((p.data ?? []) as PermisoRol[]);
      setModulos((m.data ?? []) as ModuloOpt[]);
      setSeleccionado((actual) => {
        const buscado = preferido ?? actual;
        return lista.some((x) => x.rol_id === buscado) ? buscado : (lista[0]?.rol_id ?? null);
      });
      setCargando(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [organizacionId]
  );

  useEffect(() => {
    recargar();
  }, [recargar]);

  // Ejecuta una operación, recarga lo propio y avisa al panel padre (que refresca roles/miembros).
  async function ejecutar(
    operacion: () => PromiseLike<{ error: { message: string } | null }>,
    mensaje: string,
    preferido?: string | null
  ) {
    setOcupado(true);
    const { error } = await operacion();
    if (error) {
      setOcupado(false);
      return onError(error.message);
    }
    await recargar(preferido);
    setOcupado(false);
    onCambio(mensaje);
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true);
    const { data, error } = await supabase.rpc('crear_rol', {
      p_org: organizacionId,
      p_nombre: nuevoNombre,
      p_descripcion: null,
      p_copiar_de: copiarDe || null,
    });
    if (error) {
      setOcupado(false);
      return onError(error.message);
    }
    const nombre = nuevoNombre.trim();
    setNuevoNombre('');
    setCopiarDe('');
    await recargar(typeof data === 'string' ? data : null);
    setOcupado(false);
    onCambio(`Rol "${nombre}" creado.`);
  }

  // Referencia estable: si cambiara en cada render, el editor descartaría las casillas sin guardar.
  const permisosDelRol = useMemo(
    () => permisos.filter((p) => p.rol_id === seleccionado),
    [permisos, seleccionado]
  );

  const miembrosDelRol = useMemo(
    () => miembros.filter((m) => m.rol_id === seleccionado && m.estado !== 'pendiente'),
    [miembros, seleccionado]
  );

  if (cargando) {
    return (
      <p className="adm-vacio" aria-busy="true">
        Cargando...
      </p>
    );
  }

  const rol = roles.find((r) => r.rol_id === seleccionado) ?? null;

  return (
    <div className="adm-roles">
      <div className="adm-card">
        <h2 className="adm-card__title">Roles</h2>
        <button
          type="button"
          className="ui-btn ui-btn--sm"
          style={{ marginBottom: '0.75rem' }}
          onClick={() => setVista((v) => (v === 'editar' ? 'comparar' : 'editar'))}
        >
          {vista === 'editar' ? 'Ver comparación de roles' : 'Volver a editar'}
        </button>
        <ul className="adm-roles__lista">
          {roles.map((r) => (
            <li key={r.rol_id}>
              <button
                type="button"
                className="adm-roles__item"
                aria-current={r.rol_id === seleccionado}
                onClick={() => {
                  setSeleccionado(r.rol_id);
                  setVista('editar');
                }}
              >
                <span>{etiquetaRol(r.nombre)}</span>
                <span className="adm-roles__cuenta">{r.miembros}</span>
              </button>
            </li>
          ))}
        </ul>

        <form className="adm-roles__nuevo" onSubmit={crear}>
          <label className="ui-label" htmlFor="nuevo-rol">
            Nuevo rol
          </label>
          <input
            id="nuevo-rol"
            className="ui-input"
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            maxLength={40}
            placeholder="Nombre del rol"
            required
          />
          <label className="ui-label" htmlFor="nuevo-rol-copia">
            Permisos iniciales
          </label>
          <select
            id="nuevo-rol-copia"
            className="ui-input"
            value={copiarDe}
            onChange={(e) => setCopiarDe(e.target.value)}
          >
            <option value="">Empezar sin permisos</option>
            {roles.map((r) => (
              <option key={r.rol_id} value={r.rol_id}>
                Copiar de {etiquetaRol(r.nombre)}
              </option>
            ))}
          </select>
          <button type="submit" className="ui-btn ui-btn--primary" disabled={ocupado || nuevoNombre.trim().length < 2}>
            Crear rol
          </button>
        </form>
      </div>

      {vista === 'comparar' ? (
        <RolesComparacion roles={roles} modulos={modulos} permisos={permisos} />
      ) : rol ? (
        <RolEditor
          rol={rol}
          modulos={modulos}
          permisos={permisosDelRol}
          miembrosDelRol={miembrosDelRol}
          ocupado={ocupado}
          onGuardarDatos={(nombre, descripcion) =>
            ejecutar(
              () => supabase.rpc('editar_rol', { p_rol: rol.rol_id, p_nombre: nombre, p_descripcion: descripcion }),
              `Rol "${nombre.trim()}" actualizado.`
            )
          }
          onGuardarPermisos={(matriz) =>
            ejecutar(
              () => supabase.rpc('guardar_permisos_rol', { p_rol: rol.rol_id, p_permisos: matriz }),
              `Permisos de "${rol.nombre}" guardados.`
            )
          }
          onIrAMiembros={onIrAMiembros}
          onRestablecer={() =>
            ejecutar(
              () => supabase.rpc('restablecer_rol_base', { p_rol: rol.rol_id }),
              `Rol "${rol.nombre}" restablecido a sus permisos originales.`
            )
          }
          onEliminar={() =>
            ejecutar(() => supabase.rpc('eliminar_rol', { p_rol: rol.rol_id }), `Rol "${rol.nombre}" eliminado.`, null)
          }
        />
      ) : (
        <p className="adm-vacio">No hay roles.</p>
      )}
    </div>
  );
}
