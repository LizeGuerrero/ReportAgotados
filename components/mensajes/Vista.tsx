'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { agruparPorProveedor, armarDescripcionErp, armarMensaje, type DocumentoMensaje } from '@/lib/cxp/mensaje';
import type { VariableDef } from '@/lib/mensajes/variables';
import { cargaGuardar, esCxp, esCfgCxp, textoErr, type Cfg, type ProvFila, type Tipo } from './tipos';

const EJEMPLO: DocumentoMensaje[] = [
  { tercero: '900123456', nombre: 'PROVEEDOR EJEMPLO S.A.S', docto_proveedor: 'FE-1122', documento_erp: 'FG-000717-00', fecha_vcto: '2026-10-05', val_pagar: 1250000, total_factura: 1300000 },
  { tercero: '900123456', nombre: 'PROVEEDOR EJEMPLO S.A.S', docto_proveedor: 'FE-1187', documento_erp: 'FG-000731-00', fecha_vcto: '2026-10-20', val_pagar: 480500, total_factura: 480500 },
];

const hoy = () => new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric' });

/** Vista previa en vivo: usa el borrador sin guardar y, si se elige, los datos reales de un proveedor. */
export default function Vista({
  supabase, organizacionId, tipo, borrador, proveedores, provSel, onProvSel, variables, empresa, usuario,
}: {
  supabase: SupabaseClient; organizacionId: string; tipo: Tipo; borrador: Cfg | null; proveedores: ProvFila[];
  provSel: number | null; onProvSel: (id: number | null) => void; variables: VariableDef[]; empresa: string; usuario: string;
}) {
  const cxp = esCxp(tipo);
  const [lado, setLado] = useState<'proveedor' | 'interno'>('proveedor');
  const [textoPed, setTextoPed] = useState({ proveedor: '', interno: '' });
  const [varsReales, setVarsReales] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState('');

  const ejemplos = useMemo(() => Object.fromEntries(variables.filter((v) => v.ambito === 'mensaje').map((v) => [v.clave, v.ejemplo])), [variables]);

  // CXP: datos reales del proveedor elegido (si no hay, se usan los ejemplos del catálogo)
  useEffect(() => {
    if (!cxp || provSel == null) { setVarsReales(null); return; }
    let vigente = true;
    supabase.rpc('mensaje_vars_proveedor', { p_org: organizacionId, p_tipo: tipo, p_proveedor: provSel }).then(({ data, error: e }) => {
      if (!vigente) return;
      if (e) setError(textoErr(e)); else { setError(''); setVarsReales(data as Record<string, string>); }
    });
    return () => { vigente = false; };
  }, [supabase, organizacionId, tipo, cxp, provSel]);

  // Pedidos: el texto se arma en la base de datos con el borrador
  const carga = useMemo(() => (borrador && !esCfgCxp(borrador) ? cargaGuardar(borrador) : null), [borrador]);
  useEffect(() => {
    if (cxp || !carga) return;
    let vigente = true;
    const t = setTimeout(async () => {
      const base = { p_org: organizacionId, p_tipo: tipo, p_datos: carga, p_proveedor: provSel };
      const [a, b] = await Promise.all([
        supabase.rpc('mensaje_vista_previa', { ...base, p_interno: false }),
        supabase.rpc('mensaje_vista_previa', { ...base, p_interno: true }),
      ]);
      if (!vigente) return;
      const err = a.error ?? b.error;
      setError(err ? textoErr(err) : '');
      setTextoPed({ proveedor: String(a.data ?? ''), interno: String(b.data ?? '') });
    }, 350);
    return () => { vigente = false; clearTimeout(t); };
  }, [supabase, organizacionId, tipo, cxp, carga, provSel]);

  const textoCxp = useMemo(() => {
    if (!cxp || !borrador || !esCfgCxp(borrador)) return '';
    const vars = varsReales ?? { ...ejemplos, empresa, usuario };
    return armarMensaje(borrador, agruparPorProveedor(EJEMPLO)[0], { empresa, usuario, fecha: hoy(), vars });
  }, [cxp, borrador, varsReales, ejemplos, empresa, usuario]);

  const textoErp = useMemo(() => {
    if (!cxp || !borrador || !esCfgCxp(borrador)) return '';
    const vars = varsReales ?? { ...ejemplos, empresa, usuario };
    return armarDescripcionErp(borrador, agruparPorProveedor(EJEMPLO)[0], { empresa, usuario, fecha: hoy(), vars });
  }, [cxp, borrador, varsReales, ejemplos, empresa, usuario]);

  const texto = cxp ? textoCxp : lado === 'proveedor' ? textoPed.proveedor : textoPed.interno;
  const prov = proveedores.find((p) => p.proveedor_id === provSel);

  return (
    <section className="msj-panel msj-vista" aria-label="Vista previa">
      <header className="msj-panel__cab">
        <h3 className="msj-panel__titulo">Vista previa</h3>
        {!cxp && (
          <div className="msj-seg" role="group" aria-label="Versión del mensaje">
            <button type="button" className={lado === 'proveedor' ? 'msj-seg__op is-on' : 'msj-seg__op'} aria-pressed={lado === 'proveedor'} onClick={() => setLado('proveedor')}>Proveedor</button>
            <button type="button" className={lado === 'interno' ? 'msj-seg__op is-on' : 'msj-seg__op'} aria-pressed={lado === 'interno'} onClick={() => setLado('interno')}>Copia interna</button>
          </div>
        )}
      </header>
      <label className="msj-label msj-vista__prov">
        Probar con
        <select className="msj-input msj-input--sel" value={provSel ?? ''} onChange={(e) => onProvSel(e.target.value === '' ? null : Number(e.target.value))} aria-label="Proveedor para la vista previa">
          <option value="">Datos de ejemplo</option>
          {proveedores.map((p) => <option key={p.proveedor_id} value={p.proveedor_id}>{p.nombre}</option>)}
        </select>
      </label>
      {error && <div className="msj-aviso msj-aviso--error" role="alert">{error}</div>}
      <pre className="msj-vista__texto" tabIndex={0}>{texto || ' '}</pre>
      {cxp && (
        <div className="msj-vista__erp">
          <div className="msj-label">Descripción para el ERP</div>
          {textoErp ? <code className="msj-vista__linea">{textoErp}</code> : <span className="msj-sub">Vacía: no se mostrará en el aviso de pago.</span>}
          {textoErp && <span className="msj-sub">{textoErp.length} caracteres</span>}
        </div>
      )}
      <p className="msj-sub">
        {prov ? `Con los datos reales de ${prov.nombre}: lo que no tenga registrado queda vacío.` : 'Con datos de ejemplo.'}
        {!cxp && lado === 'interno' && ' La copia interna incluye datos que el proveedor no recibe.'}
      </p>
    </section>
  );
}
