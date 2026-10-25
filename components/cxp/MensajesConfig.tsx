'use client';

import '@/styles/cxp.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AlertIcon } from '@/components/ui/icons';
import {
  CONFIG_POR_DEFECTO,
  MARCADORES_CUERPO,
  MARCADORES_LINEA,
  agruparPorProveedor,
  armarMensaje,
  configValida,
  type ConfigMensaje,
  type DocumentoMensaje,
} from '@/lib/cxp/mensaje';
import { fechaCorta, hoyIso } from './tipos';

// Datos de ejemplo para la vista previa.
const EJEMPLO: DocumentoMensaje[] = [
  { tercero: '900123456', nombre: 'PROVEEDOR EJEMPLO S.A.S', docto_proveedor: 'FE-1122', documento_erp: 'FG-000717-00', fecha_vcto: '2026-10-05', val_pagar: 1250000, total_factura: 1300000 },
  { tercero: '900123456', nombre: 'PROVEEDOR EJEMPLO S.A.S', docto_proveedor: 'FE-1187', documento_erp: 'FG-000731-00', fecha_vcto: '2026-10-20', val_pagar: 480500, total_factura: 480500 },
];

const TODOS_MARCADORES = new Set([...MARCADORES_CUERPO, ...MARCADORES_LINEA].map((m) => m.marca.slice(1, -1)));

/** Pantalla para configurar el mensaje que se le manda al proveedor cuando se le paga. */
export default function MensajesConfig({
  organizacionId,
  empresa,
  usuario,
}: {
  organizacionId: string;
  empresa: string;
  usuario: string;
}) {
  const [supabase] = useState(() => createClient());
  const [cfg, setCfg] = useState<ConfigMensaje>(CONFIG_POR_DEFECTO);
  const [original, setOriginal] = useState<ConfigMensaje>(CONFIG_POR_DEFECTO);
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const refCuerpo = useRef<HTMLTextAreaElement>(null);
  const refLinea = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const [conf, perm] = await Promise.all([
        supabase.rpc('cxp_config_obtener', { p_org: organizacionId, p_clave: 'mensaje_proveedor' }),
        supabase.rpc('tiene_permiso', { p_organizacion_id: organizacionId, p_modulo: 'cxp_mensajes', p_accion: 'editar' }),
      ]);
      if (!vivo) return;
      if (conf.error) setError(conf.error.message);
      const c = configValida(conf.data ?? CONFIG_POR_DEFECTO);
      setCfg(c);
      setOriginal(c);
      setPuedeEditar(perm.data === true);
      setCargando(false);
    })();
    return () => {
      vivo = false;
    };
  }, [supabase, organizacionId]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(''), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  const vista = useMemo(
    () => armarMensaje(cfg, agruparPorProveedor(EJEMPLO)[0], { empresa, usuario, fecha: fechaCorta(hoyIso()) }),
    [cfg, empresa, usuario],
  );

  // Marcadores escritos que no existen (por ejemplo {valorr}): se avisan antes de guardar.
  const desconocidos = useMemo(() => {
    const encontrados = new Set<string>();
    for (const m of `${cfg.cuerpo} ${cfg.linea}`.matchAll(/\{([^{}]*)\}/g)) {
      if (!TODOS_MARCADORES.has(m[1])) encontrados.add(`{${m[1]}}`);
    }
    return Array.from(encontrados);
  }, [cfg]);

  const cambiado = cfg.cuerpo !== original.cuerpo || cfg.linea !== original.linea || cfg.indicativo !== original.indicativo;

  function insertar(campo: 'cuerpo' | 'linea', marca: string) {
    const el = campo === 'cuerpo' ? refCuerpo.current : refLinea.current;
    const actual = cfg[campo];
    const ini = el?.selectionStart ?? actual.length;
    const fin = el?.selectionEnd ?? actual.length;
    const nuevo = actual.slice(0, ini) + marca + actual.slice(fin);
    setCfg({ ...cfg, [campo]: nuevo });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(ini + marca.length, ini + marca.length);
    });
  }

  async function guardar() {
    setError('');
    if (!cfg.cuerpo.includes('{facturas}')) return setError('El mensaje debe incluir {facturas}: ahí van los números de factura.');
    if (!cfg.linea.trim()) return setError('Escribe cómo se ve cada factura.');
    setGuardando(true);
    const { error } = await supabase.rpc('cxp_config_guardar', {
      p_org: organizacionId,
      p_clave: 'mensaje_proveedor',
      p_valor: cfg,
    });
    setGuardando(false);
    if (error) return setError(error.message);
    setOriginal(cfg);
    setAviso('Mensaje guardado: se usará desde el próximo pago.');
  }

  return (
    <div>
      <div className="ag-head">
        <h1 className="ag-title">Mensaje para el proveedor</h1>
        <p className="ag-lead">
          Cuando le pagas a un proveedor, el sistema arma un mensaje de WhatsApp con las facturas pagadas. Aquí escribes cómo
          quieres que se vea. Los marcadores entre llaves, como <code>{'{proveedor}'}</code>, se reemplazan solos.
        </p>
      </div>

      {error && (
        <div className="ui-alert ui-alert--error ag-alert" role="alert">
          <AlertIcon className="ui-alert__icon" /><span>{error}</span>
        </div>
      )}
      {!puedeEditar && !cargando && (
        <p className="ui-hint" role="status">Puedes ver el mensaje, pero no cambiarlo: pide el permiso «Mensajes al proveedor» · editar.</p>
      )}

      <div className="cxp-mcfg">
        <section className="cxp-carga__caja">
          <h2 className="cxp-carga__titulo">Mensaje</h2>
          <textarea
            ref={refCuerpo}
            className="ui-input cxp-msg__texto"
            rows={10}
            maxLength={2000}
            aria-label="Mensaje"
            value={cfg.cuerpo}
            disabled={!puedeEditar || cargando}
            onChange={(e) => setCfg({ ...cfg, cuerpo: e.target.value })}
          />
          <div className="cxp-mcfg__marcas" aria-label="Insertar un marcador en el mensaje">
            {MARCADORES_CUERPO.map((m) => (
              <button key={m.marca} type="button" className="ui-btn ui-btn--sm" title={m.ayuda} disabled={!puedeEditar} onClick={() => insertar('cuerpo', m.marca)}>
                {m.marca}
              </button>
            ))}
          </div>

          <h2 className="cxp-carga__titulo cxp-mcfg__sep">Cómo se ve cada factura</h2>
          <input
            ref={refLinea}
            className="ui-input"
            maxLength={300}
            aria-label="Cómo se ve cada factura"
            value={cfg.linea}
            disabled={!puedeEditar || cargando}
            onChange={(e) => setCfg({ ...cfg, linea: e.target.value })}
          />
          <div className="cxp-mcfg__marcas" aria-label="Insertar un marcador en la línea de factura">
            {MARCADORES_LINEA.map((m) => (
              <button key={m.marca} type="button" className="ui-btn ui-btn--sm" title={m.ayuda} disabled={!puedeEditar} onClick={() => insertar('linea', m.marca)}>
                {m.marca}
              </button>
            ))}
          </div>
          <p className="ui-hint">Se repite una vez por factura y se coloca donde pusiste <code>{'{facturas}'}</code>.</p>

          <h2 className="cxp-carga__titulo cxp-mcfg__sep">Indicativo del país</h2>
          <input
            className="ui-input cxp-mcfg__ind"
            inputMode="numeric"
            maxLength={4}
            aria-label="Indicativo del país"
            value={cfg.indicativo}
            disabled={!puedeEditar || cargando}
            onChange={(e) => setCfg({ ...cfg, indicativo: e.target.value.replace(/\D/g, '') })}
          />
          <p className="ui-hint">Se antepone a los celulares de 10 dígitos para abrir WhatsApp (Colombia: 57).</p>

          {desconocidos.length > 0 && (
            <p className="ui-alert ui-alert--error" role="status">
              Estos marcadores no existen y saldrán tal cual: {desconocidos.join(', ')}. Revisa que estén bien escritos.
            </p>
          )}

          <div className="cxp-modal__acciones">
            <button type="button" className="ui-btn" disabled={!puedeEditar || guardando} onClick={() => setCfg(CONFIG_POR_DEFECTO)}>
              Restablecer el mensaje original
            </button>
            <button type="button" className="ui-btn ui-btn--primary cxp-btn-grande" disabled={!puedeEditar || guardando || !cambiado} onClick={guardar}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </section>

        <section className="cxp-carga__caja" aria-label="Vista previa">
          <h2 className="cxp-carga__titulo">Así se verá (con datos de ejemplo)</h2>
          <pre className="cxp-mcfg__vista">{vista}</pre>
          <p className="ui-hint">Al pagar, cada proveedor recibe su propio mensaje con sus facturas, y puedes corregirlo antes de enviarlo.</p>
        </section>
      </div>

      <div role="status" aria-live="polite">{aviso && <div className="ag-toast">{aviso}</div>}</div>
    </div>
  );
}
