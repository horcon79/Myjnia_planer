'use client';

import React, { createContext, useContext, useMemo, useState } from 'react';
import { AppLocale, DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_STORAGE_KEY, isSupportedLocale } from './config';
import { getMessages, MessageTree } from './messages';

type I18nContextValue = {
  locale: AppLocale;
  messages: MessageTree;
  setLocale: (locale: AppLocale) => void;
  formatDate: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  initialLocale = DEFAULT_LOCALE,
  children,
}: {
  initialLocale?: AppLocale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<AppLocale>(initialLocale);

  const setLocale = (nextLocale: AppLocale) => {
    if (!isSupportedLocale(nextLocale)) return;
    setLocaleState(nextLocale);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
    } catch {}
    document.cookie = `${LOCALE_COOKIE}=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = nextLocale === 'pl-PL' ? 'pl' : 'en';
  };

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    messages: getMessages(locale),
    setLocale,
    formatDate: (value, options) => new Intl.DateTimeFormat(locale, options).format(new Date(value)),
    formatNumber: (value, options) => new Intl.NumberFormat(locale, options).format(value),
  }), [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used within I18nProvider');
  return context;
}
