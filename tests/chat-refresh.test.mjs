import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

function harness() {
  const slots = [];
  let cursor = 0;
  let effects = [];
  let interval;
  let visibility;
  let scrolls = 0;
  let selected = false;
  const requests = [];
  const sends = [];
  const thread = (id) => ({ id, departmentName: id, unreadCount: 0, lastMessage: null });
  let chatState = { threads: [thread('A'), thread('B')], totalUnread: 0, departments: [], employees: [] };
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat() }),
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], (value) => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
    },
    useRef(value) {
      const i = cursor++;
      return slots[i] ||= { current: value };
    },
    useCallback(fn, deps) {
      const i = cursor++;
      if (!slots[i] || deps.some((v, n) => v !== slots[i].deps[n])) slots[i] = { fn, deps };
      return slots[i].fn;
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || deps.some((v, n) => v !== slots[i].deps[n])) {
        effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; });
      }
    },
  };
  const actions = {
    getChatState: async () => chatState,
    getThreadMessages(id) { const d = deferred(); requests.push({ id, ...d }); return d.promise; },
    sendChatMessage(data) { const d = deferred(); sends.push({ data, ...d }); return d.promise; },
  };
  const document = {
    visibilityState: 'visible',
    addEventListener(_name, fn) { visibility = fn; },
    removeEventListener() {},
  };
  const source = readFileSync(new URL('../src/components/chat/FloatingChat.tsx', import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(js, {
    exports, require(id) {
      if (id === 'react') return react;
      if (id === 'lucide-react') return {};
      if (id === '@/actions/chat') return actions;
      throw Error(id);
    }, document,
    window: { getSelection: () => ({ isCollapsed: !selected }) },
    localStorage: { getItem: () => 'Anna', setItem() {} },
    setTimeout: () => 1, clearTimeout() {},
    setInterval(fn) { interval = fn; return 1; }, clearInterval() {},
  });
  const user = { role: 'DEPARTMENT', slug: 'test' };
  let tree;
  function render() {
    cursor = 0;
    effects = [];
    tree = exports.default({ user });
    const visit = (node) => {
      if (!node || typeof node !== 'object') return;
      if (node.props?.ref && node.type === 'div') node.props.ref.current = node.props.onScroll
        ? { scrollHeight: 300, scrollTop: 200, clientHeight: 100 }
        : { scrollIntoView() { scrolls++; } };
      node.children?.forEach(visit);
    };
    visit(tree);
    effects.forEach((effect) => effect());
    return tree;
  }
  function find(predicate, node = tree) {
    if (!node || typeof node !== 'object') return undefined;
    if (predicate(node)) return node;
    for (const child of node.children || []) { const result = find(predicate, child); if (result) return result; }
  }
  function text(node = tree) {
    if (typeof node === 'string') return node;
    return node?.children?.map(text).join('') || '';
  }
  return { render, find, text, requests, sends, document, tick: () => interval(), visible: () => visibility(), thread,
    setChatState: (value) => { chatState = value; }, getScrolls: () => scrolls,
    setSelected: (value) => { selected = value; } };
}

const message = (id, threadId) => ({ id, threadId, body: id, createdAt: '2026-01-01T12:00:00Z', isMine: true });
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test('wolne pobieranie nie jest zagładzane przez polling, wysyłanie i zmiana wątku nie czekają', async () => {
  const h = harness(); h.render();
  h.find((n) => n.props['aria-label'] === 'Czat').props.onClick(); await flush(); h.render();
  h.find((n) => n.type === 'button' && h.text(n).includes('A')).props.onClick(); h.render();
  h.tick(); h.tick(); h.tick();
  assert.equal(h.requests.length, 1);
  h.requests[0].resolve({ success: true, messages: [message('wolna odpowiedz', 'A')] });
  await flush(); h.render();
  assert.match(h.text(), /wolna odpowiedz/);
  assert.equal(h.find((n) => n.props.className?.includes('animate-spin')), undefined);

  h.tick();
  h.find((n) => n.type === 'textarea').props.onChange({ target: { value: 'wyslana' } }); h.render();
  h.find((n) => n.props['aria-label'] === 'Wyślij').props.onClick();
  assert.equal(h.sends[0].data.threadId, 'A');
  h.sends[0].resolve({ success: true, threadId: 'A' }); await flush(); h.render();
  assert.equal(h.requests.length, 3);
  h.tick(); h.tick();
  assert.equal(h.requests.length, 3);
  h.requests[2].resolve({ success: true, messages: [message('po wyslaniu', 'A')] }); await flush(); h.render();
  h.requests[1].resolve({ success: true, messages: [message('przed wyslaniem', 'A')] }); await flush(); h.render();
  assert.match(h.text(), /po wyslaniu/);
  assert.doesNotMatch(h.text(), /przed wyslaniem/);

  h.tick();
  h.find((n) => n.props['aria-label'] === 'Wstecz').props.onClick(); await flush(); h.render();
  h.find((n) => n.type === 'button' && h.text(n).startsWith('B')).props.onClick(); h.render();
  assert.equal(h.requests.at(-1).id, 'B');
  h.requests[4].resolve({ success: true, messages: [message('watek B', 'B')] }); await flush(); h.render();
  h.requests[3].resolve({ success: true, messages: [message('stary A', 'A')] }); await flush(); h.render();
  assert.match(h.text(), /watek B/);
  assert.doesNotMatch(h.text(), /stary A/);
});

test('polling, widoczność i wyścigi odpowiedzi wątków', async () => {
  const h = harness();
  h.render();
  h.find((n) => n.props['aria-label'] === 'Czat').props.onClick();
  await flush(); h.render();
  h.find((n) => n.type === 'button' && h.text(n).includes('A')).props.onClick();
  h.render();
  h.requests[0].resolve({ success: true, messages: [message('pierwsza', 'A')] });
  await flush(); h.render();
  assert.match(h.text(), /pierwsza/);
  h.tick(); h.render();
  assert.match(h.text(), /pierwsza/);
  assert.equal(h.find((n) => n.props.className?.includes('animate-spin')), undefined);
  h.visible();
  h.requests[2].resolve({ success: true, messages: [message('nowsza', 'A')] });
  await flush(); h.render();
  h.requests[1].resolve({ success: true, messages: [message('stara', 'A')] });
  await flush(); h.render();
  assert.match(h.text(), /nowsza/);
  assert.doesNotMatch(h.text(), /stara/);
  h.tick();
  h.find((n) => n.props['aria-label'] === 'Wstecz').props.onClick();
  await flush(); h.render();
  h.find((n) => n.type === 'button' && h.text(n).startsWith('B')).props.onClick();
  h.render();
  h.requests[4].resolve({ success: true, messages: [message('wiadomosc B', 'B')] });
  await flush(); h.render();
  h.requests[3].resolve({ success: true, messages: [message('obcy A', 'A')] });
  await flush(); h.render();
  assert.match(h.text(), /wiadomosc B/);
  assert.doesNotMatch(h.text(), /obcy A/);
  h.document.visibilityState = 'hidden'; h.visible(); h.tick();
  assert.equal(h.requests.length, 5);
});

test('identyczne wiadomości nie przewijają, nowa rozmowa nie używa starego wątku', async () => {
  const h = harness(); h.render();
  h.find((n) => n.props['aria-label'] === 'Czat').props.onClick(); await flush(); h.render();
  h.find((n) => n.type === 'button' && h.text(n).includes('A')).props.onClick(); h.render();
  h.requests[0].resolve({ success: true, messages: [message('tekst', 'A')] }); await flush(); h.render();
  const before = h.getScrolls();
  h.tick(); h.requests[1].resolve({ success: true, messages: [message('tekst', 'A')] }); await flush(); h.render();
  assert.equal(h.getScrolls(), before);
  const container = h.find((n) => n.props.onScroll);
  container.props.ref.current.scrollTop = 0;
  container.props.onScroll();
  h.tick(); h.requests[2].resolve({ success: true, messages: [message('tekst', 'A'), message('nowa', 'A')] }); await flush(); h.render();
  assert.equal(h.getScrolls(), before);
  const atBottom = h.find((n) => n.props.onScroll);
  atBottom.props.onScroll();
  h.setSelected(true);
  h.tick(); h.requests[3].resolve({ success: true, messages: [message('tekst', 'A'), message('nowa', 'A'), message('kolejna', 'A')] }); await flush(); h.render();
  assert.equal(h.getScrolls(), before);
  h.find((n) => n.props['aria-label'] === 'Wstecz').props.onClick(); await flush(); h.render();
  h.find((n) => n.type === 'button' && h.text(n).includes('Nowa wiadomość')).props.onClick(); h.render();
  h.find((n) => n.type === 'textarea').props.onChange({ target: { value: 'nowa' } }); h.render();
  h.find((n) => n.type === 'button' && h.text(n).includes('Wyślij wiadomość')).props.onClick();
  assert.equal(h.sends[0].data.threadId, null);
  h.setChatState({ threads: [h.thread('C')], totalUnread: 0, departments: [], employees: [] });
  h.sends[0].resolve({ success: true, threadId: 'C' }); await flush(); h.render();
  assert.equal(h.requests.at(-1).id, 'C');
});
