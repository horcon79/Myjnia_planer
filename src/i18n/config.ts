export const SUPPORTED_LOCALES = ['pl-PL', 'en-GB'] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = 'pl-PL';
export const LOCALE_COOKIE = 'myjnia_locale';
export const LOCALE_STORAGE_KEY = 'myjnia_locale';

export const localeLabels: Record<AppLocale, string> = {
  'pl-PL': 'PL',
  'en-GB': 'EN',
};

export function isSupportedLocale(value: string | null | undefined): value is AppLocale {
  return !!value && SUPPORTED_LOCALES.includes(value as AppLocale);
}

export function toHtmlLang(locale: AppLocale) {
  return locale === 'pl-PL' ? 'pl' : 'en';
}
