'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useMesa } from '@/components/pedidos/MesaContexto';
import SelectorEstructura from '@/components/pedidos/Selector';
import type { ProveedorCompra } from '@/components/pedidos/tipos';
import { porPedir } from '@/components/pedidos/reglas';
import { Modal, copiarTexto, textoError } from '@/components/pedidos/ui';

/**
 * El mensaje que se le envía a un proveedor desde la compra: la solicitud de cotización. Se arma en la base
 * de datos con la estructura que la organización definió en Mensajes (la predeterminada del proveedor, o la
 * que se elija aquí). Hay dos versiones: la que recibe el proveedor y la copia interna.
 */
export default function MensajeProveedor({
  tipo, proveedor, onCerrar,
}: { tipo: 'cotizacion'; proveedor: ProveedorCompra; onCerrar: () => void }) {
  const { supabase, organizacionId, d, llamar, avisar, permisos } = useMesa();
  const { slug } = useParams<{ slug: string }>();
  const [interno, setInterno] = useState(false);
  const [estructura, setEstructura] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [error, setError] = useState('');
  const pedir = porPedir(d, proveedor.proveedor_id);

  useEffect(() => {
    let vigente = true;
    supabase.rpc('compra_mensaje_cotizacion', {
      p_org: organizacionId, p_compra: d.compra.id, p_proveedor: proveedor.proveedor_id, p_interno: interno, p_estructura: estructura,
    }).then(({ data, error: e }) => {
      if (!vigente) return;
      if (e) setError(textoError(e));
      else { setError(''); setTexto(String(data ?? '')); }
    });
    return () => { vigente = false; };
  }, [supabase, organizacionId, d, proveedor.proveedor_id, interno, estructura, tipo]);

  return (
    <Modal titulo={`Pedir cotización a ${proveedor.nombre}`} onCerrar={onCerrar} ancha>
      <div className="mod-flex mod-gap-2 mod-mb-2">
        <button type="button" className={interno ? 'ui-btn ui-btn--sm' : 'ui-btn ui-btn--sm ui-btn--primary'} onClick={() => setInterno(false)}>Para el proveedor</button>
        <button type="button" className={interno ? 'ui-btn ui-btn--sm ui-btn--primary' : 'ui-btn ui-btn--sm'} onClick={() => setInterno(true)}>Copia interna</button>
      </div>
      <div className="mod-mb-2">
        <SelectorEstructura supabase={supabase} organizacionId={organizacionId} tipo="solicitud_cotizacion" proveedorId={proveedor.proveedor_id}
          proveedorNombre={proveedor.nombre} valor={estructura} onCambio={setEstructura} puedeFijar={permisos.editar}
          enlaceMensajes={`/app/${slug}/mensajes`} />
      </div>
      <p className="mod-sub">
        {interno
          ? 'Copia interna: incluye los datos que se quedan en la empresa y el proveedor no recibe.'
          : 'Esto es lo que recibe el proveedor: solo los campos que tu organización dejó para él (en “Mensajes”). Por defecto no lleva códigos internos ni el número de compra.'}
      </p>
      {error && <p className="mod-error">{error}</p>}
      <textarea readOnly className="ui-input mod-mono" rows={Math.min(22, texto.split('\n').length + 1)} value={texto} aria-label="Mensaje" />
      <div className="pm-modal__acciones">
        <button type="button" className="ui-btn" onClick={async () => { const ok = await copiarTexto(texto); avisar(ok ? 'ok' : 'error', ok ? 'Mensaje copiado' : 'No se pudo copiar'); }}>
          Copiar {interno ? 'copia interna' : 'mensaje'}
        </button>
        {permisos.editar && (
          <button type="button" className="ui-btn ui-btn--primary" disabled={pedir === 0}
            onClick={async () => { const r = await llamar('oferta_marcar_pedida', { p_compra: d.compra.id, p_proveedor: proveedor.proveedor_id }, `${pedir} producto(s) marcados como pedidos`); if (r.ok) onCerrar(); }}>
            {pedir === 0 ? 'Ya está pedida' : `Marcar ${pedir} producto(s) como pedidos`}
          </button>
        )}
        <button type="button" className="ui-btn" onClick={onCerrar}>Cerrar</button>
      </div>
    </Modal>
  );
}
