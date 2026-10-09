# Prueba manual completa

Haz esta prueba una vez con tu Supabase real, antes de usar el sistema con gente de verdad.
Marca cada paso. Si algo no da el resultado esperado, anota qué viste (y el mensaje exacto).

## 0. Preparación

- [ ] Aplicaste las 4 migraciones de `supabase/migrations/` en orden.
- [ ] En `.env.local`: `NEXT_PUBLIC_SITE_URL=http://localhost:3000` (en producción, tu URL real).
- [ ] En Supabase → Authentication → URL Configuration: la URL de tu sitio y `…/auth/callback` están permitidas.
- [ ] Tienes **3 correos reales** a mano y un navegador normal + una ventana privada:
  **A** (será administradora), **B** (invitado por enlace), **C** (pedirá unirse sin invitación).

## 1. Registro y perfil

| Paso | Resultado esperado | ✔ |
|---|---|---|
| Registrar a **A** con correo | Llega el correo de confirmación; al confirmar, entra a la app | |
| Entrar con Google (otra cuenta) | Pide "Completar perfil" antes de seguir | |
| Completar perfil con un **documento ya usado** | Mensaje "Ese nombre de usuario o ese documento ya está registrado" | |
| Entrar a `/app/cualquier-cosa` sin sesión | Te manda a `/login` | |

## 2. Crear organización (A)

| Paso | Resultado esperado | ✔ |
|---|---|---|
| A entra sin organización | Ve "Crear una organización" / "Unirme a una organización" | |
| Crear con nombre e identificación (NIT) | Te lleva a `/app/<slug>/admin`; ves pestañas Solicitudes, Miembros, Invitaciones, Roles, Sedes, Historial | |
| Pestaña **Miembros** | A aparece como admin, con la insignia **Propietario**, y su selector de rol está bloqueado | |
| Pestaña **Roles** | 6 roles: Predeterminado, admin, Bodega, Comercial, Compras, Gerencia | |
| Pestaña **Sedes** | Una sede "Principal" | |
| Pestaña **Historial** | Una sola entrada: "creó la organización …" | |
| Crear otra organización con el **mismo NIT** | Rechaza: "Ya existe una organización con esa identificación" | |

## 3. Invitación por enlace (A invita a B)

| Paso | Resultado esperado | ✔ |
|---|---|---|
| Invitaciones → correo de B, rol **Comercial**, sede Principal | Aparece el enlace para copiar; avisa si el correo no está configurado | |
| Abrir el enlace en **ventana privada** | Te manda a `/login` (registro abierto) mostrando la organización y el correo de B **bloqueado** | |
| Registrarse como B y confirmar el correo | Al volver, aparece "Invitación a una organización" con **Aceptar** | |
| Aceptar | Entra a la organización con rol Comercial; ve Agotados, **no** Pedidos | |
| Abrir **el mismo enlace otra vez** | "Esta invitación ya fue utilizada" | |
| Con A, crear otra invitación para un correo y abrirla con la sesión de B | Avisa que es para otro correo y ofrece cerrar sesión | |
| Invitación **cancelada** / **vencida** (cambia `expira_en` por SQL) | Mensaje claro; "Reenviar" genera un enlace nuevo | |

## 4. Solicitud sin invitación (C)

| Paso | Resultado esperado | ✔ |
|---|---|---|
| C se registra, "Unirme a una organización", escribe el NIT | "Solicitud enviada"; en el inicio se ve la solicitud pendiente | |
| Mientras está pendiente, C intenta `/app/<slug>/agotados` | No entra (`/sin-acceso`) | |
| A ve la solicitud (pestaña Solicitudes, con insignia) y **acepta como Predeterminado** | C entra y ve solo sus datos y los de la organización, sin módulos | |
| Repetir con otra cuenta y **rechazar** | La persona no queda como miembro; puede volver a solicitar | |

## 5. Roles y acceso a módulos

| Paso | Resultado esperado | ✔ |
|---|---|---|
| Roles → crear "Supervisor" copiando Comercial | Se crea con los mismos permisos | |
| Marcar **Crear** en un módulo sin **Ver** | Marca Ver automáticamente | |
| Intentar dar el módulo **Roles** a Supervisor | Casilla bloqueada: "Reservado al administrador" | |
| Eliminar un rol que tiene miembros | Botón deshabilitado | |
| Vaciar los permisos de Comercial y pulsar **Restablecer originales** | Vuelven los 2 permisos de fábrica | |
| **Ver comparación de roles** | Tabla de módulos × roles, solo lectura | |
| Con C (Predeterminado) escribir a mano `/app/<slug>/pedidos` | Pantalla "No tienes autorización para acceder a este módulo. Módulo: Pedidos" | |
| Dar a C el rol Comercial **sin sede** | El panel avisa "no podrá usar Agotados ni Pedidos…"; en Agotados da el error de sede | |
| Asignarle sede | Ya puede usar Agotados | |

## 6. Jerarquía y miembros

| Paso | Resultado esperado | ✔ |
|---|---|---|
| A **suspende** a B | B pierde el acceso al recargar (`/sin-acceso`) y sus peticiones a Pedidos/Agotados fallan | |
| A **reactiva** a B | Recupera el acceso | |
| A **retira** a B | B desaparece del listado; puede volver a solicitar | |
| Promover a C a admin; con C intentar quitarle el rol o suspender a A | No hay botones; el rol de A aparece bloqueado | |
| Con C intentar degradar/suspender a otro admin | Sin botones: "Solo el propietario puede…" | |
| Nadie puede cambiar su propio rol | Selector bloqueado en la propia fila | |
| A pulsa **Hacer propietario** sobre C | Pide confirmación; C pasa a ser propietario y A ya no tiene protección | |

## 7. Aislamiento entre organizaciones

| Paso | Resultado esperado | ✔ |
|---|---|---|
| Con un usuario de la organización 1, abrir `/app/<slug-de-la-org-2>/admin` | 404 o `/sin-acceso`; nunca datos de la otra | |
| Con un usuario **no admin**, abrir `/app/<slug>/admin` | "No tienes autorización… Módulo: Administración" | |

## 8. Sedes e historial

| Paso | Resultado esperado | ✔ |
|---|---|---|
| Crear la sede "Norte"; renombrarla; eliminarla | Funciona; "Principal" no se puede eliminar si es la única o tiene miembros | |
| Historial después de todo lo anterior | Cada acción aparece con autor y fecha, más reciente primero | |

## 9. Antes de publicar

- [ ] `NEXT_PUBLIC_SITE_URL` apunta a tu dominio real (si no, los enlaces de invitación salen mal).
- [ ] Authentication → URL Configuration tiene la URL de producción.
- [ ] Rotaste `SUPABASE_SECRET_KEY` (viajó dentro de un zip).
- [ ] Decidiste cómo enviar las invitaciones por correo (hoy solo se copia el enlace).
