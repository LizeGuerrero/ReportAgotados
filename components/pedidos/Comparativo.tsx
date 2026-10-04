'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import Combobox from '@/components/Combobox';
import SelectorLinea from '@/components/SelectorLinea';
import { useTiempoReal } from '@/components/useTiempoReal';
import {
  boton, campo, celda, idVisible, pesos, TABLAS_PEDIDOS, textoCajas,
} from '@/components/pedidos/comun';

const POR_PAGINA = 50;

interface Celda {
  cotizacion_id: string;
  proveedor_id: number;
  proveedor: string;
  solicitud_numero: string;
  solicitud_estado: string;
  costo_unitario: number | null;
  costo_con_iva: number | null;
  iva: number;
  disponible: boolean | null;
  dias_entrega: number | null;
  flete: number | null;
  unidades_por_caja: number | null;
  observacion: string | null;
  fecha_respuesta: string | null;
  seleccionado: boolean;
  cantidad_pedir: number | null;
  precio_erp: number | null;
  referencia: string | null;
}

interface FilaMatriz {
  item_id: number;
  codigo: string | null;
  nombre_base: string;
  linea: string | null;
  unidad_medida: string | null;
  iva: number | null;
  provisional: boolean;
  origen: 'agotado' | 'manual';
  cantidad_a_cotizar: number | null;
  agotado_sedes: string[] | null;
  cotizaciones: Celda[];
  total: number;
}

type Accion = (fn: string, args: Record<string, unknown>) => Promise<void>;

const num = (v: string) => (v === '' ? null : Number(v));

const FILTROS_ESTADO = [
  { valor: 'sin_ganador', texto: 'Sin ganador elegido' },
  { valor: 'con_ganador', texto: 'Con ganador elegido' },
  { valor: 'faltan', texto: 'Faltan respuestas' },
];

/** Si cambia algo de ESTA celda en la base, la celda se reinicia; las demás conservan lo que se esté escribiendo. */
const firma = (c: Celda) =>
  [c.cotizacion_id, c.fecha_respuesta, c.seleccionado, c.cantidad_pedir, c.costo_unitario, c.disponible,
    c.dias_entrega, c.flete, c.unidades_por_caja, c.observacion].join('|');

/**
 * Tabla comparativa: una fila por ítem en cotización y una columna por proveedor consultado (como la
 * matriz del Excel "PEDIDO LATON"). Se digitan los precios en la misma tabla, ★ marca el mejor costo de
 * cada ítem y se elige el ganador sin salir de aquí. Los ganadores pasan a "Órdenes de compra".
 */
export default function Comparativo({
  supabase,
  organizacionId,
}: {
  supabase: SupabaseClient;
  organizacionId: string;
}) {
  const [lineas, setLineas] = useState<string[]>([]);
  const [linea, setLinea] = useState('');
  const [textoBusqueda, setTextoBusqueda] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [pagina, setPagina] = useState(0);
  const [filas, setFilas] = useState<FilaMatriz[]>([]);
  const [error, setError] = useState('');
  const peticion = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setBusqueda(textoBusqueda);
      setPagina(0);
    }, 300);
    return () => clearTimeout(t);
  }, [textoBusqueda]);

  useEffect(() => {
    supabase.rpc('listar_lineas_catalogo', { p_org: organizacionId }).then(({ data }) => {
      const lista = (data ?? []) as (string | { linea: string })[];
      setLineas(lista.map((d) => (typeof d === 'string' ? d : d.linea)));
    });
  }, [supabase, organizacionId]);

  const cargar = useCallback(async () => {
    const n = ++peticion.current;
    const { data, error } = await supabase.rpc('matriz_cotizaciones', {
      p_org: organizacionId,
      p_linea: linea || null,
      p_busqueda: busqueda || null,
      p_limit: POR_PAGINA,
      p_offset: pagina * POR_PAGINA,
    });
    if (n !== peticion.current) return;
    if (error) setError(error.message);
    else {
      setError('');
      setFilas((data ?? []) as FilaMatriz[]);
    }
  }, [supabase, organizacionId, linea, busqueda, pagina]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Otro comprador registra un precio, elige un ganador o crea solicitudes: se ve aquí sin recargar
  useTiempoReal(supabase, organizacionId, TABLAS_PEDIDOS, cargar);

  const accion: Accion = async (fn, args) => {
    const { error } = await supabase.rpc(fn, { p_org: organizacionId, ...args });
    setError(error ? error.message : '');
    await cargar();
  };

  // Columnas: todos los proveedores que aparecen en esta página
  const proveedoresPagina = useMemo(() => {
    const mapa = new Map<number, string>();
    filas.forEach((f) => f.cotizaciones.forEach((c) => mapa.set(c.proveedor_id, c.proveedor)));
    return Array.from(mapa, ([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [filas]);

  const columnas = proveedor ? proveedoresPagina.filter((p) => String(p.id) === proveedor) : proveedoresPagina;

  const visibles = filas.filter((f) => {
    if (proveedor && !f.cotizaciones.some((c) => String(c.proveedor_id) === proveedor)) return false;
    const hayGanador = f.cotizaciones.some((c) => c.seleccionado);
    if (estado === 'sin_ganador') return !hayGanador;
    if (estado === 'con_ganador') return hayGanador;
    if (estado === 'faltan') return f.cotizaciones.some((c) => c.fecha_respuesta === null);
    return true;
  });

  const total = filas[0]?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const conGanador = filas.filter((f) => f.cotizaciones.some((c) => c.seleccionado)).length;

  return (
    <div>
      <p style={{ fontSize: 13, margin: '0 0 8px' }}>
        Compara lo que respondió cada proveedor. Digita el costo antes de IVA y sal del campo para guardarlo;
        marca “No disponible” si no lo tiene. ★ es el mejor costo con IVA de cada ítem. Los ganadores se convierten
        en órdenes en la pestaña “Órdenes de compra”.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <SelectorLinea
          lineas={lineas}
          valor={linea}
          onCambio={(v) => {
            setLinea(v);
            setPagina(0);
          }}
        />
        <input
          value={textoBusqueda}
          onChange={(e) => setTextoBusqueda(e.target.value)}
          placeholder="Buscar por ítem o nombre"
          style={{ ...campo, minWidth: 240 }}
        />
        <Combobox
          opciones={proveedoresPagina.map((p) => ({ valor: String(p.id), texto: p.nombre, detalle: `NIT ${p.id}` }))}
          valor={proveedor}
          onCambio={setProveedor}
          etiqueta="Proveedor"
          vacio="Todos los proveedores"
          ancho={260}
        />
        <Combobox
          opciones={FILTROS_ESTADO}
          valor={estado}
          onCambio={setEstado}
          etiqueta="Estado"
          vacio="Todos los estados"
          ancho={230}
        />
        <button type="button" style={boton} onClick={cargar}>Actualizar</button>
      </div>

      {error && <p style={{ fontSize: 13 }}>Error: {error}</p>}

      <div style={{ fontSize: 13, marginBottom: 8 }}>
        {total} ítem(s) en cotización · {conGanador} con ganador en esta página
        {(estado || proveedor) && ` · mostrando ${visibles.length} con el filtro (se aplica a esta página)`}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              {['Item', 'Nombre Base', 'Cant.'].map((h) => (
                <th key={h} style={{ ...celda, fontWeight: 600 }}>{h}</th>
              ))}
              {columnas.map((p) => (
                <th key={p.id} style={{ ...celda, fontWeight: 600, minWidth: 190 }}>{p.nombre}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => {
              const conIva = f.cotizaciones
                .filter((c) => c.disponible === true && c.costo_con_iva !== null)
                .map((c) => c.costo_con_iva as number);
              const mejor = conIva.length > 0 ? Math.min(...conIva) : null;
              return (
                <tr key={f.item_id} style={{ verticalAlign: 'top' }}>
                  <td style={celda}>{idVisible(f.item_id, f.provisional, f.codigo)}</td>
                  <td style={celda}>
                    {f.nombre_base}
                    {f.agotado_sedes && <div style={{ fontSize: 11 }}>Agotado en {f.agotado_sedes.join(', ')}</div>}
                    {f.origen === 'manual' && <div style={{ fontSize: 11 }}>Iniciado por Compras</div>}
                    {f.provisional && <div style={{ fontSize: 11 }}>Ítem provisional</div>}
                  </td>
                  <td style={celda}>{f.cantidad_a_cotizar ?? ''}</td>
                  {columnas.map((p) => {
                    const c = f.cotizaciones.find((x) => x.proveedor_id === p.id);
                    return (
                      <td key={p.id} style={celda}>
                        {c ? (
                          <CeldaCotizacion
                            key={firma(c)}
                            c={c}
                            fila={f}
                            esMejor={mejor !== null && c.disponible === true && c.costo_con_iva === mejor}
                            accion={accion}
                            avisar={setError}
                          />
                        ) : (
                          <span style={{ fontSize: 12 }}>—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {visibles.length === 0 && (
              <tr>
                <td style={celda} colSpan={3 + columnas.length}>
                  {filas.length === 0
                    ? 'No hay ítems en cotización. Crea solicitudes desde la pestaña “Por proveedor”.'
                    : 'Ningún ítem coincide con el filtro'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', fontSize: 13 }}>
        <button type="button" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>Anterior</button>
        <span>Página {pagina + 1} de {paginas}</span>
        <button type="button" disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)}>Siguiente</button>
      </div>
    </div>
  );
}

function CeldaCotizacion({
  c, fila, esMejor, accion, avisar,
}: {
  c: Celda;
  fila: FilaMatriz;
  esMejor: boolean;
  accion: Accion;
  avisar: (mensaje: string) => void;
}) {
  const [costo, setCosto] = useState(c.costo_unitario?.toString() ?? '');
  const [nd, setNd] = useState(c.disponible === false);
  const [mas, setMas] = useState(false);
  const [dias, setDias] = useState(c.dias_entrega?.toString() ?? '');
  const [flete, setFlete] = useState(c.flete?.toString() ?? '');
  const [porCaja, setPorCaja] = useState(c.unidades_por_caja?.toString() ?? '');
  const [obs, setObs] = useState(c.observacion ?? '');
  const [cantPedir, setCantPedir] = useState(c.cantidad_pedir?.toString() ?? '');

  const conIva = costo === '' ? null : Math.round(Number(costo) * (1 + c.iva) * 100) / 100;
  const puedeElegir = c.disponible === true && c.costo_unitario !== null;
  const entrada = { border: '1px solid #000', padding: 2, color: '#000', background: '#fff' } as const;

  function guardar(noDisponible: boolean) {
    if (!noDisponible && !(Number(costo) > 0)) {
      avisar('Digita el costo unitario o marca “No disponible”');
      return;
    }
    accion('cotizacion_guardar', {
      p_cotizacion: c.cotizacion_id,
      p_disponible: !noDisponible,
      p_costo: noDisponible ? null : Number(costo),
      p_dias: num(dias),
      p_flete: noDisponible ? null : num(flete),
      p_observacion: obs.trim() || null,
      p_unidades_por_caja: num(porCaja),
    });
  }

  function elegir() {
    if (c.seleccionado) {
      accion('cotizacion_elegir', { p_cotizacion: c.cotizacion_id, p_elegir: false });
      return;
    }
    let cantidad = c.cantidad_pedir ?? fila.cantidad_a_cotizar;
    if (cantidad === null) {
      // Un agotado sin cantidad sugerida: Compras la define al elegir
      const escrito = window.prompt(`Cantidad a pedir a ${c.proveedor}:`);
      if (!escrito) return;
      cantidad = Number(escrito);
      if (!(cantidad > 0)) {
        avisar('Cantidad no válida');
        return;
      }
    }
    accion('cotizacion_elegir', { p_cotizacion: c.cotizacion_id, p_cantidad_pedir: cantidad });
  }

  function guardarCantidadPedir() {
    const n = Number(cantPedir);
    if (!n || n <= 0 || n === c.cantidad_pedir) return;
    accion('cotizacion_elegir', { p_cotizacion: c.cotizacion_id, p_cantidad_pedir: n });
  }

  return (
    <div style={{ background: c.seleccionado ? '#e8e8e8' : '#fff', padding: 2 }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {esMejor && <span aria-label="Mejor costo" title="Mejor costo con IVA">★</span>}
        <input
          value={costo}
          inputMode="decimal"
          disabled={nd}
          placeholder="Costo sin IVA"
          onChange={(e) => setCosto(e.target.value.replace(/[^\d.]/g, ''))}
          onBlur={() => {
            if (!nd && costo !== '' && costo !== (c.costo_unitario?.toString() ?? '')) guardar(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          style={{ ...entrada, width: 100 }}
          aria-label={`Costo ${c.proveedor}, ítem ${fila.item_id}`}
        />
      </div>

      {conIva !== null && !nd && <div style={{ fontSize: 11 }}>{pesos(conIva)} con IVA</div>}
      {c.fecha_respuesta === null && !nd && costo === '' && <div style={{ fontSize: 11 }}>Sin respuesta</div>}
      {(c.dias_entrega !== null || (c.flete ?? 0) > 0) && !nd && (
        <div style={{ fontSize: 11 }}>
          {[c.dias_entrega !== null ? `${c.dias_entrega} d` : '', (c.flete ?? 0) > 0 ? `flete ${pesos(c.flete)}` : '']
            .filter(Boolean).join(' · ')}
        </div>
      )}
      {c.precio_erp !== null && <div style={{ fontSize: 11 }}>ERP {pesos(c.precio_erp)}</div>}

      <label style={{ fontSize: 12, display: 'block' }}>
        <input
          type="checkbox"
          checked={nd}
          onChange={(e) => {
            setNd(e.target.checked);
            if (e.target.checked) guardar(true);
          }}
        />{' '}
        No disponible
      </label>

      <label style={{ fontSize: 12, display: 'block' }}>
        <input type="checkbox" checked={c.seleccionado} disabled={!puedeElegir} onChange={elegir} /> Elegir
      </label>
      {c.seleccionado && (
        <div style={{ fontSize: 12 }}>
          Cant. a pedir:{' '}
          <input
            value={cantPedir}
            inputMode="numeric"
            onChange={(e) => setCantPedir(e.target.value.replace(/\D/g, ''))}
            onBlur={guardarCantidadPedir}
            style={{ ...entrada, width: 60 }}
            aria-label={`Cantidad a pedir a ${c.proveedor}, ítem ${fila.item_id}`}
          />
          <div style={{ fontSize: 11 }}>{textoCajas(Number(cantPedir), c.unidades_por_caja)}</div>
        </div>
      )}

      <button type="button" style={{ ...boton, fontSize: 11, padding: '1px 4px', marginTop: 2 }} onClick={() => setMas((m) => !m)}>
        {mas ? 'Menos' : 'Más'}
      </button>
      {mas && (
        <div style={{ fontSize: 12, marginTop: 4, display: 'grid', gap: 3 }}>
          <label>Días <input value={dias} inputMode="numeric" onChange={(e) => setDias(e.target.value.replace(/\D/g, ''))} style={{ ...entrada, width: 50 }} /></label>
          <label>Flete <input value={flete} inputMode="decimal" onChange={(e) => setFlete(e.target.value.replace(/[^\d.]/g, ''))} style={{ ...entrada, width: 80 }} /></label>
          <label>Und/caja <input value={porCaja} inputMode="numeric" onChange={(e) => setPorCaja(e.target.value.replace(/\D/g, ''))} style={{ ...entrada, width: 50 }} /></label>
          <label>Obs. <input value={obs} onChange={(e) => setObs(e.target.value)} style={{ ...entrada, width: 130 }} /></label>
          <button type="button" style={boton} onClick={() => guardar(nd)}>Guardar detalle</button>
        </div>
      )}
      <div style={{ fontSize: 10 }}>{c.solicitud_numero}</div>
    </div>
  );
}
