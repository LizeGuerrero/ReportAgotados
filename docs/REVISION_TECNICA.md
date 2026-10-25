# Revisión técnica de la entrega Pedidos

## Integración frontend

El componente `components/PedidosCompras.tsx` se reduce a ser el punto de entrada de `components/pedidos/MesaCompra.tsx`. La ruta `app/app/[slug]/pedidos/page.tsx` ya usa `PedidosCompras`, por lo que no es necesario cambiarla.

La nueva UI consume estas RPC de la migración propuesta: `compra_necesidades`, `listar_compras`, `compra_crear`, `compra_agregar_items`, `compra_quitar_linea`, `compra_consultar_proveedor`, `compra_quitar_proveedor`, `compra_base_costo`, `oferta_guardar`, `oferta_confirmar_erp`, `oferta_marcar_pedida`, `compra_asignar`, `compra_emitir_ordenes`, `orden_marcar_enviada`, `orden_cancelar`, `compra_cerrar`, `proveedor_condiciones_guardar` y `compra_obtener`. Además, usa `listar_lineas_pedidos`, `listar_proveedores_pedidos` y `tiene_permiso` del SQL base.

Se comparó el conjunto de llamadas de la nueva UI con los nombres definidos en los dos SQL adjuntos. No hay nombres de RPC faltantes.

## Seguridad y permisos

La interfaz habilita controles con `usePermisosPedidos`, pero eso es solo UX. La operación efectiva sigue estando protegida por los permisos que valida cada función `SECURITY DEFINER` de la migración SQL. La tabla de proveedores se lista por la RPC `listar_proveedores_pedidos` del backend, que comprueba el permiso Pedidos, en vez de hacer una consulta directa sin control del módulo.

## Flujo de AGOTADOS

La bandeja invoca `compra_necesidades` por compatibilidad con el nombre del SQL. Esa función consulta `public.agotados` filtrando registros de la organización pendientes de respuesta y que no estén vinculados a una línea de compra. La etiqueta visible es AGOTADOS y no se crea una entidad duplicada de Necesidades.

## Verificaciones realizadas

- Transpilación/sintaxis de TypeScript para los archivos de reemplazo: sin errores sintácticos.
- Comprobación estructural con TypeScript y stubs locales para el componente nuevo: sin errores.
- Comparación automatizada de llamadas RPC: no faltan nombres respecto a los SQL adjuntos.
- Build completo de Next.js: no ejecutable en este entorno debido a paquetes y tipos ausentes; debe verificarse en el equipo del proyecto.
- SQL contra Supabase real: no ejecutado; necesita validación en una base de pruebas antes de producción.
