-- Run once on a verified backup before starting the new application version.
BEGIN IMMEDIATE;
CREATE TABLE "OrderEmployee" (
  "orderId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  PRIMARY KEY ("orderId", "employeeId"),
  CONSTRAINT "OrderEmployee_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "WashOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrderEmployee_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "OrderEmployee_employeeId_idx" ON "OrderEmployee"("employeeId");
INSERT INTO "OrderEmployee" ("orderId", "employeeId")
SELECT "id", "assignedEmployeeId" FROM "WashOrder" WHERE "assignedEmployeeId" IS NOT NULL;
COMMIT;
