\set ON_ERROR_STOP 1
-- Pruebas de CXP Fase 5: plantilla del mensaje, contactos de proveedores y exclusión de varios documentos.
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

set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.crear_organizacion('Cxp Cinco','CXP-5555') as slug \gset
reset role;
select id as org from public.organizaciones where slug=:'slug' \gset
select id as r_com from public.roles where organizacion_id=:'org'::uuid and nombre='Comercial' \gset
select id as sede from public.sedes where organizacion_id=:'org'::uuid limit 1 \gset

select public.t_eq('el admin recibe el permiso de mensajes',
  (select count(*)::text from public.permisos_rol pr
     join public.roles r on r.id = pr.rol_id join public.modulos mo on mo.id = pr.modulo_id
    where r.organizacion_id = :'org'::uuid and r.nombre = 'admin' and mo.nombre = 'cxp_mensajes'), '1');

set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false); select public.solicitar_union('CXP-5555');
reset role;
select id as mid_b from public.membresias where usuario_id='00000000-0000-0000-0000-0000000000b2' and organizacion_id=:'org'::uuid \gset
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.resolver_solicitud(:'mid_b'::uuid, true, :'r_com'::uuid, :'sede'::uuid);

-- Plantilla del mensaje ------------------------------------------------------------------------------
select public.t_eq('sin plantilla guardada: null', coalesce((public.cxp_config_obtener(:'org'::uuid, 'mensaje_proveedor'))::text, 'nulo'), 'nulo');
select public.cxp_config_guardar(:'org'::uuid, 'mensaje_proveedor',
  '{"cuerpo":"Hola {proveedor}\n{facturas}\nTotal {total}","linea":"- {factura} {valor}","indicativo":"+57"}'::jsonb);
select public.t_eq('se guarda y se lee', (public.cxp_config_obtener(:'org'::uuid, 'mensaje_proveedor'))->>'linea', '- {factura} {valor}');
select public.t_eq('el indicativo queda solo con dígitos', (public.cxp_config_obtener(:'org'::uuid, 'mensaje_proveedor'))->>'indicativo', '57');
select public.cxp_config_guardar(:'org'::uuid, 'mensaje_proveedor', '{"cuerpo":"Pagado {facturas}","linea":"{factura}","indicativo":"57"}'::jsonb);
select public.t_eq('guardar de nuevo reemplaza', (public.cxp_config_obtener(:'org'::uuid, 'mensaje_proveedor'))->>'cuerpo', 'Pagado {facturas}');
select public.t_err(format($$select public.cxp_config_guardar(%L,'mensaje_proveedor','{"cuerpo":"sin lista","linea":"x"}')$$, :'org'), '{facturas}');
select public.t_err(format($$select public.cxp_config_guardar(%L,'mensaje_proveedor','{"cuerpo":"{facturas}","linea":" "}')$$, :'org'), 'cada factura');
select public.t_err(format($$select public.cxp_config_guardar(%L,'otra','{"cuerpo":"{facturas}","linea":"x"}')$$, :'org'), 'no válida');
select public.t_err(format($$select public.cxp_config_obtener(%L,'otra')$$, :'org'), 'no válida');
select public.t_err(format($$select public.cxp_config_guardar(%L,'mensaje_proveedor','[]')$$, :'org'), 'no válidos');

-- Permisos: B (Comercial, sin CXP) no ve ni cambia nada
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false);
select public.t_err(format($$select public.cxp_config_obtener(%L,'mensaje_proveedor')$$, :'org'), 'Sin permiso');
select public.t_err(format($$select public.cxp_config_guardar(%L,'mensaje_proveedor','{"cuerpo":"{facturas}","linea":"x"}')$$, :'org'), 'Sin permiso');
select public.t_err(format($$select * from public.cxp_contactos_proveedores(%L, array['900123456'])$$, :'org'), 'Sin permiso');
select public.t_err(format($$select public.cxp_excluir_documentos(%L, array[gen_random_uuid()], 'REVISAR', null)$$, :'org'), 'Sin permiso');
select public.t_eq('lectura directa de la configuración: sin filas', (select count(*)::text from public.cxp_config), '0');
select public.t_err($$insert into public.cxp_config (organizacion_id, clave, valor) values (gen_random_uuid(),'mensaje_proveedor','{}')$$, 'permission denied');

-- Con "ver pagados" puede leer la plantilla (la necesita para armar el mensaje) pero no cambiarla
reset role;
insert into public.permisos_rol (rol_id, modulo_id, puede_ver, puede_crear, puede_editar, puede_eliminar)
select :'r_com'::uuid, mo.id, true, false, false, false from public.modulos mo where mo.nombre = 'cxp_pagos';
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false);
select public.t_eq('con permiso de pagos puede leer la plantilla', (public.cxp_config_obtener(:'org'::uuid, 'mensaje_proveedor'))->>'indicativo', '57');
select public.t_err(format($$select public.cxp_config_guardar(%L,'mensaje_proveedor','{"cuerpo":"{facturas}","linea":"x"}')$$, :'org'), 'Sin permiso');

-- Contactos del proveedor (cruzados por número de documento) ------------------------------------------
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.proveedor_crear(:'org'::uuid, '{"tipo_documento":"NIT","numero_documento":"900123456","nombre":"PROVEEDOR UNO","telefono":"300 123 4567","contacto":"Marta"}'::jsonb);
select public.t_eq('contacto por NIT con puntos y espacios', (select telefono from public.cxp_contactos_proveedores(:'org'::uuid, array['900.123.456'])), '300 123 4567');
select public.t_eq('trae el nombre del contacto', (select contacto from public.cxp_contactos_proveedores(:'org'::uuid, array['900123456'])), 'Marta');
select public.t_eq('proveedor desconocido: sin filas', (select count(*)::text from public.cxp_contactos_proveedores(:'org'::uuid, array['111111111'])), '0');
select public.t_eq('lista vacía: sin filas', (select count(*)::text from public.cxp_contactos_proveedores(:'org'::uuid, array[]::text[])), '0');

-- Excluir varios documentos a la vez -------------------------------------------------------------------
select public.cxp_importar_confirmar(:'org'::uuid, '[{"fila":2,"tercero":"900123456","nombre":"PROVEEDOR UNO","documento_erp":"FG-1","fecha_vcto":"2030-01-10","saldo":100,"detalle":"A"},{"fila":3,"tercero":"900123456","nombre":"PROVEEDOR UNO","documento_erp":"FG-2","fecha_vcto":"2030-01-10","saldo":200,"detalle":"B"},{"fila":4,"tercero":"800111222","nombre":"PROVEEDOR DOS","documento_erp":"FG-3","fecha_vcto":"2030-01-10","saldo":300,"detalle":"C"}]'::jsonb, 'x.xlsx', 'h1');
select public.cxp_manual_crear(:'org'::uuid, jsonb_build_object('nombre','MANUAL','fecha_vcto','2031-01-01','total_factura',50)) as man \gset
select id as e1 from public.cxp_documentos where documento_erp='FG-1' \gset
select id as e2 from public.cxp_documentos where documento_erp='FG-2' \gset
select id as e3 from public.cxp_documentos where documento_erp='FG-3' \gset

select public.cxp_excluir_documentos(:'org'::uuid, array[:'e1'::uuid, :'e2'::uuid, :'man'::uuid, gen_random_uuid()], 'cruzar', 'ya pagadas') as res \gset
select public.t_eq('excluidos', (:'res'::jsonb)->>'excluidos', '2');
select public.t_eq('omitidos (el manual y el que no existe)', (:'res'::jsonb)->>'omitidos', '2');
select public.t_eq('se crearon 2 reglas por documento', (select count(*)::text from public.cxp_reglas where tipo='documento'), '2');
select public.t_eq('el contexto queda en mayúsculas', (select distinct contexto from public.cxp_reglas), 'CRUZAR');
select public.t_eq('la nota se guarda', (select distinct nota from public.cxp_reglas), 'ya pagadas');
select public.t_eq('salen de la cartera', (select count(*)::text from public.cxp_listar(:'org'::uuid)), '2');
select public.t_eq('quedan en Excluidas', (select count(*)::text from public.cxp_listar(:'org'::uuid, 'excluido')), '2');
select public.t_eq('el manual sigue en la cartera', (select count(*)::text from public.cxp_listar(:'org'::uuid, p_origen => 'manual')), '1');

-- Repetir sobre los ya excluidos no duplica reglas ni falla
select public.cxp_excluir_documentos(:'org'::uuid, array[:'e1'::uuid, :'e3'::uuid], 'REVISAR', null) as res2 \gset
select public.t_eq('cuenta también al que ya estaba excluido', (:'res2'::jsonb)->>'excluidos', '2');
select public.t_eq('3 reglas en total', (select count(*)::text from public.cxp_reglas), '3');
select public.t_eq('el ya excluido conserva su contexto', (select r.contexto from public.cxp_documentos d join public.cxp_reglas r on r.id = d.regla_id where d.id = :'e1'::uuid), 'CRUZAR');

select public.t_err(format($$select public.cxp_excluir_documentos(%L, array[]::uuid[], 'X', null)$$, :'org'), 'al menos un documento');
select public.t_err(format($$select public.cxp_excluir_documentos(%L, array[%L::uuid], '  ', null)$$, :'org', :'e2'), 'contexto');
select public.t_err(format($$select public.cxp_excluir_documentos(%L, array[%L::uuid], 'X', repeat('n', 501))$$, :'org', :'e2'), 'nota');
select public.t_err(format($$select public.cxp_marcar_pagado(%L, array[%L::uuid])$$, :'org', :'e1'), 'excluido');

-- B con "ver pagados" no puede excluir (exige cxp_reglas · crear)
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false);
select public.t_err(format($$select public.cxp_excluir_documentos(%L, array[%L::uuid], 'X', null)$$, :'org', :'e3'), 'Sin permiso');
reset role;
\echo CXP_FASE5_OK
