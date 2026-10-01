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
