import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/components/planner/PlannerBoard.tsx', import.meta.url), 'utf8');

test('shared timeline includes assigned, unassigned and unscheduled orders once', () => {
  const start = source.indexOf('  const cardLayouts = useMemo(');
  const end = source.indexOf('\n  const axisStart', start);
  assert.ok(start > 0 && end > start);
  const snippet = source.slice(start, end).replace('const cardLayouts =', 'globalThis.cardLayouts =');
  const code = ts.transpileModule(snippet, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const orders = [
    { id: 'a', status: 'PLANNED', scheduledStartTime: '2030-01-01T09:00:00', durationMin: 30, assignedEmployees: [{ employeeId: 'one' }, { employeeId: 'two' }] },
    { id: 'b', status: 'PLANNED', scheduledStartTime: '2030-01-01T09:30:00', durationMin: 30, assignedEmployees: [] },
    { id: 'c', status: 'PLANNED', scheduledStartTime: null, targetReadyTime: '2030-01-01T11:00:00', durationMin: 30, assignedEmployees: [] },
    { id: 'd', status: 'CANCELLED', scheduledStartTime: '2030-01-01T09:00:00' },
    { id: 'e', status: 'PLANNED', scheduledStartTime: '2030-01-01T09:15:00', durationMin: 45, assignedEmployees: [] },
  ];
  const context = {
    orders, activeEmployees: [{ id: 'one' }], visibleEmployeeId: 'one', currentDate: '2030-01-01',
    useMemo: fn => fn(), format: date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
  };
  vm.runInNewContext(code, context);
  assert.deepEqual(Array.from(context.cardLayouts, item => item.order.id).sort(), ['a', 'b', 'c', 'e']);
  const byId = id => context.cardLayouts.find(item => item.order.id === id);
  assert.equal(byId('c').start, 630);
  assert.equal(byId('e').start, 555);
  assert.equal(byId('e').end - byId('e').start, 45);
  assert.notEqual(byId('a').lane, byId('e').lane);
  assert.equal(byId('a').lane, byId('b').lane);
  assert.doesNotMatch(source, /unassignedOrders|Do zaplanowania \(/);
  assert.match(source, /Godzina orientacyjna/);
});

test('timeline uses minute geometry, horizontal coordinates and accessible cards', () => {
  assert.match(source, /left: \(layout\.start - axisStart\) \* PIXELS_PER_MINUTE/);
  assert.match(source, /width: \(layout\.end - layout\.start\) \* PIXELS_PER_MINUTE/);
  assert.match(source, /x - rect\.left - drag\.grabOffset/);
  assert.match(source, /elementFromPoint/);
  assert.match(source, /minutes < 0 \|\| minutes >= 1440/);
  assert.match(source, /Math\.min\(workStartHour \* 60, \.\.\.cardLayouts/);
  assert.match(source, /Math\.max\(workEndHour \* 60 \+ 30, \.\.\.cardLayouts/);
  assert.match(source, /onKeyDown=\{e =>/);
  assert.match(source, /touchAction: 'auto'/);
});

test('drag keeps grab offset, handles scroll and rejects hidden or occluded targets', () => {
  const start = source.indexOf('  const updateDragTarget =');
  const end = source.indexOf('\n  const handleDragMove =', start);
  const code = ts.transpileModule(source.slice(start, end) + '\nglobalThis.updateDragTarget = updateDragTarget; globalThis.autoScrollDrag = autoScrollDrag;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const targets = [];
  let gridLeft = -400, occluded = false, frame, scrollLeft = 0;
  const grid = { getBoundingClientRect: () => ({ left: gridLeft, right: 3000, top: 100, bottom: 600 }), contains: element => element === 'grid' };
  const scroller = { getBoundingClientRect: () => ({ left: 0, top: 100 }), clientLeft: 0, clientTop: 0, clientWidth: 500, clientHeight: 400,
    get scrollLeft() { return scrollLeft; }, set scrollLeft(value) { gridLeft -= value - scrollLeft; scrollLeft = value; } };
  const context = {
    timelineGridRef: { current: grid }, timelineScrollRef: { current: scroller },
    axisStartRef: { current: 420 }, PIXELS_PER_MINUTE: 4, dropTargetRef: { current: null },
    dragRef: { current: { active: true, grabOffset: 120, startMinutes: 540, x: 200, y: 200 } },
    dragFrameRef: { current: null }, requestAnimationFrame: fn => { frame = fn; return 1; },
    document: { elementFromPoint: () => occluded ? 'overlay' : 'grid' }, setDropTarget: value => targets.push(value),
  };
  vm.runInNewContext(code, context);
  context.updateDragTarget(200, 200);
  assert.equal(targets.at(-1).time, '09:00');
  gridLeft -= 120;
  context.updateDragTarget(200, 200);
  assert.equal(targets.at(-1).time, '09:30');
  context.axisStartRef.current = 390;
  gridLeft -= 120;
  context.updateDragTarget(200, 200);
  assert.equal(targets.at(-1).time, '09:30');
  context.updateDragTarget(600, 200);
  assert.equal(targets.at(-1), null);
  occluded = true;
  context.updateDragTarget(200, 200);
  assert.equal(context.dropTargetRef.current, null);
  occluded = false;
  context.dragRef.current.x = 490;
  context.autoScrollDrag();
  assert.ok(scroller.scrollLeft > 0);
  const beforeFrame = scroller.scrollLeft;
  frame();
  assert.ok(scroller.scrollLeft > beforeFrame);
  assert.equal(targets.at(-1).time, '11:00');
  occluded = true;
  const beforeOverlay = scroller.scrollLeft;
  frame();
  assert.equal(scroller.scrollLeft, beforeOverlay);
  assert.equal(targets.at(-1), null);
  assert.equal(typeof frame, 'function');
});

test('compact cards expose key controls without internal scroll', () => {
  assert.match(source, /overflow: 'hidden'/);
  assert.doesNotMatch(source, /overflowY: 'auto'/);
  assert.match(source, /Szczegóły<\/span>/);
  assert.match(source, /openNoteModal\(editingOrder\)/);
  assert.match(source, /setDeleteConfirmId\(editingOrder\.id\)/);
  assert.match(source, /setEmployeeOrder\(editingOrder\)/);
});

test('READY orders hidden by filter remain available without duplicates', () => {
  const start = source.indexOf('  const visibleBoardOrderIds = new Set(cardLayouts');
  const end = source.indexOf('\n\n  return (', start);
  const code = ts.transpileModule(source.slice(start, end) + '\nglobalThis.result = pendingReleaseOrders;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const visible = { id: 'visible', status: 'READY' }, hidden = { id: 'hidden', status: 'READY' };
  const context = { cardLayouts: [{ order: visible }], orders: [visible, hidden], pendingReleases: [hidden] };
  vm.runInNewContext(code, context);
  assert.deepEqual(Array.from(context.result, order => order.id), ['hidden']);
});

test('late snapshot from earlier day cannot overwrite newer day', async () => {
  const start = source.indexOf('  const fetchDayOrders = async');
  const end = source.indexOf('\n  useEffect(', start);
  const code = ts.transpileModule(source.slice(start, end).replace('const fetchDayOrders =', 'globalThis.fetchDayOrders ='), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  let resolveOld;
  const writes = [];
  const context = {
    currentDate: '2030-01-01', dayRequestRef: { current: { date: '2030-01-01', generation: 0, request: 0, applied: 0 } },
    getPlannerSnapshot: () => new Promise(resolve => { resolveOld = resolve; }),
    setOrders: data => writes.push(data), setPastUnfinishedOrders: () => {}, setRoster: () => {}, setPendingReleases: () => {},
    setIsLoading: value => writes.push(value), canEdit: false, console,
  };
  vm.runInNewContext(code, context);
  const pending = context.fetchDayOrders();
  context.dayRequestRef.current = { date: '2030-01-02', generation: 1, request: 0, applied: 0 };
  resolveOld({ success: true, orders: ['old'] });
  await pending;
  assert.deepEqual(writes, []);
});

test('slow same-day polling can complete without overwriting a newer response', async () => {
  const start = source.indexOf('  const fetchDayOrders = async');
  const end = source.indexOf('\n  useEffect(', start);
  const code = ts.transpileModule(source.slice(start, end).replace('const fetchDayOrders =', 'globalThis.fetchDayOrders ='), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const resolvers = [], writes = [];
  const context = {
    currentDate: '2030-01-01', dayRequestRef: { current: { date: '2030-01-01', generation: 0, request: 0, applied: 0 } },
    getPlannerSnapshot: () => new Promise(resolve => resolvers.push(resolve)),
    setOrders: data => writes.push(data[0]), setPastUnfinishedOrders() {}, setRoster() {}, setPendingReleases() {}, setIsLoading() {}, canEdit: false, console,
  };
  vm.runInNewContext(code, context);
  const a = context.fetchDayOrders(), b = context.fetchDayOrders();
  resolvers[0]({ success: true, orders: ['first'] });
  await a;
  const c = context.fetchDayOrders();
  resolvers[2]({ success: true, orders: ['newest'] });
  await c;
  resolvers[1]({ success: true, orders: ['late'] });
  await b;
  assert.deepEqual(writes, ['first', 'newest']);
});

function clickHandler(containing, context) {
  const file = ts.createSourceFile('PlannerBoard.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler;
  function visit(node) {
    if (ts.isJsxAttribute(node) && node.name.getText(file) === 'onClick' && node.initializer?.expression?.getText(file).includes(containing)) {
      assert.equal(handler, undefined, `ambiguous handler: ${containing}`);
      handler = node.initializer.expression.getText(file);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.ok(handler, `missing handler: ${containing}`);
  const code = ts.transpileModule(`globalThis.handler = (${handler});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, context);
  return context.handler;
}

test('five-minute orders have a separate full-size details control without changing geometry', () => {
  const sectionStart = source.indexOf('<section aria-label="Krótkie zlecenia"');
  const sectionEnd = source.indexOf('</section>', sectionStart);
  const section = source.slice(sectionStart, sectionEnd);
  assert.ok(sectionStart > 0 && sectionEnd > sectionStart);
  assert.match(section, /layout\.end - layout\.start < 30/);
  assert.match(section, /min-h-11/);
  assert.doesNotMatch(section, /absolute|fixed/);
  assert.match(source, /width: \(layout\.end - layout\.start\) \* PIXELS_PER_MINUTE/);
  const order = { id: 'five', licensePlate: 'TEST', durationMin: 5 };
  let opened;
  clickHandler('setEditingOrder(layout.order)', { layout: { order }, setEditingOrder: value => { opened = value; } })();
  assert.equal(opened, order);
});

test('details status actions use existing flows and are restricted to editors', () => {
  const start = source.indexOf('{editingOrder && (');
  const section = source.slice(start, source.indexOf('{/* Express Priority Banner', start));
  assert.match(section, /\{canEdit && \(/);
  assert.match(section, /\['PLANNED', 'IN_PROGRESS', 'READY'\]\.includes\(editingOrder\.status\)/);
  for (const [status, action] of [['PLANNED', 'start'], ['IN_PROGRESS', 'finish'], ['READY', 'release']]) {
    const calls = [];
    const handler = clickHandler("order.status === 'PLANNED'", {
      editingOrder: { id: 'five', status }, setEditingOrder: value => calls.push(['close', value]),
      handleStartOrder: id => calls.push(['start', id]), setFinishConfirmId: id => calls.push(['finish', id]),
      handleCompleteOrder: id => calls.push(['release', id]),
    });
    handler();
    assert.deepEqual(calls, [['close', null], [action, 'five']]);
  }
});

test('employee editor opens for scheduled and legacy orders', () => {
  for (const ord of [
    { id: 'order', scheduledStartTime: null, assignedEmployees: [{ employeeId: 'a' }, { employeeId: 'b' }] },
    { id: 'order', scheduledStartTime: '2030-01-01T09:00:00Z', assignedEmployees: [{ employeeId: 'a' }, { employeeId: 'b' }] },
    { id: 'order', scheduledStartTime: null, assignedEmployees: [], assignedEmployeeId: 'a' },
  ]) {
    let selection, selectedOrder, error, stopped = false;
    const handler = clickHandler('setEmployeeOrder(ord)', {
      ord, setEmployeeSelection: value => { selection = Array.from(value); },
      setEmployeeOrder: value => { selectedOrder = value; }, setEmployeeError: value => { error = value; },
    });
    handler({ stopPropagation() { stopped = true; } });
    assert.equal(stopped, true);
    assert.deepEqual(selection, ord.assignedEmployees.length ? ['a', 'b'] : ['a']);
    assert.equal(selectedOrder, ord);
    assert.equal(error, '');
  }
});

test('employee save sends only IDs and displayed version, including legacy and empty selections', async () => {
  for (const [scheduledStartTime, ids] of [[null, []], ['2030-01-01T09:00:00Z', ['a', 'b']]]) {
    const calls = [], pending = [], errors = [], selected = [];
    let refreshed = 0;
    const context = {
      employeeOrder: { id: 'order', scheduledStartTime, updatedAt: '2030-01-01T08:00:00Z' },
      employeeSelection: ids, employeePending: false,
      setOrderEmployees: async (...args) => { calls.push(args); return { success: true }; },
      setEmployeePending: value => pending.push(value), setEmployeeError: value => errors.push(value),
      setEmployeeOrder: value => selected.push(value), fetchDayOrders: async () => { refreshed++; },
    };
    await clickHandler('setOrderEmployees(', context)();
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 'order');
    assert.deepEqual(JSON.parse(JSON.stringify(calls[0][1])), { assignedEmployeeIds: ids, expectedUpdatedAt: '2030-01-01T08:00:00.000Z' });
    assert.deepEqual(pending, [true, false]);
    assert.deepEqual(errors, ['']);
    assert.deepEqual(selected, [null]);
    assert.equal(refreshed, 1);
  }
});

test('employee save preserves selection and shows conflicts or connection errors', async () => {
  for (const result of [{ success: false, error: 'Zlecenie uległo zmianie' }, new Error('network')]) {
    const errors = [], pending = [], selected = [];
    const context = {
      employeeOrder: { id: 'order', updatedAt: '2030-01-01T08:00:00Z' }, employeeSelection: ['a'], employeePending: false,
      setOrderEmployees: async () => { if (result instanceof Error) throw result; return result; },
      setEmployeePending: value => pending.push(value), setEmployeeError: value => errors.push(value),
      setEmployeeOrder: value => selected.push(value), fetchDayOrders: () => assert.fail('must not refresh on failure'),
    };
    await clickHandler('setOrderEmployees(', context)();
    assert.deepEqual(pending, [true, false]);
    assert.deepEqual(selected, []);
    assert.equal(errors[1], result instanceof Error ? 'Błąd połączenia. Spróbuj ponownie.' : result.error);
  }
});

test('rescheduling sends the displayed version', () => {
  assert.match(source, /expectedUpdatedAt: new Date\(dropConfirm\.order\.updatedAt\)/);
  assert.match(source, /expectedUpdatedAt: new Date\(ord\.updatedAt\)/);
});
