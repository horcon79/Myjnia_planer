#!/bin/sh
set -e

echo "==> Myjnia Planer - start kontenera"
echo "==> DATABASE_URL=${DATABASE_URL}"

PRISMA_BIN="./node_modules/.bin/prisma"

# Wyciągnij ścieżkę pliku bazy SQLite (usuwając ewentualne cudzysłowy i prefiks file:)
CLEAN_URL=$(echo "$DATABASE_URL" | tr -d '"' | tr -d "'")
DB_FILE="${CLEAN_URL#file:}"

NEED_SEED=false
if [ -z "$DB_FILE" ] || [ ! -f "$DB_FILE" ]; then
  NEED_SEED=true
fi

echo "==> Aplikowanie schematu bazy danych (prisma db push)..."
"$PRISMA_BIN" db push --skip-generate

if [ "$NEED_SEED" = "true" ]; then
  echo "==> Inicjalizacja nowej bazy danych..."
  npm run db:seed || true
else
  echo "==> Baza danych już istnieje - pomijam seed."
fi

echo "==> Uruchamianie serwera Next.js (tryb produkcyjny)..."
exec npm start
