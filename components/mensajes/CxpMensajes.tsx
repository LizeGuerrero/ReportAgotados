'use client';

import '@/styles/mensajes.css';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Workspace from './Workspace';

/** Aviso de pago de Cuentas por pagar: mismo espacio de trabajo que Pedidos; el permiso de edición es el de «Mensajes al proveedor». */
export default function CxpMensajes({
  organizacionId, empresa, usuario, onSucio,
}: { organizacionId: string; empresa: string; usuario: string; onSucio?: (s: boolean) => void }) {
  const [supabase] = useState(() => createClient());
  const [puedeEditar, setPuedeEditar] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.rpc('tiene_permiso', { p_organizacion_id: organizacionId, p_modulo: 'cxp_mensajes', p_accion: 'editar' })
      .then(({ data }) => setPuedeEditar(data === true));
  }, [supabase, organizacionId]);

  if (puedeEditar === null) return <p className="msj-sub">Cargando…</p>;
  return <Workspace organizacionId={organizacionId} tipo="cxp_pago" puedeEditar={puedeEditar} empresa={empresa} usuario={usuario} onSucio={onSucio} />;
}
