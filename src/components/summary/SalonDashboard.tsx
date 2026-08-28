'use client';

import React, { useState, useEffect } from 'react';
import { getOrdersForDate } from '@/actions/orders';
import { 
  CheckCircle2, 
  Clock, 
  RefreshCw, 
  Car, 
  Calendar, 
  Search, 
  Bell, 
  Sparkles,
  ArrowRight,
  Filter,
  Check,
  AlertTriangle,
  FileText,
  Zap,
  ShieldAlert
} from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

interface SalonDashboardProps {
  currentUser: any;
  departments: any[];
  categories: any[];
}

export default function SalonDashboard({
  currentUser,
  departments,
  categories,
}: SalonDashboardProps) {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('ALL');

  const loadData = async () => {
    try {
      const res = await getOrdersForDate(selectedDate);
      if (res.success && res.orders) {
        setOrders(res.orders);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 6000); // Polling co 6s
    return () => clearInterval(interval);
  }, [selectedDate]);

  const filteredOrders = orders.filter((o) => {
    if (selectedDeptFilter !== 'ALL' && o.departmentId !== selectedDeptFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchPlate = o.licensePlate.toLowerCase().includes(q);
      const matchModel = o.carModel?.toLowerCase().includes(q);
      const matchDept = o.department?.name?.toLowerCase().includes(q);
      if (!matchPlate && !matchModel && !matchDept) return false;
    }
    return true;
  });

  const readyOrders = filteredOrders.filter(o => o.status === 'READY');
  const inProgressOrders = filteredOrders.filter(o => o.status === 'IN_PROGRESS');
  const plannedOrders = filteredOrders.filter(o => o.status === 'PLANNED');
  const completedOrders = filteredOrders.filter(o => o.status === 'COMPLETED');
  const activeExpressOrders = filteredOrders.filter(o => o.isPriority && o.status !== 'COMPLETED');

  return (
    <div className="space-y-6 flex-1 flex flex-col">
      
      {/* Header Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight">
              Tablica Statusu Myjni na Żywo
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Bieżący podgląd stanu przygotowania pojazdów dla wszystkich działów salonu
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-slate-950 border border-slate-700 text-white text-xs sm:text-sm font-bold rounded-xl px-3.5 py-2.5 focus:border-sky-500"
          />

          <div className="relative flex-1 sm:w-56">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Szukaj rejestracji..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs placeholder:text-slate-500 focus:border-sky-500"
            />
          </div>

          <button
            onClick={loadData}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
            title="Odśwież"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Express / Urgent Orders Transparency Banner (Audit Log for all departments) */}
      {activeExpressOrders.length > 0 && (
        <div className="bg-gradient-to-r from-red-950/80 via-amber-950/60 to-slate-900 border-2 border-amber-500/80 rounded-3xl p-5 shadow-2xl space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-500 text-slate-950 font-black shadow animate-pulse">
                <Zap className="w-5 h-5 fill-current" />
              </div>
              <div>
                <h3 className="text-sm font-black text-amber-300 uppercase tracking-wider flex items-center gap-2">
                  <span>Aktywne Wrzutki Ekspresowe ({activeExpressOrders.length})</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    TRANSPARENTNOŚĆ AUDYTOWA
                  </span>
                </h3>
                <p className="text-xs text-amber-200/80">
                  Poniższe pojazdy zostały wprowadzone z priorytetem ekspresowym i wyprzedzają standardową kolejkę.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
            {activeExpressOrders.map((ord) => (
              <div
                key={`banner-${ord.id}`}
                className="bg-slate-950/80 border border-amber-500/50 rounded-2xl p-3.5 text-xs text-slate-300 space-y-2 shadow"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-black text-sm text-white px-2.5 py-1 rounded-lg bg-black border border-amber-500/40">
                    {ord.licensePlate}
                  </span>
                  <span
                    className="text-[10px] font-black px-2 py-0.5 rounded text-white"
                    style={{ backgroundColor: ord.department?.color || '#3b82f6' }}
                  >
                    {ord.department?.name}
                  </span>
                </div>
                <div className="text-[11px] space-y-1">
                  <div>
                    <span className="text-slate-400">Zatwierdził: </span>
                    <strong className="text-amber-300">{ord.priorityAuthorizer || 'Brak danych'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Powód wrzutki: </span>
                    <span className="text-white italic">{ord.priorityReason || 'Wydanie natychmiastowe'}</span>
                  </div>
                </div>
                <div className="pt-1.5 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
                  <span>Status: <strong className="text-amber-400">{ord.status === 'IN_PROGRESS' ? 'W trakcie mycia' : ord.status === 'READY' ? 'Gotowe' : 'W kolejce'}</strong></span>
                  <span>Cel: <strong className="text-white">{format(new Date(ord.targetReadyTime), 'HH:mm')}</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3 Main Status Columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 items-start">
        
        {/* Column 1: GOTOWE DO ODBIORU (Ready) */}
        <div className="bg-slate-900/90 border border-emerald-500/40 rounded-3xl p-5 shadow-2xl flex flex-col">
          <div className="flex items-center justify-between pb-4 border-b border-emerald-500/30 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <h2 className="text-base font-black text-emerald-400 uppercase tracking-wider">
                Gotowe Do Odbioru
              </h2>
            </div>
            <span className="font-mono font-black text-base px-2.5 py-1 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
              {readyOrders.length}
            </span>
          </div>

          {readyOrders.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              Brak aut oczekujących na odbiór.
            </div>
          ) : (
            <div className="space-y-3">
              {readyOrders.map((ord) => (
                <div
                  key={ord.id}
                  className={`border-2 rounded-2xl p-4 shadow-xl pulse-ready relative ${
                    ord.isPriority
                      ? 'bg-gradient-to-br from-amber-950/70 via-emerald-950/50 to-slate-950 border-amber-500 ring-2 ring-amber-500/30'
                      : 'bg-gradient-to-br from-emerald-950/70 to-slate-950 border-emerald-500'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono font-black text-xl text-white tracking-wider bg-black/60 px-3 py-1 rounded-xl border border-emerald-500/30 flex items-center gap-1.5">
                      {ord.isPriority && <span className="text-amber-400">⚡</span>}
                      {ord.licensePlate}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {ord.isPriority && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 uppercase flex items-center gap-0.5">
                          <Zap className="w-2.5 h-2.5 fill-current" /> Ekspres
                        </span>
                      )}
                      {ord.enteredByWash && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-violet-500 text-white uppercase" title="Wprowadzone ręcznie przez myjnię (bez planowania działu)">
                          Wpis myjni
                        </span>
                      )}
                      <span
                        className="text-[10px] font-black px-2 py-0.5 rounded text-white"
                        style={{ backgroundColor: ord.department?.color }}
                      >
                        {ord.department?.code}
                      </span>
                    </div>
                  </div>

                  <p className="font-bold text-sm text-slate-100 mb-1">
                    {ord.carModel || 'Pojazd salonowy'}
                  </p>
                  <p className="text-xs text-emerald-300 font-medium mb-2">
                    {ord.category?.name}
                  </p>

                  {/* Priority audit info */}
                  {ord.isPriority && (
                    <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-amber-950/70 border border-amber-500/40 text-[11px] text-amber-200">
                      <span className="text-amber-400 font-semibold">Zatwierdził: </span>
                      <strong className="text-white">{ord.priorityAuthorizer || 'Brak'}</strong>
                      {ord.priorityReason && (
                        <div className="text-[10px] text-amber-200/80 italic mt-0.5">
                          {ord.priorityReason}
                        </div>
                      )}
                    </div>
                  )}

                  {ord.notes && (
                    <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-sky-950/60 border border-sky-500/30 text-[11px] text-sky-200 flex items-start gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-sky-400 flex-shrink-0 mt-0.5" />
                      <span className="leading-snug">{ord.notes}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-emerald-500/20">
                    <span>Umył: <strong className="text-white">{ord.assignedEmployee?.name || 'Myjnia'}</strong></span>
                    <span className="font-mono text-emerald-400 font-bold">
                      {ord.completedAt ? format(new Date(ord.completedAt), 'HH:mm') : 'Przed chwilą'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Column 2: W TRAKCIE MYCIA (In Progress) */}
        <div className="bg-slate-900/90 border border-amber-500/40 rounded-3xl p-5 shadow-2xl flex flex-col">
          <div className="flex items-center justify-between pb-4 border-b border-amber-500/30 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                <RefreshCw className="w-4 h-4 animate-spin" />
              </div>
              <h2 className="text-base font-black text-amber-400 uppercase tracking-wider">
                W Trakcie Mycia
              </h2>
            </div>
            <span className="font-mono font-black text-base px-2.5 py-1 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40">
              {inProgressOrders.length}
            </span>
          </div>

          {inProgressOrders.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              Stanowiska są w tej chwili wolne.
            </div>
          ) : (
            <div className="space-y-3">
              {inProgressOrders.map((ord) => (
                <div
                  key={ord.id}
                  className={`border rounded-2xl p-4 shadow-xl pulse-in-progress ${
                    ord.isPriority
                      ? 'bg-gradient-to-br from-red-950/70 via-amber-950/60 to-slate-950 border-amber-500 ring-2 ring-amber-500/30'
                      : 'bg-gradient-to-br from-amber-950/60 to-slate-950 border-amber-500/60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono font-black text-lg text-white tracking-wider bg-black/60 px-2.5 py-1 rounded-xl border border-amber-500/30 flex items-center gap-1.5">
                      {ord.isPriority && <span className="text-amber-400">⚡</span>}
                      {ord.licensePlate}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {ord.isPriority && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-gradient-to-r from-amber-500 to-red-500 text-slate-950 uppercase flex items-center gap-0.5 shadow">
                          <Zap className="w-2.5 h-2.5 fill-current" /> Ekspres
                        </span>
                      )}
                      {ord.enteredByWash && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-violet-500 text-white uppercase" title="Wprowadzone ręcznie przez myjnię (bez planowania działu)">
                          Wpis myjni
                        </span>
                      )}
                      <span
                        className="text-[10px] font-black px-2 py-0.5 rounded text-white"
                        style={{ backgroundColor: ord.department?.color }}
                      >
                        {ord.department?.name}
                      </span>
                    </div>
                  </div>

                  {/* Priority audit info */}
                  {ord.isPriority && (
                    <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-amber-950/70 border border-amber-500/40 text-[11px] text-amber-200">
                      <span className="text-amber-400 font-semibold">Zatwierdził: </span>
                      <strong className="text-white">{ord.priorityAuthorizer || 'Brak'}</strong>
                      {ord.priorityReason && (
                        <div className="text-[10px] text-amber-200/80 italic mt-0.5">
                          Powód: {ord.priorityReason}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Delay Warning Notification on TV Dashboard */}
                  {ord.scheduledStartTime && 
                    (new Date(ord.scheduledStartTime).getTime() + (ord.durationMin || 30) * 60000) > new Date(ord.targetReadyTime).getTime() && (
                    <div className="mb-2 px-2.5 py-1 rounded-lg bg-rose-500/25 border border-rose-500/60 text-rose-300 text-[10px] font-bold flex items-center gap-1.5 animate-pulse">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                      <span>Koniec: {format(new Date(new Date(ord.scheduledStartTime).getTime() + (ord.durationMin || 30) * 60000), 'HH:mm')} (cel: {format(new Date(ord.targetReadyTime), 'HH:mm')})</span>
                    </div>
                  )}

                  <p className="font-bold text-sm text-slate-100 mb-1">
                    {ord.carModel || 'Pojazd salonowy'}
                  </p>
                  <p className="text-xs text-amber-300 font-medium mb-2">
                    {ord.category?.name} ({ord.durationMin} min)
                  </p>

                  {ord.notes && (
                    <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-sky-950/60 border border-sky-500/30 text-[11px] text-sky-200 flex items-start gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-sky-400 flex-shrink-0 mt-0.5" />
                      <span className="leading-snug">{ord.notes}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-amber-500/20">
                    <span>Myje: <strong className="text-white">{ord.assignedEmployee?.name || 'Pracownik'}</strong></span>
                    <span className="font-mono text-amber-300 font-bold">
                      Cel: {format(new Date(ord.targetReadyTime), 'HH:mm')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Column 3: ZAPLANOWANE / KOLEJKA (Planned) */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-2xl flex flex-col">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold">
                <Clock className="w-4 h-4" />
              </div>
              <h2 className="text-base font-black text-sky-400 uppercase tracking-wider">
                Kolejka / Zaplanowane
              </h2>
            </div>
            <span className="font-mono font-black text-base px-2.5 py-1 rounded-xl bg-slate-800 text-slate-300 border border-slate-700">
              {plannedOrders.length}
            </span>
          </div>

          {plannedOrders.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              Brak dalszych aut w kolejce na ten dzień.
            </div>
          ) : (
            <div className="space-y-3">
              {plannedOrders.map((ord) => (
                <div
                  key={ord.id}
                  className={`border rounded-2xl p-4 transition-colors ${
                    ord.isPriority
                      ? 'bg-gradient-to-br from-red-950/40 via-amber-950/30 to-slate-950 border-amber-500/80 ring-1 ring-amber-500/40'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono font-black text-base text-white tracking-wider bg-slate-900 px-2.5 py-0.5 rounded-lg border border-slate-800 flex items-center gap-1.5">
                      {ord.isPriority && <span className="text-amber-400">⚡</span>}
                      {ord.licensePlate}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {ord.isPriority && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 uppercase flex items-center gap-0.5 shadow">
                          <Zap className="w-2.5 h-2.5 fill-current" /> Ekspres
                        </span>
                      )}
                      {ord.enteredByWash && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-violet-500 text-white uppercase" title="Wprowadzone ręcznie przez myjnię (bez planowania działu)">
                          Wpis myjni
                        </span>
                      )}
                      <span
                        className="text-[10px] font-black px-2 py-0.5 rounded text-white"
                        style={{ backgroundColor: ord.department?.color }}
                      >
                        {ord.department?.code}
                      </span>
                    </div>
                  </div>

                  {/* Priority audit info */}
                  {ord.isPriority && (
                    <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-amber-950/60 border border-amber-500/40 text-[11px] text-amber-200">
                      <span className="text-amber-400 font-semibold">Zatwierdził: </span>
                      <strong className="text-white">{ord.priorityAuthorizer || 'Brak'}</strong>
                      {ord.priorityReason && (
                        <div className="text-[10px] text-amber-200/80 italic mt-0.5">
                          Powód: {ord.priorityReason}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Delay Warning Notification on TV Dashboard */}
                  {ord.scheduledStartTime && 
                    (new Date(ord.scheduledStartTime).getTime() + (ord.durationMin || 30) * 60000) > new Date(ord.targetReadyTime).getTime() && (
                    <div className="mb-2 px-2.5 py-1 rounded-lg bg-rose-500/25 border border-rose-500/60 text-rose-300 text-[10px] font-bold flex items-center gap-1.5 animate-pulse">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                      <span>Koniec: {format(new Date(new Date(ord.scheduledStartTime).getTime() + (ord.durationMin || 30) * 60000), 'HH:mm')} (cel: {format(new Date(ord.targetReadyTime), 'HH:mm')})</span>
                    </div>
                  )}

                  <p className="font-bold text-xs text-slate-200 mb-1">
                    {ord.carModel || 'Pojazd salonowy'}
                  </p>
                  <p className="text-[11px] text-slate-400 mb-2">
                    {ord.category?.name} ({ord.durationMin || 30} min)
                  </p>

                  {ord.notes && (
                    <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-sky-950/60 border border-sky-500/30 text-[11px] text-sky-200 flex items-start gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-sky-400 flex-shrink-0 mt-0.5" />
                      <span className="leading-snug">{ord.notes}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-900">
                    <span>Zgłosił: {ord.contactPerson || ord.department?.name}</span>
                    <span className="font-mono text-amber-400 font-bold">
                      Na: {format(new Date(ord.targetReadyTime), 'HH:mm')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Completed history summary row at bottom */}
      {completedOrders.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>Zrealizowane i wydane dziś: <strong className="text-white">{completedOrders.length} aut</strong></span>
          </div>
          <span className="text-[11px] text-slate-500">
            Ostatnie wydanie: {format(new Date(completedOrders[completedOrders.length - 1].updatedAt), 'HH:mm')}
          </span>
        </div>
      )}

    </div>
  );
}
