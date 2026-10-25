# Integración del módulo Pedidos (Mesa de compra)

## Archivos de este paquete

- `components/PedidosCompras.tsx` — reemplaza el componente que montaba el flujo anterior de Pedidos.
- `styles/pedidos-mesa.css` — estilos de la nueva mesa.
- `supabase/migrations/20261020204000_pedidos_mesa_compra.sql` — migración aditiva para las tablas, RPC y políticas del flujo de mesa de compra.

## Instalación

1. Haz copia de seguridad, como ya tienes previsto.
2. En Supabase, ejecuta primero la migración SQL completa. No la ejecutes contra una base distinta de la organización/proyecto correcto.
3. Copia los tres archivos manteniendo exactamente las rutas de este paquete dentro de `auth-app`.
4. Conserva `app/app/[slug]/agotados/page.tsx` y `components/ReporteAgotados.tsx`: no forman parte del reemplazo. El nuevo flujo de Pedidos lee los agotados pendientes mediante `compra_necesidades`; no reconstruye ni reemplaza el reporte.
5. Verifica que los roles de la organización tengan permisos `pedidos` para consultar/crear/editar y `pedidos_ganador` para asignar/emitir órdenes, según corresponda. La migración delega la autorización en las funciones de permisos existentes.
6. Ejecuta `npm run build` y prueba con usuarios de roles distintos antes de usarlo en producción.

## Flujo incluido

- Consultar agotados disponibles y agrupar cantidades por artículo/sede.
- Crear una compra desde artículos seleccionados, conservando sus vínculos con los agotados.
- Consultar proveedores, registrar costos/ofertas y asignar cantidades.
- Comparar costos con/sin IVA, emitir órdenes y marcar órdenes como enviadas.
- Consultar compras y datos de órdenes desde Supabase.

## Importante

La migración es aditiva y reutiliza las tablas existentes `organizaciones`, `sedes`, `items`, `proveedores`, `item_proveedor`, `agotados` y `ordenes_compra`. No borra tablas ni datos. La interfaz llama a las RPC; las reglas de permisos y validaciones de negocio permanecen en PostgreSQL.

La verificación de compilación no pudo ejecutarse en este entorno porque el ZIP de `auth-app` no incluye `node_modules`. Después de copiar los archivos, la comprobación local recomendada es `npm ci` y `npm run build`.
