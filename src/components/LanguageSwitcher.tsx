'use client';

import React from 'react';
import { Languages } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { localeLabels, SUPPORTED_LOCALES } from '@/i18n/config';
import { useI18n } from '@/i18n/I18nProvider';

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, messages } = useI18n();
  const router = useRouter();

  const handleChange = (nextLocale: typeof SUPPORTED_LOCALES[number]) => {
    if (nextLocale === locale) return;
    setLocale(nextLocale);
    router.refresh();
  };

  return (
    <div className="flex items-center gap-1 rounded-xl border border-slate-700/70 bg-slate-900/80 p-1" aria-label={messages.language.label}>
      {!compact && <Languages className="mx-1 h-4 w-4 text-slate-400" />}
      {SUPPORTED_LOCALES.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => handleChange(item)}
          aria-pressed={locale === item}
          title={item === 'pl-PL' ? messages.language.polish : messages.language.english}
          className={`rounded-lg px-2.5 py-1.5 text-xs font-black transition-colors ${
            locale === item
              ? 'bg-sky-500 text-white shadow'
              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
          }`}
        >
          {localeLabels[item]}
        </button>
      ))}
    </div>
  );
}
