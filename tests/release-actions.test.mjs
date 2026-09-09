import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Run the real action bodies without Next request context or an existing database.
function fixture(options = {}) {
  const user = options.user === undefined ? { role: 'WASHER', slug: 'myjnia', name: 'Myjnia' } : options.user;
  const order = { id: 'o1', orderNumber: 'Z-101', licensePlate: 'ABC123', status: 'READY', categoryId: 'c1',
    category: { name: 'Wash', checklistRequired: true, checklistMarkdown: '- Check' }, ...options.order };
  const logs = [];
  let writes = 0;
  const tx = {
    washOrder: {
      findUnique: async () => order,
      findUniqueOrThrow: async () => ({ ...order, releaseLogs: [...logs] }),
      updateMany: async ({ where, data }) => {
        if (order.status !== where.status || options.conflict) return { count: 0 };
        writes++;
        Object.assign(order, data);
        return { count: 1 };
      },
    },
    employee: { findUnique: async () => options.employee === undefined ? { id: 'e1', name: 'Employee', isActive: true } : options.employee },
    orderReleaseLog: { create: async ({ data }) => {
      if (options.auditFailure || logs.some(log => log.eventType === data.eventType)) throw new Error('Audit write failed');
      logs.push(data);
    } },
  };
  const prisma = {
    ...tx,
    washCategory: {
      create: async ({ data }) => { writes++; return data; },
      update: async ({ data }) => { writes++; return data; },
    },
    $transaction: async (callback) => {
      const before = { ...order };
      const length = logs.length;
      try { return await callback(tx); }
      catch (error) { Object.assign(order, before); logs.length = length; throw error; }
    },
  };
  function load(file) {
    const source = readFileSync(new URL(`../src/actions/${file}`, import.meta.url), 'utf8');
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const exports = {};
    vm.runInNewContext(js, { exports, console: { error() {} }, require: (id) => {
      if (id === '@/lib/prisma') return { prisma };
      if (id === '@/actions/auth') return { getCurrentUser: async () => user };
      if (id === 'next/cache') return { revalidatePath() {} };
      throw new Error(`Unexpected import: ${id}`);
    } });
    return exports;
  }
  return { ...load('orders.ts'), ...load('categories.ts'), order, logs, writes: () => writes };
}

const input = { employeeId: 'e1', categoryId: 'c1', checklistConfirmed: true, checklistMarkdown: '- Check' };

for (const [name, options, payload] of [
  ['anonymous', { user: null }],
  ['department', { user: { role: 'DEPARTMENT' } }],
  ['inactive employee', { employee: { id: 'e1', isActive: false } }],
  ['missing employee', { employee: null }],
  ['not ready', { order: { status: 'IN_PROGRESS' } }],
  ['stale category', {}, { categoryId: 'old' }],
  ['stale markdown including whitespace', {}, { checklistMarkdown: '- Check ' }],
  ['checklist disabled while confirmation was open', { order: { category: { name: 'Wash', checklistRequired: false, checklistMarkdown: '- Check' } } }],
  ['unconfirmed', {}, { checklistConfirmed: false }],
  ['wrong boolean type', {}, { checklistConfirmed: 'true' }],
  ['admin must select employee', { user: { role: 'ADMIN' } }, { employeeId: '' }],
  ['concurrent status change', { conflict: true }],
]) {
  test(`release rejects ${name}`, async () => {
    const f = fixture(options);
    assert.equal((await f.releaseOrder('o1', { ...input, ...payload })).success, false);
    assert.equal(f.writes(), 0);
    assert.equal(f.logs.length, 0);
  });
}

test('required release snapshots trusted data and rejects duplicate/reopened issuance', async () => {
  const f = fixture();
  assert.equal((await f.releaseOrder('o1', input)).success, true);
  assert.equal(f.order.status, 'COMPLETED');
  assert.deepEqual(f.logs.map(log => log.eventType), ['CHECKLIST_CONFIRMED', 'VEHICLE_RELEASED']);
  assert.equal(f.logs[0].orderIdSnapshot, 'o1');
  assert.equal(f.logs[0].employeeName, 'Employee');
  assert.equal(f.logs[0].sessionSlug, 'myjnia');
  assert.equal(f.logs[0].checklistMarkdown, '- Check');
  assert.equal((await f.releaseOrder('o1', input)).success, false);
  f.order.status = 'READY';
  assert.equal((await f.releaseOrder('o1', input)).success, false);
  assert.equal(f.order.status, 'READY');
  assert.equal(f.logs.length, 2);
});

test('disabled checklist permits unconfirmed release with no draft in audit', async () => {
  const f = fixture({ user: { role: 'ADMIN', slug: 'admin', name: 'Admin' },
    order: { category: { name: 'Wash', checklistRequired: false, checklistMarkdown: 'Draft' } } });
  assert.equal((await f.releaseOrder('o1', { ...input, checklistConfirmed: false, checklistMarkdown: '' })).success, true);
  assert.equal(f.logs.length, 1);
  assert.equal(f.logs[0].eventType, 'VEHICLE_RELEASED');
  assert.equal(f.logs[0].checklistMarkdown, null);
});

test('audit failure rolls back completion', async () => {
  const f = fixture({ auditFailure: true });
  assert.equal((await f.releaseOrder('o1', input)).success, false);
  assert.equal(f.order.status, 'READY');
  assert.equal(f.logs.length, 0);
});

test('status action cannot bypass release and anonymous planner changes fail', async () => {
  assert.equal((await fixture().updateOrderStatus('o1', 'COMPLETED')).success, false);
  assert.equal((await fixture({ user: null }).scheduleOrder('o1', {})).success, false);
  assert.equal((await fixture({ user: null }).getOrdersForDate('2026-09-09')).success, false);
});

test('category checklist fields are required, bounded, and preserve disabled drafts exactly', async () => {
  const f = fixture({ user: { role: 'ADMIN' } });
  const base = { name: 'Wash', defaultDurationMin: 30, color: '#ffffff' };
  for (const fields of [{}, { checklistRequired: 'true', checklistMarkdown: 'x' },
    { checklistRequired: true, checklistMarkdown: '  ' },
    { checklistRequired: false, checklistMarkdown: 'x'.repeat(20001) }]) {
    assert.equal((await f.upsertCategory({ ...base, ...fields })).success, false);
  }
  for (const id of [undefined, 'c1']) {
    const result = await f.upsertCategory({ ...base, id, checklistRequired: false, checklistMarkdown: '  Draft\n' });
    assert.equal(result.success, true);
    assert.equal(result.category.checklistMarkdown, '  Draft\n');
  }
  assert.equal((await f.upsertCategory({ ...base, checklistRequired: true, checklistMarkdown: 'x'.repeat(20000) })).success, true);
});
