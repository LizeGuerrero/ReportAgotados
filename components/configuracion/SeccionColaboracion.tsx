'use client';

import { Interruptor } from '@/components/configuracion/Interruptor';
import { usePreferenciasPresencia } from '@/lib/presencia/preferencias';
import type { ContextoSeccion } from '@/components/configuracion/secciones';

/** Ajustes personales de la presencia de usuarios. Se guardan en este navegador. */
export function SeccionColaboracion({ usuarioId }: ContextoSeccion) {
  const [prefs, cambiar] = usePreferenciasPresencia(usuarioId);

  return (
    <div className="cfg-grupo">
      <h3 className="cfg-grupo__titulo">Presencia de usuarios</h3>
      <p className="cfg-grupo__ayuda">
        Muestra en la barra superior quién de tu organización está conectado y en qué módulo trabaja. Solo lo ven los
        miembros activos de tu organización y no se guarda en la base de datos: es información en tiempo real.
      </p>

      <Interruptor
        titulo="Compartir mi actividad"
        descripcion="Los demás ven que estás conectado, tu nombre y en qué módulo y pestaña estás."
        activo={prefs.compartir}
        onCambio={(v) => cambiar({ compartir: v })}
      />
      <Interruptor
        titulo="Mostrar quién está conectado"
        descripcion="Muestra el indicador de personas conectadas junto al tema, en la barra superior."
        activo={prefs.compartir && prefs.ver}
        onCambio={(v) => cambiar({ ver: v })}
        deshabilitado={!prefs.compartir}
        nota="Si no compartes tu actividad, tampoco ves la de los demás."
      />

      <p className="cfg-grupo__pie">Estas preferencias valen para este navegador y esta cuenta.</p>
    </div>
  );
}
