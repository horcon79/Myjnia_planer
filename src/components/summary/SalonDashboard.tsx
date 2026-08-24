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
  AlertTriangle
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
                  className="bg-gradient-to-br from-emerald-950/70 to-slate-950 border-2 border-emerald-500 rounded-2xl p-4 shadow-xl pulse-ready relative"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono font-black text-xl text-white tracking-wider bg-black/60 px-3 py-1 rounded-xl border border-emerald-500/30">
                      {ord.licensePlate}
                    </span>
                    <span
                      className="text-[10px] font-black px-2 py-0.5 rounded text-white"
                      style={{ backgroundColor: ord.department?.color }}
                    >
                      {ord.department?.code}
                    </span>
                  </div>

                  <p className="font-bold text-sm text-slate-100 mb-1">
                    {ord.carModel || 'Pojazd salonowy'}
                  </p>
                  <p className="text-xs text-emerald-300 font-medium mb-2">
                    {ord.category?.name}
                  </p>

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
                  className="bg-gradient-to-br from-amber-950/60 to-slate-950 border border-amber-500/60 rounded-2xl p-4 shadow-xl pulse-in-progress"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono font-black text-lg text-white tracking-wider bg-black/60 px-2.5 py-1 rounded-xl border border-amber-500/30">
                      {ord.licensePlate}
                    </span>
                    <span
                      className="text-[10px] font-black px-2 py-0.5 rounded text-white"
                      style={{ backgroundColor: ord.department?.color }}
                    >
                      {ord.department?.name}
                    </span>
                  </div>

                  {/* Delay Warning Notification on TV Dashboard */}
                  {ord.scheduledStartTime && 
                    (new Date(ord.scheduledStartTime).getTime() + (ord.durationMin || 30) * 60000) > new Date(ord.targetReadyTime).getTime() && (
                    <div className="mb-2 px-2 py-1 rounded-lg bg-rose-500/25 border border-rose-500/60 text-rose-300 text-[10px] font-black uppercase flex items-center gap-1.5 animate-pulse">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                      <span>Uwaga: Mycie po terminie wydania!</span>
                    </div>
                  )}

                  <p className="font-bold text-sm text-slate-100 mb-1">
                    {ord.carModel || 'Pojazd salonowy'}
                  </p>
                  <p className="text-xs text-amber-300 font-medium mb-2">
                    {ord.category?.name} ({ord.durationMin} min)
                  </p>

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
                  className="bg-slate-950 border border-slate-800 rounded-2xl p-4 hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono font-black text-base text-white tracking-wider bg-slate-900 px-2.5 py-0.5 rounded-lg border border-slate-800">
                      {ord.licensePlate}
                    </span>
                    <span
                      className="text-[10px] font-black px-2 py-0.5 rounded text-white"
                      style={{ backgroundColor: ord.department?.color }}
                    >
                      {ord.department?.code}
                    </span>
                  </div>

                  {/* Delay Warning Notification on TV Dashboard */}
                  {ord.scheduledStartTime && 
                    (new Date(ord.scheduledStartTime).getTime() + (ord.durationMin || 30) * 60000) > new Date(ord.targetReadyTime).getTime() && (
                    <div className="mb-2 px-2 py-1 rounded-lg bg-rose-500/25 border border-rose-500/60 text-rose-300 text-[10px] font-black uppercase flex items-center gap-1.5 animate-pulse">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                      <span>Uwaga: Mycie po terminie wydania!</span>
                    </div>
                  )}

                  <p className="font-bold text-xs text-slate-200 mb-1">
                    {ord.carModel || 'Pojazd salonowy'}
                  </p>
                  <p className="text-[11px] text-slate-400 mb-2">
                    {ord.category?.name}
                  </p>

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
