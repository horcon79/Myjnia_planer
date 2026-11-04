const { PrismaClient } = require('@prisma/client');

(async () => {
  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(async tx => {
      const tables = await tx.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('WashOrder', 'OrderEmployee')");
      if (!tables.some(table => table.name === 'WashOrder') || tables.some(table => table.name === 'OrderEmployee')) return;
      await tx.$executeRawUnsafe('CREATE TABLE "OrderEmployee" ("orderId" TEXT NOT NULL, "employeeId" TEXT NOT NULL, PRIMARY KEY ("orderId", "employeeId"), FOREIGN KEY ("orderId") REFERENCES "WashOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE, FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE)');
      await tx.$executeRawUnsafe('CREATE INDEX "OrderEmployee_employeeId_idx" ON "OrderEmployee"("employeeId")');
      await tx.$executeRawUnsafe('INSERT INTO "OrderEmployee" ("orderId", "employeeId") SELECT "id", "assignedEmployeeId" FROM "WashOrder" WHERE "assignedEmployeeId" IS NOT NULL');
    });
  } catch (error) {
    console.error('==> Błąd migracji przypisań:', error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
