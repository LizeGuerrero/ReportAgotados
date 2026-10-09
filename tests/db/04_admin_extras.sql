\set ON_ERROR_STOP 1
create or replace function public.t_err(p_sql text, p_like text) returns void language plpgsql as $$
begin begin execute p_sql; exception when others then
  if sqlerrm ilike '%'||p_like||'%' then raise notice 'ok  bloqueado [%]', p_like; return; end if;
  raise exception 'ERROR DISTINTO [%]: %', p_like, sqlerrm; end;
  raise exception 'DEBIO FALLAR [%]: %', p_like, p_sql; end $$;
create or replace function public.t_eq(p_label text, p_got text, p_exp text) returns void language plpgsql as $$
begin if p_got is distinct from p_exp then raise exception 'FALLO % -> obtenido=% esperado=%', p_label, p_got, p_exp; end if; raise notice 'ok  %', p_label; end $$;

-- A (propietaria) crea org1; C crea org2 (referencia de la siembra y "otra organización")
select set_config('app.role','authenticated',false);
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.crear_organizacion('Extras Org','EXTR-1111') as slug \gset
select set_config('app.uid','00000000-0000-0000-0000-0000000000c3',false);
select public.crear_organizacion('Referencia','EXTR-2222') as slug2 \gset
reset role;
select id as org from public.organizaciones where slug=:'slug' \gset
select id as org2 from public.organizaciones where slug=:'slug2' \gset
select id as r_admin from public.roles where organizacion_id=:'org'::uuid and nombre='admin' \gset
select id as r_com from public.roles where organizacion_id=:'org'::uuid and nombre='Comercial' \gset
select id as sede1 from public.sedes where organizacion_id=:'org'::uuid \gset

-- ===== Historial: crear una organización NO genera ruido (roles, sedes, permisos, membresía)
select public.t_eq('crear org registra 1 sola entrada', (select count(*)::text from public.auditoria_org where organizacion_id=:'org'::uuid), '1');
select public.t_eq('esa entrada es org_creada', (select accion from public.auditoria_org where organizacion_id=:'org'::uuid), 'org_creada');

-- B (Comercial con sede), C (admin) y D (admin) entran por solicitud aceptada por A
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false); select public.solicitar_union('EXTR-1111');
select set_config('app.uid','00000000-0000-0000-0000-0000000000c3',false); select public.solicitar_union('EXTR-1111');
select set_config('app.uid','00000000-0000-0000-0000-0000000000d4',false); select public.solicitar_union('EXTR-1111');
reset role;
select id as mid_b from public.membresias where usuario_id='00000000-0000-0000-0000-0000000000b2' and organizacion_id=:'org'::uuid \gset
select id as mid_c from public.membresias where usuario_id='00000000-0000-0000-0000-0000000000c3' and organizacion_id=:'org'::uuid \gset
select id as mid_d from public.membresias where usuario_id='00000000-0000-0000-0000-0000000000d4' and organizacion_id=:'org'::uuid \gset
select id as mid_a from public.membresias where usuario_id='00000000-0000-0000-0000-0000000000a1' and organizacion_id=:'org'::uuid \gset
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.resolver_solicitud(:'mid_b'::uuid,true,:'r_com'::uuid,:'sede1'::uuid);
select public.resolver_solicitud(:'mid_c'::uuid,true,:'r_admin'::uuid,null);
select public.resolver_solicitud(:'mid_d'::uuid,true,:'r_admin'::uuid,null);
select public.t_eq('historial: 3 solicitudes recibidas', (select count(*)::text from public.listar_auditoria(:'org'::uuid) where accion='solicitud_recibida'), '3');
select public.t_eq('historial: aceptación con rol y sede, autor correcto',
  (select usuario||'|'||descripcion from public.listar_auditoria(:'org'::uuid) where accion='solicitud_aceptada' and descripcion ilike '%Beto%'),
  'Ana Admin|aceptó a Beto Nuevo con el rol "Comercial" en la sede "Principal"');

-- ===== Estado de miembros
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false);
select public.t_eq('B (Comercial) tiene acceso', public.tiene_permiso(:'org'::uuid,'reporte_agotados','ver')::text, 'true');
select public.t_err(format($$select public.cambiar_estado_miembro(%L,'suspender')$$,:'mid_c'),'Solo un administrador');
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.t_err(format($$select public.cambiar_estado_miembro(%L,'borrar')$$,:'mid_b'),'Acción no válida');
select public.t_err(format($$select public.cambiar_estado_miembro(%L,'suspender')$$,:'mid_a'),'propio estado');
select public.cambiar_estado_miembro(:'mid_b'::uuid,'suspender');
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false);
select public.t_eq('B suspendido: SIN acceso en la base', public.tiene_permiso(:'org'::uuid,'reporte_agotados','ver')::text, 'false');
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.t_eq('listar muestra suspendida', (select estado from public.listar_miembros(:'org'::uuid) where membresia_id=:'mid_b'::uuid), 'suspendida');
select public.t_err(format($$select public.cambiar_estado_miembro(%L,'suspender')$$,:'mid_b'),'Solo se puede suspender a un miembro activo');
select public.t_err(format($$select public.cambiar_rol_miembro(%L,%L,null)$$,:'mid_b',:'r_admin'),'miembros activos');
select public.cambiar_estado_miembro(:'mid_b'::uuid,'reactivar');
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false);
select public.t_eq('B reactivado: recupera el acceso', public.tiene_permiso(:'org'::uuid,'reporte_agotados','ver')::text, 'true');
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.t_err(format($$select public.cambiar_estado_miembro(%L,'reactivar')$$,:'mid_b'),'miembro suspendido');
-- reglas de jerarquía (igual que degradar): C (admin no propietario) no toca al propietario ni a otro admin
select set_config('app.uid','00000000-0000-0000-0000-0000000000c3',false);
select public.t_err(format($$select public.cambiar_estado_miembro(%L,'suspender')$$,:'mid_a'),'propietario de la organización');
select public.t_err(format($$select public.cambiar_estado_miembro(%L,'retirar')$$,:'mid_d'),'Solo el propietario puede suspender o retirar a otro administrador');
select public.cambiar_estado_miembro(:'mid_b'::uuid,'suspender');   -- sí puede con un no-admin
select public.cambiar_estado_miembro(:'mid_b'::uuid,'reactivar');
-- el propietario sí puede con otro admin
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.cambiar_estado_miembro(:'mid_d'::uuid,'suspender');
select set_config('app.uid','00000000-0000-0000-0000-0000000000d4',false);
select public.t_eq('admin suspendido deja de ser admin', public.es_admin_org(:'org'::uuid)::text, 'false');
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.cambiar_estado_miembro(:'mid_d'::uuid,'retirar');   -- se puede retirar a un suspendido
select public.t_eq('retirado no aparece en el listado', (select count(*)::text from public.listar_miembros(:'org'::uuid) where membresia_id=:'mid_d'::uuid), '0');
select public.t_err(format($$select public.cambiar_estado_miembro(%L,'retirar')$$,:'mid_d'),'ya no pertenece');
-- retirado puede volver a pedir ingreso; mientras está pendiente no se "suspende"
select set_config('app.uid','00000000-0000-0000-0000-0000000000d4',false);
select public.t_eq('retirado puede solicitar de nuevo', public.solicitar_union('EXTR-1111'), 'Extras Org');
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.t_err(format($$select public.cambiar_estado_miembro(%L,'suspender')$$,:'mid_d'),'solicitudes pendientes');
-- otra organización
select set_config('app.uid','00000000-0000-0000-0000-0000000000c3',false);
reset role;
select id as mid_x from public.membresias where organizacion_id=:'org2'::uuid and usuario_id='00000000-0000-0000-0000-0000000000c3' \gset
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.t_err(format($$select public.cambiar_estado_miembro(%L,'retirar')$$,:'mid_x'),'Solo un administrador');
reset role; set role anon;
select public.t_err(format($$select public.cambiar_estado_miembro(%L,'retirar')$$,:'mid_b'),'permission denied');
reset role; set role authenticated; select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);

-- ===== Sedes
select public.t_eq('1 sede inicial', (select count(*)::text from public.listar_sedes_org(:'org'::uuid)), '1');
select public.t_eq('miembros en Principal (A y B; C entró sin sede)', (select miembros::text from public.listar_sedes_org(:'org'::uuid) where nombre='Principal'), '2');
select public.crear_sede(:'org'::uuid,'  Norte ','Cali') as sede_n \gset
select public.t_eq('sede creada y recortada', (select nombre||'|'||ciudad from public.listar_sedes_org(:'org'::uuid) where sede_id=:'sede_n'::uuid), 'Norte|Cali');
select public.t_err(format($$select public.crear_sede(%L,'norte')$$,:'org'),'Ya existe una sede');
select public.t_err(format($$select public.crear_sede(%L,'x')$$,:'org'),'entre 2 y 60');
select public.editar_sede(:'sede_n'::uuid,'Norte 2','Bogotá');
select public.t_eq('sede editada', (select nombre||'|'||ciudad from public.listar_sedes_org(:'org'::uuid) where sede_id=:'sede_n'::uuid), 'Norte 2|Bogotá');
select public.t_err(format($$select public.editar_sede(%L,'principal')$$,:'sede_n'),'Ya existe una sede');
select public.editar_sede(:'sede_n'::uuid,'Norte 2','Medellín');
select public.t_eq('editar solo la ciudad con el mismo nombre es válido', (select nombre||'|'||ciudad from public.listar_sedes_org(:'org'::uuid) where sede_id=:'sede_n'::uuid), 'Norte 2|Medellín');
-- eliminar: con miembros no; la única no; con invitación pendiente no; con registros de negocio no
select public.t_err(format($$select public.eliminar_sede(%L)$$,:'sede1'),'miembros con esta sede');
select encode(sha256(convert_to('tok-sede','UTF8')),'hex') as h \gset
select public.crear_invitacion(:'org'::uuid,'nadie@demo.com',:'r_com'::uuid,:'sede_n'::uuid,:'h') as inv \gset
select public.t_err(format($$select public.eliminar_sede(%L)$$,:'sede_n'),'invitaciones pendientes');
select public.cancelar_invitacion(:'inv'::uuid);
reset role;
insert into public.bodegas(sede_id,nombre) values (:'sede_n'::uuid,'Bodega norte');
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.t_err(format($$select public.eliminar_sede(%L)$$,:'sede_n'),'registros asociados');
reset role;
select public.t_eq('el intento fallido no dejó cambios (invitación cerrada conserva su sede)', (select sede_id::text from public.invitaciones where id=:'inv'::uuid), :'sede_n');
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
reset role;
delete from public.bodegas where sede_id=:'sede_n'::uuid;
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.eliminar_sede(:'sede_n'::uuid);
select public.t_eq('sede eliminada', (select count(*)::text from public.listar_sedes_org(:'org'::uuid)), '1');
reset role;
select public.t_eq('invitación cerrada quedó sin sede', (select coalesce(sede_id::text,'NULL') from public.invitaciones where id=:'inv'::uuid), 'NULL');
set role authenticated; select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.t_err(format($$select public.eliminar_sede(%L)$$,:'sede1'),'al menos una sede');
-- seguridad
select public.t_err(format($$select * from public.listar_sedes_org(%L)$$,:'org2'),'Solo un administrador');
select public.t_err(format($$select public.crear_sede(%L,'Intruso')$$,:'org2'),'Solo un administrador');
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false);
select public.t_err(format($$select public.crear_sede(%L,'Hack')$$,:'org'),'Solo un administrador');
select public.t_err(format($$select public.editar_sede(%L,'Hack')$$,:'sede1'),'Solo un administrador');
select public.t_err(format($$select public.eliminar_sede(%L)$$,:'sede1'),'Solo un administrador');
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);

-- ===== Restablecer roles base
select public.guardar_permisos_rol(:'r_com'::uuid,'[]'::jsonb);
select public.t_eq('Comercial quedó sin permisos', (select count(*)::text from public.listar_permisos_org(:'org'::uuid) where rol_id=:'r_com'::uuid), '0');
select public.restablecer_rol_base(:'r_com'::uuid);
select public.t_eq('Comercial restablecido (2 permisos)', (select count(*)::text from public.listar_permisos_org(:'org'::uuid) where rol_id=:'r_com'::uuid), '2');
-- los 4 roles base, tras restablecer, son idénticos a los de una organización recién sembrada (org2)
select r.id as rg from public.roles r where r.organizacion_id=:'org'::uuid and r.nombre='Gerencia' \gset
select r.id as rc from public.roles r where r.organizacion_id=:'org'::uuid and r.nombre='Compras' \gset
select r.id as rb from public.roles r where r.organizacion_id=:'org'::uuid and r.nombre='Bodega' \gset
select public.guardar_permisos_rol(:'rg'::uuid,'[]'::jsonb); select public.guardar_permisos_rol(:'rc'::uuid,'[]'::jsonb); select public.guardar_permisos_rol(:'rb'::uuid,'[]'::jsonb);
select public.restablecer_rol_base(:'rg'::uuid); select public.restablecer_rol_base(:'rc'::uuid); select public.restablecer_rol_base(:'rb'::uuid);
reset role;
select public.t_eq('permisos base == siembra de crear_organizacion (diferencias)',
 (select count(*)::text from (
   (select r.nombre, mo.nombre m, p.puede_ver, p.puede_crear, p.puede_editar, p.puede_eliminar from public.permisos_rol p join public.roles r on r.id=p.rol_id join public.modulos mo on mo.id=p.modulo_id where r.organizacion_id=:'org'::uuid and r.nombre in ('Gerencia','Compras','Bodega','Comercial')
    except
    select r.nombre, mo.nombre, p.puede_ver, p.puede_crear, p.puede_editar, p.puede_eliminar from public.permisos_rol p join public.roles r on r.id=p.rol_id join public.modulos mo on mo.id=p.modulo_id where r.organizacion_id=:'org2'::uuid and r.nombre in ('Gerencia','Compras','Bodega','Comercial'))
   union all
   (select r.nombre, mo.nombre, p.puede_ver, p.puede_crear, p.puede_editar, p.puede_eliminar from public.permisos_rol p join public.roles r on r.id=p.rol_id join public.modulos mo on mo.id=p.modulo_id where r.organizacion_id=:'org2'::uuid and r.nombre in ('Gerencia','Compras','Bodega','Comercial')
    except
    select r.nombre, mo.nombre, p.puede_ver, p.puede_crear, p.puede_editar, p.puede_eliminar from public.permisos_rol p join public.roles r on r.id=p.rol_id join public.modulos mo on mo.id=p.modulo_id where r.organizacion_id=:'org'::uuid and r.nombre in ('Gerencia','Compras','Bodega','Comercial'))
 ) d), '0');
set role authenticated; select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.crear_rol(:'org'::uuid,'Supervisor') as r_sup \gset
select public.t_err(format($$select public.restablecer_rol_base(%L)$$,:'r_sup'),'roles base');
select public.t_err(format($$select public.restablecer_rol_base(%L)$$,:'r_admin'),'roles base');
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false);
select public.t_err(format($$select public.restablecer_rol_base(%L)$$,:'r_com'),'Solo un administrador');
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);

-- ===== Historial: contenido y reglas anti-ruido
select public.t_eq('crear rol con copia: 1 entrada y sin "modificó permisos" extra',
  (select count(*)::text from public.listar_auditoria(:'org'::uuid,500) where descripcion = 'creó el rol "Supervisor"' ), '1');
select public.t_eq('...y ningún "modificó los permisos del rol Supervisor"',
  (select count(*)::text from public.listar_auditoria(:'org'::uuid,500) where descripcion ilike '%permisos del rol "Supervisor"%'), '0');
select public.guardar_permisos_rol(:'r_sup'::uuid, jsonb_build_array(
  jsonb_build_object('modulo_id',(select id from public.modulos where nombre='pedidos'),'ver',true),
  jsonb_build_object('modulo_id',(select id from public.modulos where nombre='Items'),'ver',true),
  jsonb_build_object('modulo_id',(select id from public.modulos where nombre='Proveedores'),'ver',true)));
select public.t_eq('guardar 3 módulos = UNA sola entrada',
  (select count(*)::text from public.listar_auditoria(:'org'::uuid,500) where descripcion = 'modificó los permisos del rol "Supervisor"'), '1');
select public.editar_rol(:'r_sup'::uuid,'Supervisión','x');
select public.eliminar_rol(:'r_sup'::uuid);
select public.t_eq('eliminar rol no agrega ruido de permisos (queda solo la entrada del guardado anterior)',
  (select count(*)::text from public.listar_auditoria(:'org'::uuid,500) where descripcion ilike '%permisos del rol "Supervisor"%'), '1');
select public.t_eq('eliminar rol: entrada de baja', (select count(*)::text from public.listar_auditoria(:'org'::uuid,500) where descripcion = 'eliminó el rol "Supervisión"'), '1');
select public.t_eq('renombrar rol registrado', (select count(*)::text from public.listar_auditoria(:'org'::uuid,500) where descripcion = 'cambió el nombre del rol "Supervisor" a "Supervisión"'), '1');
select public.t_eq('restablecer registra permisos modificados', (select (count(*) >= 1)::text from public.listar_auditoria(:'org'::uuid,500) where descripcion = 'modificó los permisos del rol "Comercial"'), 'true');
select public.t_eq('sede creada registrada', (select count(*)::text from public.listar_auditoria(:'org'::uuid,500) where descripcion = 'creó la sede "Norte"'), '1');
select public.t_eq('sede eliminada registrada', (select count(*)::text from public.listar_auditoria(:'org'::uuid,500) where descripcion = 'eliminó la sede "Norte 2"'), '1');
select public.t_eq('suspensión registrada', (select count(*)::text from public.listar_auditoria(:'org'::uuid,500) where descripcion = 'suspendió a Beto Nuevo' and usuario='Ana Admin'), '1');
select public.t_eq('reactivación registrada', (select count(*)::text from public.listar_auditoria(:'org'::uuid,500) where descripcion = 'reactivó a Beto Nuevo'), '2');   -- A y C
select public.t_eq('retiro registrado', (select count(*)::text from public.listar_auditoria(:'org'::uuid,500) where descripcion = 'retiró a Dani SinConf'), '1');
select public.t_eq('re-solicitud registrada', (select count(*)::text from public.listar_auditoria(:'org'::uuid,500) where descripcion = 'Dani SinConf volvió a solicitar unirse'), '1');
-- cambio de rol y de sede de un miembro, y renombrar la organización / transferir propiedad
select public.cambiar_rol_miembro(:'mid_b'::uuid,(select id from public.roles where organizacion_id=:'org'::uuid and nombre='Compras'),null);
select public.t_eq('cambio de rol registrado', (select count(*)::text from public.listar_auditoria(:'org'::uuid,500) where descripcion = 'cambió el rol de Beto Nuevo de "Comercial" a "Compras"'), '1');
update public.organizaciones set nombre='Extras Org SAS' where id=:'org'::uuid;
select public.t_eq('renombrar organización registrado', (select count(*)::text from public.listar_auditoria(:'org'::uuid,500) where descripcion = 'cambió el nombre de la organización de "Extras Org" a "Extras Org SAS"'), '1');
select public.transferir_propiedad(:'org'::uuid,'00000000-0000-0000-0000-0000000000c3'::uuid);
select public.t_eq('transferencia registrada', (select count(*)::text from public.listar_auditoria(:'org'::uuid,500) where descripcion = 'transfirió la propiedad de la organización a Cata Otra'), '1');
-- límite y orden
select public.t_eq('límite respetado', (select count(*)::text from public.listar_auditoria(:'org'::uuid,3)), '3');
select public.t_eq('más reciente primero', (select accion from public.listar_auditoria(:'org'::uuid,1)), 'propiedad_transferida');
-- cambio hecho por la base (sin sesión) = "Sistema"
reset role;
select set_config('app.uid','',false);
update public.sedes set ciudad='Barranquilla' where id=:'sede1'::uuid;
set role authenticated; select set_config('app.uid','00000000-0000-0000-0000-0000000000c3',false);   -- C ahora es propietaria y admin
select public.t_eq('cambio sin sesión figura como Sistema', (select usuario from public.listar_auditoria(:'org'::uuid,1)), 'Sistema');
-- seguridad del historial
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false);
select public.t_err(format($$select * from public.listar_auditoria(%L)$$,:'org'),'Solo un administrador');
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);   -- A sigue admin de org1
select public.t_err(format($$select * from public.listar_auditoria(%L)$$,:'org2'),'Solo un administrador');
select public.t_err($$select * from public.auditoria_org$$,'permission denied');
select public.t_err(format($$insert into public.auditoria_org(organizacion_id,accion,descripcion) values (%L,'x','falso')$$,:'org'),'permission denied');
reset role; set role anon;
select public.t_err(format($$select * from public.listar_auditoria(%L)$$,:'org'),'permission denied');
reset role; set role authenticated;
select public.t_err($$select public._auditar(null,'x','y')$$,'permission denied');
select public.t_err($$select public._trg_aud_roles()$$,'permission denied');
reset role;
\echo EXTRAS_OK
