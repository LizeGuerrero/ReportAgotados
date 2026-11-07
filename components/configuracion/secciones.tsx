import type { ComponentType, SVGProps } from 'react';
import { PaletteIcon, UsersIcon } from '@/components/ui/icons';
import { SeccionApariencia } from '@/components/configuracion/SeccionApariencia';
import { SeccionColaboracion } from '@/components/configuracion/SeccionColaboracion';

/** Datos que reciben todas las secciones. Se amplía aquí si una sección futura necesita más contexto. */
export interface ContextoSeccion {
  usuarioId: string;
  esAdmin: boolean;
}

export interface SeccionConfig {
  /** Va en la URL (#clave): no cambiarla una vez publicada. */
  clave: string;
  titulo: string;
  descripcion: string;
  Icono: ComponentType<SVGProps<SVGSVGElement>>;
  Componente: ComponentType<ContextoSeccion>;
  /** Si existe y devuelve false, la sección no se muestra a esa persona (permisos). */
  visiblePara?: (ctx: ContextoSeccion) => boolean;
}

/**
 * Registro de secciones de la configuración general de la web.
 * Para añadir una categoría: crear su componente y agregar una entrada aquí. Nada más.
 */
export const SECCIONES: SeccionConfig[] = [
  {
    clave: 'apariencia',
    titulo: 'Apariencia',
    descripcion: 'Tema claro u oscuro',
    Icono: PaletteIcon,
    Componente: SeccionApariencia,
  },
  {
    clave: 'colaboracion',
    titulo: 'Colaboración',
    descripcion: 'Presencia de usuarios conectados',
    Icono: UsersIcon,
    Componente: SeccionColaboracion,
  },
];

export const seccionesVisibles = (ctx: ContextoSeccion) => SECCIONES.filter((s) => !s.visiblePara || s.visiblePara(ctx));
