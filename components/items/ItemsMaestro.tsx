'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import ItemDetalle from '@/components/items/ItemDetalle';
import { usePermisos } from '@/components/items/usePermisos';
import { idVisible } from '@/components/pedidos/comun';
import FormItemNuevo from '@/components/items/FormItemNuevo';

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
        <FormItemNuevo
          supabase={supabase}
          organizacionId={organizacionId}
          onCreado={(id) => {
            setCreando(false);
            setAbierto(id);
          }}
        />
      )}

      {error && <p className="mod-error mod-text">{error}</p>}

      <table className="mod-table">
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
              <td>{f.activo ? 'Activo' : 'Inhabilitado'}</td>
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
      </table>

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
