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

test('deleting an employee preserves other assignments and rolls back on failure', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'delete-employee-'));
  const url = `file:${join(dir, 'test.db')}`;
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const cli = fileURLToPath(import.meta.resolve('prisma/build/index.js'));
  try {
    execFileSync(process.execPath, [cli, 'db', 'push', '--skip-generate'], { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
    const department = await prisma.department.create({ data: { slug: 'test', name: 'Test', code: 'T' } });
    const category = await prisma.washCategory.create({ data: { name: 'Test' } });
    for (const id of ['a', 'b', 'c']) await prisma.employee.create({ data: { id, name: id, shortName: id } });
    const createOrder = (id, legacy, ids) => prisma.washOrder.create({ data: {
      id, orderNumber: id, licensePlate: id, departmentId: department.id, categoryId: category.id,
      targetReadyTime: new Date(), assignedEmployeeId: legacy,
      assignedEmployees: { create: ids.map(employeeId => ({ employeeId })) },
    } });
    await createOrder('multiple', 'a', ['a', 'b', 'c']);
    await createOrder('secondary', 'b', ['a', 'b']);
    await createOrder('single', 'a', ['a']);
    await createOrder('legacy', 'a', []);

    let role = 'WASHER';
    const paths = [];
    const actions = {};
    const code = ts.transpileModule(readFileSync(new URL('../src/actions/employees.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { exports: actions, console: { error() {} }, require: id => {
      if (id === '@/lib/prisma') return { prisma };
      if (id === '@/actions/auth') return { getCurrentUser: async () => ({ role }) };
      if (id === 'next/cache') return { revalidatePath: path => paths.push(path) };
      throw new Error(id);
    } });
    assert.equal((await actions.deleteEmployee('a')).success, false);
    assert.ok(await prisma.employee.findUnique({ where: { id: 'a' } }));
    role = 'ADMIN';
    await prisma.$executeRawUnsafe(`CREATE TRIGGER prevent_employee_delete BEFORE DELETE ON Employee BEGIN SELECT RAISE(ABORT, 'blocked'); END`);
    assert.equal((await actions.deleteEmployee('a')).success, false);
    assert.equal((await prisma.washOrder.findUnique({ where: { id: 'multiple' } })).assignedEmployeeId, 'a');
    assert.equal(await prisma.orderEmployee.count({ where: { employeeId: 'a' } }), 3);
    assert.deepEqual(paths, []);
    await prisma.$executeRawUnsafe('DROP TRIGGER prevent_employee_delete');

    assert.equal((await actions.deleteEmployee('a')).success, true);
    const orders = await prisma.washOrder.findMany({ include: { assignedEmployees: { orderBy: { employeeId: 'asc' } } } });
    const order = id => orders.find(item => item.id === id);
    assert.equal(order('multiple').assignedEmployeeId, 'b');
    assert.deepEqual(order('multiple').assignedEmployees.map(item => item.employeeId), ['b', 'c']);
    assert.equal(order('secondary').assignedEmployeeId, 'b');
    assert.deepEqual(order('secondary').assignedEmployees.map(item => item.employeeId), ['b']);
    assert.equal(order('single').assignedEmployeeId, null);
    assert.equal(order('legacy').assignedEmployeeId, null);
    assert.equal(await prisma.employee.findUnique({ where: { id: 'a' } }), null);
    assert.deepEqual(paths, ['/settings', '/planner']);
    assert.deepEqual(await prisma.$queryRawUnsafe('PRAGMA foreign_key_check'), []);
  } finally {
    await prisma.$disconnect();
    rmSync(dir, { recursive: true, force: true });
  }
});
