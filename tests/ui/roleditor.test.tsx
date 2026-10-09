// @ts-nocheck  (las pruebas de interfaz se compilan con esbuild en tests/ui; el build de Next no debe revisarlas)
import React, { useState } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { RolEditor } from '@/components/admin/RolEditor';
import type { ModuloOpt, PermisoRol, RolAdmin } from '@/types/auth.types';

const modulos: ModuloOpt[] = [
  { id: 'm-ped', nombre: 'pedidos', descripcion: 'Pedidos a proveedor' },
  { id: 'm-roles', nombre: 'Roles', descripcion: 'Administración de roles' },
  { id: 'm-rep', nombre: 'Reportes', descripcion: 'Consolidados' },
  { id: 'm-item', nombre: 'Items', descripcion: 'Catálogo' },
];
const rolCom: RolAdmin = { rol_id: 'r1', nombre: 'Comercial', descripcion: null, protegido: false, miembros: 2, invitaciones_pendientes: 0 };
const permisos: PermisoRol[] = [{ rol_id: 'r1', modulo_id: 'm-item', puede_ver: true, puede_crear: false, puede_editar: false, puede_eliminar: false }];

let fallos = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'ok   ' : 'FALLA ') + m); if (!c) fallos++; };
const box = (m: string, a: string) => screen.getByLabelText(`${m}: ${a}`) as HTMLInputElement;

// Contenedor que imita a RolesPanel: re-renderiza con otro estado (como al escribir en "Nuevo rol")
function Padre({ rol, permisos, onGuardar }: { rol: RolAdmin; permisos: PermisoRol[]; onGuardar: (m: any) => void }) {
  const [, setTick] = useState(0);
  const estables = React.useMemo(() => permisos, [permisos]);
  return (<>
    <button onClick={() => setTick((t) => t + 1)}>rerender</button>
    <RolEditor rol={rol} modulos={modulos} permisos={estables} ocupado={false} miembrosDelRol={[]} onRestablecer={() => {}} onIrAMiembros={() => {}}
      onGuardarDatos={() => {}} onGuardarPermisos={onGuardar} onEliminar={() => {}} />
  </>);
}

// 1) crear/editar/eliminar implican ver; quitar ver apaga todo
let enviado: any = null;
render(<Padre rol={rolCom} permisos={permisos} onGuardar={(m) => (enviado = m)} />);
ok(!box('pedidos', 'ver').checked, 'pedidos parte sin permisos');
ok(box('Items', 'ver').checked, 'Items refleja lo guardado (ver)');
const guardar = () => screen.getByText('Guardar permisos') as HTMLButtonElement;
ok(guardar().disabled, 'Guardar permisos deshabilitado sin cambios');
fireEvent.click(box('pedidos', 'crear'));
ok(box('pedidos', 'ver').checked && box('pedidos', 'crear').checked, 'marcar Crear marca también Ver');
ok(!guardar().disabled, 'Guardar permisos se habilita con cambios');
// 2) un re-render del padre NO debe borrar casillas sin guardar (el bug que corregí)
fireEvent.click(screen.getByText('rerender'));
ok(box('pedidos', 'crear').checked, 'las casillas sin guardar sobreviven a un re-render del padre');
fireEvent.click(box('pedidos', 'ver'));
ok(!box('pedidos', 'crear').checked && !box('pedidos', 'ver').checked, 'quitar Ver apaga Crear');
// 3) módulo Roles reservado
ok(box('Roles', 'ver').disabled && box('Roles', 'eliminar').disabled, 'módulo Roles bloqueado para roles no admin');
ok(!!screen.getByText('Reservado al administrador.'), 'se explica por qué está bloqueado');
ok(!!screen.getByText(/Sin efecto por ahora/), 'Reportes avisa que no tiene efecto');
// 4) envío completo de la matriz con todos los módulos
fireEvent.click(box('Items', 'editar'));
fireEvent.click(guardar());
ok(enviado?.length === 4, 'se envían los 4 módulos');
const items = enviado?.find((x: any) => x.modulo_id === 'm-item');
ok(items?.ver === true && items?.editar === true && items?.crear === false, 'payload de Items correcto');
ok(enviado?.find((x: any) => x.modulo_id === 'm-roles')?.ver === false, 'Roles viaja sin permisos');
ok(!!screen.getByText(/afectan de inmediato a 2 miembros/), 'avisa que afecta a 2 miembros');
cleanup();

// 5) rol del sistema: todo de solo lectura, sin botones
const rolAdmin: RolAdmin = { rol_id: 'ra', nombre: 'admin', descripcion: null, protegido: true, miembros: 1, invitaciones_pendientes: 0 };
const permAdmin: PermisoRol[] = modulos.map((m) => ({ rol_id: 'ra', modulo_id: m.id, puede_ver: true, puede_crear: true, puede_editar: true, puede_eliminar: true }));
render(<RolEditor rol={rolAdmin} modulos={modulos} permisos={permAdmin} ocupado={false} miembrosDelRol={[]} onRestablecer={() => {}} onIrAMiembros={() => {}} onGuardarDatos={() => {}} onGuardarPermisos={() => {}} onEliminar={() => {}} />);
ok(box('Roles', 'ver').checked && box('Roles', 'ver').disabled, 'admin: ve Roles marcado y no editable');
ok(screen.queryByText('Guardar permisos') === null && screen.queryByText('Eliminar rol') === null, 'admin: sin botones de guardar/eliminar');
ok(!!screen.getByText('Rol del sistema'), 'admin: etiquetado como rol del sistema');
cleanup();

// 6) Predeterminado
const rolView: RolAdmin = { rol_id: 'rv', nombre: 'viewer', descripcion: null, protegido: true, miembros: 0, invitaciones_pendientes: 0 };
render(<RolEditor rol={rolView} modulos={modulos} permisos={[]} ocupado={false} miembrosDelRol={[]} onRestablecer={() => {}} onIrAMiembros={() => {}} onGuardarDatos={() => {}} onGuardarPermisos={() => {}} onEliminar={() => {}} />);
ok(!!screen.getByRole('heading', { name: 'Predeterminado' }), 'viewer se muestra como "Predeterminado"');
ok(box('pedidos', 'ver').disabled && !box('pedidos', 'ver').checked, 'Predeterminado: nada marcado y bloqueado');
cleanup();

// 7) eliminar deshabilitado con miembros / con invitaciones; habilitado si está libre
const libre: RolAdmin = { ...rolCom, miembros: 0 };
render(<RolEditor rol={libre} modulos={modulos} permisos={[]} ocupado={false} miembrosDelRol={[]} onRestablecer={() => {}} onIrAMiembros={() => {}} onGuardarDatos={() => {}} onGuardarPermisos={() => {}} onEliminar={() => {}} />);
ok(!(screen.getByText('Eliminar rol') as HTMLButtonElement).disabled, 'rol sin miembros ni invitaciones: se puede eliminar');
cleanup();
render(<RolEditor rol={rolCom} modulos={modulos} permisos={[]} ocupado={false} miembrosDelRol={[]} onRestablecer={() => {}} onIrAMiembros={() => {}} onGuardarDatos={() => {}} onGuardarPermisos={() => {}} onEliminar={() => {}} />);
ok((screen.getByText('Eliminar rol') as HTMLButtonElement).disabled, 'rol con miembros: Eliminar deshabilitado');
cleanup();
const conInv: RolAdmin = { ...rolCom, miembros: 0, invitaciones_pendientes: 1 };
render(<RolEditor rol={conInv} modulos={modulos} permisos={[]} ocupado={false} miembrosDelRol={[]} onRestablecer={() => {}} onIrAMiembros={() => {}} onGuardarDatos={() => {}} onGuardarPermisos={() => {}} onEliminar={() => {}} />);
ok((screen.getByText('Eliminar rol') as HTMLButtonElement).disabled, 'rol con invitaciones pendientes: Eliminar deshabilitado');
cleanup();

// 8) guardar nombre: solo se habilita con cambio válido
let datos: any = null;
render(<RolEditor rol={libre} modulos={modulos} permisos={[]} ocupado={false} miembrosDelRol={[]} onRestablecer={() => {}} onIrAMiembros={() => {}} onGuardarDatos={(n, d) => (datos = [n, d])} onGuardarPermisos={() => {}} onEliminar={() => {}} />);
const gn = screen.getByText('Guardar nombre') as HTMLButtonElement;
ok(gn.disabled, 'Guardar nombre deshabilitado sin cambios');
fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: '  Ventas ' } });
ok(!gn.disabled, 'Guardar nombre se habilita al editar');
fireEvent.click(gn);
ok(datos?.[0] === '  Ventas ', 'se envía el nombre (la base lo recorta y valida)');
cleanup();

console.log(fallos === 0 ? 'UI_OK' : `UI_FALLOS=${fallos}`);
process.exit(fallos === 0 ? 0 : 1);
