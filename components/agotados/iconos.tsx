import type { ReactNode, SVGProps } from 'react';

/**
 * Iconos propios de AGOTADOS (trazo, 24×24). Se mantienen aquí para no tocar components/ui/icons.tsx,
 * que usan otros módulos.
 */
function Ico({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}
type P = SVGProps<SVGSVGElement>;

export const IcBuscar = (p: P) => (
  <Ico {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </Ico>
);
export const IcCerrar = (p: P) => (
  <Ico {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Ico>
);
export const IcChevAbajo = (p: P) => (
  <Ico {...p}>
    <path d="m6 9 6 6 6-6" />
  </Ico>
);
export const IcChevArriba = (p: P) => (
  <Ico {...p}>
    <path d="m6 15 6-6 6 6" />
  </Ico>
);
export const IcChevIzq = (p: P) => (
  <Ico {...p}>
    <path d="m15 6-6 6 6 6" />
  </Ico>
);
export const IcChevDer = (p: P) => (
  <Ico {...p}>
    <path d="m9 6 6 6-6 6" />
  </Ico>
);
export const IcAjustes = (p: P) => (
  <Ico {...p}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </Ico>
);
export const IcColumnas = (p: P) => (
  <Ico {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M9.2 4.5v15M14.8 4.5v15" />
  </Ico>
);
export const IcAjustar = (p: P) => (
  <Ico {...p}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    <path d="M9 12h6" />
  </Ico>
);
export const IcGrupos = (p: P) => (
  <Ico {...p}>
    <path d="m8 4.5 4 3.5 4-3.5M8 19.5l4-3.5 4 3.5M4 12h16" />
  </Ico>
);
export const IcCopiar = (p: P) => (
  <Ico {...p}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
    <path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
  </Ico>
);
export const IcCopiarTodo = (p: P) => (
  <Ico {...p}>
    <rect x="9" y="9" width="10.5" height="10.5" rx="2" />
    <path d="M6 15H5.5a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2H13a2 2 0 0 1 2 2V6" />
    <path d="M12 14.25h4.5M14.25 12v4.5" />
  </Ico>
);
export const IcLista = (p: P) => (
  <Ico {...p}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4.5h6M8.5 10h.01M8.5 14h.01M8.5 18h.01M12 10h4M12 14h4M12 18h4" />
  </Ico>
);
export const IcRestablecer = (p: P) => (
  <Ico {...p}>
    <path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5" />
    <path d="M4 4.5v4h4" />
  </Ico>
);
export const IcDensCompacta = (p: P) => (
  <Ico {...p}>
    <path d="M4 6h16M4 10h16M4 14h16M4 18h16" />
  </Ico>
);
export const IcDensNormal = (p: P) => (
  <Ico {...p}>
    <path d="M4 6.5h16M4 12h16M4 17.5h16" />
  </Ico>
);
export const IcDensAmplia = (p: P) => (
  <Ico {...p}>
    <path d="M4 7h16M4 17h16" />
  </Ico>
);
export const IcCuadricula = (p: P) => (
  <Ico {...p}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M4 12h16M12 4v16" />
  </Ico>
);
export const IcAjusteTexto = (p: P) => (
  <Ico {...p}>
    <path d="M4 6h16M4 12h12a3 3 0 0 1 0 6h-3" />
    <path d="m15 15-2 3 2 3" />
  </Ico>
);
export const IcOrden = (p: P) => (
  <Ico {...p}>
    <path d="M8 5v14M8 5 4.5 8.5M8 5l3.5 3.5M16 19V5M16 19l-3.5-3.5M16 19l3.5-3.5" />
  </Ico>
);
export const IcPanelDer = (p: P) => (
  <Ico {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M15 4.5v15" />
  </Ico>
);
export const IcEnfoque = (p: P) => (
  <Ico {...p}>
    <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M20 9V5.5A1.5 1.5 0 0 0 18.5 4H15M4 15v3.5A1.5 1.5 0 0 0 5.5 20H9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15" />
  </Ico>
);
export const IcVista = (p: P) => (
  <Ico {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="2.8" />
  </Ico>
);
export const IcOjoOculto = (p: P) => (
  <Ico {...p}>
    <path d="M3 3l18 18" />
    <path d="M10.6 5.7A8.7 8.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-3 3.8M6.6 7.3A15.6 15.6 0 0 0 2.5 12S6 18.5 12 18.5c1.5 0 2.8-.4 4-.9" />
    <path d="M9.9 9.9A2.8 2.8 0 0 0 14.1 14.1" />
  </Ico>
);
export const IcCheck = (p: P) => (
  <Ico {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Ico>
);
export const IcTabla = (p: P) => (
  <Ico {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M3.5 9.5h17M9.2 9.5v10" />
  </Ico>
);
export const IcFiltro = (p: P) => (
  <Ico {...p}>
    <path d="M4 5h16l-6 7.5V19l-4-2v-4.5L4 5Z" />
  </Ico>
);
export const IcSubir = (p: P) => (
  <Ico {...p}>
    <path d="M12 19V6M12 6l-5 5M12 6l5 5" />
  </Ico>
);
export const IcBajar = (p: P) => (
  <Ico {...p}>
    <path d="M12 5v13M12 18l-5-5M12 18l5-5" />
  </Ico>
);
export const IcHerramientas = (p: P) => (
  <Ico {...p}>
    <rect x="3.5" y="5" width="17" height="6" rx="1.8" />
    <path d="M7 8h.01M10.5 8h.01M14 8h4" />
    <path d="M3.5 15h17M3.5 19h10" opacity=".55" />
  </Ico>
);
export const IcBarraEstado = (p: P) => (
  <Ico {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M3.5 15.5h17" />
  </Ico>
);
export const IcCaja = (p: P) => (
  <Ico {...p}>
    <path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7Z" />
    <path d="M4 8.5 12 13l8-4.5M12 13v7" />
  </Ico>
);

/** Indicador de orden de columna: dos flechas, una se enciende según la dirección. */
export function IcOrdenColumna(props: P) {
  return (
    <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden="true" focusable="false" fill="currentColor" {...props}>
      <path className="agx-ord__up" d="M8 2.5 11.5 6.5h-7z" />
      <path className="agx-ord__down" d="M8 13.5 4.5 9.5h7z" />
    </svg>
  );
}
