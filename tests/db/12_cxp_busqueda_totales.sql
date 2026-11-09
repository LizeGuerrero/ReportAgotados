\set ON_ERROR_STOP 1
-- Pruebas de CXP: búsqueda que ORDENA en vez de filtrar y totales por proveedor.
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
select public.crear_organizacion('Cxp Busqueda','CXP-4444') as slug \gset
reset role;
select id as org from public.organizaciones where slug=:'slug' \gset
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);

-- ALFA: 2 documentos por vencer (1000 + 500) · BETA: 1 por vencer (3000) · ZETA: 1 vencido (700)
\set erp '[{"fila":2,"tercero":"900111111","nombre":"ALFA","documento_erp":"A-1","fecha_dcto":"2026-01-01","fecha_vcto":"2099-06-01","saldo":1000},{"fila":3,"tercero":"900111111","nombre":"ALFA","documento_erp":"A-2","fecha_dcto":"2026-01-01","fecha_vcto":"2099-07-01","saldo":500},{"fila":4,"tercero":"900222222","nombre":"BETA","documento_erp":"B-1","fecha_dcto":"2026-01-01","fecha_vcto":"2099-01-01","saldo":3000},{"fila":5,"tercero":"900333333","nombre":"ZETA","documento_erp":"Z-1","fecha_dcto":"2025-12-01","fecha_vcto":"2026-01-10","saldo":700}]'
select public.cxp_importar_confirmar(:'org'::uuid, :'erp'::jsonb, 'a.xlsx', 'h1');

-- Modo filtrar (el de siempre): solo lo que coincide
select public.t_eq('filtrar: solo ALFA', (select string_agg(distinct nombre, ',') from public.cxp_listar(:'org'::uuid, 'pendiente', 'alfa')), 'ALFA');
select public.t_eq('filtrar: 2 filas', (select count(*)::text from public.cxp_listar(:'org'::uuid, 'pendiente', 'alfa')), '2');

-- Modo ordenar: no se oculta nada; lo que coincide va arriba, luego lo vencido, luego el resto por vencimiento
select public.t_eq('ordenar: no oculta nada', (select count(*)::text from public.cxp_listar(:'org'::uuid, 'pendiente', 'alfa', null, null, null, null, null, null, 'asc', 50, 0, 'ordenar', 'vencidos')), '4');
select public.t_eq('ordenar/vencidos: orden',
  (select string_agg(documento_erp, ',' order by ord) from (select documento_erp, row_number() over () as ord from public.cxp_listar(:'org'::uuid, 'pendiente', 'alfa', null, null, null, null, null, null, 'asc', 50, 0, 'ordenar', 'vencidos')) x),
  'A-1,A-2,Z-1,B-1');
select public.t_eq('ordenar: marca coincidencias',
  (select string_agg(coincide::text, ',') from public.cxp_listar(:'org'::uuid, 'pendiente', 'alfa', null, null, null, null, null, null, 'asc', 50, 0, 'ordenar', 'vencidos')),
  'true,true,false,false');
select public.t_eq('ordenar/nombre: orden',
  (select string_agg(nombre, ',') from public.cxp_listar(:'org'::uuid, 'pendiente', 'alfa', null, null, null, null, null, null, 'asc', 50, 0, 'ordenar', 'nombre')),
  'ALFA,ALFA,BETA,ZETA');
select public.t_eq('ordenar/vencimiento: orden',
  (select string_agg(documento_erp, ',') from public.cxp_listar(:'org'::uuid, 'pendiente', 'alfa', null, null, null, null, null, null, 'asc', 50, 0, 'ordenar', 'vencimiento')),
  'A-1,A-2,Z-1,B-1');
select public.t_eq('ordenar sin texto = orden normal (por vencimiento)',
  (select string_agg(documento_erp, ',') from public.cxp_listar(:'org'::uuid, 'pendiente', null, null, null, null, null, null, null, 'asc', 50, 0, 'ordenar', 'nombre')),
  'Z-1,B-1,A-1,A-2');
select public.t_eq('sin texto nada coincide', (select bool_or(coincide)::text from public.cxp_listar(:'org'::uuid, 'pendiente', null, null, null, null, null, null, null, 'asc', 50, 0, 'ordenar', 'vencidos')), 'false');
select public.t_eq('el total de filas es el de todas', (select max(total)::text from public.cxp_listar(:'org'::uuid, 'pendiente', 'alfa', null, null, null, null, null, null, 'asc', 50, 0, 'ordenar', 'vencidos')), '4');
select public.t_err(format($$select * from public.cxp_listar(%L, 'pendiente', 'a', null, null, null, null, null, null, 'asc', 50, 0, 'otro', 'vencidos')$$, :'org'), 'Modo de búsqueda');
select public.t_err(format($$select * from public.cxp_listar(%L, 'pendiente', 'a', null, null, null, null, null, null, 'asc', 50, 0, 'ordenar', 'otro')$$, :'org'), 'Orden del resto');

-- Totales por proveedor
select public.t_eq('totales: 3 proveedores', (select count(*)::text from public.cxp_totales_proveedor(:'org'::uuid)), '3');
select public.t_eq('totales: orden por total', (select string_agg(nombre, ',') from public.cxp_totales_proveedor(:'org'::uuid)), 'BETA,ALFA,ZETA');
select public.t_eq('totales: suma de ALFA', (select total::text from public.cxp_totales_proveedor(:'org'::uuid) where nombre='ALFA'), '1500.00');
select public.t_eq('totales: documentos de ALFA', (select documentos::text from public.cxp_totales_proveedor(:'org'::uuid) where nombre='ALFA'), '2');
select public.t_eq('totales: vencido de ZETA', (select vencido::text from public.cxp_totales_proveedor(:'org'::uuid) where nombre='ZETA'), '700.00');
select public.t_eq('totales: nada vencido en ALFA', (select vencido::text from public.cxp_totales_proveedor(:'org'::uuid) where nombre='ALFA'), '0');
select public.t_eq('totales respetan la búsqueda', (select count(*)::text from public.cxp_totales_proveedor(:'org'::uuid, 'pendiente', 'alfa')), '1');
reset role;
\echo CXP_BUSQUEDA_OK
