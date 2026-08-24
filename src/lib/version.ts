import { execSync } from 'child_process';
import { cache } from 'react';

// Wersja aplikacji liczona automatycznie z liczby commitów (format: 1.{count}).
// W trybie build env NEXT_PUBLIC_APP_VERSION jest osadzany przez next.config.ts.
export const getAppVersion = cache((): string => {
  const fromEnv = process.env.NEXT_PUBLIC_APP_VERSION;
  if (fromEnv) return fromEnv;

  try {
    const count = execSync('git rev-list --count HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    }).trim();
    if (/^\d+$/.test(count)) {
      return `1.${count}`;
    }
  } catch {
    // brak repozytorium git – fallback do stałej
  }

  return '1.0';
});
