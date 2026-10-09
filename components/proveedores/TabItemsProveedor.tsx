'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PermisosItems } from '@/components/items/usePermisos';
import { idVisible } from '@/components/pedidos/comun';
import TablaExcel from '@/components/TablaExcel';

interface Fila {
  id: string;
  item_id: number;
  codigo: string | null;
  nombre_base: string;
  linea: string | null;
  activo: boolean;
  provisional: boolean;
  variante_id: string | null;
  codigo_proveedor: string | null;
  nombre_producto_proveedor: string | null;
  unidades_por_caja: number | null;
  precio_unitario: number | null;
  tiempo_entrega_dias: number | null;
  proveedor_preferido: boolean;
  notas: string | null;
  total: number;
}

interface ItemBuscado {
  item_id: number;
  codigo: string | null;
  nombre_base: string;
  provisional: boolean;
}

interface Form {
  id: string | null;
  item_id: number;
  item_texto: string;
  variante_id: string | null;
  codigo_proveedor: string;
  nombre_producto_proveedor: string;
  unidades_por_caja: string;
  precio_unitario: string;
  tiempo_entrega_dias: string;
  proveedor_preferido: boolean;
  notas: string;
}

const t = (n: number | null) => (n === null || n === undefined ? '' : String(n));

/**
 * Catálogo del proveedor: qué ítems nos vende y bajo qué referencia y nombre.
 * Es la vista que necesita Compras cuando tiene la factura del proveedor en la mano.
 * Escribe con las mismas funciones que la pestaña Proveedores del ítem (una sola lógica).
 */
export default function TabItemsProveedor({
  supabase, organizacionId, proveedorId, permisos,
}: {
  supabase: SupabaseClient;
  organizacionId: string;
  proveedorId: number;
  permisos: PermisosItems;
}) {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [total, setTotal] = useState(0);
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [form, setForm] = useState<Form | null>(null);
  const [advertencias, setAdvertencias] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [guardando, setGuardando] = useState(false);

  // buscador para agregar un ítem
  const [textoItem, setTextoItem] = useState('');
  const [resultados, setResultados] = useState<ItemBuscado[]>([]);
  const [agregando, setAgregando] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setBusqueda(texto), 300);
    return () => clearTimeout(id);
  }, [texto]);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.rpc('proveedor_items_listar', {
      p_org: organizacionId, p_proveedor: proveedorId, p_busqueda: busqueda.trim() || null,
    });
    if (error) return setError(error.message);
    setError('');
    const lista = (data ?? []) as Fila[];
    setFilas(lista);
    setTotal(lista[0]?.total ?? 0);
  }, [supabase, organizacionId, proveedorId, busqueda]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // búsqueda de ítems para agregar (solo cuando se está agregando)
  useEffect(() => {
    if (!agregando || textoItem.trim().length < 2) {
      setResultados([]);
      return;
    }
    const id = setTimeout(async () => {
      const { data, error } = await supabase.rpc('items_listar', {
        p_org: organizacionId, p_busqueda: textoItem.trim(), p_estado: 'activos', p_limit: 8, p_offset: 0,
      });
      if (error) return setError(error.message);
      setResultados((data ?? []) as ItemBuscado[]);
    }, 300);
    return () => clearTimeout(id);
  }, [supabase, organizacionId, agregando, textoItem]);

  function abrirNuevo(i: ItemBuscado) {
    setAdvertencias(null);
    setAviso('');
    setForm({
      id: null, item_id: i.item_id, item_texto: `${idVisible(i.item_id, i.provisional, i.codigo)} · ${i.nombre_base}`,
      variante_id: null, codigo_proveedor: '', nombre_producto_proveedor: '', unidades_por_caja: '',
      precio_unitario: '', tiempo_entrega_dias: '', proveedor_preferido: false, notas: '',
    });
    setAgregando(false);
    setTextoItem('');
    setResultados([]);
  }

  function editar(f: Fila) {
    setAdvertencias(null);
    setAviso('');
    setForm({
      id: f.id, item_id: f.item_id, item_texto: `${idVisible(f.item_id, f.provisional, f.codigo)} · ${f.nombre_base}`,
      variante_id: f.variante_id, codigo_proveedor: f.codigo_proveedor ?? '',
      nombre_producto_proveedor: f.nombre_producto_proveedor ?? '', unidades_por_caja: t(f.unidades_por_caja),
      precio_unitario: t(f.precio_unitario), tiempo_entrega_dias: t(f.tiempo_entrega_dias),
      proveedor_preferido: f.proveedor_preferido, notas: f.notas ?? '',
    });
  }

  async function guardar(confirmar: boolean) {
    if (!form) return;
    const entero = (v: string) => v.trim() === '' || /^\d+$/.test(v.trim());
    if (!entero(form.unidades_por_caja) || !entero(form.tiempo_entrega_dias)) {
      return setError('Unidades por caja y días de entrega deben ser números enteros.');
    }
    if (form.precio_unitario.trim() !== '' && !Number.isFinite(Number(form.precio_unitario.trim().replace(',', '.')))) {
      return setError('El costo debe ser un número.');
    }
    setError('');
    setGuardando(true);
    const { data, error } = await supabase.rpc('item_proveedor_guardar', {
      p_org: organizacionId,
      p_id: form.id,
      p_item: form.item_id,
      p_proveedor: proveedorId,
      p_datos: {
        codigo_proveedor: form.codigo_proveedor,
        nombre_producto_proveedor: form.nombre_producto_proveedor,
        unidades_por_caja: form.unidades_por_caja,
        precio_unitario: form.precio_unitario.replace(',', '.'),
        tiempo_entrega_dias: form.tiempo_entrega_dias,
        proveedor_preferido: form.proveedor_preferido,
        notas: form.notas,
        ...(form.id ? { variante_id: form.variante_id } : {}),
      },
      p_confirmar: confirmar,
    });
    setGuardando(false);
    if (error) return setError(error.message);
    if (!data.guardado) return setAdvertencias(data.advertencias as string[]);
    setAdvertencias(null);
    setForm(null);
    setAviso('Relación guardada.');
    cargar();
  }

  async function eliminar(f: Fila) {
    const que = `${idVisible(f.item_id, f.provisional, f.codigo)} · ${f.nombre_base}${f.codigo_proveedor ? ` (ref ${f.codigo_proveedor})` : ''}`;
    if (!window.confirm(`¿Quitar ${que} de este proveedor? Queda en el historial.`)) return;
    const { error } = await supabase.rpc('item_proveedor_eliminar', { p_org: organizacionId, p_id: f.id });
    if (error) return setError(error.message);
    setAviso('Relación eliminada.');
    cargar();
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => form && setForm({ ...form, [k]: v });

  return (
    <div>
      <div className="mod-toolbar">
        <input className="ui-input ui-input--sm mod-auto" style={{ minWidth: 300 }} placeholder="Buscar por ítem, referencia o nombre del proveedor"
          value={texto} onChange={(e) => setTexto(e.target.value)} />
        {permisos.provCrear && !form && (
          <button type="button" className={agregando ? 'ui-btn ui-btn--sm' : 'ui-btn ui-btn--sm ui-btn--primary'} onClick={() => { setAgregando((v) => !v); setAviso(''); }}>
            {agregando ? 'Cancelar' : '+ Agregar ítem'}
          </button>
        )}
        <span className="mod-text">{total} relación(es)</span>
      </div>

      {agregando && (
        <div className="mod-card mod-mb-3">
          <input className="ui-input ui-input--sm mod-auto" style={{ minWidth: 320 }} autoFocus placeholder="Busca el ítem por código o nombre (mín. 2 letras)"
            value={textoItem} onChange={(e) => setTextoItem(e.target.value)} />
          {resultados.map((r) => (
            <div key={r.item_id}>
              <button type="button" className="ui-btn ui-btn--sm mod-mt-1" onClick={() => abrirNuevo(r)}>
                {idVisible(r.item_id, r.provisional, r.codigo)} · {r.nombre_base}
              </button>
            </div>
          ))}
          {textoItem.trim().length >= 2 && resultados.length === 0 && <p className="mod-sub mod-mt-2 mod-mb-0">Sin resultados.</p>}
        </div>
      )}

      {error && <p className="mod-error mod-text">{error}</p>}
      {aviso && <p className="mod-text">{aviso}</p>}

      {form && (
        <div className="mod-card mod-mb-3">
          <div className="mod-semibold mod-mb-2">{form.id ? 'Editar' : 'Nueva relación'}: {form.item_texto}</div>
          <div className="mod-flex mod-wrap mod-gap-2">
            <input className="ui-input ui-input--sm" style={{ width: 170 }} placeholder="Referencia del proveedor" value={form.codigo_proveedor}
              onChange={(e) => set('codigo_proveedor', e.target.value)} />
            <input className="ui-input ui-input--sm" style={{ width: 320 }} placeholder="Nombre según el proveedor" value={form.nombre_producto_proveedor}
              onChange={(e) => set('nombre_producto_proveedor', e.target.value)} />
            <input className="ui-input ui-input--sm" style={{ width: 110 }} placeholder="Und/caja" value={form.unidades_por_caja}
              onChange={(e) => set('unidades_por_caja', e.target.value)} />
            <input className="ui-input ui-input--sm" style={{ width: 140 }} placeholder="Costo sin IVA (ERP)" value={form.precio_unitario}
              onChange={(e) => set('precio_unitario', e.target.value)} />
            <input className="ui-input ui-input--sm" style={{ width: 110 }} placeholder="Días entrega" value={form.tiempo_entrega_dias}
              onChange={(e) => set('tiempo_entrega_dias', e.target.value)} />
            <label className="mod-text mod-flex mod-center mod-gap-1">
              <input type="checkbox" checked={form.proveedor_preferido} onChange={(e) => set('proveedor_preferido', e.target.checked)} />
              Preferido
            </label>
            <input className="ui-input ui-input--sm" style={{ width: 300 }} placeholder="Notas" value={form.notas} onChange={(e) => set('notas', e.target.value)} />
          </div>

          {advertencias && (
            <div className="mod-note mod-mt-3 mod-text">
              <strong>Revisa antes de guardar:</strong>
              <ul className="mod-list">{advertencias.map((a, i) => <li key={i}>{a}</li>)}</ul>
              <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" disabled={guardando} onClick={() => guardar(true)}>Guardar de todas formas</button>{' '}
              <button type="button" className="ui-btn ui-btn--sm" onClick={() => setAdvertencias(null)}>Volver a corregir</button>
            </div>
          )}

          <div className="mod-flex mod-gap-2 mod-mt-3">
            {!advertencias && <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" disabled={guardando} onClick={() => guardar(false)}>{guardando ? 'Guardando…' : 'Guardar'}</button>}
            <button type="button" className="ui-btn ui-btn--sm" onClick={() => { setForm(null); setAdvertencias(null); setError(''); }}>Cancelar</button>
          </div>
        </div>
      )}

      <TablaExcel clave="tabitemsproveedor-1" etiqueta="Tabla de ítems del proveedor"><table className="mod-table">
        <thead>
          <tr>
            {['Ítem', 'Nombre interno', 'Referencia', 'Nombre según proveedor', 'Und/caja', 'Costo ERP', 'Días', 'Pref.', ''].map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.id} className={f.activo ? undefined : 'is-inactive'}>
              <td>{idVisible(f.item_id, f.provisional, f.codigo)}</td>
              <td>{f.nombre_base}</td>
              <td>
                {f.codigo_proveedor ?? ''}
                {f.codigo_proveedor?.includes('/') && <div className="mod-sub mod-warn">⚠ parecen varias referencias juntas</div>}
              </td>
              <td>{f.nombre_producto_proveedor ?? ''}</td>
              <td>{f.unidades_por_caja ?? ''}</td>
              <td>{f.precio_unitario ?? ''}</td>
              <td>{f.tiempo_entrega_dias ?? ''}</td>
              <td className="mod-star">{f.proveedor_preferido ? '★' : ''}</td>
              <td className="mod-nowrap">
                {permisos.provEditar && <button type="button" className="ui-btn ui-btn--sm ui-btn--soft" onClick={() => editar(f)}>Editar</button>}{' '}
                {permisos.provEliminar && <button type="button" className="ui-btn ui-btn--sm ui-btn--danger" onClick={() => eliminar(f)}>Quitar</button>}
              </td>
            </tr>
          ))}
          {filas.length === 0 && (
            <tr><td colSpan={9}>Este proveedor aún no tiene ítems relacionados.</td></tr>
          )}
        </tbody>
      </table></TablaExcel>
    </div>
  );
}
