'use client';

import { useRouter } from 'next/navigation';
import { descartarInvitacion } from '@/app/unirse/actions';

/** Cuando el enlace ya no sirve: lo olvida y devuelve al inicio. */
export function DescartarInvitacion() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="ui-btn ui-btn--primary ui-btn--block"
      onClick={async () => {
        await descartarInvitacion();
        router.replace('/');
        router.refresh();
      }}
    >
      Continuar
    </button>
  );
}
