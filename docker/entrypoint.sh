#!/bin/sh
set -e

echo "==> Myjnia Planer - start kontenera"
echo "==> DATABASE_URL=${DATABASE_URL}"

PRISMA_BIN="./node_modules/.bin/prisma"

# Wyciągnij ścieżkę pliku z file:/data/myjnia.db
DB_FILE="${DATABASE_URL#file:}"

NEED_SEED=false
if [ ! -f "$DB_FILE" ]; then
  NEED_SEED=true
fi

echo "==> Aplikowanie schematu bazy danych (prisma db push)..."
"$PRISMA_BIN" db push --skip-generate

if [ "$NEED_SEED" = "true" ]; then
  echo "==> Nowa baza danych - uruchamiam seed (dane startowe)..."
  npm run db:seed
else
  echo "==> Baza danych już istnieje - pomijam seed."
fi

echo "==> Uruchamianie serwera Next.js (tryb produkcyjny)..."
exec npm start
