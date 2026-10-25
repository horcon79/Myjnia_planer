'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Planner route error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-slate-100">
      <div className="w-full max-w-lg rounded-3xl border border-rose-700/70 bg-slate-900 p-8 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10 text-3xl text-rose-400">
          !
        </div>
        <h1 className="text-xl font-extrabold text-white">Nie udało się wczytać widoku</h1>
        <p className="mt-2 text-sm text-slate-400">
          Wystąpił chwilowy problem z danymi. Spróbuj ponownie — zgłoszenie zostało zapisane w logach serwera.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-[11px] text-slate-500">Kod: {error.digest}</p>
        )}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => reset()}
            className="flex-1 rounded-xl bg-sky-500 px-5 py-3 text-sm font-extrabold text-white hover:bg-sky-400"
          >
            Spróbuj ponownie
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex-1 rounded-xl bg-slate-800 px-5 py-3 text-sm font-bold text-slate-200 hover:bg-slate-700"
          >
            Odśwież stronę
          </button>
        </div>
        <Link href="/" className="mt-4 inline-block text-xs font-bold text-sky-400 hover:text-sky-300">
          Wróć do ekranu logowania
        </Link>
      </div>
    </div>
  );
}
