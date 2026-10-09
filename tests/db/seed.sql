insert into public.modulos(nombre) values ('Items'),('Proveedores'),('Compras'),('Bodega'),('Roles'),('Reportes'),('Agotados'),('reporte_agotados'),('pedidos');
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-0000-0000-0000000000a1','admin@demo.com',now()),
 ('00000000-0000-0000-0000-0000000000b2','nuevo@demo.com',now()),
 ('00000000-0000-0000-0000-0000000000c3','otro@demo.com',now()),
 ('00000000-0000-0000-0000-0000000000d4','sinconfirmar@demo.com',null);
insert into public.profiles(id,nombres,apellidos,tipo_documento,numero_documento,username,perfil_completo) values
 ('00000000-0000-0000-0000-0000000000a1','Ana','Admin','CC','111','ana',true),
 ('00000000-0000-0000-0000-0000000000b2','Beto','Nuevo','CC','222','beto',true),
 ('00000000-0000-0000-0000-0000000000c3','Cata','Otra','CC','333','cata',true),
 ('00000000-0000-0000-0000-0000000000d4','Dani','SinConf','CC','444','dani',true);
