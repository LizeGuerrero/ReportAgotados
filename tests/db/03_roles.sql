\set ON_ERROR_STOP 1
create or replace function public.t_err(p_sql text, p_like text) returns void language plpgsql as $$
begin begin execute p_sql; exception when others then
  if sqlerrm ilike '%'||p_like||'%' then raise notice 'ok  bloqueado [%]', p_like; return; end if;
  raise exception 'ERROR DISTINTO [%]: %', p_like, sqlerrm; end;
  raise exception 'DEBIO FALLAR [%]: %', p_like, p_sql; end $$;
create or replace function public.t_eq(p_label text, p_got text, p_exp text) returns void language plpgsql as $$
begin if p_got is distinct from p_exp then raise exception 'FALLO % -> obtenido=% esperado=%', p_label, p_got, p_exp; end if; raise notice 'ok  %', p_label; end $$;

set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);   -- A admin/propietaria de org1
select public.crear_organizacion('Roles Org','ROLES-1111') as slug \gset
select set_config('app.uid','00000000-0000-0000-0000-0000000000c3',false);   -- C admin/propietaria de org2
select public.crear_organizacion('Otra Roles','ROLES-2222') as slug2 \gset
reset role;
select id as org from public.organizaciones where slug=:'slug' \gset
select id as org2 from public.organizaciones where slug=:'slug2' \gset
select id as r_admin from public.roles where organizacion_id=:'org'::uuid and nombre='admin' \gset
select id as r_view from public.roles where organizacion_id=:'org'::uuid and nombre='viewer' \gset
select id as r_com from public.roles where organizacion_id=:'org'::uuid and nombre='Comercial' \gset
select id as r_admin2 from public.roles where organizacion_id=:'org2'::uuid and nombre='admin' \gset
select id as m_pedidos from public.modulos where nombre='pedidos' \gset
select id as m_agot from public.modulos where nombre='reporte_agotados' \gset
select id as m_roles from public.modulos where nombre='Roles' \gset
select id as m_items from public.modulos where nombre='Items' \gset

set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);

-- ===== Lectura
select public.t_eq('lista 6 roles', (select count(*)::text from public.listar_roles_org(:'org'::uuid)), '6');
select public.t_eq('admin y viewer primero y protegidos', (select string_agg(nombre,',' order by ord) from (select nombre, row_number() over () ord from public.listar_roles_org(:'org'::uuid) limit 2) x), 'admin,viewer');
select public.t_eq('protegido=true para admin', (select protegido::text from public.listar_roles_org(:'org'::uuid) where nombre='admin'), 'true');
select public.t_eq('protegido=false para Comercial', (select protegido::text from public.listar_roles_org(:'org'::uuid) where nombre='Comercial'), 'false');
select public.t_eq('admin tiene 1 miembro', (select miembros::text from public.listar_roles_org(:'org'::uuid) where nombre='admin'), '1');
select public.t_eq('permisos de Comercial = 2 filas', (select count(*)::text from public.listar_permisos_org(:'org'::uuid) where rol_id=:'r_com'::uuid), '2');

-- ===== Crear
select public.crear_rol(:'org'::uuid, '  Supervisor ', 'Revisa pedidos', :'r_com'::uuid) as r_sup \gset
select public.t_eq('rol creado con copia (2 permisos)', (select count(*)::text from public.listar_permisos_org(:'org'::uuid) where rol_id=:'r_sup'::uuid), '2');
select public.t_eq('nombre recortado', (select nombre from public.listar_roles_org(:'org'::uuid) where rol_id=:'r_sup'::uuid), 'Supervisor');
select public.crear_rol(:'org'::uuid, 'Vacío') as r_vacio \gset
select public.t_eq('rol sin copia = 0 permisos', (select count(*)::text from public.listar_permisos_org(:'org'::uuid) where rol_id=:'r_vacio'::uuid), '0');
select public.crear_rol(:'org'::uuid, 'Clon admin', null, :'r_admin'::uuid) as r_clon \gset
select public.t_eq('copiar admin NO copia el módulo Roles', (select count(*)::text from public.listar_permisos_org(:'org'::uuid) where rol_id=:'r_clon'::uuid and modulo_id=:'m_roles'::uuid), '0');
select public.t_eq('copiar admin copia los otros 8', (select count(*)::text from public.listar_permisos_org(:'org'::uuid) where rol_id=:'r_clon'::uuid), '8');
select public.t_err(format($$select public.crear_rol(%L,'supervisor')$$,:'org'),'Ya existe un rol');
select public.t_err(format($$select public.crear_rol(%L,'ADMIN')$$,:'org'),'reservado');
select public.t_err(format($$select public.crear_rol(%L,'Predeterminado')$$,:'org'),'reservado');
select public.t_err(format($$select public.crear_rol(%L,'x')$$,:'org'),'entre 2 y 40');
select public.t_err(format($$select public.crear_rol(%L,'Con origen ajeno',null,%L)$$,:'org',:'r_admin2'),'no pertenece');

-- ===== Editar
select public.editar_rol(:'r_sup'::uuid, 'Supervisión', 'Nueva desc');
select public.t_eq('renombrado', (select nombre||'|'||descripcion from public.listar_roles_org(:'org'::uuid) where rol_id=:'r_sup'::uuid), 'Supervisión|Nueva desc');
select public.t_err(format($$select public.editar_rol(%L,'Otro nombre')$$,:'r_admin'),'del sistema');
select public.t_err(format($$select public.editar_rol(%L,'Otro nombre')$$,:'r_view'),'del sistema');
select public.t_err(format($$select public.editar_rol(%L,'Comercial')$$,:'r_sup'),'Ya existe un rol');

-- ===== Guardar permisos
select public.guardar_permisos_rol(:'r_sup'::uuid, jsonb_build_array(
  jsonb_build_object('modulo_id',:'m_pedidos','ver',false,'crear',true,'editar',false,'eliminar',false),   -- crear sin ver => se corrige a ver
  jsonb_build_object('modulo_id',:'m_agot','ver',true),
  jsonb_build_object('modulo_id',:'m_items','ver',false,'crear',false,'editar',false,'eliminar',false)));  -- todo falso => sin fila
select public.t_eq('ver implícito al dar crear', (select puede_ver::text||puede_crear::text from public.listar_permisos_org(:'org'::uuid) where rol_id=:'r_sup'::uuid and modulo_id=:'m_pedidos'::uuid), 'truetrue');
select public.t_eq('módulo sin permisos no deja fila', (select count(*)::text from public.listar_permisos_org(:'org'::uuid) where rol_id=:'r_sup'::uuid), '2');
select public.t_err(format($$select public.guardar_permisos_rol(%L, jsonb_build_array(jsonb_build_object('modulo_id',%L,'ver',true)))$$,:'r_sup',:'m_roles'),'reservado al administrador');
select public.t_eq('el fallo no dejó la matriz a medias (atómico)', (select count(*)::text from public.listar_permisos_org(:'org'::uuid) where rol_id=:'r_sup'::uuid), '2');
select public.t_err(format($$select public.guardar_permisos_rol(%L,'[]'::jsonb)$$,:'r_admin'),'del sistema');
select public.t_err(format($$select public.guardar_permisos_rol(%L,'[]'::jsonb)$$,:'r_view'),'del sistema');
select public.t_err(format($$select public.guardar_permisos_rol(%L,'{"a":1}'::jsonb)$$,:'r_sup'),'Formato');
select public.t_err(format($$select public.guardar_permisos_rol(%L, jsonb_build_array(jsonb_build_object('modulo_id','00000000-0000-0000-0000-00000000dead','ver',true)))$$,:'r_sup'),'Módulo no válido');

-- ===== Los permisos guardados SÍ gobiernan el acceso real (tiene_permiso)
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false);
reset role;
select id as sede from public.sedes where organizacion_id=:'org'::uuid \gset
insert into public.membresias(usuario_id,organizacion_id,rol_id,estado_membresia,activo,sede_id) values ('00000000-0000-0000-0000-0000000000b2',:'org'::uuid,:'r_sup'::uuid,'activa',true,:'sede'::uuid);
set role authenticated;
select public.t_eq('B (Supervisión) ve pedidos y puede crear', public.tiene_permiso(:'org'::uuid,'pedidos','crear')::text, 'true');
select public.t_eq('B no puede editar pedidos', public.tiene_permiso(:'org'::uuid,'pedidos','editar')::text, 'false');
select public.t_eq('B no tiene Roles', public.tiene_permiso(:'org'::uuid,'Roles','ver')::text, 'false');

-- ===== Seguridad: no admin, y otra organización
select public.t_err(format($$select * from public.listar_roles_org(%L)$$,:'org'),'Solo un administrador');
select public.t_err(format($$select * from public.listar_permisos_org(%L)$$,:'org'),'Solo un administrador');
select public.t_err(format($$select public.crear_rol(%L,'Hack')$$,:'org'),'Solo un administrador');
select public.t_err(format($$select public.guardar_permisos_rol(%L,'[]'::jsonb)$$,:'r_sup'),'Solo un administrador');
select public.t_err(format($$select public.eliminar_rol(%L)$$,:'r_sup'),'Solo un administrador');
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);   -- A es admin de org1, NO de org2
select public.t_err(format($$select * from public.listar_roles_org(%L)$$,:'org2'),'Solo un administrador');
select public.t_err(format($$select public.crear_rol(%L,'Intruso')$$,:'org2'),'Solo un administrador');
select public.t_err(format($$select public.editar_rol(%L,'Intruso')$$,:'r_admin2'),'Solo un administrador');
select public.t_err(format($$select public.eliminar_rol(%L)$$,:'r_admin2'),'Solo un administrador');
-- y tampoco un rol de otra org dentro de una función de la propia
select public.t_err(format($$select public.crear_rol(%L,'Copia ajena',null,%L)$$,:'org',:'r_admin2'),'no pertenece');
reset role; set role anon;
select public.t_err(format($$select * from public.listar_roles_org(%L)$$,:'org'),'permission denied');
select public.t_err(format($$select public.crear_rol(%L,'Anon')$$,:'org'),'permission denied');
reset role; set role authenticated;
select public.t_err($$select public._rol_protegido('admin')$$,'permission denied');   -- utilidades internas cerradas
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);

-- ===== Eliminar
select public.t_err(format($$select public.eliminar_rol(%L)$$,:'r_admin'),'del sistema');
select public.t_err(format($$select public.eliminar_rol(%L)$$,:'r_view'),'del sistema');
select public.t_err(format($$select public.eliminar_rol(%L)$$,:'r_sup'),'miembros asignados');   -- B lo tiene
select public.t_eq('miembros=1 en Supervisión', (select miembros::text from public.listar_roles_org(:'org'::uuid) where rol_id=:'r_sup'::uuid), '1');
-- invitación pendiente bloquea
select encode(sha256(convert_to('tok-vacio','UTF8')),'hex') as h \gset
select public.crear_invitacion(:'org'::uuid,'nadie@demo.com',:'r_vacio'::uuid,null,:'h') as inv \gset
select public.t_eq('invitaciones_pendientes=1', (select invitaciones_pendientes::text from public.listar_roles_org(:'org'::uuid) where rol_id=:'r_vacio'::uuid), '1');
select public.t_err(format($$select public.eliminar_rol(%L)$$,:'r_vacio'),'invitaciones pendientes');
select public.cancelar_invitacion(:'inv'::uuid);
select public.eliminar_rol(:'r_vacio'::uuid);   -- cancelada ya no bloquea; su historial se borra con el rol
select public.t_eq('rol eliminado', (select count(*)::text from public.listar_roles_org(:'org'::uuid) where rol_id=:'r_vacio'::uuid), '0');
select public.eliminar_rol(:'r_clon'::uuid);    -- con permisos y sin miembros
select public.t_eq('permisos del rol eliminado también', (select count(*)::text from public.listar_permisos_org(:'org'::uuid) where rol_id=:'r_clon'::uuid), '0');
reset role;
select public.t_eq('sin invitaciones huérfanas', (select count(*)::text from public.invitaciones where rol_id=:'r_vacio'::uuid), '0');
\echo ROLES_OK
