'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useTiempoReal } from '@/components/useTiempoReal';
import PorProveedor from '@/components/pedidos/PorProveedor';
import { boton, campo, celda, fecha, PanelTexto, TABLAS_PEDIDOS } from '@/components/pedidos/comun';

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
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <button type="button" style={{ ...boton, fontWeight: 600 }} onClick={() => setNueva(true)}>
          + Nueva solicitud de cotización
        </button>
        <select value={estado} onChange={(e) => setEstado(e.target.value)} style={campo} aria-label="Estado">
          <option value="">Todas</option>
          <option value="borrador">Por enviar</option>
          <option value="enviada">Enviadas</option>
          <option value="cerrada">Cerradas</option>
        </select>
        <button type="button" style={boton} onClick={cargar}>Actualizar</button>
      </div>

      {error && <p style={{ fontSize: 13 }}>Error: {error}</p>}

      {texto && (
        <PanelTexto
          titulo={texto.titulo}
          texto={texto.texto}
          onCopiar={() => marcarEnviada(texto.id)}
          onCerrar={() => setTexto(null)}
        />
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              {['N°', 'Proveedor', 'Estado', 'Ítems', 'Respondidos', 'Creada', 'Enviada', 'Acción'].map((h) => (
                <th key={h} style={{ ...celda, fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((s) => (
              <tr key={s.id}>
                <td style={celda}>{s.numero_texto}</td>
                <td style={celda}>{s.proveedor}</td>
                <td style={celda}>{ESTADO_TEXTO[s.estado]}</td>
                <td style={celda}>{s.items}</td>
                <td style={celda}>{s.respondidos}/{s.items}</td>
                <td style={celda}>{fecha(s.fecha_creacion)}</td>
                <td style={celda}>{fecha(s.fecha_envio)}</td>
                <td style={celda}>
                  {s.estado !== 'cerrada' && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" style={boton} onClick={() => verTexto(s)}>Ver / copiar</button>
                      <button type="button" style={boton} onClick={() => cerrar(s)}>Cerrar</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {filas.length === 0 && (
              <tr><td style={celda} colSpan={8}>No hay solicitudes</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
