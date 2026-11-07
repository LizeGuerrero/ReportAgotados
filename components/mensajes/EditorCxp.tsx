'use client';

import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { insertarEnPosicion, variablesDesconocidas, type VariableDef } from '@/lib/mensajes/variables';
import type { CfgCxp } from './tipos';

type Campo = 'cuerpo' | 'linea' | 'erp_plantilla';

const FORMATOS_FACTURA: { v: CfgCxp['erp_formato_factura']; t: string; ej: string }[] = [
  { v: 'completo', t: 'Tal cual', ej: 'FE-1122, FE-1123' },
  { v: 'numeros', t: 'Solo números (sin el prefijo de letras)', ej: '1122, 1123' },
  { v: 'prefijo_comun', t: 'Un prefijo y luego los números', ej: 'FE-1122, 1123' },
];
const SEPARADORES: { v: string; t: string }[] = [{ v: ', ', t: 'Coma' }, { v: ' ', t: 'Espacio' }, { v: '-', t: 'Guion' }, { v: '/', t: 'Barra' }, { v: ' - ', t: 'Guion con espacios' }];

/** Editor de una estructura del aviso de pago: el mensaje, cómo se ve cada factura y el indicativo del país. */
export default function EditorCxp({
  cfg, base, editable, onCambio, variables, insertarRef,
}: {
  cfg: CfgCxp; base: CfgCxp | null; editable: boolean; onCambio: (c: CfgCxp) => void; variables: VariableDef[];
  insertarRef: MutableRefObject<((texto: string, ambito: 'mensaje' | 'linea' | 'erp') => void) | null>;
}) {
  const refCuerpo = useRef<HTMLTextAreaElement>(null);
  const refLinea = useRef<HTMLInputElement>(null);
  const refErp = useRef<HTMLInputElement>(null);
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  const [, setFoco] = useState<Campo>('cuerpo');

  useEffect(() => {
    // Las variables de "cada factura" van a la línea, las de la descripción ERP a su plantilla; las demás, al mensaje.
    insertarRef.current = (ins, ambito) => {
      if (!editable) return;
      const k: Campo = ambito === 'linea' ? 'linea' : ambito === 'erp' ? 'erp_plantilla' : 'cuerpo';
      const el = k === 'linea' ? refLinea.current : k === 'erp_plantilla' ? refErp.current : refCuerpo.current;
      const actual = cfgRef.current[k];
      const r = insertarEnPosicion(actual, el?.selectionStart ?? actual.length, el?.selectionEnd ?? actual.length, ins);
      onCambio({ ...cfgRef.current, [k]: r.texto });
      requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(r.cursor, r.cursor); });
    };
    return () => { insertarRef.current = null; };
  }, [editable, onCambio, insertarRef]);

  const deMensaje = variables.filter((v) => v.ambito === 'mensaje').map((v) => v.clave);
  const deLinea = variables.filter((v) => v.ambito === 'linea').map((v) => v.clave);
  const deErp = variables.filter((v) => v.ambito === 'erp').map((v) => v.clave);
  const malasCuerpo = variablesDesconocidas(cfg.cuerpo, deMensaje);
  const malasLinea = variablesDesconocidas(cfg.linea, deLinea);
  const malasErp = variablesDesconocidas(cfg.erp_plantilla, deErp);
  const sinFacturas = !cfg.cuerpo.includes('{facturas}');
  const dif = (k: keyof CfgCxp) => !!base && cfg[k] !== base[k];

  return (
    <div className="msj-editor">
      <section className="msj-bloque">
        <h3 className="msj-bloque__titulo">Mensaje</h3>
        <div className="msj-campo">
          <label className="msj-label" htmlFor="msj-cxp-cuerpo">Texto del aviso {dif('cuerpo') && <span className="msj-tag msj-tag--cambio">editado</span>}</label>
          <textarea id="msj-cxp-cuerpo" ref={refCuerpo} className="msj-input msj-input--area" rows={11} maxLength={2000} value={cfg.cuerpo} disabled={!editable}
            onFocus={() => setFoco('cuerpo')} onChange={(e) => onCambio({ ...cfg, cuerpo: e.target.value })} />
          <div className="msj-sub">Debe incluir <code>{'{facturas}'}</code>: ahí van las facturas pagadas. {cfg.cuerpo.length}/2000</div>
          {sinFacturas && <div className="msj-aviso msj-aviso--error" role="alert">Falta {'{facturas}'}: sin esa variable el mensaje no llevaría las facturas.</div>}
          {malasCuerpo.length > 0 && <div className="msj-aviso msj-aviso--warn" role="status">No existen y saldrán tal cual: {malasCuerpo.join(', ')}</div>}
        </div>
      </section>

      <section className="msj-bloque">
        <h3 className="msj-bloque__titulo">Cómo se ve cada factura</h3>
        <div className="msj-campo">
          <label className="msj-label" htmlFor="msj-cxp-linea">Línea por factura {dif('linea') && <span className="msj-tag msj-tag--cambio">editado</span>}</label>
          <input id="msj-cxp-linea" ref={refLinea} className="msj-input" maxLength={300} value={cfg.linea} disabled={!editable}
            onFocus={() => setFoco('linea')} onChange={(e) => onCambio({ ...cfg, linea: e.target.value })} />
          <div className="msj-sub">Se repite una vez por factura y se coloca donde escribiste <code>{'{facturas}'}</code>.</div>
          {malasLinea.length > 0 && <div className="msj-aviso msj-aviso--warn" role="status">No existen y saldrán tal cual: {malasLinea.join(', ')}</div>}
        </div>
      </section>

      <section className="msj-bloque">
        <h3 className="msj-bloque__titulo">Descripción para el ERP</h3>
        <div className="msj-campo">
          <label className="msj-label" htmlFor="msj-erp-plantilla">Texto a copiar {dif('erp_plantilla') && <span className="msj-tag msj-tag--cambio">editado</span>}</label>
          <input id="msj-erp-plantilla" ref={refErp} className="msj-input" maxLength={300} value={cfg.erp_plantilla} disabled={!editable}
            placeholder="PP.TRANSF {total} {facturas}" onFocus={() => setFoco('erp_plantilla')} onChange={(e) => onCambio({ ...cfg, erp_plantilla: e.target.value })} />
          <div className="msj-sub">Una sola línea, para pegar en la descripción del ERP al registrar el pago. Déjala vacía para no mostrarla. {cfg.erp_plantilla.length}/300</div>
          {malasErp.length > 0 && <div className="msj-aviso msj-aviso--warn" role="status">No existen y saldrán tal cual: {malasErp.join(', ')}</div>}
        </div>
        <fieldset className="msj-campo msj-grupo">
          <legend className="msj-label">Cómo se escribe cada factura en {'{facturas}'} {(dif('erp_formato_factura') || dif('erp_agrupar_rangos')) && <span className="msj-tag msj-tag--cambio">editado</span>}</legend>
          <div className="msj-opciones" role="radiogroup">
            {FORMATOS_FACTURA.map((f) => (
              <label key={f.v} className={cfg.erp_formato_factura === f.v ? 'msj-opcion is-on' : 'msj-opcion'}>
                <input type="radio" name="msj-erp-formato" checked={cfg.erp_formato_factura === f.v} disabled={!editable} onChange={() => onCambio({ ...cfg, erp_formato_factura: f.v })} />
                <span>{f.t}</span><span className="msj-sub">{f.ej}</span>
              </label>
            ))}
          </div>
          <label className="msj-check">
            <input type="checkbox" checked={cfg.erp_agrupar_rangos} disabled={!editable || cfg.erp_formato_factura === 'completo'} onChange={(e) => onCambio({ ...cfg, erp_agrupar_rangos: e.target.checked })} />
            <span>Juntar los consecutivos <span className="msj-sub">(1122, 1123, 1124 → 1122-1124). No aplica a «Tal cual».</span></span>
          </label>
        </fieldset>
        <div className="msj-campo">
          <label className="msj-label" htmlFor="msj-erp-sep">Separador entre facturas {dif('erp_separador') && <span className="msj-tag msj-tag--cambio">editado</span>}</label>
          <div className="msj-inline">
            <input id="msj-erp-sep" className="msj-input msj-input--corto" maxLength={10} value={cfg.erp_separador} disabled={!editable}
              onChange={(e) => onCambio({ ...cfg, erp_separador: e.target.value })} aria-describedby="msj-erp-sep-ayuda" />
            {SEPARADORES.map((s) => (
              <button key={s.v} type="button" className={cfg.erp_separador === s.v ? 'msj-btn msj-btn--tono is-on' : 'msj-btn'} disabled={!editable}
                onClick={() => onCambio({ ...cfg, erp_separador: s.v })} aria-pressed={cfg.erp_separador === s.v}>{s.t}</button>
            ))}
          </div>
          <div id="msj-erp-sep-ayuda" className="msj-sub">Si lo dejas vacío se usa un espacio.</div>
        </div>
        <div className="msj-campo">
          <label className="msj-label" htmlFor="msj-erp-total">Cómo se escribe {'{total}'} {dif('erp_formato_total') && <span className="msj-tag msj-tag--cambio">editado</span>}</label>
          <select id="msj-erp-total" className="msj-input msj-input--sel" value={cfg.erp_formato_total} disabled={!editable}
            onChange={(e) => onCambio({ ...cfg, erp_formato_total: e.target.value as CfgCxp['erp_formato_total'] })}>
            <option value="numero">Solo el número (1730500)</option>
            <option value="miles">Con puntos de miles (1.730.500)</option>
            <option value="moneda">Con signo de pesos ($1.730.500)</option>
          </select>
        </div>
      </section>

      <section className="msj-bloque">
        <h3 className="msj-bloque__titulo">WhatsApp</h3>
        <div className="msj-campo">
          <label className="msj-label" htmlFor="msj-cxp-ind">Indicativo del país {dif('indicativo') && <span className="msj-tag msj-tag--cambio">editado</span>}</label>
          <input id="msj-cxp-ind" className="msj-input msj-input--corto" inputMode="numeric" maxLength={4} value={cfg.indicativo} disabled={!editable}
            onChange={(e) => onCambio({ ...cfg, indicativo: e.target.value.replace(/\D/g, '') })} />
          <div className="msj-sub">Se antepone a los celulares de 10 dígitos para abrir WhatsApp (Colombia: 57).</div>
        </div>
      </section>
    </div>
  );
}
