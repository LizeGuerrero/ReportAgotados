# Módulo MENSAJES — auditoría, corrección y rediseño

> **Estado de la validación (léelo primero).** En mi entorno no había PostgreSQL ni `node_modules` ni red, así que
> **no pude ejecutar** el SQL ni `next build`. Lo que sí hice: pruebas reales (ejecutadas) de la lógica TypeScript pura,
> y verificación de tipos de todos los `.ts/.tsx` entregados contra stubs de React/Supabase (sin errores). El SQL y la
> interfaz **deben probarse en tu entorno** siguiendo la sección 6 antes de producción. Hay una suite SQL escrita
> (`tests/db/10_mensajes.sql`) que no he podido correr.

## 1. Causa raíz del problema de los mensajes estándar

Está en la base de datos, no en el frontend. En el modelo anterior:

| Pieza | Cómo funcionaba | Consecuencia |
|---|---|---|
| Estándar | Fila editable (`mensaje_plantillas` + `mensaje_campos`), una por organización y tipo | Era "la base", pero se podía modificar |
| Estructura personalizada | Guardaba **solo las diferencias** (`mensaje_variantes.cambios`) respecto a la Estándar *vigente*; la configuración final se calculaba al leer (`_mensaje_aplicar_cambios`) | Nunca fue una copia: era una "capa" sobre la Estándar |

De ahí salen exactamente los síntomas que viste:

* Editar o "Restablecer a valores de fábrica" la **Estándar** (`mensaje_config_restablecer` borra la fila) cambiaba lo que mostraban todas las personalizadas en los campos que no habían tocado.
* "Restablecer" una **personalizada** (`mensaje_variante_restablecer`: `cambios = {}`) la dejaba **igual a la Estándar actual**, no a su propio inicio.
* "Crear a partir de la Estándar" creaba `cambios = {}`: un alias de la Estándar, no una copia.
* Si dejabas un campo igual a la Estándar, `_mensaje_calcular_cambios` lo descartaba y quedaba "enganchado" otra vez.
* Asignar una estructura a un proveedor **no** modifica plantillas (solo mueve un puntero en `mensaje_proveedor_estructura`); lo que se percibía como "cambió la estándar" era el acoplamiento anterior.
* Además `solicitud_texto` / `orden_compra_texto` (flujo de solicitudes) **ignoraban** la estructura del proveedor y no entregaban sus datos (`{contacto}` salía vacío).

No hay problemas de referencias compartidas/mutables en el frontend: el estado se recargaba desde la base.

## 2. Nueva arquitectura (misma para Pedidos y CXP)

* **Estándar = de fábrica y protegida.** Se calcula siempre desde el catálogo en SQL (`_mensaje_catalogo`); nada la edita. `mensaje_config_guardar` / `mensaje_config_restablecer` ahora devuelven un error claro.
* **Cada estructura guarda su configuración completa** (`mensaje_variantes.config`) y su punto de partida (`inicial`). Crear/duplicar = copia profunda. Guardar solo afecta a esa fila. **Restablecer** vuelve a su `inicial`. Acción aparte "Reemplazar por el contenido de la Estándar".
* **Asignación = puntero** (proveedor → estructura, organización → predeterminada). Jamás toca una plantilla.
* **Catálogo único de variables** (`_mensaje_variables`) usado por Pedidos y CXP; reemplazo con el mismo criterio en SQL y TS: *conocida sin dato → vacío; desconocida → se deja tal cual*.
* **CXP ahora es un tipo más (`cxp_pago`)** del mismo sistema (estructuras, predeterminada, por proveedor), en vez de un único texto en `cxp_config`.

### Migración de datos (incluida en el script, no destructiva)
* Cada estructura existente se convierte en una **foto de lo que se ve hoy** (Estándar personalizada + diferencias): nada cambia para el usuario.
* Si una organización había **personalizado la Estándar**, esa versión se conserva como estructura "Estándar personalizada" y se asigna donde antes se usaba "la Estándar" (proveedores con Estándar explícita y predeterminada), para que los mensajes salgan idénticos.
* El mensaje único de `cxp_config` pasa a ser la estructura "Mensaje de pago actual", predeterminada de la organización.
* No se borra nada: `mensaje_plantillas`, `mensaje_campos`, `mensaje_variantes.cambios` y `cxp_config` quedan sin uso (marcadas OBSOLETAS con `COMMENT`). Se puede ejecutar varias veces.

## 3. Datos del proveedor (inspeccionados en el esquema real)

`proveedores`: nombre, contacto, telefono, **whatsapp**, email, tipo/numero_documento, notas, cobra_iva, iva_compra, pedido_minimo, flete_gratis_desde, flete_estandar, dias_tipicos. Hallazgos:

* **CXP ignoraba `whatsapp` y `email`**: su RPC (`cxp_contactos_proveedores`) solo devolvía teléfono/contacto. Ahora `cxp_mensaje_datos` entrega todo; WhatsApp usa `whatsapp` y, si falta, `telefono`.
* **Ciudad**: existe `proveedor_ubicaciones.ciudad`, pero **ninguna pantalla actual la captura**. `{ciudad}` está implementada, pero saldrá vacía hasta que se registren ubicaciones.
* No expuse `pedido_minimo`, flete ni días como variables (son condiciones internas, no datos para el proveedor); se pueden añadir en una línea al catálogo si los quieres.
* No existe en el proyecto un mensaje de **"solicitud de similitud"** (ni en SQL ni en código). Hoy hay solicitud de cotización, orden de compra y aviso de pago (CXP). El sistema admite un tipo nuevo, pero requiere definirlo (campos, texto); no lo inventé.

Variables disponibles: `{proveedor} {contacto} {primer_nombre} {whatsapp} {telefono} {correo} {nit} {ciudad} {saludo} {usuario} {empresa} {fecha}`; Pedidos: `{numero} {entregar_en}`; CXP: `{facturas} {cantidad} {total}` y, por factura, `{factura} {documento} {vencimiento} {valor} {total_factura}`. `{primer_nombre}` y `{saludo}` (Buen día/tardes/noches, hora de Colombia) son derivadas.

## 4. Correo: Gmail como opción principal

`lib/mensajes/enviar.ts` abre `https://mail.google.com/mail/?view=cm&fs=1&to=…&su=…&body=…` en una pestaña nueva con destinatario, asunto y mensaje. Alternativas en el menú ▾: Outlook web y la app de correo (`mailto:`); la elección se recuerda en el navegador. Varios correos separados por `;`/`,` se normalizan. Si el cuerpo es demasiado largo para el enlace, se abre sin cuerpo, el texto queda **copiado** y se avisa. CXP ahora también puede enviar por correo. *(Si el usuario tiene varias cuentas de Google, Gmail usa la cuenta activa del navegador.)*

### WhatsApp directo (sin la pantalla «Continuar al chat»)
Los enlaces `wa.me` siempre pasan por esa página de WhatsApp; no se puede evitar con ellos. Ahora el botón abre **WhatsApp Web** (`web.whatsapp.com/send`, directo al chat con el mensaje escrito; pide QR solo si no hay sesión) en computador, o **la app instalada** (`whatsapp://send`) en celular. En la flecha ▾ (Pedidos) o el selector (CXP) se puede cambiar entre WhatsApp Web, App de WhatsApp y `wa.me` (respaldo); la elección se recuerda en el navegador. «App de WhatsApp» solo funciona si la app está instalada.

### Preferencias por usuario (correo y WhatsApp)
Verificado: en la primera entrega el cliente de correo/WhatsApp elegido se guardaba **solo en el navegador** (`localStorage`), no en la cuenta. Ahora se guarda **por usuario** en la base (`usuario_preferencias`, funciones `usuario_preferencias_obtener` / `usuario_preferencia_guardar`, con valores validados) y acompaña a la cuenta en cualquier equipo; el navegador conserva una copia solo para que el botón salga bien al instante.

### Descripción para el ERP (Cuentas por pagar)
En «Mensajes para los proveedores», debajo de los botones de cada proveedor aparece **Descripción para el ERP** (una línea editable + «Copiar descripción» + contador de caracteres), p. ej. `PP.TRANSF 1730500 FE-1122, FE-1123`. Se configura en **Mensajes → Aviso de pago → Descripción para el ERP** (forma parte de la estructura, así que se puede duplicar/asignar por proveedor como el resto):

* **Texto** con variables propias: `{total} {facturas} {documentos} {cantidad} {proveedor} {nit} {fecha} {sede} {usuario} {empresa}` (`{documentos}` = números del ERP). Vacío = no se muestra.
* **Facturas**: *Tal cual* (`FE-1122, FE-1123`) · *Solo números* (`1122, 1123`, quita el prefijo de letras/símbolos del comienzo) · *Un prefijo y luego los números* (`FE-1122, 1123`; si hay prefijos distintos, cada uno una vez).
* **Juntar consecutivos** (opcional): `1122, 1123, 1124` → `1122-1124`.
* **Separador** libre (coma, espacio, guion, barra…).
* **Total**: `1730500`, `1.730.500` o `$1.730.500` (con centavos, coma decimal).
La descripción siempre sale en una sola línea. Otros datos de CXP se pueden sumar como variable agregando una fila al catálogo (`_mensaje_variables`) y una clave en `armarDescripcionErp`.

## 5. Rediseño visual

Estilos nuevos y encapsulados en `styles/mensajes.css` (clases `msj-*`, variables `--msj-*`, tema claro/oscuro; no usa ni redefine clases globales). Layout en tres zonas: **biblioteca** (Estándar 🔒 fijada arriba, tus estructuras con etiquetas *Predeterminada / N prov. / modificada / Basada en…*), **editor** (textos con variables + campos con interruptor, orden ↑↓, título y destino) y **lateral** (variables con ayuda + vista previa en vivo con datos de ejemplo o de un proveedor real). Pestaña **Por proveedor**: tabla con búsqueda, filtros, indicadores de datos faltantes (contacto/WhatsApp/correo) y asignación individual o en bloque. "Nueva estructura" elige el punto de partida; menú ⋯ con duplicar, renombrar, predeterminada, restablecer, reemplazar por Estándar y eliminar. Ctrl+S guarda; avisos de cambios sin guardar.

## 6. Archivos y dónde ponerlos

**Ejecutar los SQL en orden** (`2026_mensajes_v2.sql` y luego `2026_mensajes_v2b_erp_preferencias.sql`), después subir el frontend.

| Ruta | Estado | Qué hace |
|---|---|---|
| `database/2026_mensajes_v2b_erp_preferencias.sql` | NUEVO | Segundo script: campos de la descripción ERP, variables, preferencias por usuario, ajuste de «modificada» |
| `lib/mensajes/preferencias.ts` | NUEVO | Preferencias de envío por usuario |
| `database/2026_mensajes_v2.sql` | NUEVO | Migración completa (SQL Editor de Supabase). Si usas `supabase/migrations/`, cópialo allí con prefijo de fecha |
| `lib/mensajes/variables.ts` | NUEVO | Reemplazo/validación de variables (mismo criterio que SQL) |
| `lib/mensajes/enviar.ts` | NUEVO | Gmail / Outlook web / mailto |
| `lib/cxp/mensaje.ts` | MODIFICADO | `armarMensaje` usa variables del proveedor; sigue exportando lo anterior |
| `components/mensajes/MensajesModulo.tsx` | REEMPLAZAR | Nueva navegación por tipo |
| `components/mensajes/Workspace.tsx`, `EditorPedidos.tsx`, `EditorCxp.tsx`, `PanelVariables.tsx`, `Vista.tsx`, `AsignacionProveedores.tsx`, `Menu.tsx`, `CxpMensajes.tsx`, `tipos.ts` | NUEVOS | Interfaz |
| `components/mensajes/EstructurasMensajes.tsx` | **ELIMINAR** | Reemplazado por `Workspace.tsx` (nadie más lo importa) |
| `components/cxp/MensajesConfig.tsx` | REEMPLAZAR | Ahora delega en el espacio común |
| `components/cxp/MensajesProveedor.tsx` | REEMPLAZAR | Usa estructura asignada, datos reales, WhatsApp y Gmail |
| `components/pedidos/EnviarMensaje.tsx` | REEMPLAZAR | Gmail principal; mismas props |
| `styles/mensajes.css` | NUEVO | Estilos encapsulados |
| `tests/db/10_mensajes.sql`, `tests/db/run.sh` | NUEVO / MODIFICADO | Suite de aislamiento (run.sh solo añade la suite) |

No cambian: páginas (`app/…`), `Selector.tsx`, `MensajeProveedor.tsx`, `CxpCartera.tsx` ni otros módulos (sus llamadas RPC siguen siendo compatibles: `compra_mensaje_cotizacion`, `orden_mensaje`, `mensaje_opciones`, `mensaje_proveedor_fijar` conservan firma).

**Contratos RPC:** conservados (nombres/parámetros) salvo dos ampliados de forma compatible: `mensaje_proveedores_listar` (más columnas y parámetros opcionales) y `mensaje_vista_previa` (parámetro opcional `p_proveedor`); se recrean con `DROP` por cambiar el tipo de retorno/firma. Nuevas: `mensaje_variables`, `mensaje_vars_proveedor`, `mensaje_variante_igualar_estandar`, `mensaje_proveedores_asignar`, `cxp_mensaje_datos`. Los permisos de CXP usan `cxp_mensajes` (ver/editar) como ya definías.

## 7. Qué probar (checklist)

1. Ejecutar el SQL (debe terminar sin error; repetirlo no debe fallar). `bash tests/db/run.sh schema.sql` → `OK 10_mensajes.sql` (necesita Postgres local; la suite cubre: Estándar protegida, copia independiente, duplicar en ambos sentidos, restablecer solo lo propio, asignación sin tocar plantillas, herencia/predeterminada, variables con datos reales/vacías/inexistentes, CXP, eliminar).
2. Antes de migrar, anota 2–3 mensajes reales (solicitud y orden con un proveedor); después de migrar **deben salir idénticos**.
3. Mensajes → editar copia → recargar (F5): persiste; la Estándar no cambió.
4. Pedidos → generar mensaje a un proveedor con contacto: `{primer_nombre}` correcto; botón Gmail abre redacción con correo/asunto/cuerpo; menú ▾ cambia cliente.
5. CXP → pagar facturas → Mensajes: estructura por proveedor, WhatsApp (usa `whatsapp`), correo por Gmail.
6. Tema oscuro y ancho móvil; roles sin permiso (solo lectura).

## 8. Validación realizada y límites

* **Ejecutado y OK:** las aserciones de la lógica TS (reemplazo de variables, variables desconocidas, armado CXP con/sin datos del maestro, enlaces Gmail, recorte de cuerpo largo).
* **Verificado:** compilación de tipos (strict) de todos los TS/TSX entregados con stubs. No sustituye a `next build` ni a ESLint.
* **No ejecutado:** el SQL (revisado a mano: paréntesis y `$$` balanceados; funciones existentes parcheadas programáticamente desde tu esquema) y la UI en navegador.
* **Pendiente/limitaciones:** `{ciudad}` vacía sin captura de ubicaciones; no hay tipo "similitud"; el selector de vista previa carga hasta 200 proveedores; `Selector.tsx` y el flujo antiguo de solicitudes siguen con su UI (ahora respetan la estructura del proveedor vía SQL); en caso de dos proveedores con el mismo número y distinto tipo de documento, CXP elige el de tipo NIT.
