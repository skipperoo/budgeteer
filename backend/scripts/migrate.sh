#!/usr/bin/env bash
set -euo pipefail

# -------------------------------------------------------------------
# Budgeteer Database Migration Script
#
# Applies all pending SQL migration files (backend/migrations/*.sql)
# that haven't been applied yet. Tracks applied files in a
# `schema_migrations` table so it is idempotent.
#
# Usage:
#   ./backend/scripts/migrate.sh
#
# Connection parameters are read from environment variables matching
# the backend config (DB_HOST, DB_PORT, DB_USER, DB_NAME).
# The password is read from the Docker secret /run/secrets/db_password
# if available, falling back to the DB_PASSWORD env var.
# -------------------------------------------------------------------

MIGRATIONS_DIR="$(cd "$(dirname "$0")/../src/migrations" && pwd)"

# --- Connection ----------------------------------------------------
: "${DB_HOST:=localhost}"
: "${DB_PORT:=5432}"
: "${DB_USER:=budgeteer}"
: "${DB_NAME:=budgeteer}"

DB_PASSWORD=""
if [ -f /run/secrets/db_password ]; then
  DB_PASSWORD="$(cat /run/secrets/db_password)"
else
  DB_PASSWORD="${DB_PASSWORD:-}"
fi

export PGHOST="$DB_HOST"
export PGPORT="$DB_PORT"
export PGUSER="$DB_USER"
export PGPASSWORD="$DB_PASSWORD"
export PGDATABASE="$DB_NAME"

# --- Helper --------------------------------------------------------
psql_exec() {
  psql -q -1 "$@"
}

echo "📦 Budgeteer Migration Script"
echo "   Host: $DB_HOST:$DB_PORT"
echo "   User: $DB_USER"
echo "   Database: $DB_NAME"
echo "   Migrations: $MIGRATIONS_DIR"
echo ""

# 1. Create tracking table if it does not exist
psql_exec -c "
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMPTZ DEFAULT NOW()
  );
"

# 2. List all migration files sorted by name
shopt -s nullglob
files=("$MIGRATIONS_DIR"/*.sql)
shopt -u nullglob

if [ ${#files[@]} -eq 0 ]; then
  echo "✅ No migration files found in $MIGRATIONS_DIR"
  exit 0
fi

applied=0
skipped=0

for f in "${files[@]}"; do
  filename="$(basename "$f")"

  # Check if already applied
  already=$(psql_exec -t -A -c "
    SELECT COUNT(*) FROM schema_migrations WHERE filename = '${filename}';
  " 2>/dev/null || echo "0")

  if [ "$already" -gt 0 ] 2>/dev/null; then
    echo "   ⏭️  $filename — already applied"
    skipped=$((skipped + 1))
    continue
  fi

  echo "   ▶️  Applying $filename..."

  if psql_exec -f "$f"; then
    psql_exec -c "
      INSERT INTO schema_migrations (filename) VALUES ('${filename}');
    "
    echo "   ✅ $filename — applied successfully"
    applied=$((applied + 1))
  else
    echo "   ❌ $filename — FAILED"
    exit 1
  fi
done

echo ""
echo "📋 Summary: $applied applied, $skipped skipped"
echo "🎉 Migration complete"
