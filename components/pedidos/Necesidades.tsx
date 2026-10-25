'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useTiempoReal } from '@/components/useTiempoReal';
import type { PermisosPedidos } from '@/components/pedidos/usePermisosPedidos';
import { useAjustesPedidos } from '@/components/pedidos/ajustes';
import { fecha, idVisible } from '@/components/pedidos/comun';
import { numeroDeTexto } from '@/components/pedidos/reglas';
import { numeroCompra, type CompraResumen, type Tono } from '@/components/pedidos/tipos';
import { Badge, Modal, Vacio, textoError } from '@/components/pedidos/ui';

interface Necesidad {
  item_id: number; codigo: string | null; nombre_base: string; linea: string | null; unidad_medida: string | null;
  cantidad_sugerida: number | null; sedes: { sede: string; cantidad_sugerida: number | null }[]; notas: string | null;
  estado: string; compra_id: string | null; compra_numero: number | null; proveedores: number; fecha: string | null; total: number;
}

const ESTADO: Record<string, { texto: string; tono: Tono }> = {
  pendiente: { texto: 'Pendiente', tono: 'ambar' },
  en_compra: { texto: 'En una compra', tono: 'azul' },
  atendida: { texto: 'Atendida (con orden)', tono: 'verde' },
  agotado_proveedor: { texto: 'Agotado en proveedor', tono: 'rojo' },
  repartir_sedes: { texto: 'Repartir entre sedes', tono: 'gris' },
  no_se_pide: { texto: 'Descartada (no se pide)', tono: 'gris' },
};
const POR_PAGINA = 100;
const clave = (n: Necesidad) => `${n.item_id}|${n.estado}|${n.compra_id ?? ''}`;

/**
 * Agotados por atender: lo que las sedes reportaron como agotado y Compras aún tiene que resolver. Es la
 * pantalla de "Necesidades" del prototipo, alimentada por los agotados reales: se marcan varios, se confirma la
 * cantidad a comprar de cada uno y se convierten en una compra (donde se cotiza, se compara y se decide).
 * Los agotados de un mismo ítem en varias sedes se suman en un solo producto. El reporte de agotados no se modifica.
 */
export default function Necesidades({
  supabase, organizacionId, permisos, onAbrirCompra,
}: {
  supabase: SupabaseClient; organizacionId: string; permisos: PermisosPedidos; onAbrirCompra: (id: string) => void;
}) {
  const { ajustes, cambiar } = useAjustesPedidos();
  const [filas, setFilas] = useState<Necesidad[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(0);
  const [lineas, setLineas] = useState<string[]>([]);
  const [linea, setLinea] = useState('');
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [cant, setCant] = useState<Record<number, string>>({});
  const [revision, setRevision] = useState<Record<number, string[]>>({});
  const [dialogo, setDialogo] = useState<null | 'compra' | 'agregar' | 'descartar'>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => { setBusqueda(texto.trim()); setPagina(0); }, 300);
    return () => clearTimeout(t);
  }, [texto]);

  useEffect(() => {
    supabase.rpc('listar_lineas_pedidos', { p_org: organizacionId }).then(({ data }) =>
      setLineas(((data ?? []) as (string | { linea: string })[]).map((d) => (typeof d === 'string' ? d : d.linea))));
  }, [supabase, organizacionId]);

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('agotados_necesidades', {
      p_org: organizacionId, p_estado: ajustes.verNecesidades, p_linea: linea || null, p_busqueda: busqueda || null,
      p_limit: POR_PAGINA, p_offset: pagina * POR_PAGINA,
    });
    setCargando(false);
    if (e) return setError(textoError(e));
    setError('');
    const lista = (data ?? []) as Necesidad[];
    setFilas(lista);
    setTotal(lista[0]?.total ?? 0);
    const ids = [...new Set(lista.map((n) => n.item_id))];
    if (ids.length > 0) {
      const r = await supabase.rpc('items_revision', { p_org: organizacionId, p_items: ids });
      if (!r.error) setRevision(Object.fromEntries(((r.data ?? []) as { item_id: number; motivos: string[] }[]).map((x) => [x.item_id, x.motivos])));
    } else setRevision({});
  }, [supabase, organizacionId, ajustes.verNecesidades, linea, busqueda, pagina]);

  useEffect(() => { cargar(); }, [cargar]);
  useTiempoReal(supabase, organizacionId, ['agotados', 'compra_lineas'], cargar);

  const pendientes = filas.filter((n) => n.estado === 'pendiente');
  const marcadas = pendientes.filter((n) => sel.has(clave(n)));
  const todasMarcadas = pendientes.length > 0 && pendientes.every((n) => sel.has(clave(n)));
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  const alternar = (n: Necesidad) => {
    if (n.estado !== 'pendiente') return;
    setSel((s) => { const x = new Set(s); const k = clave(n); if (x.has(k)) x.delete(k); else x.add(k); return x; });
  };
  const marcarTodas = (on: boolean) => setSel(on ? new Set(pendientes.map(clave)) : new Set());

  // Cantidad a comprar: lo que se digite o, si no, lo que sumaron las sedes
  const cantidadDe = (n: Necesidad): number | undefined => {
    const t = cant[n.item_id];
    return t !== undefined && t.trim() !== '' ? numeroDeTexto(t) : (n.cantidad_sugerida ?? undefined);
  };
  const sinCantidad = marcadas.filter((n) => { const c = cantidadDe(n); return c === undefined || c <= 0; });
  const itemsSeleccion = () => marcadas.map((n) => ({ item_id: n.item_id, cantidad: cantidadDe(n) }));

  const grupos = useMemo(() => {
    if (!ajustes.agruparNecesidades) return [{ titulo: '', filas }];
    return [...new Set(filas.map((n) => n.linea ?? 'Sin línea'))].sort((a, b) => a.localeCompare(b, 'es'))
      .map((l) => ({ titulo: l, filas: filas.filter((n) => (n.linea ?? 'Sin línea') === l) }));
  }, [filas, ajustes.agruparNecesidades]);

  async function reabrir(n: Necesidad) {
    const { error: e } = await supabase.rpc('necesidades_reabrir', { p_org: organizacionId, p_item: n.item_id });
    if (e) setError(textoError(e)); else { setAviso(`${n.nombre_base} volvió a pendientes.`); cargar(); }
  }

  const fila = (n: Necesidad) => {
    const rev = revision[n.item_id] ?? [];
    const pend = n.estado === 'pendiente';
    const est = ESTADO[n.estado] ?? { texto: n.estado, tono: 'gris' as Tono };
    const c = cantidadDe(n);
    const falta = sel.has(clave(n)) && (c === undefined || c <= 0);
    return (
      <tr key={clave(n)} className={sel.has(clave(n)) ? 'is-selected is-clickable' : pend ? 'is-clickable' : ''} onClick={() => alternar(n)}>
        <td className="mod-check" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" disabled={!pend} checked={sel.has(clave(n))} onChange={() => alternar(n)} aria-label={`Seleccionar ${n.nombre_base}`} />
        </td>
        <td><b>{idVisible(n.item_id, false, n.codigo)}</b><span className="pm-chico">{n.linea ?? 'Sin línea'}</span></td>
        <td>
          {n.nombre_base}
          {rev.length > 0 && <> <Badge tono={rev.some((m) => m.startsWith('No tiene')) ? 'rojo' : 'ambar'} titulo={rev.join('\n')}>revisar</Badge></>}
          {n.notas && <span className="pm-chico">{n.notas}</span>}
        </td>
        <td onClick={(e) => e.stopPropagation()}>
          {pend ? (
            <>
              <input
                className="ui-input ui-input--sm" style={{ width: 90, borderColor: falta ? 'var(--color-danger, #b91c1c)' : undefined }}
                inputMode="decimal" value={cant[n.item_id] ?? (n.cantidad_sugerida !== null ? String(n.cantidad_sugerida) : '')}
                placeholder="Cantidad" aria-label={`Cantidad a comprar de ${n.nombre_base}`} aria-invalid={falta}
                onChange={(e) => setCant({ ...cant, [n.item_id]: e.target.value })}
              />
              <span className="pm-chico">
                {n.unidad_medida ?? ''}{n.cantidad_sugerida === null ? ' · las sedes no sugirieron cantidad' : n.sedes.length > 1 ? ` · suma de ${n.sedes.length} sedes` : ''}
              </span>
            </>
          ) : <span>{n.cantidad_sugerida ?? '—'} {n.unidad_medida ?? ''}</span>}
        </td>
        <td>
          {n.sedes.map((s) => <span key={s.sede} className="pm-chico">{s.sede}{s.cantidad_sugerida !== null ? `: ${s.cantidad_sugerida}` : ''}</span>)}
        </td>
        <td className="mod-sub">{fecha(n.fecha)}</td>
        <td onClick={(e) => e.stopPropagation()}>
          {n.estado === 'en_compra' && n.compra_id
            ? <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => onAbrirCompra(n.compra_id as string)}>{numeroCompra(n.compra_numero ?? 0)}</button>
            : <Badge tono={est.tono}>{est.texto}</Badge>}
          {['agotado_proveedor', 'repartir_sedes', 'no_se_pide'].includes(n.estado) && permisos.editar && (
            <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => reabrir(n)}>Volver a pendientes</button>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div>
      <p className="mod-text mod-mt-0 mod-mb-2">
        Los agotados que reportaron las sedes y que Compras aún debe resolver. Marca varios, confirma la cantidad a comprar y conviértelos en una compra:
        ahí se cotiza, se compara y se decide.
      </p>

      <div className="mod-toolbar mod-toolbar--top">
        <select className="ui-input ui-input--sm mod-auto" value={ajustes.verNecesidades} aria-label="Estado"
          onChange={(e) => { cambiar({ verNecesidades: e.target.value as 'pendiente' | 'todas' }); setPagina(0); }}>
          <option value="pendiente">Solo pendientes</option><option value="todas">Todas</option>
        </select>
        <select className="ui-input ui-input--sm mod-auto" value={linea} aria-label="Línea" onChange={(e) => { setLinea(e.target.value); setPagina(0); }}>
          <option value="">Todas las líneas</option>
          {lineas.map((l) => <option key={l}>{l}</option>)}
        </select>
        <input className="ui-input ui-input--sm mod-auto" style={{ minWidth: 260 }} value={texto} onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar por código, nombre o nota" aria-label="Buscar" />
        <label className="mod-flex mod-gap-1 mod-center mod-text">
          <input type="checkbox" checked={ajustes.agruparNecesidades} onChange={(e) => cambiar({ agruparNecesidades: e.target.checked })} /> Agrupar por línea
        </label>
      </div>

      {error && <p className="mod-error">{error}</p>}
      {aviso && <p className="mod-notice mod-text">{aviso} <button type="button" className="ui-btn ui-btn--sm" onClick={() => setAviso('')}>Entendido</button></p>}

      {marcadas.length > 0 && (
        <div className="mod-bulkbar" role="region" aria-label="Acciones sobre la selección">
          <span className="mod-semibold">{marcadas.length} seleccionada(s)</span>
          {permisos.crear && <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" onClick={() => setDialogo('compra')}>Crear compra con la selección</button>}
          {permisos.editar && <button type="button" className="ui-btn ui-btn--sm" onClick={() => setDialogo('agregar')}>Agregar a una compra existente</button>}
          {permisos.editar && <button type="button" className="ui-btn ui-btn--sm ui-btn--danger" onClick={() => setDialogo('descartar')}>Descartar</button>}
          <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => setSel(new Set())}>Quitar selección</button>
          {sinCantidad.length > 0 && <span className="mod-error">Falta la cantidad de {sinCantidad.length} producto(s).</span>}
        </div>
      )}

      {!cargando && filas.length === 0 ? (
        <Vacio titulo={ajustes.verNecesidades === 'pendiente' ? 'No hay agotados pendientes por atender' : 'No hay agotados'}
          texto="Aparecen aquí cuando una sede reporta un agotado en el módulo Agotados." />
      ) : (
        <div className="mod-scroll">
          <table className="mod-table">
            <thead>
              <tr>
                <th className="mod-check">
                  <input type="checkbox" checked={todasMarcadas} disabled={pendientes.length === 0} onChange={(e) => marcarTodas(e.target.checked)}
                    aria-label="Seleccionar todos los pendientes visibles" />
                </th>
                <th>Ítem</th><th>Producto</th><th>Cantidad a comprar</th><th>Reportado en</th><th>Fecha</th><th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => (
                <GrupoFilas key={g.titulo || 'todas'} titulo={g.titulo} filas={g.filas} render={fila} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mod-pager">
        <button disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>Anterior</button>
        <span>Página {pagina + 1} de {paginas} ({total} fila(s))</span>
        <button disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)}>Siguiente</button>
      </div>

      {dialogo === 'compra' && (
        <CrearCompra supabase={supabase} organizacionId={organizacionId} marcadas={marcadas} lineas={[...new Set(marcadas.map((n) => n.linea).filter((x): x is string => !!x))]}
          items={itemsSeleccion()} sinCantidad={sinCantidad.length} cantidadDe={cantidadDe}
          onCerrar={() => setDialogo(null)} onCreada={(id) => { setSel(new Set()); setDialogo(null); onAbrirCompra(id); }} />
      )}
      {dialogo === 'agregar' && (
        <AgregarAExistente supabase={supabase} organizacionId={organizacionId} cantidad={marcadas.length} items={itemsSeleccion()} sinCantidad={sinCantidad.length}
          onCerrar={() => setDialogo(null)} onAgregadas={(id) => { setSel(new Set()); setDialogo(null); onAbrirCompra(id); }} />
      )}
      {dialogo === 'descartar' && (
        <Descartar supabase={supabase} organizacionId={organizacionId} ids={marcadas.map((n) => n.item_id)}
          onCerrar={() => setDialogo(null)} onHecho={(m) => { setSel(new Set()); setDialogo(null); setAviso(m); cargar(); }} />
      )}
    </div>
  );
}

function GrupoFilas({ titulo, filas, render }: { titulo: string; filas: Necesidad[]; render: (n: Necesidad) => React.ReactNode }) {
  return (
    <>
      {titulo && <tr className="pm-grupo"><td colSpan={7}>{titulo} <span className="mod-sub">({filas.length})</span></td></tr>}
      {filas.map(render)}
    </>
  );
}

function CrearCompra({
  supabase, organizacionId, marcadas, lineas, items, sinCantidad, cantidadDe, onCerrar, onCreada,
}: {
  supabase: SupabaseClient; organizacionId: string; marcadas: Necesidad[]; lineas: string[]; items: { item_id: number; cantidad?: number }[];
  sinCantidad: number; cantidadDe: (n: Necesidad) => number | undefined; onCerrar: () => void; onCreada: (id: string) => void;
}) {
  const [titulo, setTitulo] = useState(`${lineas.length === 1 ? lineas[0] : 'Compra'} — ${new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}`);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  async function crear() {
    setOcupado(true);
    const { data, error: e } = await supabase.rpc('compra_crear', { p_org: organizacionId, p_titulo: titulo, p_items: items, p_proveedores: null });
    setOcupado(false);
    if (e) return setError(textoError(e));
    onCreada(String(data));
  }
  return (
    <Modal titulo={`Crear compra con ${marcadas.length} agotado(s)`} onCerrar={onCerrar}>
      <p className="mod-text mod-mt-0">Los agotados del mismo ítem en varias sedes se suman en un solo producto. Luego eliges a qué proveedores consultar.</p>
      <div className="pm-lista mod-mb-2" style={{ maxHeight: 180 }}>
        <table className="mod-table"><tbody>
          {marcadas.map((n) => <tr key={n.item_id}><td>{n.nombre_base}</td><td>{cantidadDe(n) ?? <span className="mod-error">sin cantidad</span>} {n.unidad_medida ?? ''}</td></tr>)}
        </tbody></table>
      </div>
      <label className="ui-field">
        <span className="ui-label">Título de la compra *</span>
        <input className="ui-input" value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus />
      </label>
      {sinCantidad > 0 && <p className="mod-error">Escribe la cantidad de {sinCantidad} producto(s) antes de crear la compra.</p>}
      {error && <p className="mod-error">{error}</p>}
      <div className="pm-modal__acciones">
        <button type="button" className="ui-btn" onClick={onCerrar}>Cancelar</button>
        <button type="button" className="ui-btn ui-btn--primary" disabled={ocupado || sinCantidad > 0 || titulo.trim().length < 3} onClick={crear}>Crear y abrir</button>
      </div>
    </Modal>
  );
}

function AgregarAExistente({
  supabase, organizacionId, cantidad, items, sinCantidad, onCerrar, onAgregadas,
}: {
  supabase: SupabaseClient; organizacionId: string; cantidad: number; items: { item_id: number; cantidad?: number }[]; sinCantidad: number;
  onCerrar: () => void; onAgregadas: (id: string) => void;
}) {
  const [abiertas, setAbiertas] = useState<CompraResumen[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    supabase.rpc('listar_compras', { p_org: organizacionId }).then(({ data, error: e }) => {
      if (e) setError(textoError(e));
      else setAbiertas(((data ?? []) as CompraResumen[]).filter((c) => ['armando', 'cotizando', 'decidiendo'].includes(c.estado)));
    });
  }, [supabase, organizacionId]);
  async function agregar(c: CompraResumen) {
    const { error: e } = await supabase.rpc('compra_agregar_items', { p_org: organizacionId, p_compra: c.id, p_items: items });
    if (e) return setError(textoError(e));
    onAgregadas(c.id);
  }
  return (
    <Modal titulo={`Agregar ${cantidad} agotado(s) a una compra`} onCerrar={onCerrar}>
      {sinCantidad > 0 && <p className="mod-error">Escribe la cantidad de {sinCantidad} producto(s) antes de agregarlos.</p>}
      {abiertas && abiertas.length === 0 && <p className="mod-text">No hay compras abiertas.</p>}
      {error && <p className="mod-error">{error}</p>}
      <div style={{ display: 'grid', gap: 8 }}>
        {(abiertas ?? []).map((c) => (
          <button key={c.id} type="button" className="ui-btn" style={{ textAlign: 'left' }} disabled={sinCantidad > 0} onClick={() => agregar(c)}>
            <b>{numeroCompra(c.numero)}</b> · {c.titulo} <span className="mod-sub">({c.productos} productos)</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

const RESPUESTAS = [
  { valor: 'no_se_pide', texto: 'Descartar: no se pide (con motivo)' },
  { valor: 'agotado_proveedor', texto: 'Agotado en el proveedor' },
  { valor: 'repartir_sedes', texto: 'Repartir entre sedes' },
];

function Descartar({
  supabase, organizacionId, ids, onCerrar, onHecho,
}: { supabase: SupabaseClient; organizacionId: string; ids: number[]; onCerrar: () => void; onHecho: (m: string) => void }) {
  const [respuesta, setRespuesta] = useState('no_se_pide');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  async function aplicar() {
    const { data, error: e } = await supabase.rpc('necesidades_responder', { p_org: organizacionId, p_items: ids, p_respuesta: respuesta, p_motivo: respuesta === 'no_se_pide' ? motivo : null });
    if (e) return setError(textoError(e));
    onHecho(`Se respondieron ${Number(data ?? 0)} ítem(s).`);
  }
  return (
    <Modal titulo={`Descartar ${ids.length} agotado(s)`} onCerrar={onCerrar}>
      <p className="mod-text mod-mt-0">No se compran: se responden en el reporte de agotados para que las sedes vean qué pasó.</p>
      <label className="ui-field">
        <span className="ui-label">Respuesta</span>
        <select className="ui-input" value={respuesta} onChange={(e) => setRespuesta(e.target.value)}>{RESPUESTAS.map((r) => <option key={r.valor} value={r.valor}>{r.texto}</option>)}</select>
      </label>
      {respuesta === 'no_se_pide' && (
        <label className="ui-field mod-mt-2">
          <span className="ui-label">Motivo *</span>
          <input className="ui-input" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
          <span className="mod-sub">Queda registrado</span>
        </label>
      )}
      {error && <p className="mod-error">{error}</p>}
      <div className="pm-modal__acciones">
        <button type="button" className="ui-btn" onClick={onCerrar}>Cancelar</button>
        <button type="button" className="ui-btn ui-btn--danger-solid" disabled={respuesta === 'no_se_pide' && !motivo.trim()} onClick={aplicar}>Aplicar</button>
      </div>
    </Modal>
  );
}
