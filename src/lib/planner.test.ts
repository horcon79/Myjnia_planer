import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isQueueOrder,
  isActiveShiftEntry,
  SHIFT_MAX_MS,
  getOrderServiceWindow,
  getLatestArrivalTime,
  computeSlotUsage,
} from './planner';

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

test('zlecenie gotowe o 16:00 z usługą 2h zajmuje wyłącznie 14:00-16:00', () => {
  const ready = '2026-10-28T16:00:00Z';
  const window = getOrderServiceWindow({ targetReadyTime: ready, durationMin: 120 });
  assert.ok(window);
  assert.equal(new Date(window.startMs).toISOString(), '2026-10-28T14:00:00.000Z');
  assert.equal(new Date(window.endMs).toISOString(), '2026-10-28T16:00:00.000Z');

  const latestArrival = getLatestArrivalTime(ready, 120);
  assert.ok(latestArrival);
  assert.equal(latestArrival.toISOString(), '2026-10-28T14:00:00.000Z');

  // Slot po terminie gotowości nie jest obciążony.
  const after = computeSlotUsage(
    [{ targetReadyTime: ready, durationMin: 120, status: 'PLANNED' }],
    Date.parse('2026-10-28T16:00:00Z'),
    Date.parse('2026-10-28T16:30:00Z'),
  );
  assert.equal(after.usedCapacity, 0);
  assert.equal(after.activeOrdersCount, 0);

  // Slot kończący się dokładnie o 16:00 jeszcze nachodzi na usługę.
  const before = computeSlotUsage(
    [{ targetReadyTime: ready, durationMin: 120, status: 'PLANNED' }],
    Date.parse('2026-10-28T15:30:00Z'),
    Date.parse('2026-10-28T16:00:00Z'),
  );
  assert.equal(before.usedCapacity, 1);
});

test('jawne planowanie ma pierwszeństwo przed wyliczaniem z terminu gotowości', () => {
  const window = getOrderServiceWindow({
    targetReadyTime: '2026-10-28T16:00:00Z',
    scheduledStartTime: '2026-10-28T13:00:00Z',
    durationMin: 120,
  });
  assert.ok(window);
  assert.equal(new Date(window.startMs).toISOString(), '2026-10-28T13:00:00.000Z');
  assert.equal(new Date(window.endMs).toISOString(), '2026-10-28T15:00:00.000Z');

  const withEnd = getOrderServiceWindow({
    targetReadyTime: '2026-10-28T16:00:00Z',
    scheduledStartTime: '2026-10-28T13:00:00Z',
    scheduledEndTime: '2026-10-28T14:10:00Z',
    durationMin: 120,
  });
  assert.ok(withEnd);
  assert.equal(withEnd.endMs - withEnd.startMs, 70 * 60000);
});

test('obłożenie uwzględnia wagę auta dostawczego i pomija zakończone oraz anulowane', () => {
  const ready = '2026-10-28T16:00:00Z';
  const usage = computeSlotUsage(
    [
      { targetReadyTime: ready, durationMin: 120, status: 'PLANNED', carType: 'PASSENGER' },
      { targetReadyTime: ready, durationMin: 120, status: 'PLANNED', carType: 'DELIVERY' },
      { targetReadyTime: ready, durationMin: 120, status: 'COMPLETED', carType: 'PASSENGER' },
      { targetReadyTime: ready, durationMin: 120, status: 'CANCELLED', carType: 'PASSENGER' },
    ],
    Date.parse('2026-10-28T15:00:00Z'),
    Date.parse('2026-10-28T16:00:00Z'),
    { deliveryCarWeight: 1.5 },
  );
  assert.equal(usage.usedCapacity, 2.5);
  assert.equal(usage.activeOrdersCount, 2);
});
