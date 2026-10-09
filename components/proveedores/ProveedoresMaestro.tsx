'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import ProveedorDetalle from '@/components/proveedores/ProveedorDetalle';
import { usePermisos } from '@/components/items/usePermisos';
import {  } from '@/components/pedidos/comun';
import TablaExcel from '@/components/TablaExcel';

interface FilaProveedor {
  proveedor_id: number;
  tipo_documento: string;
  numero_documento: string;
  nombre: string;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  cobra_iva: boolean;
  iva_compra: number;
  items: number;
  total: number;
}

export const TIPOS_DOCUMENTO = ['NIT', 'CC', 'CE', 'PAS', 'OTRO'] as const;
const POR_PAGINA = 50;

export default function ProveedoresMaestro({ organizacionId }: { organizacionId: string }) {
  const [supabase] = useState(() => createClient());
  const permisos = usePermisos(supabase, organizacionId);

  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(0);
  const [filas, setFilas] = useState<FilaProveedor[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState<number | null>(null);
  const [creando, setCreando] = useState(false);
  const peticion = useRef(0);

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
    const { data, error } = await supabase.rpc('proveedores_listar', {
      p_org: organizacionId,
      p_busqueda: busqueda.trim() || null,
      p_limit: POR_PAGINA,
      p_offset: pagina * POR_PAGINA,
    });
    if (mia !== peticion.current) return;
    setCargando(false);
    if (error) {
      setError(error.message);
      return;
    }
    setError('');
    const lista = (data ?? []) as FilaProveedor[];
    setFilas(lista);
    setTotal(lista[0]?.total ?? 0);
  }, [supabase, organizacionId, busqueda, pagina]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (abierto !== null) {
    return (
      <ProveedorDetalle
        supabase={supabase}
        organizacionId={organizacionId}
        proveedorId={abierto}
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
          placeholder="Buscar por nombre, documento, contacto o correo"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        {permisos.provCrear && (
          <button type="button" className={creando ? 'ui-btn ui-btn--sm' : 'ui-btn ui-btn--sm ui-btn--primary'} onClick={() => setCreando((v) => !v)}>
            {creando ? 'Cancelar' : '+ Nuevo proveedor'}
          </button>
        )}
        <span className="mod-text">{cargando ? 'Cargando…' : `${total} proveedor(es)`}</span>
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

      <TablaExcel clave="proveedoresmaestro-1" etiqueta="Tabla de proveedores"><table className="mod-table">
        <thead>
          <tr>
            {['Documento', 'Nombre', 'Contacto', 'Teléfono', 'IVA de compra', 'Ítems'].map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.proveedor_id} onClick={() => setAbierto(f.proveedor_id)} className="is-clickable">
              <td>{f.tipo_documento} {f.numero_documento}</td>
              <td>{f.nombre}</td>
              <td>{f.contacto ?? ''}</td>
              <td>{f.telefono ?? ''}</td>
              <td>{f.cobra_iva ? `${Math.round(f.iva_compra * 10000) / 100}%` : 'No cobra IVA'}</td>
              <td>{f.items || ''}</td>
            </tr>
          ))}
          {!cargando && filas.length === 0 && (
            <tr><td colSpan={6}>No hay proveedores con ese filtro.</td></tr>
          )}
        </tbody>
      </table></TablaExcel>

      <div className="mod-pager">
        <button type="button" className="ui-btn ui-btn--sm" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>Anterior</button>
        <span className="mod-text">Página {pagina + 1} de {paginas}</span>
        <button type="button" className="ui-btn ui-btn--sm" disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)}>Siguiente</button>
      </div>
    </div>
  );
}

function FormNuevo({
  supabase, organizacionId, onCreado,
}: {
  supabase: ReturnType<typeof createClient>;
  organizacionId: string;
  onCreado: (id: number) => void;
}) {
  const [v, setV] = useState({ tipo_documento: 'NIT', numero_documento: '', nombre: '', contacto: '', telefono: '', email: '' });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function crear() {
    setError('');
    if (!/^[A-Za-z0-9]{3,20}$/.test(v.numero_documento.trim().replace(/[\s.]/g, ''))) {
      return setError('Documento no válido: de 3 a 20 letras o números, sin guiones ni dígito de verificación.');
    }
    if (!v.nombre.trim()) return setError('Escribe el nombre del proveedor.');
    setGuardando(true);
    const { data, error } = await supabase.rpc('proveedor_crear', { p_org: organizacionId, p_datos: v });
    setGuardando(false);
    if (error) return setError(error.message);
    onCreado(Number(data));
  }

  const set = (k: keyof typeof v, x: string) => setV({ ...v, [k]: x });

  return (
    <div className="mod-card mod-mb-3">
      <div className="mod-semibold mod-mb-2">Nuevo proveedor</div>
      <div className="mod-flex mod-gap-2 mod-wrap">
        <select className="ui-input ui-input--sm mod-auto" value={v.tipo_documento} onChange={(e) => set('tipo_documento', e.target.value)}>
          {TIPOS_DOCUMENTO.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input className="ui-input ui-input--sm" style={{ width: 170 }} placeholder="Número *" value={v.numero_documento}
          onChange={(e) => set('numero_documento', e.target.value)} />
        <input className="ui-input ui-input--sm mod-auto" style={{ minWidth: 280 }} placeholder="Nombre *" value={v.nombre} onChange={(e) => set('nombre', e.target.value)} />
        <input className="ui-input ui-input--sm" style={{ width: 180 }} placeholder="Contacto" value={v.contacto} onChange={(e) => set('contacto', e.target.value)} />
        <input className="ui-input ui-input--sm" style={{ width: 150 }} placeholder="Teléfono" value={v.telefono} onChange={(e) => set('telefono', e.target.value)} />
        <input className="ui-input ui-input--sm" style={{ width: 220 }} placeholder="Correo" value={v.email} onChange={(e) => set('email', e.target.value)} />
        <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" disabled={guardando} onClick={crear}>{guardando ? 'Guardando…' : 'Crear'}</button>
      </div>
      <p className="mod-sub mod-mt-2 mod-mb-0">
        Por defecto cobra IVA al 19 %. Puedes cambiarlo dentro del proveedor.
      </p>
      {error && <p className="mod-error mod-text mod-mt-2 mod-mb-0">{error}</p>}
    </div>
  );
}
