import { createClient } from '@/lib/supabase/server';
import { CompleteProfileForm } from '@/components/CompleteProfileForm';

export default async function CompletarPerfilPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('nombres, apellidos, foto_perfil')
    .eq('id', user!.id)
    .single();

  return (
    <CompleteProfileForm
      userId={user!.id}
      nombresIniciales={profile?.nombres ?? ''}
      apellidosIniciales={profile?.apellidos ?? ''}
    />
  );
}
