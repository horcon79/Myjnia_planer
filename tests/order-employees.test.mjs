import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import ts from 'typescript';
import { PrismaClient } from '@prisma/client';

test('legacy backfill and multi-employee scheduling preserve atomic assignments', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'order-employees-'));
  const url = `file:${join(dir, 'test.db')}`;
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const cli = fileURLToPath(import.meta.resolve('prisma/build/index.js'));
  const env = { ...process.env, DATABASE_URL: url };
  try {
    execFileSync(process.execPath, [cli, 'db', 'push', '--skip-generate'], { env, stdio: 'pipe' });
    await prisma.$executeRawUnsafe('DROP TABLE "OrderEmployee"');
    const department = await prisma.department.create({ data: { slug: 'test', name: 'Test', code: 'T' } });
    const category = await prisma.washCategory.create({ data: { name: 'Test' } });
    const a = await prisma.employee.create({ data: { name: 'A', shortName: 'A' } });
    const b = await prisma.employee.create({ data: { name: 'B', shortName: 'B' } });
    const inactive = await prisma.employee.create({ data: { name: 'C', shortName: 'C', isActive: false } });
    const legacy = await prisma.washOrder.create({ data: { orderNumber: '1', licensePlate: 'TEST', departmentId: department.id, categoryId: category.id, targetReadyTime: new Date('2030-01-01T15:00:00Z'), assignedEmployeeId: a.id } });
    const migration = fileURLToPath(new URL('../prisma/migrations/20261102_order_employees/migration.sql', import.meta.url));
    const startupMigration = fileURLToPath(new URL('../scripts/migrate-order-employees.js', import.meta.url));
    execFileSync(process.execPath, [startupMigration], { env, stdio: 'pipe' });
    assert.equal(await prisma.orderEmployee.count({ where: { orderId: legacy.id, employeeId: a.id } }), 1);
    await prisma.orderEmployee.deleteMany({ where: { orderId: legacy.id } });
    execFileSync(process.execPath, [startupMigration], { env, stdio: 'pipe' });
    assert.equal(await prisma.orderEmployee.count({ where: { orderId: legacy.id } }), 0);
    await prisma.orderEmployee.create({ data: { orderId: legacy.id, employeeId: a.id } });
    assert.throws(() => execFileSync(process.execPath, [cli, 'db', 'execute', '--file', migration, '--url', url], { env, stdio: 'pipe' }));
    const transpile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const planner = {};
    vm.runInNewContext(transpile('../src/lib/planner.ts'), { exports: planner });
    const actions = {};
    vm.runInNewContext(transpile('../src/actions/orders.ts'), { exports: actions, console: { error() {} }, require: id => {
      if (id === '@/lib/prisma') return { prisma };
      if (id === '@/actions/auth') return { getCurrentUser: async () => ({ role: 'WASHER' }) };
      if (id === 'next/cache') return { revalidatePath() {} };
      if (id === '@/lib/planner') return planner;
      throw new Error(id);
    } });
    const schedule = assignedEmployeeIds => actions.scheduleOrder(legacy.id, { scheduledStartTime: '2030-01-01T10:00:00Z', assignedEmployeeIds });
    assert.equal((await schedule([a.id, b.id])).success, true);
    const stale = await prisma.washOrder.findUniqueOrThrow({ where: { id: legacy.id } });
    assert.equal((await schedule([a.id])).success, true);
    assert.equal((await actions.scheduleOrder(legacy.id, { scheduledStartTime: '2030-01-01T10:00:00Z', assignedEmployeeIds: [b.id], expectedUpdatedAt: stale.updatedAt.toISOString() })).success, false);
    assert.equal(await prisma.orderEmployee.count({ where: { orderId: legacy.id, employeeId: a.id } }), 1);
    assert.equal((await schedule([a.id, b.id])).success, true);
    await prisma.employee.update({ where: { id: b.id }, data: { isActive: false } });
    assert.equal((await schedule([a.id, b.id])).success, true);
    assert.equal((await schedule([a.id])).success, true);
    assert.equal((await schedule([a.id, b.id])).success, false);
    await prisma.employee.update({ where: { id: b.id }, data: { isActive: true } });
    assert.equal((await schedule([a.id, b.id])).success, true);
    assert.equal((await schedule([a.id, a.id])).success, false);
    assert.equal((await schedule([a.id, inactive.id])).success, false);
    assert.equal((await schedule([a.id, 'missing'])).success, false);
    let order = await prisma.washOrder.findUniqueOrThrow({ where: { id: legacy.id }, include: { assignedEmployees: true } });
    assert.equal(order.assignedEmployeeId, a.id);
    assert.equal(order.assignedEmployees.length, 2);
    assert.equal((await actions.scheduleOrder(legacy.id, { scheduledStartTime: '2030-01-01T11:00:00Z' })).success, true);
    assert.equal(await prisma.orderEmployee.count({ where: { orderId: legacy.id } }), 2);
    assert.equal((await schedule([])).success, true);
    order = await prisma.washOrder.findUniqueOrThrow({ where: { id: legacy.id }, include: { assignedEmployees: true } });
    assert.equal(order.assignedEmployeeId, null);
    assert.equal(order.assignedEmployees.length, 0);
    assert.equal((await actions.scheduleOrder(legacy.id, { scheduledStartTime: '2030-01-01T10:00:00Z', assignedEmployeeId: b.id })).success, true);
    assert.equal(await prisma.orderEmployee.count({ where: { orderId: legacy.id, employeeId: b.id } }), 1);
    const input = { licensePlate: 'NEW', carType: 'PASSENGER', departmentId: department.id, categoryId: category.id, targetReadyTime: '2030-01-01T15:00:00Z', assignedEmployeeIds: [a.id, b.id] };
    const created = await actions.createOrder(input);
    assert.equal(created.success, true);
    assert.equal(created.order.assignedEmployeeId, a.id);
    assert.equal(created.order.assignedEmployees.length, 2);
    const count = await prisma.washOrder.count();
    assert.equal((await actions.createOrder({ ...input, assignedEmployeeIds: [inactive.id] })).success, false);
    assert.equal(await prisma.washOrder.count(), count);
    const attempts = await Promise.all([schedule([a.id]), schedule([b.id])]);
    assert.ok(attempts.some(result => result.success));
    order = await prisma.washOrder.findUniqueOrThrow({ where: { id: legacy.id }, include: { assignedEmployees: true } });
    assert.equal(order.assignedEmployees.length, 1);
    assert.equal(order.assignedEmployees[0].employeeId, order.assignedEmployeeId);
    const moved = await prisma.washOrder.create({ data: {
      orderNumber: 'MOVED', licensePlate: 'MOVED', departmentId: department.id, categoryId: category.id,
      targetReadyTime: new Date('2040-01-01T12:00:00'), scheduledStartTime: new Date('2040-01-02T12:00:00'), scheduledEndTime: new Date('2040-01-02T12:30:00'),
    } });
    const sameDay = await prisma.washOrder.create({ data: {
      orderNumber: 'SAME', licensePlate: 'SAME', departmentId: department.id, categoryId: category.id,
      targetReadyTime: new Date('2040-01-01T14:00:00'), scheduledStartTime: new Date('2040-01-01T13:00:00'),
    } });
    const targetDay = await actions.getOrdersForDate('2040-01-01');
    assert.equal(targetDay.success, true);
    assert.equal(targetDay.orders.some(o => o.id === moved.id), false);
    assert.equal(targetDay.departmentOrders.filter(o => o.id === moved.id).length, 1);
    assert.equal(targetDay.departmentOrders.filter(o => o.id === sameDay.id).length, 1);
    assert.equal(targetDay.capacityOrders.some(o => o.id === moved.id), false);
    const startDay = await actions.getOrdersForDate('2040-01-02');
    assert.equal(startDay.orders.filter(o => o.id === moved.id).length, 1);
    assert.equal(startDay.departmentOrders.filter(o => o.id === moved.id).length, 1);
    assert.equal(startDay.capacityOrders.filter(o => o.id === moved.id).length, 1);
    const snapshot = await actions.getPlannerSnapshot('2040-01-01');
    assert.equal(snapshot.orders.some(o => o.id === moved.id), false);
    assert.deepEqual(await prisma.$queryRawUnsafe('PRAGMA foreign_key_check'), []);
  } finally {
    await prisma.$disconnect();
    rmSync(dir, { recursive: true, force: true });
  }
});
