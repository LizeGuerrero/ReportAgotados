import { NoAutorizado } from '@/components/app/NoAutorizado';
import { nombreModulo } from '@/lib/modulos';

export const metadata = { title: 'Sin autorización' };

// El proxy reescribe aquí (sin cambiar la URL) cuando alguien entra a un módulo sin permiso.
// El nombre del módulo sale de una lista fija, nunca del texto de la URL.
export default async function NoAutorizadoPage({
  searchParams,
}: {
  searchParams: Promise<{ modulo?: string | string[] }>;
}) {
  const { modulo } = await searchParams;
  const clave = typeof modulo === 'string' ? modulo : '';
  return <NoAutorizado modulo={nombreModulo(clave)} />;
}
