#!/usr/bin/env bash
# Pruebas de base de datos de organizaciones, roles, invitaciones y seguridad.
#
# Qué hace: crea una base LOCAL temporal, simula lo mínimo de Supabase (roles y esquema "auth"),
# carga el esquema de tu proyecto, aplica las migraciones de supabase/migrations/ y corre cada suite
# sobre una base limpia. No toca tu base de Supabase.
#
# Requisitos: PostgreSQL 15+ local, con psql/createdb/dropdb, y un usuario con permiso para crear
# bases y roles (en una instalación local suele ser "postgres"). Se conecta con las variables
# estándar PGHOST, PGPORT, PGUSER y PGPASSWORD.
#
# Uso:   bash tests/db/run.sh ruta/a/tu/schema.sql
#   (schema.sql es el volcado del esquema de tu proyecto; ver tests/README.md. NO lo subas a git.)
set -uo pipefail

ESQUEMA="${1:-}"
if [ -z "$ESQUEMA" ] || [ ! -f "$ESQUEMA" ]; then
  echo "Indica la ruta del volcado del esquema:  bash tests/db/run.sh ruta/a/schema.sql" >&2
  exit 2
fi
ESQUEMA="$(cd "$(dirname "$ESQUEMA")" && pwd)/$(basename "$ESQUEMA")"
DB="${TEST_DB:-authgo_test}"
AQUI="$(cd "$(dirname "$0")" && pwd)"
MIGRACIONES="$AQUI/../../supabase/migrations"

ERR="$(mktemp)"
trap 'rm -f "$ERR"' EXIT

psql_q() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }

reconstruir() {
  dropdb --if-exists "$DB" >/dev/null 2>&1
  createdb "$DB" || { echo "No pude crear la base $DB: revisa PGUSER/PGHOST." >&2; exit 2; }
  psql_q -d "$DB" -f "$AQUI/stubs.sql" || exit 2
  # El volcado puede traer líneas propias de Supabase; no se corta por ellas, pero se avisa.
  local errores
  errores=$(psql -X -q -d "$DB" -f "$ESQUEMA" 2>&1 | grep -ci "error" || true)
  [ "$errores" != "0" ] && echo "  (aviso: el esquema dio $errores mensaje(s) de error al cargarse)" >&2
  psql_q -d "$DB" -f "$AQUI/seed.sql" || exit 2
  for m in "$MIGRACIONES"/*.sql; do
    psql_q -d "$DB" -f "$m" >/dev/null 2>"$ERR" || { echo "Falló la migración $(basename "$m"):"; cat "$ERR"; exit 2; }
  done
}

SUITES=(
  "01_orgs_invitaciones.sql:TODAS_LAS_PRUEBAS_OK"
  "02_propietario.sql:PROPIETARIO_OK"
  "03_roles.sql:ROLES_OK"
  "04_admin_extras.sql:EXTRAS_OK"
  "05_seguridad_columnas.sql:SEGURIDAD_OK"
  "06_cxp_fase1.sql:CXP_FASE1_OK"
)

fallo=0
for par in "${SUITES[@]}"; do
  archivo="${par%%:*}"; marca="${par##*:}"
  reconstruir
  salida="$(psql -X -q -d "$DB" -f "$AQUI/$archivo" 2>&1)"
  oks=$(printf '%s\n' "$salida" | grep -c "NOTICE:  ok")
  if printf '%s\n' "$salida" | grep -q "$marca" && ! printf '%s\n' "$salida" | grep -qE "ERROR|FALLO|DEBIO FALLAR"; then
    printf 'OK     %-32s %s comprobaciones\n' "$archivo" "$oks"
  else
    printf 'FALLÓ  %-32s\n' "$archivo"
    printf '%s\n' "$salida" | grep -E "ERROR|FALLO|DEBIO FALLAR" | head -5 | sed 's/^/         /'
    fallo=1
  fi
done

dropdb --if-exists "$DB" >/dev/null 2>&1
[ "$fallo" = "0" ] && echo "Todas las suites pasaron." || echo "Hay suites con fallos."
exit "$fallo"
