'use client';

import '@/styles/mensajes.css';
import { useCallback, useRef, useState } from 'react';
import CxpMensajes from './CxpMensajes';
import Workspace from './Workspace';
import { TIPOS, esCxp, type Tipo } from './tipos';

/**
 * Módulo único de Mensajes. Navegación a la izquierda por proceso (Pedidos y Cuentas por pagar) y tipo de mensaje;
 * a la derecha el espacio de trabajo. Todos los tipos comparten la misma mecánica: la Estándar protegida, estructuras
 * propias independientes, variables comunes y asignación por proveedor.
 */
export default function MensajesModulo({
  organizacionId, empresa, usuario, puedeEditarPedidos, verPedidos, verCxp,
}: {
  organizacionId: string; empresa: string; usuario: string; puedeEditarPedidos: boolean; verPedidos: boolean; verCxp: boolean;
}) {
  const disponibles = TIPOS.filter((t) => (esCxp(t.valor) ? verCxp : verPedidos));
  const [tipo, setTipo] = useState<Tipo>(disponibles[0]?.valor ?? 'solicitud_cotizacion');
  const sucio = useRef(false);
  const alSucio = useCallback((s: boolean) => { sucio.current = s; }, []);

  const ir = (t: Tipo) => {
    if (t === tipo) return;
    if (sucio.current && !window.confirm('Tienes cambios sin guardar. ¿Descartarlos?')) return;
    sucio.current = false;
    setTipo(t);
  };
  const grupos = Array.from(new Set(disponibles.map((t) => t.grupo)));

  return (
    <div className="msj msj-modulo">
      <nav className="msj-nav" aria-label="Tipos de mensaje">
        {grupos.map((g) => (
          <div key={g} className="msj-nav__grupo">
            <div className="msj-nav__titulo">{g}</div>
            {disponibles.filter((t) => t.grupo === g).map((t) => (
              <button key={t.valor} type="button" className={tipo === t.valor ? 'msj-nav__item is-on' : 'msj-nav__item'} aria-current={tipo === t.valor} onClick={() => ir(t.valor)}>{t.texto}</button>
            ))}
          </div>
        ))}
      </nav>
      <div className="msj-modulo__main">
        {esCxp(tipo)
          ? <CxpMensajes key={tipo} organizacionId={organizacionId} empresa={empresa} usuario={usuario} onSucio={alSucio} />
          : <Workspace key={tipo} organizacionId={organizacionId} tipo={tipo} puedeEditar={puedeEditarPedidos} empresa={empresa} usuario={usuario} onSucio={alSucio} />}
      </div>
    </div>
  );
}
