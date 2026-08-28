import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isSupportedLocale } from './config';
import { getMessages } from './messages';

export async function getServerI18n() {
  const cookieStore = await cookies();
  const value = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isSupportedLocale(value) ? value : DEFAULT_LOCALE;
  return { locale, messages: getMessages(locale) };
}
