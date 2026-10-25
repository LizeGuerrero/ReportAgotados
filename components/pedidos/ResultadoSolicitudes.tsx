'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import PanelMensaje from '@/components/pedidos/PanelMensaje';

export interface SolicitudCreada {
  solicitud_id: string;
  proveedor_id: number;
  items: number;
}

interface Texto {
  id: string;
  proveedor: string;
  items: number;
  proveedorTexto: string;
  internoTexto: string;
}

/**
 * Pantalla posterior a "Crear solicitudes": un mensaje por proveedor, armado con la estructura
 * configurada en el módulo Mensajes (lo que ve el proveedor) y su copia interna. Es la misma para
 * el modo "por ítem" y "por proveedor".
 */
export default function ResultadoSolicitudes({
  supabase,
  organizacionId,
  creadas,
  omitidos,
  nombreProveedor,
  onTerminar,
  onIrAComparativo,
}: {
  supabase: SupabaseClient;
  organizacionId: string;
  creadas: SolicitudCreada[];
  omitidos: number;
  nombreProveedor: (id: number) => string;
  onTerminar: () => void;
  onIrAComparativo?: () => void;
}) {
  const [textos, setTextos] = useState<Texto[] | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const lista: Texto[] = [];
      for (const c of creadas) {
        const [a, b] = await Promise.all([
          supabase.rpc('solicitud_texto', { p_org: organizacionId, p_solicitud: c.solicitud_id }),
          supabase.rpc('solicitud_texto', { p_org: organizacionId, p_solicitud: c.solicitud_id, p_interno: true }),
        ]);
        lista.push({
          id: c.solicitud_id,
          proveedor: nombreProveedor(c.proveedor_id),
          items: c.items,
          proveedorTexto: a.error ? `Error al generar el texto: ${a.error.message}` : (a.data as string),
          internoTexto: b.error ? `Error al generar el texto: ${b.error.message}` : (b.data as string),
        });
      }
      if (vivo) setTextos(lista);
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, organizacionId, creadas]);

  return (
    <div>
      <p className="mod-md">
        {creadas.length === 0
          ? 'No se creó ninguna solicitud.'
          : `Se crearon ${creadas.length} solicitud(es), una por proveedor. Copia cada texto y envíalo.`}
      </p>
      {omitidos > 0 && (
        <p className="mod-text">
          {omitidos} combinación(es) ítem-proveedor se omitieron porque ya estaban en una solicitud abierta.
        </p>
      )}
      {textos === null && creadas.length > 0 && <p className="mod-text">Preparando los mensajes…</p>}
      {textos?.map((t) => (
        <PanelMensaje
          key={t.id}
          titulo={`${t.proveedor} — ${t.items} ítem(s)`}
          texto={t.proveedorTexto}
          textoInterno={t.internoTexto}
          onCopiar={async () => {
            await supabase.rpc('solicitud_marcar_enviada', { p_org: organizacionId, p_solicitud: t.id });
          }}
          onCerrar={() => {}}
        />
      ))}
      <p className="mod-text">
        Cuando los proveedores respondan, registra los costos y compáralos en el paso 3 (Comparativo).
      </p>
      <div className="mod-flex mod-gap-2 mod-mt-2">
        {onIrAComparativo && creadas.length > 0 && (
          <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" onClick={onIrAComparativo}>
            Ir al Comparativo
          </button>
        )}
        <button type="button" className="ui-btn ui-btn--sm" onClick={onTerminar}>Terminar</button>
      </div>
    </div>
  );
}
