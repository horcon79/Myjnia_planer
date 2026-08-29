'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MessageCircle,
  X,
  Send,
  ArrowLeft,
  Plus,
  CheckCheck,
  Users,
  Droplets,
  ShieldCheck,
  Store,
} from 'lucide-react';
import {
  getChatState,
  getThreadMessages,
  sendChatMessage,
  ChatStateDTO,
  ChatThreadDTO,
  ChatMessageDTO,
} from '@/actions/chat';
import { SessionUser } from '@/actions/auth';

type View = 'list' | 'thread' | 'new';

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return time;
  return `${d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })}, ${time}`;
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
    setTimeout(() => ctx.close(), 500);
  } catch {
    /* ignore */
  }
}

export default function FloatingChat({ user }: { user: SessionUser | null }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ChatStateDTO>({ threads: [], totalUnread: 0, departments: [], employees: [] });
  const [view, setView] = useState<View>('list');
  const [activeThread, setActiveThread] = useState<ChatThreadDTO | null>(null);
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [composer, setComposer] = useState('');
  const [asEmployeeId, setAsEmployeeId] = useState('');
  const [newDepId, setNewDepId] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pulse, setPulse] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevUnreadRef = useRef(0);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const isWasherOrAdmin = user?.role === 'WASHER' || user?.role === 'ADMIN';

  // Zapamiętane imię nadawcy (odczyt przy montowaniu; komponent jest remontowany przez key=user.slug)
  const [senderName, setSenderName] = useState(() => {
    if (typeof window !== 'undefined' && user) {
      return localStorage.getItem(`chat_name_${user.slug}`) || '';
    }
    return '';
  });

  const refresh = useCallback(async () => {
    if (!user) return;
    const s = await getChatState();
    setState(s);
    const prev = prevUnreadRef.current;
    if (s.totalUnread > prev && prev !== 0) {
      playBeep();
      setPulse(true);
      setTimeout(() => setPulse(false), 1200);
    }
    prevUnreadRef.current = s.totalUnread;
  }, [user]);

  // Polling
  useEffect(() => {
    if (!user) return;
    const initial = setTimeout(() => refresh(), 0);
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 6000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [user, refresh]);

  // Zapis imienia
  useEffect(() => {
    if (user && senderName.trim()) {
      localStorage.setItem(`chat_name_${user.slug}`, senderName.trim());
    }
  }, [senderName, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, view]);

  const openThread = async (t: ChatThreadDTO) => {
    setActiveThread(t);
    setView('thread');
    setLoadingMessages(true);
    setError(null);
    const res = await getThreadMessages(t.id);
    setLoadingMessages(false);
    if (res.success && res.messages) {
      setMessages(res.messages);
      // Odśwież liczniki po przeczytaniu
      const s = stateRef.current;
      setState({
        ...s,
        totalUnread: Math.max(0, s.totalUnread - t.unreadCount),
        threads: s.threads.map((x) => (x.id === t.id ? { ...x, unreadCount: 0 } : x)),
      });
      prevUnreadRef.current = stateRef.current.totalUnread;
    } else {
      setError(res.error || 'Nie udało się pobrać wiadomości.');
    }
  };

  const startNewThread = () => {
    setView('new');
    setError(null);
    setComposer('');
    setNewDepId('');
  };

  const handleSend = async () => {
    const body = composer.trim();
    const name = senderName.trim();
    if (!body || !name) {
      setError(!name ? 'Wpisz swoje imię i nazwisko.' : 'Wpisz treść wiadomości.');
      return;
    }
    setSending(true);
    setError(null);

    const threadId = activeThread?.id || null;
    let departmentId: string | null = null;

    if (!threadId && view === 'new') {
      if (isWasherOrAdmin) {
        if (!newDepId) {
          setError('Wybierz dział, do którego chcesz napisać.');
          setSending(false);
          return;
        }
        departmentId = newDepId;
      }
    }

    const res = await sendChatMessage({
      threadId,
      departmentId,
      body,
      senderName: name,
      asEmployeeId: user?.role === 'WASHER' && asEmployeeId ? asEmployeeId : null,
    });
    setSending(false);

    if (!res.success) {
      setError(res.error || 'Błąd wysyłania.');
      return;
    }

    setComposer('');
    if (res.threadId) {
      if (!threadId) {
        // Nowy wątek - odśwież listę i otwórz
        await refresh();
        const created = stateRef.current.threads.find((t) => t.id === res.threadId);
        if (created) await openThread(created);
        else setView('list');
      } else {
        await openThreadById(res.threadId);
      }
    }
  };

  const openThreadById = async (id: string) => {
    const t = stateRef.current.threads.find((x) => x.id === id);
    if (t) {
      await openThread(t);
    } else {
      const s = await getChatState();
      setState(s);
      const created = s.threads.find((x) => x.id === id);
      if (created) await openThread(created);
    }
  };

  if (!user) return null;

  const lastMsgOf = (t: ChatThreadDTO) => t.lastMessage;
  const threadTitle = (t: ChatThreadDTO) => {
    if (isWasherOrAdmin) return t.departmentName || 'Rozmowa globalna';
    return t.departmentName || 'Myjnia';
  };

  const senderLabel = (m: ChatMessageDTO) => {
    if (m.senderType === 'WASHER') {
      return m.senderEmployeeName ? `${m.senderEmployeeName} (Myjnia)` : m.senderName;
    }
    if (m.senderType === 'ADMIN') return `${m.senderName} (Admin)`;
    return `${m.senderName} (${m.senderDepartmentName || 'Dział'})`;
  };

  const senderBadgeStyle = (m: ChatMessageDTO) => {
    if (m.senderType === 'WASHER') return { backgroundColor: '#0ea5e9' };
    if (m.senderType === 'ADMIN') return { backgroundColor: '#a855f7' };
    return { backgroundColor: m.senderDepartmentColor || '#3b82f6' };
  };

  return (
    <>
      {/* Pływająca ikona chatu */}
      <button
        onClick={() => {
          setOpen(!open);
          if (!open) {
            setView('list');
            refresh();
          }
        }}
        aria-label="Czat"
        className={`chat-fab fixed bottom-5 right-5 z-[90] w-14 h-14 md:w-16 md:h-16 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 shadow-xl shadow-sky-500/30 flex items-center justify-center text-white hover:scale-110 active:scale-95 transition-transform ${pulse ? 'chat-fab-ping' : ''}`}
      >
        {open ? <X className="w-6 h-6" /> : <MessageCircle className="w-7 h-7" />}
        {!open && state.totalUnread > 0 && (
          <span className="chat-badge absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1 rounded-full bg-rose-500 text-white text-[11px] font-bold flex items-center justify-center shadow-lg">
            {state.totalUnread > 99 ? '99+' : state.totalUnread}
          </span>
        )}
        {!open && state.totalUnread > 0 && (
          <span className="chat-fab-ring absolute inset-0 rounded-full bg-sky-400/40 animate-ping" />
        )}
      </button>

      {/* Popup chatu */}
      {open && (
        <div className="chat-popup fixed bottom-24 right-4 sm:right-5 z-[95] w-[calc(100vw-2rem)] max-w-[380px] h-[min(560px,calc(100vh-8rem))] rounded-2xl overflow-hidden shadow-2xl border border-slate-700/60 bg-slate-900/95 backdrop-blur-xl flex flex-col">
          {/* Nagłówek */}
          <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-sky-600 to-blue-700 border-b border-slate-700/50 shrink-0">
            {view === 'thread' && (
              <button
                onClick={() => { setView('list'); setActiveThread(null); refresh(); }}
                className="p-1.5 rounded-lg hover:bg-white/15 transition-colors"
                aria-label="Wstecz"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              {isWasherOrAdmin ? <Users className="w-5 h-5" /> : <Droplets className="w-5 h-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-sm text-white leading-tight truncate">
                {view === 'thread' ? threadTitle(activeThread!) : 'Czat'}
              </p>
              <p className="text-[11px] text-sky-100/80 leading-tight truncate">
                {view === 'thread'
                  ? 'Rozmowa'
                  : isWasherOrAdmin
                    ? 'Wszystkie działy'
                    : 'Twoje rozmowy z myjnią'}
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg hover:bg-white/15 transition-colors"
              aria-label="Zamknij"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Treść */}
          {view === 'list' && (
            <div className="flex-1 overflow-y-auto">
              <div className="p-3">
                <button
                  onClick={startNewThread}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-300 text-sm font-semibold hover:bg-sky-500/25 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  {isWasherOrAdmin ? 'Nowa rozmowa z działem' : 'Nowa wiadomość do myjni'}
                </button>
              </div>
              {state.threads.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
                  <MessageCircle className="w-12 h-12 text-slate-700 mb-3" />
                  <p className="text-slate-400 text-sm font-medium">Brak rozmów</p>
                  <p className="text-slate-500 text-xs mt-1">Rozpocznij nową rozmowę powyżej</p>
                </div>
              ) : (
                <ul className="px-2 pb-3 space-y-1">
                  {state.threads.map((t) => {
                    const lm = lastMsgOf(t);
                    return (
                      <li key={t.id}>
                        <button
                          onClick={() => openThread(t)}
                          className={`w-full text-left flex items-start gap-3 p-3 rounded-xl transition-colors hover:bg-slate-800/80 ${t.unreadCount > 0 ? 'bg-slate-800/50' : ''}`}
                        >
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow"
                            style={{ backgroundColor: t.departmentColor || '#0ea5e9' }}
                          >
                            {isWasherOrAdmin ? <Store className="w-5 h-5 text-white" /> : <Droplets className="w-5 h-5 text-white" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className={`text-sm truncate ${t.unreadCount > 0 ? 'font-bold text-white' : 'font-semibold text-slate-200'}`}>
                                {threadTitle(t)}
                              </p>
                              <span className="text-[10px] text-slate-500 shrink-0">
                                {lm ? formatTime(lm.createdAt) : ''}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2 mt-0.5">
                              <p className={`text-xs truncate ${t.unreadCount > 0 ? 'text-slate-200 font-medium' : 'text-slate-500'}`}>
                                {lm ? `${senderLabel(lm)}: ${lm.body}` : 'Brak wiadomości'}
                              </p>
                              {t.unreadCount > 0 && (
                                <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                                  {t.unreadCount}
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {view === 'new' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {isWasherOrAdmin && (
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5 block">
                    Dział odbiorcy
                  </label>
                  <select
                    value={newDepId}
                    onChange={(e) => setNewDepId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                  >
                    <option value="">— Wybierz dział —</option>
                    {state.departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5 block">
                  Twoje imię i nazwisko
                </label>
                <input
                  type="text"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  placeholder="np. Marek Kowalski"
                  maxLength={60}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5 block">
                  Wiadomość
                </label>
                <textarea
                  value={composer}
                  onChange={(e) => setComposer(e.target.value)}
                  placeholder="Napisz wiadomość..."
                  rows={4}
                  maxLength={4000}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 resize-none"
                />
              </div>
              {error && <p className="text-rose-400 text-xs font-medium">{error}</p>}
              <button
                onClick={handleSend}
                disabled={sending}
                className="w-full touch-btn bg-gradient-to-r from-sky-500 to-blue-600 text-white text-sm shadow-lg shadow-sky-500/25 disabled:opacity-50"
              >
                <Send className="w-4 h-4 mr-2" />
                {sending ? 'Wysyłanie...' : 'Wyślij wiadomość'}
              </button>
            </div>
          )}

          {view === 'thread' && activeThread && (
            <>
              <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2" style={{ background: 'radial-gradient(circle at 80% 10%, rgba(56,189,248,0.06), transparent 50%)' }}>
                {loadingMessages ? (
                  <div className="flex justify-center py-10">
                    <div className="w-8 h-8 border-2 border-sky-500/30 border-t-sky-400 rounded-full animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <MessageCircle className="w-10 h-10 text-slate-700 mb-2" />
                    <p className="text-slate-500 text-xs">Brak wiadomości w tej rozmowie</p>
                  </div>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className={`flex ${m.isMine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl px-3 py-2 shadow ${
                          m.isMine
                            ? 'bg-gradient-to-br from-sky-600 to-blue-700 rounded-br-md'
                            : 'bg-slate-800 rounded-bl-md border border-slate-700/50'
                        }`}
                      >
                        {!m.isMine && (
                          <div className="flex items-center gap-1.5 mb-1">
                            <span
                              className="w-4 h-4 rounded-full shrink-0 inline-block"
                              style={senderBadgeStyle(m)}
                            />
                            <span className="text-[11px] font-bold text-sky-300 truncate">
                              {senderLabel(m)}
                            </span>
                          </div>
                        )}
                        <p className={`text-sm whitespace-pre-wrap break-words leading-snug ${m.isMine ? 'text-white' : 'text-slate-100'}`}>
                          {m.body}
                        </p>
                        <div className={`flex items-center gap-1 mt-1 ${m.isMine ? 'justify-end' : ''}`}>
                          <span className={`text-[10px] ${m.isMine ? 'text-sky-200/70' : 'text-slate-500'}`}>
                            {formatTime(m.createdAt)}
                          </span>
                          {m.isMine && <CheckCheck className="w-3 h-3 text-sky-200/70" />}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Kompozytor */}
              <div className="border-t border-slate-700/50 bg-slate-900 shrink-0 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder="Twoje imię..."
                    maxLength={60}
                    className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                  />
                  {user.role === 'WASHER' && state.employees.length > 0 && (
                    <select
                      value={asEmployeeId}
                      onChange={(e) => setAsEmployeeId(e.target.value)}
                      title="Wyślij jako"
                      className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50 max-w-[140px]"
                    >
                      <option value="">Myjnia</option>
                      {state.employees.map((e) => (
                        <option key={e.id} value={e.id}>{e.shortName}</option>
                      ))}
                    </select>
                  )}
                  {user.role === 'ADMIN' && (
                    <span className="flex items-center gap-1 text-[10px] text-purple-300 font-semibold shrink-0">
                      <ShieldCheck className="w-3.5 h-3.5" /> Admin
                    </span>
                  )}
                </div>
                {error && <p className="text-rose-400 text-xs font-medium">{error}</p>}
                <div className="flex items-end gap-2">
                  <textarea
                    value={composer}
                    onChange={(e) => setComposer(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Napisz wiadomość... (Enter = wyślij)"
                    rows={1}
                    maxLength={4000}
                    className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 resize-none max-h-28"
                  />
                  <button
                    onClick={handleSend}
                    disabled={sending || !composer.trim()}
                    className="w-11 h-11 shrink-0 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/25 hover:scale-105 active:scale-95 transition-transform disabled:opacity-40 disabled:hover:scale-100"
                    aria-label="Wyślij"
                  >
                    <Send className="w-4.5 h-4.5" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
