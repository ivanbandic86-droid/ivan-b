#!/usr/bin/env bash
# Testira shemu na lokalnom Postgresu (ne dira Supabase).
# Primjer: PSQL="runuser -u postgres -- psql" supabase/tests/run.sh
set -euo pipefail
PSQL=${PSQL:-psql}
DB=kiperlog_test
dir="$(cd "$(dirname "$0")" && pwd)"
$PSQL -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
$PSQL -q -v ON_ERROR_STOP=1 -d "$DB" -f - < "$dir/shim.sql"
$PSQL -q -v ON_ERROR_STOP=1 -d "$DB" -f - < "$dir/../schema.sql"
$PSQL -d "$DB" -f - < "$dir/test.sql" 2>&1 | sed -E 's/^psql:<stdin>:[0-9]+: (NOTICE|ERROR):  //' | grep -v '^$'
