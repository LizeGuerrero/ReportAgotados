\set ON_ERROR_STOP 1
-- Pruebas de CXP Fase 3: cruce manual<->ERP, filtro por proveedor completo, última carga / ausentes y tramos.
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

-- ===== Organización A (usuario a1 admin; b2 Comercial) =====
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.crear_organizacion('Cxp Tres A','CXP-3333') as slug \gset
reset role;
select id as org from public.organizaciones where slug=:'slug' \gset
select id as r_com from public.roles where organizacion_id=:'org'::uuid and nombre='Comercial' \gset
select id as sede from public.sedes where organizacion_id=:'org'::uuid limit 1 \gset
select public._cxp_hoy() as hoy \gset

set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false); select public.solicitar_union('CXP-3333');
reset role;
select id as mid_b from public.membresias where usuario_id='00000000-0000-0000-0000-0000000000b2' and organizacion_id=:'org'::uuid \gset
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.resolver_solicitud(:'mid_b'::uuid, true, :'r_com'::uuid, :'sede'::uuid);

-- Pendientes manuales
select public.cxp_manual_crear(:'org'::uuid, jsonb_build_object('nombre','PROVEEDOR UNO','tercero','900111222','docto_proveedor','FE-1',
  'fecha_vcto',(:'hoy'::date + 5)::text,'total_factura',100000,'anticipos',20000,'detalles','pagar viernes')) as m1 \gset
select public.cxp_manual_crear(:'org'::uuid, jsonb_build_object('nombre','PROVEEDOR DOS','tercero','800333444','docto_proveedor','FE-22',
  'fecha_vcto',(:'hoy'::date + 5)::text,'total_factura',5000)) as m2 \gset
select public.cxp_manual_crear(:'org'::uuid, jsonb_build_object('nombre','PROVEEDOR TRES','tercero','700555666','docto_proveedor','1',
  'fecha_vcto',(:'hoy'::date + 5)::text,'total_factura',30000)) as m3 \gset
select public.cxp_manual_crear(:'org'::uuid, jsonb_build_object('nombre','CLARO LINES MOVILES',
  'fecha_vcto',(:'hoy'::date + 5)::text,'total_factura',253185.41)) as m4 \gset
select public.cxp_marcar_pagado(:'org'::uuid, array[:'m2'::uuid]);
select public.cxp_regla_guardar(:'org'::uuid, null, '{"tipo":"documento","tercero":"600777888","documento_erp":"FG-5","contexto":"CRUZAR"}'::jsonb);

\set f1 '[{"fila":2,"empresa":"IG","tercero":"900111222","nombre":"PROVEEDOR UNO","docto_proveedor":"FE 1","documento_erp":"FG-1","fecha_dcto":"2030-01-01","fecha_vcto":"2030-01-10","saldo":100000,"detalle":"COMPRA"},{"fila":3,"empresa":"IG","tercero":"800333444","nombre":"PROVEEDOR DOS","docto_proveedor":"FE22","documento_erp":"FG-2","fecha_dcto":"2030-01-01","fecha_vcto":"2030-01-10","saldo":5000,"detalle":"COMPRA"},{"fila":4,"empresa":"IG","tercero":"700555666","nombre":"PROVEEDOR TRES","docto_proveedor":"1","documento_erp":"FG-3","fecha_dcto":"2030-01-01","fecha_vcto":"2030-01-10","saldo":30000,"detalle":"COMPRA"},{"fila":5,"empresa":"IG","tercero":"900100200","nombre":"COMCEL SA","documento_erp":"FG-4","fecha_dcto":"2030-01-01","fecha_vcto":"2030-01-10","saldo":253185.41,"detalle":"LINEAS"},{"fila":6,"empresa":"IG","tercero":"600777888","nombre":"PROVEEDOR CINCO","documento_erp":"FG-5","fecha_dcto":"2030-01-01","fecha_vcto":"2030-01-10","saldo":7000,"detalle":"X"}]'

select public.cxp_importar_previsualizar(:'org'::uuid, :'f1'::jsonb, 'a1') as previa \gset
select public.t_eq('vista previa: 2 cruces automáticos (factura normalizada)', (:'previa'::jsonb)->>'cruces', '2');
select public.t_eq('la factura corta (1) no se cruza sola', (select count(*)::text from jsonb_array_elements((:'previa'::jsonb)->'cruces_lista') x where x->>'documento' = 'FG-3'), '0');

select public.cxp_importar_confirmar(:'org'::uuid, :'f1'::jsonb, 'a1.xlsx', 'a1') as r1 \gset
select public.t_eq('carga: 2 cruces', (:'r1'::jsonb)->>'cruces', '2');
select id as e1 from public.cxp_documentos where documento_erp='FG-1' \gset
select id as e2 from public.cxp_documentos where documento_erp='FG-2' \gset
select id as e3 from public.cxp_documentos where documento_erp='FG-3' \gset
select id as e4 from public.cxp_documentos where documento_erp='FG-4' \gset
select id as e5 from public.cxp_documentos where documento_erp='FG-5' \gset
select public.t_eq('manual pendiente quedó cruzado', (select estado from public.cxp_documentos where id=:'m1'::uuid), 'cruzado');
select public.t_eq('el manual apunta al documento del ERP', (select (cruzado_con = :'e1'::uuid)::text from public.cxp_documentos where id=:'m1'::uuid), 'true');
select public.t_eq('el ERP heredó el anticipo', (select anticipos::text from public.cxp_documentos where id=:'e1'::uuid), '20000.00');
select public.t_eq('el ERP heredó los detalles', (select detalles from public.cxp_documentos where id=:'e1'::uuid), 'pagar viernes');
select public.t_eq('val_pagar del ERP cruzado', (select val_pagar::text from public.cxp_documentos where id=:'e1'::uuid), '80000.00');
select public.t_eq('manual pagado + ERP: el ERP queda pagado', (select estado from public.cxp_documentos where id=:'e2'::uuid), 'pagado');
select public.t_eq('el ERP conserva la fecha del pago manual', (select (fecha_pago = (select fecha_pago from public.cxp_documentos where id=:'m2'::uuid))::text from public.cxp_documentos where id=:'e2'::uuid), 'true');
select public.t_eq('el manual pagado quedó cruzado', (select estado from public.cxp_documentos where id=:'m2'::uuid), 'cruzado');
select public.t_eq('cartera: ERP 1, 3 y 4 + manuales 3 y 4 (los cruzados no suman)', (select count(*)::text from public.cxp_listar(:'org'::uuid)), '5');
select public.t_eq('total antes de cruzar M3 y M4 (los cruzados ya no suman)', (select suma_total::text from public.cxp_totales(:'org'::uuid)), '646370.82');
select public.t_eq('pagados: solo el del ERP', (select count(*)::text from public.cxp_listar(:'org'::uuid, 'pagado')), '1');
select public.t_err(format($$select public.cxp_actualizar(%L,%L,'{"detalles":"x"}')$$, :'org', :'m1'), 'no se puede editar');
select public.t_err(format($$select public.cxp_manual_eliminar(%L,%L)$$, :'org', :'m1'), 'pendientes manuales');
select public.t_err(format($$select public.cxp_manual_crear(%L,'{"nombre":"X","tercero":"900111222","docto_proveedor":"fe-1","fecha_vcto":"2031-01-01","total_factura":5}')$$, :'org'), 'ya está registrada');
select public.t_err(format($$select public.cxp_cruzar(%L,%L,%L)$$, :'org', :'m1', :'e1'), 'ya fue cruzado');

-- Segunda carga del mismo archivo: no cruza ni cambia nada, y el ERP pagado se omite
select public.cxp_importar_confirmar(:'org'::uuid, :'f1'::jsonb, 'a1.xlsx', 'a1') as r2 \gset
select public.t_eq('recarga: sin cruces nuevos', (:'r2'::jsonb)->>'cruces', '0');
select public.t_eq('recarga: el pagado se omite', (:'r2'::jsonb)->>'pagados_omitidos', '1');
select public.t_eq('recarga: sin actualizaciones', (:'r2'::jsonb)->>'actualizados', '0');

-- Sugerencias: parejas (mismo NIT y mismo valor) y candidatos para un manual sin NIT
select public.t_eq('parejas sugeridas: M3 con FG-3', (select count(*)::text from public.cxp_cruces_sugeridos(:'org'::uuid)), '1');
select public.t_eq('motivo de la pareja', (select motivo from public.cxp_cruces_sugeridos(:'org'::uuid)), 'Mismo NIT y mismo valor');
select public.t_eq('candidato para manual sin NIT: mismo valor', (select count(*)::text from public.cxp_cruces_sugeridos(:'org'::uuid, :'m4'::uuid) where erp_documento='FG-4'), '1');
select public.t_eq('búsqueda de candidatos', (select count(*)::text from public.cxp_cruces_sugeridos(:'org'::uuid, :'m4'::uuid, 'comcel')), '1');
select public.t_eq('búsqueda sin resultados', (select count(*)::text from public.cxp_cruces_sugeridos(:'org'::uuid, :'m4'::uuid, 'zzzz') where erp_documento='FG-4'), '0');
select public.t_eq('un excluido por regla no se ofrece', (select count(*)::text from public.cxp_cruces_sugeridos(:'org'::uuid, :'m4'::uuid) where erp_documento='FG-5'), '0');

select public.cxp_cruzar(:'org'::uuid, :'m3'::uuid, :'e3'::uuid);
select public.cxp_cruzar(:'org'::uuid, :'m4'::uuid, :'e4'::uuid);
select public.t_eq('tras cruzar a mano: cartera = ERP 1, 3 y 4', (select count(*)::text from public.cxp_listar(:'org'::uuid)), '3');
select public.t_eq('el total ya no cuenta los manuales', (select suma_total::text from public.cxp_totales(:'org'::uuid)), '363185.41');

select public.cxp_manual_crear(:'org'::uuid, jsonb_build_object('nombre','OTRO','tercero','600777888','docto_proveedor','ABC123',
  'fecha_vcto',(:'hoy'::date + 5)::text,'total_factura',7000)) as m6 \gset
select public.t_err(format($$select public.cxp_cruzar(%L,%L,%L)$$, :'org', :'m6', :'e5'), 'excluido');

-- Permisos: B (sin CXP) no puede; con "cxp editar" puede cruzar, pero no un manual PAGADO (exige cxp_pagos)
select public.cxp_manual_crear(:'org'::uuid, jsonb_build_object('nombre','PAGADO MANUAL','tercero','900999000','docto_proveedor','ZZ-777',
  'fecha_vcto',(:'hoy'::date + 5)::text,'total_factura',1000)) as m7 \gset
select public.cxp_marcar_pagado(:'org'::uuid, array[:'m7'::uuid]);
select public.cxp_importar_confirmar(:'org'::uuid, '[{"tercero":"900999000","nombre":"PAGADO MANUAL","docto_proveedor":"OTRO-1","documento_erp":"FG-7","fecha_vcto":"2030-02-01","saldo":1000}]'::jsonb, 'a2.xlsx', 'a2') as r3 \gset
select id as e7 from public.cxp_documentos where documento_erp='FG-7' \gset
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false);
select public.t_err(format($$select public.cxp_cruzar(%L,%L,%L)$$, :'org', :'m6', :'e5'), 'Sin permiso');
select public.t_err(format($$select * from public.cxp_cruces_sugeridos(%L)$$, :'org'), 'Sin permiso');
select public.t_err(format($$select * from public.cxp_ultima_carga(%L)$$, :'org'), 'Sin permiso');
reset role;
insert into public.permisos_rol (rol_id, modulo_id, puede_ver, puede_crear, puede_editar, puede_eliminar)
select :'r_com'::uuid, mo.id, true, false, true, false from public.modulos mo where mo.nombre = 'cxp';
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false);
select public.t_eq('con permiso ver: ve la última carga', (select archivo from public.cxp_ultima_carga(:'org'::uuid)), 'a2.xlsx');
select public.t_err(format($$select public.cxp_cruzar(%L,%L,%L)$$, :'org', :'m7', :'e7'), 'cxp_pagos');

-- ===== Organización B (usuario c3): tramos, filtro por proveedor y "no vino en la última carga" =====
select set_config('app.uid','00000000-0000-0000-0000-0000000000c3',false);
select public.crear_organizacion('Cxp Tres B','CXP-4444') as slug2 \gset
reset role;
select id as org2 from public.organizaciones where slug=:'slug2' \gset
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000c3',false);

select public.cxp_manual_crear(:'org2'::uuid, jsonb_build_object('nombre','T1','fecha_vcto',(:'hoy'::date - 5)::text,   'total_factura',100));
select public.cxp_manual_crear(:'org2'::uuid, jsonb_build_object('nombre','T2','fecha_vcto',(:'hoy'::date - 45)::text,  'total_factura',200));
select public.cxp_manual_crear(:'org2'::uuid, jsonb_build_object('nombre','T3','fecha_vcto',(:'hoy'::date - 75)::text,  'total_factura',300));
select public.cxp_manual_crear(:'org2'::uuid, jsonb_build_object('nombre','T4','fecha_vcto',(:'hoy'::date - 120)::text, 'total_factura',400));
select public.cxp_manual_crear(:'org2'::uuid, jsonb_build_object('nombre','T5','fecha_vcto',(:'hoy'::date + 10)::text,  'total_factura',50));
select public.cxp_manual_crear(:'org2'::uuid, jsonb_build_object('nombre','T6','fecha_vcto',(:'hoy'::date - 30)::text,  'total_factura',1));
select public.cxp_manual_crear(:'org2'::uuid, jsonb_build_object('nombre','T7','fecha_vcto',(:'hoy'::date - 31)::text,  'total_factura',2));
select public.t_eq('tramo 1-30: suma', (select suma_1_30::text from public.cxp_totales(:'org2'::uuid)), '101.00');
select public.t_eq('tramo 1-30: 30 días exactos cuenta aquí', (select n_1_30::text from public.cxp_totales(:'org2'::uuid)), '2');
select public.t_eq('tramo 31-60: suma', (select suma_31_60::text from public.cxp_totales(:'org2'::uuid)), '202.00');
select public.t_eq('tramo 31-60: 31 días cuenta aquí', (select n_31_60::text from public.cxp_totales(:'org2'::uuid)), '2');
select public.t_eq('tramo 61-90', (select suma_61_90::text from public.cxp_totales(:'org2'::uuid)), '300.00');
select public.t_eq('tramo más de 90', (select suma_mas_90::text from public.cxp_totales(:'org2'::uuid)), '400.00');
select public.t_eq('por vencer', (select suma_por_vencer::text from public.cxp_totales(:'org2'::uuid)), '50.00');
select public.t_eq('vencido = suma de los tramos', (select suma_vencido::text from public.cxp_totales(:'org2'::uuid)), '1003.00');
select public.t_eq('total', (select suma_total::text from public.cxp_totales(:'org2'::uuid)), '1053.00');
select public.t_eq('filtrar por tramo 31-60', (select count(*)::text from public.cxp_listar(:'org2'::uuid, p_vencimiento => '31_60')), '2');
select public.t_eq('filtrar por más de 90', (select nombre from public.cxp_listar(:'org2'::uuid, p_vencimiento => 'mas_90')), 'T4');
select public.t_err(format($$select * from public.cxp_listar(%L, p_vencimiento => '99')$$, :'org2'), 'vencimiento no válido');

-- Proveedor: el manual sin NIT con el mismo nombre entra en el total y en la lista del proveedor
\set ju1 '{"fila":2,"tercero":"900111222","nombre":"PROVEEDOR UNO","documento_erp":"U-1","fecha_vcto":"2030-01-10","saldo":1000}'
\set ja1 '{"fila":3,"tercero":"111111111","nombre":"AUSENTE UNO","documento_erp":"A-1","fecha_vcto":"2030-01-10","saldo":10}'
\set ja2 '{"fila":4,"tercero":"222222222","nombre":"AUSENTE DOS","documento_erp":"A-2","fecha_vcto":"2030-01-10","saldo":20}'
select public.cxp_importar_confirmar(:'org2'::uuid, ('[' || :'ju1' || ',' || :'ja1' || ',' || :'ja2' || ']')::jsonb, 'b1.xlsx', 'b1');
select public.cxp_manual_crear(:'org2'::uuid, jsonb_build_object('nombre','proveedor uno','fecha_vcto',(:'hoy'::date + 3)::text,'total_factura',10));
select public.t_eq('total del proveedor incluye el manual sin NIT', (select suma_total::text from public.cxp_totales(:'org2'::uuid, 'pendiente', null, '900111222')), '1010.00');
select public.t_eq('el proveedor aparece una sola vez en el filtro', (select count(*)::text from public.cxp_proveedores_filtro(:'org2'::uuid) where tercero = '900111222'), '1');
select public.t_eq('con sus 2 documentos', (select documentos::text from public.cxp_proveedores_filtro(:'org2'::uuid) where tercero = '900111222'), '2');
select public.t_eq('sin entrada duplicada por nombre', (select count(*)::text from public.cxp_proveedores_filtro(:'org2'::uuid) where tercero is null and lower(nombre) = 'proveedor uno'), '0');

-- Última carga y "no vino en la última carga"
select public.t_eq('última carga: nada ausente', (select ausentes::text from public.cxp_ultima_carga(:'org2'::uuid)), '0');
select public.cxp_importar_previsualizar(:'org2'::uuid, ('[' || :'ju1' || ',' || :'ja1' || ']')::jsonb, 'b2') as pv \gset
select public.t_eq('vista previa: 1 ausente', (:'pv'::jsonb)->>'ausentes', '1');
select public.cxp_importar_confirmar(:'org2'::uuid, ('[' || :'ju1' || ',' || :'ja1' || ']')::jsonb, 'b2.xlsx', 'b2');
select public.t_eq('última carga: archivo', (select archivo from public.cxp_ultima_carga(:'org2'::uuid)), 'b2.xlsx');
select public.t_eq('última carga: 1 ausente', (select ausentes::text from public.cxp_ultima_carga(:'org2'::uuid)), '1');
select public.t_eq('filtro "no vinieron": el documento', (select documento_erp from public.cxp_listar(:'org2'::uuid, p_origen => 'ausente')), 'A-2');
select public.t_eq('marcado como ausente', (select ausente::text from public.cxp_listar(:'org2'::uuid, p_busqueda => 'a-2')), 'true');
select public.t_eq('los manuales no son "ausentes"', (select count(*)::text from public.cxp_listar(:'org2'::uuid, p_origen => 'ausente') where origen = 'manual'), '0');
select public.cxp_importar_confirmar(:'org2'::uuid, ('[' || :'ju1' || ',' || :'ja1' || ',' || :'ja2' || ']')::jsonb, 'b3.xlsx', 'b3');
select public.t_eq('al volver a venir ya no es ausente', (select count(*)::text from public.cxp_listar(:'org2'::uuid, p_origen => 'ausente')), '0');
select public.t_eq('visto en la carga no llena el historial', (select count(*)::text from public.auditoria where tabla='cxp_documentos' and accion='update' and registro = (select id::text from public.cxp_documentos where documento_erp='U-1')), '0');
reset role;
\echo CXP_FASE3_OK
