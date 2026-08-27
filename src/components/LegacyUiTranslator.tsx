'use client';

import { useEffect } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { translateLegacyText } from '@/i18n/legacyTranslations';

function translateNode(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let current: Node | null = walker.nextNode();
  while (current) {
    if (current instanceof Text) nodes.push(current);
    current = walker.nextNode();
  }

  for (const node of nodes) {
    const parent = node.parentElement;
    if (!parent) continue;
    if (['SCRIPT', 'STYLE', 'CODE', 'PRE'].includes(parent.tagName)) continue;
    const value = node.nodeValue || '';
    const translated = translateLegacyText(value);
    if (translated !== value) node.nodeValue = translated;
  }

  if (root instanceof HTMLElement) {
    const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>('[placeholder],[title],[aria-label]'))];
    for (const el of elements) {
      for (const attr of ['placeholder', 'title', 'aria-label']) {
        const value = el.getAttribute(attr);
        if (!value) continue;
        const translated = translateLegacyText(value);
        if (translated !== value) el.setAttribute(attr, translated);
      }
    }
  }
}

export function LegacyUiTranslator() {
  const { locale } = useI18n();

  useEffect(() => {
    if (locale !== 'en-GB') return;

    translateNode(document.body);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const added of mutation.addedNodes) translateNode(added);
        if (mutation.type === 'characterData' && mutation.target.parentNode) {
          translateNode(mutation.target.parentNode);
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, [locale]);

  return null;
}
