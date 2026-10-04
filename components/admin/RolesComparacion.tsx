import { etiquetaRol } from '@/lib/roles';
import type { ModuloOpt, PermisoRol, RolAdmin } from '@/types/auth.types';

interface Props {
  roles: RolAdmin[];
  modulos: ModuloOpt[];
  permisos: PermisoRol[];
}

const LETRAS: { campo: keyof Omit<PermisoRol, 'rol_id' | 'modulo_id'>; letra: string; texto: string }[] = [
  { campo: 'puede_ver', letra: 'V', texto: 'ver' },
  { campo: 'puede_crear', letra: 'C', texto: 'crear' },
  { campo: 'puede_editar', letra: 'E', texto: 'editar' },
  { campo: 'puede_eliminar', letra: 'X', texto: 'eliminar' },
];

/** Vista de solo lectura: todos los roles contra todos los módulos. */
export function RolesComparacion({ roles, modulos, permisos }: Props) {
  const orden = modulos
    .slice()
    .sort((a, b) => (a.nombre === 'Roles' ? 1 : b.nombre === 'Roles' ? -1 : a.nombre.localeCompare(b.nombre, 'es')));

  return (
    <div className="adm-card">
      <h2 className="adm-card__title">Comparación de roles</h2>
      <div className="adm-tabla-wrap">
        <table className="adm-tabla adm-comparacion">
          <thead>
            <tr>
              <th>Módulo</th>
              {roles.map((r) => (
                <th key={r.rol_id}>{etiquetaRol(r.nombre)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orden.map((m) => (
              <tr key={m.id}>
                <td>
                  <strong>{m.nombre}</strong>
                </td>
                {roles.map((r) => {
                  const p = permisos.find((x) => x.rol_id === r.rol_id && x.modulo_id === m.id);
                  const activos = p ? LETRAS.filter((l) => p[l.campo]) : [];
                  return (
                    <td
                      key={r.rol_id}
                      title={activos.length ? activos.map((l) => l.texto).join(', ') : 'sin acceso'}
                    >
                      {activos.length ? activos.map((l) => l.letra).join(' ') : <span className="adm-vacio-celda">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="adm-leyenda">V = ver · C = crear · E = editar · X = eliminar · — = sin acceso</p>
    </div>
  );
}
