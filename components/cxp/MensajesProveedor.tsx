'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CONFIG_POR_DEFECTO,
  agruparPorProveedor,
  armarMensaje,
  configValida,
  enlaceWhatsApp,
  normalizarTelefono,
  type ConfigMensaje,
} from '@/lib/cxp/mensaje';
import { fechaCorta, hoyIso, moneda, type FilaCxp } from './tipos';

interface Contacto {
  tercero: string;
  nombre: string;
  telefono: string | null;
  contacto: string | null;
}

/**
 * Mensajes de WhatsApp para los proveedores: uno por proveedor, con las facturas pagadas.
 * Se puede editar el texto y el teléfono antes de abrir WhatsApp o copiar.
 */
export default function MensajesProveedor({
  supabase,
  organizacionId,
  filas,
  empresa,
  usuario,
  onCerrar,
}: {
  supabase: SupabaseClient;
  organizacionId: string;
  filas: FilaCxp[];
  empresa: string;
  usuario: string;
  onCerrar: () => void;
}) {
  const grupos = useMemo(() => agruparPorProveedor(filas), [filas]);
  const [cfg, setCfg] = useState<ConfigMensaje | null>(null);
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [telefonos, setTelefonos] = useState<Record<string, string>>({});
  const [contactos, setContactos] = useState<Record<string, Contacto>>({});
  const [enviados, setEnviados] = useState<Set<string>>(new Set());
  const [copiado, setCopiado] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onCerrar]);

  // Carga la plantilla de la organización y los teléfonos del módulo Proveedores.
  useEffect(() => {
    let vivo = true;
    (async () => {
      const terceros = Array.from(new Set(grupos.map((g) => g.tercero).filter((t): t is string => !!t)));
      const [conf, cont] = await Promise.all([
        supabase.rpc('cxp_config_obtener', { p_org: organizacionId, p_clave: 'mensaje_proveedor' }),
        terceros.length > 0
          ? supabase.rpc('cxp_contactos_proveedores', { p_org: organizacionId, p_terceros: terceros })
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (!vivo) return;
      if (conf.error) setError(conf.error.message);
      const config = configValida(conf.data ?? CONFIG_POR_DEFECTO);
      const mapa: Record<string, Contacto> = {};
      for (const c of (cont.data ?? []) as Contacto[]) mapa[c.tercero] = c;
      const ctx = { empresa, usuario, fecha: fechaCorta(hoyIso()) };
      const t: Record<string, string> = {};
      const tel: Record<string, string> = {};
      for (const g of grupos) {
        t[g.clave] = armarMensaje(config, g, ctx);
        tel[g.clave] = (g.tercero && mapa[g.tercero]?.telefono) || '';
      }
      setCfg(config);
      setContactos(mapa);
      setTextos(t);
      setTelefonos(tel);
    })();
    return () => {
      vivo = false;
    };
  }, [supabase, organizacionId, grupos, empresa, usuario]);

  async function copiar(clave: string) {
    const texto = textos[clave] ?? '';
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      const el = document.createElement('textarea');
      el.value = texto;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopiado(clave);
    setTimeout(() => setCopiado((c) => (c === clave ? '' : c)), 2500);
  }

  function abrirWhatsApp(clave: string) {
    const tel = normalizarTelefono(telefonos[clave], cfg?.indicativo ?? '57');
    window.open(enlaceWhatsApp(tel, textos[clave] ?? ''), '_blank', 'noopener,noreferrer');
    setEnviados((s) => new Set(s).add(clave));
  }

  return (
    <div className="cxp-modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="cxp-modal__card cxp-modal__card--ancha" role="dialog" aria-modal="true" aria-labelledby="cxp-msg-titulo">
        <h2 id="cxp-msg-titulo" className="cxp-modal__title">Mensajes para los proveedores</h2>
        <p className="ui-hint">
          Un mensaje por proveedor con los números de factura. Puedes corregir el texto y el teléfono antes de enviarlo.
          Se abre WhatsApp con el mensaje ya escrito; solo falta darle enviar.
        </p>

        {error && <p className="ui-alert ui-alert--error" role="alert">{error}</p>}
        {!cfg && !error && <p className="ui-hint" role="status">Armando los mensajes…</p>}

        {cfg && (
          <div className="cxp-msg__lista">
            {grupos.map((g) => {
              const tel = normalizarTelefono(telefonos[g.clave], cfg.indicativo);
              const contacto = g.tercero ? contactos[g.tercero] : undefined;
              const enviado = enviados.has(g.clave);
              return (
                <section key={g.clave} className={enviado ? 'cxp-msg__tarjeta is-enviado' : 'cxp-msg__tarjeta'}>
                  <header className="cxp-msg__cab">
                    <strong>{g.nombre}</strong>
                    <span>{g.docs.length} factura(s) · {moneda(g.total)}</span>
                    {enviado && <span className="ui-badge ui-badge--success">Abierto en WhatsApp</span>}
                  </header>

                  <div className="ui-field">
                    <label className="ui-label" htmlFor={`tel-${g.clave}`}>
                      WhatsApp del proveedor{contacto?.contacto ? ` (contacto: ${contacto.contacto})` : ''}
                    </label>
                    <input
                      id={`tel-${g.clave}`}
                      className="ui-input"
                      inputMode="tel"
                      value={telefonos[g.clave] ?? ''}
                      placeholder="300 123 4567"
                      onChange={(e) => setTelefonos((t) => ({ ...t, [g.clave]: e.target.value }))}
                    />
                    <p className="ui-hint">
                      {tel
                        ? `Se enviará al +${tel}.`
                        : 'Sin teléfono válido: WhatsApp te dejará elegir el contacto. (Puedes guardar el teléfono en el módulo Proveedores.)'}
                    </p>
                  </div>

                  <div className="ui-field">
                    <label className="ui-label" htmlFor={`msg-${g.clave}`}>Mensaje</label>
                    <textarea
                      id={`msg-${g.clave}`}
                      className="ui-input cxp-msg__texto"
                      rows={Math.min(14, 5 + g.docs.length + 4)}
                      value={textos[g.clave] ?? ''}
                      onChange={(e) => setTextos((t) => ({ ...t, [g.clave]: e.target.value }))}
                    />
                  </div>

                  <div className="cxp-msg__acciones">
                    <button type="button" className="ui-btn cxp-btn-grande" onClick={() => copiar(g.clave)}>
                      {copiado === g.clave ? '¡Copiado!' : 'Copiar mensaje'}
                    </button>
                    <button type="button" className="ui-btn ui-btn--primary cxp-btn-grande" onClick={() => abrirWhatsApp(g.clave)} disabled={!(textos[g.clave] ?? '').trim()}>
                      Abrir WhatsApp
                    </button>
                  </div>
                </section>
              );
            })}
          </div>
        )}

        <div className="cxp-modal__acciones">
          <button type="button" className="ui-btn cxp-btn-grande" onClick={onCerrar}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
