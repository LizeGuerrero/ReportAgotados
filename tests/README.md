# Pruebas y migraciones

Esta carpeta y `supabase/migrations/` se agregaron junto con las organizaciones, invitaciones, roles
y el panel de administración. Nada de aquí se ejecuta con tu aplicación: son herramientas para
comprobar que los cambios futuros no rompen la seguridad.

## Migraciones (`supabase/migrations/`)

Se aplican **en orden** sobre el esquema que ya tienes (el de Pedidos y Agotados):

| Archivo | Qué hace |
|---|---|
| `…000100_orgs_invitaciones.sql` | Organizaciones, propietario, invitaciones, solicitudes, `es_admin_org` y la política de `roles` |
| `…000200_roles_dashboard.sql` | Crear, editar y eliminar roles; guardar su matriz de permisos |
| `…000300_admin_extras.sql` | Suspender/retirar miembros, sedes, restablecer roles base e historial |
| `…000400_seguridad_columnas.sql` | Protege columnas de `profiles` y `organizaciones` contra edición directa |

- **Son idempotentes**: si ya aplicaste versiones anteriores, vuelve a ejecutar los cuatro archivos
  en orden; no duplican nada y dejan la base en el estado actual (se comprobó aplicando la cadena
  completa tres veces seguidas).
- **Dónde aplicarlas**: pegándolas una por una en el SQL Editor de Supabase, o con
  `npx supabase db push`. Con la CLI no las he probado; cada archivo ya trae su propio
  `begin; … commit;`, así que si la CLI se queja de la transacción, quita esas dos líneas.
- `parche_propietario.sql` (entregado antes) ya no hace falta: su contenido está en el primer archivo.
- Tu `.gitignore` excluye `*.sql`; se agregaron excepciones solo para estas migraciones y para
  `tests/db/` (no tienen datos). El volcado del esquema (`schema.sql`) **sigue ignorado**: no lo subas.

## Pruebas de base de datos (`tests/db/`) — 223 comprobaciones

Crean una base **local temporal** (no tocan tu Supabase), simulan lo mínimo de Supabase, cargan tu
esquema, aplican las migraciones y corren cinco suites, cada una sobre una base limpia:
invitaciones y solicitudes, propietario protegido, roles, extras del panel y seguridad de columnas.

1. Necesitas PostgreSQL 15 o superior en tu máquina y un usuario que pueda crear bases y roles.
2. Saca el esquema de tu proyecto (una sola vez, o cuando cambie):
   `npx supabase db dump --schema public -f schema.sql`
3. Corre: `bash tests/db/run.sh schema.sql`

Se conecta con las variables estándar `PGHOST`, `PGPORT`, `PGUSER` y `PGPASSWORD`. En Windows,
úsalo desde WSL o Git Bash. Resultado esperado:

```
OK     01_orgs_invitaciones.sql         49 comprobaciones
OK     02_propietario.sql               17 comprobaciones
OK     03_roles.sql                     53 comprobaciones
OK     04_admin_extras.sql              75 comprobaciones
OK     05_seguridad_columnas.sql        29 comprobaciones
Todas las suites pasaron.
```

## Pruebas de interfaz (`tests/ui/`) — 77 comprobaciones

Prueban el panel de administración (qué botones aparecen según la jerarquía, qué función se llama
y con qué datos) en un navegador simulado, con un Supabase de mentira. Están aisladas: tienen su
propio `package.json` y no modifican el de tu proyecto.

```
npm install              # en la raíz del proyecto, si aún no lo hiciste
cd tests/ui
npm install
npm test
```

## Qué NO cubren

- Tu Supabase real (autenticación, correos de confirmación, Google, URLs permitidas).
- Un navegador real (aspecto, diálogos, celular).
- El envío de correo de invitaciones.

Para eso está `PRUEBA_MANUAL.md`.
