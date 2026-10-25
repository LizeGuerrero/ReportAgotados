'use client';

import { useEffect, type ReactNode } from 'react';
import { CLASE_TONO, ESTADO_COMPRA, ETAPAS, type EstadoCompra, type Tono } from '@/components/pedidos/tipos';
import '@/styles/pedidos-mesa.css';

/** Ventana modal sencilla: se cierra con Escape o al pulsar el fondo. */
export function Modal({
  titulo,
  onCerrar,
  children,
  ancha = false,
}: {
  titulo: string;
  onCerrar: () => void;
  children: React.ReactNode;
  ancha?: boolean;
}) {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onCerrar]);

  return (
    <div className="pm-modal" role="dialog" aria-modal="true" aria-label={titulo} onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className={ancha ? 'pm-modal__card pm-modal__card--ancha' : 'pm-modal__card'}>
        <h2 className="pm-modal__title">{titulo}</h2>
        {children}
      </div>
    </div>
  );
}

/** Mensaje legible de un error de Supabase. */
export function textoError(e: { message?: string } | null | undefined): string {
  return e?.message ?? 'Ocurrió un error';
}

/** Copia texto al portapapeles; devuelve si pudo. */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

export function Badge({ tono = 'gris', children, titulo }: { tono?: Tono; children: ReactNode; titulo?: string }) {
  return <span className={CLASE_TONO[tono]} title={titulo}>{children}</span>;
}

export function Vacio({ titulo, texto, children }: { titulo: string; texto?: string; children?: ReactNode }) {
  return (
    <div className="pm-vacio">
      <strong>{titulo}</strong>
      {texto && <p>{texto}</p>}
      {children}
    </div>
  );
}

/** Las etapas de una compra: Armando → Cotizando → Decidiendo → Ordenada → Cerrada. */
export function Etapas({ estado }: { estado: EstadoCompra }) {
  const actual = ETAPAS.indexOf(estado);
  return (
    <ol className="pm-etapas-lista" aria-label="Etapa de la compra">
      {ETAPAS.map((e, i) => (
        <li key={e} className={i < actual ? 'hecha' : i === actual ? 'actual' : ''} aria-current={i === actual ? 'step' : undefined}>
          {ESTADO_COMPRA[e].texto}
        </li>
      ))}
    </ol>
  );
}
