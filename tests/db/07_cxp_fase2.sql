\set ON_ERROR_STOP 1
-- Pruebas de CXP Fase 2: reglas de exclusión, carga del ERP (idempotente), pagados y equivalencia C.O.-sede.
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
select public.crear_organizacion('Cxp Dos','CXP-2222') as slug \gset
reset role;
select id as org from public.organizaciones where slug=:'slug' \gset
select id as r_com from public.roles where organizacion_id=:'org'::uuid and nombre='Comercial' \gset
select id as sede from public.sedes where organizacion_id=:'org'::uuid limit 1 \gset

select public.t_eq('el admin recibe los 4 módulos de CXP',
  (select count(*)::text from public.permisos_rol pr
     join public.roles r on r.id = pr.rol_id join public.modulos mo on mo.id = pr.modulo_id
    where r.organizacion_id = :'org'::uuid and r.nombre = 'admin'
      and mo.nombre in ('cxp','cxp_pagos','cxp_importar','cxp_reglas')), '4');

set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false); select public.solicitar_union('CXP-2222');
reset role;
select id as mid_b from public.membresias where usuario_id='00000000-0000-0000-0000-0000000000b2' and organizacion_id=:'org'::uuid \gset
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.resolver_solicitud(:'mid_b'::uuid, true, :'r_com'::uuid, :'sede'::uuid);

-- Reglas -------------------------------------------------------------------------------------------
select public.cxp_regla_guardar(:'org'::uuid, null, '{"tipo":"documento","tercero":"900.111.222-3","documento_erp":"FG-2","contexto":"cruzar","nota":"ya pagada"}'::jsonb) as rg_doc \gset
select public.cxp_regla_guardar(:'org'::uuid, null, '{"tipo":"patron","tercero":"800333444","detalle":"conciliacion medios","contexto":"DE EQUIPO CONTAB"}'::jsonb) as rg_pat \gset
select public.t_eq('el contexto se guarda en mayúsculas', (select contexto from public.cxp_reglas where id=:'rg_doc'::uuid), 'CRUZAR');
select public.t_eq('el NIT de la regla se normaliza', (select tercero from public.cxp_reglas where id=:'rg_doc'::uuid), '900111222');
select public.t_err(format($$select public.cxp_regla_guardar(%L, null, '{"tipo":"documento","tercero":"900111222","documento_erp":"fg-2","contexto":"x"}')$$, :'org'), 'Ya existe una regla igual');
select public.t_err(format($$select public.cxp_regla_guardar(%L, null, '{"tipo":"otro","tercero":"900111222","contexto":"x"}')$$, :'org'), 'Tipo de regla');
select public.t_err(format($$select public.cxp_regla_guardar(%L, null, '{"tipo":"patron","tercero":"900111222","contexto":"x"}')$$, :'org'), 'detalle exacto');
select public.t_err(format($$select public.cxp_regla_guardar(%L, null, '{"tipo":"documento","documento_erp":"A","contexto":"x"}')$$, :'org'), 'NIT del tercero');
select public.t_err(format($$select public.cxp_regla_guardar(%L, null, '{"tipo":"documento","tercero":"900111222","documento_erp":"A"}')$$, :'org'), 'contexto');
select public.t_eq('listar reglas', (select count(*)::text from public.cxp_reglas_listar(:'org'::uuid)), '2');
select public.t_eq('buscar reglas', (select count(*)::text from public.cxp_reglas_listar(:'org'::uuid, 'CONCILIACION')), '1');

-- Carga: validaciones -------------------------------------------------------------------------------
select public.t_err(format($$select public.cxp_importar_previsualizar(%L, '[]'::jsonb)$$, :'org'), 'no trae filas');
select public.t_err(format($$select public.cxp_importar_previsualizar(%L, '[{"fila":7,"tercero":"123456","nombre":"X","saldo":5,"fecha_vcto":"2026-01-01"}]'::jsonb)$$, :'org'), 'Fila 7: falta el número de documento');
select public.t_err(format($$select public.cxp_importar_previsualizar(%L, '[{"fila":8,"tercero":"12","documento_erp":"A","nombre":"X","saldo":5,"fecha_vcto":"2026-01-01"}]'::jsonb)$$, :'org'), 'Fila 8');
select public.t_err(format($$select public.cxp_importar_previsualizar(%L, '[{"tercero":"123456","documento_erp":"A","nombre":"X","saldo":5,"fecha_vcto":"2026-01-01"},{"tercero":"123456","documento_erp":"a","nombre":"X","saldo":5,"fecha_vcto":"2026-01-01"}]'::jsonb)$$, :'org'), 'repetido en el archivo');

-- Carga: archivo de 4 filas (A y B del mismo tercero; B tiene regla; C cae en la regla por detalle)
\set filas '[{"fila":2,"empresa":"IG","tercero":"900111222","nombre":"PROVEEDOR UNO","co_codigo":"001","co_nombre":"IMPORGAS NORTE","cond_pago":"02 CREDITO A 8 DIAS","docto_proveedor":"FE-1","documento_erp":"FG-1","fecha_dcto":"2026-04-10","fecha_vcto":"2026-04-05","plazo":5,"saldo":100000,"detalle":"COMPRA X","raw":{"CUENTA":23359501}},{"fila":3,"empresa":"IG","tercero":"900111222","nombre":"PROVEEDOR UNO","co_codigo":"001","co_nombre":"IMPORGAS NORTE","documento_erp":"FG-2","fecha_dcto":"2026-04-10","fecha_vcto":"2026-05-10","saldo":50000,"detalle":"SALDOS INICIALES"},{"fila":4,"empresa":"IG","tercero":"800333444","nombre":"PROVEEDOR DOS","co_codigo":"002","co_nombre":"IMPORGAS SUR","documento_erp":"BC-1","fecha_dcto":"2026-04-10","fecha_vcto":"2026-04-10","saldo":700,"detalle":"CONCILIACION MEDIOS"},{"fila":5,"empresa":"IG","tercero":"700555666","nombre":"PROVEEDOR TRES","co_codigo":"002","co_nombre":"IMPORGAS SUR","documento_erp":"FG-3","fecha_dcto":"2026-04-10","fecha_vcto":"2026-05-20","saldo":30000,"detalle":"OTRO"}]'
select public.cxp_importar_previsualizar(:'org'::uuid, :'filas'::jsonb, 'h1') as previa \gset
select public.t_eq('vista previa: 4 nuevos', (:'previa'::jsonb)->>'nuevos', '4');
select public.t_eq('vista previa: 2 quedarán excluidos', (:'previa'::jsonb)->>'nuevos_excluidos', '2');
select public.t_eq('vista previa: C.O. sin sede', (:'previa'::jsonb)->'cos'->0->>'sede_id', null);
select public.t_eq('vista previa: archivo no repetido', (:'previa'::jsonb)->>'repetido', null);
select public.t_eq('la vista previa no escribe nada', (select count(*)::text from public.cxp_documentos), '0');

select public.cxp_importar_confirmar(:'org'::uuid, :'filas'::jsonb, 'cxp.xlsx', 'h1') as r1 \gset
select public.t_eq('carga: nuevos', (:'r1'::jsonb)->>'nuevos', '4');
select public.t_eq('carga: excluidos', (:'r1'::jsonb)->>'excluidos', '2');
select public.t_eq('cartera: 2 pendientes', (select count(*)::text from public.cxp_listar(:'org'::uuid)), '2');
select public.t_eq('excluidas: 2', (select count(*)::text from public.cxp_listar(:'org'::uuid, 'excluido')), '2');
select public.t_eq('la excluida muestra su contexto', (select contexto from public.cxp_listar(:'org'::uuid, 'excluido', 'fg-2')), 'CRUZAR');
select public.t_eq('la excluida de patrón muestra su tipo', (select regla_tipo from public.cxp_listar(:'org'::uuid, 'excluido', 'bc-1')), 'patron');
select public.t_eq('totales de la cartera no incluyen excluidas', (select suma_total::text from public.cxp_totales(:'org'::uuid)), '130000.00');
select public.t_eq('totales de excluidas', (select suma_total::text from public.cxp_totales(:'org'::uuid, 'excluido')), '50700.00');
select public.t_eq('vencimiento anterior al documento = fecha del documento',
  (select fecha_vcto::text from public.cxp_documentos where documento_erp='FG-1'), '2026-04-10');
select public.t_eq('origen erp', (select origen from public.cxp_listar(:'org'::uuid, 'pendiente', 'fg-1')), 'erp');

select public.t_eq('archivo ya cargado se detecta', ((select public.cxp_importar_previsualizar(:'org'::uuid, :'filas'::jsonb, 'h1')))->'repetido'->>'archivo', 'cxp.xlsx');

-- Anotaciones sobreviven a una nueva carga; cambios de saldo se reflejan
select id as dA from public.cxp_documentos where documento_erp='FG-1' \gset
select public.cxp_actualizar(:'org'::uuid, :'dA'::uuid, '{"anticipos":20000,"detalles":"nota"}'::jsonb);
\set filas2 '[{"fila":2,"empresa":"IG","tercero":"900111222","nombre":"PROVEEDOR UNO","co_codigo":"001","co_nombre":"IMPORGAS NORTE","cond_pago":"02 CREDITO A 8 DIAS","docto_proveedor":"FE-1","documento_erp":"FG-1","fecha_dcto":"2026-04-10","fecha_vcto":"2026-04-05","plazo":5,"saldo":120000,"detalle":"COMPRA X"},{"fila":3,"empresa":"IG","tercero":"900111222","nombre":"PROVEEDOR UNO","co_codigo":"001","documento_erp":"FG-2","fecha_dcto":"2026-04-10","fecha_vcto":"2026-05-10","saldo":50000,"detalle":"SALDOS INICIALES"},{"fila":4,"empresa":"IG","tercero":"800333444","nombre":"PROVEEDOR DOS","co_codigo":"002","documento_erp":"BC-1","fecha_dcto":"2026-04-10","fecha_vcto":"2026-04-10","saldo":700,"detalle":"CONCILIACION MEDIOS"},{"fila":5,"empresa":"IG","tercero":"700555666","nombre":"PROVEEDOR TRES","co_codigo":"002","documento_erp":"FG-3","fecha_dcto":"2026-04-10","fecha_vcto":"2026-05-20","saldo":30000,"detalle":"OTRO"}]'
select public.cxp_importar_confirmar(:'org'::uuid, :'filas2'::jsonb, 'cxp2.xlsx', 'h2') as r2 \gset
select public.t_eq('segunda carga: 1 actualizado', (:'r2'::jsonb)->>'actualizados', '1');
select public.t_eq('segunda carga: 3 sin cambios', (:'r2'::jsonb)->>'sin_cambios', '3');
select public.t_eq('segunda carga: ninguno nuevo', (:'r2'::jsonb)->>'nuevos', '0');
select public.t_eq('el saldo del ERP se actualiza', (select total_factura::text from public.cxp_documentos where id=:'dA'::uuid), '120000.00');
select public.t_eq('el anticipo anotado se conserva', (select anticipos::text from public.cxp_documentos where id=:'dA'::uuid), '20000.00');
select public.t_eq('val_pagar recalculado', (select val_pagar::text from public.cxp_documentos where id=:'dA'::uuid), '100000.00');
select public.cxp_importar_confirmar(:'org'::uuid, :'filas2'::jsonb, 'cxp2.xlsx', 'h2') as r3 \gset
select public.t_eq('tercera carga idéntica: nada cambia', ((:'r3'::jsonb)->>'actualizados') || '/' || ((:'r3'::jsonb)->>'nuevos'), '0/0');
select public.t_eq('no hay documentos duplicados', (select count(*)::text from public.cxp_documentos), '4');

-- Equivalencia C.O. - sede
select public.t_eq('guardar equivalencia corrige lo ya cargado', (select public.cxp_co_sede_guardar(:'org'::uuid, '001', 'IMPORGAS NORTE', :'sede'::uuid))::text, '2');
select public.t_eq('la sede quedó en los documentos del C.O.', (select count(*)::text from public.cxp_documentos where co_codigo='001' and sede_id=:'sede'::uuid), '2');
select public.t_err(format($$select public.cxp_co_sede_guardar(%L, '001', 'x', gen_random_uuid())$$, :'org'), 'sede no pertenece');

-- Pagados no se vuelven a cargar; una excluida no se puede pagar
select public.cxp_marcar_pagado(:'org'::uuid, array[:'dA'::uuid]);
select id as dB from public.cxp_documentos where documento_erp='FG-2' \gset
select public.t_err(format($$select public.cxp_marcar_pagado(%L, array[%L::uuid])$$, :'org', :'dB'), 'excluido');
select public.cxp_importar_previsualizar(:'org'::uuid, replace(:'filas2', '"saldo":120000', '"saldo":90000')::jsonb, 'h3') as previa2 \gset
select public.t_eq('pagado: se omite', (:'previa2'::jsonb)->>'pagados_omitidos', '1');
select public.t_eq('pagado con otro saldo: se avisa', jsonb_array_length((:'previa2'::jsonb)->'pagados_saldo_distinto')::text, '1');
select public.cxp_importar_confirmar(:'org'::uuid, replace(:'filas2', '"saldo":120000', '"saldo":90000')::jsonb, 'cxp3.xlsx', 'h3') as r4 \gset
select public.t_eq('pagado: la carga no lo toca', (select total_factura::text from public.cxp_documentos where id=:'dA'::uuid), '120000.00');
select public.t_eq('pagado: sigue pagado', (select estado from public.cxp_documentos where id=:'dA'::uuid), 'pagado');
select public.t_eq('cartera sin el pagado', (select count(*)::text from public.cxp_listar(:'org'::uuid)), '1');

-- Documentos que no vienen en el archivo: se avisan, no se tocan
select public.t_eq('ausentes: las excluidas por regla no cuentan',
  ((select public.cxp_importar_previsualizar(:'org'::uuid, '[{"tercero":"700555666","nombre":"P3","documento_erp":"FG-3","fecha_vcto":"2026-05-20","saldo":30000,"detalle":"OTRO"}]'::jsonb)))->>'ausentes', '0');

-- Quitar o desactivar reglas devuelve los documentos a la cartera
select public.cxp_regla_eliminar(:'org'::uuid, :'rg_doc'::uuid);
select public.t_eq('regla eliminada: vuelve a la cartera', (select count(*)::text from public.cxp_listar(:'org'::uuid)), '2');
select public.cxp_regla_guardar(:'org'::uuid, :'rg_pat'::uuid, '{"activa":false}'::jsonb);
select public.t_eq('regla desactivada: vuelve a la cartera', (select count(*)::text from public.cxp_listar(:'org'::uuid)), '3');
select public.t_eq('sin excluidas', (select count(*)::text from public.cxp_listar(:'org'::uuid, 'excluido')), '0');
select public.cxp_regla_guardar(:'org'::uuid, :'rg_pat'::uuid, '{"activa":true}'::jsonb);
select public.t_eq('regla reactivada: se excluye otra vez', (select count(*)::text from public.cxp_listar(:'org'::uuid, 'excluido')), '1');

select public.t_eq('historial de cargas', (select count(*)::text from public.cxp_importaciones_listar(:'org'::uuid)), '4');

-- Seguridad: B (Comercial, sin permisos de CXP) no puede nada
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false);
select public.t_err(format($$select * from public.cxp_reglas_listar(%L)$$, :'org'), 'Sin permiso');
select public.t_err(format($$select public.cxp_regla_guardar(%L, null, '{"tipo":"documento","tercero":"900111222","documento_erp":"Z","contexto":"x"}')$$, :'org'), 'Sin permiso');
select public.t_err(format($$select public.cxp_regla_eliminar(%L, %L)$$, :'org', :'rg_pat'), 'Sin permiso');
select public.t_err(format($$select public.cxp_importar_previsualizar(%L, %L::jsonb)$$, :'org', :'filas2'), 'Sin permiso');
select public.t_err(format($$select public.cxp_importar_confirmar(%L, %L::jsonb)$$, :'org', :'filas2'), 'Sin permiso');
select public.t_err(format($$select * from public.cxp_importaciones_listar(%L)$$, :'org'), 'Sin permiso');
select public.t_err(format($$select public.cxp_co_sede_guardar(%L, '001', 'x', null)$$, :'org'), 'Sin permiso');
select public.t_err(format($$select * from public.cxp_listar(%L, 'excluido')$$, :'org'), 'Sin permiso');
select public.t_eq('lectura directa de reglas: sin filas', (select count(*)::text from public.cxp_reglas), '0');
select public.t_eq('lectura directa de cargas: sin filas', (select count(*)::text from public.cxp_importaciones), '0');
select public.t_err($$insert into public.cxp_reglas (organizacion_id, tipo, tercero, documento_erp, contexto) values (gen_random_uuid(),'documento','1','a','x')$$, 'permission denied');
select public.t_err($$delete from public.cxp_co_sede$$, 'permission denied');

-- Otra organización no puede tocar las reglas de ésta
reset role;
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000c3',false);
select public.crear_organizacion('Otra Dos','OTRA-3333') as slug2 \gset
reset role;
select id as org2 from public.organizaciones where slug=:'slug2' \gset
set role authenticated;
select public.t_err(format($$select public.cxp_regla_eliminar(%L, %L)$$, :'org2', :'rg_pat'), 'Regla no encontrada');
select public.t_err(format($$select public.cxp_regla_guardar(%L, %L, '{"nota":"x"}')$$, :'org2', :'rg_pat'), 'Regla no encontrada');
select public.t_eq('la otra organización no ve reglas ajenas', (select count(*)::text from public.cxp_reglas_listar(:'org2'::uuid)), '0');
reset role;
\echo CXP_FASE2_OK
