'use client';

import { useState } from 'react';
import type { createClient } from '@/lib/supabase/client';

export const TIPOS_DOCUMENTO = ['NIT', 'CC', 'CE', 'PAS', 'OTRO'] as const;

/**
 * Formulario de alta de proveedor. Es el mismo en el módulo Proveedores y en Pedidos: la validación
 * real la hace la RPC proveedor_crear (permiso Proveedores/crear, documento único por organización).
 */
export default function FormProveedorNuevo({
  supabase, organizacionId, onCreado, onCancelar,
}: {
  supabase: ReturnType<typeof createClient>;
  organizacionId: string;
  /** Recibe el id interno y el nombre del proveedor recién creado. */
  onCreado: (id: number, nombre: string) => void;
  onCancelar?: () => void;
}) {
  const [v, setV] = useState({ tipo_documento: 'NIT', numero_documento: '', nombre: '', contacto: '', telefono: '', email: '' });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function crear() {
    setError('');
    if (!/^[A-Za-z0-9]{3,20}$/.test(v.numero_documento.trim().replace(/[\s.]/g, ''))) {
      return setError('Documento no válido: de 3 a 20 letras o números, sin guiones ni dígito de verificación.');
    }
    if (!v.nombre.trim()) return setError('Escribe el nombre del proveedor.');
    setGuardando(true);
    const { data, error } = await supabase.rpc('proveedor_crear', { p_org: organizacionId, p_datos: v });
    setGuardando(false);
    if (error) return setError(error.message);
    onCreado(Number(data), v.nombre.trim());
  }

  const set = (k: keyof typeof v, x: string) => setV({ ...v, [k]: x });

  return (
    <div className="mod-card mod-mb-3">
      <div className="mod-semibold mod-mb-2">Nuevo proveedor</div>
      <div className="mod-flex mod-gap-2 mod-wrap">
        <select className="ui-input ui-input--sm mod-auto" value={v.tipo_documento} onChange={(e) => set('tipo_documento', e.target.value)}>
          {TIPOS_DOCUMENTO.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input className="ui-input ui-input--sm" style={{ width: 170 }} placeholder="Número *" value={v.numero_documento}
          onChange={(e) => set('numero_documento', e.target.value)} />
        <input className="ui-input ui-input--sm mod-auto" style={{ minWidth: 280 }} placeholder="Nombre *" value={v.nombre} onChange={(e) => set('nombre', e.target.value)} />
        <input className="ui-input ui-input--sm" style={{ width: 180 }} placeholder="Contacto" value={v.contacto} onChange={(e) => set('contacto', e.target.value)} />
        <input className="ui-input ui-input--sm" style={{ width: 150 }} placeholder="Teléfono" value={v.telefono} onChange={(e) => set('telefono', e.target.value)} />
        <input className="ui-input ui-input--sm" style={{ width: 220 }} placeholder="Correo" value={v.email} onChange={(e) => set('email', e.target.value)} />
        <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" disabled={guardando} onClick={crear}>{guardando ? 'Guardando…' : 'Crear'}</button>
        {onCancelar && <button type="button" className="ui-btn ui-btn--sm" onClick={onCancelar}>Cancelar</button>}
      </div>
      <p className="mod-sub mod-mt-2 mod-mb-0">
        Por defecto cobra IVA al 19 %. Puedes cambiarlo dentro del proveedor.
      </p>
      {error && <p className="mod-error mod-text mod-mt-2 mod-mb-0">{error}</p>}
    </div>
  );
}
