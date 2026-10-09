// @ts-nocheck  (las pruebas de interfaz se compilan con esbuild en tests/ui; el build de Next no debe revisarlas)
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { MiembrosPanel } from '@/components/admin/MiembrosPanel';
import { RolEditor } from '@/components/admin/RolEditor';
import { RolesComparacion } from '@/components/admin/RolesComparacion';
import { SedesPanel } from '@/components/admin/SedesPanel';
import { HistorialPanel } from '@/components/admin/HistorialPanel';
import { miembrosSinSede } from '@/components/admin/sinSede';
import { reglasMiembro } from '@/components/admin/reglas';
import { llamadas, respuestas } from './stub';
import type { MiembroOrg, PermisoRol, RolAdmin } from '@/types/auth.types';

let fallos = 0, total = 0;
const ok = (c: boolean, m: string) => { total++; console.log((c ? 'ok   ' : 'FALLA ') + m); if (!c) fallos++; };
(window as any).confirm = () => true;
const esperar = async (cond: () => boolean, m: string) => {
  const t0 = Date.now();
  while (!cond() && Date.now() - t0 < 1500) await new Promise((r) => setTimeout(r, 10));
  ok(cond(), m);
};
const reset = () => { llamadas.length = 0; for (const k of Object.keys(respuestas)) delete respuestas[k]; };

const mk = (id: string, nombre: string, rol_nombre: string, estado: any = 'activa', sede: string | null = 's1'): MiembroOrg => ({
  membresia_id: 'm-' + id, usuario_id: 'u-' + id, nombres: nombre, apellidos: 'X', email: id + '@demo.com',
  tipo_documento: 'CC', numero_documento: '1', rol_id: 'r-' + rol_nombre, rol_nombre, sede_id: sede, sede_nombre: sede ? 'Principal' : null,
  estado, activo: estado === 'activa', fecha_ingreso: '2026-10-01T00:00:00Z',
});
const roles = [{ id: 'r-admin', nombre: 'admin' }, { id: 'r-Comercial', nombre: 'Comercial' }, { id: 'r-viewer', nombre: 'viewer' }];
const sedes = [{ id: 's1', nombre: 'Principal' }];
const fila = (email: string) => screen.getAllByRole('row').find((r) => r.textContent?.includes(email))!;
const tiene = (email: string, texto: string) => !!within(fila(email)).queryByText(texto);
const panel = (miembros: MiembroOrg[], yo: string, prop: string | null, onCambio = () => {}, onError = () => {}) =>
  render(<MiembrosPanel miembros={miembros} roles={roles} sedes={sedes} usuarioActualId={yo} organizacionId="o1" propietarioId={prop} onCambio={onCambio} onError={onError} />);

// ===== reglas puras
{
  const base = { usuario_id: 'u-x', rol_nombre: 'Comercial', estado: 'activa' as const };
  ok(reglasMiembro({ ...base, usuario_id: 'yo' }, 'yo', 'own').puedeGestionarEstado === false, 'reglas: nadie gestiona su propio estado');
  ok(reglasMiembro({ ...base, usuario_id: 'own', rol_nombre: 'admin' }, 'otro', 'own').puedeGestionarEstado === false, 'reglas: el propietario no se gestiona');
  ok(reglasMiembro({ ...base, rol_nombre: 'admin' }, 'adm', 'own').puedeGestionarEstado === false, 'reglas: admin no propietario no gestiona a otro admin');
  ok(reglasMiembro({ ...base, rol_nombre: 'admin' }, 'own', 'own').puedeGestionarEstado === true, 'reglas: el propietario sí gestiona a otro admin');
  ok(reglasMiembro({ ...base, rol_nombre: 'admin' }, 'adm', null).puedeGestionarEstado === true, 'reglas: sin propietario (legado) un admin gestiona a otro');
  ok(reglasMiembro({ ...base, estado: 'pendiente' }, 'own', 'own').puedeGestionarEstado === false, 'reglas: una solicitud pendiente no se suspende');
  ok(reglasMiembro({ ...base, rol_nombre: 'admin', estado: 'suspendida' }, 'own', 'own').puedeTransferir === false, 'reglas: no se transfiere la propiedad a un admin suspendido');
}

// ===== sin sede
{
  const modulos = [{ id: 'mp', nombre: 'pedidos' }, { id: 'mi', nombre: 'Items' }, { id: 'mr', nombre: 'reporte_agotados' }];
  const permisos: PermisoRol[] = [
    { rol_id: 'r-Comercial', modulo_id: 'mr', puede_ver: true, puede_crear: false, puede_editar: false, puede_eliminar: false },
    { rol_id: 'r-Items', modulo_id: 'mi', puede_ver: true, puede_crear: false, puede_editar: false, puede_eliminar: false },
    { rol_id: 'r-Vacio', modulo_id: 'mp', puede_ver: false, puede_crear: false, puede_editar: false, puede_eliminar: false },
  ];
  const lista = [
    mk('a', 'Ana', 'Comercial', 'activa', null),      // rol con módulo que requiere sede, sin sede -> avisa
    mk('b', 'Beto', 'Comercial', 'activa', 's1'),     // tiene sede -> no
    mk('c', 'Cata', 'Items', 'activa', null),         // su rol solo usa Items (no requiere sede) -> no
    mk('d', 'Dani', 'Vacio', 'activa', null),         // permiso con todo false -> no
    mk('e', 'Eli', 'Comercial', 'suspendida', null),  // suspendido -> no
    mk('f', 'Fer', 'viewer', 'activa', null),         // Predeterminado -> no
  ];
  const r = miembrosSinSede(lista, modulos, permisos);
  ok(r.length === 1 && r[0].usuario_id === 'u-a', 'sin sede: solo avisa a quien tiene rol con módulo que requiere sede y no tiene sede');
}

// ===== MiembrosPanel: dueño viendo el panel
cleanup(); reset();
{
  const lista = [mk('own', 'Dueña', 'admin'), mk('adm2', 'Admin2', 'admin'), mk('com', 'Comer', 'Comercial'), mk('sus', 'Susp', 'Comercial', 'suspendida')];
  panel(lista, 'u-own', 'u-own');
  ok(!tiene('own@demo.com', 'Suspender') && !tiene('own@demo.com', 'Retirar'), 'propietario viendo: su propia fila sin Suspender/Retirar');
  ok(tiene('own@demo.com', 'Propietario'), 'se muestra la insignia Propietario');
  ok(tiene('adm2@demo.com', 'Suspender') && tiene('adm2@demo.com', 'Retirar') && tiene('adm2@demo.com', 'Hacer propietario'), 'propietario viendo: sobre otro admin ve Suspender, Retirar y Hacer propietario');
  ok(tiene('com@demo.com', 'Suspender') && tiene('com@demo.com', 'Retirar') && !tiene('com@demo.com', 'Reactivar'), 'activo: Suspender y Retirar, sin Reactivar');
  ok(tiene('sus@demo.com', 'Reactivar') && tiene('sus@demo.com', 'Retirar') && !tiene('sus@demo.com', 'Suspender'), 'suspendido: Reactivar y Retirar, sin Suspender');
  ok(tiene('sus@demo.com', 'Suspendido'), 'suspendido: muestra la insignia');
  const sel = within(fila('sus@demo.com')).getAllByRole('combobox') as HTMLSelectElement[];
  ok(sel.every((s) => s.disabled), 'suspendido: rol y sede no se pueden editar');
  ok((within(fila('sus@demo.com')).getByText('Guardar') as HTMLButtonElement).disabled, 'suspendido: Guardar deshabilitado');
}
// ===== MiembrosPanel: admin que NO es propietario
cleanup(); reset();
{
  const lista = [mk('own', 'Dueña', 'admin'), mk('yo', 'Yo', 'admin'), mk('adm3', 'Admin3', 'admin'), mk('com', 'Comer', 'Comercial')];
  panel(lista, 'u-yo', 'u-own');
  ok(!tiene('own@demo.com', 'Suspender') && !tiene('own@demo.com', 'Retirar'), 'admin no propietario: no puede gestionar al propietario');
  ok(!tiene('adm3@demo.com', 'Suspender') && !tiene('adm3@demo.com', 'Retirar') && !tiene('adm3@demo.com', 'Hacer propietario'), 'admin no propietario: no puede gestionar a otro admin ni transferir');
  ok((within(fila('adm3@demo.com')).getAllByRole('combobox')[0] as HTMLSelectElement).disabled, 'admin no propietario: no puede cambiar el rol de otro admin');
  ok(tiene('com@demo.com', 'Suspender') && tiene('com@demo.com', 'Retirar'), 'admin no propietario: sí gestiona a un miembro común');
  ok(!tiene('yo@demo.com', 'Suspender') && !tiene('yo@demo.com', 'Retirar'), 'nadie se gestiona a sí mismo');
}
// ===== acciones llaman a la función correcta
cleanup(); reset();
{
  const mensajes: string[] = [], errores: string[] = [];
  respuestas['cambiar_estado_miembro'] = { data: null, error: null };
  panel([mk('own', 'Dueña', 'admin'), mk('com', 'Comer', 'Comercial')], 'u-own', 'u-own', (m) => mensajes.push(m), (m) => errores.push(m));
  fireEvent.click(within(fila('com@demo.com')).getByText('Suspender'));
  await esperar(() => (mensajes.length === 1), 'Suspender: avisa del éxito');
  ok(llamadas[0]?.fn === 'cambiar_estado_miembro' && llamadas[0].args.p_membresia === 'm-com' && llamadas[0].args.p_accion === 'suspender', 'Suspender llama a cambiar_estado_miembro con la acción y la membresía correctas');
  fireEvent.click(within(fila('com@demo.com')).getByText('Retirar'));
  await esperar(() => (llamadas.length === 2 && llamadas[1].args.p_accion === 'retirar'), 'Retirar llama con la acción retirar');
  await new Promise((r) => setTimeout(r, 40)); // deja terminar la operación anterior (el botón queda deshabilitado mientras trabaja)
  respuestas['cambiar_estado_miembro'] = { data: null, error: { message: 'Solo el propietario puede suspender o retirar a otro administrador' } };
  fireEvent.click(within(fila('com@demo.com')).getByText('Suspender'));
  await esperar(() => (errores[0]?.includes('Solo el propietario')), 'si la base rechaza, se muestra su mensaje');
}
// confirmar = cancelar no llama a la base
cleanup(); reset();
{
  (window as any).confirm = () => false;
  panel([mk('own', 'Dueña', 'admin'), mk('com', 'Comer', 'Comercial')], 'u-own', 'u-own');
  fireEvent.click(within(fila('com@demo.com')).getByText('Retirar'));
  await new Promise((r) => setTimeout(r, 30));
  ok(llamadas.length === 0, 'cancelar el diálogo de confirmación no llama a la base de datos');
  (window as any).confirm = () => true;
}

// ===== RolEditor: restablecer y miembros
cleanup(); reset();
{
  const mod = [{ id: 'm1', nombre: 'pedidos', descripcion: null }];
  const props = { modulos: mod, permisos: [] as PermisoRol[], ocupado: false, onGuardarDatos: () => {}, onGuardarPermisos: () => {}, onEliminar: () => {} };
  const rolBase: RolAdmin = { rol_id: 'r1', nombre: 'Comercial', descripcion: null, protegido: false, miembros: 2, invitaciones_pendientes: 0 };
  let restab = 0, irA = 0;
  render(<RolEditor rol={rolBase} {...props} miembrosDelRol={[mk('a', 'Ana', 'Comercial'), mk('b', 'Beto', 'Comercial', 'suspendida')]} onRestablecer={() => restab++} onIrAMiembros={() => irA++} />);
  ok(!!screen.getByText('Restablecer originales'), 'rol base: ofrece Restablecer originales');
  fireEvent.click(screen.getByText('Restablecer originales'));
  ok(restab === 1, 'Restablecer llama al manejador tras confirmar');
  ok(!!screen.getByText('Miembros con este rol') && !!screen.getByText('a@demo.com') && !!screen.getByText('b@demo.com'), 'lista los miembros del rol');
  ok(!!screen.getByText('Suspendido'), 'marca al miembro suspendido');
  fireEvent.click(screen.getByText('Cambiar el rol de alguien en Miembros'));
  ok(irA === 1, 'el atajo lleva a la pestaña Miembros');
  cleanup();
  render(<RolEditor rol={{ ...rolBase, nombre: 'Supervisor' }} {...props} miembrosDelRol={[]} onRestablecer={() => {}} onIrAMiembros={() => {}} />);
  ok(screen.queryByText('Restablecer originales') === null, 'rol personalizado: sin Restablecer');
  ok(screen.queryByText('Miembros con este rol') === null, 'sin miembros: no muestra la sección');
  cleanup();
  render(<RolEditor rol={{ ...rolBase, nombre: 'admin', protegido: true }} {...props} miembrosDelRol={[mk('a', 'Ana', 'admin')]} onRestablecer={() => {}} onIrAMiembros={() => {}} />);
  ok(screen.queryByText('Restablecer originales') === null, 'admin: sin Restablecer');
  ok(!!screen.getByText('Miembros con este rol'), 'admin: sí muestra quién lo tiene');
}

// ===== Comparación
cleanup();
{
  const rs: RolAdmin[] = [
    { rol_id: 'a', nombre: 'admin', descripcion: null, protegido: true, miembros: 1, invitaciones_pendientes: 0 },
    { rol_id: 'v', nombre: 'viewer', descripcion: null, protegido: true, miembros: 0, invitaciones_pendientes: 0 },
    { rol_id: 'c', nombre: 'Comercial', descripcion: null, protegido: false, miembros: 1, invitaciones_pendientes: 0 },
  ];
  const ms = [{ id: 'mp', nombre: 'pedidos', descripcion: null }, { id: 'mr', nombre: 'Roles', descripcion: null }];
  const ps: PermisoRol[] = [
    { rol_id: 'a', modulo_id: 'mp', puede_ver: true, puede_crear: true, puede_editar: true, puede_eliminar: true },
    { rol_id: 'a', modulo_id: 'mr', puede_ver: true, puede_crear: true, puede_editar: true, puede_eliminar: true },
    { rol_id: 'c', modulo_id: 'mp', puede_ver: true, puede_crear: true, puede_editar: false, puede_eliminar: false },
  ];
  render(<RolesComparacion roles={rs} modulos={ms} permisos={ps} />);
  const f = (mod: string) => screen.getAllByRole('row').find((r) => r.textContent?.startsWith(mod))!;
  const celdas = (mod: string) => Array.from(f(mod).querySelectorAll('td')).map((t) => t.textContent);
  ok(JSON.stringify(celdas('pedidos')) === JSON.stringify(['pedidos', 'V C E X', '—', 'V C']), 'comparación: pedidos admin=V C E X, Predeterminado=—, Comercial=V C');
  ok(f('Roles') === screen.getAllByRole('row').slice(-1)[0], 'comparación: el módulo Roles va al final');
  ok(screen.getAllByRole('columnheader').map((h) => h.textContent).includes('Predeterminado'), 'comparación: viewer se rotula Predeterminado');
}

// ===== Sedes
cleanup(); reset();
{
  const mensajes: string[] = [], errores: string[] = [];
  const lista = (extra: any[] = []) => ({ data: [
    { sede_id: 's1', nombre: 'Principal', ciudad: 'Cali', miembros: 3, creada_en: '2026-10-01T00:00:00Z' },
    { sede_id: 's2', nombre: 'Norte', ciudad: null, miembros: 0, creada_en: '2026-10-02T00:00:00Z' }, ...extra], error: null });
  respuestas['listar_sedes_org'] = lista();
  render(<SedesPanel organizacionId="o1" onCambio={(m) => mensajes.push(m)} onError={(m) => errores.push(m)} />);
  await waitFor(() => screen.getByText('Principal'));
  const rowOf = (n: string) => screen.getAllByRole('row').find((r) => r.textContent?.includes(n))!;
  ok((within(rowOf('Principal')).getByText('Eliminar') as HTMLButtonElement).disabled, 'sede con miembros: Eliminar deshabilitado');
  ok(!(within(rowOf('Norte')).getByText('Eliminar') as HTMLButtonElement).disabled, 'sede sin miembros: se puede eliminar');
  // crear
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Sur' } });
  fireEvent.change(screen.getByLabelText('Ciudad (opcional)'), { target: { value: 'Bogotá' } });
  fireEvent.click(screen.getByText('Crear sede'));
  await esperar(() => (llamadas.some((l) => l.fn === 'crear_sede' && l.args.p_org === 'o1' && l.args.p_nombre === 'Sur' && l.args.p_ciudad === 'Bogotá')), 'crear sede llama con organización, nombre y ciudad');
  await esperar(() => (mensajes.includes('Sede "Sur" creada.')), 'crear sede avisa del éxito');
  // editar
  fireEvent.click(within(rowOf('Norte')).getByText('Editar'));
  fireEvent.change(screen.getByLabelText('Nombre de la sede Norte'), { target: { value: 'Norte 2' } });
  fireEvent.click(screen.getByText('Guardar'));
  await esperar(() => (llamadas.some((l) => l.fn === 'editar_sede' && l.args.p_sede === 's2' && l.args.p_nombre === 'Norte 2' && l.args.p_ciudad === null)), 'editar sede envía id, nombre y ciudad vacía como null');
  await esperar(() => screen.queryAllByText('Guardar').length === 0, 'editar sede: sale del modo edición al guardar');
  // eliminar
  fireEvent.click(within(rowOf('Norte')).getByText('Eliminar'));
  await esperar(() => (llamadas.some((l) => l.fn === 'eliminar_sede' && l.args.p_sede === 's2')), 'eliminar sede llama con el id');
  // error de la base
  respuestas['crear_sede'] = { data: null, error: { message: 'Ya existe una sede con ese nombre en la organización' } };
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Principal' } });
  await esperar(() => !(screen.getByText('Crear sede') as HTMLButtonElement).disabled, 'crear sede: botón disponible cuando termina la operación anterior');
  fireEvent.click(screen.getByText('Crear sede'));
  await esperar(() => (errores.some((e) => e.includes('Ya existe una sede'))), 'error de la base se muestra');
  // única sede: no se puede eliminar
  cleanup(); reset();
  respuestas['listar_sedes_org'] = { data: [{ sede_id: 's1', nombre: 'Unica', ciudad: null, miembros: 0, creada_en: '2026-10-01T00:00:00Z' }], error: null };
  render(<SedesPanel organizacionId="o1" onCambio={() => {}} onError={() => {}} />);
  await waitFor(() => screen.getByText('Unica'));
  ok((screen.getByText('Eliminar') as HTMLButtonElement).disabled, 'única sede: Eliminar deshabilitado');
}

// ===== Historial
cleanup(); reset();
{
  respuestas['listar_auditoria'] = { data: [
    { id: 2, fecha: '2026-10-04T15:30:00Z', usuario: 'Ana Admin', accion: 'rol_creado', descripcion: 'creó el rol "Supervisor"' },
    { id: 1, fecha: '2026-10-04T15:00:00Z', usuario: 'Sistema', accion: 'sede_editada', descripcion: 'cambió la ciudad de la sede "Principal"' }], error: null };
  render(<HistorialPanel organizacionId="o1" onError={() => {}} />);
  await waitFor(() => screen.getByText('creó el rol "Supervisor"', { exact: false }));
  ok(llamadas[0].fn === 'listar_auditoria' && llamadas[0].args.p_org === 'o1' && llamadas[0].args.p_limite === 100, 'historial pide los últimos 100 de su organización');
  const filas = screen.getAllByRole('row').slice(1);
  ok(filas[0].textContent?.includes('Ana Admin creó el rol "Supervisor"') === true, 'historial: autor + descripción en una frase');
  ok(filas[1].textContent?.includes('Sistema cambió la ciudad') === true, 'historial: más reciente primero y Sistema como autor');
  cleanup(); reset();
  respuestas['listar_auditoria'] = { data: [], error: null };
  render(<HistorialPanel organizacionId="o1" onError={() => {}} />);
  await waitFor(() => screen.getByText('Todavía no hay cambios registrados.'));
  ok(true, 'historial vacío: muestra el mensaje');
}

console.log(fallos === 0 ? `UI2_OK (${total} comprobaciones)` : `UI2_FALLOS=${fallos} de ${total}`);
process.exit(fallos === 0 ? 0 : 1);
