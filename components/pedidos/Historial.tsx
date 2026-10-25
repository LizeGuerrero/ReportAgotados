'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useTiempoReal } from '@/components/useTiempoReal';
import { fecha } from '@/components/pedidos/comun';
import { numeroCompra, type CompraResumen } from '@/components/pedidos/tipos';
import { Badge, Vacio, textoError } from '@/components/pedidos/ui';

interface Evento { id: number; fecha: string; tipo: string; texto: string; compra_id: string; compra_numero: number | null; usuario: string | null; total: number }

const TIPO: Record<string, string> = {
  compra: 'Compra', producto: 'Producto', proveedor: 'Proveedor', cotizacion: 'Cotización', oferta: 'Oferta',
  decision: 'Decisión', orden: 'Orden', catalogo: 'Catálogo',
};
const POR_PAGINA = 100;

/** Línea de tiempo de todas las decisiones: quién, qué y cuándo, para entender por qué se compró lo que se compró. */
export default function Historial({
  supabase, organizacionId, compraId, onAbrirCompra,
}: { supabase: SupabaseClient; organizacionId: string; compraId?: string; onAbrirCompra?: (id: string) => void }) {
  const [compra, setCompra] = useState(compraId ?? '');
  const [tipo, setTipo] = useState('');
  const [texto, setTexto] = useState('');
  const [q, setQ] = useState('');
  const [pagina, setPagina] = useState(0);
  const [compras, setCompras] = useState<CompraResumen[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [error, setError] = useState('');

  useEffect(() => { const t = setTimeout(() => { setQ(texto.trim()); setPagina(0); }, 300); return () => clearTimeout(t); }, [texto]);
  useEffect(() => {
    if (compraId) return;
    supabase.rpc('listar_compras', { p_org: organizacionId }).then(({ data }) => setCompras((data ?? []) as CompraResumen[]));
  }, [supabase, organizacionId, compraId]);

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('historial_listar', {
      p_org: organizacionId, p_compra: compra || null, p_tipo: tipo || null, p_busqueda: q || null, p_limit: POR_PAGINA, p_offset: pagina * POR_PAGINA,
    });
    if (e) setError(textoError(e)); else { setError(''); setEventos((data ?? []) as Evento[]); }
  }, [supabase, organizacionId, compra, tipo, q, pagina]);
  useEffect(() => { cargar(); }, [cargar]);
  useTiempoReal(supabase, organizacionId, ['compras', 'ordenes_compra'], cargar);

  const total = eventos[0]?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <div>
      {!compraId && <p className="mod-text mod-mt-0">Todo lo que pasó, en orden: cotizaciones, decisiones, órdenes y cambios de catálogo.</p>}
      <div className="mod-toolbar mod-toolbar--top">
        {!compraId && (
          <select className="ui-input ui-input--sm mod-auto" value={compra} onChange={(e) => { setCompra(e.target.value); setPagina(0); }} aria-label="Compra">
            <option value="">Todas las compras</option>
            {compras.map((c) => <option key={c.id} value={c.id}>{numeroCompra(c.numero)} · {c.titulo}</option>)}
          </select>
        )}
        <select className="ui-input ui-input--sm mod-auto" value={tipo} onChange={(e) => { setTipo(e.target.value); setPagina(0); }} aria-label="Tipo">
          <option value="">Todos los tipos</option>
          {Object.entries(TIPO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input className="ui-input ui-input--sm mod-auto" style={{ minWidth: 260 }} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar en el texto" aria-label="Buscar" />
      </div>
      {error && <p className="mod-error">{error}</p>}
      {eventos.length === 0 ? <Vacio titulo="Sin eventos" texto="Ningún evento coincide con el filtro." /> : (
        <div className="mod-scroll">
          <table className="mod-table">
            <thead><tr><th>Cuándo</th><th>Tipo</th><th>Qué pasó</th>{!compraId && <th>Compra</th>}<th>Quién</th></tr></thead>
            <tbody>
              {eventos.map((e) => (
                <tr key={e.id}>
                  <td className="mod-sub" style={{ whiteSpace: 'nowrap' }}>{fecha(e.fecha)}</td>
                  <td><Badge>{TIPO[e.tipo] ?? e.tipo}</Badge></td>
                  <td>{e.texto}</td>
                  {!compraId && <td><button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => onAbrirCompra?.(e.compra_id)}>{numeroCompra(e.compra_numero ?? 0)}</button></td>}
                  <td className="mod-sub">{e.usuario ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mod-pager">
        <button disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>Anterior</button>
        <span>Página {pagina + 1} de {paginas} ({total} evento(s))</span>
        <button disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)}>Siguiente</button>
      </div>
    </div>
  );
}
