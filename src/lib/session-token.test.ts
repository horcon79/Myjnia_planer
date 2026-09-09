import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { SESSION_MAX_AGE, signSessionToken, verifySessionToken } from './session-token';

const secret = 'test-only-secret-not-used-by-the-application';
const now = 1_800_000_000_000;

test('signed token contains only department ID and expiry and round trips', () => {
  const token = signSessionToken('department-1', secret, now);
  assert.equal(verifySessionToken(token, secret, now), 'department-1');
  assert.deepEqual(JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()), {
    departmentId: 'department-1', expiresAt: now / 1000 + SESSION_MAX_AGE,
  });
});

test('rejects changed identity, signature, wrong secret and unsigned legacy cookies', () => {
  const token = signSessionToken('department-1', secret, now);
  const [version, payload, signature] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ departmentId: 'admin', expiresAt: now / 1000 + 100 })).toString('base64url');
  assert.equal(verifySessionToken(`${version}.${forged}.${signature}`, secret, now), null);
  assert.equal(verifySessionToken(`${version}.${payload}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`, secret, now), null);
  assert.equal(verifySessionToken(token, 'different-secret', now), null);
  assert.equal(verifySessionToken(JSON.stringify({ slug: 'admin', role: 'ADMIN' }), secret, now), null);
});

test('enforces expiry on the server including the exact expiry boundary', () => {
  const token = signSessionToken('department-1', secret, now);
  assert.equal(verifySessionToken(token, secret, now + SESSION_MAX_AGE * 1000 - 1), 'department-1');
  assert.equal(verifySessionToken(token, secret, now + SESSION_MAX_AGE * 1000), null);
});

test('rejects malformed tokens and invalid signed payloads without throwing', () => {
  for (const token of ['', 'v1.a.a', 'v2.a.a', 'v1.a.a.extra', 'x'.repeat(4097)]) {
    assert.equal(verifySessionToken(token, secret, now), null);
  }
  for (const value of ['null', '{', '{}', '{"departmentId":7,"expiresAt":9999999999}', '{"departmentId":"admin","expiresAt":"9999999999"}']) {
    const body = `v1.${Buffer.from(value).toString('base64url')}`;
    const token = `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
    assert.equal(verifySessionToken(token, secret, now), null);
  }
  assert.throws(() => signSessionToken('department-1', '', now));
  assert.equal(verifySessionToken(signSessionToken('department-1', secret, now), '', now), null);
});
