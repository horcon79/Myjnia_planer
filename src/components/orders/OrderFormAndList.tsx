'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { SessionUser } from '@/actions/auth';
import { createOrder, getOrdersForDate } from '@/actions/orders';
import { searchDmsVehicles, getDmsStatus, refreshDmsCache } from '@/actions/dms';
import type { DmsSearchResult, DmsServiceStatus } from '@/lib/dms-types';
import {
  Car,
  Truck,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Calendar,
  User,
  Phone,
  FileText,
  Check,
  RefreshCw,
  Search,
  Filter,
  Lock,
  Eye,
  EyeOff,
  AlertTriangle,
  Lightbulb,
  ArrowRight,
  SunMedium,
  Moon,
  Database,
  X
} from 'lucide-react';
import { format, addDays, isAfter, isBefore } from 'date-fns';
import { pl } from 'date-fns/locale';
import TimeSlotAvailabilityGrid from './TimeSlotAvailabilityGrid';

interface OrderFormAndListProps {
  currentUser: SessionUser | null;
  departments: any[];
  categories: any[];
  employees: any[];
  settings?: Record<string, string>;
}

export default function OrderFormAndList({
  currentUser,
  departments,
  categories,
  employees,
  settings = {},
}: OrderFormAndListProps) {
  // Opening & closing hours from settings (e.g. 7 to 18)
  const workStartHour = parseInt(settings.WORK_START_HOUR || '7', 10);
  const workEndHour = parseInt(settings.WORK_END_HOUR || '18', 10);
  const maxSimultaneousCars = parseInt(settings.MAX_SIMULTANEOUS_CARS || '3', 10);
  const deliveryCarWeight = parseFloat(settings.DELIVERY_CAR_WEIGHT || '1.5');

  // Check if department should be locked to the logged-in department
  const userDeptObj = departments.find(d => d.slug === currentUser?.slug);
  const isDeptLocked = Boolean(currentUser && currentUser.role === 'DEPARTMENT' && userDeptObj);

  const defaultDeptId = userDeptObj?.id || departments[0]?.id || '';

  // Date helpers
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const tomorrowStr = format(addDays(new Date(), 1), 'yyyy-MM-dd');
  const dayAfterTomorrowStr = format(addDays(new Date(), 2), 'yyyy-MM-dd');

  // Check if end of day (e.g. within 1 hour of closing or past closing) to recommend tomorrow by default
  const now = new Date();
  const isEndOfDay = now.getHours() >= workEndHour - 1;

  // Form State
  const [selectedDeptId, setSelectedDeptId] = useState(defaultDeptId);
  const [licensePlate, setLicensePlate] = useState('');
  const [carModel, setCarModel] = useState('');
  const [carType, setCarType] = useState<'PASSENGER' | 'DELIVERY'>('PASSENGER');
  const [selectedCatId, setSelectedCatId] = useState(
    userDeptObj?.defaultCategoryId && categories.some((c) => c.id === userDeptObj.defaultCategoryId)
      ? userDeptObj.defaultCategoryId
      : (categories[0]?.id || '')
  );

  // Target ready date & hour (defaults to tomorrow morning if near/after closing)
  const [targetReadyDate, setTargetReadyDate] = useState(isEndOfDay ? tomorrowStr : todayStr);
  const [targetHour, setTargetHour] = useState(
    isEndOfDay
      ? `${(workStartHour + 1).toString().padStart(2, '0')}:00`
      : `${Math.min(workEndHour - 1, Math.max(workStartHour + 2, 14))}:00`
  );

  const [contactPerson, setContactPerson] = useState(currentUser?.name || '');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formSuccessMsg, setFormSuccessMsg] = useState('');
  const [formErrorMsg, setFormErrorMsg] = useState('');

  // DMS integration state
  const [dmsQuery, setDmsQuery] = useState('');
  const [dmsResults, setDmsResults] = useState<DmsSearchResult[]>([]);
  const [dmsShowDropdown, setDmsShowDropdown] = useState(false);
  const [dmsSearching, setDmsSearching] = useState(false);
  const [dmsStatus, setDmsStatus] = useState<DmsServiceStatus | null>(null);
  const [dmsSelected, setDmsSelected] = useState<{
    dmsOrderId: number | null;
    dmsOrderNumber: string | null;
    dmsVin: string | null;
  } | null>(null);

  // List & Polling State
  const [orders, setOrders] = useState<any[]>([]);
  const [targetDateOrders, setTargetDateOrders] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(targetReadyDate);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [filterDept, setFilterDept] = useState<string>(isDeptLocked ? defaultDeptId : 'ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCompleted, setShowCompleted] = useState(false); // Hide completed by default!

  const currentCat = categories.find(c => c.id === selectedCatId) || categories[0];
  const currentDeptObj = departments.find(d => d.id === selectedDeptId);
  const dmsServiceCode = currentDeptObj?.dmsServiceCode?.trim() || null;
  const dmsEnabled = Boolean(currentDeptObj?.dmsEnabled && dmsServiceCode);

  // Calculate earliest feasible ready time for selected date based on wash opening hour and service duration
  const earliestFeasibleHourForSelectedDate = useMemo(() => {
    const serviceDuration = currentCat?.defaultDurationMin || 30;
    const openingReadyMinutes = workStartHour * 60 + serviceDuration;
    const openingHour = Math.floor(openingReadyMinutes / 60).toString().padStart(2, '0');
    const openingMin = (openingReadyMinutes % 60).toString().padStart(2, '0');
    const openingReadyStr = `${openingHour}:${openingMin}`;

    if (targetReadyDate === todayStr) {
      const minTime = new Date(now.getTime() + (serviceDuration + 15) * 60000);
      const mins = Math.ceil(minTime.getMinutes() / 15) * 15;
      minTime.setMinutes(mins);
      const todayStrTime = format(minTime, 'HH:mm');
      return todayStrTime > openingReadyStr ? todayStrTime : openingReadyStr;
    }

    return openingReadyStr;
  }, [currentCat, targetReadyDate, todayStr, now, workStartHour]);

  const earliestFeasibleHourToday = earliestFeasibleHourForSelectedDate;

  // Quick chips for ready time (always forward-looking and capped at workEndHour)
  const handleQuickTime = (minutesFromNow: number) => {
    const serviceDuration = currentCat?.defaultDurationMin || 30;
    const totalMinutes = Math.max(minutesFromNow, serviceDuration + 15);
    const future = new Date(now.getTime() + totalMinutes * 60000);

    // If calculated time exceeds workEndHour, clamp or switch to tomorrow
    if (future.getHours() >= workEndHour) {
      setTargetReadyDate(tomorrowStr);
      setTargetHour(`${(workStartHour + 1).toString().padStart(2, '0')}:30`);
      return;
    }

    const hours = future.getHours().toString().padStart(2, '0');
    const mins = (Math.ceil(future.getMinutes() / 15) * 15 % 60).toString().padStart(2, '0');
    setTargetHour(`${hours}:${mins}`);
    setTargetReadyDate(todayStr);
  };

  const handleSetExactHour = (hStr: string) => {
    setTargetHour(hStr);
  };

  // Add suggested tag to notes
  const handleAddTag = (tag: string) => {
    if (!notes.includes(tag)) {
      setNotes(prev => (prev ? `${prev}, ${tag}` : tag));
    }
  };

  // Fetch orders
  const loadOrders = async () => {
    try {
      const res = await getOrdersForDate(selectedDate);
      if (res.success && res.orders) {
        setOrders(res.orders);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingList(false);
    }
  };

  useEffect(() => {
    loadOrders();
    const interval = setInterval(() => {
      loadOrders();
    }, 8000); // Polling co 8s
    return () => clearInterval(interval);
  }, [selectedDate]);

  // Synchronizacja zleceń dla targetReadyDate (potrzebna do siatki dostępności)
  useEffect(() => {
    if (targetReadyDate === selectedDate) {
      setTargetDateOrders(orders);
    } else {
      let cancelled = false;
      getOrdersForDate(targetReadyDate).then((res) => {
        if (!cancelled && res.success && res.orders) {
          setTargetDateOrders(res.orders);
        }
      });
      return () => {
        cancelled = true;
      };
    }
  }, [targetReadyDate, selectedDate, orders]);

  // DMS: ładuj status integracji przy zmianie działu
  useEffect(() => {
    if (!dmsEnabled) return;
    let cancelled = false;
    getDmsStatus(selectedDeptId).then((res) => {
      if (!cancelled) setDmsStatus(res.success ? res.status ?? null : null);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDeptId, dmsEnabled]);

  // DMS: wyszukiwanie z debounce (>=3 znaki)
  useEffect(() => {
    if (!dmsEnabled) return;
    const q = dmsQuery.trim();
    if (q.length < 3) return;
    const t = setTimeout(async () => {
      setDmsSearching(true);
      const res = await searchDmsVehicles(selectedDeptId, q);
      setDmsResults(res.success ? res.results ?? [] : []);
      setDmsShowDropdown(true);
      setDmsSearching(false);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dmsQuery, selectedDeptId, dmsEnabled]);

  const handleDmsRefresh = async () => {
    setDmsSearching(true);
    const res = await refreshDmsCache(selectedDeptId);
    setDmsStatus(res.success ? res.status ?? null : null);
    setDmsSearching(false);
  };

  const pickDms = (r: DmsSearchResult) => {
    setLicensePlate((r.licensePlate || '').toUpperCase());
    setCarModel([r.brand, r.model].filter(Boolean).join(' ').trim());
    setCarType('PASSENGER');
    setDmsSelected({
      dmsOrderId: r.dmsOrderId != null ? r.dmsOrderId : null,
      dmsOrderNumber: r.orderNumber || null,
      dmsVin: r.vin || null,
    });
    setDmsQuery('');
    setDmsShowDropdown(false);
  };

  // Workload calculations on the selected ready date
  const workloadStats = useMemo(() => {
    const activeOrdersOnDay = orders.filter(o => o.status !== 'COMPLETED');
    const totalMinutes = activeOrdersOnDay.reduce((acc, o) => acc + (o.durationMin || 30), 0);
    // Capacity with 3 bays: effective throughput
    const effectiveHours = (totalMinutes / 3 / 60).toFixed(1);

    const isTargetToday = targetReadyDate === todayStr;
    const remainingMinutesToday = Math.max(0, (workEndHour - now.getHours()) * 60 - now.getMinutes());

    const isOverloadedToday = isTargetToday && (
      (totalMinutes / 3) + (currentCat?.defaultDurationMin || 30) > remainingMinutesToday ||
      isEndOfDay ||
      activeOrdersOnDay.length >= 8
    );

    return {
      activeCount: activeOrdersOnDay.length,
      totalMinutes,
      effectiveHours,
      isOverloadedToday,
    };
  }, [orders, targetReadyDate, todayStr, currentCat, now, isEndOfDay, workEndHour]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licensePlate.trim()) {
      setFormErrorMsg('Podaj numer rejestracyjny pojazdu.');
      return;
    }

    // Validation 1: Hours must be within working hours and after opening + duration
    const [h, m] = targetHour.split(':').map(Number);
    const targetTotalMinutes = h * 60 + m;
    const workStartTotalMinutes = workStartHour * 60;
    const workEndTotalMinutes = workEndHour * 60;
    const serviceDuration = currentCat?.defaultDurationMin || 30;
    const earliestFeasibleFromOpeningMinutes = workStartTotalMinutes + serviceDuration;

    if (targetTotalMinutes < earliestFeasibleFromOpeningMinutes) {
      const eHour = Math.floor(earliestFeasibleFromOpeningMinutes / 60).toString().padStart(2, '0');
      const eMin = (earliestFeasibleFromOpeningMinutes % 60).toString().padStart(2, '0');
      setFormErrorMsg(
        `Myjnia otwiera się o ${workStartHour}:00. Wybrana usługa (${currentCat.name}) trwa ${serviceDuration} min, więc najwcześniejsza możliwa godzina gotowości to ${eHour}:${eMin}.`
      );
      return;
    }

    if (targetTotalMinutes > workEndTotalMinutes) {
      setFormErrorMsg(
        `Myjnia kończy pracę o godzinie ${workEndHour}:00. Nie można zaplanować odbioru po ${workEndHour}:00. Wybierz wcześniejszą godzinę lub zaplanuj na kolejny dzień.`
      );
      return;
    }

    // Validation 2: Prevent scheduling in the past or earlier than service duration allows on today
    const targetDate = new Date(targetReadyDate);
    targetDate.setHours(h, m, 0, 0);

    const currentTime = new Date();
    if (targetReadyDate === todayStr) {
      const minRequiredDate = new Date(currentTime.getTime() + serviceDuration * 60000);

      if (targetDate < minRequiredDate) {
        setFormErrorMsg(
          `Nie można zaplanować na przeszłą lub zbyt wczesną godzinę (${targetHour}). Wybrana usługa (${currentCat.name}) trwa ${serviceDuration} min. Najwcześniejszy możliwy odbiór to ${earliestFeasibleHourToday}.`
        );
        return;
      }
    }

    setIsSubmitting(true);
    setFormErrorMsg('');
    setFormSuccessMsg('');

    try {
      const res = await createOrder({
        licensePlate: licensePlate.toUpperCase(),
        carModel,
        carType,
        departmentId: isDeptLocked ? defaultDeptId : selectedDeptId,
        categoryId: selectedCatId,
        targetReadyTime: targetDate.toISOString(),
        notes,
        contactPerson,
        dmsOrderId: dmsSelected?.dmsOrderId ?? null,
        dmsOrderNumber: dmsSelected?.dmsOrderNumber ?? null,
        dmsVin: dmsSelected?.dmsVin ?? null,
      });

      if (res.success) {
        setFormSuccessMsg(`Zlecenie dla ${licensePlate.toUpperCase()} na dzień ${targetReadyDate} o ${targetHour} zostało pomyślnie dodane!`);
        setLicensePlate('');
        setCarModel('');
        setNotes('');
        setDmsSelected(null);

        // If order was created for another date, update viewed date to match
        if (selectedDate !== targetReadyDate) {
          setSelectedDate(targetReadyDate);
        } else {
          loadOrders();
        }

        setTimeout(() => setFormSuccessMsg(''), 5000);
      } else {
        setFormErrorMsg(res.error || 'Nie udało się dodać zlecenia.');
      }
    } catch {
      setFormErrorMsg('Wystąpił błąd podczas dodawania.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered orders: COMPLETED orders disappear by default unless showCompleted is checked
  const completedCount = orders.filter(o => o.status === 'COMPLETED').length;

  const filteredOrders = orders.filter(o => {
    // Hide completed / delivered cars by default
    if (o.status === 'COMPLETED' && !showCompleted) return false;

    if (filterDept !== 'ALL' && o.departmentId !== filterDept) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchPlate = o.licensePlate.toLowerCase().includes(q);
      const matchModel = o.carModel?.toLowerCase().includes(q);
      const matchContact = o.contactPerson?.toLowerCase().includes(q);
      const matchNum = o.orderNumber?.toLowerCase().includes(q);
      if (!matchPlate && !matchModel && !matchContact && !matchNum) return false;
    }
    return true;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'READY':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-black pulse-ready">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            GOTOWE DO ODBIORU!
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-black pulse-in-progress">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
            W TRAKCIE MYCIA
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 text-slate-400 text-xs font-semibold">
            <Check className="w-3.5 h-3.5" />
            WYDANE / ZREALIZOWANE
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30 text-xs font-bold">
            <Clock className="w-3.5 h-3.5 text-sky-400" />
            W KOLEJCE (ZAPLANOWANE)
          </span>
        );
    }
  };

  return (
    <div className="space-y-8">

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/80 p-5 rounded-2xl border border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-3">
            <Plus className="w-8 h-8 text-sky-400 bg-sky-500/10 p-1.5 rounded-xl" />
            Zgłaszanie Mycia Pojazdu
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Inteligentne planowanie z wyprzedzeniem i podgląd obłożenia myjni
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-slate-800 p-1 rounded-xl border border-slate-700">
            <button
              onClick={() => setSelectedDate(todayStr)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${selectedDate === todayStr ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
            >
              Dziś
            </button>
            <button
              onClick={() => setSelectedDate(tomorrowStr)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${selectedDate === tomorrowStr ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
            >
              Jutro
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-slate-950 text-white text-xs font-bold rounded-lg px-2.5 py-1.5 border border-slate-700 focus:outline-none focus:border-sky-500"
            />
          </div>

          <button
            onClick={loadOrders}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            title="Odśwież listę"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* Form Column */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-xl">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-sky-400" />
            Nowe Zlecenie Mycia
          </h2>

          {/* Smart Recommendation Banner for high load or end of day */}
          {workloadStats.isOverloadedToday && (
            <div className="mb-5 p-4 rounded-2xl bg-amber-950/70 border border-amber-500/50 shadow-lg text-amber-200 text-xs space-y-2">
              <div className="flex items-start gap-2.5">
                <Lightbulb className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-extrabold text-amber-300">
                    {isEndOfDay
                      ? 'Myjnia kończy dziś pracę (zamknięcie o 19:00).'
                      : `Duże obłożenie na dziś (${workloadStats.activeCount} aut w kolejce).`}
                  </p>
                  <p className="text-[11px] text-amber-200/90 mt-0.5">
                    Rekomendujemy zaplanowanie mycia na <strong>jutro</strong>, aby zagwarantować punktualną gotowość pojazdu.
                  </p>
                </div>
              </div>

              {targetReadyDate === todayStr && (
                <button
                  type="button"
                  onClick={() => {
                    setTargetReadyDate(tomorrowStr);
                    setTargetHour('09:00');
                  }}
                  className="w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-all shadow flex items-center justify-center gap-1.5"
                >
                  <SunMedium className="w-4 h-4" />
                  <span>Przełącz na jutro rano (09:00)</span>
                </button>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Department Selection (Locked if logged in as a specific department) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                  Dział Zgłaszający
                </label>
                {isDeptLocked && (
                  <span className="text-[10px] text-amber-400 flex items-center gap-1 font-semibold">
                    <Lock className="w-3 h-3" /> Zablokowano dla Twojego działu
                  </span>
                )}
              </div>

              {isDeptLocked ? (
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-3.5 h-3.5 rounded-full"
                      style={{ backgroundColor: userDeptObj?.color || '#3b82f6' }}
                    />
                    <div>
                      <span className="text-sm font-bold text-white">{userDeptObj?.name}</span>
                      <span className="text-[10px] text-slate-400 block">Zalogowany jako {currentUser?.name}</span>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300">
                    {userDeptObj?.code}
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {departments.map((d) => {
                    const isSelected = selectedDeptId === d.id;
                    return (
                      <button
                        type="button"
                        key={d.id}
                        onClick={() => {
                          setSelectedDeptId(d.id);
                          setDmsQuery('');
                          setDmsResults([]);
                          setDmsShowDropdown(false);
                          setDmsSelected(null);
                          const nextDept = departments.find((dd) => dd.id === d.id);
                          const nextCat =
                            nextDept?.defaultCategoryId && categories.some((c) => c.id === nextDept.defaultCategoryId)
                              ? nextDept.defaultCategoryId
                              : (categories[0]?.id || '');
                          setSelectedCatId(nextCat);
                        }}
                        className={`p-3 rounded-xl text-left border transition-all flex items-center gap-2 ${isSelected
                          ? 'bg-slate-800 border-sky-500 ring-2 ring-sky-500/20 text-white font-bold'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                          }`}
                      >
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: d.color }}
                        />
                        <span className="text-xs truncate">{d.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* License Plate & Car Model */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Nr Rejestracyjny lub VIN/KOMIS *
                </label>
                <input
                  type="text"
                  required
                  placeholder="np. ZK 123GS"
                  value={licensePlate}
                  onChange={(e) => {
                    setLicensePlate(e.target.value.toUpperCase());
                    if (dmsSelected) setDmsSelected(null);
                  }}
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-base font-bold tracking-wider placeholder:text-slate-600 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Model / Kolor
                </label>
                <input
                  type="text"
                  placeholder="np. Omoda 5 / Czarny"
                  value={carModel}
                  onChange={(e) => setCarModel(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm font-medium placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            {/* DMS Vehicle Picker */}
            {dmsEnabled && (
              <div className="rounded-2xl border border-violet-500/30 bg-slate-950/60 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-violet-300 flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5" />
                    Wybierz pojazd z DMS ({dmsServiceCode})
                  </label>
                  <div className="flex items-center gap-2">
                    {dmsStatus && dmsStatus.fileUpdatedAt && (
                      <span className={`text-[10px] font-semibold ${dmsStatus.stale ? 'text-amber-400' : 'text-slate-400'}`}>
                        {dmsStatus.stale ? '⚠ nieświeże' : '✓ dane z'}{' '}
                        {new Date(dmsStatus.fileUpdatedAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={handleDmsRefresh}
                      disabled={dmsSearching}
                      className="text-[10px] px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-violet-300 font-bold flex items-center gap-1 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${dmsSearching ? 'animate-spin' : ''}`} />
                      Odśwież
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    value={dmsQuery}
                    onChange={(e) => {
                      setDmsQuery(e.target.value);
                      setDmsShowDropdown(false);
                    }}
                    onFocus={() => {
                      if (dmsResults.length > 0) setDmsShowDropdown(true);
                    }}
                    placeholder="Wpisz ≥3 znaki rejestracji, nr zlecenia lub VIN…"
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm font-mono placeholder:text-slate-600 focus:outline-none focus:border-violet-500"
                  />

                  {dmsShowDropdown && dmsResults.length > 0 && (
                    <div className="absolute z-20 left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
                      {dmsResults.map((r) => (
                        <button
                          key={r.dmsOrderId}
                          type="button"
                          onClick={() => pickDms(r)}
                          className="w-full text-left px-3.5 py-2.5 border-b border-slate-800/70 hover:bg-slate-800/60 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono font-black text-sm text-white">
                              {r.licensePlate || <span className="text-slate-500">— brak rej. —</span>}
                              {!r.hasPlate && (
                                <span className="ml-1.5 text-[9px] font-bold text-violet-300 bg-violet-500/15 px-1 py-0.5 rounded uppercase">
                                  VIN
                                </span>
                              )}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">{r.orderNumber}</span>
                          </div>
                          <p className="text-xs text-slate-300 truncate">{r.brand} {r.model}</p>
                          <p className="text-[10px] text-slate-500 truncate flex items-center gap-1 font-mono">
                            {r.vin && <span>VIN: {r.vin}</span>}
                            {r.vin && r.openDate && <span>•</span>}
                            {r.openDate && <span>{r.openDate}</span>}
                            {r.alreadyReported && (
                              <span className="ml-1.5 text-emerald-400 font-bold font-sans">✓ już zgłoszone</span>
                            )}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}

                  {dmsShowDropdown && dmsResults.length === 0 && dmsQuery.trim().length >= 3 && !dmsSearching && (
                    <div className="absolute z-20 left-0 right-0 mt-1 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-xs text-slate-400">
                      Brak wyników dla: {dmsQuery.trim()}
                    </div>
                  )}
                </div>

                {dmsSelected && (
                  <div className="flex items-center justify-between gap-2 bg-violet-500/10 border border-violet-500/40 rounded-xl px-3 py-2">
                    <div className="text-[11px] text-violet-200">
                      <span className="font-bold">Wybrano z DMS:</span>{' '}
                      {dmsSelected.dmsOrderNumber || '—'}
                      {dmsSelected.dmsVin ? ` • VIN ${dmsSelected.dmsVin.slice(0, 8)}…` : ''}
                    </div>
                    <button
                      type="button"
                      onClick={() => setDmsSelected(null)}
                      className="text-violet-300 hover:text-white p-1"
                      title="Wyczyść referencję DMS"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Vehicle Type (Passenger / Delivery) */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Gabaryt Pojazdu
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setCarType('PASSENGER')}
                  className={`p-3.5 rounded-xl border flex items-center justify-center gap-2.5 transition-all ${carType === 'PASSENGER'
                    ? 'bg-sky-500/15 border-sky-500 text-sky-300 font-bold'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                >
                  <Car className="w-5 h-5" />
                  <span className="text-xs">Osobowy / SUV (1 stan.)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCarType('DELIVERY')}
                  className={`p-3.5 rounded-xl border flex items-center justify-center gap-2.5 transition-all ${carType === 'DELIVERY'
                    ? 'bg-amber-500/15 border-amber-500 text-amber-300 font-bold'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                >
                  <Truck className="w-5 h-5" />
                  <span className="text-xs">Dostawczy / Bus (1.5 stan.)</span>
                </button>
              </div>
            </div>

            {/* Wash Category Selector (Lista rozwijalna / Dropdown) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                  Rodzaj / Zakres Mycia *
                </label>
                {currentCat && (
                  <span className="text-xs font-mono font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-lg border border-sky-500/20">
                    ⏱ {currentCat.defaultDurationMin >= 60 ? `${(currentCat.defaultDurationMin / 60).toFixed(1)}h` : `${currentCat.defaultDurationMin} min`}
                  </span>
                )}
              </div>

              <div className="relative">
                <select
                  value={selectedCatId}
                  onChange={(e) => setSelectedCatId(e.target.value)}
                  className="w-full px-4 py-3.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold text-sm focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 cursor-pointer appearance-none"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id} className="bg-slate-900 text-white py-2">
                      {c.name} — {c.defaultDurationMin >= 60 ? `${(c.defaultDurationMin / 60).toFixed(1)}h` : `${c.defaultDurationMin} min`}
                    </option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                  ▼
                </div>
              </div>

              {currentCat?.description && (
                <p className="text-xs text-slate-400 mt-2 px-1">
                  ℹ️ {currentCat.description}
                </p>
              )}
            </div>

            {/* Target Ready Date & Time (Date Picker + Quick Chips: Dziś, Jutro, Pojutrze + Time validation) */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                Termin i Godzina Gotowości
              </label>

              {/* Date selection shortcuts */}
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1.5">
                  1. Wybierz Dzień Gotowości:
                </span>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTargetReadyDate(todayStr);
                      if (targetHour < earliestFeasibleHourToday) {
                        setTargetHour(earliestFeasibleHourToday);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${targetReadyDate === todayStr
                      ? 'bg-sky-500 text-white shadow'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                  >
                    Dziś
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTargetReadyDate(tomorrowStr);
                      setTargetHour('09:00');
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${targetReadyDate === tomorrowStr
                      ? 'bg-sky-500 text-white shadow'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                  >
                    Jutro
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTargetReadyDate(dayAfterTomorrowStr);
                      setTargetHour('09:00');
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${targetReadyDate === dayAfterTomorrowStr
                      ? 'bg-sky-500 text-white shadow'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                  >
                    Pojutrze
                  </button>

                  <input
                    type="date"
                    required
                    min={todayStr}
                    value={targetReadyDate}
                    onChange={(e) => setTargetReadyDate(e.target.value)}
                    className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-bold focus:border-sky-500"
                  />
                </div>
              </div>

              {/* Hour selection & forward-looking quick chips */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">
                    2. Godzina Gotowości:
                  </span>
                  {targetReadyDate === todayStr && (
                    <span className="text-[10px] text-sky-400 font-semibold">
                      Min. czas na dziś: {earliestFeasibleHourToday}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 mb-2">
                  <input
                    type="time"
                    required
                    value={targetHour}
                    onChange={(e) => setTargetHour(e.target.value)}
                    className="px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-base font-bold focus:outline-none focus:border-sky-500"
                  />
                  <span className="text-xs text-amber-300 font-semibold">
                    Auto ma być gotowe na {targetHour} ({format(new Date(targetReadyDate), 'd MMMM', { locale: pl })})
                  </span>
                </div>

                {/* Forward looking quick chips */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  <button
                    type="button"
                    onClick={() => handleQuickTime(45)}
                    className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                  >
                    +45 min
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickTime(90)}
                    className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                  >
                    +1.5h
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickTime(150)}
                    className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                  >
                    +2.5h
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetExactHour('14:00')}
                    className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                  >
                    Na 14:00
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetExactHour('16:00')}
                    className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                  >
                    Na 16:00
                  </button>
                </div>

                {/* Mini-Plan Dostępności Slotów */}
                <TimeSlotAvailabilityGrid
                  orders={targetDateOrders}
                  targetReadyDate={targetReadyDate}
                  selectedHour={targetHour}
                  onSelectHour={(newHour) => setTargetHour(newHour)}
                  serviceDurationMin={currentCat?.defaultDurationMin || 30}
                  workStartHour={workStartHour}
                  workEndHour={workEndHour}
                  maxSimultaneousCars={maxSimultaneousCars}
                  deliveryCarWeight={deliveryCarWeight}
                  onSwitchToTomorrow={() => {
                    setTargetReadyDate(tomorrowStr);
                    setTargetHour('09:00');
                  }}
                />
              </div>
            </div>

            {/* Notes & Suggestions */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Uwagi / Komentarze / Osoba Kontaktowa
              </label>
              <input
                type="text"
                placeholder="np. Wydanie z klientem o 15:30, zadzwonić do: Tomasz"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-sky-500 mb-2"
              />

              {/* Category suggested note tags */}
              {currentCat?.suggestedNotes && (
                <div className="flex flex-wrap gap-1.5">
                  {currentCat.suggestedNotes.split(',').map((tag: string, idx: number) => (
                    <button
                      type="button"
                      key={idx}
                      onClick={() => handleAddTag(tag.trim())}
                      className="text-[11px] px-2 py-0.5 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                    >
                      + {tag.trim()}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Contact Person */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Osoba Zgłaszająca
              </label>
              <input
                type="text"
                placeholder="Imię / Dział"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
              />
            </div>

            {/* Messages */}
            {formErrorMsg && (
              <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                <span>{formErrorMsg}</span>
              </div>
            )}

            {formSuccessMsg && (
              <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
                {formSuccessMsg}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-extrabold text-base shadow-xl shadow-sky-500/25 transition-all flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Plus className="w-5 h-5" />
                  <span>DODAJ SAMOCHÓD DO KOLEJKI</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Live Orders Column */}
        <div className="lg:col-span-7 space-y-4">

          {/* Filter Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="w-4 h-4 text-slate-400" />

              {!isDeptLocked ? (
                <select
                  value={filterDept}
                  onChange={(e) => setFilterDept(e.target.value)}
                  className="bg-slate-800 border border-slate-700 text-white text-xs font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-sky-500"
                >
                  <option value="ALL">Wszystkie działy</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              ) : (
                <span className="text-xs font-bold text-sky-400 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
                  {userDeptObj?.name}
                </span>
              )}

              {/* Toggle to show/hide completed orders */}
              {completedCount > 0 && (
                <button
                  onClick={() => setShowCompleted(!showCompleted)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${showCompleted
                    ? 'bg-slate-700 text-white'
                    : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
                    }`}
                  title="Wydane auta są domyślnie ukryte"
                >
                  {showCompleted ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showCompleted ? 'Ukryj wydane' : `Wydane (${completedCount})`}</span>
                </button>
              )}
            </div>

            <div className="relative w-full sm:w-60">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Szukaj rejestracji..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          {/* Orders Cards List */}
          {isLoadingList ? (
            <div className="p-12 text-center text-slate-500">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-sky-400" />
              <p>Ładowanie kolejki myjni...</p>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-12 text-center">
              <Car className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-white">Brak aktywnych zleceń na dzień {format(new Date(selectedDate), 'd MMMM', { locale: pl })}</h3>
              <p className="text-xs text-slate-400 mt-1">
                {completedCount > 0 && !showCompleted
                  ? `Wszystkie ${completedCount} aut na ten dzień zostały już wydane (zrealizowane).`
                  : 'Użyj formularza po lewej stronie, aby dodać pierwsze auto.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOrders.map((order) => {
                const isReady = order.status === 'READY';
                const isInProgress = order.status === 'IN_PROGRESS';

                return (
                  <div
                    key={order.id}
                    className={`rounded-2xl p-5 border transition-all relative overflow-hidden ${isReady
                      ? 'bg-gradient-to-r from-emerald-950/80 to-slate-900 border-emerald-500/60 shadow-lg shadow-emerald-500/10'
                      : isInProgress
                        ? 'bg-gradient-to-r from-amber-950/60 to-slate-900 border-amber-500/50 shadow-lg shadow-amber-500/10'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                      }`}
                  >
                    {/* Top Row: Plate + Badges */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-3">
                        <div className="px-3.5 py-1.5 rounded-xl bg-slate-950 border border-slate-700 font-mono font-black text-lg text-white tracking-widest shadow">
                          {order.licensePlate}
                        </div>
                        <div>
                          <p className="font-bold text-sm text-slate-200">
                            {order.carModel || 'Pojazd salonowy'}
                          </p>
                          <span
                            className="inline-block text-[10px] font-black px-2 py-0.5 rounded text-white mt-0.5"
                            style={{ backgroundColor: order.department?.color || '#3b82f6' }}
                          >
                            {order.department?.name}
                          </span>
                        </div>
                      </div>

                      <div>{getStatusBadge(order.status)}</div>
                    </div>

                    {/* Delay Warning Notification */}
                    {order.scheduledStartTime &&
                      (new Date(order.scheduledStartTime).getTime() + (order.durationMin || 30) * 60000) > new Date(order.targetReadyTime).getTime() &&
                      order.status !== 'COMPLETED' && (
                        <div className="mb-3 p-3.5 rounded-2xl bg-rose-950/80 border border-rose-500 text-rose-200 text-xs font-bold flex items-start gap-2.5 shadow-lg animate-pulse">
                          <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                          <div>
                            <span className="text-rose-300 block font-black uppercase">
                              ⚠️ Uwaga: Zakończenie mycia nastąpi po terminie wydania!
                            </span>
                            <span className="text-[11px] text-rose-200/90 font-normal block mt-1 leading-relaxed">
                              Usługa <strong>{order.category?.name || 'Mycie'}</strong> trwa <strong>{order.durationMin || 30} min</strong>.
                              Zaplanowany czas pracy myjni: <strong>{format(new Date(order.scheduledStartTime), 'HH:mm', { locale: pl })} – {format(new Date(new Date(order.scheduledStartTime).getTime() + (order.durationMin || 30) * 60000), 'HH:mm', { locale: pl })}</strong> ({format(new Date(order.scheduledStartTime), 'd MMM', { locale: pl })}).
                              Wnioskowana gotowość: <strong>{format(new Date(order.targetReadyTime), 'HH:mm (d MMM)', { locale: pl })}</strong>.
                            </span>
                          </div>
                        </div>
                      )}

                    {/* Middle Row: Category + Times */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 text-xs mb-3">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-semibold">Usługa:</span>
                        <span className="font-bold text-slate-200">{order.category?.name}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-semibold">Gotowe na:</span>
                        <span className="font-bold text-amber-300">
                          {format(new Date(order.targetReadyTime), 'HH:mm (d MMM)', { locale: pl })}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-semibold">Pracownik myjni:</span>
                        <span className="font-bold text-sky-400">
                          {order.assignedEmployee?.name || 'Do przydzielenia'}
                        </span>
                      </div>
                    </div>

                    {/* Bottom Row: Notes + Contact */}
                    {order.notes && (
                      <div className="text-xs text-slate-300 bg-slate-800/50 px-3 py-2 rounded-lg flex items-center gap-2 mb-2">
                        <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <span className="italic">{order.notes}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-800/60">
                      <span>Zgłosił: {order.contactPerson || order.department?.name}</span>
                      <span>Nr zlecenia: {order.orderNumber}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
