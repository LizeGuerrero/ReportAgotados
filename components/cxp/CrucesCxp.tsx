'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fechaCorta, moneda, type CruceSugerido, type FilaCxp } from './tipos';

/**
 * Cruce de pendientes manuales con documentos del ERP.
 * - Sin `manual`: parejas probables (mismo NIT y misma factura, o mismo NIT y mismo valor).
 * - Con `manual`: candidatos del ERP para ese pendiente, con búsqueda.
 * Cruzar = el pendiente manual ya es ese documento del ERP: el manual deja de contarse y el del ERP hereda lo anotado.
 */
export default function CrucesCxp({
  supabase,
  organizacionId,
  manual,
  puedePagar,
  onCerrar,
  onCambio,
}: {
  supabase: SupabaseClient;
  organizacionId: string;
  manual: FilaCxp | null;
  puedePagar: boolean;
  onCerrar: () => void;
  onCambio: (mensaje: string) => void;
}) {
  const [items, setItems] = useState<CruceSugerido[]>([]);
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [trabajando, setTrabajando] = useState('');

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onCerrar]);

  useEffect(() => {
    const t = setTimeout(() => setBusqueda(texto), 300);
    return () => clearTimeout(t);
  }, [texto]);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase.rpc('cxp_cruces_sugeridos', {
      p_org: organizacionId,
      p_manual: manual?.id ?? null,
      p_busqueda: manual ? busqueda.trim() || null : null,
      p_limit: 50,
    });
    setCargando(false);
    if (error) return setError(error.message);
    setError('');
    setItems((data ?? []) as CruceSugerido[]);
  }, [supabase, organizacionId, manual, busqueda]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function cruzar(c: CruceSugerido) {
    const pagado = c.manual_estado === 'pagado';
    const ok = window.confirm(
      `¿Cruzar estos dos documentos? Es la misma cuenta.\n\n` +
        `Manual: ${c.manual_nombre} · ${c.manual_docto ?? 'sin factura'} · ${moneda(c.manual_total)}\n` +
        `ERP: ${c.erp_nombre} · ${c.erp_documento} · ${moneda(c.erp_total)}\n\n` +
        `El manual dejará de contarse y el documento del ERP heredará sus anticipos, descuentos, retenciones y detalles.` +
        (pagado ? '\n\nEl manual ya estaba PAGADO: el documento del ERP quedará pagado con esa misma fecha.' : ''),
    );
    if (!ok) return;
    setTrabajando(`${c.manual_id}|${c.erp_id}`);
    const { error } = await supabase.rpc('cxp_cruzar', {
      p_org: organizacionId,
      p_manual: c.manual_id,
      p_erp: c.erp_id,
    });
    setTrabajando('');
    if (error) return setError(error.message);
    onCambio('Cruzado: el pendiente manual ya no se cuenta aparte.');
    if (manual) onCerrar();
    else cargar();
  }

  return (
    <div className="cxp-modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="cxp-modal__card cxp-modal__card--ancha" role="dialog" aria-modal="true" aria-labelledby="cxp-cruce-titulo">
        <h2 id="cxp-cruce-titulo" className="cxp-modal__title">
          {manual ? `Cruzar «${manual.nombre}» con el ERP` : 'Posibles cruces con el ERP'}
        </h2>
        <p className="ui-hint">
          {manual
            ? `Pendiente manual de ${moneda(manual.total_factura)}. Elige el documento del ERP que es la misma cuenta.`
            : 'Pendientes manuales que parecen ser documentos que ya llegaron del ERP. Si no se cruzan, se cuentan dos veces.'}
        </p>

        {manual && (
          <div className="ui-field">
            <label className="ui-label" htmlFor="cruce-buscar">Buscar en el ERP</label>
            <input id="cruce-buscar" className="ui-input" autoFocus value={texto} onChange={(e) => setTexto(e.target.value)}
              placeholder="Proveedor, documento o factura" />
          </div>
        )}

        {error && <p className="ui-alert ui-alert--error" role="alert">{error}</p>}

        <div className="ag-tablewrap" tabIndex={0}>
          <table className="cxp-carga__tabla">
            <thead>
              <tr>
                {!manual && <th>Pendiente manual</th>}
                <th>Documento del ERP</th>
                <th>Factura prov.</th>
                <th>Vence</th>
                <th>Saldo</th>
                <th>Por qué</th>
                <th><span className="cxp-th">Acción</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => {
                const bloqueado = c.manual_estado === 'pagado' && !puedePagar;
                return (
                  <tr key={`${c.manual_id}|${c.erp_id}`}>
                    {!manual && (
                      <td>
                        <strong>{c.manual_nombre}</strong>
                        <br />
                        {c.manual_docto ?? 'sin factura'} · {moneda(c.manual_total)}
                        {c.manual_estado === 'pagado' && <span className="ui-badge ui-badge--success cxp-badge-aus">Pagado</span>}
                      </td>
                    )}
                    <td>
                      <strong>{c.erp_nombre}</strong>
                      <br />
                      {c.erp_documento}
                    </td>
                    <td>{c.erp_docto ?? ''}</td>
                    <td>{fechaCorta(c.erp_vcto)}</td>
                    <td className="cxp-num">{moneda(c.erp_total)}</td>
                    <td>{c.motivo}</td>
                    <td>
                      <button
                        type="button"
                        className="ui-btn ui-btn--sm ui-btn--primary"
                        disabled={trabajando !== '' || bloqueado}
                        title={bloqueado ? 'El manual ya está pagado: cruzarlo exige el permiso de pagos' : undefined}
                        onClick={() => cruzar(c)}
                      >
                        {trabajando === `${c.manual_id}|${c.erp_id}` ? 'Cruzando…' : 'Cruzar'}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!cargando && items.length === 0 && (
                <tr>
                  <td className="ag-empty" colSpan={manual ? 6 : 7}>
                    {manual ? 'No encontré documentos del ERP parecidos. Prueba con otra búsqueda.' : 'No hay cruces pendientes.'}
                  </td>
                </tr>
              )}
              {cargando && items.length === 0 && (
                <tr><td className="ag-empty" colSpan={manual ? 6 : 7}>Cargando…</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="cxp-modal__acciones">
          <button type="button" className="ui-btn" onClick={onCerrar}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
