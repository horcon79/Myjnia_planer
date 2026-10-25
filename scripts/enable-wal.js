/*
 * Włącza trwały tryb WAL dla bazy SQLite.
 * Tryb WAL jest cechą pliku bazy - wystarczy ustawić go raz, ale skrypt jest idempotentny
 * i uruchamiany przy każdym starcie kontenera (świeży wolumen również dostaje WAL).
 */
const { PrismaClient } = require('@prisma/client');

(async () => {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL');
    const mode = Array.isArray(rows) && rows[0] ? rows[0].journal_mode : 'unknown';
    console.log(`==> SQLite journal_mode: ${mode}`);
    if (mode !== 'wal') {
      console.error('==> UWAGA: nie udało się włączyć trybu WAL.');
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('==> Błąd podczas włączania WAL:', error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
