/*
 * Spójna kopia bazy SQLite (VACUUM INTO) - bezpieczna również przy włączonym WAL.
 * Użycie: node scripts/backup-db.js /data/backup-YYYYMMDD-HHMM.db
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

function defaultTarget() {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  return `/data/backup-${stamp}.db`;
}

(async () => {
  const target = process.argv[2] || defaultTarget();
  const directory = path.dirname(target);
  if (!fs.existsSync(directory)) {
    console.error(`==> Katalog docelowy nie istnieje: ${directory}`);
    process.exit(1);
  }
  if (fs.existsSync(target)) {
    console.error(`==> Plik kopii już istnieje: ${target}`);
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const escaped = target.replace(/'/g, "''");
    await prisma.$executeRawUnsafe(`VACUUM INTO '${escaped}'`);
    const size = fs.statSync(target).size;
    console.log(`==> Kopia bazy zapisana: ${target} (${(size / 1024 / 1024).toFixed(2)} MB)`);
  } catch (error) {
    console.error('==> Błąd tworzenia kopii:', error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
