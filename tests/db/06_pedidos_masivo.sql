\set ON_ERROR_STOP 1
create or replace function public.t_err(p_sql text, p_like text) returns void language plpgsql as $$
begin
  begin execute p_sql; exception when others then
    if sqlerrm ilike '%'||p_like||'%' then return; end if;
    raise exception 'ERROR DISTINTO al esperado [%]: %', p_like, sqlerrm;
  end;
  raise exception 'DEBIO FALLAR [%]: %', p_like, p_sql;
end $$;
create or replace function public.t_eq(p_label text, p_got text, p_exp text) returns void language plpgsql as $$
begin if p_got is distinct from p_exp then raise exception 'FALLO % -> obtenido=% esperado=%', p_label, p_got, p_exp; end if; raise notice 'ok  %', p_label; end $$;
create or replace function public.t_eq(p_label text, p_got boolean, p_exp boolean) returns void language plpgsql as $$
begin if p_got is distinct from p_exp then raise exception 'FALLO % -> obtenido=% esperado=%', p_label, p_got, p_exp; end if; raise notice 'ok  %', p_label; end $$;
create or replace function public.t_eq(p_label text, p_got bigint, p_exp bigint) returns void language plpgsql as $$
begin if p_got is distinct from p_exp then raise exception 'FALLO % -> obtenido=% esperado=%', p_label, p_got, p_exp; end if; raise notice 'ok  %', p_label; end $$;

-- ===== Organización y usuarios
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.crear_organizacion('Org Pedidos', '900111222-3') as slug \gset
select id as org from public.organizaciones where slug = :'slug' \gset
select id as sede from public.sedes where organizacion_id = :'org'::uuid \gset
reset role;

-- módulos y permisos nuevos, sin duplicados
select public.t_eq('pedidos_ganador existe una vez', (select count(*) from public.modulos where nombre='pedidos_ganador'), 1::bigint);
select public.t_eq('mensajes existe una vez', (select count(*) from public.modulos where nombre='mensajes'), 1::bigint);
select public.t_eq('admin tiene mensajes', (select count(*) from public.permisos_rol p join public.roles r on r.id=p.rol_id join public.modulos m on m.id=p.modulo_id where r.nombre='admin' and r.organizacion_id=:'org'::uuid and m.nombre='mensajes' and p.puede_editar), 1::bigint);
select public.t_eq('Compras tiene pedidos_ganador', (select count(*) from public.permisos_rol p join public.roles r on r.id=p.rol_id join public.modulos m on m.id=p.modulo_id where r.nombre='Compras' and r.organizacion_id=:'org'::uuid and m.nombre='pedidos_ganador' and p.puede_editar and p.puede_crear), 1::bigint);
select public.t_eq('Compras NO tiene mensajes', (select count(*) from public.permisos_rol p join public.roles r on r.id=p.rol_id join public.modulos m on m.id=p.modulo_id where r.nombre='Compras' and r.organizacion_id=:'org'::uuid and m.nombre='mensajes'), 0::bigint);

-- B = Compras; C = rol "Cotizador" (pedidos sí, pedidos_ganador y Proveedores no); D = Comercial
select r.id as r_compras from public.roles r where r.nombre='Compras' and r.organizacion_id=:'org'::uuid \gset
select r.id as r_comercial from public.roles r where r.nombre='Comercial' and r.organizacion_id=:'org'::uuid \gset
insert into public.roles(nombre, organizacion_id) values ('Cotizador', :'org'::uuid) returning id as r_cot \gset
insert into public.permisos_rol(rol_id, modulo_id, puede_ver, puede_crear, puede_editar, puede_eliminar)
  select :'r_cot'::uuid, m.id, true, true, true, false from public.modulos m where m.nombre = 'pedidos';
insert into public.membresias(usuario_id, organizacion_id, rol_id, estado_membresia, activo, sede_id) values
 ('00000000-0000-0000-0000-0000000000b2', :'org'::uuid, :'r_compras'::uuid, 'activa', true, :'sede'::uuid),
 ('00000000-0000-0000-0000-0000000000c3', :'org'::uuid, :'r_cot'::uuid, 'activa', true, :'sede'::uuid),
 ('00000000-0000-0000-0000-0000000000d4', :'org'::uuid, :'r_comercial'::uuid, 'activa', true, :'sede'::uuid);

-- ===== Catálogo (lo crea el admin A)
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.item_crear(:'org'::uuid, '{"codigo_erp":"A-1001","nombre_base":"Tubo laton","linea":"Laton","unidad_medida":"und"}'::jsonb) as i1 \gset
select public.item_crear(:'org'::uuid, '{"codigo_erp":"A-1002","nombre_base":"Codo laton","linea":"Laton","unidad_medida":"und"}'::jsonb) as i2 \gset
select public.item_crear(:'org'::uuid, '{"codigo_erp":"A-1003","nombre_base":"Union laton","linea":"Laton","unidad_medida":"und"}'::jsonb) as i3 \gset
select public.proveedor_crear(:'org'::uuid, '{"numero_documento":"900100100","nombre":"Prov Uno"}'::jsonb) as p1 \gset
select public.proveedor_crear(:'org'::uuid, '{"numero_documento":"900200200","nombre":"Prov Dos"}'::jsonb) as p2 \gset
select public.proveedor_crear(:'org'::uuid, '{"numero_documento":"900300300","nombre":"Prov Tres"}'::jsonb) as p3 \gset
select (public.item_proveedor_guardar(:'org'::uuid, null, :'i1'::bigint, :'p1'::bigint,
  '{"codigo_proveedor":"TL-12","nombre_producto_proveedor":"Tubo 1/2 pulgada","unidades_por_caja":10}'::jsonb, true)->>'guardado') as ok_ip \gset
select public.t_eq('vínculo ítem-proveedor creado', :'ok_ip', 'true');

-- ===== Solicitudes masivas (B, Compras): 2 ítems x 2 proveedores; p2 aún no está vinculado
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false);
select public.solicitudes_crear_multi(:'org'::uuid, jsonb_build_array(
  jsonb_build_object('item_id', :'i1'::bigint, 'cantidad', 40, 'proveedores', jsonb_build_array(:'p1'::bigint, :'p2'::bigint)),
  jsonb_build_object('item_id', :'i2'::bigint, 'cantidad', 200, 'proveedores', jsonb_build_array(:'p1'::bigint, :'p2'::bigint)))) as res \gset
select public.t_eq('se crean 2 solicitudes (una por proveedor)', (jsonb_array_length((:'res'::jsonb)->'creadas'))::bigint, 2::bigint);
select (((:'res'::jsonb)->'creadas'->0)->>'solicitud_id') as sc1 \gset
reset role;
select cp.id as cp11 from public.cotizacion_precios cp join public.solicitud_items si on si.id=cp.solicitud_item_id where si.item_id=:'i1'::bigint and cp.proveedor_id=:'p1'::bigint \gset
select cp.id as cp12 from public.cotizacion_precios cp join public.solicitud_items si on si.id=cp.solicitud_item_id where si.item_id=:'i1'::bigint and cp.proveedor_id=:'p2'::bigint \gset
select cp.id as cp21 from public.cotizacion_precios cp join public.solicitud_items si on si.id=cp.solicitud_item_id where si.item_id=:'i2'::bigint and cp.proveedor_id=:'p1'::bigint \gset
select cp.id as cp22 from public.cotizacion_precios cp join public.solicitud_items si on si.id=cp.solicitud_item_id where si.item_id=:'i2'::bigint and cp.proveedor_id=:'p2'::bigint \gset

-- ===== Mensajes: la solicitud al proveedor NO lleva datos internos
set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false);
select public.solicitud_texto(:'org'::uuid, :'sc1'::uuid) as t_prov \gset
select public.solicitud_texto(:'org'::uuid, :'sc1'::uuid, true) as t_int \gset
select public.t_eq('proveedor: sin código interno', position('A-100' in :'t_prov') = 0, true);
select public.t_eq('proveedor: sin línea interna', position('Línea' in :'t_prov') = 0 and position('Agotado en' in :'t_prov') = 0, true);
select public.t_eq('proveedor: usa su nombre y su referencia', position('Tubo 1/2 pulgada' in :'t_prov') > 0 and position('TL-12' in :'t_prov') > 0, true);
select public.t_eq('proveedor: sin nombre interno cuando tiene el suyo', position('Tubo laton' in :'t_prov') = 0, true);
select public.t_eq('copia interna: sí trae el código', position('A-1001' in :'t_int') > 0, true);

-- B (Compras) no tiene el módulo mensajes
select public.t_err(format($$select public.mensaje_config_obtener(%L,'solicitud_cotizacion')$$, :'org'), 'Sin permiso');
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.t_eq('config de fábrica: no personalizada', (public.mensaje_config_obtener(:'org'::uuid,'orden_compra')->>'personalizada'), 'false');
select public.t_err(format($$select public.mensaje_config_guardar(%L,'solicitud_cotizacion','{"campos":[{"clave":"linea","destino":"proveedor"}]}'::jsonb)$$, :'org'), 'uso interno');
select public.t_err(format($$select public.mensaje_config_guardar(%L,'otro','{}'::jsonb)$$, :'org'), 'Tipo de mensaje no válido');
-- el admin decide mostrar el código interno al proveedor
select public.mensaje_config_guardar(:'org'::uuid, 'solicitud_cotizacion',
  '{"encabezado":"COTIZAR {numero} - {proveedor}","campos":[{"clave":"codigo_erp","destino":"proveedor","visible":true,"etiqueta":"Cod"}]}'::jsonb);
select public.t_eq('config personalizada', (public.mensaje_config_obtener(:'org'::uuid,'solicitud_cotizacion')->>'personalizada'), 'true');
select public.solicitud_texto(:'org'::uuid, :'sc1'::uuid) as t_prov2 \gset
select public.t_eq('ahora el proveedor ve el código y el título nuevo', position('Cod: A-1001' in :'t_prov2') > 0 and position('COTIZAR SC-' in :'t_prov2') > 0, true);
select public.t_eq('vista previa con borrador no guardado', position('Ref: ' in public.mensaje_vista_previa(:'org'::uuid,'orden_compra','{"campos":[{"clave":"referencia","etiqueta":"Referencia"}]}'::jsonb)) = 0
  and position('Referencia: TL-12' in public.mensaje_vista_previa(:'org'::uuid,'orden_compra','{"campos":[{"clave":"referencia","etiqueta":"Referencia"}]}'::jsonb)) > 0, true);
select public.mensaje_config_restablecer(:'org'::uuid, 'solicitud_cotizacion');
select public.t_eq('restablecida', (public.mensaje_config_obtener(:'org'::uuid,'solicitud_cotizacion')->>'personalizada'), 'false');

-- ===== Permisos: C (Cotizador) cotiza pero no elige ni crea proveedores
select set_config('app.uid','00000000-0000-0000-0000-0000000000c3',false);
select public.t_err(format($$select public.cotizacion_elegir_masivo(%L, '[{"item_id":%s}]'::jsonb)$$, :'org', :'i1'), 'Sin permiso');
select public.t_err(format($$select public.cotizacion_elegir(%L, %L)$$, :'org', :'cp11'), 'Sin permiso');
select public.t_err(format($$select public.ordenes_compra_generar_todas(%L)$$, :'org'), 'Sin permiso');
select public.t_err(format($$select public.solicitudes_crear_multi(%L, '[{"item_id":%s,"cantidad":5,"proveedores":[%s]}]'::jsonb)$$, :'org', :'i3', :'p3'), 'permiso de crear en Proveedores');
select public.t_err(format($$select public.cotizacion_agregar_proveedor(%L, %s, null, 'NIT', '800800800', 'Nuevo SAS')$$, :'org', :'i1'), 'Sin permiso');
-- ...pero sí puede registrar costos
select public.cotizacion_guardar(:'org'::uuid, :'cp11'::uuid, true, 100);

-- ===== B registra el resto de costos y elige en bloque
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false);
select public.cotizacion_guardar(:'org'::uuid, :'cp12'::uuid, true, 90);
select public.cotizacion_guardar(:'org'::uuid, :'cp21'::uuid, true, 50);
select public.cotizacion_guardar(:'org'::uuid, :'cp22'::uuid, true, 70);

-- filtros del comparativo en el servidor
select public.t_eq('filtro proveedor p2', (select count(*) from public.matriz_cotizaciones(:'org'::uuid, p_proveedor => :'p2'::bigint)), 2::bigint);
select public.t_eq('sin ganador = 2', (select count(*) from public.matriz_cotizaciones(:'org'::uuid, p_estado => 'sin_ganador')), 2::bigint);
select public.t_err(format($$select * from public.matriz_cotizaciones(%L, p_estado => 'xx')$$, :'org'), 'Filtro de estado no válido');

select public.cotizacion_elegir_masivo(:'org'::uuid, jsonb_build_array(
  jsonb_build_object('item_id', :'i1'::bigint), jsonb_build_object('item_id', :'i2'::bigint),
  jsonb_build_object('item_id', :'i3'::bigint))) as el \gset
select public.t_eq('masivo: 2 procesados', ((:'el'::jsonb)->>'procesados'), '2');
select public.t_eq('masivo: 1 omitido (sin cotización)', (jsonb_array_length((:'el'::jsonb)->'omitidos'))::bigint, 1::bigint);
select public.t_eq('i1 gana Prov Dos (más barato)', (select cp.proveedor_id::text from public.cotizacion_precios cp where cp.id=:'cp12'::uuid and cp.seleccionado), :'p2');
select public.t_eq('i2 gana Prov Uno (más barato)', (select cp.seleccionado from public.cotizacion_precios cp where cp.id=:'cp21'::uuid), true);
select public.t_eq('cantidad a pedir tomada de la solicitud', (select cp.cantidad_pedir::text from public.cotizacion_precios cp where cp.id=:'cp12'::uuid), '40.00');
select public.t_eq('sin ganador = 0 tras elegir', (select count(*) from public.matriz_cotizaciones(:'org'::uuid, p_estado => 'sin_ganador')), 0::bigint);
-- elegir en bloque a un proveedor concreto
select public.cotizacion_elegir_masivo(:'org'::uuid, jsonb_build_array(jsonb_build_object('item_id', :'i1'::bigint, 'proveedor_id', :'p1'::bigint))) as el2 \gset
select public.t_eq('proveedor forzado: p1 gana i1', (select cp.seleccionado from public.cotizacion_precios cp where cp.id=:'cp11'::uuid), true);
select public.cotizacion_elegir_masivo(:'org'::uuid, jsonb_build_array(jsonb_build_object('item_id', :'i1'::bigint)), true);
select public.t_eq('quitar elección en bloque', (select count(*) from public.cotizacion_precios cp where cp.id in (:'cp11'::uuid, :'cp12'::uuid) and cp.seleccionado), 0::bigint);
select public.cotizacion_elegir_masivo(:'org'::uuid, jsonb_build_array(jsonb_build_object('item_id', :'i1'::bigint)));

-- ===== Órdenes: una por proveedor, todas de una vez
select public.t_eq('por generar: 2 proveedores', (select count(*) from public.listar_ordenes_por_generar(:'org'::uuid)), 2::bigint);
select public.ordenes_compra_generar_todas(:'org'::uuid) as gen \gset
select public.t_eq('se generan 2 órdenes', (jsonb_array_length((:'gen'::jsonb)->'generadas'))::bigint, 2::bigint);
select public.t_eq('ninguna falla', (jsonb_array_length((:'gen'::jsonb)->'fallidas'))::bigint, 0::bigint);
select public.t_eq('nada por generar después', (select count(*) from public.listar_ordenes_por_generar(:'org'::uuid)), 0::bigint);
select public.t_eq('segunda llamada no genera nada', (jsonb_array_length((public.ordenes_compra_generar_todas(:'org'::uuid))->'generadas'))::bigint, 0::bigint);
select ((:'gen'::jsonb)->'generadas'->0->>'orden_id') as oc1 \gset
select public.orden_compra_texto(:'org'::uuid, :'oc1'::uuid) as oc_prov \gset
select public.orden_compra_texto(:'org'::uuid, :'oc1'::uuid, true) as oc_int \gset
select public.t_eq('orden al proveedor: sin código interno ni línea', position('A-100' in :'oc_prov') = 0 and position('Línea' in :'oc_prov') = 0, true);
select public.t_eq('orden al proveedor: trae total y costo', position('Total con IVA' in :'oc_prov') > 0 and position('Costo unit.' in :'oc_prov') > 0, true);
select public.t_eq('orden interna: trae el código', position('A-100' in :'oc_int') > 0, true);

-- ===== Agotados: respuesta en bloque
select set_config('app.uid','00000000-0000-0000-0000-0000000000d4',false);
select public.agotado_solicitar(:'org'::uuid, :'i3'::bigint, 5);
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false);
select public.t_err(format($$select public.agotados_responder_masivo(%L, array[%s]::bigint[], 'no_se_pide', null)$$, :'org', :'i3'), 'motivo');
select public.t_eq('responde 1 agotado en bloque', public.agotados_responder_masivo(:'org'::uuid, array[:'i3'::bigint], 'no_se_pide', 'Ya hay stock')::bigint, 1::bigint);
select public.t_eq('no pisa respuestas ya dadas', public.agotados_responder_masivo(:'org'::uuid, array[:'i3'::bigint], 'agotado_proveedor')::bigint, 0::bigint);
select set_config('app.uid','00000000-0000-0000-0000-0000000000d4',false);
select public.t_err(format($$select public.agotados_responder_masivo(%L, array[%s]::bigint[], 'repartir_sedes')$$, :'org', :'i3'), 'Sin permiso');

-- ===== Preselección en la búsqueda
select set_config('app.uid','00000000-0000-0000-0000-0000000000b2',false);
select public.t_eq('catálogo con preselección: solo lo elegido', (select count(*) from public.listar_items_catalogo(:'org'::uuid, p_items => array[:'i2'::bigint])), 1::bigint);
select public.t_eq('catálogo sin filtro ni preselección: solo agotados', (select count(*) from public.listar_items_catalogo(:'org'::uuid)), 0::bigint);
select public.t_eq('por proveedor: preseleccionado no vinculado aparece', (select count(*) from public.listar_items_proveedor(:'org'::uuid, :'p3'::bigint, p_items => array[:'i1'::bigint]) where not vinculado), 1::bigint);
reset role;

do $$ begin raise notice 'PEDIDOS_OK'; end $$;
