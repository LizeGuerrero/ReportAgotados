import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ProveedoresMaestro from '@/components/proveedores/ProveedoresMaestro';

export const metadata = { title: 'Proveedores' };

// El acceso lo valida proxy.ts (permiso "ver" de Proveedores) y cada RPC lo vuelve a exigir en la BD.
export default async function ProveedoresPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: organizacion } = await supabase
    .from('organizaciones')
    .select('id, nombre')
    .eq('slug', slug)
    .maybeSingle();

  if (!organizacion) notFound();

  return (
    <main className="mod-page">
      <div className="mod-head">
        <h1 className="mod-title">Proveedores</h1>
      </div>
      <ProveedoresMaestro organizacionId={organizacion.id} />
    </main>
  );
}
