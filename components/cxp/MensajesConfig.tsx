'use client';

import '@/styles/mensajes.css';
import CxpMensajes from '@/components/mensajes/CxpMensajes';

/**
 * Pantalla «Cuentas por pagar → Mensajes». Usa el mismo espacio de trabajo que el módulo Mensajes (estructuras
 * independientes, variables del proveedor, asignación por proveedor): ya no hay un sistema aparte.
 */
export default function MensajesConfig({ organizacionId, empresa, usuario }: { organizacionId: string; empresa: string; usuario: string }) {
  return (
    <div className="msj">
      <CxpMensajes organizacionId={organizacionId} empresa={empresa} usuario={usuario} />
    </div>
  );
}
