'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import TabProveedores from '@/components/items/TabProveedores';
import type { PermisosItems } from '@/components/items/usePermisos';
import { boton, campo, celda, fecha, idVisible } from '@/components/pedidos/comun';

interface ItemCompleto {
  id_item: number;
  codigo_erp: string | null;
  nombre_base: string;
  descripcion_2: string | null;
  unidad_medida: string | null;
  categoria: string | null;
  grupo_contable: string | null;
  grupo: string | null;
  codigo_linea: string | null;
  linea: string | null;
  iva: number | null;
  notas: string | null;
  marca: string | null;
  informacion_tecnica: string | null;
  aplicacion_tecnica: string | null;
  activo: boolean;
  provisional: boolean;
}

interface Logistica {
  peso_kg: number | null;
  alto_cm: number | null;
  ancho_cm: number | null;
  largo_cm: number | null;
  notas: string | null;
}

type Pestana = 'general' | 'proveedores' | 'logistica' | 'tributaria' | 'historial';

interface Props {
  supabase: SupabaseClient;
  organizacionId: string;
  itemId: number;
  permisos: PermisosItems;
  onVolver: () => void;
}

export default function ItemDetalle({ supabase, organizacionId, itemId, permisos, onVolver }: Props) {
  const [item, setItem] = useState<ItemCompleto | null>(null);
  const [logistica, setLogistica] = useState<Logistica | null>(null);
  const [pestana, setPestana] = useState<Pestana>('general');
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.rpc('item_obtener', { p_org: organizacionId, p_item: itemId });
    if (error) return setError(error.message);
    setError('');
    setItem(data.item as ItemCompleto);
    setLogistica((data.logistica as Logistica | null) ?? null);
  }, [supabase, organizacionId, itemId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  /** Ejecuta una RPC de escritura, muestra el resultado y recarga el ítem. */
  async function ejecutar(fn: string, args: Record<string, unknown>, ok: string): Promise<boolean> {
    setAviso('');
    setError('');
    const { error } = await supabase.rpc(fn, { p_org: organizacionId, ...args });
    if (error) {
      setError(error.message);
      return false;
    }
    setAviso(ok);
    await cargar();
    return true;
  }

  if (!item) {
    return (
      <div>
        <button type="button" style={boton} onClick={onVolver}>← Volver</button>
        <p>{error || 'Cargando…'}</p>
      </div>
    );
  }

  const pestanas: { valor: Pestana; texto: string }[] = [
    { valor: 'general', texto: 'General' },
    ...(permisos.provVer ? [{ valor: 'proveedores' as Pestana, texto: 'Proveedores' }] : []),
    { valor: 'logistica', texto: 'Logística' },
    { valor: 'tributaria', texto: 'Tributaria' },
    { valor: 'historial', texto: 'Historial' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <button type="button" style={boton} onClick={onVolver}>← Volver</button>
        <strong style={{ fontSize: 16 }}>
          {idVisible(item.id_item, item.provisional, item.codigo_erp)} · {item.nombre_base}
        </strong>
        {item.provisional && <span style={{ fontSize: 12 }}>(provisional: aún sin código del ERP)</span>}
        {!item.activo && <span style={{ fontSize: 12, fontWeight: 700 }}>INHABILITADO</span>}
        {permisos.itemsEditar && (
          <button
            type="button"
            style={boton}
            onClick={() => {
              if (item.activo && !window.confirm('¿Inhabilitar este ítem? No se borra, puedes habilitarlo después.')) return;
              ejecutar('item_estado', { p_item: itemId, p_activo: !item.activo },
                item.activo ? 'Ítem inhabilitado.' : 'Ítem habilitado.');
            }}
          >
            {item.activo ? 'Inhabilitar' : 'Habilitar'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid #000' }}>
        {pestanas.map((p) => (
          <button
            key={p.valor}
            type="button"
            onClick={() => {
              setPestana(p.valor);
              setAviso('');
              setError('');
            }}
            aria-current={pestana === p.valor}
            style={{
              padding: '8px 16px',
              border: '1px solid #000',
              borderBottom: pestana === p.valor ? '1px solid #fff' : '1px solid #000',
              marginBottom: -1,
              background: pestana === p.valor ? '#fff' : '#eee',
              color: '#000',
              fontSize: 14,
              fontWeight: pestana === p.valor ? 700 : 400,
              cursor: 'pointer',
            }}
          >
            {p.texto}
          </button>
        ))}
      </div>

      {error && <p style={{ color: '#b00020', fontSize: 13 }}>{error}</p>}
      {aviso && <p style={{ fontSize: 13 }}>{aviso}</p>}

      {pestana === 'general' && (
        <TabGeneral
          key={`g-${item.id_item}`}
          item={item}
          puedeEditar={permisos.itemsEditar}
          onGuardar={(datos) => ejecutar('item_actualizar', { p_item: itemId, p_datos: datos }, 'Cambios guardados.')}
        />
      )}
      {pestana === 'proveedores' && (
        <TabProveedores supabase={supabase} organizacionId={organizacionId} itemId={itemId} permisos={permisos} />
      )}
      {pestana === 'logistica' && (
        <TabLogistica
          logistica={logistica}
          puedeEditar={permisos.itemsEditar}
          onGuardar={(datos) => ejecutar('item_logistica_guardar', { p_item: itemId, p_datos: datos }, 'Logística guardada.')}
        />
      )}
      {pestana === 'tributaria' && (
        <TabTributaria
          iva={item.iva}
          puedeEditar={permisos.itemsEditar}
          onGuardar={(iva) => ejecutar('item_actualizar', { p_item: itemId, p_datos: { iva } }, 'IVA guardado.')}
        />
      )}
      {pestana === 'historial' && <TabHistorial supabase={supabase} organizacionId={organizacionId} itemId={itemId} />}
    </div>
  );
}

/* ---------- campos reutilizables ---------- */

function Campo({
  etiqueta, valor, onCambio, deshabilitado, ancho = 280, multilinea,
}: {
  etiqueta: string;
  valor: string;
  onCambio: (v: string) => void;
  deshabilitado?: boolean;
  ancho?: number;
  multilinea?: boolean;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12 }}>
      {etiqueta}
      {multilinea ? (
        <textarea style={{ ...campo, width: ancho, minHeight: 60 }} value={valor} disabled={deshabilitado}
          onChange={(e) => onCambio(e.target.value)} />
      ) : (
        <input style={{ ...campo, width: ancho }} value={valor} disabled={deshabilitado}
          onChange={(e) => onCambio(e.target.value)} />
      )}
    </label>
  );
}

function aNumeroONull(v: string): number | null | 'invalido' {
  const t = v.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : 'invalido';
}

/* ---------- General ---------- */

const CAMPOS_GENERAL: { clave: keyof ItemCompleto; etiqueta: string; multilinea?: boolean }[] = [
  { clave: 'codigo_erp', etiqueta: 'Código ERP *' },
  { clave: 'nombre_base', etiqueta: 'Nombre *' },
  { clave: 'descripcion_2', etiqueta: 'Descripción 2' },
  { clave: 'unidad_medida', etiqueta: 'Unidad de medida' },
  { clave: 'marca', etiqueta: 'Marca' },
  { clave: 'categoria', etiqueta: 'Categoría' },
  { clave: 'grupo', etiqueta: 'Grupo' },
  { clave: 'grupo_contable', etiqueta: 'Grupo contable' },
  { clave: 'codigo_linea', etiqueta: 'Código de línea' },
  { clave: 'linea', etiqueta: 'Línea' },
  { clave: 'informacion_tecnica', etiqueta: 'Información técnica', multilinea: true },
  { clave: 'aplicacion_tecnica', etiqueta: 'Aplicación técnica', multilinea: true },
  { clave: 'notas', etiqueta: 'Notas', multilinea: true },
];

function TabGeneral({
  item, puedeEditar, onGuardar,
}: {
  item: ItemCompleto;
  puedeEditar: boolean;
  onGuardar: (datos: Record<string, string>) => Promise<boolean>;
}) {
  const [v, setV] = useState<Record<string, string>>(() =>
    Object.fromEntries(CAMPOS_GENERAL.map((c) => [c.clave, String(item[c.clave] ?? '')])),
  );
  const [guardando, setGuardando] = useState(false);

  return (
    <div>
      {item.provisional && (
        <p style={{ fontSize: 12, margin: '0 0 10px' }}>
          Ítem provisional: aún no tiene código del ERP. Se asigna al vincularlo desde Pedidos.
        </p>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {CAMPOS_GENERAL.map((c) => (
          <Campo
            key={c.clave}
            etiqueta={c.etiqueta}
            valor={v[c.clave]}
            multilinea={c.multilinea}
            ancho={c.multilinea ? 580 : 280}
            deshabilitado={!puedeEditar || (c.clave === 'codigo_erp' && item.provisional)}
            onCambio={(x) => setV({ ...v, [c.clave]: x })}
          />
        ))}
      </div>
      {puedeEditar && (
        <button
          type="button"
          style={{ ...boton, marginTop: 12 }}
          disabled={guardando}
          onClick={async () => {
            setGuardando(true);
            const datos = { ...v };
            if (item.provisional) delete datos.codigo_erp;
            await onGuardar(datos);
            setGuardando(false);
          }}
        >
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      )}
    </div>
  );
}

/* ---------- Logística ---------- */

function TabLogistica({
  logistica, puedeEditar, onGuardar,
}: {
  logistica: Logistica | null;
  puedeEditar: boolean;
  onGuardar: (datos: Record<string, unknown>) => Promise<boolean>;
}) {
  const ini = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));
  const [v, setV] = useState({
    peso_kg: ini(logistica?.peso_kg), alto_cm: ini(logistica?.alto_cm),
    ancho_cm: ini(logistica?.ancho_cm), largo_cm: ini(logistica?.largo_cm), notas: logistica?.notas ?? '',
  });
  const [error, setError] = useState('');

  async function guardar() {
    const nums = {
      peso_kg: aNumeroONull(v.peso_kg), alto_cm: aNumeroONull(v.alto_cm),
      ancho_cm: aNumeroONull(v.ancho_cm), largo_cm: aNumeroONull(v.largo_cm),
    };
    if (Object.values(nums).includes('invalido')) return setError('Las medidas deben ser números positivos.');
    setError('');
    await onGuardar({ ...nums, notas: v.notas });
  }

  const volumen =
    [v.alto_cm, v.ancho_cm, v.largo_cm].every((x) => typeof aNumeroONull(x) === 'number')
      ? ((aNumeroONull(v.alto_cm) as number) * (aNumeroONull(v.ancho_cm) as number) * (aNumeroONull(v.largo_cm) as number)) / 1_000_000
      : null;

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <Campo etiqueta="Peso (kg)" ancho={120} valor={v.peso_kg} deshabilitado={!puedeEditar} onCambio={(x) => setV({ ...v, peso_kg: x })} />
        <Campo etiqueta="Alto (cm)" ancho={120} valor={v.alto_cm} deshabilitado={!puedeEditar} onCambio={(x) => setV({ ...v, alto_cm: x })} />
        <Campo etiqueta="Ancho (cm)" ancho={120} valor={v.ancho_cm} deshabilitado={!puedeEditar} onCambio={(x) => setV({ ...v, ancho_cm: x })} />
        <Campo etiqueta="Largo (cm)" ancho={120} valor={v.largo_cm} deshabilitado={!puedeEditar} onCambio={(x) => setV({ ...v, largo_cm: x })} />
      </div>
      {volumen !== null && <p style={{ fontSize: 12 }}>Volumen calculado: {volumen.toLocaleString('es-CO', { maximumFractionDigits: 6 })} m³</p>}
      <div style={{ marginTop: 8 }}>
        <Campo etiqueta="Notas de logística" ancho={580} multilinea valor={v.notas} deshabilitado={!puedeEditar} onCambio={(x) => setV({ ...v, notas: x })} />
      </div>
      {error && <p style={{ color: '#b00020', fontSize: 13 }}>{error}</p>}
      {puedeEditar && <button type="button" style={{ ...boton, marginTop: 12 }} onClick={guardar}>Guardar logística</button>}
    </div>
  );
}

/* ---------- Tributaria ---------- */

function TabTributaria({
  iva, puedeEditar, onGuardar,
}: {
  iva: number | null;
  puedeEditar: boolean;
  onGuardar: (iva: number | null) => Promise<boolean>;
}) {
  const [v, setV] = useState(iva === null ? '' : String(Math.round(iva * 10000) / 100));
  const [error, setError] = useState('');

  async function guardar() {
    const n = aNumeroONull(v);
    if (n === 'invalido' || (n !== null && n > 100)) return setError('Escribe un porcentaje entre 0 y 100 (por ejemplo 19).');
    setError('');
    await onGuardar(n === null ? null : Math.round(n * 100) / 10000);
  }

  return (
    <div>
      <Campo etiqueta="IVA de venta (%)" ancho={120} valor={v} deshabilitado={!puedeEditar} onCambio={setV} />
      <p style={{ fontSize: 12, maxWidth: 560 }}>
        Es el IVA con el que <strong>nosotros vendemos</strong> el ítem (dato del ERP). El IVA de <strong>compra</strong> es
        distinto y depende de cada proveedor: se definirá en Proveedores. Aquí se agregarán más datos tributarios cuando se definan.
      </p>
      {error && <p style={{ color: '#b00020', fontSize: 13 }}>{error}</p>}
      {puedeEditar && <button type="button" style={boton} onClick={guardar}>Guardar</button>}
    </div>
  );
}

/* ---------- Historial ---------- */

interface Evento {
  fecha: string;
  tabla: string;
  accion: string;
  usuario: string | null;
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
}

const NOMBRE_TABLA: Record<string, string> = { items: 'Ítem', item_logistica: 'Logística', item_proveedor: 'Proveedor' };
const ACCION: Record<string, string> = { insert: 'Creado', update: 'Modificado', delete: 'Eliminado' };

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
    return `proveedor ${fmt(fila.proveedor_id)} · ref ${fmt(fila.codigo_proveedor)} · nombre ${fmt(fila.nombre_producto_proveedor)}`;
  }
  return '';
}

function TabHistorial({
  supabase, organizacionId, itemId,
}: {
  supabase: SupabaseClient;
  organizacionId: string;
  itemId: number;
}) {
  const [filas, setFilas] = useState<Evento[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.rpc('item_historial', { p_org: organizacionId, p_item: itemId }).then(({ data, error }) => {
      if (error) setError(error.message);
      else setFilas((data ?? []) as Evento[]);
    });
  }, [supabase, organizacionId, itemId]);

  if (error) return <p style={{ color: '#b00020', fontSize: 13 }}>{error}</p>;
  if (!filas) return <p>Cargando…</p>;
  if (filas.length === 0) return <p style={{ fontSize: 13 }}>Aún no hay cambios registrados (el historial empieza desde esta versión).</p>;

  return (
    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
      <thead>
        <tr>
          {['Fecha', 'Usuario', 'Qué', 'Acción', 'Detalle'].map((h) => (
            <th key={h} style={{ ...celda, background: '#eee', fontWeight: 700 }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas.map((e, i) => (
          <tr key={i}>
            <td style={celda}>{fecha(e.fecha)}</td>
            <td style={celda}>{e.usuario ?? 'Sistema'}</td>
            <td style={celda}>{NOMBRE_TABLA[e.tabla] ?? e.tabla}</td>
            <td style={celda}>{ACCION[e.accion] ?? e.accion}</td>
            <td style={celda}>{describir(e)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
