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
import { numeroCompra, type CompraDetalle } from '@/components/pedidos/tipos';
import { resumenCompra, siguientePaso, type Pestana } from '@/components/pedidos/reglas';
import { pesos } from '@/components/pedidos/comun';
import { Etapas, Vacio, textoError } from '@/components/pedidos/ui';

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
  const guia = siguientePaso(d);
  const res = resumenCompra(d);
  const pestanas: [Pestana, string][] = [
    ['productos', 'Productos y ofertas'], ['proveedores', 'Por proveedor'], ['decision', 'Decisión'],
    ['ordenes', `Órdenes (${d.ordenes.length})`], ['historial', 'Historial'],
  ];

  const resumenLinea = `${d.lineas.length} producto(s) · ${d.proveedores.length} proveedor(es) · ${res.completas.length}/${d.lineas.length} asignados${res.total > 0 ? ` · ${pesos(res.total)} decidido` : ''}`;

  return (
    <div>
      {/* Una sola cabecera: título, etapa, resumen y acciones. Sin tarjetas ni barras duplicadas. */}
      <div className="pm-cabecera">
        <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={onVolver}>← Compras</button>
        <h2 className="mod-h2 mod-mt-0 mod-mb-0 pm-cabecera__titulo">{numeroCompra(d.compra.numero)} · {d.compra.titulo}</h2>
        <span className="pm-sep" />
        {permisos.crear && (
          <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" title="Misma compra: productos, cantidades, proveedores y asignaciones, con los precios del ERP"
            onClick={async () => { const r = await llamar('compra_copiar', { p_compra: d.compra.id, p_titulo: null, p_con_asignaciones: true }, 'Compra copiada'); if (r.ok && typeof r.data === 'string') onAbrirCompra(r.data); }}>Copiar compra</button>
        )}
        {permisos.editar && editable && (
          <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost"
            onClick={async () => {
              if (!window.confirm(`¿Eliminar la compra ${numeroCompra(d.compra.numero)}? Sus productos y agotados quedan libres para otra compra.`)) return;
              const r = await llamar('compra_eliminar', { p_compra: d.compra.id }, 'Compra eliminada');
              if (r.ok) onVolver();
            }}>Eliminar</button>
        )}
      </div>
      <div className="pm-cabecera pm-cabecera--sub">
        <Etapas estado={d.compra.estado} />
        <span className="mod-sub">{resumenLinea}</span>
        <span className="pm-sep" />
        {guia.ir && guia.ir !== pestana ? (
          <span className="mod-sub"><strong>Siguiente:</strong> {guia.texto}{' '}
            <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" onClick={() => setPestana(guia.ir as Pestana)}>Ir</button></span>
        ) : <span className="mod-sub"><strong>Siguiente:</strong> {guia.texto}</span>}
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

    </div>
  );
}
