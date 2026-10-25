import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
