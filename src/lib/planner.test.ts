import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isQueueOrder, isActiveShiftEntry, SHIFT_MAX_MS } from './planner';

test('kolejka "Do przydzielenia" przyjmuje tylko PLANNED bez terminu lub pracownika', () => {
  assert.equal(isQueueOrder({ status: 'PLANNED', scheduledStartTime: null, assignedEmployeeId: null }), true);
  assert.equal(isQueueOrder({ status: 'PLANNED', scheduledStartTime: '2026-10-23T10:00:00Z', assignedEmployeeId: null }), true);
  assert.equal(isQueueOrder({ status: 'PLANNED', scheduledStartTime: null, assignedEmployeeId: 'emp-1' }), true);
  assert.equal(isQueueOrder({ status: 'PLANNED', scheduledStartTime: '2026-10-23T10:00:00Z', assignedEmployeeId: 'emp-1' }), false);

  // Wydane, gotowe i anulowane nigdy nie wracają do kolejki.
  assert.equal(isQueueOrder({ status: 'COMPLETED', scheduledStartTime: null, assignedEmployeeId: null }), false);
  assert.equal(isQueueOrder({ status: 'READY', scheduledStartTime: null, assignedEmployeeId: null }), false);
  assert.equal(isQueueOrder({ status: 'IN_PROGRESS', scheduledStartTime: null, assignedEmployeeId: null }), false);
  assert.equal(isQueueOrder({ status: 'CANCELLED', scheduledStartTime: null, assignedEmployeeId: null }), false);
});

test('obsada zmiany wygasa po 9 godzinach i po jawnym zakończeniu', () => {
  const now = Date.parse('2026-10-23T18:00:00Z');
  assert.equal(isActiveShiftEntry({ startedAt: new Date(now - 60 * 60 * 1000).toISOString(), endedAt: null }, now), true);
  assert.equal(isActiveShiftEntry({ startedAt: new Date(now - 8 * 60 * 60 * 1000).toISOString(), endedAt: null }, now), true);
  assert.equal(isActiveShiftEntry({ startedAt: new Date(now - SHIFT_MAX_MS - 1000).toISOString(), endedAt: null }, now), false);
  assert.equal(isActiveShiftEntry({ startedAt: new Date(now - 60 * 60 * 1000).toISOString(), endedAt: new Date(now - 1000).toISOString() }, now), false);
  assert.equal(isActiveShiftEntry({ startedAt: 'nie-data', endedAt: null }, now), false);
});
