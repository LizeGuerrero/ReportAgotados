'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PermisosItems } from '@/components/items/usePermisos';
import {  } from '@/components/pedidos/comun';
import TablaExcel from '@/components/TablaExcel';

interface Relacion {
  id: string;
  proveedor_id: number;
  proveedor: string;
  documento: string;
  variante_id: string | null;
  codigo_proveedor: string | null;
  nombre_producto_proveedor: string | null;
  unidades_por_caja: number | null;
  precio_unitario: number | null;
  tiempo_entrega_dias: number | null;
  proveedor_preferido: boolean;
  notas: string | null;
  repetida_en_otros: number;
}

interface ProveedorOpcion {
  id: number;
  nombre: string;
  tipo_documento: string;
  numero_documento: string;
}

interface Formulario {
  id: string | null;
  proveedor_id: string;
  variante_id: string | null;
  codigo_proveedor: string;
  nombre_producto_proveedor: string;
  unidades_por_caja: string;
  precio_unitario: string;
  tiempo_entrega_dias: string;
  proveedor_preferido: boolean;
  notas: string;
}

const FORM_VACIO: Formulario = {
  id: null, proveedor_id: '', variante_id: null, codigo_proveedor: '', nombre_producto_proveedor: '',
  unidades_por_caja: '', precio_unitario: '', tiempo_entrega_dias: '', proveedor_preferido: false, notas: '',
};

const texto = (n: number | null) => (n === null || n === undefined ? '' : String(n));

/**
 * Relación ítem ↔ proveedor: qué referencia y qué nombre usa cada proveedor para este ítem.
 * Muestra lo que ya existe para poder corregirlo o eliminarlo, y avisa (sin bloquear) cuando
 * una referencia o nombre ya está en otro ítem o el proveedor ya tiene otra referencia aquí.
 */
export default function TabProveedores({
  supabase, organizacionId, itemId, permisos,
}: {
  supabase: SupabaseClient;
  organizacionId: string;
  itemId: number;
  permisos: PermisosItems;
}) {
  const [filas, setFilas] = useState<Relacion[]>([]);
  const [proveedores, setProveedores] = useState<ProveedorOpcion[]>([]);
  const [form, setForm] = useState<Formulario | null>(null);
  const [advertencias, setAdvertencias] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.rpc('item_proveedores_listar', { p_org: organizacionId, p_item: itemId });
    if (error) return setError(error.message);
    setError('');
    setFilas((data ?? []) as Relacion[]);
  }, [supabase, organizacionId, itemId]);

  useEffect(() => {
    cargar();
    supabase
      .from('proveedores')
      .select('id, nombre, tipo_documento, numero_documento')
      .eq('organizacion_id', organizacionId)
      .order('nombre')
      .then(({ data }) => setProveedores((data ?? []) as ProveedorOpcion[]));
  }, [cargar, supabase, organizacionId]);

  function editar(r: Relacion) {
    setAdvertencias(null);
    setAviso('');
    setForm({
      id: r.id, proveedor_id: String(r.proveedor_id), variante_id: r.variante_id,
      codigo_proveedor: r.codigo_proveedor ?? '', nombre_producto_proveedor: r.nombre_producto_proveedor ?? '',
      unidades_por_caja: texto(r.unidades_por_caja), precio_unitario: texto(r.precio_unitario),
      tiempo_entrega_dias: texto(r.tiempo_entrega_dias), proveedor_preferido: r.proveedor_preferido, notas: r.notas ?? '',
    });
  }

  async function guardar(confirmar: boolean) {
    if (!form) return;
    if (!form.proveedor_id) return setError('Elige el proveedor.');
    const enteroOVacio = (v: string) => v.trim() === '' || /^\d+$/.test(v.trim());
    const numeroOVacio = (v: string) => v.trim() === '' || Number.isFinite(Number(v.trim().replace(',', '.')));
    if (!enteroOVacio(form.unidades_por_caja) || !enteroOVacio(form.tiempo_entrega_dias)) {
      return setError('Unidades por caja y días de entrega deben ser números enteros.');
    }
    if (!numeroOVacio(form.precio_unitario)) return setError('El costo debe ser un número.');

    setError('');
    setGuardando(true);
    const { data, error } = await supabase.rpc('item_proveedor_guardar', {
      p_org: organizacionId,
      p_id: form.id,
      p_item: itemId,
      p_proveedor: Number(form.proveedor_id),
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

  async function eliminar(r: Relacion) {
    const que = `${r.proveedor}${r.codigo_proveedor ? ` · ${r.codigo_proveedor}` : ''}`;
    if (!window.confirm(`¿Eliminar la relación con ${que}? Esta acción no se puede deshacer (queda en el historial).`)) return;
    const { error } = await supabase.rpc('item_proveedor_eliminar', { p_org: organizacionId, p_id: r.id });
    if (error) return setError(error.message);
    setAviso('Relación eliminada.');
    cargar();
  }

  const set = <K extends keyof Formulario>(k: K, v: Formulario[K]) => form && setForm({ ...form, [k]: v });

  return (
    <div>
      <div className="mod-flex mod-gap-3 mod-center mod-mb-3">
        {permisos.provCrear && !form && (
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => { setAviso(''); setAdvertencias(null); setForm({ ...FORM_VACIO }); }}>
            + Agregar proveedor / referencia
          </button>
        )}
        <span className="mod-sub">
          Un proveedor puede tener varias referencias para este ítem: agrégalas como filas separadas.
        </span>
      </div>

      {error && <p className="mod-error mod-text">{error}</p>}
      {aviso && <p className="mod-text">{aviso}</p>}

      {form && (
        <div className="mod-card mod-mb-3">
          <div className="mod-semibold mod-mb-2">{form.id ? 'Editar relación' : 'Nueva relación'}</div>
          <div className="mod-flex mod-wrap mod-gap-2">
            <select className="ui-input ui-input--sm mod-auto" style={{ minWidth: 240 }} value={form.proveedor_id} onChange={(e) => set('proveedor_id', e.target.value)}>
              <option value="">Proveedor *</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre} ({p.tipo_documento} {p.numero_documento})</option>
              ))}
            </select>
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
            <input className="ui-input ui-input--sm" style={{ width: 320 }} placeholder="Notas" value={form.notas} onChange={(e) => set('notas', e.target.value)} />
          </div>

          {advertencias && (
            <div className="mod-note mod-mt-3 mod-text">
              <strong>Revisa antes de guardar:</strong>
              <ul className="mod-list">
                {advertencias.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
              <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" disabled={guardando} onClick={() => guardar(true)}>Guardar de todas formas</button>{' '}
              <button type="button" className="ui-btn ui-btn--sm" onClick={() => setAdvertencias(null)}>Volver a corregir</button>
            </div>
          )}

          <div className="mod-flex mod-gap-2 mod-mt-3">
            {!advertencias && (
              <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" disabled={guardando} onClick={() => guardar(false)}>
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            )}
            <button type="button" className="ui-btn ui-btn--sm" onClick={() => { setForm(null); setAdvertencias(null); setError(''); }}>Cancelar</button>
          </div>
        </div>
      )}

      {proveedores.length === 0 && (
        <p className="mod-text">No hay proveedores registrados todavía; sin ellos no se puede crear la relación.</p>
      )}

      <TablaExcel clave="tabproveedores-1" etiqueta="Tabla de proveedores del ítem"><table className="mod-table">
        <thead>
          <tr>
            {['Proveedor', 'Documento', 'Referencia', 'Nombre según proveedor', 'Und/caja', 'Costo ERP', 'Días', 'Variante', 'Pref.', 'Avisos', ''].map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((r) => {
            const avisos: string[] = [];
            if (r.codigo_proveedor?.includes('/')) avisos.push('Parece varias referencias juntas: sepáralas en filas distintas');
            if (r.repetida_en_otros > 0) avisos.push(`La referencia también está en ${r.repetida_en_otros} ítem(s) más`);
            if (!r.codigo_proveedor && !r.nombre_producto_proveedor) avisos.push('Sin referencia ni nombre');
            return (
              <tr key={r.id}>
                <td>{r.proveedor}</td>
                <td>{r.documento}</td>
                <td>{r.codigo_proveedor ?? ''}</td>
                <td>{r.nombre_producto_proveedor ?? ''}</td>
                <td>{r.unidades_por_caja ?? ''}</td>
                <td>{r.precio_unitario ?? ''}</td>
                <td>{r.tiempo_entrega_dias ?? ''}</td>
                <td>{r.variante_id ?? ''}</td>
                <td className="mod-star">{r.proveedor_preferido ? '★' : ''}</td>
                <td className="mod-sub">{avisos.map((a, i) => <div key={i} className="mod-warn">⚠ {a}</div>)}</td>
                <td className="mod-nowrap">
                  {permisos.provEditar && <button type="button" className="ui-btn ui-btn--sm ui-btn--soft" onClick={() => editar(r)}>Editar</button>}{' '}
                  {permisos.provEliminar && <button type="button" className="ui-btn ui-btn--sm ui-btn--danger" onClick={() => eliminar(r)}>Eliminar</button>}
                </td>
              </tr>
            );
          })}
          {filas.length === 0 && (
            <tr><td colSpan={11}>Este ítem aún no tiene proveedores relacionados.</td></tr>
          )}
        </tbody>
      </table></TablaExcel>
    </div>
  );
}
