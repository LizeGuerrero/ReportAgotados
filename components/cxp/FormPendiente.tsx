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

const diasDe = (cond: string) => CONDICIONES_PAGO.find((c) => c.texto === cond)?.dias;

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
  // Si la persona ya movió el vencimiento a mano, dejamos de recalcularlo.
  const vctoTocado = useRef(editando);

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
    if (textoBusqueda.trim().length < 2) {
      setSugerencias([]);
      return;
    }
    let vivo = true;
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('cxp_terceros', {
        p_org: organizacionId,
        p_busqueda: textoBusqueda.trim(),
        p_limit: 6,
      });
      if (vivo) setSugerencias((data ?? []) as SugerenciaTercero[]);
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [campoBusca, textoBusqueda, supabase, organizacionId, editando, inicial]);

  function recalcularVcto(dcto: string, cond: string) {
    const dias = diasDe(cond);
    if (!vctoTocado.current && dcto && dias !== undefined) return sumarDias(dcto, dias);
    return null;
  }

  function elegirSugerencia(s: SugerenciaTercero) {
    const cond = s.cond_pago ?? v.cond_pago;
    const nuevoVcto = recalcularVcto(v.fecha_dcto, cond);
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
    const { error } = editando
      ? await supabase.rpc('cxp_actualizar', { p_org: organizacionId, p_id: inicial!.id, p_datos: datos })
      : await supabase.rpc('cxp_manual_crear', { p_org: organizacionId, p_datos: datos });
    setGuardando(false);
    if (error) return setError(error.message);
    onGuardado();
  }

  const condiciones =
    v.cond_pago && !diasDe(v.cond_pago) && diasDe(v.cond_pago) !== 0
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
              onBlur={() => setTimeout(() => setCampoBusca((c) => (c === 'tercero' ? null : c)), 150)}
            />
            {campoBusca === 'tercero' && sugerencias.length > 0 && (
              <Sugerencias lista={sugerencias} onElegir={elegirSugerencia} />
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
              onBlur={() => setTimeout(() => setCampoBusca((c) => (c === 'nombre' ? null : c)), 150)}
            />
            {campoBusca === 'nombre' && sugerencias.length > 0 && (
              <Sugerencias lista={sugerencias} onElegir={elegirSugerencia} />
            )}
          </div>

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
                const venc = recalcularVcto(v.fecha_dcto, cond);
                setV((p) => ({ ...p, cond_pago: cond, fecha_vcto: venc ?? p.fecha_vcto }));
              }}
            >
              <option value="">Sin definir</option>
              {condiciones.map((c) => (
                <option key={c.texto} value={c.texto}>{c.texto}</option>
              ))}
            </select>
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
                vctoTocado.current = true;
                cambiar('fecha_vcto', e.target.value);
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

function Sugerencias({ lista, onElegir }: { lista: SugerenciaTercero[]; onElegir: (s: SugerenciaTercero) => void }) {
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
    </ul>
  );
}
