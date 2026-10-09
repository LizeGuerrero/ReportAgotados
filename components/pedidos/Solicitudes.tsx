'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import Combobox from '@/components/Combobox';
import { useTiempoReal } from '@/components/useTiempoReal';
import PorProveedor from '@/components/pedidos/PorProveedor';
import { fecha, PanelTexto, TABLAS_PEDIDOS } from '@/components/pedidos/comun';
import TablaExcel from '@/components/TablaExcel';

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

export default function Solicitudes({
  supabase,
  organizacionId,
}: {
  supabase: SupabaseClient;
  organizacionId: string;
}) {
  const [nueva, setNueva] = useState(false);
  const [filas, setFilas] = useState<Solicitud[]>([]);
  const [estado, setEstado] = useState('');
  const [error, setError] = useState('');
  const [texto, setTexto] = useState<{ id: string; titulo: string; texto: string } | null>(null);

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
    const { data, error } = await supabase.rpc('solicitud_texto', { p_org: organizacionId, p_solicitud: s.id });
    if (error) setError(error.message);
    else setTexto({ id: s.id, titulo: `Solicitud ${s.numero_texto} — ${s.proveedor ?? ''}`, texto: data as string });
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

  if (nueva) {
    return (
      <PorProveedor
        supabase={supabase}
        organizacionId={organizacionId}
        onTerminar={() => {
          setNueva(false);
          cargar();
        }}
      />
    );
  }

  return (
    <div>
      <div className="mod-flex mod-gap-2 mod-mb-3 mod-center">
        <button type="button" className="ui-btn ui-btn--sm mod-semibold" onClick={() => setNueva(true)}>
          + Nueva solicitud de cotización
        </button>
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
        <PanelTexto
          titulo={texto.titulo}
          texto={texto.texto}
          onCopiar={() => marcarEnviada(texto.id)}
          onCerrar={() => setTexto(null)}
        />
      )}

      <TablaExcel clave="solicitudes-1" etiqueta="Tabla de solicitudes de cotización"><table className="mod-table">
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
                <td>
                  <span className={s.estado === 'borrador' ? 'ui-badge ui-badge--warning' : s.estado === 'enviada' ? 'ui-badge ui-badge--info' : 'ui-badge'}>
                    {ESTADO_TEXTO[s.estado]}
                  </span>
                </td>
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
              <tr><td colSpan={8}>No hay solicitudes</td></tr>
            )}
          </tbody>
        </table></TablaExcel>
    </div>
  );
}
