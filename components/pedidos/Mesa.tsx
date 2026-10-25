'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useTiempoReal } from '@/components/useTiempoReal';
import type { PermisosPedidos } from '@/components/pedidos/usePermisosPedidos';
import { MesaProveedor, useMesa } from '@/components/pedidos/MesaContexto';
import Matriz from '@/components/pedidos/Matriz';
import PorProveedor from '@/components/pedidos/PorProveedor';
import Decision from '@/components/pedidos/Decision';
import Historial from '@/components/pedidos/Historial';
import OrdenesCompra from '@/components/pedidos/OrdenesCompra';
import { ESTADO_COMPRA, numeroCompra, type CompraDetalle } from '@/components/pedidos/tipos';
import { resumenCompra, siguientePaso, type Pestana } from '@/components/pedidos/reglas';
import { pesos } from '@/components/pedidos/comun';
import { Badge, Etapas, Vacio, textoError } from '@/components/pedidos/ui';

/**
 * La MESA DE COMPRA: un solo lugar donde viven los productos, las ofertas, la decisión y las órdenes de una compra.
 * Las pestañas son vistas de los mismos datos (no etapas obligatorias): se puede pasar de una a otra en cualquier
 * orden. Arriba, una guía dice cuál es el siguiente paso razonable.
 */
export default function Mesa({
  supabase, organizacionId, compraId, permisos, onVolver, onAbrirCompra,
}: {
  supabase: SupabaseClient; organizacionId: string; compraId: string; permisos: PermisosPedidos; onVolver: () => void; onAbrirCompra: (id: string) => void;
}) {
  const [d, setD] = useState<CompraDetalle | null>(null);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('compra_obtener', { p_org: organizacionId, p_compra: compraId });
    if (e) setError(textoError(e));
    else { setError(''); setD(data as CompraDetalle); }
  }, [supabase, organizacionId, compraId]);

  useEffect(() => { cargar(); }, [cargar]);
  useTiempoReal(supabase, organizacionId, ['compras', 'compra_lineas', 'compra_ofertas', 'compra_asignaciones', 'ordenes_compra'], cargar);

  if (!d) {
    return error ? (
      <Vacio titulo="Esa compra no existe o no puedes verla" texto={error}>
        <button type="button" className="ui-btn ui-btn--primary" onClick={onVolver}>Volver a Compras</button>
      </Vacio>
    ) : <p className="mod-text">Cargando…</p>;
  }
  return (
    <MesaProveedor supabase={supabase} organizacionId={organizacionId} permisos={permisos} d={d} recargar={cargar}>
      <Contenido onVolver={onVolver} onAbrirCompra={onAbrirCompra} />
    </MesaProveedor>
  );
}

function Contenido({ onVolver, onAbrirCompra }: { onVolver: () => void; onAbrirCompra: (id: string) => void }) {
  const { d, editable, permisos, llamar, aviso, supabase, organizacionId, recargar } = useMesa();
  const [pestana, setPestana] = useState<Pestana>('productos');
  const e = ESTADO_COMPRA[d.compra.estado];
  const guia = siguientePaso(d);
  const res = resumenCompra(d);
  const pct = d.lineas.length ? Math.round((res.completas.length / d.lineas.length) * 100) : 0;
  const pestanas: [Pestana, string][] = [
    ['productos', 'Productos y ofertas'], ['proveedores', 'Por proveedor'], ['decision', 'Decisión'],
    ['ordenes', `Órdenes (${d.ordenes.length})`], ['historial', 'Historial'],
  ];

  return (
    <div>
      <div className="pm-cab">
        <div>
          <div className="mod-sub"><button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={onVolver}>← Compras</button></div>
          <h2 className="mod-h2 mod-mt-0">{numeroCompra(d.compra.numero)} · {d.compra.titulo} <Badge tono={e.tono}>{e.texto}</Badge></h2>
          <Etapas estado={d.compra.estado} />
        </div>
        <div className="pm-resumen">
          <div className="pm-fila"><span className="mod-sub">Productos</span><strong>{d.lineas.length}</strong></div>
          <div className="pm-fila"><span className="mod-sub">Proveedores consultados</span><strong>{d.proveedores.length}</strong></div>
          <div className="pm-fila"><span className="mod-sub">Asignados</span><strong>{res.completas.length}/{d.lineas.length}</strong></div>
          <div className="pm-prog"><i style={{ width: `${pct}%` }} /></div>
          <div className="pm-fila mod-mt-1"><span className="mod-sub">Decidido (c/IVA y flete)</span><strong>{pesos(res.total)}</strong></div>
        </div>
      </div>

      <div className="pm-guia" role="note">
        <div><strong>Siguiente paso:</strong> {guia.texto}</div>
        <span className="pm-sep" />
        {guia.ir && guia.ir !== pestana && <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" onClick={() => setPestana(guia.ir as Pestana)}>Ir</button>}
      </div>

      {aviso && <p className={aviso.tipo === 'error' ? 'mod-error' : 'mod-notice mod-text'} role={aviso.tipo === 'error' ? 'alert' : 'status'}>{aviso.texto}</p>}

      <div className="mod-tabs" role="tablist">
        {pestanas.map(([v, t]) => (
          <button key={v} type="button" role="tab" aria-selected={pestana === v} aria-current={pestana === v} className={pestana === v ? 'mod-tab is-active' : 'mod-tab'} onClick={() => setPestana(v)}>{t}</button>
        ))}
      </div>

      {pestana === 'productos' && <Matriz />}
      {pestana === 'proveedores' && <PorProveedor />}
      {pestana === 'decision' && <Decision alEmitir={() => setPestana('ordenes')} />}
      {pestana === 'ordenes' && (
        <>
          <OrdenesCompra supabase={supabase} organizacionId={organizacionId} permisos={permisos} compraId={d.compra.id} onAbrirCompra={onAbrirCompra} alCambiar={recargar} />
          {d.compra.estado === 'ordenada' && permisos.editar && (
            <button type="button" className="ui-btn ui-btn--primary" onClick={() => llamar('compra_cerrar', { p_compra: d.compra.id }, 'Compra cerrada')}>Cerrar compra</button>
          )}
        </>
      )}
      {pestana === 'historial' && <Historial supabase={supabase} organizacionId={organizacionId} compraId={d.compra.id} />}

      {editable && d.lineas.length > 0 && pestana !== 'decision' && (
        <div className="pm-barra" role="region" aria-label="Resumen de la compra">
          <span><strong>{res.completas.length}</strong> de {d.lineas.length} productos asignados</span>
          <span><strong>{res.proveedores.length}</strong> proveedor(es)</span>
          <span>Total decidido: <strong>{pesos(res.total)}</strong></span>
          <span className="pm-sep" />
          <button type="button" className="ui-btn ui-btn--primary" onClick={() => setPestana('decision')}>Revisar decisión →</button>
        </div>
      )}
    </div>
  );
}
