'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PermisosPedidos } from '@/components/pedidos/usePermisosPedidos';
import type { CompraDetalle } from '@/components/pedidos/tipos';
import { useAjustesPedidos, type AjustesPedidos } from '@/components/pedidos/ajustes';
import { textoError } from '@/components/pedidos/ui';

export interface Aviso { tipo: 'ok' | 'error'; texto: string }
interface Deshacer { texto: string; accion: () => PromiseLike<{ error: { message?: string } | null }> }

export interface Resultado { ok: boolean; data: unknown }

interface Ctx {
  supabase: SupabaseClient;
  organizacionId: string;
  permisos: PermisosPedidos;
  d: CompraDetalle;
  /** La compra ya no admite cambios (ordenada o cerrada). */
  editable: boolean;
  ajustes: AjustesPedidos;
  cambiarAjustes: (c: Partial<AjustesPedidos>) => void;
  recargar: () => Promise<void>;
  /** Llama una RPC de la base (agrega p_org) y recarga la compra. Avisa el error o el texto de éxito. */
  llamar: (nombre: string, args: Record<string, unknown>, exito?: string | ((data: unknown) => string), deshacer?: Deshacer) => Promise<Resultado>;
  avisar: (tipo: Aviso['tipo'], texto: string) => void;
  aviso: Aviso | null;
  ultimoDeshacer: string | null;
  deshacer: () => Promise<void>;
  ocupado: boolean;
}

const Contexto = createContext<Ctx | null>(null);
export const useMesa = (): Ctx => {
  const c = useContext(Contexto);
  if (!c) throw new Error('useMesa se usa dentro de <MesaProveedor>');
  return c;
};

/** Estado compartido de la mesa de una compra: datos, avisos, deshacer y llamadas a la base. */
export function MesaProveedor({
  supabase, organizacionId, permisos, d, recargar, children,
}: {
  supabase: SupabaseClient;
  organizacionId: string;
  permisos: PermisosPedidos;
  d: CompraDetalle;
  recargar: () => Promise<void>;
  children: React.ReactNode;
}) {
  const { ajustes, cambiar } = useAjustesPedidos();
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [pila, setPila] = useState<Deshacer[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const avisar = useCallback((tipo: Aviso['tipo'], texto: string) => {
    setAviso({ tipo, texto });
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setAviso(null), tipo === 'error' ? 9000 : 4000);
  }, []);

  const llamar: Ctx['llamar'] = useCallback(async (nombre, args, exito, deshacerEntrada) => {
    setOcupado(true);
    const { data, error } = await supabase.rpc(nombre, { p_org: organizacionId, ...args });
    setOcupado(false);
    if (error) {
      avisar('error', textoError(error));
      return { ok: false, data: null };
    }
    if (deshacerEntrada) setPila((p) => [...p.slice(-19), deshacerEntrada]);
    if (exito) avisar('ok', typeof exito === 'function' ? exito(data) : exito);
    await recargar();
    return { ok: true, data };
  }, [supabase, organizacionId, avisar, recargar]);

  const deshacer = useCallback(async () => {
    const ultimo = pila[pila.length - 1];
    if (!ultimo) return;
    setPila((p) => p.slice(0, -1));
    const { error } = await ultimo.accion();
    if (error) avisar('error', textoError(error));
    else avisar('ok', `Se deshizo: ${ultimo.texto}`);
    await recargar();
  }, [pila, avisar, recargar]);

  const valor = useMemo<Ctx>(() => ({
    supabase, organizacionId, permisos, d,
    editable: d.compra.estado !== 'ordenada' && d.compra.estado !== 'cerrada',
    ajustes, cambiarAjustes: cambiar, recargar, llamar, avisar, aviso,
    ultimoDeshacer: pila.length ? pila[pila.length - 1].texto : null, deshacer, ocupado,
  }), [supabase, organizacionId, permisos, d, ajustes, cambiar, recargar, llamar, avisar, aviso, pila, deshacer, ocupado]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
