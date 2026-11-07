# Informe — Mejoras del módulo CXP

Alcance: solo CXP (`components/cxp`, `styles/cxp.css`, páginas de Cartera/Excluidas/Pagados, una migración nueva). No se tocaron otros módulos, permisos, autenticación ni el flujo de pago.

## 1. Diagnóstico antes de los cambios
- Cartera: `CxpCartera.tsx` (988 líneas) + `hoja/HojaTabla.tsx`. Datos por RPC `cxp_listar`, `cxp_totales`, `cxp_proveedores_filtro`, etc.
- Dinero: `moneda()` (Intl es-CO, COP). **No existía ninguna lógica de copiado en CXP**: al copiar, el navegador entregaba el texto visible (`$ 1.500.000`).
- Selección: ya existía y ya era independiente de la tabla (`Map<id, fila>`), con casilla por fila, clic en fila, Shift para rango, «seleccionar visibles» y «Limpiar».
- Preferencias: solo `localStorage` (`cxp.hoja.v1:<org>:<estado>`): por navegador y organización, **no por usuario**. No había tabla ni RPC de preferencias.
- Columnas: ancho (arrastrable), ocultar, contraer grupos, ajuste de texto global y por columna (solo texto largo), densidad, primeras N columnas fijas (máx. 3). Acciones ya era fija a la derecha. **No existía**: orden de columnas, alineación, fijar columnas a la derecha (salvo Acciones).

## 2. Problemas en la distribución CSS
Título + descripción + 3 KPI + fila de tramos + 1–2 avisos + filtros + fila de pie (pager) + barra de selección (grid de 3 columnas con botones de 2,75 rem) + padding de `.ag-page` (1,75/2,5 rem). Todo apilado en vertical.

## 3. Problema de persistencia de selecciones
Un `useEffect` en `CxpCartera.tsx` hacía `setSeleccion(new Map())` ante cualquier cambio de búsqueda, proveedor, sede, origen o vencimiento («así no se paga nada que ya no se está viendo»). Era la única causa; la estructura de datos ya era correcta.

## 4. Reutilizado
Selección y su Map, `ConfirmarPago`, `cxp_marcar_pagado`, `HojaTabla`, ancho/ajuste/densidad/congelar existentes, `aNumero`, `moneda`, `copiarAlPortapapeles` (de `lib/tablaCopia`, sin modificarlo), clases `cxp-modal` y `ui-*`.

## 5. Mejoras implementadas
1. **Copiado**: configurable (entero `1500000` / monetario `$ 1.500.000`), por usuario, predeterminado «entero». Ctrl+C sobre la tabla convierte los valores en pesos de cualquier selección (una celda, varias celdas o doble clic sobre `1.500.000`); redondea al peso. Botón «Copiar total» en el análisis usa la misma preferencia. La pantalla no cambia.
2. **Selección persistente**: se eliminó el borrado al filtrar. Seguir seleccionadas las filas ocultas, volver a verse marcadas, y contar en el total. «Limpiar selección» ya existía. La copia guardada de cada fila se refresca cuando la fila vuelve a cargarse.
3. **Análisis de pagos** (franja inferior, una línea): n seleccionados, «(k fuera de la vista)», total, campo «Saldo disponible en banco (opcional)», indicador `✓ Queda $X` / `⚠ Excede el saldo por $X`, Copiar total, Limpiar. Solo cálculo en el navegador: no llama a ninguna RPC.
4. **Espacio**: título, KPIs y tramos en una sola fila (chips de una línea); avisos en una línea fina; pager movido a la franja inferior junto al análisis; padding de página reducido solo en CXP (clase `cxp-page`).
5. **Menú «Configuración»** (ventana con secciones): Columnas visibles y orden · Ajustes por columna (ancho, texto largo, alineación) · Formato y presentación · Columnas fijas (izquierda 0–4, derecha hasta 3 elegidas) · Copiado de valores · Restablecer. Reemplaza los menús «Columnas» y «Formato».
6. **Orden de columnas** dentro de cada grupo (▲▼).

## 6. Sistema de preferencias por usuario
Tabla `cxp_preferencias (organizacion_id, usuario_id, clave, valor jsonb)` + RPC `cxp_prefs_obtener / cxp_prefs_guardar / cxp_prefs_restablecer`, todas ligadas a `auth.uid()`, con RLS (solo lees lo tuyo), límite de 20 kB y claves permitidas: `hoja_pendiente`, `hoja_excluido`, `hoja_pagado`, `general` (copiado). Guarda con 500 ms de espera y al salir/ocultar la pestaña. Las preferencias viejas de `localStorage` se pasan una sola vez al primer usuario que entre y se borran del navegador. Si la migración no está aplicada, la pantalla funciona con valores predeterminados y avisa que no se guardará.

## 7. Archivos creados
`components/cxp/copiado.ts` · `components/cxp/hoja/PanelConfiguracion.tsx` · `supabase/migrations/20261102000500_cxp_preferencias_usuario.sql` · `tests/db/10_cxp_preferencias.sql`

## 8. Archivos modificados
`components/cxp/CxpCartera.tsx` · `components/cxp/hoja/HojaTabla.tsx` · `components/cxp/hoja/tipos.ts` · `components/cxp/hoja/usePrefsHoja.ts` · `styles/cxp.css` (bloque «Fase 6» al final) · `app/app/[slug]/cxp/page.tsx`, `…/cxp/excluidas/page.tsx`, `…/cxp-pagados/page.tsx` (solo agregan la clase `cxp-page`) · `tests/db/run.sh` (registra la suite 10) · `.gitignore` (excepción `!tests/db/1*.sql`).
**Eliminados** (su contenido pasó a Configuración): `hoja/PanelColumnas.tsx`, `hoja/PanelFormato.tsx`, `hoja/MenuPop.tsx` (ningún otro archivo los usaba).

## 9. Justificación técnica
- Migración nueva: sin tabla no hay forma de asociar preferencias a un usuario; el proyecto no tenía ningún mecanismo de preferencias en base de datos. Sigue las convenciones del esquema (SECURITY DEFINER, `search_path` vacío, RLS, grants solo a `authenticated`/`service_role`).
- Copiado interceptando `copy` en la tabla: es la única forma de cambiar lo copiado sin alterar lo mostrado ni otros módulos.
- Orden solo dentro del grupo: los encabezados de grupo (`colSpan`) exigen columnas contiguas del mismo grupo.
- Columnas fijas a la derecha: se eligen por columna (no «las últimas N»), porque «Val. a pagar» no es la última columna de datos.
- CSS global de `.ag-page` no se tocó (lo comparten otros módulos): se sobrescribe solo con `.ag-page.cxp-page`.

## 10. Pruebas realizadas
Hechas aquí:
- Sintaxis TypeScript de todos los archivos modificados: sin errores. Verificación de tipos con stubs de React/Supabase: sin errores en los archivos tocados (no es un `next build`).
- Lógica pura ejecutada en Node: conversión de `$ 1.500.000` → `1500000`, `$ 850.500` → `850500`, negativos, decimales (redondeo), varias celdas, texto sin `$` intacto, orden por grupo sin mezclar grupos: 10/10 correctas.

**NO ejecutadas** (no hay `node_modules`, PostgreSQL ni navegador en mi entorno):
- `next build`, ejecución visual de la interfaz y comprobación del espacio ganado en distintas resoluciones.
- La suite `tests/db/10_cxp_preferencias.sql` (aislamiento entre usuarios, permisos, validaciones, restablecer) y la migración: están escritas pero sin correr. Ejecuta `bash tests/db/run.sh schema.sql` antes de producción.
- Copiado real en Excel/Chrome/Safari y persistencia tras cerrar sesión: hay que probarlo en el equipo del proyecto.

## 11. Pendientes y puntos a decidir
1. **Efecto colateral importante**: la misma selección alimenta «Marcar como pagados» y «Excluir selección». Ahora, con selecciones persistentes, esas acciones pueden incluir filas que no se ven. Mitigación: el contador muestra «(k fuera de la vista)» y la ventana de confirmación de pago (sin cambios) lista todos los documentos. Si prefieres que pagar/excluir solo actúe sobre lo visible, es un cambio pequeño.
2. El análisis solo aparece para quien ve las casillas (`pagar` o `excluir`); no se tocaron permisos. Si usuarios con solo «ver» deben analizar, hay que decidirlo.
3. La selección se pierde al cambiar de pestaña (Cartera/Excluidas/Pagados) o recargar: cada pestaña es otra página.
4. Los botones de la franja inferior son de tamaño normal (antes «grandes») para ganar espacio.
5. El total usa el valor de la fila al cargarla; si otra persona edita esa fila mientras tanto, se actualiza al volver a cargarla.
6. Columnas fijas a la derecha: en la fila de grupos del encabezado no se fijan (solo los encabezados de columna).
7. Saldo bancario: no se guarda (solo vive en pantalla).
8. Aplicar la migración `20261102000500…` antes de desplegar el front.

---
# Adenda (3/11/2026): formulario de pendientes y degradado de «Días venc.»

**Formulario «Agregar pendiente por pagar»** (`FormPendiente.tsx`)
- La lista de terceros se abre al hacer clic en NIT o Proveedor y muestra los primeros de la base (cartera + módulo Proveedores) sin escribir; al escribir se filtra por nombre o NIT.
- Si lo escrito no coincide exactamente con un NIT, al final aparece **«+ Añadir nuevo tercero»**. Al elegirlo: tipo de documento (NIT, CC, CE, PAS, OTRO) y casilla «Registrarlo también en el módulo Proveedores» (solo si el usuario tiene permiso de crear en Proveedores; se crea con la función existente `proveedor_crear`; si ya existía, se usa ese).
- Requiere la migración `20261103000100_cxp_terceros_lista.sql` (la función `cxp_terceros` devolvía vacío hasta escribir 2 caracteres). No pude reproducir por qué «no cargaba» los proveedores; la causa más probable es esa.
- **Condición de pago automática**: elegir la condición calcula el vencimiento (fecha del documento + días, también para textos como «CREDITO A 20 DIAS»). Si se cambia el vencimiento, la condición se deduce: la del catálogo más cercana (hasta 3 días de diferencia) o «CREDITO A N DIAS». Gana siempre lo último que la persona tocó.

**Degradado de «Días venc.»**: ahora es continuo blanco → rojo (205, 0, 0) y relativo al documento más vencido de lo que se ve, como la imagen (1 → rgb(253,242,242), 9 → rgb(233,140,140), 20 → rgb(205,0,0)). El texto cambia a blanco cuando contrasta mejor. Opción en Configuración › Formato: «Relativo» (predeterminado) o «Fijo a 90 días» (el anterior). Mínimo de escala 10 días, para que 2–3 días de atraso no salgan rojo fuerte.

Archivos: modificados `FormPendiente.tsx`, `CxpCartera.tsx`, `hoja/tipos.ts`, `hoja/usePrefsHoja.ts`, `hoja/PanelConfiguracion.tsx`, `lib/cxp/colorDias.ts` (compartido: solo se agregó una función; `ConfirmarPago` no cambia), `styles/cxp.css`; nuevo `supabase/migrations/20261103000100_cxp_terceros_lista.sql`.
Sin ejecutar: interfaz, la migración y la creación real en Proveedores.

---
# Adenda 2 (4/11/2026): copiar una celda y revisión manual al cargar el ERP

## Copiar una celda sin chocar con la selección de fila
- Cada celda de datos tiene una **zona de copiado** propia: un icono pequeño que aparece al pasar el mouse (a la izquierda en columnas de valores, a la derecha en el resto). Un clic ahí copia la celda; **no marca la fila ni abre la edición**, así que conviven fila + celda y fila + celda + campo editable. El clic en cualquier otra parte de la celda sigue como antes.
- La celda copiada queda resaltada y muestra «✓»; mientras esté resaltada, **Ctrl+C** también la copia (si no hay texto seleccionado). Se suelta al tocar otra parte.
- Valores en pesos: respetan la preferencia de Configuración (entero o `$ 1.500.000`). Texto: se copia como se ve (el «—» de celdas vacías no se copia).
- Limitación: el icono es solo para mouse/táctil (no entra en el orden del teclado, para no llenar el Tab de botones). Quien usa teclado sigue pudiendo seleccionar texto y copiar.
- Archivos: `hoja/HojaTabla.tsx`, `copiado.ts`, `styles/cxp.css`. Sin cambios en base de datos.

## Revisión manual dentro de «Cargar archivo del ERP»
- Nueva sección plegable «Revisar y corregir filas del archivo»: búsqueda, filtro «solo corregidas o quitadas», paginada. Por fila: **quitar** de la carga, y **corregir fecha del documento o de vencimiento** (botón ↺ para volver a la del ERP). Valida que el vencimiento no quede antes del documento.
- La vista previa se **recalcula sola** con lo que realmente se cargará; el botón «Cargar» usa las filas ya revisadas. Nada se guarda hasta confirmar.
- En la cartera, la fecha corregida se ve con **`*`** delante y un texto «Corregida a mano. El ERP trae: dd/mm/aaaa» (el `*` lo pone CSS: no se copia). El plazo se recalcula con la fecha corregida.
- **Las correcciones se conservan** al volver a cargar el ERP mientras el ERP siga trayendo el mismo valor original; si el ERP cambia ese dato, manda el ERP y la marca se quita. Sin esta regla, la siguiente carga habría borrado las correcciones. Se guarda quién corrigió y cuándo.
- Quitar una fila que ya estaba en la cartera no la borra: aparecerá como «no viene en el archivo».
- Base de datos (migración `20261104000100_cxp_correcciones_fechas.sql`): nuevas columnas en `cxp_documentos` (`dcto_erp`, `vcto_erp`, `dcto_corregido`, `vcto_corregido`, `corregido_por`, `corregido_en`); se recrean `_cxp_filas_import` y `cxp_listar` (cambian sus columnas) y se actualizan `cxp_importar_confirmar` y `cxp_importar_previsualizar`. Generada a partir del esquema real que subiste. Pruebas: `tests/db/11_cxp_correcciones_fechas.sql`.
- Archivos nuevos: `components/cxp/RevisionCarga.tsx`. Modificados: `CargarCxp.tsx`, `CxpCartera.tsx`, `tipos.ts`.

**Sin ejecutar** (sin Postgres ni navegador aquí): la migración y la suite 11 (hay que correr `bash tests/db/run.sh schema.sql`, que también verifica que las suites anteriores 06–10 sigan pasando), la interfaz y el copiado real. Probé en Node la lógica de aplicar/validar correcciones (7/7).

**Decisiones abiertas**
1. Solo se corrigen fechas (documento y vencimiento). Otros campos del ERP no.
2. No se pueden corregir fechas de documentos ya cargados desde la propia cartera (esa edición sigue bloqueada para filas del ERP): se corrige al volver a cargar el archivo.
