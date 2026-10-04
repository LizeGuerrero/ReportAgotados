import { AuthShell } from '@/components/auth/AuthShell';
import { CrearOrganizacionForm } from '@/components/organizaciones/CrearOrganizacionForm';

export const metadata = { title: 'Crear organización' };

// El proxy ya exige sesión y perfil completo; la creación en sí la valida la base de datos.
export default function CrearOrganizacionPage() {
  return (
    <AuthShell
      titulo="Crea tu organización"
      subtitulo="Serás su administrador: desde allí podrás invitar personas y asignarles roles."
    >
      <CrearOrganizacionForm />
    </AuthShell>
  );
}
