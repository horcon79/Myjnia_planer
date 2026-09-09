import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import ts from 'typescript';
import { PrismaClient } from '@prisma/client';

test('SQLite release is atomic, retains snapshots and keeps logs after order deletion', async () => {
  mkdirSync(join(tmpdir(), 'kilo'), { recursive: true });
  const directory = mkdtempSync(join(tmpdir(), 'kilo', 'checklist-test-'));
  const url = `file:${join(directory, 'test.db').replaceAll('\\', '/')}`;
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    execFileSync(process.execPath, [
      fileURLToPath(import.meta.resolve('prisma/build/index.js')),
      'db', 'push', '--skip-generate', '--schema', fileURLToPath(new URL('../prisma/schema.prisma', import.meta.url)),
    ], { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
    const source = readFileSync(new URL('../src/actions/orders.ts', import.meta.url), 'utf8');
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const actions = {};
    vm.runInNewContext(js, { exports: actions, console: { error() {} }, require: id => {
      if (id === '@/lib/prisma') return { prisma };
      if (id === '@/actions/auth') return { getCurrentUser: async () => ({ role: 'WASHER', slug: 'myjnia', name: 'Myjnia' }) };
      if (id === 'next/cache') return { revalidatePath() {} };
      throw new Error(`Unexpected import: ${id}`);
    } });
    const category = await prisma.washCategory.create({ data: { name: 'Delivery', checklistRequired: true, checklistMarkdown: '- Clean windows' } });
    const department = await prisma.department.create({ data: { name: 'Salon', slug: 'salon', code: 'SAL', color: '#ffffff' } });
    const employee = await prisma.employee.create({ data: { name: 'Test employee', shortName: 'TE' } });
    const order = await prisma.washOrder.create({ data: {
      orderNumber: 'TEST-1', licensePlate: 'TEST123', status: 'READY', carType: 'PASSENGER',
      departmentId: department.id, categoryId: category.id, targetReadyTime: new Date(), durationMin: 30,
    } });
    const input = { employeeId: employee.id, categoryId: category.id, checklistConfirmed: true, checklistMarkdown: category.checklistMarkdown };
    assert.equal((await actions.releaseOrder(order.id, { ...input, checklistConfirmed: false })).success, false);
    assert.equal(await prisma.orderReleaseLog.count(), 0);
    const attempts = await Promise.all([actions.releaseOrder(order.id, input), actions.releaseOrder(order.id, input)]);
    assert.equal(attempts.filter(result => result.success).length, 1);
    assert.equal((await prisma.washOrder.findUniqueOrThrow({ where: { id: order.id } })).status, 'COMPLETED');
    assert.equal(await prisma.orderReleaseLog.count(), 2);
    await prisma.washCategory.update({ where: { id: category.id }, data: { checklistMarkdown: '- Changed' } });
    const logs = await prisma.orderReleaseLog.findMany();
    assert.ok(logs.every(log => log.checklistMarkdown === '- Clean windows' && log.employeeName === employee.name));
    await prisma.washOrder.update({ where: { id: order.id }, data: { status: 'READY' } });
    assert.equal((await actions.releaseOrder(order.id, { ...input, checklistMarkdown: '- Changed' })).success, false);
    assert.equal((await prisma.washOrder.findUniqueOrThrow({ where: { id: order.id } })).status, 'READY');
    assert.equal(await prisma.orderReleaseLog.count(), 2);
    await prisma.washOrder.delete({ where: { id: order.id } });
    const retained = await prisma.orderReleaseLog.findMany();
    assert.equal(retained.length, 2);
    assert.ok(retained.every(log => log.orderId === null && log.orderIdSnapshot === order.id && log.orderNumber === 'TEST-1'));
  } finally {
    await prisma.$disconnect();
    rmSync(directory, { recursive: true, force: true });
  }
});
