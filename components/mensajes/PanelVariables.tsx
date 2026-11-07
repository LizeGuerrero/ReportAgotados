'use client';

import { useMemo, useState } from 'react';
import { agruparVariables, type VariableDef } from '@/lib/mensajes/variables';

/**
 * Variables disponibles (las mismas para Pedidos y Cuentas por pagar, según las define la base de datos).
 * Un clic inserta la variable donde esté el cursor; al pasar el mouse se ve qué significa y un ejemplo.
 */
export default function PanelVariables({
  variables, onInsertar, deshabilitado,
}: { variables: VariableDef[]; onInsertar: (v: VariableDef) => void; deshabilitado: boolean }) {
  const [activa, setActiva] = useState<VariableDef | null>(null);
  const grupos = useMemo(() => agruparVariables(variables), [variables]);

  return (
    <section className="msj-panel" aria-label="Variables disponibles">
      <header className="msj-panel__cab">
        <h3 className="msj-panel__titulo">Variables</h3>
        <span className="msj-sub">Clic para insertar donde está el cursor</span>
      </header>
      {grupos.map((g) => (
        <div key={g.grupo} className="msj-vars__grupo">
          <div className="msj-vars__nombre">{g.grupo}</div>
          <div className="msj-vars__chips">
            {g.items.map((v) => (
              <button key={`${v.ambito}:${v.clave}`} type="button" className="msj-chip" disabled={deshabilitado}
                onMouseEnter={() => setActiva(v)} onFocus={() => setActiva(v)} onMouseLeave={() => setActiva(null)} onBlur={() => setActiva(null)}
                onMouseDown={(e) => e.preventDefault() /* conserva el cursor del campo */}
                onClick={() => onInsertar(v)} title={`${v.ayuda} Ej.: ${v.ejemplo}`}>
                {`{${v.clave}}`}
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="msj-vars__detalle" aria-live="polite">
        {activa ? <><b>{`{${activa.clave}}`}</b> · {activa.ayuda} <span className="msj-sub">Ej.: {activa.ejemplo}</span></> : 'Si el proveedor no tiene el dato, la variable queda vacía.'}
      </p>
    </section>
  );
}
