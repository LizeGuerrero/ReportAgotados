'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import ItemDetalle from '@/components/items/ItemDetalle';
import { usePermisos } from '@/components/items/usePermisos';
import { boton, campo, celda, idVisible } from '@/components/pedidos/comun';

interface FilaItem {
  item_id: number;
  codigo: string | null;
  nombre_base: string;
  linea: string | null;
  unidad_medida: string | null;
  iva: number | null;
  activo: boolean;
  provisional: boolean;
  proveedores: number;
  referencias: string | null;
  total: number;
}

const POR_PAGINA = 50;

export default function ItemsMaestro({ organizacionId }: { organizacionId: string }) {
  const [supabase] = useState(() => createClient());
  const permisos = usePermisos(supabase, organizacionId);

  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState<'activos' | 'inhabilitados' | 'todos'>('activos');
  const [pagina, setPagina] = useState(0);
  const [filas, setFilas] = useState<FilaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState<number | null>(null);
  const [creando, setCreando] = useState(false);
  const peticion = useRef(0);

  // Espera a que el usuario deje de escribir antes de consultar.
  useEffect(() => {
    const t = setTimeout(() => {
      setBusqueda(texto);
      setPagina(0);
    }, 300);
    return () => clearTimeout(t);
  }, [texto]);

  const cargar = useCallback(async () => {
    const mia = ++peticion.current;
    setCargando(true);
    const { data, error } = await supabase.rpc('items_listar', {
      p_org: organizacionId,
      p_busqueda: busqueda.trim() || null,
      p_estado: estado,
      p_limit: POR_PAGINA,
      p_offset: pagina * POR_PAGINA,
    });
    if (mia !== peticion.current) return; // llegó una respuesta más nueva
    setCargando(false);
    if (error) {
      setError(error.message);
      return;
    }
    setError('');
    const lista = (data ?? []) as FilaItem[];
    setFilas(lista);
    setTotal(lista[0]?.total ?? 0);
  }, [supabase, organizacionId, busqueda, estado, pagina]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (abierto !== null) {
    return (
      <ItemDetalle
        supabase={supabase}
        organizacionId={organizacionId}
        itemId={abierto}
        permisos={permisos}
        onVolver={() => {
          setAbierto(null);
          cargar();
        }}
      />
    );
  }

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <input
          style={{ ...campo, minWidth: 320 }}
          placeholder="Buscar por código, nombre, referencia o nombre del proveedor"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <select
          style={campo}
          value={estado}
          onChange={(e) => {
            setEstado(e.target.value as typeof estado);
            setPagina(0);
          }}
        >
          <option value="activos">Activos</option>
          <option value="inhabilitados">Inhabilitados</option>
          <option value="todos">Todos</option>
        </select>
        {permisos.itemsCrear && (
          <button type="button" style={boton} onClick={() => setCreando((v) => !v)}>
            {creando ? 'Cancelar' : '+ Nuevo ítem'}
          </button>
        )}
        <span style={{ fontSize: 13 }}>{cargando ? 'Cargando…' : `${total} ítem(s)`}</span>
      </div>

      {creando && (
        <FormNuevo
          supabase={supabase}
          organizacionId={organizacionId}
          onCreado={(id) => {
            setCreando(false);
            setAbierto(id);
          }}
        />
      )}

      {error && <p style={{ color: '#b00020', fontSize: 13 }}>{error}</p>}

      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            {['Código', 'Nombre', 'Línea', 'Unidad', 'Proveedores', 'Referencias', 'Estado'].map((h) => (
              <th key={h} style={{ ...celda, background: '#eee', fontWeight: 700 }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr
              key={f.item_id}
              onClick={() => setAbierto(f.item_id)}
              style={{ cursor: 'pointer', opacity: f.activo ? 1 : 0.55 }}
            >
              <td style={celda}>{idVisible(f.item_id, f.provisional, f.codigo)}</td>
              <td style={celda}>{f.nombre_base}</td>
              <td style={celda}>{f.linea ?? ''}</td>
              <td style={celda}>{f.unidad_medida ?? ''}</td>
              <td style={celda}>{f.proveedores || ''}</td>
              <td style={celda}>{f.referencias ?? ''}</td>
              <td style={celda}>{f.activo ? 'Activo' : 'Inhabilitado'}</td>
            </tr>
          ))}
          {!cargando && filas.length === 0 && (
            <tr>
              <td style={celda} colSpan={7}>
                No hay ítems con ese filtro.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
        <button type="button" style={boton} disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>
          Anterior
        </button>
        <span style={{ fontSize: 13 }}>
          Página {pagina + 1} de {paginas}
        </span>
        <button type="button" style={boton} disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)}>
          Siguiente
        </button>
      </div>
    </div>
  );
}

function FormNuevo({
  supabase,
  organizacionId,
  onCreado,
}: {
  supabase: ReturnType<typeof createClient>;
  organizacionId: string;
  onCreado: (id: number) => void;
}) {
  const [v, setV] = useState({ codigo_erp: '', nombre_base: '', unidad_medida: '', linea: '' });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function crear() {
    setError('');
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(v.codigo_erp.trim())) return setError('El código solo puede tener letras, números, punto, guion y guion bajo (máx. 40).');
    if (!v.nombre_base.trim()) return setError('Escribe el nombre del ítem.');
    setGuardando(true);
    const { data, error } = await supabase.rpc('item_crear', { p_org: organizacionId, p_datos: v });
    setGuardando(false);
    if (error) return setError(error.message);
    onCreado(Number(data));
  }

  return (
    <div style={{ border: '1px solid #000', padding: 12, marginBottom: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Nuevo ítem</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input style={{ ...campo, width: 130 }} placeholder="Código ERP *" value={v.codigo_erp}
          onChange={(e) => setV({ ...v, codigo_erp: e.target.value })} />
        <input style={{ ...campo, minWidth: 300 }} placeholder="Nombre *" value={v.nombre_base}
          onChange={(e) => setV({ ...v, nombre_base: e.target.value })} />
        <input style={{ ...campo, width: 120 }} placeholder="Unidad" value={v.unidad_medida}
          onChange={(e) => setV({ ...v, unidad_medida: e.target.value })} />
        <input style={{ ...campo, width: 160 }} placeholder="Línea" value={v.linea}
          onChange={(e) => setV({ ...v, linea: e.target.value })} />
        <button type="button" style={boton} disabled={guardando} onClick={crear}>
          {guardando ? 'Guardando…' : 'Crear'}
        </button>
      </div>
      <p style={{ fontSize: 12, margin: '8px 0 0' }}>
        El resto de los datos (IVA, logística, proveedores) se completan dentro del ítem.
      </p>
      {error && <p style={{ color: '#b00020', fontSize: 13, margin: '6px 0 0' }}>{error}</p>}
    </div>
  );
}
