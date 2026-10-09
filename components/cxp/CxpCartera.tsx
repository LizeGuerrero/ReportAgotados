'use client';

import '@/styles/cxp.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AlertIcon, SearchIcon, SortIcon } from '@/components/ui/icons';
import ComboProveedor, { claveProveedor } from './ComboProveedor';
import FormPendiente from './FormPendiente';
import { usePermisosCxp } from './usePermisosCxp';
import {
  TOTALES_VACIOS,
  aNumero,
  fechaCorta,
  fechaHora,
  moneda,
  type FilaCxp,
  type ProveedorFiltro,
  type TotalesCxp,
} from './tipos';

const POR_PAGINA = 50;

type Vencimiento = '' | 'vencidos' | 'por_vencer';
interface Orden {
  clave: string;
  dir: 'asc' | 'desc';
}

interface Columna {
  clave: string;
  titulo: string;
  orden?: string; // nombre de la columna de orden en la base de datos
  num?: boolean;
}

const COLUMNAS_BASE: Columna[] = [
  { clave: 'origen', titulo: 'En sistema' },
  { clave: 'empresa', titulo: 'Empresa' },
  { clave: 'tercero', titulo: 'NIT', orden: 'tercero' },
  { clave: 'nombre', titulo: 'Proveedor', orden: 'nombre' },
  { clave: 'cond_pago', titulo: 'Cond. pago' },
  { clave: 'docto', titulo: 'Factura prov.' },
  { clave: 'fecha_dcto', titulo: 'F. documento', orden: 'fecha_dcto' },
  { clave: 'fecha_vcto', titulo: 'F. vencimiento', orden: 'fecha_vcto' },
  { clave: 'plazo', titulo: 'Plazo', num: true },
  { clave: 'dias', titulo: 'Días venc.', orden: 'dias_venc', num: true },
  { clave: 'anticipos', titulo: 'Anticipos', num: true },
  { clave: 'descuentos', titulo: 'Descuentos', num: true },
  { clave: 'retenciones', titulo: 'Adic. retenciones', num: true },
  { clave: 'total', titulo: 'Total factura', orden: 'total_factura', num: true },
  { clave: 'pagar', titulo: 'Val. a pagar', orden: 'val_pagar', num: true },
  { clave: 'detalles', titulo: 'Detalles' },
];

const COLUMNAS_PAGADO: Columna[] = [
  { clave: 'fecha_pago', titulo: 'Pagado el', orden: 'fecha_pago' },
  { clave: 'pagado_por', titulo: 'Pagado por' },
];

interface Aviso {
  texto: string;
  error?: boolean;
}

export default function CxpCartera({
  organizacionId,
  estado,
  titulo,
  descripcion,
}: {
  organizacionId: string;
  estado: 'pendiente' | 'pagado';
  titulo: string;
  descripcion: string;
}) {
  const [supabase] = useState(() => createClient());
  const permisos = usePermisosCxp(supabase, organizacionId);
  const esPagados = estado === 'pagado';

  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [sede, setSede] = useState('');
  const [origen, setOrigen] = useState('');
  const [vencimiento, setVencimiento] = useState<Vencimiento>('');
  const [orden, setOrden] = useState<Orden | null>(null);
  const [pagina, setPagina] = useState(0);

  const [filas, setFilas] = useState<FilaCxp[]>([]);
  const [total, setTotal] = useState(0);
  const [totales, setTotales] = useState<TotalesCxp>(TOTALES_VACIOS);
  const [proveedores, setProveedores] = useState<ProveedorFiltro[]>([]);
  const [sedes, setSedes] = useState<{ id: string; nombre: string }[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [formulario, setFormulario] = useState<{ editar: FilaCxp | null } | null>(null);
  const peticion = useRef(0);

  // Espera a que se deje de escribir antes de consultar.
  useEffect(() => {
    const t = setTimeout(() => {
      setBusqueda(texto);
      setPagina(0);
    }, 300);
    return () => clearTimeout(t);
  }, [texto]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  // El proveedor elegido se envía por NIT; si el proveedor no tiene NIT, por nombre.
  const filtroProveedor = useMemo(() => {
    if (proveedor.startsWith('t:')) return { p_tercero: proveedor.slice(2), p_nombre: null };
    if (proveedor.startsWith('n:')) return { p_tercero: null, p_nombre: proveedor.slice(2) };
    return { p_tercero: null, p_nombre: null };
  }, [proveedor]);

  const cargarListas = useCallback(async () => {
    const [prov, sed] = await Promise.all([
      supabase.rpc('cxp_proveedores_filtro', { p_org: organizacionId, p_estado: estado }),
      supabase.rpc('cxp_listar_sedes', { p_org: organizacionId }),
    ]);
    const lista = (prov.data ?? []) as ProveedorFiltro[];
    setProveedores(lista);
    setSedes((sed.data ?? []) as { id: string; nombre: string }[]);
    // Si el proveedor filtrado ya no tiene documentos (p. ej. se pagó el último), se quita el filtro.
    setProveedor((actual) => (actual && !lista.some((p) => claveProveedor(p) === actual) ? '' : actual));
  }, [supabase, organizacionId, estado]);

  const cargar = useCallback(async () => {
    const mia = ++peticion.current;
    setCargando(true);
    const comunes = {
      p_org: organizacionId,
      p_estado: estado,
      p_busqueda: busqueda.trim() || null,
      p_tercero: filtroProveedor.p_tercero,
      p_nombre: filtroProveedor.p_nombre,
      p_sede: sede || null,
      p_origen: origen || null,
    };
    const [lista, tot] = await Promise.all([
      supabase.rpc('cxp_listar', {
        ...comunes,
        p_vencimiento: vencimiento || null,
        p_orden: orden?.clave ?? null,
        p_dir: orden?.dir ?? 'asc',
        p_limit: POR_PAGINA,
        p_offset: pagina * POR_PAGINA,
      }),
      supabase.rpc('cxp_totales', comunes),
    ]);
    if (mia !== peticion.current) return; // llegó una respuesta más nueva
    setCargando(false);
    if (lista.error || tot.error) {
      setError((lista.error ?? tot.error)!.message);
      return;
    }
    setError('');
    const f = (lista.data ?? []) as FilaCxp[];
    setFilas(f);
    setTotal(f[0]?.total ?? 0);
    const t = ((tot.data ?? []) as TotalesCxp[])[0];
    setTotales(t ?? TOTALES_VACIOS);
  }, [supabase, organizacionId, estado, busqueda, filtroProveedor, sede, origen, vencimiento, orden, pagina]);

  useEffect(() => {
    cargarListas();
  }, [cargarListas]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  // Si se vació la última página (p. ej. se pagó el único documento), retrocede una.
  useEffect(() => {
    if (!cargando && filas.length === 0 && pagina > 0) setPagina((p) => p - 1);
  }, [cargando, filas.length, pagina]);

  const recargarTodo = () => {
    cargar();
    cargarListas();
  };

  function alternarOrden(clave: string) {
    setPagina(0);
    setOrden((o) => {
      if (!o || o.clave !== clave) return { clave, dir: 'asc' };
      if (o.dir === 'asc') return { clave, dir: 'desc' };
      return null;
    });
  }

  function filtrar<T>(poner: (v: T) => void) {
    return (v: T) => {
      poner(v);
      setPagina(0);
    };
  }

  // ---- Acciones sobre una fila ----
  async function guardarCampo(f: FilaCxp, campo: 'anticipos' | 'descuentos' | 'retenciones' | 'detalles', valor: string) {
    let dato: string | number = valor;
    if (campo !== 'detalles') {
      const n = aNumero(valor);
      if (Number.isNaN(n)) {
        setAviso({ texto: 'Escribe solo números.', error: true });
        return false;
      }
      dato = n;
    }
    const { error } = await supabase.rpc('cxp_actualizar', {
      p_org: organizacionId,
      p_id: f.id,
      p_datos: { [campo]: dato },
    });
    if (error) {
      setAviso({ texto: error.message, error: true });
      return false;
    }
    cargar();
    return true;
  }

  async function marcarPagado(f: FilaCxp) {
    const ok = window.confirm(
      `¿Marcar como PAGADO?\n\n${f.nombre}\n${f.docto_proveedor ?? f.documento_erp ?? ''}\nValor a pagar: ${moneda(f.val_pagar)}\n\nQuedará con la fecha y hora de ahora.`,
    );
    if (!ok) return;
    const { error } = await supabase.rpc('cxp_marcar_pagado', { p_org: organizacionId, p_ids: [f.id] });
    if (error) return setAviso({ texto: error.message, error: true });
    setAviso({ texto: 'Marcado como pagado.' });
    recargarTodo();
  }

  async function reabrir(f: FilaCxp) {
    if (!window.confirm(`¿Devolver a la cartera como pendiente?\n\n${f.nombre}`)) return;
    const { error } = await supabase.rpc('cxp_reabrir', { p_org: organizacionId, p_id: f.id });
    if (error) return setAviso({ texto: error.message, error: true });
    setAviso({ texto: 'Devuelto a la cartera.' });
    recargarTodo();
  }

  async function eliminar(f: FilaCxp) {
    if (!window.confirm(`¿Eliminar este pendiente manual?\n\n${f.nombre} · ${moneda(f.total_factura)}`)) return;
    const { error } = await supabase.rpc('cxp_manual_eliminar', { p_org: organizacionId, p_id: f.id });
    if (error) return setAviso({ texto: error.message, error: true });
    setAviso({ texto: 'Pendiente eliminado.' });
    recargarTodo();
  }

  const columnas = esPagados ? [...COLUMNAS_BASE, ...COLUMNAS_PAGADO] : COLUMNAS_BASE;
  const hayAcciones = esPagados ? permisos.pagar : permisos.pagar || permisos.editar || permisos.eliminar;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const nColumnas = columnas.length + (hayAcciones ? 1 : 0);

  return (
    <div>
      <div className="cxp-top">
        <div className="ag-head">
          <h1 className="ag-title">{titulo}</h1>
          <p className="ag-lead">{descripcion}</p>
        </div>
        <div className="cxp-kpis" role="group" aria-label="Resumen de la cartera">
          {esPagados ? (
            <Kpi titulo="Total pagado" valor={totales.suma_total} cantidad={totales.n_total} activo={false} />
          ) : (
            <>
              <Kpi
                titulo="Total CXP"
                valor={totales.suma_total}
                cantidad={totales.n_total}
                activo={vencimiento === ''}
                onClick={() => filtrar(setVencimiento)('')}
              />
              <Kpi
                titulo="Vencido"
                tono="danger"
                valor={totales.suma_vencido}
                cantidad={totales.n_vencido}
                activo={vencimiento === 'vencidos'}
                onClick={() => filtrar(setVencimiento)(vencimiento === 'vencidos' ? '' : 'vencidos')}
              />
              <Kpi
                titulo="Por vencer"
                tono="success"
                valor={totales.suma_por_vencer}
                cantidad={totales.n_por_vencer}
                activo={vencimiento === 'por_vencer'}
                onClick={() => filtrar(setVencimiento)(vencimiento === 'por_vencer' ? '' : 'por_vencer')}
              />
            </>
          )}
        </div>
      </div>

      <div className="ag-toolbar">
        <div className="ag-toolbar__filters">
          <ComboProveedor proveedores={proveedores} valor={proveedor} onCambio={filtrar(setProveedor)} />
          <div className="ag-search">
            <SearchIcon className="ag-search__icon" />
            <input
              type="search"
              className="ui-input"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Buscar por proveedor, NIT, factura o detalle"
              aria-label="Buscar"
            />
          </div>
          {sedes.length > 1 && (
            <select className="ui-input cxp-select" aria-label="Sede" value={sede} onChange={(e) => filtrar(setSede)(e.target.value)}>
              <option value="">Todas las sedes</option>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          )}
          <select className="ui-input cxp-select" aria-label="Origen" value={origen} onChange={(e) => filtrar(setOrigen)(e.target.value)}>
            <option value="">ERP y manuales</option>
            <option value="erp">Solo ERP</option>
            <option value="manual">Solo manuales</option>
          </select>
        </div>
        {!esPagados && permisos.crear && (
          <button type="button" className="ui-btn ui-btn--primary" onClick={() => setFormulario({ editar: null })}>
            + Agregar pendiente
          </button>
        )}
      </div>

      {error && (
        <div className="ui-alert ui-alert--error ag-alert" role="alert">
          <AlertIcon className="ui-alert__icon" />
          <span>{error}</span>
        </div>
      )}

      <p className="ag-summary" aria-live="polite">
        {cargando ? 'Cargando…' : `${total} documento(s)`}
        {proveedor && <span>· filtrado por proveedor: los totales son de ese proveedor</span>}
        {!esPagados && <span className="cxp-leyenda"><i className="cxp-leyenda__muestra" /> Manual: aún no está en el ERP</span>}
      </p>

      <div className={cargando ? 'ag-tablewrap is-loading' : 'ag-tablewrap'} role="region" aria-label="Cartera por pagar" tabIndex={0}>
        <table className="ag-table cxp-table">
          <thead>
            <tr>
              {columnas.map((c) => {
                const activa = !!c.orden && orden?.clave === c.orden;
                const ariaSort = c.orden
                  ? activa ? (orden!.dir === 'asc' ? ('ascending' as const) : ('descending' as const)) : ('none' as const)
                  : undefined;
                return (
                  <th key={c.clave} scope="col" aria-sort={ariaSort} className={c.orden ? 'ag-th--sort' : undefined}>
                    {c.orden ? (
                      <button type="button" className="ag-sort" onClick={() => alternarOrden(c.orden!)} title={`Ordenar por ${c.titulo}`}>
                        <span className="ag-sort__label">{c.titulo}</span>
                        <SortIcon />
                      </button>
                    ) : (
                      <span className="ag-th__label cxp-th">{c.titulo}</span>
                    )}
                  </th>
                );
              })}
              {hayAcciones && <th scope="col"><span className="ag-th__label cxp-th">Acciones</span></th>}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const anotable = !esPagados && permisos.editar;
              return (
                <tr key={f.id} className={f.origen === 'manual' ? 'cxp-row--manual' : undefined}>
                  <td>
                    {f.origen === 'manual' ? (
                      <span className="ui-badge ui-badge--info" title="Escrito a mano: todavía no está en el ERP">Manual</span>
                    ) : (
                      <span className="ui-badge ui-badge--success" title={f.documento_erp ? `Documento del ERP: ${f.documento_erp}` : undefined}>ERP</span>
                    )}
                  </td>
                  <td>{f.empresa ?? ''}</td>
                  <td>{f.tercero ?? ''}</td>
                  <td className="cxp-col-nombre">{f.nombre}</td>
                  <td>{f.cond_pago ?? ''}</td>
                  <td>{f.docto_proveedor ?? ''}</td>
                  <td>{fechaCorta(f.fecha_dcto)}</td>
                  <td>{fechaCorta(f.fecha_vcto)}</td>
                  <td className="cxp-num">{f.plazo ?? ''}</td>
                  <td className={`cxp-num ${claseDias(f.dias_venc)}`}>{f.dias_venc}</td>
                  <td className="cxp-num">
                    <CeldaEditable tipo="num" valor={f.anticipos} editable={anotable} etiqueta="Anticipos" onGuardar={(v) => guardarCampo(f, 'anticipos', v)} />
                  </td>
                  <td className="cxp-num">
                    <CeldaEditable tipo="num" valor={f.descuentos} editable={anotable} etiqueta="Descuentos" onGuardar={(v) => guardarCampo(f, 'descuentos', v)} />
                  </td>
                  <td className="cxp-num">
                    <CeldaEditable tipo="num" valor={f.retenciones} editable={anotable} etiqueta="Adicionales retenciones" onGuardar={(v) => guardarCampo(f, 'retenciones', v)} />
                  </td>
                  <td className="cxp-num">{moneda(f.total_factura)}</td>
                  <td className="cxp-num cxp-pagar">{moneda(f.val_pagar)}</td>
                  <td className="cxp-col-detalles">
                    <CeldaEditable tipo="texto" valor={f.detalles ?? ''} editable={anotable} etiqueta="Detalles" onGuardar={(v) => guardarCampo(f, 'detalles', v)} />
                  </td>
                  {esPagados && <td>{fechaHora(f.fecha_pago)}</td>}
                  {esPagados && <td>{f.pagado_por ?? ''}</td>}
                  {hayAcciones && (
                    <td>
                      <div className="cxp-acciones">
                        {!esPagados && permisos.pagar && (
                          <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" onClick={() => marcarPagado(f)}>
                            Pagado
                          </button>
                        )}
                        {!esPagados && f.origen === 'manual' && permisos.editar && (
                          <button type="button" className="ui-btn ui-btn--sm" onClick={() => setFormulario({ editar: f })}>
                            Editar
                          </button>
                        )}
                        {!esPagados && f.origen === 'manual' && permisos.eliminar && (
                          <button type="button" className="ui-btn ui-btn--sm ui-btn--danger" onClick={() => eliminar(f)}>
                            Eliminar
                          </button>
                        )}
                        {esPagados && permisos.pagar && (
                          <button type="button" className="ui-btn ui-btn--sm" onClick={() => reabrir(f)}>
                            Reabrir
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
            {!cargando && filas.length === 0 && (
              <tr>
                <td className="ag-empty" colSpan={nColumnas}>
                  {esPagados ? 'Aún no hay documentos pagados.' : 'No hay cuentas por pagar con ese filtro.'}
                </td>
              </tr>
            )}
            {cargando && filas.length === 0 && (
              <tr>
                <td className="ag-empty" colSpan={nColumnas}>Cargando…</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="ag-pager">
        <button type="button" className="ui-btn ui-btn--sm" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>
          Anterior
        </button>
        <span>Página {pagina + 1} de {paginas}</span>
        <button type="button" className="ui-btn ui-btn--sm" disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)}>
          Siguiente
        </button>
      </div>

      <div role="status" aria-live="polite">
        {aviso && <div className={aviso.error ? 'ag-toast ag-toast--error' : 'ag-toast'}>{aviso.texto}</div>}
      </div>

      {formulario && (
        <FormPendiente
          supabase={supabase}
          organizacionId={organizacionId}
          sedes={sedes}
          inicial={formulario.editar}
          onCerrar={() => setFormulario(null)}
          onGuardado={() => {
            const eraNuevo = formulario.editar === null;
            setFormulario(null);
            setAviso({ texto: eraNuevo ? 'Pendiente agregado.' : 'Cambios guardados.' });
            recargarTodo();
          }}
        />
      )}
    </div>
  );
}

function claseDias(dias: number): string {
  if (dias <= 0) return 'cxp-dias--0';
  if (dias <= 30) return 'cxp-dias--1';
  if (dias <= 60) return 'cxp-dias--2';
  return 'cxp-dias--3';
}

function Kpi({
  titulo,
  valor,
  cantidad,
  tono,
  activo,
  onClick,
}: {
  titulo: string;
  valor: number;
  cantidad: number;
  tono?: 'danger' | 'success';
  activo: boolean;
  onClick?: () => void;
}) {
  const clases = ['cxp-kpi', tono ? `cxp-kpi--${tono}` : '', activo ? 'is-active' : ''].filter(Boolean).join(' ');
  const contenido = (
    <>
      <span className="cxp-kpi__titulo">{titulo}</span>
      <span className="cxp-kpi__valor">{moneda(valor)}</span>
      <span className="cxp-kpi__cantidad">{cantidad} documento(s)</span>
    </>
  );
  return onClick ? (
    <button type="button" className={clases} aria-pressed={activo} onClick={onClick}>
      {contenido}
    </button>
  ) : (
    <div className={clases}>{contenido}</div>
  );
}

/** Celda que se edita al hacer clic: Enter o salir del campo guarda, Esc cancela. */
function CeldaEditable({
  valor,
  tipo,
  editable,
  etiqueta,
  onGuardar,
}: {
  valor: number | string;
  tipo: 'num' | 'texto';
  editable: boolean;
  etiqueta: string;
  onGuardar: (v: string) => Promise<boolean>;
}) {
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState('');
  const [guardando, setGuardando] = useState(false);
  const cancelado = useRef(false);

  const mostrado = tipo === 'num' ? (Number(valor) ? moneda(Number(valor)) : '') : String(valor);
  const original = tipo === 'num' ? (Number(valor) ? String(valor) : '') : String(valor);

  if (!editable) return <>{mostrado}</>;

  if (!editando) {
    return (
      <button
        type="button"
        className="cxp-celda"
        aria-label={`Editar ${etiqueta}`}
        onClick={() => {
          cancelado.current = false;
          setBorrador(original);
          setEditando(true);
        }}
      >
        {mostrado || <span className="cxp-celda__vacia">—</span>}
      </button>
    );
  }

  async function terminar() {
    if (cancelado.current || borrador.trim() === original.trim()) {
      setEditando(false);
      return;
    }
    setGuardando(true);
    await onGuardar(borrador); // si falla, el aviso de error ya se mostró y se vuelve al valor guardado
    setGuardando(false);
    setEditando(false);
  }

  return (
    <input
      className="ui-input ui-input--sm cxp-celda__input"
      autoFocus
      disabled={guardando}
      aria-label={etiqueta}
      inputMode={tipo === 'num' ? 'decimal' : undefined}
      maxLength={tipo === 'texto' ? 500 : undefined}
      value={borrador}
      onChange={(e) => setBorrador(e.target.value)}
      onBlur={terminar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          cancelado.current = true;
          e.currentTarget.blur();
        }
      }}
    />
  );
}
