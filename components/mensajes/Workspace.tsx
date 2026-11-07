'use client';

import '@/styles/mensajes.css';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as TeclaReact } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { VariableDef } from '@/lib/mensajes/variables';
import AsignacionProveedores from './AsignacionProveedores';
import EditorCxp from './EditorCxp';
import EditorPedidos from './EditorPedidos';
import Menu, { type ItemMenu } from './Menu';
import PanelVariables from './PanelVariables';
import Vista from './Vista';
import {
  ESTANDAR, TIPOS, cargaGuardar, esCfgCxp, esCxp, huella, textoErr,
  type Cfg, type CfgCxp, type CfgPedidos, type Lista, type ProvFila, type Tipo,
} from './tipos';

/**
 * Espacio de trabajo de un tipo de mensaje (solicitud de cotización, orden de compra o aviso de pago):
 *  - izquierda: la Estándar (de fábrica, protegida) y las estructuras propias de la organización;
 *  - centro: editor de la estructura elegida, o la asignación por proveedor;
 *  - derecha: variables y vista previa en vivo.
 * Cada estructura es independiente: crear = copia, guardar/restablecer solo afectan a la elegida.
 */
export default function Workspace({
  organizacionId, tipo, puedeEditar, empresa, usuario, onSucio,
}: { organizacionId: string; tipo: Tipo; puedeEditar: boolean; empresa: string; usuario: string; onSucio?: (sucio: boolean) => void }) {
  const [supabase] = useState(() => createClient());
  const info = TIPOS.find((t) => t.valor === tipo)!;
  const cxp = esCxp(tipo);

  const [vista, setVista] = useState<'estructuras' | 'proveedores'>('estructuras');
  const [lista, setLista] = useState<Lista | null>(null);
  const [sel, setSel] = useState<string>(ESTANDAR);
  const [base, setBase] = useState<Cfg | null>(null);
  const [cargada, setCargada] = useState<Cfg | null>(null);
  const [borrador, setBorrador] = useState<Cfg | null>(null);
  const [variables, setVariables] = useState<VariableDef[]>([]);
  const [proveedores, setProveedores] = useState<ProvFila[]>([]);
  const [provSel, setProvSel] = useState<number | null>(null);
  const [nueva, setNueva] = useState<{ nombre: string; copiarDe: string } | null>(null);
  const [renombrando, setRenombrando] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const insertarPed = useRef<((t: string) => void) | null>(null);
  const insertarCxp = useRef<((t: string, a: 'mensaje' | 'linea' | 'erp') => void) | null>(null);

  const variantes = lista?.variantes ?? [];
  const esBase = sel === ESTANDAR;
  const actual = variantes.find((v) => v.id === sel);
  const nombreSel = esBase ? 'Estándar' : (actual?.nombre ?? 'Estándar');
  const predOrg = lista?.predeterminada_org ?? ESTANDAR;
  const nombrePredOrg = predOrg === ESTANDAR ? 'Estándar' : (variantes.find((v) => v.id === predOrg)?.nombre ?? 'Estándar');
  const editable = puedeEditar && !esBase;
  const sucio = !!borrador && !!cargada && huella(borrador) !== huella(cargada);

  useEffect(() => { onSucio?.(sucio); }, [sucio, onSucio]);
  useEffect(() => {
    if (!sucio) return;
    const f = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', f);
    return () => window.removeEventListener('beforeunload', f);
  }, [sucio]);

  const cargarLista = useCallback(async () => {
    const [l, b, v] = await Promise.all([
      supabase.rpc('mensaje_estructuras', { p_org: organizacionId, p_tipo: tipo }),
      supabase.rpc('mensaje_estructura_config', { p_org: organizacionId, p_tipo: tipo, p_variante: null }),
      supabase.rpc('mensaje_variables', { p_org: organizacionId, p_tipo: tipo }),
    ]);
    const e = l.error ?? b.error ?? v.error;
    if (e) { setError(textoErr(e)); return; }
    setLista(l.data as Lista); setBase(b.data as Cfg); setVariables((v.data ?? []) as VariableDef[]);
  }, [supabase, organizacionId, tipo]);

  const cargarEditor = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('mensaje_estructura_config', { p_org: organizacionId, p_tipo: tipo, p_variante: esBase ? null : sel });
    if (e) { setError(textoErr(e)); return; }
    setCargada(data as Cfg); setBorrador(data as Cfg);
  }, [supabase, organizacionId, tipo, sel, esBase]);

  useEffect(() => { void cargarLista(); }, [cargarLista]);
  useEffect(() => { setCargada(null); setBorrador(null); void cargarEditor(); }, [cargarEditor]);
  useEffect(() => {
    supabase.rpc('mensaje_proveedores_listar', { p_org: organizacionId, p_tipo: tipo, p_limit: 200 })
      .then(({ data }) => setProveedores((data ?? []) as ProvFila[]));
  }, [supabase, organizacionId, tipo]);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(''), 4500); return () => clearTimeout(t); }, [aviso]);

  const confirmarDescarte = () => !sucio || window.confirm('Tienes cambios sin guardar. ¿Descartarlos?');
  const elegir = (id: string) => { if (id === sel || !confirmarDescarte()) return; setError(''); setVista('estructuras'); setSel(id); };

  async function operar(texto: string, f: () => PromiseLike<{ error: { message: string } | null }>, despues?: () => void | Promise<void>) {
    setOcupado(true); setError('');
    const { error: e } = await f();
    setOcupado(false);
    if (e) { setError(textoErr(e)); return false; }
    setAviso(texto);
    await despues?.();
    await cargarLista();
    return true;
  }

  const guardar = () => borrador && !esBase && operar(`“${nombreSel}” guardada.`,
    () => supabase.rpc('mensaje_variante_guardar', { p_org: organizacionId, p_tipo: tipo, p_variante: sel, p_datos: cargaGuardar(borrador) }), cargarEditor);

  async function crear() {
    if (!nueva) return;
    setOcupado(true); setError('');
    const { data, error: e } = await supabase.rpc('mensaje_variante_crear', {
      p_org: organizacionId, p_tipo: tipo, p_nombre: nueva.nombre, p_copiar: nueva.copiarDe === ESTANDAR ? null : nueva.copiarDe,
    });
    setOcupado(false);
    if (e) { setError(textoErr(e)); return; }
    setNueva(null); setVista('estructuras'); setSel(String(data)); setAviso('Estructura creada como copia independiente.');
    await cargarLista();
  }

  function abrirNueva(copiarDe: string, nombre: string) {
    if (!confirmarDescarte()) return;
    setNueva({ nombre, copiarDe });
  }

  const insertar = (v: VariableDef) => (cxp ? insertarCxp.current?.(`{${v.clave}}`, v.ambito) : insertarPed.current?.(`{${v.clave}}`));
  const conocidas = useMemo(() => variables.map((v) => v.clave), [variables]);

  const accionesBase: (ItemMenu | 'sep')[] = [
    { texto: 'Crear copia editable…', onClick: () => abrirNueva(ESTANDAR, `Mi ${info.texto.toLowerCase()}`), deshabilitado: !puedeEditar },
    'sep',
    { texto: 'Usar como predeterminada de la organización', onClick: () => operar('La Estándar es ahora la predeterminada de la organización.', () => supabase.rpc('mensaje_predeterminada_org_fijar', { p_org: organizacionId, p_tipo: tipo, p_variante: null })), deshabilitado: !puedeEditar || predOrg === ESTANDAR },
  ];
  const accionesVar: (ItemMenu | 'sep')[] = [
    { texto: 'Duplicar…', onClick: () => abrirNueva(sel, `Copia de ${nombreSel}`), deshabilitado: !puedeEditar },
    { texto: 'Renombrar', onClick: () => setRenombrando(nombreSel), deshabilitado: !puedeEditar },
    { texto: predOrg === sel ? 'Ya es la predeterminada de la organización' : 'Hacer predeterminada de la organización',
      onClick: () => operar(`“${nombreSel}” es ahora la predeterminada de la organización.`, () => supabase.rpc('mensaje_predeterminada_org_fijar', { p_org: organizacionId, p_tipo: tipo, p_variante: sel })),
      deshabilitado: !puedeEditar || predOrg === sel },
    'sep',
    { texto: 'Restablecer a su punto de partida',
      ayuda: 'Vuelve al contenido con el que se creó esta estructura. No toca la Estándar ni otras estructuras.',
      onClick: () => { if (window.confirm(`¿Restablecer “${nombreSel}” al contenido con el que se creó? Solo cambia esta estructura.`)) void operar(`“${nombreSel}” volvió a su punto de partida.`, () => supabase.rpc('mensaje_variante_restablecer', { p_org: organizacionId, p_variante: sel }), cargarEditor); },
      deshabilitado: !puedeEditar || !(cargada && 'modificada' in cargada && cargada.modificada) },
    { texto: 'Reemplazar por el contenido de la Estándar',
      ayuda: 'Copia de nuevo la Estándar de fábrica en esta estructura (la Estándar no se modifica).',
      onClick: () => { if (window.confirm(`¿Reemplazar el contenido de “${nombreSel}” por el de la Estándar? Se pierden sus personalizaciones.`)) void operar(`“${nombreSel}” ahora tiene el contenido de la Estándar.`, () => supabase.rpc('mensaje_variante_igualar_estandar', { p_org: organizacionId, p_variante: sel }), cargarEditor); },
      deshabilitado: !puedeEditar },
    'sep',
    { texto: 'Eliminar', peligro: true, deshabilitado: !puedeEditar,
      onClick: () => {
        const n = actual?.proveedores ?? 0;
        if (!window.confirm(`¿Eliminar la estructura “${nombreSel}”?${n > 0 ? ` ${n} proveedor(es) vuelven a la predeterminada.` : ''}`)) return;
        void operar('Estructura eliminada.', () => supabase.rpc('mensaje_variante_eliminar', { p_org: organizacionId, p_variante: sel }), () => setSel(ESTANDAR));
      } },
  ];

  const guardarConTeclado = (e: TeclaReact) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (sucio && editable && !ocupado) void guardar(); } };

  return (
    <div className="msj-ws" onKeyDown={guardarConTeclado}>
      <header className="msj-ws__cab">
        <div>
          <h2 className="msj-ws__titulo">{info.texto}</h2>
          <p className="msj-sub">{info.ayuda}</p>
        </div>
        <div className="msj-tabs" role="tablist" aria-label="Vista">
          <button type="button" role="tab" aria-selected={vista === 'estructuras'} className={vista === 'estructuras' ? 'msj-tab is-on' : 'msj-tab'} onClick={() => setVista('estructuras')}>Estructuras</button>
          <button type="button" role="tab" aria-selected={vista === 'proveedores'} className={vista === 'proveedores' ? 'msj-tab is-on' : 'msj-tab'}
            onClick={() => { if (confirmarDescarte()) setVista('proveedores'); }}>Por proveedor</button>
        </div>
      </header>

      {error && <div className="msj-aviso msj-aviso--error" role="alert">{error}</div>}
      {aviso && <div className="msj-aviso msj-aviso--ok" role="status">{aviso}</div>}
      {!puedeEditar && <div className="msj-aviso msj-aviso--info">Solo lectura: no tienes permiso para editar mensajes.</div>}

      {vista === 'proveedores' ? (
        <AsignacionProveedores supabase={supabase} organizacionId={organizacionId} tipo={tipo} lista={lista} puedeEditar={puedeEditar}
          nombrePredOrg={nombrePredOrg} alCambiar={() => void cargarLista()} />
      ) : (
        <div className="msj-cuerpo">
          {/* ---------- biblioteca ---------- */}
          <nav className="msj-lista" aria-label="Estructuras">
            {puedeEditar && <button type="button" className="msj-btn msj-btn--primary msj-lista__nueva" onClick={() => abrirNueva(ESTANDAR, '')}>+ Nueva estructura</button>}
            <button type="button" className={esBase ? 'msj-item msj-item--std is-on' : 'msj-item msj-item--std'} onClick={() => elegir(ESTANDAR)} aria-current={esBase}>
              <span className="msj-item__nombre"><span aria-hidden="true">🔒</span> Estándar</span>
              <span className="msj-item__meta">
                <span className="msj-tag msj-tag--std">De fábrica</span>
                {predOrg === ESTANDAR && <span className="msj-tag msj-tag--org">Predeterminada</span>}
                {(lista?.estandar_proveedores ?? 0) > 0 && <span className="msj-tag">{lista?.estandar_proveedores} prov.</span>}
              </span>
            </button>
            <div className="msj-lista__sep">Mis estructuras · {variantes.length}</div>
            {variantes.length === 0 && <p className="msj-sub msj-lista__vacia">Aún no tienes estructuras propias. Crea una copia de la Estándar para personalizarla.</p>}
            {variantes.map((v) => (
              <button key={v.id} type="button" className={sel === v.id ? 'msj-item is-on' : 'msj-item'} onClick={() => elegir(v.id)} aria-current={sel === v.id}>
                <span className="msj-item__nombre">{v.nombre}</span>
                <span className="msj-item__meta">
                  {predOrg === v.id && <span className="msj-tag msj-tag--org">Predeterminada</span>}
                  {v.proveedores > 0 && <span className="msj-tag msj-tag--prov">{v.proveedores} prov.</span>}
                  {v.modificada && <span className="msj-tag msj-tag--cambio">modificada</span>}
                </span>
                {v.copiada_de_nombre && <span className="msj-sub">Basada en {v.copiada_de_nombre}</span>}
              </button>
            ))}
          </nav>

          {/* ---------- editor ---------- */}
          <section className="msj-centro" aria-label={`Editor de ${nombreSel}`}>
            <header className="msj-centro__cab">
              <div className="msj-centro__nombre">
                {renombrando !== null ? (
                  <span className="msj-inline">
                    <input className="msj-input" value={renombrando} maxLength={40} autoFocus aria-label="Nuevo nombre" onChange={(e) => setRenombrando(e.target.value)} />
                    <button type="button" className="msj-btn msj-btn--primary" disabled={ocupado}
                      onClick={() => void operar('Nombre actualizado.', () => supabase.rpc('mensaje_variante_renombrar', { p_org: organizacionId, p_variante: sel, p_nombre: renombrando }), () => setRenombrando(null))}>Guardar</button>
                    <button type="button" className="msj-btn msj-btn--ghost" onClick={() => setRenombrando(null)}>Cancelar</button>
                  </span>
                ) : <h3 className="msj-centro__titulo">{esBase && <span aria-hidden="true">🔒 </span>}{nombreSel}</h3>}
                <span className="msj-sub">
                  {esBase ? 'Plantilla base de fábrica: no se modifica.' : `${actual?.copiada_de_nombre ? `Basada en ${actual.copiada_de_nombre} · ` : ''}independiente de la Estándar y de las demás.`}
                </span>
              </div>
              <div className="msj-centro__acciones">
                {editable && <>
                  <button type="button" className="msj-btn msj-btn--primary" disabled={!sucio || ocupado} onClick={() => void guardar()}>{ocupado ? 'Guardando…' : 'Guardar'}</button>
                  {sucio && <button type="button" className="msj-btn" disabled={ocupado} onClick={() => setBorrador(cargada)}>Descartar</button>}
                </>}
                <Menu etiqueta="Más acciones" items={esBase ? accionesBase : accionesVar} />
              </div>
            </header>

            {esBase && (
              <div className="msj-aviso msj-aviso--info msj-protegida">
                <span><b>Estándar protegida.</b> Es la base de fábrica y no puede editarse, para que nunca se dañe. Crea una copia y personalízala con libertad.</span>
                {puedeEditar && <button type="button" className="msj-btn msj-btn--primary" onClick={() => abrirNueva(ESTANDAR, `Mi ${info.texto.toLowerCase()}`)}>Crear copia editable</button>}
              </div>
            )}
            {sucio && <div className="msj-aviso msj-aviso--warn" role="status">Hay cambios sin guardar (Ctrl+S para guardar). La vista previa ya los refleja.</div>}

            {!borrador && !error && <p className="msj-sub">Cargando…</p>}
            {borrador && (esCfgCxp(borrador)
              ? <EditorCxp cfg={borrador} base={base && esCfgCxp(base) ? base : null} editable={editable} onCambio={(c: CfgCxp) => setBorrador({ ...borrador, ...c })} variables={variables} insertarRef={insertarCxp} />
              : <EditorPedidos cfg={borrador as CfgPedidos} base={base && !esCfgCxp(base) ? base : null} editable={editable} onCambio={(c: CfgPedidos) => setBorrador(c)} conocidas={conocidas.filter((c) => variables.find((v) => v.clave === c)?.ambito === 'mensaje')} insertarRef={insertarPed} />)}
          </section>

          {/* ---------- variables + vista previa ---------- */}
          <aside className="msj-lateral">
            <PanelVariables variables={variables} onInsertar={insertar} deshabilitado={!editable} />
            <Vista supabase={supabase} organizacionId={organizacionId} tipo={tipo} borrador={borrador} proveedores={proveedores}
              provSel={provSel} onProvSel={setProvSel} variables={variables} empresa={empresa} usuario={usuario} />
          </aside>
        </div>
      )}

      {nueva && (
        <div className="msj-modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setNueva(null)}>
          <div className="msj-modal__caja" role="dialog" aria-modal="true" aria-labelledby="msj-nueva-t">
            <h3 id="msj-nueva-t" className="msj-modal__titulo">Nueva estructura de {info.plural}</h3>
            <label className="msj-label" htmlFor="msj-nueva-nombre">Nombre</label>
            <input id="msj-nueva-nombre" className="msj-input" value={nueva.nombre} maxLength={40} autoFocus placeholder="Ej.: Corta para WhatsApp"
              onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') void crear(); }} />
            <div className="msj-label msj-modal__sub">Punto de partida (se copia completa; el original no cambia)</div>
            <div className="msj-opciones" role="radiogroup" aria-label="Punto de partida">
              {[{ id: ESTANDAR, nombre: 'Estándar', nota: 'De fábrica' }, ...variantes.map((v) => ({ id: v.id, nombre: v.nombre, nota: v.modificada ? 'modificada' : '' }))].map((o) => (
                <label key={o.id} className={nueva.copiarDe === o.id ? 'msj-opcion is-on' : 'msj-opcion'}>
                  <input type="radio" name="msj-origen" checked={nueva.copiarDe === o.id} onChange={() => setNueva({ ...nueva, copiarDe: o.id })} />
                  <span>{o.nombre}</span>{o.nota && <span className="msj-sub">{o.nota}</span>}
                </label>
              ))}
            </div>
            <div className="msj-modal__acciones">
              <button type="button" className="msj-btn" onClick={() => setNueva(null)}>Cancelar</button>
              <button type="button" className="msj-btn msj-btn--primary" disabled={ocupado || nueva.nombre.trim().length < 2} onClick={() => void crear()}>Crear copia</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
