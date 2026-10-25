'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Tipo = 'solicitud_cotizacion' | 'orden_compra';

const TIPOS: { valor: Tipo; texto: string; ayuda: string; plural: string }[] = [
  { valor: 'solicitud_cotizacion', texto: 'Solicitud de cotización', plural: 'solicitudes de cotización', ayuda: 'Lo que se envía al proveedor para pedirle precio y disponibilidad.' },
  { valor: 'orden_compra', texto: 'Orden de compra', plural: 'órdenes de compra', ayuda: 'Lo que se envía al proveedor para confirmarle lo que se le compra.' },
];

const AMBITOS: { valor: string; texto: string; ayuda: string }[] = [
  { valor: 'encabezado', texto: 'Encabezado del mensaje', ayuda: 'Datos generales, una línea por campo, debajo del título.' },
  { valor: 'linea', texto: 'Datos de cada producto', ayuda: 'Se arma una línea por producto con los campos que dejes visibles, en este orden.' },
  { valor: 'pie', texto: 'Pie del mensaje', ayuda: 'Totales al final del mensaje.' },
];

interface Campo {
  clave: string; ambito: string; etiqueta: string; etiqueta_defecto: string; orden: number; visible: boolean;
  destino: 'proveedor' | 'interno'; permite_proveedor: boolean;
}
interface Config { encabezado: string; introduccion: string; pie: string; campos: Campo[]; personalizada: boolean }
interface Variante { id: string; nombre: string; proveedores: number }
interface Lista { variantes: Variante[]; predeterminada_org: string | null; estandar_proveedores: number }
interface ProvFila { proveedor_id: number; nombre: string; estructura_id: string; estructura_nombre: string; origen: string }

const DESTINOS = [
  { valor: 'proveedor', texto: 'Proveedor y copia interna' },
  { valor: 'interno', texto: 'Solo copia interna' },
];
const ESTANDAR = 'estandar';

/**
 * Estructuras de los mensajes que Pedidos genera, como las firmas de un correo: la "Estándar" y las que se crean
 * con nombre ("Corta para WhatsApp", "Formal con condiciones"…). Se elige cuál es la predeterminada de la
 * organización y cuál usa cada proveedor; al generar un mensaje se puede cambiar en ese momento. Las estructuras
 * con nombre heredan de la Estándar y solo guardan lo que cambian. Por cada una se decide qué campos aparecen,
 * en qué orden, con qué título y cuáles ve el proveedor: el texto se arma en la base de datos con esta configuración
 * y los datos estrictamente internos no se pueden enviar al proveedor.
 */
export default function EstructurasMensajes({ organizacionId, puedeEditar }: { organizacionId: string; puedeEditar: boolean }) {
  const [supabase] = useState(() => createClient());
  const [tipo, setTipo] = useState<Tipo>('solicitud_cotizacion');
  const [sel, setSel] = useState<string>(ESTANDAR);
  const [lista, setLista] = useState<Lista | null>(null);
  const [baseCfg, setBaseCfg] = useState<Config | null>(null);
  const [cargada, setCargada] = useState<Config | null>(null);
  const [borrador, setBorrador] = useState<Config | null>(null);
  const [provs, setProvs] = useState<ProvFila[]>([]);
  const [buscar, setBuscar] = useState('');
  const [nueva, setNueva] = useState<{ nombre: string; copiarDe: string } | null>(null);
  const [renombrando, setRenombrando] = useState<{ id: string; texto: string } | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [previa, setPrevia] = useState({ proveedor: '', interno: '' });

  const variantes = lista?.variantes ?? [];
  const esBase = sel === ESTANDAR;
  const nombreSel = esBase ? 'Estándar' : (variantes.find((v) => v.id === sel)?.nombre ?? 'Estándar');
  const info = TIPOS.find((t) => t.valor === tipo)!;

  const fallo = (e: { message: string } | null) => { if (e) { setError(e.message); return true; } return false; };

  const cargarLista = useCallback(async () => {
    const [l, b] = await Promise.all([
      supabase.rpc('mensaje_estructuras', { p_org: organizacionId, p_tipo: tipo }),
      supabase.rpc('mensaje_estructura_config', { p_org: organizacionId, p_tipo: tipo, p_variante: null }),
    ]);
    if (fallo(l.error) || fallo(b.error)) return;
    setLista(l.data as Lista);
    setBaseCfg(b.data as Config);
  }, [supabase, organizacionId, tipo]);

  const cargarProveedores = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('mensaje_proveedores_listar', { p_org: organizacionId, p_tipo: tipo, p_busqueda: buscar.trim() || null, p_limit: 100 });
    if (!fallo(e)) setProvs((data ?? []) as ProvFila[]);
  }, [supabase, organizacionId, tipo, buscar]);

  const cargarEditor = useCallback(async () => {
    setError('');
    const { data, error: e } = await supabase.rpc('mensaje_estructura_config', { p_org: organizacionId, p_tipo: tipo, p_variante: esBase ? null : sel });
    if (fallo(e)) return;
    setCargada(data as Config);
    setBorrador(data as Config);
  }, [supabase, organizacionId, tipo, sel, esBase]);

  useEffect(() => { setError(''); cargarLista(); }, [cargarLista]);
  useEffect(() => { const t = setTimeout(cargarProveedores, 250); return () => clearTimeout(t); }, [cargarProveedores]);
  useEffect(() => { setCargada(null); setBorrador(null); setAviso(''); cargarEditor(); }, [cargarEditor]);

  const payload = useMemo(() => borrador && {
    encabezado: borrador.encabezado, introduccion: borrador.introduccion, pie: borrador.pie,
    campos: borrador.campos.map((c) => ({ clave: c.clave, etiqueta: c.etiqueta, orden: c.orden, visible: c.visible, destino: c.destino })),
  }, [borrador]);

  const sucio = useMemo(() => {
    if (!borrador || !cargada) return false;
    const f = (c: Config) => JSON.stringify({ e: c.encabezado, i: c.introduccion, p: c.pie, c: c.campos.map((x) => [x.clave, x.etiqueta, x.orden, x.visible, x.destino]) });
    return f(borrador) !== f(cargada);
  }, [borrador, cargada]);

  // La vista previa se arma en el servidor con el borrador (sin guardarlo)
  useEffect(() => {
    if (!payload) return;
    let vigente = true;
    const t = setTimeout(async () => {
      const [a, b] = await Promise.all([
        supabase.rpc('mensaje_vista_previa', { p_org: organizacionId, p_tipo: tipo, p_datos: payload, p_interno: false }),
        supabase.rpc('mensaje_vista_previa', { p_org: organizacionId, p_tipo: tipo, p_datos: payload, p_interno: true }),
      ]);
      if (!vigente) return;
      setPrevia({
        proveedor: a.error ? `Error: ${a.error.message}` : (a.data as string),
        interno: b.error ? `Error: ${b.error.message}` : (b.data as string),
      });
    }, 350);
    return () => { vigente = false; clearTimeout(t); };
  }, [supabase, organizacionId, tipo, payload]);

  const confirmarDescarte = () => !sucio || window.confirm('Tienes cambios sin guardar. ¿Descartarlos?');
  const cambiarCampo = (clave: string, cambio: Partial<Campo>) => setBorrador((b) => b && { ...b, campos: b.campos.map((c) => (c.clave === clave ? { ...c, ...cambio } : c)) });
  const mover = (clave: string, delta: -1 | 1) => setBorrador((b) => {
    if (!b) return b;
    const campo = b.campos.find((c) => c.clave === clave);
    if (!campo) return b;
    const grupo = b.campos.filter((c) => c.ambito === campo.ambito).sort((x, y) => x.orden - y.orden);
    const i = grupo.findIndex((c) => c.clave === clave);
    const j = i + delta;
    if (j < 0 || j >= grupo.length) return b;
    [grupo[i], grupo[j]] = [grupo[j], grupo[i]];
    const nuevoOrden = new Map(grupo.map((c, k) => [c.clave, k + 1]));
    return { ...b, campos: b.campos.map((c) => (nuevoOrden.has(c.clave) ? { ...c, orden: nuevoOrden.get(c.clave) as number } : c)) };
  });

  async function operar(texto: string, f: () => PromiseLike<{ error: { message: string } | null }>, despues?: () => void) {
    setGuardando(true); setError(''); setAviso('');
    const { error: e } = await f();
    setGuardando(false);
    if (fallo(e)) return false;
    setAviso(texto);
    despues?.();
    await Promise.all([cargarLista(), cargarProveedores()]);
    return true;
  }

  const guardar = () => operar(
    esBase ? 'Estructura Estándar guardada: los próximos mensajes la usarán.' : `Estructura “${nombreSel}” guardada.`,
    () => esBase
      ? supabase.rpc('mensaje_config_guardar', { p_org: organizacionId, p_tipo: tipo, p_datos: payload })
      : supabase.rpc('mensaje_variante_guardar', { p_org: organizacionId, p_tipo: tipo, p_variante: sel, p_datos: payload }),
    cargarEditor);

  const restablecer = () => window.confirm('¿Volver a la estructura de fábrica de la Estándar? Se pierde la personalización.') &&
    operar('Se restableció la estructura de fábrica.', () => supabase.rpc('mensaje_config_restablecer', { p_org: organizacionId, p_tipo: tipo }), cargarEditor);

  async function crear() {
    if (!nueva) return;
    setGuardando(true); setError('');
    const { data, error: e } = await supabase.rpc('mensaje_variante_crear', {
      p_org: organizacionId, p_tipo: tipo, p_nombre: nueva.nombre, p_copiar: nueva.copiarDe === ESTANDAR ? null : nueva.copiarDe,
    });
    setGuardando(false);
    if (fallo(e)) return;
    setNueva(null); setSel(String(data)); setAviso('Estructura creada.');
    await cargarLista();
  }

  const predOrg = lista?.predeterminada_org ?? ESTANDAR;
  const baseCampo = (clave: string) => baseCfg?.campos.find((x) => x.clave === clave);
  const difiereCampo = (c: Campo) => {
    const g = baseCampo(c.clave);
    return !esBase && !!g && (c.etiqueta !== g.etiqueta || c.orden !== g.orden || c.visible !== g.visible || c.destino !== g.destino);
  };

  return (
    <div>
      <div className="mod-tabs">
        {TIPOS.map((t) => (
          <button key={t.valor} type="button" aria-current={tipo === t.valor} className={tipo === t.valor ? 'mod-tab is-active' : 'mod-tab'}
            onClick={() => { if (!confirmarDescarte()) return; setTipo(t.valor); setSel(ESTANDAR); setNueva(null); }}>
            {t.texto}
          </button>
        ))}
      </div>
      <p className="mod-text mod-mt-0 mod-mb-2">{info.ayuda}</p>

      {error && <p className="mod-error">Error: {error}</p>}
      {aviso && <p className="mod-notice mod-text">{aviso}</p>}
      {!puedeEditar && <p className="mod-sub">Solo puedes ver esta configuración: no tienes permiso para editarla.</p>}

      {/* ---------- lista de estructuras ---------- */}
      <div className="mod-card mod-mb-3">
        <div className="mod-flex mod-gap-2 mod-center mod-mb-2">
          <h3 className="mod-h3 mod-mt-0 mod-mb-0">Estructuras de {info.plural}</h3>
          {puedeEditar && (
            <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" style={{ marginLeft: 'auto' }}
              onClick={() => setNueva({ nombre: '', copiarDe: ESTANDAR })}>+ Nueva estructura</button>
          )}
        </div>
        <p className="mod-sub mod-mt-0">
          La <b>predeterminada de la organización</b> se usa con todos los proveedores que no tengan una propia. Cada proveedor puede tener la suya
          (más abajo), y al generar un mensaje puedes cambiarla en ese momento.
        </p>
        {nueva && (
          <div className="mod-flex mod-gap-2 mod-center mod-wrap mod-mb-2" role="group" aria-label="Nueva estructura">
            <input className="ui-input ui-input--sm" style={{ width: 260 }} value={nueva.nombre} maxLength={40} autoFocus
              onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} placeholder="Nombre, p. ej. Formal con condiciones" aria-label="Nombre de la nueva estructura" />
            <label className="mod-text">basada en{' '}
              <select className="ui-input ui-input--sm mod-auto" value={nueva.copiarDe} onChange={(e) => setNueva({ ...nueva, copiarDe: e.target.value })} aria-label="Basada en">
                <option value={ESTANDAR}>Estándar</option>
                {variantes.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              </select>
            </label>
            <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" disabled={guardando} onClick={crear}>Crear</button>
            <button type="button" className="ui-btn ui-btn--sm" onClick={() => setNueva(null)}>Cancelar</button>
          </div>
        )}
        <div className="mod-scroll">
          <table className="mod-table">
            <thead><tr><th>Estructura</th><th>Uso</th><th /></tr></thead>
            <tbody>
              {[{ id: ESTANDAR, nombre: 'Estándar', proveedores: lista?.estandar_proveedores ?? 0 }, ...variantes].map((e) => {
                const esOrg = predOrg === e.id;
                return (
                  <tr key={e.id} className={sel === e.id ? 'is-selected' : ''}>
                    <td>
                      {renombrando?.id === e.id ? (
                        <span className="mod-flex mod-gap-1">
                          <input className="ui-input ui-input--sm" value={renombrando.texto} maxLength={40} autoFocus aria-label="Nuevo nombre"
                            onChange={(ev) => setRenombrando({ id: e.id, texto: ev.target.value })} />
                          <button type="button" className="ui-btn ui-btn--sm ui-btn--primary"
                            onClick={() => operar('Nombre actualizado.', () => supabase.rpc('mensaje_variante_renombrar', { p_org: organizacionId, p_variante: e.id, p_nombre: renombrando.texto }), () => setRenombrando(null))}>Guardar</button>
                          <button type="button" className="ui-btn ui-btn--sm" onClick={() => setRenombrando(null)}>Cancelar</button>
                        </span>
                      ) : (
                        <>
                          <b>{e.nombre}</b>
                          {e.id === ESTANDAR && <span className="mod-sub" style={{ display: 'block' }}>Es la base: las demás heredan de ella</span>}
                        </>
                      )}
                    </td>
                    <td>
                      {esOrg && <span className="ui-badge ui-badge--success">Predeterminada de la organización</span>}{' '}
                      {e.proveedores > 0 && <span className="ui-badge ui-badge--info">{e.proveedores} proveedor(es) la usan por defecto</span>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <button type="button" className="ui-btn ui-btn--sm" aria-label={`Editar ${e.nombre}`}
                        onClick={() => { if (e.id !== sel && !confirmarDescarte()) return; setSel(e.id); }}>Editar</button>{' '}
                      {puedeEditar && (
                        <>
                          <button type="button" className="ui-btn ui-btn--sm" disabled={esOrg} aria-label={`Hacer ${e.nombre} la predeterminada de la organización`}
                            onClick={() => operar('Cambió la estructura predeterminada de la organización.', () => supabase.rpc('mensaje_predeterminada_org_fijar', { p_org: organizacionId, p_tipo: tipo, p_variante: e.id === ESTANDAR ? null : e.id }))}>
                            Hacer predeterminada
                          </button>{' '}
                          <button type="button" className="ui-btn ui-btn--sm" aria-label={`Duplicar ${e.nombre}`} onClick={() => setNueva({ nombre: `Copia de ${e.nombre}`, copiarDe: e.id })}>Duplicar</button>
                          {e.id !== ESTANDAR && (
                            <>
                              {' '}
                              <button type="button" className="ui-btn ui-btn--sm" aria-label={`Renombrar ${e.nombre}`} onClick={() => setRenombrando({ id: e.id, texto: e.nombre })}>Renombrar</button>{' '}
                              <button type="button" className="ui-btn ui-btn--sm ui-btn--danger" aria-label={`Eliminar ${e.nombre}`}
                                onClick={() => {
                                  if (!window.confirm(`¿Eliminar la estructura “${e.nombre}”?${e.proveedores > 0 ? ` ${e.proveedores} proveedor(es) vuelven a la predeterminada.` : ''}`)) return;
                                  operar('Estructura eliminada.', () => supabase.rpc('mensaje_variante_eliminar', { p_org: organizacionId, p_variante: e.id }), () => { if (sel === e.id) setSel(ESTANDAR); });
                                }}>Eliminar</button>
                            </>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------- qué estructura usa cada proveedor ---------- */}
      <div className="mod-card mod-mb-3">
        <h3 className="mod-h3 mod-mt-0">Qué estructura usa cada proveedor</h3>
        <p className="mod-sub mod-mt-0">
          Es la que sale por defecto en sus {info.plural}. “La predeterminada” sigue a la de la organización
          ({predOrg === ESTANDAR ? 'Estándar' : (variantes.find((v) => v.id === predOrg)?.nombre ?? 'Estándar')}).
        </p>
        <input className="ui-input ui-input--sm mod-mb-2" style={{ width: 280 }} placeholder="Buscar proveedor" value={buscar} onChange={(e) => setBuscar(e.target.value)} aria-label="Buscar proveedor" />
        <div className="mod-scroll" style={{ maxHeight: 300 }}>
          <table className="mod-table">
            <tbody>
              {provs.map((p) => (
                <tr key={p.proveedor_id}>
                  <td>{p.nombre}</td>
                  <td>
                    <select className="ui-input ui-input--sm mod-auto" aria-label={`Estructura de ${p.nombre}`} disabled={!puedeEditar}
                      value={p.origen === 'proveedor' ? p.estructura_id : ''}
                      onChange={(e) => operar('Estructura del proveedor actualizada.', () => supabase.rpc('mensaje_proveedor_fijar', {
                        p_org: organizacionId, p_proveedor: p.proveedor_id, p_tipo: tipo, p_estructura: e.target.value === '' ? null : e.target.value,
                      }))}>
                      <option value="">La predeterminada de la organización</option>
                      <option value={ESTANDAR}>Estándar</option>
                      {variantes.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
              {provs.length === 0 && <tr><td>Sin proveedores</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------- editor de la estructura elegida ---------- */}
      <h2 className="mod-h2">Editando: {nombreSel}</h2>
      {!esBase && (
        <p className="mod-sub mod-mt-0">
          Lo que no cambies se hereda de la Estándar; si la Estándar cambia después, esta estructura recibe esos cambios salvo en lo que personalizaste (marcado como “personalizado”).
        </p>
      )}
      <p className="mod-text mod-mt-0 mod-mb-2">
        “Solo copia interna” deja el dato en la copia de Compras pero <b>nunca</b> sale en el mensaje al proveedor; los datos marcados como internos
        (línea, motivo de la decisión, compra interna, quién creó…) no se pueden enviar al proveedor.
      </p>

      {!borrador && !error && <p className="mod-text">Cargando…</p>}
      {borrador && baseCfg && (
        <>
          <div className="mod-card mod-mb-3">
            <div className="mod-semibold mod-mb-2">Textos del mensaje</div>
            <p className="mod-sub mod-mt-0 mod-mb-2">Puedes usar {'{numero}'}, {'{proveedor}'}, {'{fecha}'} y {'{entregar_en}'}: se reemplazan por los datos reales.</p>
            {(['encabezado', 'introduccion', 'pie'] as const).map((k) => {
              const etiqueta = { encabezado: 'Título (primera línea)', introduccion: 'Texto antes de los productos (opcional)', pie: 'Texto final (opcional, p. ej. condiciones de pago o despedida)' }[k];
              const difiere = !esBase && borrador[k] !== baseCfg[k];
              return (
                <div key={k} className="mod-mb-2">
                  <label className="mod-label" htmlFor={`txt-${k}`}>
                    {etiqueta}{' '}
                    {difiere && <span className="ui-badge ui-badge--info">personalizado</span>}{' '}
                    {difiere && puedeEditar && (
                      <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => setBorrador({ ...borrador, [k]: baseCfg[k] })}>↺ usar la Estándar</button>
                    )}
                  </label>
                  {k === 'encabezado'
                    ? <input id={`txt-${k}`} className="ui-input ui-input--sm" style={{ width: '100%', maxWidth: 520 }} value={borrador[k]} disabled={!puedeEditar} maxLength={600} onChange={(e) => setBorrador({ ...borrador, [k]: e.target.value })} />
                    : <textarea id={`txt-${k}`} className="ui-input" rows={2} style={{ width: '100%', maxWidth: 520 }} value={borrador[k]} disabled={!puedeEditar} maxLength={600} onChange={(e) => setBorrador({ ...borrador, [k]: e.target.value })} />}
                </div>
              );
            })}
          </div>

          {AMBITOS.map((a) => {
            const grupo = borrador.campos.filter((c) => c.ambito === a.valor).sort((x, y) => x.orden - y.orden);
            if (grupo.length === 0) return null;
            return (
              <div key={a.valor} className="mod-mb-3">
                <h3 className="mod-h3 mod-mt-0 mod-mb-1">{a.texto}</h3>
                <p className="mod-sub mod-mt-0 mod-mb-1">{a.ayuda}</p>
                <div className="mod-scroll">
                  <table className="mod-table">
                    <thead><tr>{['Orden', 'Mostrar', 'Título del campo', 'Quién lo ve'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
                    <tbody>
                      {grupo.map((c, k) => (
                        <tr key={c.clave} className={c.visible ? undefined : 'is-faded'}>
                          <td>
                            <div className="mod-flex mod-gap-1">
                              <button type="button" className="ui-btn ui-btn--sm" disabled={!puedeEditar || k === 0} onClick={() => mover(c.clave, -1)} aria-label={`Subir ${c.etiqueta_defecto}`}>↑</button>
                              <button type="button" className="ui-btn ui-btn--sm" disabled={!puedeEditar || k === grupo.length - 1} onClick={() => mover(c.clave, 1)} aria-label={`Bajar ${c.etiqueta_defecto}`}>↓</button>
                            </div>
                          </td>
                          <td><input type="checkbox" checked={c.visible} disabled={!puedeEditar} onChange={(e) => cambiarCampo(c.clave, { visible: e.target.checked })} aria-label={`Mostrar ${c.etiqueta_defecto}`} /></td>
                          <td>
                            <input className="ui-input ui-input--sm" style={{ width: 220 }} value={c.etiqueta} disabled={!puedeEditar} maxLength={60} placeholder={c.etiqueta_defecto}
                              onChange={(e) => cambiarCampo(c.clave, { etiqueta: e.target.value })} aria-label={`Título de ${c.etiqueta_defecto}`} />
                            <div className="mod-sub">{c.etiqueta === '' ? 'Sin título: se imprime solo el valor. ' : ''}Dato: {c.etiqueta_defecto}</div>
                            {difiereCampo(c) && (
                              <div>
                                <span className="ui-badge ui-badge--info">personalizado</span>{' '}
                                {puedeEditar && (
                                  <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" aria-label={`Usar la Estándar para ${c.etiqueta_defecto}`}
                                    onClick={() => { const g = baseCampo(c.clave); if (g) cambiarCampo(c.clave, { etiqueta: g.etiqueta, orden: g.orden, visible: g.visible, destino: g.destino }); }}>↺ usar la Estándar</button>
                                )}
                              </div>
                            )}
                          </td>
                          <td>
                            <select className="ui-input ui-input--sm mod-auto" value={c.destino} disabled={!puedeEditar || !c.permite_proveedor}
                              onChange={(e) => cambiarCampo(c.clave, { destino: e.target.value as Campo['destino'] })} aria-label={`Quién ve ${c.etiqueta_defecto}`}>
                              {DESTINOS.map((d) => <option key={d.valor} value={d.valor}>{d.texto}</option>)}
                            </select>
                            {!c.permite_proveedor && <div className="mod-sub">Dato interno: nunca se envía al proveedor</div>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          {puedeEditar && (
            <div className="mod-flex mod-gap-2 mod-mb-3 mod-center mod-wrap">
              <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" disabled={!sucio || guardando} onClick={guardar}>
                {guardando ? 'Guardando…' : `Guardar “${nombreSel}”`}
              </button>
              {sucio && <button type="button" className="ui-btn ui-btn--sm" disabled={guardando} onClick={() => setBorrador(cargada)}>Descartar cambios</button>}
              {esBase && cargada?.personalizada && (
                <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" disabled={guardando} onClick={restablecer}>Restablecer estructura de fábrica</button>
              )}
              {sucio && <span className="mod-sub">Hay cambios sin guardar; la vista previa ya los refleja.</span>}
            </div>
          )}

          <h3 className="mod-h3 mod-mt-4 mod-mb-1">Vista previa de “{nombreSel}” (con datos de ejemplo)</h3>
          <div className="mod-flex mod-gap-3 mod-wrap mod-start">
            <div style={{ flex: '1 1 340px' }}>
              <div className="mod-semibold mod-mb-1">Lo que recibe el proveedor</div>
              <textarea readOnly className="ui-input mod-mono" rows={Math.min(24, previa.proveedor.split('\n').length + 1)} value={previa.proveedor} />
            </div>
            <div style={{ flex: '1 1 340px' }}>
              <div className="mod-semibold mod-mb-1">Copia interna (solo Compras)</div>
              <textarea readOnly className="ui-input mod-mono" rows={Math.min(24, previa.interno.split('\n').length + 1)} value={previa.interno} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
