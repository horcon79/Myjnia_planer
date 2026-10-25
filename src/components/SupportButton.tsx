'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  Inbox,
  LifeBuoy,
  Lightbulb,
  Loader2,
  RefreshCw,
  Send,
  Wrench,
  X,
} from 'lucide-react';
import { SessionUser } from '@/actions/auth';
import {
  getSupportReports,
  submitSupportReport,
  type SupportReportDTO,
} from '@/actions/support';

type ReportType = 'BUG' | 'CHANGE' | 'IDEA';

const TYPE_OPTIONS: { value: ReportType; label: string; icon: React.ElementType }[] = [
  { value: 'BUG', label: 'Błąd', icon: Bug },
  { value: 'CHANGE', label: 'Poprawka', icon: Wrench },
  { value: 'IDEA', label: 'Pomysł', icon: Lightbulb },
];

const TYPE_META: Record<ReportType, { label: string; icon: React.ElementType; className: string }> = {
  BUG: { label: 'Błąd', icon: Bug, className: 'border-rose-500/30 bg-rose-500/10 text-rose-300' },
  CHANGE: { label: 'Poprawka', icon: Wrench, className: 'border-amber-500/30 bg-amber-500/10 text-amber-300' },
  IDEA: { label: 'Pomysł', icon: Lightbulb, className: 'border-sky-500/30 bg-sky-500/10 text-sky-300' },
};

const MESSAGE_LIMIT = 4000;

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SupportButton({ user }: { user: SessionUser | null }) {
  const [open, setOpen] = useState(false);
  const [reports, setReports] = useState<SupportReportDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<ReportType>('BUG');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getSupportReports();
    setLoading(false);
    if (result.success) {
      setReports(result.reports);
      return;
    }
    setReports([]);
    setError(result.error || 'Nie udało się odczytać zgłoszeń.');
  }, []);

  const openModal = () => {
    setOpen(true);
    setSuccess(null);
    setError(null);
    if (user) void loadReports();
  };

  const closeModal = () => {
    if (sending) return;
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !sending) setOpen(false);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, sending]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = message.trim();
    if (trimmed.length < 3) {
      setError('Opisz zgłoszenie (minimum 3 znaki).');
      return;
    }

    setSending(true);
    setError(null);
    setSuccess(null);

    const location = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const result = await submitSupportReport({ type, message: trimmed, location });

    setSending(false);
    if (!result.success || !result.report) {
      setError(result.error || 'Nie udało się zapisać zgłoszenia.');
      return;
    }

    setMessage('');
    setSuccess('Dziękujemy. Zgłoszenie zostało zapisane.');
    const savedReport = result.report;
    setReports((current) => [savedReport, ...current.filter((item) => item.id !== savedReport.id)]);
  };

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        title="Support - zgłoś błąd lub pomysł"
        aria-label="Otwórz support i zgłoś błąd lub pomysł"
        className="min-h-11 shrink-0 inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-2.5 sm:px-3 text-amber-300 hover:bg-amber-500/20 hover:text-amber-200 transition-colors"
      >
        <LifeBuoy className="w-5 h-5" />
        <span className="hidden sm:inline text-xs font-bold">Support</span>
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="support-modal-title"
            className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl sm:max-h-[calc(100dvh-2rem)]"
          >
            <div className="flex shrink-0 items-center gap-3 border-b border-slate-700/70 bg-gradient-to-r from-amber-500/15 via-slate-900 to-slate-900 px-4 py-3.5 sm:px-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-300">
                <LifeBuoy className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="support-modal-title" className="text-base font-extrabold text-white sm:text-lg">
                  Zgłoś błąd lub pomysł
                </h2>
                <p className="truncate text-[11px] text-slate-400">
                  Support Myjnia Planer · zgłoszenia widoczne dla wszystkich użytkowników
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                disabled={sending}
                aria-label="Zamknij okno supportu"
                className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {!user ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
                <AlertTriangle className="h-10 w-10 text-amber-400" />
                <p className="text-sm font-bold text-white">Zaloguj się, aby wysłać zgłoszenie</p>
                <p className="max-w-md text-xs text-slate-400">
                  Lista zgłoszeń i formularz supportu są dostępne po wybraniu profilu i zalogowaniu się do aplikacji.
                </p>
              </div>
            ) : (
              <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:overflow-hidden">
                <form onSubmit={handleSubmit} className="flex min-h-0 flex-col gap-4 border-b border-slate-700/70 p-4 sm:p-6 lg:overflow-y-auto lg:border-b-0 lg:border-r">
                  <div className="rounded-2xl border border-sky-500/25 bg-sky-500/10 p-3.5">
                    <p className="text-xs leading-relaxed text-sky-100">
                      Aby ułatwić rozwój aplikacji, prosimy o szczegółowe opisanie błędu lub konieczności poprawki, zmiany, usprawnienia.
                    </p>
                  </div>

                  <fieldset>
                    <legend className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-slate-400">
                      Rodzaj zgłoszenia
                    </legend>
                    <div className="grid grid-cols-3 gap-2">
                      {TYPE_OPTIONS.map((option) => {
                        const Icon = option.icon;
                        const active = type === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setType(option.value)}
                            aria-pressed={active}
                            className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-2 text-xs font-bold transition-colors ${
                              active
                                ? 'border-sky-400/60 bg-sky-500/20 text-white'
                                : 'border-slate-700 bg-slate-950 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                            }`}
                          >
                            <Icon className="h-4 w-4" />
                            <span>{option.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>

                  <div className="flex min-h-0 flex-1 flex-col">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <label htmlFor="support-message" className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                        Opis zgłoszenia
                      </label>
                      <span className={`text-[10px] font-mono ${message.length > MESSAGE_LIMIT * 0.9 ? 'text-amber-400' : 'text-slate-500'}`}>
                        {message.length}/{MESSAGE_LIMIT}
                      </span>
                    </div>
                    <textarea
                      id="support-message"
                      value={message}
                      onChange={(event) => setMessage(event.target.value.slice(0, MESSAGE_LIMIT))}
                      rows={7}
                      maxLength={MESSAGE_LIMIT}
                      required
                      placeholder="Opisz, co się stało, czego dotyczy zgłoszenie i jaki efekt jest oczekiwany. Jeśli to możliwe, podaj nazwę zlecenia, dział lub godzinę wystąpienia problemu."
                      className="min-h-36 w-full flex-1 resize-y rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-sm text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                    />
                  </div>

                  <div className="rounded-xl border border-slate-700/70 bg-slate-950/70 px-3 py-2 text-[11px] text-slate-400">
                    Zgłoszenie zapisze się jako:{' '}
                    <span className="font-bold text-slate-200">@{user.slug}</span>
                    {' '}({user.name}) · miejsce:{' '}
                    <span className="font-mono text-slate-300">
                      {typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : '/'}
                    </span>
                  </div>

                  {error && (
                    <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-300">
                      {error}
                    </p>
                  )}
                  {success && (
                    <p role="status" className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      {success}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={sending || message.trim().length < 3}
                    className="touch-btn w-full bg-gradient-to-r from-sky-500 to-blue-600 text-sm text-white shadow-lg shadow-sky-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    {sending ? 'Zapisywanie...' : 'Wyślij zgłoszenie'}
                  </button>
                </form>

                <section className="flex min-h-0 flex-col bg-slate-950/40">
                  <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-3 sm:px-6">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-300">
                        Wcześniejsze zgłoszenia
                      </h3>
                      <p className="text-[10px] text-slate-500">
                        {loading ? 'Ładowanie...' : `${reports.length} ${reports.length === 1 ? 'wpis' : 'wpisów'} (najnowsze pierwsze)`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void loadReports()}
                      disabled={loading || sending}
                      title="Odśwież listę zgłoszeń"
                      aria-label="Odśwież listę zgłoszeń"
                      className="flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-400 hover:text-white disabled:opacity-50"
                    >
                      <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 sm:px-4 lg:px-6">
                    {loading && reports.length === 0 ? (
                      <div className="flex items-center justify-center gap-2 py-12 text-xs text-slate-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Ładowanie zgłoszeń...
                      </div>
                    ) : reports.length === 0 ? (
                      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-700 px-4 py-12 text-center">
                        <Inbox className="h-9 w-9 text-slate-600" />
                        <p className="text-sm font-bold text-slate-300">Brak zgłoszeń</p>
                        <p className="text-xs text-slate-500">Twoje zgłoszenie będzie pierwsze na liście.</p>
                      </div>
                    ) : (
                      <ul className="space-y-2.5">
                        {reports.map((report) => {
                          const meta = TYPE_META[report.type] ?? TYPE_META.BUG;
                          const TypeIcon = meta.icon;
                          return (
                            <li key={report.id} className="rounded-2xl border border-slate-700/70 bg-slate-900 p-3.5">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-bold ${meta.className}`}>
                                  <TypeIcon className="h-3.5 w-3.5" />
                                  {meta.label}
                                </span>
                                <time dateTime={report.createdAt} className="text-[10px] font-mono text-slate-500">
                                  {formatDateTime(report.createdAt)}
                                </time>
                              </div>
                              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-100">
                                {report.message}
                              </p>
                              <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-slate-500">
                                <span className="font-bold text-sky-300">@{report.session.login}</span>
                                <span className="truncate max-w-[180px]">{report.session.name}</span>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono text-slate-400">{report.location}</span>
                                {report.appVersion && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span>wersja {report.appVersion}</span>
                                  </>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
