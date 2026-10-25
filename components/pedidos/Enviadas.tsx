'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import Combobox from '@/components/Combobox';
import { useTiempoReal } from '@/components/useTiempoReal';
import PanelMensaje from '@/components/pedidos/PanelMensaje';
import { fecha, TABLAS_PEDIDOS } from '@/components/pedidos/comun';

interface Solicitud {
  id: string;
  numero_texto: string;
  proveedor: string | null;
  estado: 'borrador' | 'enviada' | 'cerrada';
  fecha_creacion: string;
  fecha_envio: string | null;
  items: number;
  respondidos: number;
}

const ESTADO_TEXTO: Record<string, string> = {
  borrador: 'Por enviar',
  enviada: 'Enviada',
  cerrada: 'Cerrada',
};

/**
 * Enviadas: las solicitudes de cotización ya creadas (una por proveedor): ver y copiar el mensaje otra vez,
 * ver cuántas respuestas llegaron y cerrar las que ya no aplican. Crear una nueva se hace en el paso 2 (Cotizar).
 */
export default function Enviadas({
  supabase,
  organizacionId,
  puedeCrear,
  onNueva,
}: {
  supabase: SupabaseClient;
  organizacionId: string;
  puedeCrear: boolean;
  /** Lleva al paso "Cotizar". */
  onNueva: () => void;
}) {
  const [filas, setFilas] = useState<Solicitud[]>([]);
  const [estado, setEstado] = useState('');
  const [error, setError] = useState('');
  const [texto, setTexto] = useState<{ id: string; titulo: string; texto: string; interno: string } | null>(null);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.rpc('listar_solicitudes', {
      p_org: organizacionId,
      p_estado: estado || null,
      p_limit: 100,
      p_offset: 0,
    });
    if (error) setError(error.message);
    else {
      setError('');
      setFilas((data ?? []) as Solicitud[]);
    }
  }, [supabase, organizacionId, estado]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Si otra persona crea, envía o cierra una solicitud, o llega una cotización, la lista se actualiza sola
  useTiempoReal(supabase, organizacionId, TABLAS_PEDIDOS, cargar);

  async function verTexto(s: Solicitud) {
    const [a, b] = await Promise.all([
      supabase.rpc('solicitud_texto', { p_org: organizacionId, p_solicitud: s.id }),
      supabase.rpc('solicitud_texto', { p_org: organizacionId, p_solicitud: s.id, p_interno: true }),
    ]);
    if (a.error) setError(a.error.message);
    else setTexto({
      id: s.id,
      titulo: `Solicitud ${s.numero_texto} — ${s.proveedor ?? ''}`,
      texto: a.data as string,
      interno: (b.data as string) ?? '',
    });
  }

  async function marcarEnviada(id: string) {
    await supabase.rpc('solicitud_marcar_enviada', { p_org: organizacionId, p_solicitud: id });
    cargar();
  }

  async function cerrar(s: Solicitud) {
    if (!window.confirm(`¿Cerrar la solicitud ${s.numero_texto}? Las cotizaciones quedan en el historial.`)) return;
    const { error } = await supabase.rpc('solicitud_cerrar', { p_org: organizacionId, p_solicitud: s.id });
    if (error) setError(error.message);
    else {
      setTexto(null);
      cargar();
    }
  }

  return (
    <div>
      <div className="mod-flex mod-gap-2 mod-mb-3 mod-center">
        {puedeCrear && (
          <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" onClick={onNueva}>
            + Nueva solicitud (ir a Cotizar)
          </button>
        )}
        <Combobox
          opciones={[
            { valor: 'borrador', texto: 'Por enviar' },
            { valor: 'enviada', texto: 'Enviadas' },
            { valor: 'cerrada', texto: 'Cerradas' },
          ]}
          valor={estado}
          onCambio={setEstado}
          etiqueta="Estado"
          vacio="Todas"
          ancho={200}
        />
        <button type="button" className="ui-btn ui-btn--sm" onClick={cargar}>Actualizar</button>
      </div>

      {error && <p className="mod-text">Error: {error}</p>}

      {texto && (
        <PanelMensaje
          titulo={texto.titulo}
          texto={texto.texto}
          textoInterno={texto.interno}
          onCopiar={() => marcarEnviada(texto.id)}
          onCerrar={() => setTexto(null)}
        />
      )}

      <div className="mod-scroll">
        <table className="mod-table">
          <thead>
            <tr>
              {['N°', 'Proveedor', 'Estado', 'Ítems', 'Respondidos', 'Creada', 'Enviada', 'Acción'].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((s) => (
              <tr key={s.id}>
                <td>{s.numero_texto}</td>
                <td>{s.proveedor}</td>
                <td>{ESTADO_TEXTO[s.estado]}</td>
                <td>{s.items}</td>
                <td>{s.respondidos}/{s.items}</td>
                <td>{fecha(s.fecha_creacion)}</td>
                <td>{fecha(s.fecha_envio)}</td>
                <td>
                  {s.estado !== 'cerrada' && (
                    <div className="mod-flex mod-gap-2">
                      <button type="button" className="ui-btn ui-btn--sm ui-btn--soft" onClick={() => verTexto(s)}>Ver / copiar</button>
                      <button type="button" className="ui-btn ui-btn--sm" onClick={() => cerrar(s)}>Cerrar</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {filas.length === 0 && (
              <tr><td colSpan={8}>No hay solicitudes de cotización</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
