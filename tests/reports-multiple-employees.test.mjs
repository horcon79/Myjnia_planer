import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

test('raport liczy auta raz, a udziały przypisanych osób osobno', async () => {
  const employee = (id, name) => ({ employeeId: id, employee: { id, name, shortName: name, color: '#fff' } });
  const day = new Date('2026-10-15T12:00:00');
  const base = {
    departmentId: 'dept', department: { name: 'Salon', code: 'SAL', color: '#fff' },
    durationMin: 60, enteredByWash: false, createdAt: day, completedAt: day, targetReadyTime: day,
    status: 'READY', carModel: null, priorityAuthorizer: null, priorityReason: null,
  };
  const orders = [
    { ...base, id: '1', orderNumber: '1', licensePlate: 'AAA', isPriority: true, assignedEmployees: [employee('a', 'Anna'), employee('b', 'Bartek')] },
    { ...base, id: '2', orderNumber: '2', licensePlate: 'BBB', isPriority: false, assignedEmployees: [] },
  ];
  const calls = [];
  const prisma = { washOrder: { findMany: async (query) => {
    calls.push(query);
    return query.where.isPriority ? orders.filter((o) => o.isPriority) : orders;
  } } };
  const js = ts.transpileModule(readFileSync(new URL('../src/actions/reports.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, console, require: (id) => {
    if (id === '@/lib/prisma') return { prisma };
    if (id === '@/actions/auth') return { getCurrentUser: async () => ({ role: 'ADMIN' }) };
    throw new Error(`Unexpected import: ${id}`);
  } });
  const result = await exports.getWashReport('2026-10-15', '2026-10-15');
  assert.equal(result.success, true);
  assert.equal(result.report.totalCount, 2);
  assert.equal(result.report.totalDurationMin, 120);
  assert.equal(result.report.departments[0].count, 2);
  assert.equal(result.report.expressCount, 1);
  assert.deepEqual(Array.from(result.report.employees, (row) => [row.name, row.count]), [
    ['Anna', 1], ['Bartek', 1], ['Bez przypisanego pracownika', 1],
  ]);
  assert.equal('totalDurationMin' in result.report.employees[0], false);
  assert.deepEqual(Array.from(result.report.expressOrders[0].assignedEmployeeNames), ['Anna', 'Bartek']);
  assert.ok(calls.every((query) => query.include.assignedEmployees.include.employee));
});
