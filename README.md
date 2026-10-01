# Auth App (Next.js + Supabase + TypeScript)

Proyecto Next.js (App Router) listo para arrancar, con el módulo de auth completo.

## Estructura

```
proxy.ts                          → protege rutas, exige perfil completo, valida membresía/rol
                                     (en Next.js 16 este archivo reemplaza a middleware.ts)
app/login/page.tsx                → selector Google / correo
app/auth/callback/route.ts        → recibe el redirect de Google OAuth
app/auth/signout/route.ts         → cierra sesión
app/completar-perfil/page.tsx     → pide los campos que Google no trajo
app/sin-acceso/page.tsx           → cuando no hay membresía activa
app/page.tsx                      → página protegida de ejemplo (home)
lib/supabase/client.ts            → cliente para componentes 'use client'
lib/supabase/server.ts            → cliente para Server Components / route handlers
lib/supabase/middleware.ts        → cliente usado dentro del middleware
lib/phoneRules.ts                 → validación de celular por país
components/                       → formularios (login, registro, completar perfil)
types/auth.types.ts               → tipos compartidos
sql/schema.sql                    → profiles, organizaciones, roles, membresias
```

## Pasos para levantar el proyecto

1. **Crea el proyecto de Next.js** (o usa esta carpeta directamente):
   ```
   npm install
   ```
2. **Corre `sql/schema.sql`** en el SQL Editor de tu proyecto Supabase.
3. En Supabase → Authentication → Providers, activa **Google** con tu Client ID/Secret,
   y en **URL Configuration** agrega como Redirect URL:
   ```
   http://localhost:3000/auth/callback
   ```
   (y luego la URL de producción cuando despliegues).
4. Crea un bucket de Storage llamado `avatars` (público).
5. Copia `.env.local.example` a `.env.local` y llena tus credenciales de Supabase.
6. Corre el proyecto:
   ```
   npm run dev
   ```

## Cómo funciona el flujo

1. Usuario entra a cualquier ruta protegida sin sesión → `proxy.ts` lo manda a `/login`.
2. Elige Google o correo/contraseña (`app/login/page.tsx`).
   - **Google**: Supabase redirige a `/auth/callback`, que intercambia el código por sesión.
   - **Correo**: se registra directo con todos los campos pedidos en `RegisterForm`.
3. El trigger `handle_new_user` en Postgres crea la fila en `profiles` apenas se crea el usuario en `auth.users`, sea cual sea el método.
4. Si `perfil_completo = false` (típico en Google, que no trae documento/teléfono/username), el middleware redirige a `/completar-perfil` **antes** de dejar entrar a cualquier otra parte de la app.
5. Para rutas de una organización específica (`/app/[slug]/...`), el middleware valida en `membresias` que el usuario tenga `estado_membresia = 'activa'` y `activo = true` para esa organización — si no, va a `/sin-acceso`.

## Multi-app / roles

Como `membresias` vive en Supabase y no en cada app, cualquier aplicación conectada al mismo proyecto de Supabase puede:
- Consultar `membresias` filtrando por su propio `organizacion_id` (o `slug`).
- Un mismo usuario puede tener rol `admin` en una organización y `viewer` en otra, sin duplicar cuentas.

## Siguiente paso (backend especializado)

Cuando conectes tu backend propio:
- El backend valida el JWT de Supabase (`supabase.auth.getUser(token)`) que le llega desde el frontend.
- Puedes mover la lógica de `membresias`/`roles` al backend como fuente de verdad de negocio, dejando Next.js solo con la sesión y el guard de UI.
