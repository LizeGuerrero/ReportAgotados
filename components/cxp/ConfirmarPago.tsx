'use client';

import { useEffect, useState } from 'react';
import { agruparPorProveedor } from '@/lib/cxp/mensaje';
import { colorDias } from '@/lib/cxp/colorDias';
import { fechaCorta, moneda, type FilaCxp } from './tipos';

const CLAVE_MENSAJE = 'cxp.armarMensaje';

/**
 * Confirmación de pago: muestra QUÉ documentos se van a pagar (por proveedor, con factura, vencimiento y valor)
 * antes de marcarlos. Sirve para uno solo o para varios.
 */
export default function ConfirmarPago({
  filas,
  onCerrar,
  onConfirmar,
}: {
  filas: FilaCxp[];
  onCerrar: () => void;
  /** Devuelve el mensaje de error, o null si salió bien. */
  onConfirmar: (armarMensaje: boolean) => Promise<string | null>;
}) {
  const [armar, setArmar] = useState(true);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      if (window.localStorage.getItem(CLAVE_MENSAJE) === 'no') setArmar(false);
    } catch {
      /* sin almacenamiento */
    }
  }, []);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !trabajando) onCerrar();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onCerrar, trabajando]);

  const grupos = agruparPorProveedor(filas);
  const total = filas.reduce((s, f) => s + f.val_pagar, 0);

  async function confirmar() {
    setError('');
    setTrabajando(true);
    try {
      window.localStorage.setItem(CLAVE_MENSAJE, armar ? 'si' : 'no');
    } catch {
      /* nada */
    }
    const msg = await onConfirmar(armar);
    setTrabajando(false);
    if (msg) setError(msg);
  }

  return (
    <div className="cxp-modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && !trabajando && onCerrar()}>
      <div className="cxp-modal__card cxp-modal__card--ancha" role="dialog" aria-modal="true" aria-labelledby="cxp-pago-titulo">
        <h2 id="cxp-pago-titulo" className="cxp-modal__title">
          {filas.length === 1 ? 'Confirmar pago' : `Confirmar el pago de ${filas.length} documentos`}
        </h2>
        <p className="cxp-pago__resumen">
          {filas.length} documento(s) · {grupos.length} proveedor(es) · Total a pagar <strong>{moneda(total)}</strong>
        </p>

        <div className="cxp-pago__lista" tabIndex={0} role="region" aria-label="Documentos que se van a pagar">
          {grupos.map((g) => (
            <section key={g.clave} className="cxp-pago__grupo">
              <header className="cxp-pago__grupo-cab">
                <strong>{g.nombre}</strong>
                <span>{g.tercero ?? 'sin NIT'}</span>
                <span className="cxp-pago__sub">{g.docs.length} doc. · {moneda(g.total)}</span>
              </header>
              <table className="cxp-carga__tabla">
                <thead>
                  <tr><th>Factura</th><th>Doc. ERP</th><th>Vence</th><th className="cxp-num">Días venc.</th><th className="cxp-num">A pagar</th></tr>
                </thead>
                <tbody>
                  {g.docs.map((d) => {
                    const c = colorDias(d.dias_venc);
                    return (
                      <tr key={d.id}>
                        <td>{d.docto_proveedor ?? <span className="cxp-celda__vacia">sin factura</span>}</td>
                        <td>{d.documento_erp ?? ''}</td>
                        <td>{fechaCorta(d.fecha_vcto)}</td>
                        <td className="cxp-num" style={c ? { backgroundColor: c.fondo, color: c.texto, fontWeight: 700 } : undefined}>{d.dias_venc}</td>
                        <td className="cxp-num"><strong>{moneda(d.val_pagar)}</strong></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ))}
        </div>

        <p className="ui-hint">Quedarán con la fecha y hora de ahora. Si te equivocas, en la pestaña Pagados puedes reabrirlos.</p>

        <label className="cxp-pago__mensaje">
          <input type="checkbox" checked={armar} onChange={(e) => setArmar(e.target.checked)} />
          Al terminar, armar el mensaje de WhatsApp para cada proveedor
        </label>

        {error && <p className="ui-alert ui-alert--error" role="alert">{error}</p>}

        <div className="cxp-modal__acciones">
          <button type="button" className="ui-btn cxp-btn-grande" onClick={onCerrar} disabled={trabajando}>Cancelar</button>
          <button type="button" className="ui-btn ui-btn--primary cxp-btn-grande" onClick={confirmar} disabled={trabajando}>
            {trabajando ? 'Marcando…' : filas.length === 1 ? 'Confirmar pago' : `Confirmar pago de ${filas.length}`}
          </button>
        </div>
      </div>
    </div>
  );
}
