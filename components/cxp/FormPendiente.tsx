'use client';

import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CONDICIONES_PAGO,
  aNumero,
  hoyIso,
  moneda,
  sumarDias,
  type FilaCxp,
  type SugerenciaTercero,
} from './tipos';

interface Props {
  supabase: SupabaseClient;
  organizacionId: string;
  sedes: { id: string; nombre: string }[];
  /** null = agregar uno nuevo; una fila = editar ese pendiente manual. */
  inicial: FilaCxp | null;
  onCerrar: () => void;
  onGuardado: () => void;
}

interface Valores {
  tercero: string;
  nombre: string;
  docto_proveedor: string;
  cond_pago: string;
  fecha_dcto: string;
  fecha_vcto: string;
  sede_id: string;
  total: string;
  anticipos: string;
  descuentos: string;
  retenciones: string;
  detalles: string;
}

/** Días de una condición de pago: las del catálogo y también textos como «CREDITO A 20 DIAS» o «CONTADO» que traiga el ERP. */
function diasDe(cond: string): number | undefined {
  const conocida = CONDICIONES_PAGO.find((c) => c.texto === cond);
  if (conocida) return conocida.dias;
  if (/contado/i.test(cond)) return 0;
  const m = /(\d+)\s*d[ií]as?/i.exec(cond);
  return m ? Number(m[1]) : undefined;
}

const diasEntre = (desde: string, hasta: string) => {
  const [a, b] = [desde, hasta].map((f) => f.split('-').map(Number));
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
};

/** Condición de pago aproximada para un plazo: la del catálogo más cercana (hasta 3 días de diferencia) o «CREDITO A N DIAS». */
function condicionPara(dias: number): string {
  const cercana = CONDICIONES_PAGO.reduce((m, c) => (Math.abs(c.dias - dias) < Math.abs(m.dias - dias) ? c : m), CONDICIONES_PAGO[0]);
  return Math.abs(cercana.dias - dias) <= 3 ? cercana.texto : `CREDITO A ${dias} DIAS`;
}

const TIPOS_DOCUMENTO = ['NIT', 'CC', 'CE', 'PAS', 'OTRO'];
/** Igual que el servidor: sin espacios ni puntos y sin el dígito de verificación (900123456-7 → 900123456). */
function numeroDocumento(texto: string) {
  let n = texto.replace(/[\s.]/g, '').toUpperCase();
  if (/^[0-9A-Z]+-[0-9]$/.test(n)) n = n.split('-')[0];
  return n;
}

function valoresIniciales(f: FilaCxp | null, sedes: { id: string; nombre: string }[]): Valores {
  if (f) {
    return {
      tercero: f.tercero ?? '',
      nombre: f.nombre,
      docto_proveedor: f.docto_proveedor ?? '',
      cond_pago: f.cond_pago ?? '',
      fecha_dcto: f.fecha_dcto ?? '',
      fecha_vcto: f.fecha_vcto ?? '',
      sede_id: sedes.find((s) => s.nombre === f.sede)?.id ?? '',
      total: String(f.total_factura),
      anticipos: f.anticipos ? String(f.anticipos) : '',
      descuentos: f.descuentos ? String(f.descuentos) : '',
      retenciones: f.retenciones ? String(f.retenciones) : '',
      detalles: f.detalles ?? '',
    };
  }
  const hoy = hoyIso();
  return {
    tercero: '', nombre: '', docto_proveedor: '', cond_pago: '', fecha_dcto: hoy, fecha_vcto: hoy,
    sede_id: sedes.length === 1 ? sedes[0].id : '', total: '', anticipos: '', descuentos: '',
    retenciones: '', detalles: '',
  };
}

export default function FormPendiente({ supabase, organizacionId, sedes, inicial, onCerrar, onGuardado }: Props) {
  const editando = inicial !== null;
  const [v, setV] = useState<Valores>(() => valoresIniciales(inicial, sedes));
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [campoBusca, setCampoBusca] = useState<'tercero' | 'nombre' | null>(null);
  const [sugerencias, setSugerencias] = useState<SugerenciaTercero[]>([]);
  // Qué fue lo último que la persona decidió: la condición (el vencimiento se calcula) o el vencimiento (la condición se deduce).
  const fuente = useRef<'cond' | 'vcto'>(editando ? 'vcto' : 'cond');
  const [condAuto, setCondAuto] = useState(false);
  // Tercero nuevo: se puede registrar también en el módulo Proveedores (si el usuario tiene permiso).
  const [nuevoTercero, setNuevoTercero] = useState(false);
  const [tipoDoc, setTipoDoc] = useState('NIT');
  const [registrarProv, setRegistrarProv] = useState(true);
  const [puedeCrearProv, setPuedeCrearProv] = useState(false);

  useEffect(() => {
    let vivo = true;
    supabase
      .rpc('tiene_permiso', { p_organizacion_id: organizacionId, p_modulo: 'Proveedores', p_accion: 'crear' })
      .then(({ data }) => vivo && setPuedeCrearProv(data === true));
    return () => {
      vivo = false;
    };
  }, [supabase, organizacionId]);

  const cambiar = (campo: keyof Valores, valor: string) => setV((p) => ({ ...p, [campo]: valor }));

  // Escape cierra
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onCerrar]);

  // Rellenado automático: busca terceros ya vistos y proveedores mientras se escribe NIT o nombre.
  const textoBusqueda = campoBusca === 'tercero' ? v.tercero : campoBusca === 'nombre' ? v.nombre : '';
  useEffect(() => {
    if (!campoBusca || editando && inicial?.origen === 'erp') return;
    let vivo = true;
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('cxp_terceros', {
        p_org: organizacionId,
        p_busqueda: textoBusqueda.trim(),
        p_limit: 8,
      });
      if (vivo) setSugerencias((data ?? []) as SugerenciaTercero[]);
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [campoBusca, textoBusqueda, supabase, organizacionId, editando, inicial]);

  /** Vencimiento según fecha del documento + condición de pago; null si falta algo o la persona fijó el vencimiento a mano. */
  function recalcularVcto(dcto: string, cond: string, forzar = false) {
    const dias = diasDe(cond);
    if ((forzar || fuente.current === 'cond') && dcto && dias !== undefined) return sumarDias(dcto, dias);
    return null;
  }

  function elegirSugerencia(s: SugerenciaTercero) {
    const cond = s.cond_pago ?? v.cond_pago;
    const nuevoVcto = recalcularVcto(v.fecha_dcto, cond);
    setNuevoTercero(false);
    setV((p) => ({
      ...p,
      tercero: s.tercero,
      nombre: s.nombre,
      cond_pago: cond,
      fecha_vcto: nuevoVcto ?? p.fecha_vcto,
    }));
    setSugerencias([]);
    setCampoBusca(null);
  }

  function elegirNuevo() {
    setNuevoTercero(true);
    setSugerencias([]);
    setCampoBusca(null);
  }
  // «+ Añadir nuevo tercero» aparece cuando lo escrito no coincide exactamente con ningún NIT/documento de la lista.
  const hayCoincidenciaExacta = (texto: string) => {
    const n = numeroDocumento(texto);
    return n !== '' && sugerencias.some((x) => x.tercero.toUpperCase() === n);
  };
  const mostrarNuevo = !editando && !hayCoincidenciaExacta(textoBusqueda);

  const total = aNumero(v.total);
  const ant = aNumero(v.anticipos);
  const desc = aNumero(v.descuentos);
  const ret = aNumero(v.retenciones);
  const hayNumeros = ![total, ant, desc, ret].some(Number.isNaN);
  const valorPagar = hayNumeros ? total - ant - desc - ret : null;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!v.nombre.trim()) return setError('Escribe el nombre del proveedor.');
    if (!v.fecha_vcto) return setError('Escribe la fecha de vencimiento.');
    if (v.fecha_dcto && v.fecha_vcto < v.fecha_dcto) return setError('El vencimiento no puede ser anterior a la fecha del documento.');
    if (!hayNumeros) return setError('Revisa los valores: solo números.');
    if (!(total > 0)) return setError('Escribe el total de la factura (mayor a 0).');
    if (ant < 0 || desc < 0 || ret < 0) return setError('Anticipos, descuentos y retenciones no pueden ser negativos.');
    if (valorPagar !== null && valorPagar < 0) return setError('Los anticipos, descuentos y retenciones superan el total.');

    const datos = {
      tercero: v.tercero,
      nombre: v.nombre,
      docto_proveedor: v.docto_proveedor,
      cond_pago: v.cond_pago,
      fecha_dcto: v.fecha_dcto,
      fecha_vcto: v.fecha_vcto,
      sede_id: v.sede_id,
      total_factura: total,
      anticipos: ant,
      descuentos: desc,
      retenciones: ret,
      detalles: v.detalles,
    };
    setGuardando(true);
    if (!editando && nuevoTercero && registrarProv && puedeCrearProv) {
      const numero = numeroDocumento(v.tercero);
      if (!numero) {
        setGuardando(false);
        return setError('Para registrar el tercero en Proveedores escribe su NIT o documento.');
      }
      const r = await supabase.rpc('proveedor_crear', {
        p_org: organizacionId,
        p_datos: { tipo_documento: tipoDoc, numero_documento: numero, nombre: v.nombre.trim() },
      });
      // Si ya existía en Proveedores, no es un problema: se usa el existente.
      if (r.error && !/ya existe un proveedor/i.test(r.error.message)) {
        setGuardando(false);
        return setError(`No se pudo registrar en Proveedores: ${r.error.message}`);
      }
    }
    const { error } = editando
      ? await supabase.rpc('cxp_actualizar', { p_org: organizacionId, p_id: inicial!.id, p_datos: datos })
      : await supabase.rpc('cxp_manual_crear', { p_org: organizacionId, p_datos: datos });
    setGuardando(false);
    if (error) return setError(error.message);
    onGuardado();
  }

  const condiciones =
    v.cond_pago && !CONDICIONES_PAGO.some((c) => c.texto === v.cond_pago)
      ? [{ texto: v.cond_pago, dias: -1 }, ...CONDICIONES_PAGO]
      : CONDICIONES_PAGO;

  return (
    <div className="cxp-modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <form className="cxp-modal__card" role="dialog" aria-modal="true" aria-labelledby="cxp-form-titulo" onSubmit={guardar}>
        <h2 id="cxp-form-titulo" className="cxp-modal__title">
          {editando ? 'Editar pendiente manual' : 'Agregar pendiente por pagar'}
        </h2>
        <p className="ui-hint">
          Para cuentas que aún no están en el ERP. Con el NIT y el número de la factura del proveedor, el sistema
          podrá cruzarla cuando el ERP la cargue.
        </p>

        <div className="cxp-form__grid">
          <div className="ui-field cxp-suggest">
            <label className="ui-label" htmlFor="cxp-tercero">NIT / documento</label>
            <input
              id="cxp-tercero"
              className="ui-input"
              autoFocus
              autoComplete="off"
              inputMode="numeric"
              value={v.tercero}
              placeholder="900123456 (sin dígito de verificación)"
              onChange={(e) => {
                cambiar('tercero', e.target.value);
                setCampoBusca('tercero');
              }}
              onFocus={() => !editando && setCampoBusca('tercero')}
              onBlur={() => setTimeout(() => setCampoBusca((c) => (c === 'tercero' ? null : c)), 150)}
            />
            {campoBusca === 'tercero' && !editando && (
              <Sugerencias lista={sugerencias} onElegir={elegirSugerencia} onNuevo={mostrarNuevo ? elegirNuevo : undefined} />
            )}
            {!v.tercero.trim() && v.nombre.trim() && (
              <p className="ui-hint">
                Sin NIT no se cruza solo con el ERP y no sale en el total del proveedor (salvo que el nombre coincida).
              </p>
            )}
          </div>

          <div className="ui-field cxp-suggest cxp-form__ancho">
            <label className="ui-label" htmlFor="cxp-nombre">Proveedor *</label>
            <input
              id="cxp-nombre"
              className="ui-input"
              autoComplete="off"
              value={v.nombre}
              placeholder="Nombre o razón social"
              onChange={(e) => {
                cambiar('nombre', e.target.value);
                setCampoBusca('nombre');
              }}
              onFocus={() => !editando && setCampoBusca('nombre')}
              onBlur={() => setTimeout(() => setCampoBusca((c) => (c === 'nombre' ? null : c)), 150)}
            />
            {campoBusca === 'nombre' && !editando && (
              <Sugerencias lista={sugerencias} onElegir={elegirSugerencia} onNuevo={mostrarNuevo ? elegirNuevo : undefined} />
            )}
          </div>

          {nuevoTercero && !editando && (
            <div className="ui-field cxp-form__ancho cxp-nuevo-tercero" role="group" aria-label="Nuevo tercero">
              <p className="ui-hint">
                <strong>Nuevo tercero.</strong> Completa el NIT/documento y el nombre. Si no está en Proveedores, se registra allí al guardar.
              </p>
              <label className="cxp-panel__fila">
                Tipo de documento
                <select className="ui-input ui-input--sm cxp-panel__ajuste" value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value)}>
                  {TIPOS_DOCUMENTO.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              {puedeCrearProv ? (
                <label className="cxp-panel__fila">
                  <input type="checkbox" checked={registrarProv} onChange={(e) => setRegistrarProv(e.target.checked)} />
                  Registrarlo también en el módulo Proveedores
                </label>
              ) : (
                <p className="ui-hint">No tienes permiso para crear proveedores: el pendiente se guarda solo con estos datos.</p>
              )}
              <button type="button" className="cxp-link" onClick={() => setNuevoTercero(false)}>Quitar «nuevo tercero»</button>
            </div>
          )}

          <div className="ui-field">
            <label className="ui-label" htmlFor="cxp-docto">Factura del proveedor</label>
            <input id="cxp-docto" className="ui-input" value={v.docto_proveedor} placeholder="FE-1234"
              onChange={(e) => cambiar('docto_proveedor', e.target.value)} />
          </div>

          <div className="ui-field">
            <label className="ui-label" htmlFor="cxp-cond">Condición de pago</label>
            <select
              id="cxp-cond"
              className="ui-input"
              value={v.cond_pago}
              onChange={(e) => {
                const cond = e.target.value;
                // Elegir la condición es una decisión nueva: el vencimiento se vuelve a calcular.
                fuente.current = 'cond';
                setCondAuto(false);
                const venc = recalcularVcto(v.fecha_dcto, cond, true);
                setV((p) => ({ ...p, cond_pago: cond, fecha_vcto: venc ?? p.fecha_vcto }));
              }}
            >
              <option value="">Sin definir</option>
              {condiciones.map((c) => (
                <option key={c.texto} value={c.texto}>{c.texto}</option>
              ))}
            </select>
            {condAuto && <p className="ui-hint">Calculada con las fechas (aproximada). Puedes cambiarla.</p>}
          </div>

          <div className="ui-field">
            <label className="ui-label" htmlFor="cxp-fdcto">Fecha del documento</label>
            <input
              id="cxp-fdcto"
              type="date"
              className="ui-input"
              value={v.fecha_dcto}
              onChange={(e) => {
                const f = e.target.value;
                if (fuente.current === 'vcto' && f && v.fecha_vcto && diasEntre(f, v.fecha_vcto) >= 0) {
                  // El vencimiento manda: la condición se ajusta al nuevo plazo.
                  setCondAuto(true);
                  setV((p) => ({ ...p, fecha_dcto: f, cond_pago: condicionPara(diasEntre(f, p.fecha_vcto)) }));
                  return;
                }
                const venc = recalcularVcto(f, v.cond_pago);
                setV((p) => ({ ...p, fecha_dcto: f, fecha_vcto: venc ?? p.fecha_vcto }));
              }}
            />
          </div>

          <div className="ui-field">
            <label className="ui-label" htmlFor="cxp-fvcto">Fecha de vencimiento *</label>
            <input
              id="cxp-fvcto"
              type="date"
              className="ui-input"
              value={v.fecha_vcto}
              onChange={(e) => {
                fuente.current = 'vcto';
                const f = e.target.value;
                const dias = v.fecha_dcto && f ? diasEntre(v.fecha_dcto, f) : -1;
                if (dias >= 0) setCondAuto(true);
                setV((p) => ({ ...p, fecha_vcto: f, cond_pago: dias >= 0 ? condicionPara(dias) : p.cond_pago }));
              }}
            />
          </div>

          {sedes.length > 0 && (
            <div className="ui-field">
              <label className="ui-label" htmlFor="cxp-sede">Sede</label>
              <select id="cxp-sede" className="ui-input" value={v.sede_id} onChange={(e) => cambiar('sede_id', e.target.value)}>
                <option value="">Sin sede</option>
                {sedes.map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            </div>
          )}

          <div className="ui-field">
            <label className="ui-label" htmlFor="cxp-total">Total factura *</label>
            <input id="cxp-total" className="ui-input" inputMode="decimal" value={v.total} placeholder="600000"
              onChange={(e) => cambiar('total', e.target.value)} />
          </div>
          <div className="ui-field">
            <label className="ui-label" htmlFor="cxp-ant">Anticipos</label>
            <input id="cxp-ant" className="ui-input" inputMode="decimal" value={v.anticipos}
              onChange={(e) => cambiar('anticipos', e.target.value)} />
          </div>
          <div className="ui-field">
            <label className="ui-label" htmlFor="cxp-desc">Descuentos</label>
            <input id="cxp-desc" className="ui-input" inputMode="decimal" value={v.descuentos}
              onChange={(e) => cambiar('descuentos', e.target.value)} />
          </div>
          <div className="ui-field">
            <label className="ui-label" htmlFor="cxp-ret">Adicionales retenciones</label>
            <input id="cxp-ret" className="ui-input" inputMode="decimal" value={v.retenciones}
              onChange={(e) => cambiar('retenciones', e.target.value)} />
          </div>

          <div className="ui-field cxp-form__ancho">
            <span className="ui-label">Valor a pagar</span>
            <output className="cxp-form__pagar">{valorPagar === null ? '—' : moneda(valorPagar)}</output>
          </div>

          <div className="ui-field cxp-form__completo">
            <label className="ui-label" htmlFor="cxp-det">Detalles</label>
            <textarea id="cxp-det" className="ui-input" rows={2} maxLength={500} value={v.detalles}
              onChange={(e) => cambiar('detalles', e.target.value)} />
          </div>
        </div>

        {error && (
          <p className="ui-alert ui-alert--error" role="alert">{error}</p>
        )}

        <div className="cxp-modal__acciones">
          <button type="button" className="ui-btn" onClick={onCerrar} disabled={guardando}>Cancelar</button>
          <button type="submit" className="ui-btn ui-btn--primary" disabled={guardando}>
            {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Agregar'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Sugerencias({
  lista,
  onElegir,
  onNuevo,
}: {
  lista: SugerenciaTercero[];
  onElegir: (s: SugerenciaTercero) => void;
  onNuevo?: () => void;
}) {
  return (
    <ul className="ui-combo__list cxp-suggest__list" role="listbox">
      {lista.map((s) => (
        <li
          key={s.tercero}
          role="option"
          aria-selected={false}
          className="ui-combo__option"
          onMouseDown={(e) => {
            e.preventDefault();
            onElegir(s);
          }}
        >
          {s.nombre}
          <span className="cxp-combo__nit">{s.tercero}{s.fuente === 'proveedores' ? ' · Proveedores' : ''}</span>
        </li>
      ))}
      {lista.length === 0 && <li className="ui-combo__empty" role="presentation">Sin coincidencias</li>}
      {onNuevo && (
        <li
          role="option"
          aria-selected={false}
          className="ui-combo__option cxp-suggest__nuevo"
          onMouseDown={(e) => {
            e.preventDefault();
            onNuevo();
          }}
        >
          + Añadir nuevo tercero
        </li>
      )}
    </ul>
  );
}
