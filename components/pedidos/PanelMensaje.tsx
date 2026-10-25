'use client';

import { useState } from 'react';
import { copiar } from '@/components/pedidos/comun';

/**
 * Muestra un mensaje listo para copiar. Si recibe `textoInterno`, ofrece dos versiones:
 * la que se envía al proveedor (solo los campos configurados para él en el módulo Mensajes) y la copia
 * interna (con los datos que Compras necesita y el proveedor no debe ver). Siempre se copia la que se ve.
 */
export default function PanelMensaje({
  titulo,
  texto,
  textoInterno,
  onCopiar,
  onCerrar,
}: {
  titulo: string;
  texto: string;
  textoInterno?: string;
  onCopiar?: () => void | Promise<void>;
  onCerrar: () => void;
}) {
  const [aviso, setAviso] = useState('');
  const [interno, setInterno] = useState(false);
  const visible = interno && textoInterno !== undefined ? textoInterno : texto;

  async function alCopiar() {
    const ok = await copiar(visible);
    setAviso(ok ? 'Copiado' : 'No se pudo copiar: selecciona el texto y usa Ctrl+C');
    // Solo la versión para el proveedor cuenta como "enviada"
    if (ok && onCopiar && !interno) await onCopiar();
  }

  return (
    <div className="mod-card mod-mt-3 mod-mb-3">
      <div className="mod-semibold mod-mb-2">{titulo}</div>
      {textoInterno !== undefined && (
        <div className="mod-flex mod-gap-2 mod-mb-2">
          <button type="button" className={interno ? 'ui-btn ui-btn--sm' : 'ui-btn ui-btn--sm ui-btn--primary'}
            onClick={() => { setInterno(false); setAviso(''); }}>Para el proveedor</button>
          <button type="button" className={interno ? 'ui-btn ui-btn--sm ui-btn--primary' : 'ui-btn ui-btn--sm'}
            onClick={() => { setInterno(true); setAviso(''); }}>Copia interna</button>
        </div>
      )}
      <textarea
        readOnly
        value={visible}
        rows={Math.min(20, visible.split('\n').length + 1)}
        className="ui-input mod-mono"
      />
      {interno && <p className="mod-sub mod-mt-1 mod-mb-0">Copia interna: incluye datos que no se envían al proveedor.</p>}
      <div className="mod-flex mod-gap-2 mod-mt-2 mod-center">
        <button type="button" className="ui-btn ui-btn--sm" onClick={alCopiar}>Copiar</button>
        <button type="button" className="ui-btn ui-btn--sm" onClick={onCerrar}>Cerrar</button>
        {aviso && <span className="mod-text">{aviso}</span>}
      </div>
    </div>
  );
}
