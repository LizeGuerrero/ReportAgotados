// @ts-nocheck  (las pruebas de interfaz se compilan con esbuild en tests/ui; el build de Next no debe revisarlas)
import React from 'react';
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react';
import {
  agruparUsuarios, matizAvatar, modoIndicador, textoUbicacion, INACTIVO_MS,
} from '@/lib/presencia/logica';
import {
  componerPagina, leerPestanasDom, limpiarEtiquetaPestana, ubicacionDesdeRuta,
} from '@/lib/presencia/ubicacion';
import { segmentosNavegables, destinoPermitido } from '@/lib/presencia/permisos';
import { leerPreferencias, veIndicador, PREFERENCIAS_POR_DEFECTO } from '@/lib/presencia/preferencias';
import { usePresencia } from '@/components/presencia/usePresencia';
import { PresenciaIndicador } from '@/components/presencia/PresenciaIndicador';

let fallos = 0, total = 0;
const ok = (c: boolean, m: string) => { total++; console.log((c ? 'ok   ' : 'FALLA ') + m); if (!c) fallos++; };
const esperar = async (cond: () => boolean, m: string, ms = 1500) => {
  const t0 = Date.now();
  while (!cond() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 10));
  ok(cond(), m);
};
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- datos de ejemplo
const meta = (o: any = {}) => ({
  usuario_id: 'u1', nombre: 'María López', iniciales: 'ML', pestana_id: 't1',
  modulo: 'Cuentas por pagar', pagina: 'Cartera', ruta: '/app/mi-org/cxp', estado: 'activo', visible: true, ...o,
});

// ===================================================== lógica pura
{
  const crudo = {
    u1: [meta()],
    u2: [meta({ usuario_id: 'u2', nombre: 'Carlos Pérez', iniciales: 'CP', modulo: 'Agotados', pagina: 'Reporte de agotados', estado: 'inactivo' })],
    yo: [meta({ usuario_id: 'yo', nombre: 'Ana Rodríguez', iniciales: 'AR', modulo: 'Pedidos', pagina: 'Comparativo' })],
  };
  const l = agruparUsuarios(crudo, 'yo');
  ok(l.length === 3, 'agrupar: una entrada por persona');
  ok(l[0].esYo && l[0].nombre === 'Ana Rodríguez', 'agrupar: tú primero');
  ok(l[1].id === 'u1' && l[2].id === 'u2', 'agrupar: luego activos y al final inactivos');
  ok(l[2].estado === 'inactivo', 'agrupar: estado inactivo se conserva');
  ok(textoUbicacion(l[0].principal) === 'Pedidos › Comparativo', 'ubicación: módulo › pestaña');
  ok(textoUbicacion({ modulo: 'Inicio', pagina: '' }) === 'Inicio', 'ubicación: solo módulo si no hay pestaña');
}
{
  // Un mismo usuario con 3 pestañas (una duplicada por reconexión) = UNA persona con 2 sesiones
  const crudo = {
    u1: [
      meta({ pestana_id: 'a', modulo: 'Pedidos', pagina: 'Compras', visible: false }),
      meta({ pestana_id: 'b', modulo: 'Agotados', pagina: 'Reporte de agotados', visible: true }),
      meta({ pestana_id: 'a', modulo: 'Pedidos', pagina: 'Compras', visible: false }),
    ],
  };
  const [u] = agruparUsuarios(crudo, 'otro');
  ok(agruparUsuarios(crudo, 'otro').length === 1, 'varias pestañas: sigue siendo una sola persona');
  ok(u.sesiones.length === 2, 'varias pestañas: la pestaña repetida no cuenta dos veces');
  ok(u.principal.modulo === 'Agotados', 'varias pestañas: principal = la que está a la vista');
  ok(u.sesiones[1].modulo === 'Pedidos', 'varias pestañas: se conserva dónde está la otra');
  const dos = agruparUsuarios({ u1: [meta({ pestana_id: 'a', estado: 'inactivo' }), meta({ pestana_id: 'b', estado: 'activo' })] }, 'x')[0];
  ok(dos.estado === 'activo' && dos.principal.pestanaId === 'b', 'varias pestañas: activo si alguna pestaña lo está');
}
{
  // Los datos vienen de otros navegadores: se validan
  const sucio = {
    a: [null, 5, {}, { modulo: '' }],
    b: 'no-es-lista',
    c: [{ modulo: 'Pedidos\u0000\n  X', nombre: '  '.concat('N'.repeat(300)), pagina: 'P'.repeat(500), estado: 'raro', visible: 'si', iniciales: 'abcdef' }],
  };
  const r = agruparUsuarios(sucio as any, 'z');
  ok(r.length === 1 && r[0].id === 'c', 'saneo: se descartan entradas inválidas');
  ok(r[0].principal.modulo === 'Pedidos X', 'saneo: quita caracteres de control');
  ok(r[0].nombre.length <= 80 && r[0].principal.pagina.length <= 120, 'saneo: limita el largo');
  ok(r[0].principal.estado === 'activo' && r[0].iniciales === 'ABC', 'saneo: estado desconocido -> activo, iniciales cortas');
  ok(agruparUsuarios(null as any, 'z').length === 0, 'saneo: estado nulo no rompe');
  ok(matizAvatar('u1') === matizAvatar('u1') && matizAvatar('u1') !== matizAvatar('u2'), 'avatar: color estable por persona');
}
ok(modoIndicador(3, 3) === 'avatares' && modoIndicador(4, 3) === 'resumen', 'modo: avatares hasta el límite, luego icono con contador');
ok(modoIndicador(1, 0) === 'resumen', 'modo: en pantallas estrechas siempre resumen');

// ===================================================== ubicación
{
  const u = (p: string) => ubicacionDesdeRuta(p, 'mi-org');
  ok(u('/app/mi-org/agotados').modulo === 'Agotados', 'ruta: agotados');
  ok(u('/app/mi-org/pedidos').modulo === 'Pedidos' && u('/app/mi-org/pedidos').pagina === '', 'ruta: pedidos (la pestaña sale del DOM)');
  ok(u('/app/mi-org/cxp').pagina === 'Cartera' && u('/app/mi-org/cxp/excluidas').pagina === 'Excluidas', 'ruta: cxp y cxp/excluidas');
  ok(u('/app/mi-org/cxp-pagados').pagina === 'Pagados' && u('/app/mi-org/cxp-pagados').modulo === 'Cuentas por pagar', 'ruta: cxp-pagados');
  ok(u('/app/mi-org/cxp-cargar').pagina === 'Cargar archivo', 'ruta: cxp-cargar');
  ok(u('/app/mi-org/admin').modulo === 'Administración', 'ruta: admin');
  ok(u('/app/mi-org/configuracion').modulo === 'Configuración', 'ruta: configuración');
  ok(u('/app/mi-org').modulo === 'Inicio', 'ruta: inicio de la organización');
  ok(u('/app/mi-org/algo-nuevo').modulo === 'Aplicación', 'ruta: desconocida no rompe');
  ok(ubicacionDesdeRuta('/app/mi%20org/items', 'mi org').modulo === 'Ítems', 'ruta: slug con caracteres codificados');
  ok(limpiarEtiquetaPestana('1. AGOTADOS') === 'AGOTADOS' && limpiarEtiquetaPestana('  Órdenes   de compra ') === 'Órdenes de compra', 'etiqueta: sin numeración');
  ok(componerPagina({ modulo: 'Ítems', pagina: 'Catálogo' }, ['Logística']) === 'Catálogo › Logística', 'página: ruta + pestaña interna');
  ok(componerPagina({ modulo: 'Pedidos', pagina: '' }, ['Compras', 'Compras', 'Cotizar']) === 'Compras › Cotizar', 'página: sin repetidos');
}
{
  document.body.innerHTML = `
    <header class="app-header"><button role="tab" aria-selected="true">Falso</button></header>
    <div role="tablist">
      <button role="tab" aria-selected="false">Solicitudes<span class="ui-badge">3</span></button>
      <button role="tab" aria-selected="true">Miembros<span class="ui-badge">12</span></button>
    </div>
    <div class="mod-tabs">
      <button aria-current="true" class="mod-tab is-active">General</button>
      <button aria-current="false" class="mod-tab">Historial</button>
    </div>
    <div role="tablist"><button role="tab" aria-selected="true" aria-current="true">1. Cotizar</button></div>
    <div role="dialog"><button role="tab" aria-selected="true">En diálogo</button></div>`;
  const tabs = leerPestanasDom(document);
  ok(tabs.join('|') === 'Miembros|General|Cotizar', 'DOM: lee pestañas activas, sin insignias, sin cabecera ni diálogos');
  document.body.innerHTML = '';
}
{
  ok(leerPreferencias(null) === PREFERENCIAS_POR_DEFECTO, 'preferencias: por defecto compartir y ver');
  ok(leerPreferencias('{"ver":false}').ver === false && leerPreferencias('{"ver":false}').compartir === true, 'preferencias: valores parciales');
  ok(leerPreferencias('basura{').compartir === true, 'preferencias: JSON dañado no rompe');
  ok(veIndicador({ ver: true, compartir: false }) === false && veIndicador({ ver: true, compartir: true }) === true, 'preferencias: sin compartir no se ve el indicador (reciprocidad)');
}

// ===================================================== hook con un canal simulado
function crearFake() {
  const canales: any[] = [];
  const client: any = {
    canales,
    channel(topic: string, opts: any) {
      const c: any = {
        topic, opts, handlers: [], tracks: [], untracks: 0, cb: null, removido: false, estado: {},
        on(_t: string, _f: any, fn: any) { c.handlers.push(fn); return c; },
        subscribe(cb: any) { c.cb = cb; return c; },
        track(p: any) { c.tracks.push(p); return Promise.resolve('ok'); },
        untrack() { c.untracks++; return Promise.resolve('ok'); },
        presenceState() { return c.estado; },
      };
      canales.push(c);
      return c;
    },
    removeChannel(c: any) { c.removido = true; return Promise.resolve('ok'); },
    auth: { onAuthStateChange: (fn: any) => { client.authFn = fn; return { data: { subscription: { unsubscribe() { client.authSalio = true; } } } }; } },
  };
  return client;
}
const ultimo = (cl: any) => cl.canales[cl.canales.length - 1];
const unir = (c: any) => act(() => { c.cb('SUBSCRIBED'); });
const sync = (c: any, estado: any) => act(() => { c.estado = estado; c.handlers.forEach((h: any) => h()); });

function Arnes(p: any) {
  const r = usePresencia({
    supabase: p.cliente, organizacionId: 'org-1', slug: 'mi-org', pathname: p.pathname ?? '/app/mi-org/agotados',
    usuario: { id: 'yo', nombre: 'Ana Rodríguez', iniciales: 'AR' }, compartir: p.compartir ?? true, ver: p.ver ?? true,
  });
  p.espia?.(r);
  return null;
}

// Intervalos controlados para probar la inactividad sin esperar minutos
const setIntervalReal = globalThis.setInterval;
const dateNowReal = Date.now;

{
  const cl = crearFake(); let r: any = null;
  const { unmount } = render(<Arnes cliente={cl} espia={(x: any) => (r = x)} />);
  const c = ultimo(cl);
  ok(cl.canales.length === 1 && c.topic === 'presencia:org-1', 'hook: un canal por organización (presencia:<id>)');
  ok(c.opts.config.private === true, 'hook: el canal es privado (lo autoriza el RLS)');
  ok(c.opts.config.presence.key === 'yo', 'hook: la clave de presencia es el id del usuario (agrupa sus pestañas)');
  ok(r.conexion === 'conectando' && r.usuarios.length === 0, 'hook: antes de unirse no muestra nada');
  await unir(c);
  ok(c.tracks.length === 1, 'hook: al unirse publica su presencia');
  const p = c.tracks[0];
  ok(p.modulo === 'Agotados' && p.pagina === 'Reporte de agotados' && p.estado === 'activo' && p.usuario_id === 'yo', 'hook: publica módulo, pestaña y estado reales');
  ok(p.ruta === '/app/mi-org/agotados', 'hook: publica la ruta para que otros puedan ir allí');
  ok(r.conexion === 'conectado', 'hook: queda conectado');

  await sync(c, { yo: [{ ...p, presence_ref: '1' }], u2: [meta({ usuario_id: 'u2', nombre: 'Carlos Pérez', iniciales: 'CP', modulo: 'Pedidos', pagina: 'Historial' })] });
  ok(r.usuarios.length === 2 && r.usuarios[0].esYo, 'hook: la lista refleja el estado del canal (tú primero)');

  // varias pestañas de Carlos: sigue siendo una persona
  await sync(c, { yo: [{ ...p }], u2: [meta({ usuario_id: 'u2', nombre: 'Carlos Pérez', iniciales: 'CP', pestana_id: 'x', modulo: 'Pedidos' }), meta({ usuario_id: 'u2', nombre: 'Carlos Pérez', iniciales: 'CP', pestana_id: 'y', modulo: 'Ítems' })] });
  ok(r.usuarios.length === 2 && r.usuarios[1].sesiones.length === 2, 'hook: dos pestañas de la misma persona = 1 usuario con 2 sesiones');

  // alguien se va (cierra el navegador): desaparece de la lista
  await sync(c, { yo: [{ ...p }] });
  ok(r.usuarios.length === 1, 'hook: quien se desconecta sale de la lista');

  // navegación: otra ruta -> se vuelve a publicar con la nueva ubicación
  const n0 = c.tracks.length;
  cleanup();
  const cl2 = crearFake(); let r2: any = null;
  const h = render(<Arnes cliente={cl2} pathname="/app/mi-org/agotados" espia={(x: any) => (r2 = x)} />);
  await unir(ultimo(cl2));
  h.rerender(<Arnes cliente={cl2} pathname="/app/mi-org/cxp-pagados" espia={(x: any) => (r2 = x)} />);
  await esperar(() => ultimo(cl2).tracks.length >= 2, 'hook: al navegar se actualiza lo publicado');
  const q = ultimo(cl2).tracks[ultimo(cl2).tracks.length - 1];
  ok(q.modulo === 'Cuentas por pagar' && q.pagina === 'Pagados', 'hook: la nueva ubicación es la de la ruta');
  ok(cl2.canales.length === 1, 'hook: navegar NO recrea el canal');

  // cambio de pestaña interna (estado de React, sin cambiar la URL)
  document.body.innerHTML = '<div role="tablist"><button role="tab" aria-selected="true">Órdenes de compra</button></div>';
  h.rerender(<Arnes cliente={cl2} pathname="/app/mi-org/pedidos" espia={(x: any) => (r2 = x)} />);
  await esperar(() => { const t = ultimo(cl2).tracks; return t[t.length - 1].pagina === 'Órdenes de compra'; }, 'hook: detecta la pestaña interna (Pedidos › Órdenes de compra)');
  document.body.innerHTML = '<div role="tablist"><button role="tab" aria-selected="false">Órdenes de compra</button><button role="tab" aria-selected="true">Historial</button></div>';
  await esperar(() => { const t = ultimo(cl2).tracks; return t[t.length - 1].pagina === 'Historial'; }, 'hook: cambiar de pestaña actualiza la presencia sin navegar');
  document.body.innerHTML = '';

  // pérdida y recuperación de conexión
  await sync(ultimo(cl2), { yo: [{ ...ultimo(cl2).tracks[0] }] });
  const cc = ultimo(cl2);
  const antes = cc.tracks.length;
  await act(() => { cc.cb('CHANNEL_ERROR', new Error('sin red')); });
  ok(r2.conexion === 'sin-conexion' && r2.usuarios.length === 0, 'reconexión: sin conexión no se muestran datos viejos');
  await unir(cc);
  ok(r2.conexion === 'conectado' && cc.tracks.length === antes + 1, 'reconexión: al volver se publica de nuevo');
  await act(() => { window.dispatchEvent(new window.Event('offline')); });
  ok(r2.conexion === 'sin-conexion', 'reconexión: evento offline marca sin conexión');
  await act(() => { window.dispatchEvent(new window.Event('online')); });
  await esperar(() => cl2.canales.length === 2, 'reconexión: al volver la red se crea un canal nuevo');
  ok(cc.removido === true, 'reconexión: el canal caído se limpia');
  await unir(ultimo(cl2));
  ok(ultimo(cl2).tracks.length === 1 && r2.conexion === 'conectado', 'reconexión: el canal nuevo vuelve a publicar');

  // cerrar sesión: sale al instante, sin esperar al servidor
  const form = document.createElement('form'); form.action = 'http://localhost/auth/signout'; form.method = 'post';
  document.body.appendChild(form);
  const u0 = ultimo(cl2).untracks;
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  ok(ultimo(cl2).untracks === u0 + 1, 'cerrar sesión: se retira del canal al enviar el formulario');
  const u1 = ultimo(cl2).untracks;
  await act(() => { cl2.authFn('SIGNED_OUT'); });
  ok(ultimo(cl2).untracks === u1 + 1, 'cerrar sesión: SIGNED_OUT también retira la presencia');
  form.remove();
  window.dispatchEvent(new window.Event('pagehide'));
  ok(ultimo(cl2).untracks === u1 + 2, 'cerrar el navegador: pagehide retira la presencia');

  // desmontar limpia todo
  const ult = ultimo(cl2);
  h.unmount();
  ok(ult.removido === true && ult.untracks > u1, 'desmontar: retira la presencia y elimina el canal');
  ok(cl2.authSalio === true, 'desmontar: cancela la escucha de sesión');
  void unmount; void n0;
  cleanup();
}
{
  // sin compartir ni ver: ni siquiera se conecta
  const cl = crearFake();
  render(<Arnes cliente={cl} compartir={false} ver={false} />);
  await pausa(50);
  ok(cl.canales.length === 0, 'preferencias: sin compartir ni ver no se abre ningún canal');
  cleanup();
  // ver sin compartir (caso límite): recibe pero no publica
  const cl2 = crearFake();
  render(<Arnes cliente={cl2} compartir={false} ver={true} />);
  await unir(ultimo(cl2));
  await pausa(300);
  ok(ultimo(cl2).tracks.length === 0, 'preferencias: sin compartir nunca publica');
  cleanup();
  // solo compartir (indicador oculto): publica pero no devuelve la lista
  const cl3 = crearFake(); let r3: any = null;
  render(<Arnes cliente={cl3} compartir={true} ver={false} espia={(x: any) => (r3 = x)} />);
  await unir(ultimo(cl3));
  await sync(ultimo(cl3), { yo: [meta({ usuario_id: 'yo' })] });
  ok(ultimo(cl3).tracks.length === 1 && r3.usuarios.length === 0, 'preferencias: con el indicador oculto sigue visible para otros');
  // volver a compartir=false retira la presencia
  cleanup();
}
{
  // inactividad: 5 min sin interacción -> "inactivo"; al volver a usar la pantalla -> "activo"
  let ahora = dateNowReal();
  Date.now = () => ahora;
  const tareas: any[] = [];
  globalThis.setInterval = ((fn: any, ms: number) => { tareas.push(fn); return tareas.length; }) as any;
  const cl = crearFake();
  render(<Arnes cliente={cl} />);
  globalThis.setInterval = setIntervalReal;
  const c = ultimo(cl);
  await unir(c);
  ok(c.tracks[0].estado === 'activo', 'inactividad: empieza activo');
  ahora += INACTIVO_MS + 1000;
  await act(() => { tareas.forEach((t) => t()); });
  await esperar(() => c.tracks.length >= 2 && c.tracks[c.tracks.length - 1].estado === 'inactivo', 'inactividad: tras 5 min sin actividad publica "inactivo"');
  ahora += 5000;
  await act(() => { window.dispatchEvent(new window.Event('keydown')); });
  await esperar(() => c.tracks[c.tracks.length - 1].estado === 'activo', 'inactividad: al volver a usar la pantalla publica "activo"');
  Date.now = dateNowReal;
  cleanup();
}

// ===================================================== indicador (interfaz)
const U = (id: string, nombre: string, iniciales: string, modulo: string, pagina = '', extra: any = {}) =>
  agruparUsuarios({ [id]: [meta({ usuario_id: id, nombre, iniciales, modulo, pagina, ...extra })] }, 'nadie')[0];
const lista = (...u: any[]) => u;
const maria = U('u1', 'María López', 'ML', 'Cuentas por pagar', 'Cartera');
const carlos = U('u2', 'Carlos Pérez', 'CP', 'Agotados', 'Reporte de agotados');
const ana = U('u3', 'Ana Rodríguez', 'AR', 'Pedidos', 'Historial');

{
  const { container } = render(<PresenciaIndicador usuarios={[]} conexion="conectando" maxAvatares={3} />);
  ok(container.innerHTML === '', 'indicador: conectando -> no muestra nada');
  cleanup();
  const v = render(<PresenciaIndicador usuarios={[]} conexion="conectado" maxAvatares={3} />);
  ok(v.container.innerHTML === '', 'indicador: sin nadie -> no muestra nada');
  cleanup();
}
{
  // pocas personas: avatares con punto de estado; clic -> detalle de cada una
  render(<PresenciaIndicador usuarios={lista(maria, carlos, ana)} conexion="conectado" maxAvatares={3} />);
  const botones = screen.getAllByRole('button');
  ok(botones.length === 3, 'avatares: un botón por persona');
  ok(document.querySelectorAll('.pres-av__dot').length === 3, 'avatares: cada uno con su punto de conexión');
  ok(botones[0].getAttribute('aria-label').includes('María López') && botones[0].getAttribute('aria-label').includes('Cuentas por pagar'), 'avatares: nombre y módulo accesibles');
  ok(screen.queryByRole('dialog') === null, 'avatares: el desplegable empieza cerrado');
  fireEvent.click(botones[1]);
  const dlg = screen.getByRole('dialog');
  ok(!!dlg && botones[1].getAttribute('aria-expanded') === 'true', 'avatares: clic abre el desplegable');
  ok(dlg.parentElement === document.body, 'desplegable: se pinta en <body> (portal), por encima de la barra y sin depender de su contenedor');
  ok(within(dlg).getByText('María López') && within(dlg).getByText('Carlos Pérez') && within(dlg).getByText('Ana Rodríguez'), 'desplegable: lista a todos');
  ok(within(dlg).getByText('Cuentas por pagar') && within(dlg).getByText('Cartera'), 'desplegable: módulo y pestaña de María');
  ok(within(dlg).getByText('Agotados') && within(dlg).getByText('Reporte de agotados'), 'desplegable: módulo y pestaña de Carlos');
  ok(within(dlg).getByText('Pedidos') && within(dlg).getByText('Historial'), 'desplegable: módulo y pestaña de Ana');
  ok(within(dlg).getAllByText('Activo ahora').length === 3, 'desplegable: estado de conexión');
  ok(dlg.querySelector('[data-sel="true"]') !== null, 'desplegable: resalta a la persona pulsada');
  fireEvent.keyDown(document, { key: 'Escape' });
  ok(screen.queryByRole('dialog') === null, 'teclado: Escape cierra');
  ok(document.activeElement === botones[0] || document.activeElement?.closest('.pres') !== null, 'teclado: el foco vuelve al indicador');
  fireEvent.click(botones[0]); fireEvent.click(botones[0]);
  ok(screen.queryByRole('dialog') === null, 'avatares: segundo clic sobre la misma persona cierra');
  fireEvent.click(botones[0]);
  fireEvent.pointerDown(document.body);
  ok(screen.queryByRole('dialog') === null, 'desplegable: clic fuera cierra');
  cleanup();
}
{
  // demasiadas personas: un icono con contador; lista; clic en persona despliega dónde está
  const muchos = [maria, carlos, ana, U('u4', 'Luis Gómez', 'LG', 'Ítems', 'Catálogo'), U('u5', 'Paula Ríos', 'PR', 'Proveedores', 'Listado', { estado: 'inactivo' }), U('u6', 'Sara Díaz', 'SD', 'Administración', 'Miembros')];
  render(<PresenciaIndicador usuarios={muchos} conexion="conectado" maxAvatares={3} />);
  const b = screen.getAllByRole('button');
  ok(b.length === 1 && document.querySelectorAll('.pres-av').length === 0, 'resumen: con muchas personas un solo icono y sin avatares');
  ok(screen.getByText('6') && b[0].getAttribute('aria-label') === '6 personas conectadas', 'resumen: contador de personas conectadas');
  fireEvent.click(b[0]);
  const dlg = screen.getByRole('dialog');
  const filas = dlg.querySelectorAll('[data-fila]');
  ok(filas.length === 6, 'resumen: lista a las 6 personas');
  ok(within(dlg).getByText('Cuentas por pagar › Cartera'), 'resumen: cada fila resume su ubicación');
  ok(dlg.querySelectorAll('.pres-det').length === 0, 'resumen: el detalle no aparece hasta elegir a alguien');
  fireEvent.click(filas[1]);
  ok(filas[1].getAttribute('aria-expanded') === 'true' && dlg.querySelectorAll('.pres-det').length === 1, 'resumen: clic en una persona despliega su detalle');
  ok(within(dlg).getByText('Trabajando en') && within(dlg).getByText('Pestaña') && within(dlg).getByText('Reporte de agotados'), 'resumen: muestra módulo y pestaña exactos');
  fireEvent.click(filas[1]);
  ok(dlg.querySelectorAll('.pres-det').length === 0, 'resumen: segundo clic la pliega');
  filas[0].focus();
  fireEvent.keyDown(filas[0].closest('ul'), { key: 'ArrowDown' });
  ok(document.activeElement === filas[1], 'teclado: flecha abajo pasa a la siguiente persona');
  fireEvent.keyDown(filas[1].closest('ul'), { key: 'End' });
  ok(document.activeElement === filas[5], 'teclado: End va a la última');
  fireEvent.click(filas[4]);
  ok(within(dlg).getByText('Inactivo'), 'resumen: muestra a quien está inactivo');
  ok(document.querySelector('.pres-resumen__punto').getAttribute('data-estado') === 'activo', 'resumen: punto verde si hay alguien activo');
  cleanup();
}
{
  // una persona con varias pestañas
  const dos = agruparUsuarios({ u1: [meta({ pestana_id: 'a', modulo: 'Pedidos', pagina: 'Compras' }), meta({ pestana_id: 'b', modulo: 'Agotados', pagina: 'Reporte de agotados', visible: false })] }, 'x');
  render(<PresenciaIndicador usuarios={dos} conexion="conectado" maxAvatares={3} />);
  ok(screen.getAllByRole('button').length === 1, 'varias pestañas: un solo avatar para la persona');
  fireEvent.click(screen.getByRole('button'));
  const dlg = screen.getByRole('dialog');
  ok(within(dlg).getByText('×2') && within(dlg).getByText('Otra pestaña'), 'varias pestañas: indica que tiene otra abierta');
  ok(within(dlg).getByText('Agotados › Reporte de agotados'), 'varias pestañas: muestra dónde está la otra');
  cleanup();
}
{
  // sin conexión
  render(<PresenciaIndicador usuarios={[]} conexion="sin-conexion" maxAvatares={3} />);
  const b = screen.getByRole('button');
  ok(b.getAttribute('aria-label').includes('sin conexión'), 'sin conexión: el icono lo indica');
  fireEvent.click(b);
  ok(screen.getByRole('dialog').textContent.includes('Reintentando'), 'sin conexión: el desplegable explica que reintenta');
  cleanup();
}
{
  // "tú" aparece marcado
  const yo = agruparUsuarios({ yo: [meta({ usuario_id: 'yo', nombre: 'Ana Rodríguez', iniciales: 'AR' })] }, 'yo');
  render(<PresenciaIndicador usuarios={yo} conexion="conectado" maxAvatares={3} />);
  ok(screen.getByRole('button').getAttribute('aria-label').includes('(tú)'), 'indicador: marca cuál eres tú');
  cleanup();
}

// ===================================================== ir a donde está otra persona (según permisos)
{
  const perm = (o: any = {}) => ({ agotados: false, pedidos: false, items: false, proveedores: false, mensajes: false, cxp: false, cxpPagos: false, cxpReglas: false, cxpImportar: false, cxpMensajes: false, ...o });
  const ctx = (o: any = {}, esAdmin = false) => ({ permisos: perm(o), esAdmin });
  ok(segmentosNavegables(ctx()).join() === 'configuracion', 'permisos: sin ningún módulo solo queda Configuración');
  const todo = segmentosNavegables(ctx({ agotados: true, pedidos: true, items: true, proveedores: true, mensajes: true, cxp: true, cxpPagos: true, cxpReglas: true, cxpImportar: true, cxpMensajes: true }, true));
  ok(['agotados', 'pedidos', 'items', 'proveedores', 'mensajes', 'cxp', 'cxp-pagados', 'cxp-reglas', 'cxp-cargar', 'cxp-mensajes', 'admin', 'configuracion'].every((x) => todo.includes(x)), 'permisos: admin con todo puede ir a cualquier pantalla');
  ok(segmentosNavegables(ctx({ cxpMensajes: true })).includes('mensajes'), 'permisos: Mensajes también se abre con el permiso de mensajes de CXP');
  ok(!segmentosNavegables(ctx({ agotados: true })).includes('admin'), 'permisos: sin ser admin no hay Administración');

  const a = segmentosNavegables(ctx({ agotados: true, cxp: true }));
  ok(destinoPermitido('/app/mi-org/agotados', 'mi-org', a) === '/app/mi-org/agotados', 'destino: módulo con permiso -> ruta');
  ok(destinoPermitido('/app/mi-org/pedidos', 'mi-org', a) === false, 'destino: módulo sin permiso -> false (sin acceso)');
  ok(destinoPermitido('/app/mi-org/admin', 'mi-org', a) === false, 'destino: Administración sin ser admin -> false');
  ok(destinoPermitido('/app/mi-org/cxp/excluidas', 'mi-org', a) === '/app/mi-org/cxp/excluidas', 'destino: cxp/excluidas con permiso de cxp');
  ok(destinoPermitido('/app/mi-org/cxp-pagados', 'mi-org', a) === false, 'destino: Pagados exige su propio permiso');
  ok(destinoPermitido('/app/otra-org/agotados', 'mi-org', a) === null, 'destino: ruta de otra organización -> nunca');
  ok(destinoPermitido('/app/mi-org', 'mi-org', a) === null && destinoPermitido('', 'mi-org', a) === null, 'destino: inicio o vacío -> sin destino');
  ok(destinoPermitido('/app/mi-org/agotados/algo', 'mi-org', a) === null && destinoPermitido('/app/mi-org/cxp/raro', 'mi-org', a) === null, 'destino: subrutas desconocidas -> sin destino');

  // la ruta que llega de otro navegador se valida
  const malas = ['javascript:alert(1)', '//evil.com/app/x', 'https://evil.com', '/app/x/../y', '/app/x/a b', '/otra/cosa', '/app/mi-org/<script>', 5, null];
  ok(malas.every((r) => agruparUsuarios({ u: [meta({ ruta: r })] }, 'x')[0].principal.ruta === ''), 'saneo: rutas con forma peligrosa o ajena se descartan');
  ok(agruparUsuarios({ u: [meta({ ruta: '/app/mi-org/cxp/excluidas' })] }, 'x')[0].principal.ruta === '/app/mi-org/cxp/excluidas', 'saneo: una ruta válida se conserva');
  ok(agruparUsuarios({ u: [{ ...meta(), ruta: undefined }] }, 'x')[0].principal.ruta === '', 'saneo: sin ruta (versión anterior) sigue funcionando');

  // interfaz: enlace "Ir a …" solo cuando el rol lo permite
  const sesionesAgot = agruparUsuarios({ u2: [meta({ usuario_id: 'u2', nombre: 'Carlos Pérez', iniciales: 'CP', modulo: 'Agotados', pagina: 'Reporte de agotados', ruta: '/app/mi-org/agotados' })] }, 'yo');
  const destinoDe = (s: any) => destinoPermitido(s.ruta, 'mi-org', a);
  const visitas: string[] = [];
  render(<PresenciaIndicador usuarios={sesionesAgot} conexion="conectado" maxAvatares={3} destinoDe={destinoDe} irA={(h) => visitas.push(h)} />);
  fireEvent.click(screen.getByRole('button'));
  let enlace = screen.getByRole('link');
  ok(enlace.getAttribute('href') === '/app/mi-org/agotados' && enlace.textContent.includes('Ir a Agotados'), 'ir: enlace real hacia el módulo donde está');
  const ev = new window.MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });
  enlace.dispatchEvent(ev);
  ok(visitas.length === 0 && ev.defaultPrevented === false, 'ir: Ctrl+clic deja que el navegador lo abra en otra pestaña');
  fireEvent.click(enlace);
  ok(visitas.length === 1 && visitas[0] === '/app/mi-org/agotados', 'ir: clic normal navega dentro de la app');
  ok(screen.queryByRole('dialog') === null, 'ir: el desplegable se cierra al ir');
  cleanup();

  // sin permiso para ese módulo
  const sinPermiso = agruparUsuarios({ u3: [meta({ usuario_id: 'u3', nombre: 'Ana', iniciales: 'AN', modulo: 'Pedidos', pagina: 'Compras', ruta: '/app/mi-org/pedidos' })] }, 'yo');
  render(<PresenciaIndicador usuarios={sinPermiso} conexion="conectado" maxAvatares={3} destinoDe={destinoDe} irA={() => {}} />);
  fireEvent.click(screen.getByRole('button'));
  ok(screen.queryByRole('link') === null, 'ir: sin permiso en ese módulo no hay enlace');
  ok(screen.getByRole('dialog').textContent.includes('Tu rol no tiene acceso a este módulo'), 'ir: explica que el rol no da acceso');
  ok(screen.getByRole('dialog').textContent.includes('Pedidos'), 'ir: aun así se ve en qué módulo está');
  cleanup();

  // yo mismo: nada de "ir"; sin ruta conocida: nada
  const yo2 = agruparUsuarios({ yo: [meta({ usuario_id: 'yo', nombre: 'Yo', iniciales: 'YO', modulo: 'Agotados', ruta: '/app/mi-org/agotados' })] }, 'yo');
  render(<PresenciaIndicador usuarios={yo2} conexion="conectado" maxAvatares={3} destinoDe={destinoDe} irA={() => {}} />);
  fireEvent.click(screen.getByRole('button'));
  ok(screen.queryByRole('link') === null && !screen.getByRole('dialog').textContent.includes('Tu rol'), 'ir: en tu propia fila no aparece');
  cleanup();
  const sinRuta = agruparUsuarios({ u4: [meta({ usuario_id: 'u4', nombre: 'Luis', iniciales: 'LG', ruta: '' })] }, 'yo');
  render(<PresenciaIndicador usuarios={sinRuta} conexion="conectado" maxAvatares={3} destinoDe={destinoDe} irA={() => {}} />);
  fireEvent.click(screen.getByRole('button'));
  ok(screen.queryByRole('link') === null && !screen.getByRole('dialog').textContent.includes('Tu rol'), 'ir: sin ruta conocida no se ofrece nada');
  cleanup();

  // varias pestañas: cada una enlazable si hay permiso; y en modo resumen tras expandir
  const multi = agruparUsuarios({ u5: [meta({ usuario_id: 'u5', nombre: 'Sara', iniciales: 'SD', pestana_id: 'a', modulo: 'Agotados', pagina: 'Reporte de agotados', ruta: '/app/mi-org/agotados' }), meta({ usuario_id: 'u5', nombre: 'Sara', iniciales: 'SD', pestana_id: 'b', modulo: 'Cuentas por pagar', pagina: 'Cartera', ruta: '/app/mi-org/cxp', visible: false })] }, 'yo');
  render(<PresenciaIndicador usuarios={multi} conexion="conectado" maxAvatares={0} destinoDe={destinoDe} irA={() => {}} />);
  fireEvent.click(screen.getByRole('button'));
  fireEvent.click(document.querySelector('[data-fila]'));
  const hrefs = screen.getAllByRole('link').map((l) => l.getAttribute('href'));
  ok(hrefs.includes('/app/mi-org/agotados') && hrefs.includes('/app/mi-org/cxp'), 'ir: en modo resumen también, y la otra pestaña es enlazable');
  cleanup();
}

console.log(fallos === 0 ? `PRESENCIA_OK (${total} comprobaciones)` : `PRESENCIA_FALLOS=${fallos} de ${total}`);
process.exit(fallos === 0 ? 0 : 1);
