'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  agruparPorProveedor,
  armarDescripcionErp,
  armarMensaje,
  configValida,
  normalizarTelefono,
  type ConfigMensaje,
} from '@/lib/cxp/mensaje';
import {
  CLIENTES_CORREO, CLIENTES_WHATSAPP, abrirCorreo, abrirWhatsApp, leerClienteCorreo, leerClienteWhatsApp, type ClienteCorreo, type ClienteWhatsApp,
} from '@/lib/mensajes/enviar';
import { cargarPreferenciasEnvio, recordarClienteCorreo, recordarClienteWhatsApp } from '@/lib/mensajes/preferencias';
import { fechaCorta, hoyIso, moneda, type FilaCxp } from './tipos';

interface Estructura { id: string; nombre: string; cfg: ConfigMensaje }
interface InfoProveedor {
  tercero: string; proveedor_id: number | null; estructura_id: string; origen: string;
  vars: Record<string, string> | null; telefono: string | null; whatsapp: string | null; correo: string | null; contacto: string | null;
}
interface Datos { estructuras: Estructura[]; predeterminada_org: string; proveedores: InfoProveedor[] }

const normTercero = (t: string | null) => (t ?? '').toUpperCase().replace(/[\s.]/g, '');

/**
 * Mensajes para los proveedores a los que se pagó: uno por proveedor, con las facturas pagadas.
 * Usa la estructura asignada al proveedor (o la predeterminada de la organización); se puede cambiar en el momento,
 * corregir el texto y el teléfono, y enviar por WhatsApp o por correo (Gmail por defecto).
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
  const [datos, setDatos] = useState<Datos | null>(null);
  const [estructuraSel, setEstructuraSel] = useState<Record<string, string>>({});
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [erps, setErps] = useState<Record<string, string>>({});
  const [editados, setEditados] = useState<Set<string>>(new Set());
  const [telefonos, setTelefonos] = useState<Record<string, string>>({});
  const [correos, setCorreos] = useState<Record<string, string>>({});
  const [enviados, setEnviados] = useState<Set<string>>(new Set());
  const [copiado, setCopiado] = useState('');
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');
  const [cliente, setCliente] = useState<ClienteCorreo>('gmail');
  const [clienteWa, setClienteWa] = useState<ClienteWhatsApp>('web');

  useEffect(() => {
    setCliente(leerClienteCorreo()); setClienteWa(leerClienteWhatsApp());      // al instante, desde este navegador
    void cargarPreferenciasEnvio().then((p) => { if (p.correo) setCliente(p.correo); if (p.whatsapp) setClienteWa(p.whatsapp); }); // y la de la cuenta
  }, []);
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onCerrar]);

  const ctx = useMemo(() => ({ empresa, usuario, fecha: fechaCorta(hoyIso()) }), [empresa, usuario]);
  const infoDe = (d: Datos, tercero: string | null) => d.proveedores.find((p) => p.tercero === normTercero(tercero));
  const estructuraDe = (d: Datos, id: string): Estructura => d.estructuras.find((e) => e.id === id) ?? d.estructuras[0];

  // Carga estructuras + datos reales de los proveedores (contacto, WhatsApp, correo…) desde la base
  useEffect(() => {
    let vivo = true;
    (async () => {
      const terceros = Array.from(new Set(grupos.map((g) => g.tercero).filter((t): t is string => !!t)));
      const { data, error: e } = await supabase.rpc('cxp_mensaje_datos', { p_org: organizacionId, p_terceros: terceros });
      if (!vivo) return;
      if (e) { setError(e.message); return; }
      const d = data as Datos;
      d.estructuras = d.estructuras.map((x) => ({ ...x, cfg: configValida(x.cfg) }));
      const sel: Record<string, string> = {}; const t: Record<string, string> = {}; const er: Record<string, string> = {}; const tel: Record<string, string> = {}; const cor: Record<string, string> = {};
      for (const g of grupos) {
        const info = infoDe(d, g.tercero);
        const id = info?.estructura_id ?? d.predeterminada_org;
        sel[g.clave] = d.estructuras.some((x) => x.id === id) ? id : 'estandar';
        t[g.clave] = armarMensaje(estructuraDe(d, sel[g.clave]).cfg, g, { ...ctx, vars: info?.vars });
        er[g.clave] = armarDescripcionErp(estructuraDe(d, sel[g.clave]).cfg, g, { ...ctx, vars: info?.vars });
        tel[g.clave] = info?.whatsapp || info?.telefono || '';
        cor[g.clave] = info?.correo || '';
      }
      setDatos(d); setEstructuraSel(sel); setTextos(t); setErps(er); setTelefonos(tel); setCorreos(cor);
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, organizacionId, grupos, ctx]);

  function cambiarEstructura(clave: string, id: string) {
    if (!datos) return;
    if ((editados.has(clave) || editados.has(`erp:${clave}`)) && !window.confirm('Cambiar la estructura reemplaza el texto que corregiste a mano. ¿Continuar?')) return;
    const g = grupos.find((x) => x.clave === clave);
    if (!g) return;
    const info = infoDe(datos, g.tercero);
    setEstructuraSel((s) => ({ ...s, [clave]: id }));
    setTextos((t) => ({ ...t, [clave]: armarMensaje(estructuraDe(datos, id).cfg, g, { ...ctx, vars: info?.vars }) }));
    setErps((t) => ({ ...t, [clave]: armarDescripcionErp(estructuraDe(datos, id).cfg, g, { ...ctx, vars: info?.vars }) }));
    setEditados((s) => { const n = new Set(s); n.delete(clave); n.delete(`erp:${clave}`); return n; });
  }

  async function dejarPredeterminada(proveedorId: number, id: string) {
    setError('');
    const { error: e } = await supabase.rpc('mensaje_proveedor_fijar', { p_org: organizacionId, p_proveedor: proveedorId, p_tipo: 'cxp_pago', p_estructura: id });
    if (e) { setError(e.message); return; }
    setDatos((d) => d && ({ ...d, proveedores: d.proveedores.map((p) => (p.proveedor_id === proveedorId ? { ...p, estructura_id: id, origen: 'proveedor' } : p)) }));
    setAviso('Listo: esa estructura quedó como la predeterminada de este proveedor.');
  }

  async function copiarValor(id: string, texto: string) {
    try { await navigator.clipboard.writeText(texto); } catch {
      const el = document.createElement('textarea'); el.value = texto; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el);
    }
    setCopiado(id);
    setTimeout(() => setCopiado((c) => (c === id ? '' : c)), 2500);
  }

  const marcar = (clave: string) => setEnviados((s) => new Set(s).add(clave));

  function abrirWhatsAppDe(clave: string) {
    const ind = datos ? estructuraDe(datos, estructuraSel[clave]).cfg.indicativo : '57';
    const r = abrirWhatsApp(clienteWa, normalizarTelefono(telefonos[clave], ind), textos[clave] ?? '');
    if (r.recortado) setAviso('El mensaje es largo: ya está copiado, pégalo en el chat.');
    marcar(clave);
  }

  function enviarCorreo(clave: string, c: ClienteCorreo) {
    const r = abrirCorreo(c, { para: correos[clave] ?? '', asunto: `Aviso de pago · ${empresa}`, cuerpo: textos[clave] ?? '' });
    if (r.recortado) setAviso('El mensaje es largo: ya está copiado, pégalo en el cuerpo del correo.');
    marcar(clave);
  }

  const nombreCliente = CLIENTES_CORREO.find((c) => c.valor === cliente)?.texto ?? 'Gmail';

  return (
    <div className="cxp-modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="cxp-modal__card cxp-modal__card--ancha" role="dialog" aria-modal="true" aria-labelledby="cxp-msg-titulo">
        <h2 id="cxp-msg-titulo" className="cxp-modal__title">Mensajes para los proveedores</h2>
        <p className="ui-hint">
          Un mensaje por proveedor con los números de factura. Se arma con la estructura de «Mensajes» asignada a cada uno y con sus datos
          (asesor, WhatsApp, correo). Puedes corregir el texto y los datos de contacto antes de enviar.
        </p>

        {error && <p className="ui-alert ui-alert--error" role="alert">{error}</p>}
        {aviso && <p className="ui-alert" role="status">{aviso}</p>}
        {!datos && !error && <p className="ui-hint" role="status">Armando los mensajes…</p>}

        {datos && (
          <div className="cxp-msg__lista">
            {grupos.map((g) => {
              const info = infoDe(datos, g.tercero);
              const sel = estructuraSel[g.clave] ?? 'estandar';
              const cfg = estructuraDe(datos, sel).cfg;
              const tel = normalizarTelefono(telefonos[g.clave], cfg.indicativo);
              const enviado = enviados.has(g.clave);
              const sinCorreo = !(correos[g.clave] ?? '').trim() || !(textos[g.clave] ?? '').trim();
              const contacto = info?.contacto;
              return (
                <section key={g.clave} className={enviado ? 'cxp-msg__tarjeta is-enviado' : 'cxp-msg__tarjeta'}>
                  <header className="cxp-msg__cab">
                    <strong>{g.nombre}</strong>
                    <span>{g.docs.length} factura(s) · {moneda(g.total)}</span>
                    {enviado && <span className="ui-badge ui-badge--success">Abierto</span>}
                  </header>

                  <div className="ui-field">
                    <label className="ui-label" htmlFor={`est-${g.clave}`}>Estructura del mensaje</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <select id={`est-${g.clave}`} className="ui-input" style={{ width: 'auto' }} value={sel} onChange={(e) => cambiarEstructura(g.clave, e.target.value)}>
                        {datos.estructuras.map((x) => <option key={x.id} value={x.id}>{x.nombre}{x.id === (info?.estructura_id ?? datos.predeterminada_org) ? ' · predeterminada' : ''}</option>)}
                      </select>
                      {info?.proveedor_id != null && sel !== (info.estructura_id) && (
                        <button type="button" className="ui-btn ui-btn--sm" onClick={() => dejarPredeterminada(info.proveedor_id as number, sel)}>Dejar como predeterminada de este proveedor</button>
                      )}
                    </div>
                    {!info?.proveedor_id && <p className="ui-hint">Este proveedor no está en el módulo Proveedores: se usa la estructura de la organización y solo los datos del pago.</p>}
                  </div>

                  <div className="ui-field">
                    <label className="ui-label" htmlFor={`tel-${g.clave}`}>
                      WhatsApp del proveedor{contacto ? ` (asesor: ${contacto})` : ''}
                    </label>
                    <input id={`tel-${g.clave}`} className="ui-input" inputMode="tel" value={telefonos[g.clave] ?? ''} placeholder="300 123 4567"
                      onChange={(e) => setTelefonos((t) => ({ ...t, [g.clave]: e.target.value }))} />
                    <p className="ui-hint">
                      {tel ? `Se enviará al +${tel}${info?.whatsapp ? '.' : ' (su teléfono: no tiene WhatsApp registrado).'}`
                        : 'Sin teléfono válido: WhatsApp te dejará elegir el contacto. (Puedes guardarlo en el módulo Proveedores.)'}
                    </p>
                  </div>

                  <div className="ui-field">
                    <label className="ui-label" htmlFor={`cor-${g.clave}`}>Correo del proveedor</label>
                    <input id={`cor-${g.clave}`} className="ui-input" type="email" inputMode="email" value={correos[g.clave] ?? ''} placeholder="ventas@proveedor.com"
                      onChange={(e) => setCorreos((t) => ({ ...t, [g.clave]: e.target.value }))} />
                  </div>

                  <div className="ui-field">
                    <label className="ui-label" htmlFor={`msg-${g.clave}`}>Mensaje</label>
                    <textarea id={`msg-${g.clave}`} className="ui-input cxp-msg__texto" rows={Math.min(14, 5 + g.docs.length + 4)} value={textos[g.clave] ?? ''}
                      onChange={(e) => { setTextos((t) => ({ ...t, [g.clave]: e.target.value })); setEditados((s) => new Set(s).add(g.clave)); }} />
                  </div>

                  <div className="cxp-msg__acciones">
                    <button type="button" className="ui-btn cxp-btn-grande" onClick={() => copiarValor(g.clave, textos[g.clave] ?? '')}>{copiado === g.clave ? '¡Copiado!' : 'Copiar mensaje'}</button>
                    <button type="button" className="ui-btn ui-btn--primary cxp-btn-grande" onClick={() => abrirWhatsAppDe(g.clave)} disabled={!(textos[g.clave] ?? '').trim()}
                      title={`Abre el chat directo en ${CLIENTES_WHATSAPP.find((c) => c.valor === clienteWa)?.texto ?? 'WhatsApp'}`}>Abrir WhatsApp</button>
                    <select className="ui-input" style={{ width: 'auto' }} aria-label="Con qué abrir WhatsApp" value={clienteWa}
                      onChange={(e) => { const c = e.target.value as ClienteWhatsApp; setClienteWa(c); recordarClienteWhatsApp(c); }}>
                      {CLIENTES_WHATSAPP.map((c) => <option key={c.valor} value={c.valor}>{c.texto}</option>)}
                    </select>
                    <button type="button" className="ui-btn cxp-btn-grande" disabled={sinCorreo} onClick={() => enviarCorreo(g.clave, cliente)}
                      title={sinCorreo ? 'Escribe el correo del proveedor' : `Abre ${nombreCliente} con el mensaje listo`}>Enviar por {nombreCliente}</button>
                    <select className="ui-input" style={{ width: 'auto' }} aria-label="Con qué abrir el correo" value={cliente}
                      onChange={(e) => { const c = e.target.value as ClienteCorreo; setCliente(c); recordarClienteCorreo(c); }}>
                      {CLIENTES_CORREO.map((c) => <option key={c.valor} value={c.valor}>{c.texto}</option>)}
                    </select>
                  </div>

                  {cfg.erp_plantilla.trim() !== '' && (
                    <div className="ui-field" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--color-border)' }}>
                      <label className="ui-label" htmlFor={`erp-${g.clave}`}>Descripción para el ERP</label>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <input id={`erp-${g.clave}`} className="ui-input" style={{ flex: '1 1 320px', width: 'auto' }} value={erps[g.clave] ?? ''}
                          onChange={(e) => { setErps((t) => ({ ...t, [g.clave]: e.target.value })); setEditados((s) => new Set(s).add(`erp:${g.clave}`)); }} />
                        <button type="button" className="ui-btn cxp-btn-grande" disabled={!(erps[g.clave] ?? '').trim()} onClick={() => copiarValor(`erp:${g.clave}`, erps[g.clave] ?? '')}>
                          {copiado === `erp:${g.clave}` ? '¡Copiado!' : 'Copiar descripción'}
                        </button>
                      </div>
                      <p className="ui-hint">{(erps[g.clave] ?? '').length} caracteres · para pegar en la descripción del pago en el ERP. Su formato se configura en Mensajes → Aviso de pago.</p>
                    </div>
                  )}
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
