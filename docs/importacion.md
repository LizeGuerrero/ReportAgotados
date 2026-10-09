# ¿Cómo cargar información al sistema?

La carga masiva está en **Importaciones** (menú lateral). Sirve para pasar a la aplicación datos que salen del ERP
o de una hoja de Excel, sin digitarlos uno por uno.

> **Tipos de carga disponibles hoy:** Proveedores.
> **Próximamente:** Ítems y Referencias por proveedor (ítem ↔ proveedor).

## Permisos necesarios
| Para… | Se necesita |
|---|---|
| Ver el historial de cargas | Módulo **importaciones** → ver |
| Subir, validar y aplicar una carga | **importaciones** → crear, **y además** el permiso del destino |
| Cargar proveedores | **Proveedores** → crear **y** editar |

El administrador configura esto en *Roles*. Cada persona solo puede aplicar o descartar **sus propias** cargas.

## El proceso paso a paso
1. **Descarga la plantilla** (.xlsx) del tipo de carga. Trae una hoja *Datos* con los títulos y un ejemplo, y una hoja
   *Instrucciones* con qué escribir en cada columna.
2. **Llénala**, o usa directamente el archivo que exporta tu ERP (.xlsx o .csv). Los títulos de tu archivo no tienen
   que ser iguales: el sistema los reconoce (NIT, Razón social, Correo…) y tú puedes corregir la correspondencia.
3. **Sube el archivo.** Revisa en pantalla qué columna corresponde a cada dato.
4. **Validar.** El sistema revisa todo **sin cambiar nada** y te muestra, por ejemplo:
   `✓ 4.997 filas válidas · ✗ 3 con error`, y cuántas son nuevas, por actualizar o sin cambios.
5. **Revisa los errores.** Puedes verlos en pantalla o **descargarlos en Excel** (con el número de fila de tu
   archivo y el motivo) para corregirlos y volver a subir solo esas filas.
6. **Cargar.** Confirma. Se cargan **solo las filas válidas**; las que tienen error se omiten.
7. **Resumen:** procesados, nuevos, actualizados, sin cambios y con error. Queda en el **historial**.

Si algo no te convence, **Descartar** deja todo como estaba.

## Reglas generales
- **Una celda vacía nunca borra** un dato que ya existe; solo se usa para completar.
- Se aceptan **.xlsx** y **.csv** (UTF-8 o Windows-1252; separador `;`, `,` o tabulador). El formato antiguo `.xls`
  debe guardarse como .xlsx. Máximo **20.000 filas** por archivo.
- Si el archivo tiene varias hojas, se lee la hoja llamada **Datos**; si no existe, la primera visible.
- Los números de documento y teléfonos se leen como **texto**: `00587` se conserva. Si tu Excel los muestra como
  número (sin el cero), formatea la columna como *Texto* antes de escribirlos (la plantilla ya viene así).
- Cada carga queda registrada (quién, cuándo, qué archivo) y los cambios en los datos quedan en el **Historial** del
  proveedor.

## Carga de PROVEEDORES
Un proveedor se identifica por **tipo + número de documento** dentro de la organización. Si ya existe se actualiza;
si no, se crea.

| Columna | ¿Obligatoria? | Qué escribir | Ejemplo |
|---|---|---|---|
| Tipo de documento | No | `NIT`, `CC`, `CE`, `PAS` u `OTRO`. Vacío = NIT | NIT |
| Número de documento | **Sí** | Sin puntos, guiones ni dígito de verificación (3 a 20 letras o números) | 900123456 |
| Nombre | **Sí** si el proveedor es nuevo | Razón social o nombre | Distribuidora Andina S.A.S. |
| Contacto | No | Persona de contacto | Laura Gómez |
| Teléfono | No | Teléfono o celular | 3001234567 |
| Correo | No | Debe tener formato de correo | ventas@andina.co |
| Notas | No | Observaciones | |
| Cobra IVA | No | `Sí` / `No`. Vacío: nuevo = Sí; existente = no cambia | Sí |
| IVA de compra | No | `19`, `19%` o `0,19`. Vacío: nuevo = 19 %; existente = no cambia | 19 |

**Errores que detecta:** número de documento vacío o con formato inválido, tipo de documento desconocido, nombre
vacío en un proveedor nuevo, correo inválido, "Cobra IVA" distinto de Sí/No, IVA fuera de 0–100 %, y el mismo
documento repetido dentro del archivo.

## Carga de ÍTEMS *(próximamente)*
Se identificarán por **código ERP** (único por organización). Columnas previstas: código ERP\*, nombre\*, unidad de
medida, línea, categoría, grupo, grupo contable, código de línea, marca, descripción 2, IVA de venta, notas,
información técnica, aplicación técnica. Los códigos no existentes se crean; los existentes se actualizan.

## Carga de ÍTEM–PROVEEDOR *(próximamente)*
Relaciona un ítem con un proveedor y lo que ese proveedor llama a ese producto. Columnas previstas: código ERP del
ítem\*, documento del proveedor\*, referencia del proveedor, nombre según el proveedor, unidades por caja, costo
(sin IVA), días de entrega, preferido, notas. Un proveedor puede tener **varias referencias** para un mismo ítem
(una fila por referencia).
