\set ON_ERROR_STOP 1
-- Pruebas de CXP: correcciones manuales de fechas al cargar el ERP (marca, conservación y reemplazo por el ERP).
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
select public.crear_organizacion('Cxp Fechas','CXP-3333') as slug \gset
reset role;
select id as org from public.organizaciones where slug=:'slug' \gset
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);

-- Archivo del ERP (2 documentos). R1 corregido a mano: vencimiento 2026-05-10 -> 2026-05-20
\set erp '[{"fila":2,"tercero":"900111222","nombre":"PROVEEDOR UNO","documento_erp":"FG-1","fecha_dcto":"2026-04-10","fecha_vcto":"2026-05-10","saldo":1000},{"fila":3,"tercero":"900111222","nombre":"PROVEEDOR UNO","documento_erp":"FG-2","fecha_dcto":"2026-04-10","fecha_vcto":"2026-05-10","saldo":2000}]'
\set corr '[{"fila":2,"tercero":"900111222","nombre":"PROVEEDOR UNO","documento_erp":"FG-1","fecha_dcto":"2026-04-10","fecha_vcto":"2026-05-20","fecha_vcto_erp":"2026-05-10","saldo":1000},{"fila":3,"tercero":"900111222","nombre":"PROVEEDOR UNO","documento_erp":"FG-2","fecha_dcto":"2026-04-10","fecha_vcto":"2026-05-10","saldo":2000}]'

select public.t_eq('vista previa con corrección: 2 nuevos', (public.cxp_importar_previsualizar(:'org'::uuid, :'corr'::jsonb))->>'nuevos', '2');
select public.cxp_importar_confirmar(:'org'::uuid, :'corr'::jsonb, 'a.xlsx', 'h1') as r1 \gset
select public.t_eq('carga: 2 nuevos', (:'r1'::jsonb)->>'nuevos', '2');
select public.t_eq('la fecha corregida se guarda', (select fecha_vcto::text from public.cxp_documentos where documento_erp='FG-1'), '2026-05-20');
select public.t_eq('queda marcada como corregida', (select vcto_corregido::text from public.cxp_documentos where documento_erp='FG-1'), 'true');
select public.t_eq('guarda el valor original del ERP', (select vcto_erp::text from public.cxp_documentos where documento_erp='FG-1'), '2026-05-10');
select public.t_eq('el plazo sigue la fecha corregida', (select plazo::text from public.cxp_documentos where documento_erp='FG-1'), '40');
select public.t_eq('la fecha del documento no se marcó', (select dcto_corregido::text from public.cxp_documentos where documento_erp='FG-1'), 'false');
select public.t_eq('guarda quién corrigió', (select (corregido_por = '00000000-0000-0000-0000-0000000000a1')::text from public.cxp_documentos where documento_erp='FG-1'), 'true');
select public.t_eq('la otra fila no queda marcada', (select vcto_corregido::text from public.cxp_documentos where documento_erp='FG-2'), 'false');
select public.t_eq('la otra fila no guarda original', (select (vcto_erp is null)::text from public.cxp_documentos where documento_erp='FG-2'), 'true');
select public.t_eq('cxp_listar devuelve la marca', (select vcto_corregido::text from public.cxp_listar(:'org'::uuid) where documento_erp='FG-1'), 'true');
select public.t_eq('cxp_listar devuelve el original', (select vcto_erp::text from public.cxp_listar(:'org'::uuid) where documento_erp='FG-1'), '2026-05-10');
select public.t_eq('cxp_listar: la otra sin marca', (select vcto_corregido::text from public.cxp_listar(:'org'::uuid) where documento_erp='FG-2'), 'false');

-- Cargar de nuevo el archivo ORIGINAL del ERP (sin la corrección): la corrección se conserva y no cuenta como cambio
select public.t_eq('vista previa: nada cambia', (public.cxp_importar_previsualizar(:'org'::uuid, :'erp'::jsonb))->>'actualizados', '0');
select public.cxp_importar_confirmar(:'org'::uuid, :'erp'::jsonb, 'b.xlsx', 'h2') as r2 \gset
select public.t_eq('recarga: 0 actualizados', (:'r2'::jsonb)->>'actualizados', '0');
select public.t_eq('recarga: la corrección sigue', (select fecha_vcto::text from public.cxp_documentos where documento_erp='FG-1'), '2026-05-20');
select public.t_eq('recarga: sigue marcada', (select vcto_corregido::text from public.cxp_documentos where documento_erp='FG-1'), 'true');

-- El ERP cambia ese dato: manda el ERP y se quita la marca
select public.cxp_importar_confirmar(:'org'::uuid, replace(:'erp', '"fecha_vcto":"2026-05-10","saldo":1000', '"fecha_vcto":"2026-06-01","saldo":1000')::jsonb, 'c.xlsx', 'h3') as r3 \gset
select public.t_eq('el ERP cambió: se actualiza 1', (:'r3'::jsonb)->>'actualizados', '1');
select public.t_eq('manda la fecha del ERP', (select fecha_vcto::text from public.cxp_documentos where documento_erp='FG-1'), '2026-06-01');
select public.t_eq('se quita la marca', (select vcto_corregido::text from public.cxp_documentos where documento_erp='FG-1'), 'false');
select public.t_eq('se borra el original', (select (vcto_erp is null)::text from public.cxp_documentos where documento_erp='FG-1'), 'true');

-- Corregir la fecha del documento
select public.cxp_importar_confirmar(:'org'::uuid,
  replace(:'erp', '"documento_erp":"FG-2","fecha_dcto":"2026-04-10"', '"documento_erp":"FG-2","fecha_dcto":"2026-04-12","fecha_dcto_erp":"2026-04-10"')::jsonb, 'd.xlsx', 'h4') as r4 \gset
select public.t_eq('fecha del documento corregida', (select fecha_dcto::text from public.cxp_documentos where documento_erp='FG-2'), '2026-04-12');
select public.t_eq('fecha del documento marcada', (select dcto_corregido::text from public.cxp_documentos where documento_erp='FG-2'), 'true');
select public.t_eq('original de la fecha del documento', (select dcto_erp::text from public.cxp_documentos where documento_erp='FG-2'), '2026-04-10');

-- Validación: el vencimiento corregido no puede quedar antes del documento
select public.t_err(format($$select public.cxp_importar_previsualizar(%L, %L::jsonb)$$, :'org',
  '[{"fila":9,"tercero":"900111222","nombre":"X","documento_erp":"FG-9","fecha_dcto":"2026-04-10","fecha_vcto":"2026-04-01","fecha_vcto_erp":"2026-05-01","saldo":5}]'),
  'corregido no puede ser anterior');
reset role;
\echo CXP_FECHAS_OK
