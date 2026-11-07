'use client';

import { useEffect, useState } from 'react';
import { normalizarTelefono } from '@/lib/cxp/mensaje';
import {
  CLIENTES_CORREO, CLIENTES_WHATSAPP, abrirCorreo, abrirWhatsApp, leerClienteCorreo, leerClienteWhatsApp, type ClienteCorreo, type ClienteWhatsApp,
} from '@/lib/mensajes/enviar';
import { cargarPreferenciasEnvio, recordarClienteCorreo, recordarClienteWhatsApp } from '@/lib/mensajes/preferencias';
import { copiarTexto } from '@/components/pedidos/ui';

/**
 * Del mensaje al proveedor en un clic: copiar, abrir WhatsApp (con su WhatsApp, o su teléfono si no tiene)
 * o abrir el correo. El correo se abre en Gmail (web) con destinatario, asunto y mensaje ya escritos; en la
 * flecha se puede elegir Outlook web o la app de correo del equipo, y la elección se recuerda en la cuenta del usuario (cualquier equipo).
 * El contacto (asesor comercial) y estos datos se guardan en el módulo Proveedores.
 */
export default function EnviarMensaje({
  texto, asunto, contacto, whatsapp, telefono, correo, alEnviar, deshabilitado = false,
}: {
  texto: string; asunto: string; contacto: string | null; whatsapp: string | null; telefono: string | null; correo: string | null;
  /** Se llama cuando se abre WhatsApp o el correo (p. ej. para marcar la cotización como pedida). */
  alEnviar?: () => void; deshabilitado?: boolean;
}) {
  const [aviso, setAviso] = useState('');
  const [cliente, setCliente] = useState<ClienteCorreo>('gmail');
  const [menu, setMenu] = useState(false);
  const [clienteWa, setClienteWa] = useState<ClienteWhatsApp>('web');
  const [menuWa, setMenuWa] = useState(false);
  useEffect(() => {
    setCliente(leerClienteCorreo()); setClienteWa(leerClienteWhatsApp());      // al instante, desde este navegador
    void cargarPreferenciasEnvio().then((p) => { if (p.correo) setCliente(p.correo); if (p.whatsapp) setClienteWa(p.whatsapp); }); // y la de la cuenta
  }, []);

  const numero = normalizarTelefono(whatsapp || telefono, '57');
  const vacio = texto.trim() === '';
  const nombreCliente = CLIENTES_CORREO.find((c) => c.valor === cliente)?.texto ?? 'Gmail';
  const sinCorreo = vacio || deshabilitado || !correo;
  const nombreWa = CLIENTES_WHATSAPP.find((c) => c.valor === clienteWa)?.texto ?? 'WhatsApp';

  function enviarWhatsApp() {
    const r = abrirWhatsApp(clienteWa, numero, texto);
    setAviso(r.recortado ? 'El mensaje es largo: ya está copiado, pégalo en el chat.' : '');
    alEnviar?.();
  }

  function enviarCorreo(c: ClienteCorreo) {
    const r = abrirCorreo(c, { para: correo ?? '', asunto, cuerpo: texto });
    setAviso(r.recortado ? 'El mensaje es largo: ya está copiado, pégalo en el cuerpo del correo.' : '');
    alEnviar?.();
  }

  return (
    <div className="mod-flex mod-gap-2 mod-center mod-wrap">
      <button type="button" className="ui-btn ui-btn--sm" disabled={vacio} onClick={async () => setAviso((await copiarTexto(texto)) ? 'Mensaje copiado' : 'No se pudo copiar')}>Copiar</button>
      <span className="mod-flex" style={{ position: 'relative' }}>
        <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" disabled={vacio || deshabilitado || !numero} style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
          title={numero ? `Abre el chat con ${contacto ?? 'el proveedor'} directamente en ${nombreWa}${whatsapp ? '' : ' (usa su teléfono: no tiene WhatsApp registrado)'}` : 'El proveedor no tiene WhatsApp ni teléfono: agrégalo en el módulo Proveedores'}
          onClick={enviarWhatsApp}>
          Enviar por WhatsApp
        </button>
        <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" aria-label="Elegir con qué abrir WhatsApp" aria-haspopup="menu" aria-expanded={menuWa}
          style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, marginLeft: -1 }} onClick={() => setMenuWa((m) => !m)}>▾</button>
        {menuWa && (
          <div role="menu" style={{ position: 'absolute', top: '100%', left: 0, zIndex: 20, minWidth: 260, background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 8, boxShadow: 'var(--shadow-md)', padding: 4 }}>
            {CLIENTES_WHATSAPP.map((c) => (
              <button key={c.valor} type="button" role="menuitemradio" aria-checked={c.valor === clienteWa} className="ui-btn ui-btn--sm ui-btn--ghost"
                style={{ display: 'block', width: '100%', textAlign: 'left' }} title={c.ayuda}
                onClick={() => { setClienteWa(c.valor); recordarClienteWhatsApp(c.valor); setMenuWa(false); }}>
                {c.valor === clienteWa ? '✓ ' : ''}{c.texto}
              </button>
            ))}
          </div>
        )}
      </span>
      <span className="mod-flex" style={{ position: 'relative' }}>
        <button type="button" className="ui-btn ui-btn--sm" disabled={sinCorreo} style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
          title={correo ? `Abre ${nombreCliente} para ${correo}` : 'El proveedor no tiene correo registrado'}
          onClick={() => enviarCorreo(cliente)}>
          Enviar por {nombreCliente}
        </button>
        <button type="button" className="ui-btn ui-btn--sm" aria-label="Elegir con qué abrir el correo" aria-haspopup="menu" aria-expanded={menu}
          style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, marginLeft: -1 }} onClick={() => setMenu((m) => !m)}>▾</button>
        {menu && (
          <div role="menu" style={{ position: 'absolute', top: '100%', right: 0, zIndex: 20, minWidth: 240, background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)', borderRadius: 8, boxShadow: 'var(--shadow-md)', padding: 4 }}>
            {CLIENTES_CORREO.map((c) => (
              <button key={c.valor} type="button" role="menuitemradio" aria-checked={c.valor === cliente} className="ui-btn ui-btn--sm ui-btn--ghost"
                style={{ display: 'block', width: '100%', textAlign: 'left' }} title={c.ayuda}
                onClick={() => { setCliente(c.valor); recordarClienteCorreo(c.valor); setMenu(false); }}>
                {c.valor === cliente ? '✓ ' : ''}{c.texto}{c.valor === 'gmail' ? ' (recomendado)' : ''}
              </button>
            ))}
          </div>
        )}
      </span>
      {contacto && <span className="mod-sub">Para: {contacto}</span>}
      {!numero && !correo && <span className="mod-sub">Sin WhatsApp, teléfono ni correo registrados.</span>}
      {aviso && <span className="mod-sub">{aviso}</span>}
    </div>
  );
}
