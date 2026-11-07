\set ON_ERROR_STOP 1
-- Pruebas de MENSAJES v2: Estándar protegida, estructuras independientes, asignación por proveedor, variables y CXP.
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
select public.crear_organizacion('Mensajes Dos','MSJ-2222') as slug \gset
reset role;
select id as org from public.organizaciones where slug=:'slug' \gset

set role authenticated;
select set_config('app.uid','00000000-0000-0000-0000-0000000000a1',false);
select public.proveedor_crear(:'org'::uuid, '{"tipo_documento":"NIT","numero_documento":"900111","nombre":"Prov Uno","contacto":"Carlos Ramírez Gómez","whatsapp":"3001234567","email":"uno@x.com"}'::jsonb) as p1 \gset
select public.proveedor_crear(:'org'::uuid, '{"tipo_documento":"NIT","numero_documento":"900222","nombre":"Prov Dos"}'::jsonb) as p2 \gset

-- 1. La Estándar es de fábrica y está protegida ---------------------------------------------------------------
select public.t_err(format('select public.mensaje_config_guardar(%L::uuid, ''orden_compra'', ''{}''::jsonb)', :'org'), 'protegida');
select public.t_err(format('select public.mensaje_config_restablecer(%L::uuid, ''orden_compra'')', :'org'), 'no se puede modificar');
select public.t_eq('la Estándar viene marcada como protegida', (public.mensaje_estructura_config(:'org'::uuid,'orden_compra',null))->>'protegida', 'true');
select (public.mensaje_estructura_config(:'org'::uuid,'orden_compra',null))->>'encabezado' as enc_fabrica \gset

-- 2. Crear = copia independiente ------------------------------------------------------------------------------
select public.mensaje_variante_crear(:'org'::uuid,'orden_compra','Formal',null) as va \gset
select public.t_eq('la copia nace igual a la Estándar', (public.mensaje_estructura_config(:'org'::uuid,'orden_compra',:'va'::uuid))->>'encabezado', :'enc_fabrica');
select public.mensaje_variante_guardar(:'org'::uuid,'orden_compra',:'va'::uuid,
  '{"encabezado":"ORDEN FORMAL {numero}","introduccion":"{saludo} {primer_nombre}","pie":"Gracias","campos":[]}'::jsonb);
select public.t_eq('editar la copia SÍ cambia la copia', (public.mensaje_estructura_config(:'org'::uuid,'orden_compra',:'va'::uuid))->>'encabezado', 'ORDEN FORMAL {numero}');
select public.t_eq('editar la copia NO cambia la Estándar', (public.mensaje_estructura_config(:'org'::uuid,'orden_compra',null))->>'encabezado', :'enc_fabrica');

-- 3. Duplicar una estructura: independiente en ambos sentidos ---------------------------------------------------
select public.mensaje_variante_crear(:'org'::uuid,'orden_compra','Formal 2',:'va'::uuid) as vb \gset
select public.t_eq('el duplicado copia todo', (public.mensaje_estructura_config(:'org'::uuid,'orden_compra',:'vb'::uuid))->>'pie', 'Gracias');
select public.mensaje_variante_guardar(:'org'::uuid,'orden_compra',:'vb'::uuid, '{"encabezado":"SOLO B","pie":"Chao"}'::jsonb);
select public.t_eq('editar B no toca A', (public.mensaje_estructura_config(:'org'::uuid,'orden_compra',:'va'::uuid))->>'pie', 'Gracias');
select public.mensaje_variante_guardar(:'org'::uuid,'orden_compra',:'va'::uuid, '{"encabezado":"A CAMBIA","pie":"Otro"}'::jsonb);
select public.t_eq('editar A no toca B', (public.mensaje_estructura_config(:'org'::uuid,'orden_compra',:'vb'::uuid))->>'encabezado', 'SOLO B');
select public.t_eq('A tampoco cambió la Estándar', (public.mensaje_estructura_config(:'org'::uuid,'orden_compra',null))->>'encabezado', :'enc_fabrica');

-- 4. Restablecer: vuelve a SU punto de partida y no toca nada más ---------------------------------------------------
select public.t_eq('A figura como modificada', (public.mensaje_estructura_config(:'org'::uuid,'orden_compra',:'va'::uuid))->>'modificada', 'true');
select public.mensaje_variante_restablecer(:'org'::uuid, :'va'::uuid);
select public.t_eq('A volvió a su inicio (la Estándar con la que nació)', (public.mensaje_estructura_config(:'org'::uuid,'orden_compra',:'va'::uuid))->>'encabezado', :'enc_fabrica');
select public.t_eq('B no se movió al restablecer A', (public.mensaje_estructura_config(:'org'::uuid,'orden_compra',:'vb'::uuid))->>'encabezado', 'SOLO B');
select public.t_eq('la Estándar sigue intacta', (public.mensaje_estructura_config(:'org'::uuid,'orden_compra',null))->>'encabezado', :'enc_fabrica');
select public.t_eq('B copiada de A parte de A (su inicial es A al duplicar)', (select (inicial->>'encabezado') from public.mensaje_variantes where id = :'vb'::uuid), 'ORDEN FORMAL {numero}');

-- 5. Asignar a un proveedor solo mueve un puntero ---------------------------------------------------------------------
select public.mensaje_variante_guardar(:'org'::uuid,'orden_compra',:'va'::uuid, '{"encabezado":"PARA UNO {numero}","introduccion":"{saludo} {primer_nombre}"}'::jsonb);
select public.mensaje_proveedor_fijar(:'org'::uuid, :'p1'::bigint, 'orden_compra', :'va');
select public.t_eq('el proveedor 1 usa A', (public.mensaje_opciones(:'org'::uuid,'orden_compra',:'p1'::bigint))->'predeterminada'->>'nombre', 'Formal');
select public.t_eq('el proveedor 2 sigue en la Estándar', (public.mensaje_opciones(:'org'::uuid,'orden_compra',:'p2'::bigint))->'predeterminada'->>'nombre', 'Estándar');
select public.t_eq('asignar no cambió el contenido de A', (public.mensaje_estructura_config(:'org'::uuid,'orden_compra',:'va'::uuid))->>'encabezado', 'PARA UNO {numero}');
select public.t_eq('asignar no cambió la Estándar', (public.mensaje_estructura_config(:'org'::uuid,'orden_compra',null))->>'encabezado', :'enc_fabrica');

select public.mensaje_predeterminada_org_fijar(:'org'::uuid,'orden_compra',:'vb'::uuid);
select public.t_eq('el proveedor 2 hereda la predeterminada de la organización', (public.mensaje_opciones(:'org'::uuid,'orden_compra',:'p2'::bigint))->'predeterminada'->>'nombre', 'Formal 2');
select public.t_eq('el proveedor 1 conserva la suya', (public.mensaje_opciones(:'org'::uuid,'orden_compra',:'p1'::bigint))->'predeterminada'->>'nombre', 'Formal');
select public.mensaje_proveedor_fijar(:'org'::uuid, :'p2'::bigint, 'orden_compra', 'estandar');
select public.t_eq('un proveedor puede quedarse explícitamente con la Estándar', (public.mensaje_opciones(:'org'::uuid,'orden_compra',:'p2'::bigint))->'predeterminada'->>'nombre', 'Estándar');
select public.t_eq('asignación en bloque', public.mensaje_proveedores_asignar(:'org'::uuid,'orden_compra', array[:'p1'::bigint, :'p2'::bigint], null)::text, '2');
select public.t_eq('sin fila propia ambos heredan la de la organización', (public.mensaje_opciones(:'org'::uuid,'orden_compra',:'p1'::bigint))->'predeterminada'->>'origen', 'organizacion');

-- 6. Variables del proveedor en el texto (datos reales) ---------------------------------------------------------------
select public.t_eq('variables compartidas: existe {contacto}', (select count(*)::text from jsonb_array_elements(public.mensaje_variables(:'org'::uuid,'orden_compra')) v where v->>'clave' = 'contacto'), '1');
select public.t_eq('CXP también ve {contacto}', (select count(*)::text from jsonb_array_elements(public.mensaje_variables(:'org'::uuid,'cxp_pago')) v where v->>'clave' = 'contacto'), '1');
select public.t_eq('la vista previa reemplaza {primer_nombre} con el contacto real',
  ((public.mensaje_vista_previa(:'org'::uuid,'orden_compra', '{"introduccion":"Hola {primer_nombre}!"}'::jsonb, false, :'p1'::bigint)) like '%Hola Carlos!%')::text, 'true');
select public.t_eq('sin contacto la variable queda vacía (no literal)',
  ((public.mensaje_vista_previa(:'org'::uuid,'orden_compra','{"introduccion":"Hola {primer_nombre}!"}'::jsonb, false, :'p2'::bigint)) like '%Hola !%')::text, 'true');
select public.t_eq('variable inexistente se deja tal cual',
  ((public.mensaje_vista_previa(:'org'::uuid,'orden_compra','{"introduccion":"X {contacot}"}'::jsonb, false, null)) like '%{contacot}%')::text, 'true');

-- 7. Cuentas por pagar usa el mismo sistema ----------------------------------------------------------------------------
select public.mensaje_variante_crear(:'org'::uuid,'cxp_pago','Sin facturas',null) as vsin \gset
select public.t_err(format('select public.mensaje_variante_guardar(%L::uuid,''cxp_pago'',%L::uuid,''{"cuerpo":"hola","linea":"x"}''::jsonb)', :'org', :'vsin'), '{facturas}');
select public.mensaje_variante_crear(:'org'::uuid,'cxp_pago','Corto',null) as vc \gset
select public.mensaje_variante_guardar(:'org'::uuid,'cxp_pago',:'vc'::uuid,'{"cuerpo":"{saludo} {primer_nombre}: pagamos\n{facturas}","linea":"{factura}","indicativo":"+57"}'::jsonb);
select public.t_eq('indicativo solo dígitos', (public.mensaje_estructura_config(:'org'::uuid,'cxp_pago',:'vc'::uuid))->>'indicativo', '57');
select public.mensaje_proveedor_fijar(:'org'::uuid, :'p1'::bigint, 'cxp_pago', :'vc');
select public.t_eq('cxp_mensaje_datos trae la estructura y los datos del proveedor',
  (public.cxp_mensaje_datos(:'org'::uuid, array['900111']))->'proveedores'->0->'vars'->>'primer_nombre', 'Carlos');
select public.t_eq('...y la estructura asignada', (public.cxp_mensaje_datos(:'org'::uuid, array['900111']))->'proveedores'->0->>'estructura_id', :'vc');
select public.t_eq('un NIT sin proveedor no rompe', (public.cxp_mensaje_datos(:'org'::uuid, array['999999']))->'proveedores'->0->>'proveedor_id', null);
select public.t_eq('las estructuras de Pedidos y CXP no se mezclan', (select count(*)::text from public.mensaje_variantes where organizacion_id = :'org'::uuid and tipo = 'cxp_pago'), '2');

-- 8. Eliminar una estructura devuelve a sus proveedores a la predeterminada ---------------------------------------------
select public.mensaje_proveedor_fijar(:'org'::uuid, :'p1'::bigint, 'orden_compra', :'va');
select public.t_eq('eliminar informa cuántos proveedores la usaban', public.mensaje_variante_eliminar(:'org'::uuid, :'va'::uuid)::text, '1');
select public.t_eq('el proveedor vuelve a la predeterminada de la organización', (public.mensaje_opciones(:'org'::uuid,'orden_compra',:'p1'::bigint))->'predeterminada'->>'nombre', 'Formal 2');
select public.t_eq('la Estándar sigue intacta al final', (public.mensaje_estructura_config(:'org'::uuid,'orden_compra',null))->>'encabezado', :'enc_fabrica');

-- 9. Descripción para el ERP (v2b) y preferencias por usuario ----------------------------------------------------
select public.t_eq('el aviso de pago trae la descripción ERP por defecto', (public.mensaje_estructura_config(:'org'::uuid,'cxp_pago',null))->>'erp_plantilla', 'PP.TRANSF {total} {facturas}');
select public.t_eq('...y el formato de facturas por defecto', (public.mensaje_estructura_config(:'org'::uuid,'cxp_pago',null))->>'erp_formato_factura', 'completo');
select public.mensaje_variante_guardar(:'org'::uuid,'cxp_pago',:'vc'::uuid,
  '{"cuerpo":"{facturas}","linea":"{factura}","erp_plantilla":"PP.TRANSF {total} {facturas}","erp_formato_factura":"prefijo_comun","erp_separador":"","erp_agrupar_rangos":true,"erp_formato_total":"miles"}'::jsonb);
select public.t_eq('el formato ERP se guarda', (public.mensaje_estructura_config(:'org'::uuid,'cxp_pago',:'vc'::uuid))->>'erp_formato_factura', 'prefijo_comun');
select public.t_eq('separador vacío => espacio', (public.mensaje_estructura_config(:'org'::uuid,'cxp_pago',:'vc'::uuid))->>'erp_separador', ' ');
select public.t_err(format('select public.mensaje_variante_guardar(%L::uuid,''cxp_pago'',%L::uuid,''{"cuerpo":"{facturas}","linea":"x","erp_formato_factura":"raro"}''::jsonb)', :'org', :'vc'), 'Formato de facturas');
select public.t_eq('variables ERP en el catálogo de CXP', (select count(*)::text from jsonb_array_elements(public.mensaje_variables(:'org'::uuid,'cxp_pago')) v where v->>'ambito' = 'erp'), '10');
select public.t_eq('las variables ERP no aparecen en Pedidos', (select count(*)::text from jsonb_array_elements(public.mensaje_variables(:'org'::uuid,'orden_compra')) v where v->>'ambito' = 'erp'), '0');
select public.t_eq('«modificada» no se marca por campos agregados sin cambios reales', (select (public.mensaje_estructuras(:'org'::uuid,'cxp_pago')->'variantes'->0->>'modificada')), 'false');

select public.usuario_preferencia_guardar('mensajes.clienteWhatsApp', 'web');
select public.usuario_preferencia_guardar('mensajes.clienteCorreo', 'outlook');
select public.t_eq('la preferencia queda en la cuenta', (public.usuario_preferencias_obtener())->>'mensajes.clienteWhatsApp', 'web');
select public.usuario_preferencia_guardar('mensajes.clienteWhatsApp', 'app');
select public.t_eq('se puede cambiar', (public.usuario_preferencias_obtener())->>'mensajes.clienteWhatsApp', 'app');
select public.t_err($$select public.usuario_preferencia_guardar('mensajes.clienteCorreo', 'hotmail')$$, 'Preferencia no válida');
select public.t_err($$select public.usuario_preferencia_guardar('otra.cosa', 'x')$$, 'Preferencia no válida');

reset role;
select 'MENSAJES_OK' as resultado;
