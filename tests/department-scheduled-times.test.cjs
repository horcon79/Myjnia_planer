const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function renderOrder(order) {
  let source = readFileSync('src/components/orders/OrderFormAndList.tsx', 'utf8');
  source = source.replace('useState<any[]>([])', 'useState<any[]>([testOrder])');
  source = source.replace('const [isLoadingList, setIsLoadingList] = useState(true)', 'const [isLoadingList, setIsLoadingList] = useState(false)');
  source = source.replace('const [showCompleted, setShowCompleted] = useState(false)', 'const [showCompleted, setShowCompleted] = useState(true)');
  source = source.replace('const [showCancelled, setShowCancelled] = useState(false)', 'const [showCancelled, setShowCancelled] = useState(true)');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(js, {
    exports,
    testOrder: order,
    require(id) {
      if (id.startsWith('@/actions/')) return {};
      if (id === '@/lib/planner') return { getLatestArrivalTime: () => null };
      if (id === './TimeSlotAvailabilityGrid') return { __esModule: true, default: () => null };
      return require(id);
    },
  });
  return renderToStaticMarkup(React.createElement(exports.default, {
    currentUser: { role: 'DEPARTMENT', slug: 'salon', name: 'Salon' },
    departments: [{ id: 'dept', slug: 'salon', name: 'Salon' }],
    categories: [{ id: 'cat', name: 'Mycie', defaultDurationMin: 30 }],
    employees: [],
  }));
}

test('dział widzi aktualny harmonogram, termin wydania i ostrzeżenie o opóźnieniu', () => {
  const order = {
    id: '1', licensePlate: 'TEST123', departmentId: 'dept', department: { slug: 'salon' },
    status: 'PLANNED', assignedEmployees: [], durationMin: 30,
    targetReadyTime: '2026-11-03T12:00:00',
    scheduledStartTime: '2026-11-03T12:15:00', scheduledEndTime: '2026-11-03T12:45:00',
  };
  const moved = renderOrder(order);
  assert.match(moved, /Start:<\/span>.*?12:15 \(3 lis\)/);
  assert.match(moved, /Koniec mycia:<\/span>.*?12:45 \(3 lis\)/);
  assert.match(moved, /Gotowe:<\/span>.*?12:00 \(3 lis\)/);
  assert.match(moved, /text-rose-300[^>]*>.*?Koniec mycia po terminie gotowości!/);

  const onTime = renderOrder({ ...order, scheduledStartTime: '2026-11-03T11:00:00', scheduledEndTime: '2026-11-03T11:30:00' });
  assert.match(onTime, /Start:<\/span>.*?11:00 \(3 lis\)/);
  assert.match(onTime, /Koniec mycia:<\/span>.*?11:30 \(3 lis\)/);
  assert.doesNotMatch(onTime, /Koniec mycia po terminie gotowości!/);

  const unscheduled = renderOrder({ ...order, scheduledStartTime: null, scheduledEndTime: null });
  assert.doesNotMatch(unscheduled, /Koniec mycia:<\/span>/);
  assert.match(unscheduled, /Gotowe:<\/span>.*?12:00 \(3 lis\)/);
  assert.doesNotMatch(unscheduled, /Koniec mycia po terminie gotowości!/);

  const completed = renderOrder({ ...order, status: 'COMPLETED' });
  assert.doesNotMatch(completed, /Koniec mycia po terminie gotowości!/);
  for (const status of ['READY', 'COMPLETED', 'CANCELLED']) {
    const html = renderOrder({ ...order, status });
    assert.doesNotMatch(html, /Koniec mycia po terminie gotowości!|Termin gotowości minął!/);
  }
  const overdue = renderOrder({ ...order, targetReadyTime: '2000-01-01T12:00:00', scheduledStartTime: null, scheduledEndTime: null });
  assert.match(overdue, /Termin gotowości minął!/);
  assert.doesNotMatch(overdue, /Koniec mycia po terminie gotowości!/);
  const future = renderOrder({ ...order, targetReadyTime: '2100-01-01T12:00:00', scheduledStartTime: '2100-01-02T12:15:00', scheduledEndTime: '2100-01-02T12:45:00' });
  assert.match(future, /Koniec mycia po terminie gotowości!/);
  assert.doesNotMatch(future, /Termin gotowości minął!/);
  const differentEnd = renderOrder({ ...order, scheduledStartTime: '2026-11-03T11:00:00', scheduledEndTime: '2026-11-03T12:30:00' });
  assert.match(differentEnd, /Koniec mycia po terminie gotowości!/);
});
