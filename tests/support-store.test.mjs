import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const originalSupportDir = process.env.SUPPORT_DATA_DIR;

function makeReport(index) {
  return {
    id: `report-${index}`,
    createdAt: new Date(Date.UTC(2026, 9, 25, 10, 0, index)).toISOString(),
    type: 'BUG',
    message: `Zgłoszenie testowe ${index}`,
    session: { login: 'serwis', name: 'Dział Serwisu', code: 'SR', role: 'DEPARTMENT' },
    location: '/planner?day=2026-10-25',
    userAgent: 'node-test',
    appVersion: '1.100',
  };
}

test('support-store: zapisuje, sortuje i odczytuje zgłoszenia z pliku JSON', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'support-store-'));
  process.env.SUPPORT_DATA_DIR = join(directory, 'dane');

  try {
    const store = await import('../src/lib/support-store.ts');

    await store.appendSupportReport(makeReport(0));
    const concurrent = Array.from({ length: 8 }, (_, index) => store.appendSupportReport(makeReport(index + 1)));
    await Promise.all(concurrent);

    const reports = await store.listSupportReports();
    assert.equal(reports.length, 9);
    assert.equal(reports[0].id, 'report-8');
    assert.equal(reports.at(-1).id, 'report-0');

    const file = JSON.parse(readFileSync(join(directory, 'dane', 'reports.json'), 'utf8'));
    assert.equal(file.length, 9);
    assert.equal(file[0].message, 'Zgłoszenie testowe 8');
    assert.deepEqual(file[0].session, { login: 'serwis', name: 'Dział Serwisu', code: 'SR', role: 'DEPARTMENT' });

    const limited = await store.listSupportReports(3);
    assert.deepEqual(limited.map((report) => report.id), ['report-8', 'report-7', 'report-6']);
  } finally {
    if (originalSupportDir === undefined) delete process.env.SUPPORT_DATA_DIR;
    else process.env.SUPPORT_DATA_DIR = originalSupportDir;
    rmSync(directory, { recursive: true, force: true });
  }
});

test('support-store: uszkodzony JSON jest odkładany na bok, a zgłoszenia startują od nowa', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'support-corrupt-'));
  process.env.SUPPORT_DATA_DIR = join(directory, 'dane');

  try {
    const { mkdirSync, readdirSync } = await import('node:fs');
    mkdirSync(join(directory, 'dane'), { recursive: true });
    writeFileSync(join(directory, 'dane', 'reports.json'), '{to nie jest json', 'utf8');

    const store = await import('../src/lib/support-store.ts');
    assert.deepEqual(await store.listSupportReports(), []);

    const backups = readdirSync(join(directory, 'dane')).filter((name) => name.startsWith('reports.json.corrupt-'));
    assert.equal(backups.length, 1);
  } finally {
    if (originalSupportDir === undefined) delete process.env.SUPPORT_DATA_DIR;
    else process.env.SUPPORT_DATA_DIR = originalSupportDir;
    rmSync(directory, { recursive: true, force: true });
  }
});

test('support-store: ukrywa DONE przed limitem i zachowuje wszystkie pola przy zapisie', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'support-status-'));
  process.env.SUPPORT_DATA_DIR = directory;
  const filePath = join(directory, 'reports.json');
  const original = [
    { ...makeReport(3), status: 'DONE', internalNote: 'nie udostępniać' },
    { ...makeReport(2), status: 'VERIFY', extra: { ticket: 42 } },
    makeReport(1),
  ];

  try {
    writeFileSync(filePath, JSON.stringify(original));
    const store = await import('../src/lib/support-store.ts');
    assert.deepEqual((await store.listSupportReports(2)).map((report) => report.id), ['report-2', 'report-1']);
    await store.appendSupportReport(makeReport(4));
    assert.deepEqual(JSON.parse(readFileSync(filePath, 'utf8')), [makeReport(4), ...original]);
  } finally {
    if (originalSupportDir === undefined) delete process.env.SUPPORT_DATA_DIR;
    else process.env.SUPPORT_DATA_DIR = originalSupportDir;
    rmSync(directory, { recursive: true, force: true });
  }
});

test('support-store: zapis nie usuwa zgłoszeń ponad dotychczasowy limit', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'support-limit-'));
  process.env.SUPPORT_DATA_DIR = directory;
  const filePath = join(directory, 'reports.json');
  try {
    const store = await import('../src/lib/support-store.ts');
    const reports = Array.from({ length: store.SUPPORT_REPORTS_LIMIT }, (_, i) => ({ ...makeReport(i), status: 'DONE' }));
    writeFileSync(filePath, JSON.stringify(reports));
    await store.appendSupportReport(makeReport(0));
    assert.equal(JSON.parse(readFileSync(filePath, 'utf8')).length, store.SUPPORT_REPORTS_LIMIT + 1);
  } finally {
    if (originalSupportDir === undefined) delete process.env.SUPPORT_DATA_DIR;
    else process.env.SUPPORT_DATA_DIR = originalSupportDir;
    rmSync(directory, { recursive: true, force: true });
  }
});

test('support actions: wymagają logowania i zwracają tylko bezpieczne pola oraz status', async () => {
  const source = readFileSync(new URL('../src/actions/support.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  let user = null;
  let reads = 0;
  let saved;
  const reports = [
    { ...makeReport(1), secret: 'prywatne', session: { ...makeReport(1).session, secret: 'prywatne' } },
    { ...makeReport(2), status: 'VERIFY' },
    { ...makeReport(3), status: 'UNKNOWN' },
  ];
  const exports = {};
  vm.runInNewContext(js, { exports, require(id) {
    if (id === 'node:crypto') return { randomUUID: () => 'new-id' };
    if (id === 'next/headers') return { headers: async () => new Headers() };
    if (id === '@/actions/auth') return { getCurrentUser: async () => user };
    if (id === '@/lib/version') return { getAppVersion: () => '1.100' };
    if (id === '@/lib/support-store') return {
      listSupportReports: async () => { reads++; return reports; },
      appendSupportReport: async (report) => { saved = report; },
    };
    throw Error(id);
  }, URL, Headers, console });

  assert.equal((await exports.getSupportReports()).success, false);
  assert.equal((await exports.submitSupportReport({ message: 'test' })).success, false);
  assert.equal(reads, 0);
  assert.equal(saved, undefined);
  user = { slug: 'serwis', name: 'Serwis', code: 'SR', role: 'DEPARTMENT' };
  const result = await exports.getSupportReports();
  assert.deepEqual(Array.from(result.reports, (report) => report.status), ['NEW', 'VERIFY', 'NEW']);
  assert.equal(result.reports[0].secret, undefined);
  assert.equal(result.reports[0].session.secret, undefined);
  const submitted = await exports.submitSupportReport({ message: 'test', status: 'DONE' });
  assert.equal(submitted.report.status, 'NEW');
  assert.equal(saved.status, undefined);
});
