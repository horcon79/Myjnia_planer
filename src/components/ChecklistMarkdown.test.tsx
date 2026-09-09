import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import ChecklistMarkdown from './ChecklistMarkdown';

test('renders headings, lists, emphasis and GFM task lists', () => {
  const html = renderToStaticMarkup(<ChecklistMarkdown markdown={'## Kontrola\n\n- Szyby\n- **Karoseria**\n\n- [ ] Wnętrze'} />);
  assert.match(html, /<h2>Kontrola<\/h2>/);
  assert.match(html, /<li>\s*<p>Szyby<\/p>\s*<\/li>/);
  assert.match(html, /<strong>Karoseria<\/strong>/);
  assert.match(html, /type="checkbox"/);
  assert.match(html, /disabled=""/);
});

test('does not execute raw HTML or unsafe links or load remote images', () => {
  const html = renderToStaticMarkup(<ChecklistMarkdown markdown={'<script>alert(1)</script>\n\n[Link](javascript:alert%281%29)\n\n![Opis](https://example.com/tracker.png)\n\n<img src=x onerror=alert(1)>'} />);
  assert.doesNotMatch(html, /<script|<img|javascript:|onerror=/);
  assert.match(html, /Opis/);
});
