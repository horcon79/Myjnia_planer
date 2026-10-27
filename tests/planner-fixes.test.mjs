import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import ts from 'typescript';
import { PrismaClient } from '@prisma/client';

function transpile(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

function loadPlannerModule() {
  const js = transpile('../src/lib/planner.ts');
  const exportsObject = {};
  vm.runInNewContext(js, {
    exports: exportsObject,
    console: { error() {}, warn() {}, log() {} },
    require: (id) => {
      throw new Error(`Unexpected import in planner: ${id}`);
    },
  });
  return exportsObject;
}

function loadModule(relativePath, prisma, session) {
  const js = transpile(relativePath);
  const exportsObject = {};
  const planner = loadPlannerModule();
  vm.runInNewContext(js, {
    exports: exportsObject,
    console: { error() {}, warn() {}, log() {} },
    require: (id) => {
      if (id === '@/lib/prisma') return { prisma };
      if (id === '@/actions/auth') return { getCurrentUser: async () => session.user };
      if (id === 'next/cache') return { revalidatePath() {} };
      if (id === '@/lib/planner') return planner;
      throw new Error(`Unexpected import: ${id}`);
    },
  });
  return exportsObject;
}

test('cancelOrder: uprawnienia, audyt i ochrona wydanych zleceń', async () => {
  mkdirSync(join(tmpdir(), 'kilo'), { recursive: true });
  const directory = mkdtempSync(join(tmpdir(), 'kilo', 'planner-fixes-'));
  const url = `file:${join(directory, 'test.db').replaceAll('\\', '/')}`;
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const session = { user: null };

  try {
    execFileSync(process.execPath, [
      fileURLToPath(import.meta.resolve('prisma/build/index.js')),
      'db', 'push', '--skip-generate', '--schema', fileURLToPath(new URL('../prisma/schema.prisma', import.meta.url)),
    ], { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });

    const orders = loadModule('../src/actions/orders.ts', prisma, session);

    const salon = await prisma.department.create({ data: { name: 'Salon', slug: 'salon', code: 'SAL', color: '#fff' } });
    const serwis = await prisma.department.create({ data: { name: 'Serwis', slug: 'serwis', code: 'SER', color: '#000' } });
    const category = await prisma.washCategory.create({ data: { name: 'Standard', defaultDurationMin: 40 } });
    const employee = await prisma.employee.create({ data: { name: 'Anna Nowak', shortName: 'Anna N.' } });

    const makeOrder = (data) => prisma.washOrder.create({
      data: {
        orderNumber: `T-${Math.random().toString(36).slice(2, 8)}`,
        licensePlate: 'TEST123',
        carType: 'PASSENGER',
        departmentId: salon.id,
        categoryId: category.id,
        targetReadyTime: new Date(Date.now() + 60 * 60 * 1000),
        durationMin: 40,
        ...data,
      },
    });

    session.user = { role: 'DEPARTMENT', slug: 'salon', name: 'Dział Handlowy', code: 'DH' };
    const ownPlanned = await makeOrder({ status: 'PLANNED' });
    const ownInProgress = await makeOrder({ status: 'IN_PROGRESS' });
    const foreignPlanned = await makeOrder({ status: 'PLANNED', departmentId: serwis.id });

    assert.equal((await orders.cancelOrder(foreignPlanned.id, {})).success, false);
    assert.equal((await orders.cancelOrder(ownInProgress.id, {})).success, false);

    const cancelled = await orders.cancelOrder(ownPlanned.id, { reason: 'Wydanie odwołane' });
    assert.equal(cancelled.success, true);
    const stored = await prisma.washOrder.findUniqueOrThrow({ where: { id: ownPlanned.id } });
    assert.equal(stored.status, 'CANCELLED');
    assert.equal(stored.cancelledFromStatus, 'PLANNED');
    assert.equal(stored.cancelReason, 'Wydanie odwołane');
    assert.match(stored.cancelledBy, /Dział Handlowy/);
    assert.ok(stored.cancelledAt instanceof Date);

    // Powtórne anulowanie jest idempotentne i nie nadpisuje audytu.
    const again = await orders.cancelOrder(ownPlanned.id, { reason: 'Inny powód' });
    assert.equal(again.success, true);
    const afterAgain = await prisma.washOrder.findUniqueOrThrow({ where: { id: ownPlanned.id } });
    assert.equal(afterAgain.cancelReason, 'Wydanie odwołane');

    session.user = { role: 'WASHER', slug: 'myjnia', name: 'Myjnia', code: 'MY' };
    const washerCancel = await orders.cancelOrder(ownInProgress.id, {});
    assert.equal(washerCancel.success, true);

    const ready = await makeOrder({ status: 'READY', assignedEmployeeId: employee.id });
    assert.equal((await orders.cancelOrder(ready.id, {})).success, true);

    const completed = await makeOrder({ status: 'COMPLETED' });
    assert.equal((await orders.cancelOrder(completed.id, {})).success, false);
    assert.equal((await prisma.washOrder.findUniqueOrThrow({ where: { id: completed.id } })).status, 'COMPLETED');

    // Stary kanał statusu nie może już anulować ani wydawać.
    const another = await makeOrder({ status: 'PLANNED' });
    assert.equal((await orders.updateOrderStatus(another.id, 'CANCELLED')).success, false);
    assert.equal((await orders.updateOrderStatus(another.id, 'COMPLETED')).success, false);

    // Planowanie zablokowane dla anulowanych i z nieprawidłową datą.
    assert.equal((await orders.scheduleOrder(ownPlanned.id, { scheduledStartTime: new Date().toISOString() })).success, false);
    assert.equal((await orders.scheduleOrder(another.id, { scheduledStartTime: 'nie-data' })).success, false);
    assert.equal((await orders.scheduleOrder(another.id, { scheduledStartTime: new Date().toISOString(), durationMin: 1 })).success, false);
    const scheduled = await orders.scheduleOrder(another.id, {
      scheduledStartTime: new Date().toISOString(),
      durationMin: 45,
      assignedEmployeeId: employee.id,
    });
    assert.equal(scheduled.success, true);
  } finally {
    await prisma.$disconnect();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('createOrder/scheduleOrder: serwer pilnuje terminu gotowości i zdolności', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'kilo', 'capacity-'));
  const url = `file:${join(directory, 'test.db').replaceAll('\\', '/')}`;
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const session = { user: { role: 'ADMIN', slug: 'admin', name: 'Admin', code: 'ADM' } };

  try {
    execFileSync(process.execPath, [
      fileURLToPath(import.meta.resolve('prisma/build/index.js')),
      'db', 'push', '--skip-generate', '--schema', fileURLToPath(new URL('../prisma/schema.prisma', import.meta.url)),
    ], { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });

    const orders = loadModule('../src/actions/orders.ts', prisma, session);

    const department = await prisma.department.create({ data: { name: 'Salon', slug: 'salon', code: 'SAL', color: '#fff' } });
    const longCategory = await prisma.washCategory.create({ data: { name: 'Przygotowanie 2h', defaultDurationMin: 120 } });
    const shortCategory = await prisma.washCategory.create({ data: { name: 'Szybkie 40m', defaultDurationMin: 40 } });

    const base = new Date();
    base.setDate(base.getDate() + 1);
    base.setHours(8, 0, 0, 0);
    const targetReady = new Date(base.getTime() + 120 * 60000);

    const lateTest = await orders.createOrder({
      licensePlate: 'LATE001',
      carType: 'PASSENGER',
      departmentId: department.id,
      categoryId: longCategory.id,
      targetReadyTime: targetReady.toISOString(),
    });
    assert.equal(lateTest.success, true);

    // Start po terminie gotowości jest odrzucany, chyba że użyto override.
    const lateStart = new Date(targetReady.getTime() + 30 * 60000);
    const late = await orders.scheduleOrder(lateTest.order.id, {
      scheduledStartTime: lateStart.toISOString(),
      durationMin: 30,
    });
    assert.equal(late.success, false);
    assert.match(late.error, /po terminie gotowości/);

    const lateOverride = await orders.scheduleOrder(lateTest.order.id, {
      scheduledStartTime: lateStart.toISOString(),
      durationMin: 30,
      isOverCapacity: true,
    });
    assert.equal(lateOverride.success, true);

    // Zlecenie zajmuje 08:00-10:00. Przy limicie 1 stanowiska kolejne auto w tym oknie nie wejdzie.
    const occupied = await orders.createOrder({
      licensePlate: 'OCC001',
      carType: 'PASSENGER',
      departmentId: department.id,
      categoryId: longCategory.id,
      targetReadyTime: targetReady.toISOString(),
    });
    assert.equal(occupied.success, true);

    for (const [key, value] of [
      ['ALLOW_OVER_CAPACITY', 'false'],
      ['MAX_SIMULTANEOUS_CARS', '1'],
    ]) {
      await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
    }

    const overlap = await orders.createOrder({
      licensePlate: 'OVR001',
      carType: 'PASSENGER',
      departmentId: department.id,
      categoryId: longCategory.id,
      targetReadyTime: new Date(base.getTime() + 60 * 60000).toISOString(),
    });
    assert.equal(overlap.success, false);
    assert.match(overlap.error, /Brak wolnych stanowisk/);

    // Po zakończeniu wszystkich zajętych okien zdolność jest znowu wolna.
    const after = await orders.createOrder({
      licensePlate: 'AFT001',
      carType: 'PASSENGER',
      departmentId: department.id,
      categoryId: longCategory.id,
      targetReadyTime: new Date(base.getTime() + 5 * 60 * 60000).toISOString(),
    });
    assert.equal(after.success, true);

    // Quick-add: gotowość = start + czas usługi, więc walidacja terminu przechodzi.
    const quickStart = new Date(base.getTime() + 7 * 60 * 60000);
    const quickAdd = await orders.createOrder({
      licensePlate: 'QCK001',
      carType: 'PASSENGER',
      departmentId: department.id,
      categoryId: shortCategory.id,
      targetReadyTime: new Date(quickStart.getTime() + 40 * 60000).toISOString(),
      scheduledStartTime: quickStart.toISOString(),
      enteredByWash: true,
    });
    assert.equal(quickAdd.success, true);
  } finally {
    await prisma.$disconnect();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('setShiftRoster: wspólna obsada, zakończenie i ponowne rozpoczęcie zmiany', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'kilo', 'shift-roster-'));
  const url = `file:${join(directory, 'test.db').replaceAll('\\', '/')}`;
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const session = { user: null };

  try {
    execFileSync(process.execPath, [
      fileURLToPath(import.meta.resolve('prisma/build/index.js')),
      'db', 'push', '--skip-generate', '--schema', fileURLToPath(new URL('../prisma/schema.prisma', import.meta.url)),
    ], { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });

    const shifts = loadModule('../src/actions/shifts.ts', prisma, session);
    const anna = await prisma.employee.create({ data: { name: 'Anna', shortName: 'Anna' } });
    const piotr = await prisma.employee.create({ data: { name: 'Piotr', shortName: 'Piotr' } });
    const today = new Date();
    const dayKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const dateKey = dayKey(today);
    const otherKey = dayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));

    session.user = { role: 'DEPARTMENT', slug: 'salon', name: 'Salon', code: 'SAL' };
    assert.equal((await shifts.setShiftRoster(dateKey, [anna.id])).success, false);

    session.user = { role: 'WASHER', slug: 'myjnia', name: 'Myjnia', code: 'MY' };
    const started = await shifts.setShiftRoster(dateKey, [anna.id, piotr.id]);
    assert.equal(started.success, true);
    assert.equal(started.roster.length, 2);

    const ended = await shifts.setShiftRoster(dateKey, [anna.id]);
    assert.equal(ended.success, true);
    const piotrEntry = ended.roster.find(entry => entry.employeeId === piotr.id);
    assert.ok(piotrEntry.endedAt);

    const reopened = await shifts.setShiftRoster(dateKey, [anna.id, piotr.id]);
    const piotrAgain = reopened.roster.find(entry => entry.employeeId === piotr.id);
    assert.equal(piotrAgain.endedAt, null);

    // Po 9 h wygaśnięcia ponowne zaznaczenie pracownika rozpoczyna nową zmianę.
    const oldStart = new Date(Date.now() - 10 * 60 * 60 * 1000);
    await prisma.shiftRoster.update({
      where: { dateKey_employeeId: { dateKey, employeeId: anna.id } },
      data: { startedAt: oldStart, endedAt: null },
    });
    const restarted = await shifts.setShiftRoster(dateKey, [anna.id]);
    const annaEntry = restarted.roster.find(entry => entry.employeeId === anna.id);
    assert.ok(new Date(annaEntry.startedAt).getTime() > oldStart.getTime() + 60 * 1000);

    // Inny dzień ma własną obsadę.
    const otherDay = await shifts.getShiftRoster(otherKey);
    assert.equal(otherDay.roster.length, 0);

    // Nieaktywni pracownicy nie trafiają do obsady.
    await prisma.employee.update({ where: { id: piotr.id }, data: { isActive: false } });
    const filtered = await shifts.setShiftRoster(otherKey, [anna.id, piotr.id]);
    assert.deepEqual(filtered.roster.map(entry => entry.employeeId), [anna.id]);
  } finally {
    await prisma.$disconnect();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('pliki "use server" eksportują wyłącznie funkcje asynchroniczne', () => {
  const directory = fileURLToPath(new URL('../src/actions/', import.meta.url));
  const violations = [];

  for (const file of readdirSync(directory).filter(name => name.endsWith('.ts') && !name.endsWith('.test.ts'))) {
    const source = readFileSync(join(directory, file), 'utf8');
    if (!/^\s*['"]use server['"]/.test(source)) continue;

    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
    for (const statement of sourceFile.statements) {
      const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) ?? [] : [];
      if (!modifiers.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
      // Typy i interfejsy nie istnieją w czasie wykonania - są dozwolone.
      if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) continue;
      if (ts.isExportDeclaration(statement) && statement.isTypeOnly) continue;
      if (ts.isFunctionDeclaration(statement) && modifiers.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword)) continue;
      violations.push(`${file}: ${statement.getText(sourceFile).split('\n')[0]}`);
    }
  }

  assert.deepEqual(violations, [], 'Nie-asynchroniczne eksporty w plikach "use server" psują akcje serwera Next.js');
});
