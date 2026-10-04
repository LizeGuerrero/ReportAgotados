export interface RolOpt {
  id: string;
  nombre: string;
}
export interface SedeOpt {
  id: string;
  nombre: string;
}

export const fmtFecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });

export const nombrePersona = (m: { nombres: string | null; apellidos: string | null }) =>
  [m.nombres, m.apellidos].filter(Boolean).join(' ') || 'Sin nombre';
