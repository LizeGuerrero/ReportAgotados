'use client';

import { createPortal } from 'react-dom';
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { ChevronDownIcon, UsersIcon } from '@/components/ui/icons';
import { matizAvatar, modoIndicador, textoUbicacion, type SesionUsuario, type UsuarioPresente } from '@/lib/presencia/logica';
import type { ConexionPresencia } from '@/components/presencia/usePresencia';

interface Props {
  usuarios: UsuarioPresente[];
  conexion: ConexionPresencia;
  /** Hasta cuántas personas se muestran como avatares; con más, un solo icono con contador. */
  maxAvatares: number;
  /** A dónde puedo ir para ver la pantalla de esa sesión: ruta, false (sin acceso por mi rol) o null (no se sabe). */
  destinoDe?: (s: SesionUsuario) => string | false | null;
  /** Navegación dentro de la aplicación (sin recargar). */
  irA?: (href: string) => void;
}

const ANCHO_PANEL = 320;

function textoEstado(s: Pick<SesionUsuario, 'estado' | 'visible'>): string {
  if (s.estado === 'inactivo') return 'Inactivo';
  return s.visible ? 'Activo ahora' : 'En segundo plano';
}

function Avatar({ u }: { u: UsuarioPresente }) {
  return (
    <span className="pres-av" style={{ '--h': matizAvatar(u.id) } as CSSProperties} data-estado={u.estado} aria-hidden="true">
      {u.iniciales}
      <span className="pres-av__dot" />
    </span>
  );
}

interface DetalleProps {
  u: UsuarioPresente;
  destinoDe?: Props['destinoDe'];
  alIr: (href: string) => void;
}

/** Enlace real (se puede abrir en otra pestaña); con clic normal navega sin recargar. */
function EnlaceIr({ href, children, alIr }: { href: string; children: React.ReactNode; alIr: (href: string) => void }) {
  return (
    <a
      href={href}
      className="pres-ir"
      onClick={(e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        alIr(href);
      }}
    >
      {children}
    </a>
  );
}

function Detalle({ u, destinoDe, alIr }: DetalleProps) {
  const otras = u.sesiones.slice(1);
  // Para ti mismo no hace falta "ir": ya estás ahí o es tu otra pestaña.
  const destino = !u.esYo && destinoDe ? destinoDe(u.principal) : null;
  return (
    <dl className="pres-det">
      <div>
        <dt>Trabajando en</dt>
        <dd>{u.principal.modulo}</dd>
      </div>
      {u.principal.pagina && (
        <div>
          <dt>Pestaña</dt>
          <dd>{u.principal.pagina}</dd>
        </div>
      )}
      <div>
        <dt>Estado</dt>
        <dd className="pres-det__estado" data-estado={u.principal.estado}>
          {textoEstado(u.principal)}
        </dd>
      </div>
      {otras.length > 0 && (
        <div>
          <dt>{otras.length === 1 ? 'Otra pestaña' : `${otras.length} pestañas más`}</dt>
          <dd>
            <ul className="pres-det__otras">
              {otras.slice(0, 3).map((s) => {
                const d = !u.esYo && destinoDe ? destinoDe(s) : null;
                return (
                  <li key={s.pestanaId}>
                    {typeof d === 'string' ? <EnlaceIr href={d} alIr={alIr}>{textoUbicacion(s)}</EnlaceIr> : textoUbicacion(s)}
                  </li>
                );
              })}
              {otras.length > 3 && <li>+{otras.length - 3} más</li>}
            </ul>
          </dd>
        </div>
      )}
      {typeof destino === 'string' && (
        <div className="pres-det__ir">
          <EnlaceIr href={destino} alIr={alIr}>
            Ir a {u.principal.modulo} →
          </EnlaceIr>
        </div>
      )}
      {destino === false && (
        <div className="pres-det__ir">
          <span className="pres-det__sin" title="Tu rol no incluye este módulo">
            Tu rol no tiene acceso a este módulo
          </span>
        </div>
      )}
    </dl>
  );
}

export function PresenciaIndicador({ usuarios, conexion, maxAvatares, destinoDe, irA }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; ancho: number } | null>(null);
  const anclaRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const idPanel = useId();

  const modo = modoIndicador(usuarios.length, maxAvatares);
  const compacto = modo === 'avatares'; // pocas personas: el detalle de cada una se ve sin hacer clic

  const cerrar = useCallback((devolverFoco: boolean) => {
    setAbierto(false);
    setSeleccionado(null);
    if (devolverFoco) {
      // el disparador que haya quedado en pantalla
      anclaRef.current?.querySelector<HTMLElement>('button')?.focus();
    }
  }, []);

  // Posición: bajo el indicador, sin salirse de la pantalla (también en móvil).
  useEffect(() => {
    if (!abierto) return;
    const colocar = () => {
      const r = anclaRef.current?.getBoundingClientRect();
      if (!r) return;
      const ancho = Math.min(ANCHO_PANEL, window.innerWidth - 16);
      const left = Math.max(8, Math.min(r.right - ancho, window.innerWidth - ancho - 8));
      setPos({ top: r.bottom + 8, left, ancho });
    };
    colocar();
    window.addEventListener('resize', colocar);
    window.addEventListener('scroll', colocar, { passive: true });
    return () => {
      window.removeEventListener('resize', colocar);
      window.removeEventListener('scroll', colocar);
    };
  }, [abierto]);

  // Foco al abrir, clic fuera y Escape.
  useEffect(() => {
    if (!abierto) return;
    const panel = panelRef.current;
    const objetivo = panel?.querySelector<HTMLElement>('.pres-fila__cab[data-sel="true"], [data-fila]') ?? panel;
    objetivo?.focus({ preventScroll: true });
    panel?.querySelector('.pres-fila[data-sel="true"]')?.scrollIntoView?.({ block: 'nearest' });

    const fuera = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anclaRef.current?.contains(t)) return;
      cerrar(false);
    };
    const tecla = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        cerrar(true);
      }
    };
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto, cerrar]);

  // Si la persona seleccionada se desconecta, el panel sigue abierto sin selección.
  useEffect(() => {
    if (seleccionado && !usuarios.some((u) => u.id === seleccionado)) setSeleccionado(null);
  }, [usuarios, seleccionado]);

  // Con la lista vacía (solo si se perdió la conexión) no hay nada que mantener abierto.
  if (conexion === 'conectando') return null;
  if (conexion === 'conectado' && usuarios.length === 0) return null;

  const alternar = (id: string | null) => {
    if (abierto && (id === null || id === seleccionado)) return cerrar(false);
    setSeleccionado(id);
    setAbierto(true);
  };

  const moverFoco = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    const filas = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-fila]'));
    if (filas.length === 0) return;
    e.preventDefault();
    const i = filas.indexOf(document.activeElement as HTMLElement);
    const j =
      e.key === 'Home' ? 0 : e.key === 'End' ? filas.length - 1 : e.key === 'ArrowDown' ? Math.min(filas.length - 1, i + 1) : Math.max(0, i - 1);
    filas[j].focus();
  };

  const sinConexion = conexion === 'sin-conexion';
  const activos = usuarios.filter((u) => u.estado === 'activo').length;

  return (
    <div className="pres" ref={anclaRef}>
      {sinConexion ? (
        <button
          type="button"
          className="pres-resumen is-off"
          aria-haspopup="dialog"
          aria-expanded={abierto}
          aria-controls={abierto ? idPanel : undefined}
          aria-label="Usuarios conectados: sin conexión, reintentando"
          title="Sin conexión · reintentando"
          onClick={() => alternar(null)}
        >
          <UsersIcon />
          <span className="pres-resumen__punto" aria-hidden="true" />
        </button>
      ) : compacto ? (
        <div className="pres-pila" role="group" aria-label={`Personas conectadas: ${usuarios.length}`}>
          {usuarios.map((u) => (
            <button
              key={u.id}
              type="button"
              className="pres-pila__btn"
              aria-haspopup="dialog"
              aria-expanded={abierto && seleccionado === u.id}
              aria-controls={abierto ? idPanel : undefined}
              aria-label={`${u.nombre}${u.esYo ? ' (tú)' : ''}, ${textoEstado(u.principal).toLowerCase()}, en ${u.principal.modulo}`}
              title={`${u.nombre}${u.esYo ? ' (tú)' : ''} · ${u.principal.modulo}`}
              onClick={() => alternar(u.id)}
            >
              <Avatar u={u} />
            </button>
          ))}
        </div>
      ) : (
        <button
          type="button"
          className="pres-resumen"
          aria-haspopup="dialog"
          aria-expanded={abierto}
          aria-controls={abierto ? idPanel : undefined}
          aria-label={`${usuarios.length} personas conectadas`}
          title={`${usuarios.length} personas conectadas`}
          onClick={() => alternar(null)}
        >
          <UsersIcon />
          <span className="pres-resumen__n">{usuarios.length}</span>
          <span className="pres-resumen__punto" aria-hidden="true" data-estado={activos > 0 ? 'activo' : 'inactivo'} />
        </button>
      )}

      {abierto &&
        createPortal(
        <div
          ref={panelRef}
          id={idPanel}
          role="dialog"
          aria-label="Usuarios conectados"
          tabIndex={-1}
          className="pres-panel"
          style={
            pos
              ? { top: pos.top, left: pos.left, width: pos.ancho, maxHeight: `min(26rem, calc(100dvh - ${pos.top}px - 0.75rem))` }
              : { visibility: 'hidden' }
          }
        >
          <header className="pres-panel__cab">
            <h2 className="pres-panel__titulo">{sinConexion ? 'Usuarios conectados' : 'Conectados ahora'}</h2>
            {!sinConexion && <span className="pres-panel__n">{usuarios.length}</span>}
          </header>

          {sinConexion ? (
            <p className="pres-panel__vacio">Sin conexión con el servicio de presencia. Reintentando automáticamente…</p>
          ) : (
            <ul className="pres-lista" onKeyDown={moverFoco}>
              {usuarios.map((u) => {
                const expandido = compacto || seleccionado === u.id;
                const cabecera = (
                  <>
                    <Avatar u={u} />
                    <span className="pres-fila__txt">
                      <span className="pres-fila__nombre">
                        {u.nombre}
                        {u.esYo && <span className="pres-fila__yo"> (tú)</span>}
                      </span>
                      {!expandido && <span className="pres-fila__sub">{textoUbicacion(u.principal)}</span>}
                    </span>
                    {u.sesiones.length > 1 && (
                      <span className="pres-fila__sesiones" title={`${u.sesiones.length} pestañas abiertas`}>
                        ×{u.sesiones.length}
                      </span>
                    )}
                  </>
                );
                return (
                  <li key={u.id} className="pres-fila" data-sel={seleccionado === u.id ? 'true' : undefined} data-estado={u.estado}>
                    {compacto ? (
                      <div className="pres-fila__cab" data-sel={seleccionado === u.id ? 'true' : undefined} tabIndex={-1}>
                        {cabecera}
                      </div>
                    ) : (
                      <button
                        type="button"
                        data-fila
                        className="pres-fila__cab pres-fila__cab--btn"
                        aria-expanded={expandido}
                        onClick={() => setSeleccionado(expandido ? null : u.id)}
                      >
                        {cabecera}
                        <ChevronDownIcon className="pres-fila__flecha" width={16} height={16} />
                      </button>
                    )}
                    {expandido && (
                      <Detalle
                        u={u}
                        destinoDe={destinoDe}
                        alIr={(href) => {
                          cerrar(false);
                          irA?.(href);
                        }}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>,
        document.body,
        )}
    </div>
  );
}
