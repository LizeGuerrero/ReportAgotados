export type TipoDocumento = 'CC' | 'CE' | 'PASAPORTE' | 'TI' | 'OTRO';

export type EstadoMembresia = 'pendiente' | 'activa' | 'suspendida' | 'retirada';

/** Coincide con la tabla public.profiles */
export interface Profile {
  id: string; // = auth.users.id
  nombres: string | null;
  apellidos: string | null;
  tipo_documento: TipoDocumento | null;
  numero_documento: string | null;
  username: string | null;
  codigo_pais: string | null;
  numero_celular: string | null;
  foto_perfil: string;
  activo: boolean;
  perfil_completo: boolean;
  created_at: string;
  updated_at: string;
}

/** Coincide con la tabla public.organizaciones */
export interface Organizacion {
  id: string;
  slug: string;
  nombre: string;
  activo: boolean;
  /** NIT / CC / otro. Sirve para ubicar la organización; NO es una credencial. */
  identificacion?: string | null;
}

/** Coincide con la tabla public.roles */
export interface Rol {
  id: string;
  nombre: string;
  organizacion_id: string | null;
  descripcion: string | null;
}

/** Coincide con la tabla public.membresias */
export interface Membresia {
  id: string;
  usuario_id: string;
  organizacion_id: string;
  rol_id: string;
  estado_membresia: EstadoMembresia;
  fecha_ingreso: string;
  activo: boolean;
}

export interface RegistroCorreoInput {
  email: string;
  password: string;
  nombres: string;
  apellidos: string;
  username: string;
  tipo_documento: TipoDocumento;
  numero_documento: string;
  codigo_pais: string;
  numero_celular: string;
}

export interface CompletarPerfilInput {
  nombres: string;
  apellidos: string;
  tipo_documento: TipoDocumento;
  numero_documento: string;
  username: string;
  codigo_pais: string;
  numero_celular: string;
  foto_perfil?: File | null;
}

/** Estado de una invitación (la "vencida" se deduce de expira_en en la base). */
export type EstadoInvitacion = 'pendiente' | 'aceptada' | 'rechazada' | 'cancelada' | 'vencida';

/** Fila devuelta por la RPC listar_miembros (solo admin). */
export interface MiembroOrg {
  membresia_id: string;
  usuario_id: string;
  nombres: string | null;
  apellidos: string | null;
  email: string | null;
  tipo_documento: string | null;
  numero_documento: string | null;
  rol_id: string;
  rol_nombre: string;
  sede_id: string | null;
  sede_nombre: string | null;
  estado: EstadoMembresia;
  activo: boolean;
  fecha_ingreso: string;
}

/** Fila devuelta por la RPC listar_invitaciones (solo admin). */
export interface InvitacionOrg {
  id: string;
  email: string;
  rol_id: string;
  rol_nombre: string;
  sede_nombre: string | null;
  estado: EstadoInvitacion;
  creada_en: string;
  expira_en: string;
  invitado_por_nombre: string | null;
}

/** Fila devuelta por la RPC listar_roles_org (solo admin). */
export interface RolAdmin {
  rol_id: string;
  nombre: string;
  descripcion: string | null;
  /** Roles del sistema (admin y viewer/Predeterminado): no se editan ni eliminan. */
  protegido: boolean;
  miembros: number;
  invitaciones_pendientes: number;
}

/** Fila devuelta por la RPC listar_permisos_org (solo admin). */
export interface PermisoRol {
  rol_id: string;
  modulo_id: string;
  puede_ver: boolean;
  puede_crear: boolean;
  puede_editar: boolean;
  puede_eliminar: boolean;
}

export interface ModuloOpt {
  id: string;
  nombre: string;
  descripcion: string | null;
}

/** Fila devuelta por la RPC listar_sedes_org (solo admin). */
export interface SedeAdmin {
  sede_id: string;
  nombre: string;
  ciudad: string | null;
  miembros: number;
  creada_en: string;
}

/** Fila devuelta por la RPC listar_auditoria (solo admin). */
export interface AuditoriaItem {
  id: number;
  fecha: string;
  usuario: string;
  accion: string;
  descripcion: string;
}
