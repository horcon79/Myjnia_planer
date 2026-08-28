'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Clock, CheckCircle2, AlertCircle, AlertTriangle, Sparkles, Calendar, Info, ChevronDown, ChevronUp, SunMedium } from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

export interface TimeSlotAvailabilityGridProps {
  orders: any[];
  targetReadyDate: string; // 'yyyy-MM-dd'
  selectedHour: string; // 'HH:mm'
  onSelectHour: (hourStr: string) => void;
  serviceDurationMin: number;
  workStartHour?: number; // e.g. 7
  workEndHour?: number; // e.g. 18
  maxSimultaneousCars?: number; // e.g. 3
  deliveryCarWeight?: number; // e.g. 1.5
  onSwitchToTomorrow?: () => void;
  onSlotStatusChange?: (status: {
    isOverbooked: boolean;
    availableSlots: number;
    usedCapacity: number;
    totalCapacity: number;
    suggestedAlternativeHour: string | null;
  }) => void;
}

interface SlotInfo {
  timeStr: string; // '08:00'
  hour: number;
  minute: number;
  availableSlots: number; // e.g. 3, 2, 1, 0
  usedCapacity: number;
  totalCapacity: number;
  isPastOrTooEarly: boolean;
  isClosed: boolean;
  isSelected: boolean;
  activeOrdersCount: number;
}

export default function TimeSlotAvailabilityGrid({
  orders,
  targetReadyDate,
  selectedHour,
  onSelectHour,
  serviceDurationMin = 30,
  workStartHour = 7,
  workEndHour = 18,
  maxSimultaneousCars = 3,
  deliveryCarWeight = 1.5,
  onSwitchToTomorrow,
  onSlotStatusChange,
}: TimeSlotAvailabilityGridProps) {
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const isToday = targetReadyDate === todayStr;

  // Samoczynne odświeżanie bieżącego czasu co 15 sekund (live updates)
  const [now, setNow] = useState<Date>(new Date());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 15000); // co 15s odświeżamy bieżącą minutę
    return () => clearInterval(timer);
  }, []);

  // Stan zwinięcia/rozwinięcia nieaktywnych (przeszłych) godzin – domyślnie ZWINIĘTE (false)
  const [showPastSlots, setShowPastSlots] = useState(false);

  // Najwcześniejszy wykonalny czas gotowości:
  // 1. Względem otwarcia myjni: workStartHour:00 + serviceDurationMin (np. 07:00 + 30 min = 07:30)
  // 2. Względem dzisiejszej bieżącej godziny (dla isToday): now + serviceDurationMin + 15 min bufor
  const minFeasibleDate = useMemo(() => {
    const openingDate = new Date(`${targetReadyDate}T${workStartHour.toString().padStart(2, '0')}:00:00`);
    const minFromOpening = new Date(openingDate.getTime() + serviceDurationMin * 60000);

    if (isToday) {
      const minFromNow = new Date(now.getTime() + (serviceDurationMin + 15) * 60000);
      return new Date(Math.max(minFromOpening.getTime(), minFromNow.getTime()));
    }

    return minFromOpening;
  }, [targetReadyDate, workStartHour, serviceDurationMin, isToday, now]);

  // Generowanie wszystkich slotów w godzinach pracy
  const allSlots: SlotInfo[] = useMemo(() => {
    const result: SlotInfo[] = [];

    for (let h = workStartHour; h <= workEndHour; h++) {
      for (const m of [0, 30]) {
        if (h === workEndHour && m > 0) continue;

        const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        const slotReadyDate = new Date(`${targetReadyDate}T${timeStr}:00`);

        // Slot jest niedostępny, jeśli gotowość wymagałaby startu mycia przed otwarciem myjni (lub przed obecną chwilą dzisiaj)
        const isPastOrTooEarly = slotReadyDate < minFeasibleDate;
        const isClosed = h >= workEndHour && m > 0;

        // Obliczenie zajętości w tym oknie czasowym gotowości
        // Dla gotowości o timeStr (np. 08:30) praca odbywa się w oknie [slotStartMs, slotReadyMs] (np. 08:00 - 08:30)
        let usedCapacity = 0;
        let activeOrdersCount = 0;

        const slotReadyMs = slotReadyDate.getTime();
        const slotStartMs = slotReadyMs - serviceDurationMin * 60000;

        orders.forEach((o) => {
          if (o.status === 'COMPLETED' || o.status === 'CANCELLED') return;

          const weight = o.carType === 'DELIVERY' ? deliveryCarWeight : 1.0;
          const orderDuration = (o.durationMin || 30) * 60000;

          let startMs: number | null = null;
          let endMs: number | null = null;

          if (o.scheduledStartTime) {
            startMs = new Date(o.scheduledStartTime).getTime();
            endMs = o.scheduledEndTime
              ? new Date(o.scheduledEndTime).getTime()
              : startMs + orderDuration;
          } else if (o.targetReadyTime) {
            endMs = new Date(o.targetReadyTime).getTime();
            startMs = endMs - orderDuration;
          }

          if (startMs !== null && endMs !== null) {
            // Sprawdzenie nachodzenia przedziałów [slotStartMs, slotReadyMs] oraz [startMs, endMs]
            if (startMs < slotReadyMs && endMs > slotStartMs) {
              usedCapacity += weight;
              activeOrdersCount++;
            }
          }
        });

        const availableSlots = Math.max(0, Math.round((maxSimultaneousCars - usedCapacity) * 10) / 10);
        const isSelected = selectedHour === timeStr;

        result.push({
          timeStr,
          hour: h,
          minute: m,
          availableSlots,
          usedCapacity,
          totalCapacity: maxSimultaneousCars,
          isPastOrTooEarly,
          isClosed,
          isSelected,
          activeOrdersCount,
        });
      }
    }

    return result;
  }, [
    workStartHour,
    workEndHour,
    targetReadyDate,
    isToday,
    minFeasibleDate,
    serviceDurationMin,
    orders,
    deliveryCarWeight,
    maxSimultaneousCars,
    selectedHour,
  ]);

  // Podział na sloty przeszłe i przyszłe
  const pastSlots = useMemo(() => allSlots.filter((s) => s.isPastOrTooEarly), [allSlots]);
  const futureSlots = useMemo(() => allSlots.filter((s) => !s.isPastOrTooEarly), [allSlots]);

  // Powiadomienie formularza nadrzędnego o statusie wybranego slotu
  useEffect(() => {
    if (!onSlotStatusChange) return;
    const current = allSlots.find((s) => s.timeStr === selectedHour);
    if (current) {
      const isOverbooked = !current.isPastOrTooEarly && current.availableSlots <= 0;
      const nextFree = futureSlots.find(
        (s) => !s.isClosed && s.availableSlots > 0 && s.timeStr > selectedHour
      );
      const anyFree = futureSlots.find((s) => !s.isClosed && s.availableSlots > 0);
      onSlotStatusChange({
        isOverbooked,
        availableSlots: current.availableSlots,
        usedCapacity: current.usedCapacity,
        totalCapacity: current.totalCapacity,
        suggestedAlternativeHour: nextFree ? nextFree.timeStr : anyFree ? anyFree.timeStr : null,
      });
    }
  }, [allSlots, selectedHour, onSlotStatusChange, futureSlots]);

  // Sloty do wyświetlenia (jeśli showPastSlots jest false, pokazujemy TYLKO przyszłe)
  const visibleSlots = showPastSlots ? allSlots : futureSlots;

  // Statystyka dostępnych slotów
  const availableSlotsCount = futureSlots.filter((s) => !s.isClosed && s.availableSlots > 0).length;

  return (
    <div className="rounded-2xl bg-slate-950/90 border border-slate-800 p-3.5 space-y-3 shadow-inner">
      {/* Nagłówek i podsumowanie */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-sky-400" />
          <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
            Wolne sloty gotowości ({format(new Date(targetReadyDate), 'd MMMM', { locale: pl })})
          </span>
        </div>

        <div className="flex items-center gap-2 text-[11px]">
          {isToday && (
            <span className="px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-300 font-semibold border border-sky-500/20 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-sky-400" />
              Tylko do przodu ({format(now, 'HH:mm')})
            </span>
          )}
          <span className="text-slate-400 font-medium">
            Dostępne okna: <strong className="text-emerald-400 font-bold">{availableSlotsCount}</strong>
          </span>
        </div>
      </div>

      {/* Komunikat o braku okien na dziś (np. pod koniec dnia) */}
      {isToday && futureSlots.length === 0 && (
        <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-200 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>Wszystkie okna robocze na dziś już upłynęły (zamknięcie myjni).</span>
          </div>
          {onSwitchToTomorrow && (
            <button
              type="button"
              onClick={onSwitchToTomorrow}
              className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1 transition-colors"
            >
              <SunMedium className="w-3.5 h-3.5" />
              <span>Przełącz na jutro</span>
            </button>
          )}
        </div>
      )}

      {/* Siatka widocznych slotów */}
      {visibleSlots.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1.5 pt-0.5">
          {visibleSlots.map((slot) => {
            const isDisabled = slot.isPastOrTooEarly || slot.isClosed;
            const isFullyBooked = !isDisabled && slot.availableSlots <= 0;

            let cardBg = 'bg-slate-900/90 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-850';
            let badgeText = `${slot.availableSlots}/${slot.totalCapacity} wolne`;
            let badgeColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';

            if (isDisabled) {
              cardBg = 'bg-slate-950/40 border-slate-900 text-slate-600 opacity-40 cursor-not-allowed';
              badgeText = slot.isClosed ? 'Zamknięte' : isToday ? 'Minęło' : 'Przed otwarciem';
              badgeColor = 'text-slate-500 bg-slate-800/40 border-slate-800';
            } else if (isFullyBooked) {
              cardBg = 'bg-rose-950/20 border-rose-900/40 text-rose-300 hover:border-rose-700/60';
              badgeText = 'Pełne (0)';
              badgeColor = 'text-rose-400 bg-rose-500/15 border-rose-500/30';
            } else if (slot.availableSlots <= 1) {
              cardBg = 'bg-amber-950/20 border-amber-900/40 text-amber-200 hover:border-amber-700/60';
              badgeText = `${slot.availableSlots}/${slot.totalCapacity} wolne`;
              badgeColor = 'text-amber-400 bg-amber-500/15 border-amber-500/30';
            }

            if (slot.isSelected) {
              cardBg = 'bg-sky-500/20 border-sky-400 ring-2 ring-sky-400/40 text-white font-bold shadow-md shadow-sky-500/10';
            }

            return (
              <button
                key={slot.timeStr}
                type="button"
                disabled={isDisabled}
                onClick={() => onSelectHour(slot.timeStr)}
                className={`p-2 rounded-xl border transition-all text-left flex flex-col justify-between gap-1 relative group ${cardBg}`}
                title={
                  isDisabled
                    ? slot.isClosed
                      ? 'Myjnia zamknięta'
                      : 'Godzina przeszła lub za krótki czas na realizację dzisiaj'
                    : `Kliknij, aby wybrać termin gotowości: ${slot.timeStr}`
                }
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-mono font-extrabold ${slot.isSelected ? 'text-sky-300' : ''}`}>
                    {slot.timeStr}
                  </span>
                  {slot.isSelected && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-sky-400" />
                  )}
                </div>

                <span
                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border inline-block text-center leading-tight truncate ${badgeColor}`}
                >
                  {badgeText}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Przełącznik zwijania przeszłych godzin (dla dzisiejszego dnia) */}
      {isToday && pastSlots.length > 0 && (
        <div className="pt-1 flex items-center justify-between text-[11px] border-t border-slate-800/60 mt-2">
          <button
            type="button"
            onClick={() => setShowPastSlots((prev) => !prev)}
            className="text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1 font-medium"
          >
            {showPastSlots ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Zwiń minione godziny ({pastSlots.length})</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Pokaż wcześniejsze godziny z dziś ({pastSlots.length})</span>
              </>
            )}
          </button>

          <span className="text-[10px] text-slate-500">
            Aktualizacja na żywo co 15s
          </span>
        </div>
      )}
    </div>
  );
}
