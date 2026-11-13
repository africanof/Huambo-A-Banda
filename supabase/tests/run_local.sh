#!/usr/bin/env bash
# Valida as migrações + testes de segurança num PostgreSQL local (sem Docker).
# Uso: PGURL=postgres://postgres@127.0.0.1:5432/postgres supabase/tests/run_local.sh
set -euo pipefail
cd "$(dirname "$0")/.."
PGURL="${PGURL:-postgres://postgres@127.0.0.1:5432/postgres}"
DB="huambo_migration_test_$$"
psql "$PGURL" -v ON_ERROR_STOP=1 -qc "create database $DB"
trap 'psql "$PGURL" -qc "drop database if exists $DB" >/dev/null' EXIT
TARGET="${PGURL%/*}/$DB"
psql "$TARGET" -v ON_ERROR_STOP=1 -q -f tests/supabase_shim.sql
for f in migrations/*.sql; do
  echo "→ $f"
  psql "$TARGET" -v ON_ERROR_STOP=1 -q -f "$f"
done
psql "$TARGET" -v ON_ERROR_STOP=1 -q -f seed.sql
psql "$TARGET" -v ON_ERROR_STOP=1 -q -f tests/security_test.sql
