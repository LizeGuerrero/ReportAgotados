\set ON_ERROR_STOP 1
-- Pruebas de CXP Fase 1: permisos, cartera, totales, manuales, pagos y aislamiento.
-- unaccent viene de una extensión de Supabase; aquí se simula con una función equivalente.
create schema if not exists extensions;
create or replace function extensions.unaccent(t text) returns text language sql immutable as
  $$ select translate(t, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN') $$;
grant usage on schema extensions to authenticated, service_role;
grant execute on function extensions.unaccent(text) to authenticated, service_role;

create or replace function public.t_err(p_sql text, p_like text) returns void language plpgsql as $$
begin begin execute p_sql; exception when others then
  if sqlerrm ilike '%'||p_like||'%' then raise notice 'ok  bloqueado [%]', p_like; return; end if;
  raise exception 'ERROR DISTINTO [%]: %', p_like, sqlerrm; end;
  raise exception 'DEBIO FALLAR [%]: %', p_like, p_sql; end $$;
create or replace function public.t_eq(p_label text, p_got text, p_exp text) returns void language plpgsql as $$
begin if p_got is distinct from p_exp then raise exception 'FALLO % -> obtenido=% esperado=%', p_label, p_got, p_exp; end if; raise notice 'ok  %', p_label; end $$;

-- A crea la organización (admin). B se une como Comercial (sin permisos de CXP).
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.crear_organizacion('Cxp Org','CXP-1111') as slug \gset
reset role;
select id as org from public.organizaciones where slug=:'slug' \gset
select id as r_com from public.roles where organizacion_id=:'org'::uuid and nombre='Comercial' \gset
select id as sede from public.sedes where organizacion_id=:'org'::uuid limit 1 \gset
select public._cxp_hoy() as hoy \gset

select public.t_eq('el admin recibe los 2 módulos de CXP',
  (select count(*)::text from public.permisos_rol pr
     join public.roles r on r.id = pr.rol_id join public.modulos mo on mo.id = pr.modulo_id
    where r.organizacion_id = :'org'::uuid and r.nombre = 'admin' and mo.nombre in ('cxp','cxp_pagos')), '2');
select public.t_eq('Comercial no recibe CXP',
  (select count(*)::text from public.permisos_rol pr join public.modulos mo on mo.id = pr.modulo_id
    where pr.rol_id = :'r_com'::uuid and mo.nombre in ('cxp','cxp_pagos')), '0');

set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false); select public.solicitar_union('CXP-1111');
reset role;
select id as mid_b from public.membresias where usuario_id='00000000-0000-0000-0000-0000000000b2' and organizacion_id=:'org'::uuid \gset
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.resolver_solicitud(:'mid_b'::uuid, true, :'r_com'::uuid, :'sede'::uuid);

-- Manual: crear con NIT con puntos y dígito de verificación
select public.cxp_manual_crear(:'org'::uuid, jsonb_build_object(
  'nombre','SHARON YUSTY','tercero','1.005.891.505-3','docto_proveedor','CC 001','cond_pago','01 CONTADO',
  'fecha_dcto', (:'hoy'::date - 20)::text, 'fecha_vcto', (:'hoy'::date - 10)::text,
  'total_factura', 600000, 'retenciones', 20000, 'descuentos', 5000, 'sede_id', :'sede')) as d1 \gset
select public.cxp_manual_crear(:'org'::uuid, jsonb_build_object(
  'nombre','Ángela Pérez S.A.S','tercero','900123456','docto_proveedor','FE-77',
  'fecha_vcto', (:'hoy'::date + 10)::text, 'total_factura', 1000000)) as d2 \gset
select public.cxp_manual_crear(:'org'::uuid, jsonb_build_object(
  'nombre','RETE ICA','fecha_vcto', (:'hoy'::date + 5)::text, 'total_factura', 250000)) as d3 \gset

reset role;
select public.t_eq('NIT normalizado (sin puntos ni DV)', (select tercero from public.cxp_documentos where id=:'d1'::uuid), '1005891505');
select public.t_eq('val_pagar = total - retenciones - descuentos', (select val_pagar::text from public.cxp_documentos where id=:'d1'::uuid), '575000.00');
select public.t_eq('origen manual', (select origen from public.cxp_documentos where id=:'d1'::uuid), 'manual');
select public.t_eq('la creación quedó en el historial', (select count(*)::text from public.auditoria where tabla='cxp_documentos' and registro=:'d1'), '1');

-- Validaciones
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.t_err(format($$select public.cxp_manual_crear(%L, '{"nombre":"X","fecha_vcto":"2030-01-01","total_factura":0}')$$, :'org'), 'total de la factura');
select public.t_err(format($$select public.cxp_manual_crear(%L, '{"fecha_vcto":"2030-01-01","total_factura":5}')$$, :'org'), 'nombre del proveedor');
select public.t_err(format($$select public.cxp_manual_crear(%L, '{"nombre":"X","total_factura":5}')$$, :'org'), 'fecha de vencimiento');
select public.t_err(format($$select public.cxp_manual_crear(%L, '{"nombre":"X","fecha_dcto":"2030-02-01","fecha_vcto":"2030-01-01","total_factura":5}')$$, :'org'), 'anterior a la fecha');
select public.t_err(format($$select public.cxp_manual_crear(%L, '{"nombre":"X","fecha_vcto":"2030-01-01","total_factura":5,"retenciones":9}')$$, :'org'), 'superan el total');
select public.t_err(format($$select public.cxp_manual_crear(%L, '{"nombre":"X","tercero":"12","fecha_vcto":"2030-01-01","total_factura":5}')$$, :'org'), 'Documento del tercero');
select public.t_err(format($$select public.cxp_manual_crear(%L, '{"nombre":"X","tercero":"1005891505","docto_proveedor":"cc-001","fecha_vcto":"2030-01-01","total_factura":5}')$$, :'org'), 'ya está registrada');

-- Totales y filtros
select public.t_eq('suma total', (select suma_total::text from public.cxp_totales(:'org'::uuid)), '1825000.00');
select public.t_eq('suma vencido', (select suma_vencido::text from public.cxp_totales(:'org'::uuid)), '575000.00');
select public.t_eq('suma por vencer', (select suma_por_vencer::text from public.cxp_totales(:'org'::uuid)), '1250000.00');
select public.t_eq('totales por proveedor (NIT)', (select suma_total::text from public.cxp_totales(:'org'::uuid, 'pendiente', null, '1005891505')), '575000.00');
select public.t_eq('totales por proveedor (nombre, sin NIT)', (select suma_total::text from public.cxp_totales(:'org'::uuid, 'pendiente', null, null, 'rete ica')), '250000.00');
select public.t_eq('búsqueda sin tildes', (select count(*)::text from public.cxp_listar(:'org'::uuid, 'pendiente', 'angela')), '1');
select public.t_eq('listado completo', (select count(*)::text from public.cxp_listar(:'org'::uuid)), '3');
select public.t_eq('filtro vencidos', (select count(*)::text from public.cxp_listar(:'org'::uuid, p_vencimiento => 'vencidos')), '1');
select public.t_eq('totales ignoran el filtro de vencimiento', (select suma_total::text from public.cxp_totales(:'org'::uuid)), '1825000.00');
select public.t_eq('el más vencido va primero', (select nombre from public.cxp_listar(:'org'::uuid) limit 1), 'SHARON YUSTY');
select public.t_eq('días de vencimiento', (select dias_venc::text from public.cxp_listar(:'org'::uuid, p_busqueda => 'sharon')), '10');
select public.t_eq('días de vencimiento de lo no vencido = 0', (select dias_venc::text from public.cxp_listar(:'org'::uuid, p_busqueda => 'rete')), '0');
select public.t_eq('orden por valor desc', (select nombre from public.cxp_listar(:'org'::uuid, p_orden => 'val_pagar', p_dir => 'desc') limit 1), 'Ángela Pérez S.A.S');
select public.t_eq('filtro por sede', (select count(*)::text from public.cxp_listar(:'org'::uuid, p_sede => :'sede'::uuid)), '1');
select public.t_err(format($$select * from public.cxp_listar(%L, p_orden => 'x; drop table y')$$, :'org'), 'orden no válida');
select public.t_err(format($$select * from public.cxp_listar(%L, p_vencimiento => 'otro')$$, :'org'), 'vencimiento no válido');
select public.t_eq('lista de proveedores del filtro', (select count(*)::text from public.cxp_proveedores_filtro(:'org'::uuid)), '3');
select public.t_eq('rellenado por NIT', (select nombre from public.cxp_terceros(:'org'::uuid, '1005891') limit 1), 'SHARON YUSTY');
select public.t_eq('rellenado por nombre', (select tercero from public.cxp_terceros(:'org'::uuid, 'angela') limit 1), '900123456');
select public.t_eq('menos de 2 letras no busca', (select count(*)::text from public.cxp_terceros(:'org'::uuid, 'a')), '0');

-- Anotaciones: manual (todo) y ERP (solo anotaciones)
select public.cxp_actualizar(:'org'::uuid, :'d2'::uuid, '{"anticipos":100000,"detalles":"pagar el viernes"}'::jsonb);
select public.cxp_actualizar(:'org'::uuid, :'d2'::uuid, '{"nombre":"Ángela Pérez SAS","total_factura":1100000}'::jsonb);
reset role;
select public.t_eq('val_pagar se recalcula', (select val_pagar::text from public.cxp_documentos where id=:'d2'::uuid), '1000000.00');
select public.t_eq('plazo calculado de un manual con fecha de documento', (select coalesce(plazo::text,'nulo') from public.cxp_documentos where id=:'d2'::uuid), 'nulo');

insert into public.cxp_documentos (organizacion_id, origen, empresa, tercero, documento_erp, nombre, docto_proveedor,
  fecha_dcto, fecha_vcto, total_factura)
values (:'org'::uuid, 'erp', 'IG', '800111222', 'CC-001000-00', 'PROVEEDOR ERP', 'FE-1', :'hoy'::date - 3, :'hoy'::date + 7, 500000)
returning id as d4 \gset
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.cxp_actualizar(:'org'::uuid, :'d4'::uuid, '{"descuentos":50000,"detalles":"nota"}'::jsonb);
select public.t_err(format($$select public.cxp_actualizar(%L,%L,'{"nombre":"otro"}')$$, :'org', :'d4'), 'vienen del ERP');
select public.t_err(format($$select public.cxp_actualizar(%L,%L,'{"total_factura":9}')$$, :'org', :'d4'), 'vienen del ERP');
select public.t_err(format($$select public.cxp_manual_eliminar(%L,%L)$$, :'org', :'d4'), 'pendientes manuales');
select public.t_eq('el ERP aparece con su origen', (select origen from public.cxp_listar(:'org'::uuid, p_busqueda => 'proveedor erp')), 'erp');
select public.t_eq('filtro por origen', (select count(*)::text from public.cxp_listar(:'org'::uuid, p_origen => 'manual')), '3');

-- Eliminar manual
select public.cxp_manual_eliminar(:'org'::uuid, :'d3'::uuid);
select public.t_eq('manual eliminado', (select count(*)::text from public.cxp_listar(:'org'::uuid)), '3');

-- Pagos
select public.t_err(format($$select public.cxp_marcar_pagado(%L, '{}'::uuid[])$$, :'org'), 'al menos un documento');
select public.t_eq('marcar pagado', (select public.cxp_marcar_pagado(:'org'::uuid, array[:'d1'::uuid])::text), '1');
select public.t_err(format($$select public.cxp_marcar_pagado(%L, array[%L::uuid])$$, :'org', :'d1'), 'ya estaba pagado');
select public.t_err(format($$select public.cxp_actualizar(%L,%L,'{"detalles":"x"}')$$, :'org', :'d1'), 'pagado no se puede editar');
select public.t_err(format($$select public.cxp_manual_eliminar(%L,%L)$$, :'org', :'d1'), 'pendientes manuales');
select public.t_eq('el pagado sale de la cartera', (select count(*)::text from public.cxp_listar(:'org'::uuid)), '2');
select public.t_eq('el pagado aparece en Pagados con fecha', (select (fecha_pago is not null)::text from public.cxp_listar(:'org'::uuid, 'pagado')), 'true');
select public.t_eq('quién pagó', (select pagado_por from public.cxp_listar(:'org'::uuid, 'pagado')), 'Ana Admin');
select public.t_eq('los totales de pagados van aparte', (select suma_total::text from public.cxp_totales(:'org'::uuid, 'pagado')), '575000.00');
select public.cxp_reabrir(:'org'::uuid, :'d1'::uuid);
select public.t_err(format($$select public.cxp_reabrir(%L,%L)$$, :'org', :'d1'), 'no está pagado');
select public.t_eq('reabierto vuelve a la cartera', (select count(*)::text from public.cxp_listar(:'org'::uuid)), '3');

-- Seguridad: B (Comercial, sin CXP) no ve ni cambia nada
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false);
select public.t_err(format($$select * from public.cxp_listar(%L)$$, :'org'), 'Sin permiso');
select public.t_err(format($$select * from public.cxp_totales(%L)$$, :'org'), 'Sin permiso');
select public.t_err(format($$select * from public.cxp_listar(%L, 'pagado')$$, :'org'), 'Sin permiso');
select public.t_err(format($$select * from public.cxp_terceros(%L,'sharon')$$, :'org'), 'Sin permiso');
select public.t_err(format($$select * from public.cxp_listar_sedes(%L)$$, :'org'), 'Sin permiso');
select public.t_err(format($$select public.cxp_manual_crear(%L,'{"nombre":"X","fecha_vcto":"2030-01-01","total_factura":5}')$$, :'org'), 'Sin permiso');
select public.t_err(format($$select public.cxp_marcar_pagado(%L, array[%L::uuid])$$, :'org', :'d2'), 'Sin permiso');
select public.t_eq('lectura directa de la tabla: sin filas', (select count(*)::text from public.cxp_documentos), '0');
select public.t_err($$insert into public.cxp_documentos (organizacion_id, nombre, total_factura) values (gen_random_uuid(),'x',1)$$, 'permission denied');
select public.t_err($$update public.cxp_documentos set nombre = 'x'$$, 'permission denied');
select public.t_err($$delete from public.cxp_documentos$$, 'permission denied');

-- B con rol que sí tiene CXP "ver" pero no crear/pagar: puede ver, no puede cambiar
reset role;
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
insert into public.permisos_rol (rol_id, modulo_id, puede_ver, puede_crear, puede_editar, puede_eliminar)
select :'r_com'::uuid, mo.id, true, false, false, false from public.modulos mo where mo.nombre = 'cxp';
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false);
select public.t_eq('con permiso ver: ve la cartera', (select count(*)::text from public.cxp_listar(:'org'::uuid)), '3');
select public.t_eq('con permiso ver: ve las sedes', (select count(*)::text from public.cxp_listar_sedes(:'org'::uuid)), '1');
select public.t_err(format($$select public.cxp_manual_crear(%L,'{"nombre":"X","fecha_vcto":"2030-01-01","total_factura":5}')$$, :'org'), 'Sin permiso');
select public.t_err(format($$select public.cxp_actualizar(%L,%L,'{"detalles":"x"}')$$, :'org', :'d2'), 'Sin permiso');
select public.t_err(format($$select public.cxp_manual_eliminar(%L,%L)$$, :'org', :'d2'), 'Sin permiso');
select public.t_err(format($$select * from public.cxp_listar(%L, 'pagado')$$, :'org'), 'Sin permiso');
select public.t_err(format($$select public.cxp_marcar_pagado(%L, array[%L::uuid])$$, :'org', :'d2'), 'Sin permiso');

-- Aislamiento entre organizaciones: C crea otra organización y no ve la de A
reset role;
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000c3',false);
select public.crear_organizacion('Otra Org','OTRA-2222') as slug2 \gset
reset role;
select id as org2 from public.organizaciones where slug=:'slug2' \gset
set role authenticated;
select public.t_eq('la otra organización arranca vacía', (select count(*)::text from public.cxp_listar(:'org2'::uuid)), '0');
select public.t_err(format($$select * from public.cxp_listar(%L)$$, :'org'), 'Sin permiso');
select public.t_err(format($$select public.cxp_actualizar(%L,%L,'{"detalles":"x"}')$$, :'org2', :'d2'), 'no encontrado');
select public.t_err(format($$select public.cxp_marcar_pagado(%L, array[%L::uuid])$$, :'org2', :'d2'), 'ya estaba pagado o no existe');
reset role;
\echo CXP_FASE1_OK
