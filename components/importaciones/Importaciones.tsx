'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { usePermisos } from '@/components/items/usePermisos';
import { crearXlsx, descargar, leerArchivo, type Tabla } from '@/components/importaciones/archivo';
import { DEFINICIONES, definicion, mapeoAutomatico, plantillaXlsx, type TipoCarga } from '@/components/importaciones/plantillas';
import { fecha } from '@/components/pedidos/comun';

/* Estilos locales de esta pantalla (antes vivían en pedidos/comun). Usan los tokens de tokens.css para respetar modo claro/oscuro. */
const boton: React.CSSProperties = {
  padding: '0.35rem 0.75rem',
  fontSize: '0.8125rem',
  color: 'var(--color-text)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
};
const campo: React.CSSProperties = {
  padding: '0.35rem 0.5rem',
  fontSize: '0.8125rem',
  color: 'var(--color-text)',
  background: 'var(--color-input)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
};
const celda: React.CSSProperties = {
  padding: '0.4rem 0.6rem',
  fontSize: '0.8125rem',
  textAlign: 'left',
  verticalAlign: 'top',
  border: '1px solid var(--color-border)',
};

interface Resumen {
  total?: number;
  nuevas?: number;
  actualizar?: number;
  sin_cambios?: number;
  errores?: number;
  nuevas_aplicadas?: number;
  actualizadas_aplicadas?: number;
  fallidas?: number;
}

interface Carga {
  id: string;
  tipo: TipoCarga;
  archivo: string | null;
  estado: 'cargando' | 'validada' | 'aplicada' | 'descartada';
  resumen: Resumen;
  propia: boolean;
}

interface FilaRevision {
  fila: number;
  estado: string;
  errores: string[];
  datos: Record<string, string>;
  cambios: Record<string, unknown>;
  total: number;
}

interface FilaHistorial {
  id: string;
  tipo: TipoCarga;
  archivo: string | null;
  estado: string;
  creada_en: string;
  usuario: string | null;
  resumen: Resumen;
}

type Paso = 'inicio' | 'mapeo' | 'revision' | 'final';
type Filtro = 'error' | 'nueva' | 'actualizar' | 'sin_cambios' | 'aplicada' | '';

const ETIQUETA: Record<string, string> = {
  nueva: 'Nueva', actualizar: 'Se actualizará', sin_cambios: 'Sin cambios', error: 'Con error',
  aplicada: 'Aplicada', pendiente: 'Pendiente',
};
const POR_PAGINA = 50;
const LOTE = 500;
const n0 = (n: number | undefined) => (n ?? 0).toLocaleString('es-CO');

export default function Importaciones({ organizacionId }: { organizacionId: string }) {
  const [supabase] = useState(() => createClient());
  const permisos = usePermisos(supabase, organizacionId);

  const [tipo, setTipo] = useState<TipoCarga>('proveedores');
  const def = definicion(tipo);
  const [paso, setPaso] = useState<Paso>('inicio');
  const [tabla, setTabla] = useState<Tabla | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [mapeo, setMapeo] = useState<Record<string, number | null>>({});
  const [carga, setCarga] = useState<Carga | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('error');
  const [filas, setFilas] = useState<FilaRevision[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(0);
  const [historial, setHistorial] = useState<FilaHistorial[]>([]);
  const [ocupado, setOcupado] = useState('');
  const [error, setError] = useState('');

  const puedeCargar = permisos.impCrear && permisos.provCrear && permisos.provEditar;

  const cargarHistorial = useCallback(async () => {
    const { data } = await supabase.rpc('importacion_listar', { p_org: organizacionId });
    setHistorial((data ?? []) as FilaHistorial[]);
  }, [supabase, organizacionId]);

  useEffect(() => {
    if (permisos.cargado && permisos.impVer) cargarHistorial();
  }, [permisos.cargado, permisos.impVer, cargarHistorial]);

  const cargarFilas = useCallback(async () => {
    if (!carga) return;
    const { data, error } = await supabase.rpc('importacion_filas_listar', {
      p_org: organizacionId, p_id: carga.id, p_estado: filtro || null, p_limit: POR_PAGINA, p_offset: pagina * POR_PAGINA,
    });
    if (error) return setError(error.message);
    const lista = (data ?? []) as FilaRevision[];
    setFilas(lista);
    setTotal(lista[0]?.total ?? 0);
  }, [supabase, organizacionId, carga, filtro, pagina]);

  useEffect(() => {
    if (paso === 'revision' || paso === 'final') cargarFilas();
  }, [paso, cargarFilas]);

  function reiniciar() {
    setPaso('inicio'); setTabla(null); setNombreArchivo(''); setCarga(null); setFilas([]); setTotal(0);
    setPagina(0); setError(''); setOcupado('');
  }

  async function elegirArchivo(file: File | undefined) {
    if (!file) return;
    setError('');
    try {
      const t = await leerArchivo(file);
      setTabla(t);
      setNombreArchivo(file.name);
      setMapeo(mapeoAutomatico(def, t.columnas));
      setPaso('mapeo');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el archivo.');
    }
  }

  async function validar() {
    if (!tabla) return;
    const faltan = def.campos.filter((c) => c.obligatorio && mapeo[c.clave] == null);
    if (faltan.length) return setError(`Indica de qué columna sale: ${faltan.map((c) => c.titulo).join(', ')}.`);
    setError('');

    const usados = def.campos.filter((c) => mapeo[c.clave] != null);
    const paquete = tabla.filas.map((f) => ({
      fila: f.n,
      datos: Object.fromEntries(usados.map((c) => [c.clave, f.v[mapeo[c.clave] as number] ?? ''])),
    }));

    let id = '';
    try {
      setOcupado('Preparando la carga…');
      const ini = await supabase.rpc('importacion_iniciar', { p_org: organizacionId, p_tipo: tipo, p_archivo: nombreArchivo });
      if (ini.error) throw new Error(ini.error.message);
      id = ini.data as string;

      for (let i = 0; i < paquete.length; i += LOTE) {
        const lote = paquete.slice(i, i + LOTE);
        setOcupado(`Subiendo filas… ${Math.min(i + LOTE, paquete.length).toLocaleString('es-CO')} de ${paquete.length.toLocaleString('es-CO')}`);
        const r = await supabase.rpc('importacion_cargar', { p_org: organizacionId, p_id: id, p_filas: lote });
        if (r.error) throw new Error(r.error.message);
        if (r.data !== lote.length) throw new Error('El servidor no recibió todas las filas. Intenta de nuevo.');
      }

      setOcupado('Validando…');
      const val = await supabase.rpc('importacion_validar', { p_org: organizacionId, p_id: id });
      if (val.error) throw new Error(val.error.message);
      const resumen = val.data as Resumen;

      setCarga({ id, tipo, archivo: nombreArchivo, estado: 'validada', resumen, propia: true });
      setFiltro((resumen.errores ?? 0) > 0 ? 'error' : (resumen.nuevas ?? 0) > 0 ? 'nueva' : 'actualizar');
      setPagina(0);
      setPaso('revision');
      cargarHistorial();
    } catch (e) {
      if (id) await supabase.rpc('importacion_descartar', { p_org: organizacionId, p_id: id });
      setError(e instanceof Error ? e.message : 'No se pudo procesar el archivo.');
    } finally {
      setOcupado('');
    }
  }

  async function aplicar() {
    if (!carga) return;
    const r = carga.resumen;
    const ok = window.confirm(
      `Se crearán ${n0(r.nuevas)} y se actualizarán ${n0(r.actualizar)} registros.\n` +
        `Las ${n0(r.errores)} filas con error NO se cargarán.\n\n¿Confirmas la carga?`,
    );
    if (!ok) return;
    setError('');
    setOcupado('Aplicando…');
    const { data, error } = await supabase.rpc('importacion_aplicar', { p_org: organizacionId, p_id: carga.id });
    setOcupado('');
    if (error) return setError(error.message);
    setCarga({ ...carga, estado: 'aplicada', resumen: data as Resumen });
    setFiltro('');
    setPagina(0);
    setPaso('final');
    cargarHistorial();
  }

  async function descartar() {
    if (!carga || !window.confirm('¿Descartar esta carga? No se cambiará ningún dato.')) return;
    const { error } = await supabase.rpc('importacion_descartar', { p_org: organizacionId, p_id: carga.id });
    if (error) return setError(error.message);
    reiniciar();
    cargarHistorial();
  }

  async function descargarErrores() {
    if (!carga) return;
    setOcupado('Preparando el archivo de errores…');
    const todas: FilaRevision[] = [];
    for (let off = 0; ; off += 500) {
      const { data, error } = await supabase.rpc('importacion_filas_listar', {
        p_org: organizacionId, p_id: carga.id, p_estado: 'error', p_limit: 500, p_offset: off,
      });
      if (error) {
        setOcupado('');
        return setError(error.message);
      }
      const lote = (data ?? []) as FilaRevision[];
      todas.push(...lote);
      if (lote.length < 500) break;
    }
    const d = definicion(carga.tipo);
    const cab = ['Fila del archivo', 'Errores', ...d.campos.map((c) => c.titulo)];
    const cuerpo = todas.map((f) => [f.fila, f.errores.join(' · '), ...d.campos.map((c) => f.datos[c.clave] ?? '')]);
    descargar(
      crearXlsx([{ nombre: 'Errores', filas: [cab, ...cuerpo], textoCols: cab.map((_, i) => i).slice(2), anchos: [16, 60, ...d.campos.map(() => 22)] }]),
      `errores-${carga.tipo}.xlsx`,
    );
    setOcupado('');
  }

  async function abrir(h: FilaHistorial) {
    setError('');
    const { data, error } = await supabase.rpc('importacion_obtener', { p_org: organizacionId, p_id: h.id });
    if (error) return setError(error.message);
    const c = data as Carga;
    setTipo(c.tipo);
    setCarga(c);
    setFiltro(c.estado === 'aplicada' ? '' : (c.resumen.errores ?? 0) > 0 ? 'error' : 'nueva');
    setPagina(0);
    setPaso(c.estado === 'aplicada' ? 'final' : 'revision');
  }

  if (!permisos.cargado) return <p>Cargando…</p>;
  if (!permisos.impVer) return <p style={{ fontSize: 13 }}>No tienes permiso para ver las importaciones.</p>;

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const r = carga?.resumen ?? {};
  const aplicables = (r.nuevas ?? 0) + (r.actualizar ?? 0);

  return (
    <div>
      {error && <p style={{ color: '#b00020', fontSize: 13 }}>{error}</p>}
      {ocupado && <p style={{ fontSize: 13, fontWeight: 600 }}>{ocupado}</p>}

      {/* ---------------------------------------------------------------- inicio */}
      {paso === 'inicio' && (
        <div style={{ border: '1px solid #000', padding: 12, marginBottom: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Nueva carga</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select style={campo} value={tipo} onChange={(e) => setTipo(e.target.value as TipoCarga)}>
              {DEFINICIONES.map((d) => (
                <option key={d.tipo} value={d.tipo} disabled={!d.disponible}>
                  {d.nombre}{d.disponible ? '' : ' (próximamente)'}
                </option>
              ))}
            </select>
            {def.disponible && (
              <button type="button" style={boton} onClick={() => descargar(plantillaXlsx(def), def.archivo)}>
                Descargar plantilla (.xlsx)
              </button>
            )}
          </div>
          <p style={{ fontSize: 13, margin: '10px 0 4px' }}>{def.resumen}</p>
          <ul style={{ fontSize: 12, margin: '0 0 10px 18px', padding: 0 }}>
            {def.reglas.map((x) => <li key={x}>{x}</li>)}
          </ul>
          {puedeCargar ? (
            <label style={{ fontSize: 13 }}>
              Archivo (.xlsx o .csv):{' '}
              <input type="file" accept=".xlsx,.csv,.txt" disabled={!def.disponible || !!ocupado}
                onChange={(e) => { elegirArchivo(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          ) : (
            <p style={{ fontSize: 13 }}>
              No tienes permiso para cargar datos de este tipo (se necesita Importaciones y, para proveedores, crear y editar en Proveedores).
            </p>
          )}
        </div>
      )}

      {/* ----------------------------------------------------------------- mapeo */}
      {paso === 'mapeo' && tabla && (
        <div style={{ border: '1px solid #000', padding: 12, marginBottom: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {nombreArchivo} · {n0(tabla.filas.length)} filas{tabla.hoja ? ` · hoja "${tabla.hoja}"` : ''}
          </div>
          <p style={{ fontSize: 12, margin: '0 0 8px' }}>Revisa qué columna de tu archivo corresponde a cada dato. Lo detecté automáticamente; corrígelo si hace falta.</p>
          <table style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['Dato del sistema', 'Obligatorio', 'Columna de tu archivo', 'Primer valor'].map((h) => <th key={h} style={{ ...celda, background: 'var(--color-table-head)' }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {def.campos.map((c) => {
                const idx = mapeo[c.clave];
                return (
                  <tr key={c.clave}>
                    <td style={celda}>{c.titulo}</td>
                    <td style={celda}>{c.obligatorio ? 'Sí' : ''}</td>
                    <td style={celda}>
                      <select style={campo} value={idx ?? ''} onChange={(e) => setMapeo({ ...mapeo, [c.clave]: e.target.value === '' ? null : Number(e.target.value) })}>
                        <option value="">(no cargar)</option>
                        {tabla.columnas.map((col, i) => <option key={i} value={i}>{col}</option>)}
                      </select>
                    </td>
                    <td style={{ ...celda, color: 'var(--color-text-muted)' }}>{idx != null ? tabla.filas[0].v[idx] : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" style={boton} disabled={!!ocupado} onClick={validar}>Validar archivo</button>
            <button type="button" style={boton} disabled={!!ocupado} onClick={reiniciar}>Cancelar</button>
          </div>
          <p style={{ fontSize: 12, margin: '8px 0 0' }}>Validar no cambia ningún dato: primero verás qué pasaría y luego decides.</p>
        </div>
      )}

      {/* -------------------------------------------------------------- revisión */}
      {(paso === 'revision' || paso === 'final') && carga && (
        <div style={{ border: '1px solid #000', padding: 12, marginBottom: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            {paso === 'final' ? 'Resultado de la carga' : 'Revisión antes de cargar'} · {carga.archivo} · {definicion(carga.tipo).nombre}
          </div>

          {paso === 'final' ? (
            <p style={{ fontSize: 14, margin: '4px 0 8px' }}>
              Registros procesados: <strong>{n0(r.total)}</strong><br />
              Nuevos: <strong>{n0(r.nuevas_aplicadas)}</strong> · Actualizados: <strong>{n0(r.actualizadas_aplicadas)}</strong> · Sin cambios: <strong>{n0(r.sin_cambios)}</strong> · Con errores: <strong>{n0((r.errores ?? 0) + (r.fallidas ?? 0))}</strong>
            </p>
          ) : (
            <p style={{ fontSize: 14, margin: '4px 0 8px' }}>
              ✓ <strong>{n0(r.total)}</strong> filas leídas: <strong>{n0(r.nuevas)}</strong> nuevas · <strong>{n0(r.actualizar)}</strong> por actualizar · <strong>{n0(r.sin_cambios)}</strong> sin cambios · ✗ <strong>{n0(r.errores)}</strong> con error
            </p>
          )}

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {(paso === 'final'
              ? ([['', 'Todas'], ['aplicada', 'Aplicadas'], ['error', 'Con error']] as [Filtro, string][])
              : ([['error', `Con error (${n0(r.errores)})`], ['nueva', `Nuevas (${n0(r.nuevas)})`], ['actualizar', `Por actualizar (${n0(r.actualizar)})`], ['sin_cambios', `Sin cambios (${n0(r.sin_cambios)})`]] as [Filtro, string][])
            ).map(([valor, texto]) => (
              <button key={valor} type="button" style={{ ...boton, fontWeight: filtro === valor ? 700 : 400, background: filtro === valor ? 'var(--color-surface-hover)' : 'var(--color-surface)' }}
                onClick={() => { setFiltro(valor); setPagina(0); }}>{texto}</button>
            ))}
          </div>

          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>{['Fila', 'Estado', 'Documento', 'Nombre', 'Detalle'].map((h) => <th key={h} style={{ ...celda, background: 'var(--color-table-head)' }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const cambios = Object.keys(f.cambios).filter((k) => k !== 'tipo_documento' && k !== 'numero_documento');
                const doc = f.cambios.numero_documento ? `${f.cambios.tipo_documento ?? ''} ${f.cambios.numero_documento}` : f.datos.numero_documento ?? '';
                return (
                  <tr key={f.fila}>
                    <td style={celda}>{f.fila}</td>
                    <td style={celda}>{ETIQUETA[f.estado] ?? f.estado}</td>
                    <td style={celda}>{doc}</td>
                    <td style={celda}>{String(f.cambios.nombre ?? f.datos.nombre ?? '')}</td>
                    <td style={{ ...celda, fontSize: 12 }}>
                      {f.errores.length > 0 ? f.errores.join(' · ') : f.estado === 'actualizar' ? `Cambia: ${cambios.join(', ')}` : ''}
                    </td>
                  </tr>
                );
              })}
              {filas.length === 0 && <tr><td style={celda} colSpan={5}>No hay filas en esta vista.</td></tr>}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0' }}>
            <button type="button" style={boton} disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>Anterior</button>
            <span style={{ fontSize: 13 }}>Página {pagina + 1} de {paginas}</span>
            <button type="button" style={boton} disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)}>Siguiente</button>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {((r.errores ?? 0) + (r.fallidas ?? 0)) > 0 && (
              <button type="button" style={boton} disabled={!!ocupado} onClick={descargarErrores}>Descargar errores (.xlsx)</button>
            )}
            {paso === 'revision' && carga.estado === 'validada' && carga.propia && (
              <>
                <button type="button" style={{ ...boton, fontWeight: 700 }} disabled={!!ocupado || aplicables === 0} onClick={aplicar}>
                  Cargar {n0(aplicables)} registros válidos
                </button>
                <button type="button" style={boton} disabled={!!ocupado} onClick={descartar}>Descartar</button>
              </>
            )}
            {paso === 'revision' && carga.estado === 'validada' && !carga.propia && (
              <span style={{ fontSize: 12 }}>Esta carga la hizo otra persona: solo ella puede aplicarla.</span>
            )}
            {paso === 'final' && <button type="button" style={boton} onClick={reiniciar}>Nueva carga</button>}
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------- historial */}
      <div style={{ fontWeight: 600, margin: '8px 0' }}>Historial de cargas</div>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>{['Fecha', 'Usuario', 'Tipo', 'Archivo', 'Estado', 'Resultado', ''].map((h) => <th key={h} style={{ ...celda, background: 'var(--color-table-head)' }}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {historial.map((h) => (
            <tr key={h.id}>
              <td style={celda}>{fecha(h.creada_en)}</td>
              <td style={celda}>{h.usuario ?? ''}</td>
              <td style={celda}>{definicion(h.tipo).nombre}</td>
              <td style={celda}>{h.archivo ?? ''}</td>
              <td style={celda}>{h.estado === 'cargando' ? 'Sin terminar' : h.estado === 'validada' ? 'Pendiente de confirmar' : h.estado === 'aplicada' ? 'Aplicada' : h.estado}</td>
              <td style={{ ...celda, fontSize: 12 }}>
                {h.estado === 'aplicada'
                  ? `${n0(h.resumen.nuevas_aplicadas)} nuevos · ${n0(h.resumen.actualizadas_aplicadas)} actualizados · ${n0((h.resumen.errores ?? 0) + (h.resumen.fallidas ?? 0))} con error`
                  : h.estado === 'validada' ? `${n0(h.resumen.total)} filas · ${n0(h.resumen.errores)} con error` : ''}
              </td>
              <td style={celda}>
                {(h.estado === 'aplicada' || h.estado === 'validada') && (
                  <button type="button" style={boton} onClick={() => abrir(h)}>Ver</button>
                )}
              </td>
            </tr>
          ))}
          {historial.length === 0 && <tr><td style={celda} colSpan={7}>Aún no hay cargas.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
