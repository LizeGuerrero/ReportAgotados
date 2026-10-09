'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import TabItemsProveedor from '@/components/proveedores/TabItemsProveedor';
import { TIPOS_DOCUMENTO } from '@/components/proveedores/ProveedoresMaestro';
import type { PermisosItems } from '@/components/items/usePermisos';
import { fecha } from '@/components/pedidos/comun';
import TablaExcel from '@/components/TablaExcel';

interface Proveedor {
  id: number;
  tipo_documento: string;
  numero_documento: string;
  nombre: string;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  notas: string | null;
  cobra_iva: boolean;
  iva_compra: number;
}

type Pestana = 'general' | 'items' | 'historial';

export default function ProveedorDetalle({
  supabase, organizacionId, proveedorId, permisos, onVolver,
}: {
  supabase: SupabaseClient;
  organizacionId: string;
  proveedorId: number;
  permisos: PermisosItems;
  onVolver: () => void;
}) {
  const [prov, setProv] = useState<Proveedor | null>(null);
  const [pestana, setPestana] = useState<Pestana>('general');
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.rpc('proveedor_obtener', { p_org: organizacionId, p_proveedor: proveedorId });
    if (error) return setError(error.message);
    setError('');
    setProv(data as Proveedor);
  }, [supabase, organizacionId, proveedorId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function guardar(datos: Record<string, unknown>): Promise<boolean> {
    setAviso('');
    setError('');
    const { error } = await supabase.rpc('proveedor_actualizar', { p_org: organizacionId, p_proveedor: proveedorId, p_datos: datos });
    if (error) {
      setError(error.message);
      return false;
    }
    setAviso('Cambios guardados.');
    await cargar();
    return true;
  }

  if (!prov) {
    return (
      <div>
        <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={onVolver}>← Volver</button>
        <p className="mod-muted">{error || 'Cargando…'}</p>
      </div>
    );
  }

  const pestanas: { valor: Pestana; texto: string }[] = [
    { valor: 'general', texto: 'General' },
    { valor: 'items', texto: 'Ítems y referencias' },
    { valor: 'historial', texto: 'Historial' },
  ];

  return (
    <div>
      <div className="mod-flex mod-gap-3 mod-center mod-mb-3 mod-wrap">
        <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={onVolver}>← Volver</button>
        <strong className="mod-lg">{prov.nombre}</strong>
        <span className="mod-text">{prov.tipo_documento} {prov.numero_documento}</span>
      </div>

      <div className="mod-tabs">
        {pestanas.map((p) => (
          <button
            key={p.valor}
            type="button"
            onClick={() => { setPestana(p.valor); setAviso(''); setError(''); }}
            aria-current={pestana === p.valor}
            className={pestana === p.valor ? 'mod-tab is-active' : 'mod-tab'}
          >
            {p.texto}
          </button>
        ))}
      </div>

      {error && <p className="mod-error mod-text">{error}</p>}
      {aviso && <p className="mod-text">{aviso}</p>}

      {pestana === 'general' && (
        <TabGeneral key={`g-${prov.id}-${prov.nombre}`} prov={prov} puedeEditar={permisos.provEditar} onGuardar={guardar} />
      )}
      {pestana === 'items' && (
        <TabItemsProveedor supabase={supabase} organizacionId={organizacionId} proveedorId={proveedorId} permisos={permisos} />
      )}
      {pestana === 'historial' && <TabHistorial supabase={supabase} organizacionId={organizacionId} proveedorId={proveedorId} />}
    </div>
  );
}

function Campo({
  etiqueta, valor, onCambio, deshabilitado, ancho = 260, multilinea,
}: {
  etiqueta: string; valor: string; onCambio: (v: string) => void; deshabilitado?: boolean; ancho?: number; multilinea?: boolean;
}) {
  return (
    <label className="mod-flex mod-col mod-gap-1 mod-sub">
      {etiqueta}
      {multilinea ? (
        <textarea className="ui-input ui-input--sm" style={{ width: ancho, minHeight: 60 }} value={valor} disabled={deshabilitado} onChange={(e) => onCambio(e.target.value)} />
      ) : (
        <input className="ui-input ui-input--sm" style={{ width: ancho }} value={valor} disabled={deshabilitado} onChange={(e) => onCambio(e.target.value)} />
      )}
    </label>
  );
}

function TabGeneral({
  prov, puedeEditar, onGuardar,
}: {
  prov: Proveedor;
  puedeEditar: boolean;
  onGuardar: (datos: Record<string, unknown>) => Promise<boolean>;
}) {
  const [v, setV] = useState({
    tipo_documento: prov.tipo_documento, numero_documento: prov.numero_documento, nombre: prov.nombre,
    contacto: prov.contacto ?? '', telefono: prov.telefono ?? '', email: prov.email ?? '', notas: prov.notas ?? '',
  });
  const [cobraIva, setCobraIva] = useState(prov.cobra_iva);
  const [ivaPct, setIvaPct] = useState(String(Math.round(prov.iva_compra * 10000) / 100));
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const set = (k: keyof typeof v, x: string) => setV({ ...v, [k]: x });

  async function guardar() {
    const pct = Number(ivaPct.trim().replace(',', '.'));
    if (cobraIva && (ivaPct.trim() === '' || !Number.isFinite(pct) || pct < 0 || pct > 100)) {
      return setError('Escribe el IVA como porcentaje entre 0 y 100 (por ejemplo 19).');
    }
    setError('');
    setGuardando(true);
    await onGuardar({
      ...v,
      cobra_iva: cobraIva,
      ...(cobraIva ? { iva_compra: Math.round(pct * 100) / 10000 } : {}),
    });
    setGuardando(false);
  }

  return (
    <div>
      <div className="mod-flex mod-wrap mod-gap-3">
        <label className="mod-flex mod-col mod-gap-1 mod-sub">
          Tipo de documento
          <select className="ui-input ui-input--sm" style={{ width: 120 }} value={v.tipo_documento} disabled={!puedeEditar} onChange={(e) => set('tipo_documento', e.target.value)}>
            {TIPOS_DOCUMENTO.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <Campo etiqueta="Número (sin DV)" ancho={170} valor={v.numero_documento} deshabilitado={!puedeEditar} onCambio={(x) => set('numero_documento', x)} />
        <Campo etiqueta="Nombre *" ancho={320} valor={v.nombre} deshabilitado={!puedeEditar} onCambio={(x) => set('nombre', x)} />
        <Campo etiqueta="Contacto" valor={v.contacto} deshabilitado={!puedeEditar} onCambio={(x) => set('contacto', x)} />
        <Campo etiqueta="Teléfono" ancho={170} valor={v.telefono} deshabilitado={!puedeEditar} onCambio={(x) => set('telefono', x)} />
        <Campo etiqueta="Correo" valor={v.email} deshabilitado={!puedeEditar} onCambio={(x) => set('email', x)} />
        <Campo etiqueta="Notas" ancho={580} multilinea valor={v.notas} deshabilitado={!puedeEditar} onCambio={(x) => set('notas', x)} />
      </div>

      <div className="mod-card mod-mt-4" style={{ maxWidth: 580 }}>
        <div className="mod-semibold mod-mb-2">IVA de compra</div>
        <label className="mod-text mod-flex mod-center mod-gap-2">
          <input type="checkbox" checked={cobraIva} disabled={!puedeEditar} onChange={(e) => setCobraIva(e.target.checked)} />
          Este proveedor cobra IVA
        </label>
        {cobraIva && (
          <div className="mod-mt-2">
            <Campo etiqueta="Tarifa por defecto (%)" ancho={110} valor={ivaPct} deshabilitado={!puedeEditar} onCambio={setIvaPct} />
          </div>
        )}
        <p className="mod-sub mod-mt-2 mod-mb-0">
          Es el IVA que se aplica al costo en las cotizaciones de este proveedor (el costo siempre se registra sin IVA).
          Al cotizar se puede ajustar por ítem. No tiene relación con el IVA de venta del ítem.
        </p>
      </div>

      {error && <p className="mod-error mod-text">{error}</p>}
      {puedeEditar && (
        <button type="button" className="ui-btn ui-btn--sm mod-mt-3" disabled={guardando} onClick={guardar}>
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      )}
    </div>
  );
}

interface Evento {
  fecha: string;
  tabla: string;
  accion: string;
  usuario: string | null;
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
}

function describir(e: Evento): string {
  const fmt = (x: unknown) => (x === null || x === undefined || x === '' ? '(vacío)' : String(x));
  if (e.accion === 'update' && e.antes && e.despues) {
    return Object.keys(e.despues)
      .filter((k) => k !== 'updated_at' && JSON.stringify(e.antes![k]) !== JSON.stringify(e.despues![k]))
      .map((k) => `${k}: ${fmt(e.antes![k])} → ${fmt(e.despues![k])}`)
      .join(' · ');
  }
  const fila = (e.despues ?? e.antes) as Record<string, unknown>;
  if (e.tabla === 'item_proveedor') {
    return `ítem ${fmt(fila.item_id)} · ref ${fmt(fila.codigo_proveedor)} · nombre ${fmt(fila.nombre_producto_proveedor)}`;
  }
  return '';
}

function TabHistorial({
  supabase, organizacionId, proveedorId,
}: {
  supabase: SupabaseClient; organizacionId: string; proveedorId: number;
}) {
  const [filas, setFilas] = useState<Evento[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.rpc('proveedor_historial', { p_org: organizacionId, p_proveedor: proveedorId }).then(({ data, error }) => {
      if (error) setError(error.message);
      else setFilas((data ?? []) as Evento[]);
    });
  }, [supabase, organizacionId, proveedorId]);

  if (error) return <p className="mod-error mod-text">{error}</p>;
  if (!filas) return <p className="mod-muted">Cargando…</p>;
  if (filas.length === 0) return <p className="mod-text">Aún no hay cambios registrados.</p>;

  return (
    <TablaExcel clave="proveedordetalle-1" etiqueta="Tabla de ítems del proveedor"><table className="mod-table">
      <thead>
        <tr>{['Fecha', 'Usuario', 'Qué', 'Acción', 'Detalle'].map((h) => <th key={h}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {filas.map((e, i) => (
          <tr key={i}>
            <td>{fecha(e.fecha)}</td>
            <td>{e.usuario ?? 'Sistema'}</td>
            <td>{e.tabla === 'proveedores' ? 'Proveedor' : 'Referencia de ítem'}</td>
            <td>{e.accion === 'insert' ? 'Creado' : e.accion === 'update' ? 'Modificado' : 'Eliminado'}</td>
            <td>{describir(e)}</td>
          </tr>
        ))}
      </tbody>
    </table></TablaExcel>
  );
}
