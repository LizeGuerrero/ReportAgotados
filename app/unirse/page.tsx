import Link from 'next/link';
import { cookies } from 'next/headers';
import { AuthShell } from '@/components/auth/AuthShell';
import { createClient } from '@/lib/supabase/server';
import { InvitacionCard } from '@/components/organizaciones/InvitacionCard';
import { DescartarInvitacion } from '@/components/organizaciones/DescartarInvitacion';
import { SolicitarUnionForm } from '@/components/organizaciones/SolicitarUnionForm';

export const metadata = { title: 'Unirme a una organización' };

const FORMATO_TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

const MOTIVOS: Record<string, string> = {
  no_existe: 'El enlace de invitación no es válido.',
  vencida: 'La invitación venció. Pide al administrador que te envíe una nueva.',
  aceptada: 'Esta invitación ya fue utilizada.',
  rechazada: 'Esta invitación fue rechazada.',
  cancelada: 'El administrador canceló esta invitación.',
};

// Con ?invite=TOKEN (o la cookie que dejó el proxy) acepta una invitación; sin token permite
// solicitar el ingreso a una organización. El proxy ya exige sesión; si no hay, manda a /login
// conservando el token.
export default async function UnirsePage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string | string[] }>;
}) {
  const { invite } = await searchParams;
  const jar = await cookies();
  const candidato = (typeof invite === 'string' ? invite : undefined) ?? jar.get('invite_token')?.value;
  const token = candidato && FORMATO_TOKEN.test(candidato) ? candidato : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (token) {
    const { data } = await supabase.rpc('info_invitacion', { p_token: token });
    const fila = (Array.isArray(data) ? data[0] : null) as
      | { organizacion: string | null; email: string | null; valida: boolean; motivo: string | null }
      | null;

    if (fila?.valida && fila.organizacion && fila.email) {
      return (
        <AuthShell titulo="Invitación a una organización" subtitulo="Revisa los datos y acepta para unirte.">
          <InvitacionCard
            token={token}
            organizacion={fila.organizacion}
            emailInvitado={fila.email}
            emailSesion={user?.email ?? ''}
          />
        </AuthShell>
      );
    }

    return (
      <AuthShell titulo="Invitación no disponible" subtitulo={MOTIVOS[fila?.motivo ?? 'no_existe'] ?? MOTIVOS.no_existe}>
        <DescartarInvitacion />
      </AuthShell>
    );
  }

  const { data: solicitudes } = await supabase.rpc('mis_solicitudes');
  const pendientes = (solicitudes ?? []) as { organizacion: string }[];

  return (
    <AuthShell
      titulo="Únete a una organización"
      subtitulo="Escribe la identificación de la organización para enviar tu solicitud."
    >
      {pendientes.length > 0 && (
        <div className="org-aviso" role="status">
          {pendientes.map((s) => (
            <p key={s.organizacion}>
              Solicitud pendiente en <strong>{s.organizacion}</strong>.
            </p>
          ))}
        </div>
      )}
      <SolicitarUnionForm />
      <p className="auth-switch">
        ¿Prefieres crear la tuya?{' '}
        <Link href="/crear-organizacion" className="ui-link">
          Crear una organización
        </Link>
        {' · '}
        <Link href="/" className="ui-link">
          Volver
        </Link>
      </p>
    </AuthShell>
  );
}
