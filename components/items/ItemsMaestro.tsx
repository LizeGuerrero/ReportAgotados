'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import ItemDetalle from '@/components/items/ItemDetalle';
import { usePermisos } from '@/components/items/usePermisos';
import { idVisible } from '@/components/pedidos/comun';
import TablaExcel from '@/components/TablaExcel';

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
      <div className="mod-toolbar">
        <input
          className="ui-input ui-input--sm mod-auto" style={{ minWidth: 320 }}
          placeholder="Buscar por código, nombre, referencia o nombre del proveedor"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <select
          className="ui-input ui-input--sm mod-auto"
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
          <button type="button" className={creando ? 'ui-btn ui-btn--sm' : 'ui-btn ui-btn--sm ui-btn--primary'} onClick={() => setCreando((v) => !v)}>
            {creando ? 'Cancelar' : '+ Nuevo ítem'}
          </button>
        )}
        <span className="mod-text">{cargando ? 'Cargando…' : `${total} ítem(s)`}</span>
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

      {error && <p className="mod-error mod-text">{error}</p>}

      <TablaExcel clave="itemsmaestro-1" etiqueta="Tabla de ítems"><table className="mod-table">
        <thead>
          <tr>
            {['Código', 'Nombre', 'Línea', 'Unidad', 'Proveedores', 'Referencias', 'Estado'].map((h) => (
              <th key={h}>
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
              className={f.activo ? 'is-clickable' : 'is-clickable is-inactive'}
            >
              <td>{idVisible(f.item_id, f.provisional, f.codigo)}</td>
              <td>{f.nombre_base}</td>
              <td>{f.linea ?? ''}</td>
              <td>{f.unidad_medida ?? ''}</td>
              <td>{f.proveedores || ''}</td>
              <td>{f.referencias ?? ''}</td>
              <td>{f.activo ? <span className="ui-badge ui-badge--success">Activo</span> : <span className="ui-badge">Inhabilitado</span>}</td>
            </tr>
          ))}
          {!cargando && filas.length === 0 && (
            <tr>
              <td colSpan={7}>
                No hay ítems con ese filtro.
              </td>
            </tr>
          )}
        </tbody>
      </table></TablaExcel>

      <div className="mod-pager">
        <button type="button" className="ui-btn ui-btn--sm" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>
          Anterior
        </button>
        <span className="mod-text">
          Página {pagina + 1} de {paginas}
        </span>
        <button type="button" className="ui-btn ui-btn--sm" disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)}>
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
    <div className="mod-card mod-mb-3">
      <div className="mod-semibold mod-mb-2">Nuevo ítem</div>
      <div className="mod-flex mod-gap-2 mod-wrap">
        <input className="ui-input ui-input--sm" style={{ width: 130 }} placeholder="Código ERP *" value={v.codigo_erp}
          onChange={(e) => setV({ ...v, codigo_erp: e.target.value })} />
        <input className="ui-input ui-input--sm mod-auto" style={{ minWidth: 300 }} placeholder="Nombre *" value={v.nombre_base}
          onChange={(e) => setV({ ...v, nombre_base: e.target.value })} />
        <input className="ui-input ui-input--sm" style={{ width: 120 }} placeholder="Unidad" value={v.unidad_medida}
          onChange={(e) => setV({ ...v, unidad_medida: e.target.value })} />
        <input className="ui-input ui-input--sm" style={{ width: 160 }} placeholder="Línea" value={v.linea}
          onChange={(e) => setV({ ...v, linea: e.target.value })} />
        <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" disabled={guardando} onClick={crear}>
          {guardando ? 'Guardando…' : 'Crear'}
        </button>
      </div>
      <p className="mod-sub mod-mt-2 mod-mb-0">
        El resto de los datos (IVA, logística, proveedores) se completan dentro del ítem.
      </p>
      {error && <p className="mod-error mod-text mod-mt-2 mod-mb-0">{error}</p>}
    </div>
  );
}
