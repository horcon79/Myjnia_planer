import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { SESSION_SECRET_KEY, signSessionToken, verifySessionToken } from '../lib/session-token';

const nextHeaders = createRequire(`${process.cwd()}/package.json`)('next/headers');
const secret = 'test-only-session-secret';
const department = {
  id: 'department-1', slug: 'admin', name: 'Current DB name',
  code: 'ADM', color: '#ffffff', pin: '1234', isActive: true,
};

test('authentication and settings use mocked infrastructure only', async (t) => {
  const unexpected = async (args: unknown): Promise<unknown> => {
    void args;
    throw new Error('Unexpected database call');
  };
  const prisma = {
    department: { findUnique: unexpected },
    appSetting: { findUnique: unexpected, findUniqueOrThrow: unexpected, upsert: unexpected, findMany: unexpected },
  };
  // Install a plain fake before loading the actions; no Prisma client or DB is opened.
  Object.assign(globalThis, { prisma });
  const { getCurrentUser, loginWithPin } = await import('./auth');
  const { getAppSettings, updateAppSetting } = await import('./settings');
  const previousSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = secret;
  t.after(() => {
    if (previousSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSecret;
  });

  await t.test('verified identity is loaded from DB and inactive departments are rejected', async (t) => {
    const token = signSessionToken(department.id, secret);
    t.mock.method(nextHeaders, 'cookies', async () => ({ get: () => ({ value: token }) }));
    const lookup = t.mock.method(prisma.department, 'findUnique', async () => department);
    t.mock.method(prisma.appSetting, 'findUnique', () => { throw new Error('Environment secret must bypass DB settings'); });
    assert.deepEqual(await getCurrentUser(), {
      slug: 'admin', name: department.name, code: 'ADM', color: '#ffffff', role: 'ADMIN',
    });
    assert.deepEqual(lookup.mock.calls[0].arguments[0], { where: { id: department.id } });
    lookup.mock.mockImplementation(async () => ({ ...department, isActive: false }));
    assert.equal(await getCurrentUser(), null);
    assert.equal((await loginWithPin('admin', '1234')).success, false);
    lookup.mock.mockImplementation(async () => null);
    assert.equal(await getCurrentUser(), null);
  });

  await t.test('legacy and tampered sessions cannot trigger an identity lookup', async (t) => {
    let value = JSON.stringify({ slug: 'admin', role: 'ADMIN' });
    t.mock.method(nextHeaders, 'cookies', async () => ({ get: () => ({ value }) }));
    const lookup = t.mock.method(prisma.department, 'findUnique', () => { throw new Error('Unexpected DB lookup'); });
    assert.equal(await getCurrentUser(), null);
    value = signSessionToken('department-1', 'attacker-secret');
    assert.equal(await getCurrentUser(), null);
    assert.equal(lookup.mock.callCount(), 0);
  });

  await t.test('login uses the persisted winner of a concurrent secret insert and HttpOnly', async (t) => {
    delete process.env.SESSION_SECRET;
    t.after(() => { process.env.SESSION_SECRET = secret; });
    t.mock.method(prisma.department, 'findUnique', async () => department);
    t.mock.method(prisma.appSetting, 'findUnique', async () => null);
    const upsert = t.mock.method(prisma.appSetting, 'upsert', async () => { throw { code: 'P2002' }; });
    t.mock.method(prisma.appSetting, 'findUniqueOrThrow', async () => ({ key: SESSION_SECRET_KEY, value: secret }));
    let issuedToken = '';
    let options: Record<string, unknown> = {};
    t.mock.method(nextHeaders, 'cookies', async () => ({
      set: (name: string, token: string, cookieOptions: Record<string, unknown>) => {
        assert.equal(name, 'myjnia_session');
        issuedToken = token;
        options = cookieOptions;
      },
    }));
    t.mock.method(nextHeaders, 'headers', async () => new Headers({ 'x-forwarded-proto': 'https' }));
    assert.deepEqual(await loginWithPin('admin', '1234'), { success: true });
    assert.equal(verifySessionToken(issuedToken, secret), department.id);
    assert.equal(options.httpOnly, true);
    assert.equal(options.secure, true);
    assert.equal(options.sameSite, 'lax');
    const args = upsert.mock.calls[0].arguments[0] as { update: object; create: { key: string; value: string } };
    assert.deepEqual(args.update, {});
    assert.equal(args.create.key, SESSION_SECRET_KEY);
    assert.equal(Buffer.from(args.create.value, 'base64url').length, 32);
  });

  await t.test('public settings exclude internal keys and internal writes are blocked', async (t) => {
    const reads = t.mock.method(prisma.appSetting, 'findMany', async () => []);
    const writes = t.mock.method(prisma.appSetting, 'upsert', () => { throw new Error('Unexpected write'); });
    t.mock.method(console, 'error', () => {});
    assert.equal((await getAppSettings()).success, true);
    assert.deepEqual(reads.mock.calls[0].arguments[0], {
      where: { NOT: { key: { startsWith: 'INTERNAL_' } } },
    });
    assert.equal((await updateAppSetting(SESSION_SECRET_KEY, 'attacker-secret')).success, false);
    assert.equal((await updateAppSetting(SESSION_SECRET_KEY.toLowerCase(), 'attacker-secret')).success, false);
    assert.equal(writes.mock.callCount(), 0);
  });
});
