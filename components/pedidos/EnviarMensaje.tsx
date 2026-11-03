'use client';

import { useState } from 'react';
import { enlaceWhatsApp, normalizarTelefono } from '@/lib/cxp/mensaje';
import { copiarTexto } from '@/components/pedidos/ui';

/**
 * Del mensaje al proveedor en un clic: copiar, abrir WhatsApp (con su WhatsApp, o su teléfono si no tiene)
 * o abrir el correo. El contacto (asesor comercial) y estos datos se guardan en el módulo Proveedores.
 */
export default function EnviarMensaje({
  texto, asunto, contacto, whatsapp, telefono, correo, alEnviar, deshabilitado = false,
}: {
  texto: string; asunto: string; contacto: string | null; whatsapp: string | null; telefono: string | null; correo: string | null;
  /** Se llama cuando se abre WhatsApp o el correo (p. ej. para marcar la cotización como pedida). */
  alEnviar?: () => void; deshabilitado?: boolean;
}) {
  const [aviso, setAviso] = useState('');
  const numero = normalizarTelefono(whatsapp || telefono, '57');
  const vacio = texto.trim() === '';
  return (
    <div className="mod-flex mod-gap-2 mod-center mod-wrap">
      <button type="button" className="ui-btn ui-btn--sm" disabled={vacio} onClick={async () => setAviso((await copiarTexto(texto)) ? 'Mensaje copiado' : 'No se pudo copiar')}>Copiar</button>
      <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" disabled={vacio || deshabilitado || !numero}
        title={numero ? `Abre WhatsApp con ${contacto ?? 'el proveedor'}${whatsapp ? '' : ' (usa su teléfono: no tiene WhatsApp registrado)'}` : 'El proveedor no tiene WhatsApp ni teléfono: agrégalo en el módulo Proveedores'}
        onClick={() => { window.open(enlaceWhatsApp(numero, texto), '_blank', 'noopener'); alEnviar?.(); }}>
        Enviar por WhatsApp
      </button>
      <button type="button" className="ui-btn ui-btn--sm" disabled={vacio || deshabilitado || !correo}
        title={correo ? `Abre el correo para ${correo}` : 'El proveedor no tiene correo registrado'}
        onClick={() => { window.location.href = `mailto:${correo}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(texto)}`; alEnviar?.(); }}>
        Enviar por correo
      </button>
      {contacto && <span className="mod-sub">Para: {contacto}</span>}
      {!numero && !correo && <span className="mod-sub">Sin WhatsApp, teléfono ni correo registrados.</span>}
      {aviso && <span className="mod-sub">{aviso}</span>}
    </div>
  );
}
