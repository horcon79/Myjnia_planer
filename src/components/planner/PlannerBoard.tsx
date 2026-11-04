'use client';

import React, { useState, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { SessionUser } from '@/actions/auth';
import { 
  getPlannerSnapshot,
  updateOrderStatus, 
  scheduleOrder, 
  setOrderEmployees,
  deleteOrder,
  createOrder,
  finishOrderWithNote,
  addOrderNote,
  cancelOrder
} from '@/actions/orders';
import { setShiftRoster } from '@/actions/shifts';
import { isActiveShiftEntry, getLatestArrivalTime, getOrderLatestArrivalTime } from '@/lib/planner';
import { 
  Calendar, 
  ChevronLeft, 
  ChevronRight,
  ChevronDown,
  Clock, 
  CheckCircle2, 
  Play, 
  Check, 
  Users, 
  AlertTriangle, 
  Plus, 
  RefreshCw, 
  Car, 
  Truck, 
  Edit3, 
  Trash2, 
  Sparkles,
  Layers,
  Target,
  X,
  AlertOctagon,
  CalendarClock,
  Move,
  FileText,
  UserPlus,
  Eye,
  Lock,
  Zap
} from 'lucide-react';
import { format, addDays, subDays } from 'date-fns';
import { pl } from 'date-fns/locale';
import ReleaseOrderDialog from './ReleaseOrderDialog';
import ChecklistMarkdown from '@/components/ChecklistMarkdown';

const compactQuery = '(max-width: 1535px)';
const subscribeCompact = (notify: () => void) => {
  const media = window.matchMedia(compactQuery);
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
};
const getCompactSnapshot = () => window.matchMedia(compactQuery).matches;
const getServerCompactSnapshot = () => false;

interface ShiftEntry {
  employeeId: string;
  startedAt: string;
  endedAt: string | null;
}

interface CancelTarget {
  id: string;
  licensePlate: string;
  status: string;
}

interface PlannerBoardProps {
  currentUser: SessionUser | null;
  departments: any[];
  categories: any[];
  employees: any[];
  settings: Record<string, string>;
  initialRoster?: ShiftEntry[];
}

export default function PlannerBoard({
  currentUser,
  departments,
  categories,
  employees,
  settings,
  initialRoster,
}: PlannerBoardProps) {
  // Uprawnienia: tylko MYJNIA oraz KIEROWNIK/ADMIN mogą dokonywać zmian w planerze
  const canEdit = currentUser?.role === 'WASHER' || currentUser?.role === 'ADMIN';

  const compact = useSyncExternalStore(subscribeCompact, getCompactSnapshot, getServerCompactSnapshot);
  const [controlsExpanded, setControlsExpanded] = useState(false);

  // Current selected date
  const [currentDate, setCurrentDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [visibleEmployeeId, setVisibleEmployeeId] = useState('all');
  const lastDragEnd = useRef(-Infinity);
  const [orders, setOrders] = useState<any[]>([]);
  const [pastUnfinishedOrders, setPastUnfinishedOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Wspólna obsada zmiany z bazy (widoczna dla myjni i wszystkich działów).
  const [roster, setRoster] = useState<ShiftEntry[]>(initialRoster || []);
  // Daily shift start modal
  const [showShiftStartModal, setShowShiftStartModal] = useState(false);
  const [shiftSelectionIds, setShiftSelectionIds] = useState<string[]>([]);

  // Confirmation modal for starting/ending a shift (prevents accidental taps)
  const [shiftConfirmEmp, setShiftConfirmEmp] = useState<{ id: string; action: 'start' | 'end' } | null>(null);
  const [rosterError, setRosterError] = useState('');
  // Tick for refreshing elapsed-time labels
  const [nowTick, setNowTick] = useState(0);
  const shiftPromptedRef = useRef(false);

  // Auta gotowe do wydania, których nie ma na widocznym grafiku (np. z poprzednich dni).
  const [pendingReleases, setPendingReleases] = useState<any[]>([]);

  // Anulowanie zlecenia (z powodem i audytem)
  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState('');
  const [cancelPending, setCancelPending] = useState(false);

  // Komunikaty błędów akcji (zamiast cichych niepowodzeń)
  const [actionError, setActionError] = useState<string | null>(null);
  const actionErrorTimer = useRef<any>(null);
  const [modalError, setModalError] = useState('');
  const [quickAddError, setQuickAddError] = useState('');

  // Modals and confirmation state
  const [editingOrder, setEditingOrder] = useState<any | null>(null);
  const [modalScheduleDate, setModalScheduleDate] = useState(currentDate);
  const [modalScheduleTime, setModalScheduleTime] = useState('08:00');
  const [modalDuration, setModalDuration] = useState(30);
  const [modalEmployeeIds, setModalEmployeeIds] = useState<string[]>([]);
  const [modalOverCapacity, setModalOverCapacity] = useState(false);
  const [employeeOrder, setEmployeeOrder] = useState<any | null>(null);
  const [employeeSelection, setEmployeeSelection] = useState<string[]>([]);
  const [employeeError, setEmployeeError] = useState('');
  const [employeePending, setEmployeePending] = useState(false);

  // Quick Add – null = zamknięte; obiekt = otwarte z prefillem godziny i pracownika
  const [quickAddPrefill, setQuickAddPrefill] = useState<{ time: string; employeeId: string } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [finishConfirmId, setFinishConfirmId] = useState<string | null>(null);
  const [finishNote, setFinishNote] = useState('');
  const [releaseOrderSnapshot, setReleaseOrderSnapshot] = useState<React.ComponentProps<typeof ReleaseOrderDialog>['order'] | null>(null);
  const [noteEditOrderId, setNoteEditOrderId] = useState<string | null>(null);
  const [noteEditText, setNoteEditText] = useState('');

  // Drag & Drop (long-press) rescheduling state
  const [dragOrderId, setDragOrderId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ time: string; employeeId: string } | null>(null);
  const [dropConfirm, setDropConfirm] = useState<any | null>(null);
  const longPressTimer = useRef<any>(null);
  const dragRef = useRef<{ order: any; pointerId: number; startX: number; startY: number; active: boolean; grabOffset: number; startMinutes: number; x: number; y: number } | null>(null);
  const dropTargetRef = useRef<{ time: string; employeeId: string } | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const axisStartRef = useRef(0);
  const dayRequestRef = useRef({ date: currentDate, generation: 0, request: 0, applied: 0 });
  if (dayRequestRef.current.date !== currentDate) {
    dayRequestRef.current = { date: currentDate, generation: dayRequestRef.current.generation + 1, request: 0, applied: 0 };
  }

  // Long-press on empty slot cell → open Quick Add with prefilled time/employee
  const cellLongPressTimer = useRef<any>(null);
  const cellPressRef = useRef<{ pointerId: number; time: string; employeeId: string; startX: number; startY: number } | null>(null);

  // Container ref for auto-scrolling
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const timelineGridRef = useRef<HTMLDivElement>(null);

  // Capacity Settings
  const maxCarsLimit = parseInt(settings.MAX_SIMULTANEOUS_CARS || '3', 10);
  const workStartHour = parseInt(settings.WORK_START_HOUR || '7', 10);
  const workEndHour = parseInt(settings.WORK_END_HOUR || '18', 10);

  const PIXELS_PER_MINUTE = 4;
  const LANE_HEIGHT = compact ? 230 : 260;

  // Shift length limits: standard 8h shift, obsada wygasa po 9h (SHIFT_MAX_MS w lib/planner)
  const STANDARD_SHIFT_MS = 8 * 60 * 60 * 1000;

  const clockNow = nowTick || Date.now();
  const todayKey = format(new Date(), 'yyyy-MM-dd');

  const eligibleRoster = useMemo(
    () => roster.filter(entry => employees.some(e => e.id === entry.employeeId)),
    [roster, employees]
  );

  // Obsada aktywna: zakończone wpisy odpadają, a 9-godzinne wygaśnięcie liczy się tylko dla dnia dzisiejszego.
  const activeEmpIds = useMemo(() => {
    const isCurrentDay = currentDate === todayKey;
    return eligibleRoster
      .filter(entry => (isCurrentDay ? isActiveShiftEntry(entry, clockNow) : !entry.endedAt))
      .map(entry => entry.employeeId);
  }, [eligibleRoster, clockNow, currentDate, todayKey]);

  const shiftStartTimes = useMemo(() => {
    const map: Record<string, number> = {};
    eligibleRoster.forEach(entry => {
      map[entry.employeeId] = new Date(entry.startedAt).getTime();
    });
    return map;
  }, [eligibleRoster]);

  const showActionError = (message: string) => {
    setActionError(message);
    if (actionErrorTimer.current) clearTimeout(actionErrorTimer.current);
    actionErrorTimer.current = setTimeout(() => setActionError(null), 6000);
  };

  const persistRoster = async (nextIds: string[]) => {
    setRosterError('');
    const res = await setShiftRoster(currentDate, nextIds);
    if (!res.success) {
      setRosterError(res.error || 'Nie udało się zapisać obsady zmiany.');
      return false;
    }
    setRoster(res.roster || []);
    return true;
  };

  // Sync modal state whenever editingOrder changes
  useEffect(() => {
    if (editingOrder) {
      setModalError('');
      const d = editingOrder.scheduledStartTime
        ? format(new Date(editingOrder.scheduledStartTime), 'yyyy-MM-dd')
        : currentDate;

      let t: string;
      if (editingOrder.scheduledStartTime) {
        t = format(new Date(editingOrder.scheduledStartTime), 'HH:mm');
      } else if (editingOrder.targetReadyTime) {
        const targetDate = new Date(editingOrder.targetReadyTime);
        const duration = editingOrder.durationMin || 30;
        const proposedStart = new Date(targetDate.getTime() - duration * 60000);
        const pHour = proposedStart.getHours();
        const pMin = proposedStart.getMinutes() < 30 ? '00' : '30';
        if (pHour >= workStartHour && pHour <= workEndHour) {
          t = `${pHour.toString().padStart(2, '0')}:${pMin}`;
        } else {
          t = `${workStartHour.toString().padStart(2, '0')}:00`;
        }
      } else {
        t = (d === format(new Date(), 'yyyy-MM-dd'))
          ? getRoundedCurrentTime(30)
          : `${workStartHour.toString().padStart(2, '0')}:00`;
      }

      setModalScheduleDate(d);
      setModalScheduleTime(t);
      setModalDuration(editingOrder.durationMin || 30);
      setModalEmployeeIds((editingOrder.assignedEmployees || []).map((assignment: any) => assignment.employeeId));
      setModalOverCapacity(editingOrder.isOverCapacity || false);
    }
  }, [editingOrder]);

  // Check if chosen modal schedule is past the target ready time
  const isModalScheduleLate = useMemo(() => {
    if (!editingOrder) return false;
    try {
      const [h, m] = modalScheduleTime.split(':').map(Number);
      const schedDate = new Date(modalScheduleDate);
      schedDate.setHours(h, m, 0, 0);
      const schedEnd = new Date(schedDate.getTime() + modalDuration * 60000);
      const targetReady = new Date(editingOrder.targetReadyTime);
      return schedEnd.getTime() > targetReady.getTime();
    } catch {
      return false;
    }
  }, [editingOrder, modalScheduleDate, modalScheduleTime, modalDuration]);

  // Najpóźniejszy przyjazd dla aktualnie ustawianego czasu i czasu trwania w modalu.
  const modalLatestArrival = useMemo(() => {
    if (!editingOrder) return null;
    return getLatestArrivalTime(editingOrder.targetReadyTime, modalDuration, 30);
  }, [editingOrder, modalDuration]);

  // Helper: rounded current time (e.g. 17:55 -> 18:00, 14:10 -> 14:00/14:30)
  const getRoundedCurrentTime = (intervalMinutes: number = 30) => {
    const now = new Date();
    const ms = 1000 * 60 * intervalMinutes;
    const rounded = new Date(Math.round(now.getTime() / ms) * ms);
    return format(rounded, 'HH:mm');
  };

  // Helper: current slot string (e.g. "18:00")
  const getCurrentSlotString = () => {
    const now = new Date();
    const h = now.getHours().toString().padStart(2, '0');
    const m = now.getMinutes() < 30 ? '00' : '30';
    return `${h}:${m}`;
  };

  // Polling data (zlecenia + obsada zmiany + auta do wydania w jednym zapytaniu)
  const fetchDayOrders = async () => {
    const requestState = dayRequestRef.current;
    if (requestState.date !== currentDate) return;
    const generation = requestState.generation;
    const request = ++requestState.request;
    const isCurrent = () => dayRequestRef.current.generation === generation && request >= dayRequestRef.current.applied;
    try {
      const res = await getPlannerSnapshot(currentDate);
      if (!isCurrent()) return;
      dayRequestRef.current.applied = request;
      if (res.success) {
        if (res.orders) setOrders(res.orders);
        if (res.pastUnfinishedOrders) setPastUnfinishedOrders(res.pastUnfinishedOrders);
        if (Array.isArray(res.roster)) setRoster(res.roster);
        if (Array.isArray(res.pendingReleases)) setPendingReleases(res.pendingReleases);

        // Pierwsze wejście w dniu bez rozpoczętej zmiany - zapytaj o obsadę (tylko myjnia/kierownik).
        if (canEdit && !shiftPromptedRef.current && currentDate === format(new Date(), 'yyyy-MM-dd')
            && Array.isArray(res.roster) && res.roster.length === 0) {
          shiftPromptedRef.current = true;
          setShiftSelectionIds([]);
          setShowShiftStartModal(true);
        }
      } else if (res.error) {
        console.warn('getPlannerSnapshot:', res.error);
      }
    } catch (e) {
      if (isCurrent()) console.error(e);
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  };

  useEffect(() => {
    setDragOrderId(null);
    setDragPos(null);
    setDropTarget(null);
    fetchDayOrders();
    const interval = setInterval(fetchDayOrders, 6000); // Polling co 6s na tablecie
    return () => {
      clearInterval(interval);
      dragCleanupRef.current?.();
      dayRequestRef.current.generation++;
    };
  }, [currentDate]);

  // Auto-scroll to current hour when date is today
  const isToday = currentDate === format(new Date(), 'yyyy-MM-dd');

  const scrollToCurrentTime = (smooth: boolean = true) => {
    if (!isToday) return;
    const scroller = timelineScrollRef.current;
    if (!scroller) return;
    const grid = timelineGridRef.current;
    if (!grid) return;
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const offset = grid.offsetLeft + (minutes - axisStart) * PIXELS_PER_MINUTE - 2 * 60 * PIXELS_PER_MINUTE;
    scroller.scrollTo({ left: Math.max(0, offset), behavior: smooth ? 'smooth' : 'auto' });
  };

  // Scroll to current hour on initial load
  useEffect(() => {
    if (!isLoading && isToday) {
      const timeout = setTimeout(() => {
        scrollToCurrentTime(false);
      }, 250);
      return () => clearTimeout(timeout);
    }
  }, [isLoading, currentDate]);

  // Po zmianie dnia pozwól ponownie zapytać o obsadę (raz na dzień).
  useEffect(() => {
    shiftPromptedRef.current = false;
  }, [currentDate]);

  // Refresh "elapsed time" labels every 60s
  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Click on employee chip → ask for confirmation (prevents accidental taps)
  const requestShiftChange = (empId: string, currentlyActive: boolean) => {
    setShiftConfirmEmp({ id: empId, action: currentlyActive ? 'end' : 'start' });
  };

  // Confirm start/end of shift (wspólny zapis w bazie)
  const confirmShiftChange = async () => {
    if (!shiftConfirmEmp) return;
    const { id, action } = shiftConfirmEmp;

    const nextIds = action === 'start'
      ? Array.from(new Set([...activeEmpIds, id]))
      : activeEmpIds.filter(eid => eid !== id);

    await persistRoster(nextIds);
    setShiftConfirmEmp(null);
  };

  // Multi-select shift modal handlers
  const openShiftStartModal = () => {
    setShiftSelectionIds([...activeEmpIds]);
    setShowShiftStartModal(true);
  };

  const toggleShiftSelection = (empId: string) => {
    setShiftSelectionIds(prev =>
      prev.includes(empId) ? prev.filter(id => id !== empId) : [...prev, empId]
    );
  };

  const selectAllShiftSelection = () => {
    setShiftSelectionIds(employees.map(e => e.id));
  };

  const clearShiftSelection = () => {
    setShiftSelectionIds([]);
  };

  const handleSaveShiftModal = async () => {
    const saved = await persistRoster(shiftSelectionIds);
    if (saved) setShowShiftStartModal(false);
  };

  // Helpers for shift display
  const formatElapsedTime = (startMs: number) => {
    const elapsedMs = Math.max(0, nowTick - startMs);
    const hours = Math.floor(elapsedMs / (60 * 60 * 1000));
    const minutes = Math.floor((elapsedMs % (60 * 60 * 1000)) / (60 * 1000));
    return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  };

  const isOverShift = (empId: string) => {
    const start = shiftStartTimes[empId];
    if (!start) return false;
    return nowTick - start >= STANDARD_SHIFT_MS;
  };

  // Status changes
  const handleStartOrder = async (orderId: string) => {
    const res = await updateOrderStatus(orderId, 'IN_PROGRESS');
    if (!res.success) showActionError(res.error || 'Nie udało się rozpocząć mycia.');
    fetchDayOrders();
  };

  const handleCompleteOrder = (orderId: string) => {
    if (!canEdit) return;
    const order = [...orders, ...pastUnfinishedOrders, ...pendingReleases].find(item => item.id === orderId);
    if (order) setReleaseOrderSnapshot(order);
  };

  const handleConfirmDelete = async () => {
    if (deleteConfirmId) {
      const res = await deleteOrder(deleteConfirmId);
      if (!res.success) showActionError(res.error || 'Nie udało się usunąć zlecenia.');
      setDeleteConfirmId(null);
      fetchDayOrders();
    }
  };

  const handleConfirmFinish = async () => {
    if (finishConfirmId) {
      const res = await finishOrderWithNote(finishConfirmId, finishNote);
      if (!res.success) {
        showActionError(res.error || 'Nie udało się zakończyć zlecenia.');
        return;
      }
      setFinishNote('');
      setFinishConfirmId(null);
      fetchDayOrders();
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelTarget || cancelPending) return;
    setCancelPending(true);
    setCancelError('');
    try {
      const res = await cancelOrder(cancelTarget.id, { reason: cancelReason });
      if (!res.success) {
        setCancelError(res.error || 'Nie udało się anulować zlecenia.');
        return;
      }
      setCancelTarget(null);
      setCancelReason('');
      setEditingOrder(null);
      fetchDayOrders();
    } catch {
      setCancelError('Błąd połączenia. Spróbuj ponownie.');
    } finally {
      setCancelPending(false);
    }
  };

  const openNoteModal = (ord: any) => {
    setNoteEditOrderId(ord.id);
    setNoteEditText(ord.notes || '');
  };

  const handleSaveNote = async () => {
    if (noteEditOrderId) {
      const res = await addOrderNote(noteEditOrderId, noteEditText);
      if (!res.success) showActionError(res.error || 'Nie udało się zapisać notatki.');
      setNoteEditOrderId(null);
      setNoteEditText('');
      fetchDayOrders();
    }
  };

  const orderForConfirm = useMemo(() => {
    if (!finishConfirmId) return null;
    return [...orders, ...pastUnfinishedOrders].find(o => o.id === finishConfirmId) || null;
  }, [finishConfirmId, orders, pastUnfinishedOrders]);

  // ---- Drag & Drop (long-press to pick up, drop on slot) ----
  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const endDrag = () => {
    window.removeEventListener('pointermove', handleDragMove);
    window.removeEventListener('pointerup', handleDragEnd);
    window.removeEventListener('pointercancel', handleDragEnd);
    if (dragFrameRef.current !== null) cancelAnimationFrame(dragFrameRef.current);
    dragFrameRef.current = null;
    dragCleanupRef.current = null;
    clearLongPress();
  };

  const handleCardPointerDown = (e: React.PointerEvent, ord: any, startMinutes: number) => {
    // Native touch scrolling takes priority; tapping a card opens scheduling.
    if (e.pointerType !== 'mouse' || e.button !== 0 || !canEdit || ord.status === 'COMPLETED') return;
    if ((e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);

    const grabOffset = e.clientX - e.currentTarget.getBoundingClientRect().left;
    dragRef.current = { order: ord, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, active: false, grabOffset, startMinutes, x: e.clientX, y: e.clientY };
    dragCleanupRef.current = () => {
      endDrag();
      dragRef.current = null;
      dropTargetRef.current = null;
    };
    clearLongPress();
    longPressTimer.current = setTimeout(() => {
      const ref = dragRef.current;
      if (!ref || ref.pointerId !== e.pointerId) return;
      ref.active = true;
      setDragOrderId(ord.id);
      setDragPos({ x: e.clientX, y: e.clientY });
      window.addEventListener('pointermove', handleDragMove);
      window.addEventListener('pointerup', handleDragEnd);
      window.addEventListener('pointercancel', handleDragEnd);
      dragFrameRef.current = requestAnimationFrame(autoScrollDrag);
    }, 450);
  };

  const handleCardPointerMove = (e: React.PointerEvent) => {
    const ref = dragRef.current;
    if (!ref || ref.pointerId !== e.pointerId) return;
    if (ref.active) return;

    // If user moves before long-press completes → treat as scroll, cancel drag
    const dx = e.clientX - ref.startX;
    const dy = e.clientY - ref.startY;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      dragCleanupRef.current?.();
    }
  };

  const handleCardPointerUp = (e: React.PointerEvent) => {
    const ref = dragRef.current;
    if (!ref || ref.pointerId !== e.pointerId) return;
    clearLongPress();
    if (!ref.active) {
      dragCleanupRef.current?.();
      setDragOrderId(null);
      setDragPos(null);
      setDropTarget(null);
    }
  };

  const updateDragTarget = (x: number, y: number) => {
    const grid = timelineGridRef.current;
    const scroller = timelineScrollRef.current;
    const drag = dragRef.current;
    if (grid && scroller && drag) {
      const rect = grid.getBoundingClientRect();
      const viewport = scroller.getBoundingClientRect();
      const underPointer = document.elementFromPoint(x, y);
      if (x >= Math.max(rect.left, viewport.left + scroller.clientLeft) && x < Math.min(rect.right, viewport.left + scroller.clientLeft + scroller.clientWidth)
          && y >= Math.max(rect.top, viewport.top + scroller.clientTop) && y < Math.min(rect.bottom, viewport.top + scroller.clientTop + scroller.clientHeight)
          && underPointer && grid.contains(underPointer)) {
        const rawMinutes = axisStartRef.current + (x - rect.left - drag.grabOffset) / PIXELS_PER_MINUTE;
        const minutes = drag.startMinutes + Math.round((rawMinutes - drag.startMinutes) / 30) * 30;
        if (minutes < 0 || minutes >= 1440) {
          setDropTarget(null);
          dropTargetRef.current = null;
          return;
        }
        const normalized = ((minutes % 1440) + 1440) % 1440;
        const time = `${Math.floor(normalized / 60).toString().padStart(2, '0')}:${(normalized % 60).toString().padStart(2, '0')}`;
        const target = { time, employeeId: 'shared' };
        setDropTarget(target);
        dropTargetRef.current = target;
        return;
      }
    }
    setDropTarget(null);
    dropTargetRef.current = null;
  };

  const autoScrollDrag = () => {
    const drag = dragRef.current;
    const scroller = timelineScrollRef.current;
    if (!drag?.active || !scroller) return;
    const rect = scroller.getBoundingClientRect();
    const left = rect.left + scroller.clientLeft;
    const right = left + scroller.clientWidth;
    const underPointer = document.elementFromPoint(drag.x, drag.y);
    if (underPointer && timelineGridRef.current?.contains(underPointer) && drag.y >= rect.top + scroller.clientTop && drag.y < rect.top + scroller.clientTop + scroller.clientHeight && drag.x >= left && drag.x < right) {
      const edge = 60;
      const delta = drag.x < left + edge ? -Math.ceil((left + edge - drag.x) / 5)
        : drag.x > right - edge ? Math.ceil((drag.x - (right - edge)) / 5) : 0;
      if (delta) scroller.scrollLeft += delta;
    }
    updateDragTarget(drag.x, drag.y);
    dragFrameRef.current = requestAnimationFrame(autoScrollDrag);
  };

  const handleDragMove = (e: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    e.preventDefault();
    drag.x = e.clientX;
    drag.y = e.clientY;
    setDragPos({ x: e.clientX, y: e.clientY });
    updateDragTarget(e.clientX, e.clientY);
  };

  const handleDragEnd = (e: PointerEvent) => {
    if (e.pointerId !== dragRef.current?.pointerId) return;
    if (e.type !== 'pointercancel') updateDragTarget(e.clientX, e.clientY);
    endDrag();
    const ref = dragRef.current;
    const target = dropTargetRef.current;
    dragRef.current = null;
    dropTargetRef.current = null;
    setDropTarget(null);
    setDragPos(null);
    setDragOrderId(null);

    lastDragEnd.current = e.timeStamp;
    if (e.type !== 'pointercancel' && ref && target) {
      const order = ref.order;
      const oldStart = order.scheduledStartTime ? new Date(order.scheduledStartTime) : null;
      const oldDate = oldStart ? format(oldStart, 'yyyy-MM-dd') : null;
      const oldTime = oldStart ? format(oldStart, 'HH:mm') : null;
      const changed = oldDate !== currentDate || oldTime !== target.time;
      if (changed) {
        setDropConfirm({
          order,
          newDate: currentDate,
          newTime: target.time,
        });
      }
    }
  };

  const handleConfirmMove = async () => {
    if (!dropConfirm) return;
    const [h, m] = dropConfirm.newTime.split(':').map(Number);
    const start = new Date(dropConfirm.newDate);
    start.setHours(h, m, 0, 0);
    const res = await scheduleOrder(dropConfirm.order.id, {
      scheduledStartTime: start.toISOString(),
      expectedUpdatedAt: new Date(dropConfirm.order.updatedAt).toISOString(),
      isOverCapacity: dropConfirm.order.isOverCapacity,
    });
    if (!res.success) {
      showActionError(res.error || 'Nie udało się zmienić terminu.');
      setDropConfirm(null);
      fetchDayOrders();
      return;
    }
    setDropConfirm(null);
    fetchDayOrders();
  };

  // ---- Long-press on empty slot cell → open Quick Add (prefilled) ----
  const clearCellLongPress = () => {
    if (cellLongPressTimer.current) {
      clearTimeout(cellLongPressTimer.current);
      cellLongPressTimer.current = null;
    }
  };

  const handleCellPointerDown = (e: React.PointerEvent, slotTime: string, empId: string) => {
    if (!canEdit) return;
    // Nie uruchamiaj, gdy naciśnięto kartę zlecenia lub przycisk
    if ((e.target as HTMLElement).closest('[data-order-card], button')) return;

    cellPressRef.current = { pointerId: e.pointerId, time: slotTime, employeeId: empId, startX: e.clientX, startY: e.clientY };
    clearCellLongPress();
    cellLongPressTimer.current = setTimeout(() => {
      const ref = cellPressRef.current;
      if (!ref || ref.pointerId !== e.pointerId) return;
      setQuickAddError('');
      setQuickAddPrefill({ time: ref.time, employeeId: '' });
      cellPressRef.current = null;
    }, 450);
  };

  const handleCellPointerMove = (e: React.PointerEvent) => {
    const ref = cellPressRef.current;
    if (!ref || ref.pointerId !== e.pointerId) return;

    // Jeśli palec się przesuwa (scroll), anuluj long-press
    const dx = e.clientX - ref.startX;
    const dy = e.clientY - ref.startY;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      clearCellLongPress();
      cellPressRef.current = null;
    }
  };

  const handleCellPointerUp = (e: React.PointerEvent) => {
    const ref = cellPressRef.current;
    if (!ref || ref.pointerId !== e.pointerId) return;
    clearCellLongPress();
    cellPressRef.current = null;
  };

  // Reschedule a past unfinished order to today
  const handleMoveToToday = async (ord: any) => {
    const roundedTime = getRoundedCurrentTime(30);
    const [h, m] = roundedTime.split(':').map(Number);
    const todayDate = new Date();
    todayDate.setHours(h, m, 0, 0);

    const res = await scheduleOrder(ord.id, {
      scheduledStartTime: todayDate.toISOString(),
      durationMin: ord.durationMin || 30,
      expectedUpdatedAt: new Date(ord.updatedAt).toISOString(),
      isOverCapacity: ord.isOverCapacity,
    });
    if (!res.success) showActionError(res.error || 'Nie udało się przepisać zlecenia na dziś.');

    fetchDayOrders();
  };

  // Active workers list
  const activeEmployees = useMemo(() => {
    return employees.filter(e => activeEmpIds.includes(e.id));
  }, [employees, activeEmpIds]);

  // Overdue uncompleted orders on TODAY (earlier hours of today)
  const overdueOrdersToday = useMemo(() => {
    if (!isToday) return [];
    const now = new Date();
    const currentSlotMinutes = now.getHours() * 60 + now.getMinutes();

    return orders.filter(o => {
      if (!o.scheduledStartTime || o.status === 'COMPLETED' || o.status === 'READY' || o.status === 'CANCELLED') return false;
      const start = new Date(o.scheduledStartTime);
      const startDateStr = format(start, 'yyyy-MM-dd');
      if (startDateStr !== currentDate) return false;

      const startMinutes = start.getHours() * 60 + start.getMinutes();
      return startMinutes < currentSlotMinutes - 30; // 30 min grace period
    });
  }, [orders, isToday, currentDate]);

  // Calculate current hour capacity load
  const currentHourLoad = useMemo(() => {
    const activeRunning = orders.filter(o => o.status === 'IN_PROGRESS');
    return activeRunning.length;
  }, [orders]);

  // Filtering changes only the view, never the shift or order assignment.
  const cardLayouts = useMemo(() => {
      const dayStart = new Date(`${currentDate}T00:00:00`).getTime();
      const dayOrders = orders
        .filter(o => o.status !== 'CANCELLED'
          && (visibleEmployeeId === 'all' || !activeEmployees.some(e => e.id === visibleEmployeeId)
            || !(o.assignedEmployees || []).length
            || (o.assignedEmployees || []).some((assignment: any) => assignment.employeeId === visibleEmployeeId))
          && format(new Date(o.scheduledStartTime || o.targetReadyTime), 'yyyy-MM-dd') === currentDate)
        .map(o => {
          const start = o.scheduledStartTime ? new Date(o.scheduledStartTime).getTime()
            : new Date(o.targetReadyTime).getTime() - (o.durationMin || 30) * 60000;
          const startDate = new Date(start);
          const dayOffset = Math.round((new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()).getTime() - dayStart) / 86400000);
          const minutes = dayOffset * 1440 + startDate.getHours() * 60 + startDate.getMinutes();
          return { o, start: minutes, end: minutes + (o.durationMin || 30) };
        })
        .sort((a, b) => a.start - b.start);
      const laneEnds: number[] = [];
      return dayOrders.map(it => {
        let lane = laneEnds.findIndex(end => end <= it.start);
        if (lane < 0) lane = laneEnds.length;
        laneEnds[lane] = it.end;
        return { order: it.o, start: it.start, end: it.end, lane };
      });
  }, [orders, activeEmployees, visibleEmployeeId, currentDate]);

  const axisStart = Math.floor(Math.min(workStartHour * 60, ...cardLayouts.map(l => l.start)) / 30) * 30;
  axisStartRef.current = axisStart;
  const axisEnd = Math.ceil(Math.max(workEndHour * 60 + 30, ...cardLayouts.map(l => l.end)) / 30) * 30;
  const timeSlots = Array.from({ length: (axisEnd - axisStart) / 30 }, (_, i) => axisStart + i * 30);
  const laneCount = Math.max(1, ...cardLayouts.map(l => l.lane + 1));
  const visibleBoardOrderIds = new Set(cardLayouts.map(layout => layout.order.id));
  const pendingReleaseOrders = Array.from(new Map([...pendingReleases, ...orders.filter(o => o.status === 'READY')]
    .filter(o => !visibleBoardOrderIds.has(o.id)).map(o => [o.id, o])).values());

  return (
    <div className="planner-board min-w-0 flex-1 flex flex-col space-y-4">

      {actionError && (
        <div role="alert" className="sticky top-2 z-[120] mx-auto w-full max-w-xl rounded-2xl border border-rose-600 bg-rose-950/95 px-4 py-3 text-sm font-bold text-rose-100 shadow-2xl">
          {actionError}
        </div>
      )}
      
      {/* Compact toolbar keeps the schedule visible; date and roster expand on demand. */}
      <section className="planner-controls rounded-2xl border border-slate-800 bg-slate-900 shadow-xl">
        <div className="planner-toolbar flex flex-wrap items-center gap-2 p-2">
          <button
            type="button"
            aria-expanded={controlsExpanded}
            aria-controls="planner-date-roster"
            onClick={() => setControlsExpanded(value => !value)}
            className="planner-controls-toggle min-h-11 flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-left text-sm font-bold text-white"
          >
            <Calendar className="h-4 w-4 shrink-0 text-sky-400" />
            <span className="capitalize">{format(new Date(currentDate), 'EEE, d MMM', { locale: pl })}</span>
            <span className="text-xs text-slate-400">Obsada: {activeEmployees.length}</span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-sky-400 transition-transform ${controlsExpanded ? 'rotate-180' : ''}`} />
            <span className="sr-only">Data i obsada — {controlsExpanded ? 'zwiń' : 'rozwiń'}</span>
          </button>
      {activeEmployees.length > 0 && (
        <label className="planner-employee-filter flex min-w-0 items-center text-sm font-semibold text-slate-300">
          <span className="sr-only">Widok pracowników</span>
          <select
            aria-label="Widok pracowników"
            value={activeEmployees.some(e => e.id === visibleEmployeeId) ? visibleEmployeeId : 'all'}
            onChange={e => setVisibleEmployeeId(e.target.value)}
            className="min-h-11 w-full max-w-full rounded-xl border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white"
          >
            <option value="all">Wszyscy na zmianie</option>
            {activeEmployees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
          </select>
        </label>
      )}

        {/* Capacity Indicator & Add Button / Read-Only Mode Badge */}
        <div className="flex items-center gap-2">
          {!canEdit && (
            <div className="px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold flex items-center gap-1.5 shadow">
              <Eye className="w-4 h-4 text-amber-400" />
              <span>Podgląd</span>
            </div>
          )}

          <div className={`px-3 py-2 rounded-xl border flex items-center gap-2 text-xs font-bold ${
            currentHourLoad >= maxCarsLimit
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
              : 'bg-slate-950 border-slate-800 text-slate-300'
          }`}>
            <Layers className="w-4 h-4 text-sky-400" />
            <span>Myte: <strong className="text-white text-sm">{currentHourLoad}</strong> / {maxCarsLimit}</span>
          </div>

          {canEdit && (
            <button
              onClick={() => {
                setQuickAddError('');
                setQuickAddPrefill({
                  time: getRoundedCurrentTime(30),
                  employeeId: '',
                });
              }}
              className="px-3.5 py-2 sm:py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-extrabold text-xs shadow-lg shadow-sky-500/20 transition-all flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>+ DODAJ</span>
            </button>
          )}
        </div>

        </div>
        <div id="planner-date-roster" hidden={!controlsExpanded}>
          <div className="flex flex-col gap-3 border-t border-slate-800 p-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Date Navigator */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => {
              const prev = subDays(new Date(currentDate), 1);
              setCurrentDate(format(prev, 'yyyy-MM-dd'));
            }}
            className="p-2.5 sm:p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white transition-colors"
            title="Poprzedni dzień"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="bg-slate-950 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl border border-slate-800 flex items-center gap-2.5">
            <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-sky-400" />
            <div>
              <span className="text-[10px] text-slate-400 block leading-tight">Dzień:</span>
              <span className="font-extrabold text-xs sm:text-sm text-white capitalize">
                {format(new Date(currentDate), 'EEEE, d MMM', { locale: pl })}
              </span>
            </div>
          </div>

          <button
            onClick={() => {
              const next = addDays(new Date(currentDate), 1);
              setCurrentDate(format(next, 'yyyy-MM-dd'));
            }}
            className="p-2.5 sm:p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white transition-colors"
            title="Następny dzień"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          <button
            onClick={() => {
              setCurrentDate(format(new Date(), 'yyyy-MM-dd'));
              setTimeout(() => scrollToCurrentTime(true), 150);
            }}
            className={`px-3 py-2 sm:py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              isToday
                ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20'
                : 'bg-slate-800 hover:bg-slate-700 text-sky-400'
            }`}
          >
            <Target className="w-3.5 h-3.5" />
            <span>Dziś ({getCurrentSlotString()})</span>
          </button>
        </div>

        {/* Shift Staff Selector (Interactive for wash/admin, Read-only badges for departments) */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {canEdit ? (
            <button
              onClick={openShiftStartModal}
              className="text-[11px] font-bold text-slate-400 hover:text-sky-300 uppercase tracking-wider flex items-center gap-1 mr-1 px-2.5 py-1.5 rounded-xl bg-slate-950/80 hover:bg-slate-800 border border-slate-800 transition-all group"
              title="Kliknij, aby zarządzać składem zmiany"
            >
              <Users className="w-3.5 h-3.5 text-sky-400 group-hover:scale-110 transition-transform" />
              <span>Zmiana ({activeEmployees.length}):</span>
              <UserPlus className="w-3 h-3 text-sky-400 ml-0.5" />
            </button>
          ) : (
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mr-1 px-2.5 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800">
              <Users className="w-3.5 h-3.5 text-sky-400" />
              <span>Zmiana ({activeEmployees.length}):</span>
            </div>
          )}

          {employees.map((emp) => {
            const isActive = activeEmpIds.includes(emp.id);
            const overShift = isToday && isActive && isOverShift(emp.id);
            const elapsed = isToday && isActive && shiftStartTimes[emp.id] ? formatElapsedTime(shiftStartTimes[emp.id]) : null;

            return canEdit ? (
              <button
                key={emp.id}
                onClick={() => requestShiftChange(emp.id, isActive)}
                className={`px-2.5 py-1.5 sm:py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
                  isActive
                    ? overShift
                      ? 'bg-amber-950/80 border-amber-500 text-amber-200 shadow'
                      : 'bg-slate-800 border-sky-500 text-white shadow'
                    : 'bg-slate-950/60 border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700'
                }`}
                title={
                  isToday
                    ? isActive ? `Zakończ zmianę (${emp.name})` : `Rozpocznij zmianę dla: ${emp.name}`
                    : isActive ? `Zaplanowany w grafiku na ten dzień (${emp.name})` : `Kliknij, aby przypisać do grafiku na ten dzień: ${emp.name}`
                }
              >
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: emp.color }}
                />
                <span className="truncate max-w-[70px] sm:max-w-none">{emp.shortName}</span>
                {elapsed && (
                  <span className={`text-[10px] font-mono font-bold ${overShift ? 'text-amber-400' : 'text-sky-400'}`}>
                    {elapsed}
                  </span>
                )}
                {isActive && <Check className={`w-3 h-3 ${overShift ? 'text-amber-400' : 'text-sky-400'}`} />}
              </button>
            ) : (
              <div
                key={emp.id}
                className={`px-2.5 py-1.5 sm:py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border ${
                  isActive
                    ? 'bg-slate-800 border-sky-500/60 text-white shadow'
                    : 'bg-slate-950/50 border-slate-800/80 text-slate-500 opacity-60'
                }`}
              >
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: emp.color }}
                />
                <span className="truncate max-w-[70px] sm:max-w-none">{emp.shortName}</span>
                {elapsed && (
                  <span className="text-[10px] font-mono font-bold text-sky-400">
                    {elapsed}
                  </span>
                )}
                {isActive && <Check className="w-3 h-3 text-sky-400" />}
              </div>
            );
          })}
        </div>


          </div>
        </div>
      </section>

      {/* RED Alert Drawer for PAST Unfinished Orders (from previous days) – collapsed by default */}
      {isToday && pastUnfinishedOrders.length > 0 && (
        <details id="past-orders-panel" className="planner-queue group bg-gradient-to-r from-rose-950/90 via-red-950/80 to-slate-950 border-2 border-rose-500 rounded-3xl shadow-2xl">
          <summary className="min-h-11 flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 rounded-3xl px-4 py-3 sm:px-5 hover:bg-rose-950/40 transition-colors">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 font-black flex-shrink-0">
                <AlertOctagon className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-black text-rose-300 uppercase tracking-tight flex items-center gap-2 flex-wrap">
                  Niezrealizowane Auta z Poprzednich Dni
                  <span className="text-xs font-black px-2 py-0.5 rounded-full bg-rose-500 text-white shadow" title="Liczba pojazdów do obsłużenia">
                    {pastUnfinishedOrders.length}
                  </span>
                </h3>
                <p className="text-xs text-rose-200/80 hidden sm:block">
                  Te pojazdy nie zostały umyte w wyznaczonym dniu. Kliknij, aby rozwinąć listę.
                </p>
              </div>
            </div>
            <span className="flex items-center gap-1 text-xs font-bold text-rose-300 whitespace-nowrap">
              Pokaż / ukryj <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            </span>
          </summary>

          <div className="px-4 pb-4 sm:px-5 sm:pb-5">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[45dvh] overflow-y-auto">
            {pastUnfinishedOrders.map((pOrd) => (
              <div
                key={pOrd.id}
                className={`bg-slate-950/90 border rounded-2xl p-3.5 flex flex-col justify-between shadow-lg ${
                  pOrd.isPriority ? 'border-amber-500 ring-2 ring-amber-500/50 shadow-amber-500/20' : 'border-rose-500/50'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-base text-white bg-black/60 px-2.5 py-1 rounded-xl border border-rose-500/30">
                        {pOrd.licensePlate}
                      </span>
                      <span
                        className="text-[10px] font-black px-2 py-0.5 rounded text-white"
                        style={{ backgroundColor: pOrd.department?.color || '#3b82f6' }}
                      >
                        {pOrd.department?.code}
                      </span>
                      {pOrd.isPriority && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 uppercase flex items-center gap-0.5 shadow animate-pulse">
                          <Zap className="w-2.5 h-2.5 fill-current" /> EKSPRES
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded bg-rose-500/30 text-rose-300 border border-rose-500/40 uppercase">
                      Zaległe z {format(new Date(pOrd.targetReadyTime), 'd MMM')}
                    </span>
                  </div>

                  <p className="text-xs font-bold text-slate-200 truncate">
                    {pOrd.carModel || 'Pojazd salonowy'} • <span className="text-slate-400 font-normal">{pOrd.category?.name}</span>
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-rose-500/20">
                  <button
                    onClick={() => handleMoveToToday(pOrd)}
                    className="py-2 px-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-black text-xs transition-all flex items-center justify-center gap-1.5 shadow"
                  >
                    <CalendarClock className="w-3.5 h-3.5" />
                    <span>Przepisz na dziś</span>
                  </button>

                  <button
                    onClick={() => {
                      if (!pOrd.scheduledStartTime) {
                        setEditingOrder(pOrd);
                      } else {
                        setFinishConfirmId(pOrd.id);
                      }
                    }}
                    className="py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition-all flex items-center justify-center gap-1 shadow"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 stroke-[3]" />
                    <span>Gotowe</span>
                  </button>
                </div>
              </div>
            ))}
            </div>
          </div>
        </details>
      )}

      {/* Alert banner for today's overdue cars (earlier hours of today) – collapsed by default */}
      {overdueOrdersToday.length > 0 && (
        <details className="planner-queue group bg-gradient-to-r from-amber-950/80 via-rose-950/50 to-slate-900 border border-amber-500/50 rounded-2xl shadow-lg overflow-hidden">
          <summary className="min-h-11 flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-2.5 hover:bg-amber-950/40 transition-colors">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
              <div>
                <p className="text-xs font-extrabold text-white flex items-center gap-2 flex-wrap">
                  Uwaga: {overdueOrdersToday.length} {overdueOrdersToday.length === 1 ? 'auto ma zaległą wcześniejszą godzinę' : 'auta mają zaległe wcześniejsze godziny'} na dzisiejszym grafiku!
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 shadow" title="Liczba pojazdów do obsłużenia">
                    {overdueOrdersToday.length}
                  </span>
                </p>
                <p className="text-[11px] text-amber-200">
                  Kliknij, aby zobaczyć zaległe auta i wykonać akcję.
                </p>
              </div>
            </div>
            <span className="flex items-center gap-1 text-xs font-bold text-amber-300 whitespace-nowrap">
              Pokaż / ukryj <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            </span>
          </summary>

          {/* Expandable list of overdue today's orders */}
          <div className="border-t border-amber-500/30 p-3.5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 bg-slate-950/60 max-h-[45dvh] overflow-y-auto">
              {overdueOrdersToday.map((ord) => (
                <div
                  key={ord.id}
                  className={`bg-slate-900 border rounded-2xl p-3 flex flex-col justify-between shadow ${
                    ord.isPriority ? 'border-amber-500 ring-2 ring-amber-500/50 shadow-amber-500/20' : 'border-amber-500/40'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-sm text-white bg-black/60 px-2 py-0.5 rounded-lg border border-amber-500/30">
                          {ord.licensePlate}
                        </span>
                        <span
                          className="text-[10px] font-black px-1.5 py-0.5 rounded text-white"
                          style={{ backgroundColor: ord.department?.color || '#3b82f6' }}
                        >
                          {ord.department?.code}
                        </span>
                        {ord.isPriority && (
                          <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 uppercase flex items-center gap-0.5 shadow">
                            <Zap className="w-2 h-2 fill-current" /> EKSPRES
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase whitespace-nowrap">
                        Plan: {format(new Date(ord.scheduledStartTime), 'HH:mm')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 truncate">
                      {ord.carModel || 'Pojazd'} • <span className="text-slate-400">{ord.category?.name}</span>
                    </p>
                  </div>
                  {canEdit ? (
                    <div className="grid grid-cols-2 gap-1.5 mt-2.5 pt-2 border-t border-amber-500/20">
                      <button
                        onClick={() => handleMoveToToday(ord)}
                        className="py-1.5 px-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-black text-[10px] transition-all flex items-center justify-center gap-1 shadow"
                      >
                        <CalendarClock className="w-3 h-3" />
                        Teraz
                      </button>
                      <button
                        onClick={() => {
                          if (!ord.scheduledStartTime) {
                            setEditingOrder(ord);
                          } else {
                            setFinishConfirmId(ord.id);
                          }
                        }}
                        className="py-1.5 px-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[10px] transition-all flex items-center justify-center gap-1 shadow"
                      >
                        <CheckCircle2 className="w-3 h-3 stroke-[3]" />
                        Gotowe
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2.5 pt-2 border-t border-amber-500/20 text-[10px] text-amber-300 font-bold text-center">
                      Niezrealizowane – oczekuje na myjnię
                    </div>
                  )}
                </div>
              ))}
          </div>
        </details>
      )}



      {/* Auta gotowe do odbioru, których nie ma na grafiku (np. z poprzednich dni lub bez przypisania) */}
      {pendingReleaseOrders.length > 0 && (
        <details className="planner-queue group bg-gradient-to-r from-emerald-950/80 via-slate-950 to-slate-900 border border-emerald-500/40 rounded-2xl shadow-lg">
          <summary className="min-h-11 flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-3 hover:bg-emerald-950/40 transition-colors">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <h3 className="text-sm font-black text-emerald-300 uppercase tracking-tight flex items-center gap-2 flex-wrap">
                Gotowe do wydania poza grafikiem
                <span className="text-xs font-black px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 shadow">
                  {pendingReleaseOrders.length}
                </span>
              </h3>
            </div>
            <span className="flex items-center gap-1 text-xs font-bold text-emerald-300 whitespace-nowrap">
              Pokaż / ukryj <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            </span>
          </summary>
          <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[45dvh] overflow-y-auto">
            {pendingReleaseOrders.map((ord) => (
              <div key={ord.id} className="flex items-center justify-between gap-2 rounded-xl border border-emerald-500/30 bg-slate-950/80 p-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-black text-sm text-white truncate">{ord.licensePlate}</span>
                    <span
                      className="text-[9px] font-black px-1.5 py-0.5 rounded text-white flex-shrink-0"
                      style={{ backgroundColor: ord.department?.color || '#3b82f6' }}
                    >
                      {ord.department?.code}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 truncate">
                    {ord.category?.name} • na {format(new Date(ord.targetReadyTime), 'd MMM HH:mm', { locale: pl })}
                  </p>
                  <p className="text-[10px] text-slate-500 truncate">
                    {(ord.assignedEmployees || []).map((a: any) => a.employee?.name).filter(Boolean).join(', ') || 'bez przypisania'}
                  </p>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setReleaseOrderSnapshot(ord)}
                    className="flex-shrink-0 rounded-lg bg-emerald-500 px-2.5 py-2 text-[10px] font-black text-slate-950 hover:bg-emerald-400"
                  >
                    WYDANE
                  </button>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      {cardLayouts.some(layout => layout.end - layout.start < 30) && (
        <section aria-label="Krótkie zlecenia" className="rounded-2xl border border-slate-800 bg-slate-900 p-3">
          <h2 className="mb-2 text-xs font-bold text-slate-300">Krótkie zlecenia: wybierz, aby otworzyć szczegóły</h2>
          <div className="flex flex-wrap gap-2">
            {cardLayouts.filter(layout => layout.end - layout.start < 30).map(layout => (
              <button key={layout.order.id} type="button" onClick={() => setEditingOrder(layout.order)}
                className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-left text-xs font-bold text-white hover:border-sky-400">
                <span className="font-mono">{layout.order.licensePlate}</span>{' '}
                <span className="text-sky-300">{`${String(Math.floor(((layout.start % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((layout.start % 60) + 60) % 60).padStart(2, '0')}`}</span>{' '}
                <span className="text-slate-400">({layout.end - layout.start} min)</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Main Grid: Staff Columns & Timeline (Scrollable & Auto-centered) */}
      <div 
        ref={timelineScrollRef}
        aria-label="Harmonogram myjni"
        tabIndex={0}
        className="planner-timeline min-w-0 w-full flex-1 bg-slate-900 border border-slate-800 rounded-3xl p-2 sm:p-4 shadow-2xl overflow-auto max-h-[75dvh] relative"
      >
        <div className="flex flex-wrap items-center justify-end mb-2 text-xs text-slate-500 gap-4">
          {canEdit ? (
            <>
              <span className="flex items-center gap-1.5">
                <Plus className="w-3 h-3 text-emerald-400" />
                Przytrzymaj puste pole lub kliknij 2x, aby szybko dodać auto
              </span>
              <span className="flex items-center gap-1.5">
                <Move className="w-3 h-3 text-sky-400" />
                Dotknij karty, aby zmienić termin. Mysz: przytrzymaj i przeciągnij.
              </span>
            </>
          ) : (
            <span className="flex items-center gap-1.5 text-amber-400/80 font-bold">
              <Lock className="w-3.5 h-3.5" />
              Tryb tylko do podglądu – modyfikacje są zastrzeżone dla obsługi myjni i kierownika
            </span>
          )}
        </div>
          <div style={{ width: (axisEnd - axisStart) * PIXELS_PER_MINUTE }}>
            <div className="sticky top-0 z-30 flex bg-slate-900 border-b border-slate-700">
              {timeSlots.map(minutes => {
                const normalized = ((minutes % 1440) + 1440) % 1440;
                return <div key={minutes} className="shrink-0 border-l border-slate-700 px-2 py-2 font-mono text-xs font-bold text-slate-300" style={{ width: 30 * PIXELS_PER_MINUTE }}>{`${Math.floor(normalized / 60).toString().padStart(2, '0')}:${(normalized % 60).toString().padStart(2, '0')}`}{minutes < 0 ? ' -1d' : minutes >= 1440 ? ' +1d' : ''}</div>;
              })}
            </div>
            <div ref={timelineGridRef} className="group relative" style={{ height: laneCount * LANE_HEIGHT }}>
              {timeSlots.map((minutes, slotIdx) => {
                const valid = minutes >= 0 && minutes < 1440;
                const slot = `${Math.floor(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`;
                return <div key={minutes}
                  onPointerDown={valid ? e => handleCellPointerDown(e, slot, 'shared') : undefined}
                  onPointerMove={handleCellPointerMove} onPointerUp={handleCellPointerUp} onPointerCancel={handleCellPointerUp}
                  onDoubleClick={valid && canEdit ? () => { setQuickAddError(''); setQuickAddPrefill({ time: slot, employeeId: '' }); } : undefined}
                  className={`absolute top-0 bottom-0 border-l border-slate-800 ${dropTarget?.time === slot && valid ? 'bg-emerald-500/20' : 'bg-slate-950/40'}`}
                  style={{ left: slotIdx * 30 * PIXELS_PER_MINUTE, width: 30 * PIXELS_PER_MINUTE }} />;
              })}
                  {cardLayouts.map((layout) => {
                    const ord = layout.order;
                    const isReady = ord.status === 'READY';
                    const isInProgress = ord.status === 'IN_PROGRESS';
                    const isCompleted = ord.status === 'COMPLETED';
                    const latestArrival = getOrderLatestArrivalTime(ord, 30);
                    const isCompact = false;
                    const isTight = false;
                    const isCondensed = true;

                    // Check if this order starts earlier than current time (today) and is unfinished
                    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
                    const isOverdue = isToday && layout.start < nowMinutes - 30 && !isCompleted && !isReady;
                    const employeeButton = canEdit && !isCompleted && (
                      <button
                        type="button"
                        aria-label={`Zmień wykonawców: ${ord.licensePlate}`}
                        className="rounded-lg bg-slate-800 px-2 py-1 text-xs font-bold text-sky-300"
                        onClick={(e) => {
                          e.stopPropagation();
                          const ids = (ord.assignedEmployees || []).map((a: any) => a.employeeId);
                          setEmployeeSelection(ids.length ? ids : ord.assignedEmployeeId ? [ord.assignedEmployeeId] : []);
                          setEmployeeError('');
                          setEmployeeOrder(ord);
                        }}
                      >Wykonawcy</button>
                    );

                    return (
                      <div
                        key={ord.id}
                        data-order-card
                        role="button"
                        tabIndex={0}
                        aria-label={`Szczegóły i termin: ${ord.licensePlate}`}
                        onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setEditingOrder(ord); } }}
                        onPointerDown={(e) => handleCardPointerDown(e, ord, layout.start)}
                        onPointerMove={handleCardPointerMove}
                        onPointerUp={handleCardPointerUp}
                        onPointerCancel={handleCardPointerUp}
                        onClick={(e) => {
                          if (!(e.target as HTMLElement).closest('button') && e.timeStamp - lastDragEnd.current > 500) setEditingOrder(ord);
                        }}
                        style={{
                          touchAction: 'auto',
                          position: 'absolute',
                          top: layout.lane * LANE_HEIGHT,
                          height: LANE_HEIGHT - 8,
                          minHeight: 0,
                          overflow: 'hidden',
                          left: (layout.start - axisStart) * PIXELS_PER_MINUTE,
                          width: (layout.end - layout.start) * PIXELS_PER_MINUTE,
                          zIndex: dragOrderId === ord.id ? 30 : (isCompact ? 20 : 10),
                        }}
                        className={`rounded-xl border transition-all relative shadow select-none ${
                          isCompact ? 'overflow-hidden' : ''
                        } ${
                          dragOrderId === ord.id
                            ? 'opacity-40 ring-2 ring-sky-400 scale-95'
                            : ''
                        } ${
                          ord.isPriority && !isCompleted
                            ? isOverdue
                              ? isCondensed
                                ? 'bg-gradient-to-r from-rose-950 via-amber-950/80 to-slate-900 border-2 border-amber-500 ring-2 ring-amber-400/60 shadow-lg shadow-amber-500/30 text-white'
                                : 'p-2 bg-gradient-to-r from-rose-950 via-amber-950/80 to-slate-900 border-2 border-amber-500 ring-2 ring-amber-400/60 shadow-lg shadow-amber-500/30 text-white'
                              : isReady
                              ? isCondensed
                                ? 'bg-emerald-950 border-2 border-amber-400 ring-2 ring-amber-400/60 text-white pulse-ready'
                                : 'p-2.5 sm:p-3 bg-emerald-950/90 border-2 border-amber-400 ring-2 ring-amber-400/60 text-white pulse-ready'
                              : isInProgress
                              ? isCondensed
                                ? 'bg-gradient-to-r from-amber-950 via-slate-900 to-amber-950/90 border-2 border-amber-400 ring-2 ring-amber-400/80 shadow-lg shadow-amber-500/40 text-white pulse-in-progress'
                                : 'p-2.5 sm:p-3 bg-gradient-to-r from-amber-950 via-slate-900 to-amber-950/90 border-2 border-amber-400 ring-2 ring-amber-400/80 shadow-lg shadow-amber-500/40 text-white pulse-in-progress'
                              : isCondensed
                              ? 'bg-gradient-to-r from-amber-950/90 via-slate-900 to-slate-900 border-2 border-amber-500 ring-2 ring-amber-400/70 shadow-lg shadow-amber-500/20 text-white hover:border-amber-300 cursor-pointer'
                              : 'p-2.5 sm:p-3 bg-gradient-to-r from-amber-950/90 via-slate-900 to-slate-900 border-2 border-amber-500 ring-2 ring-amber-500/60 shadow-xl shadow-amber-500/25 text-white hover:border-amber-300'
                            : isOverdue
                            ? isCondensed
                              ? 'bg-gradient-to-r from-rose-950/80 to-slate-900 border-rose-500/70 text-white'
                              : 'p-2 bg-gradient-to-r from-rose-950/70 to-slate-900 border-rose-500/60 text-white'
                            : isReady
                            ? isCondensed
                              ? 'bg-emerald-950 border-emerald-500 text-white pulse-ready'
                              : 'p-2.5 sm:p-3 bg-emerald-950/90 border-emerald-500 text-white pulse-ready'
                            : isInProgress
                            ? isCondensed
                              ? 'bg-amber-950 border-amber-500 text-white pulse-in-progress'
                              : 'p-2.5 sm:p-3 bg-amber-950/90 border-amber-500 text-white pulse-in-progress'
                            : isCompleted
                            ? 'p-2 bg-slate-900/60 border-slate-800 text-slate-400 opacity-60'
                            : isCondensed
                            ? 'bg-slate-900 border-slate-700 text-white hover:border-sky-500 cursor-pointer'
                            : 'p-2.5 sm:p-3 bg-slate-900 border-slate-700 text-white hover:border-sky-500'
                        } ${isTight ? 'p-1' : isCompact ? 'p-1.5' : ''}`}
                      >
                        {isCondensed && (
                          <div className="p-1.5 space-y-1">
                            <div className="truncate font-mono text-sm font-black" title={ord.licensePlate}>{ord.licensePlate}</div>
                            <div className="truncate text-xs font-bold text-slate-200">{ord.status === 'PLANNED' ? 'Oczekuje' : ord.status === 'IN_PROGRESS' ? 'Mycie' : ord.status === 'READY' ? 'Gotowe' : 'Wydane'}</div>
                            {ord.isPriority && <div className="truncate text-xs font-bold text-amber-300">Ekspres</div>}
                            <div className="truncate text-xs text-slate-300">{ord.category?.name}</div>
                            <div className="truncate text-xs text-sky-300" title={(ord.assignedEmployees || []).map((a: any) => a.employee?.name).filter(Boolean).join(', ')}>{(ord.assignedEmployees || []).map((a: any) => a.employee?.shortName || a.employee?.name).filter(Boolean).join(', ') || 'Bez wykonawców'}</div>
                            {!ord.scheduledStartTime && <div className="truncate text-xs font-bold text-amber-300">Godzina orientacyjna</div>}
                            <div className="flex flex-col gap-1">
                              {canEdit && ['PLANNED', 'IN_PROGRESS', 'READY'].includes(ord.status) && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (ord.status === 'PLANNED') handleStartOrder(ord.id);
                                    if (ord.status === 'IN_PROGRESS') setFinishConfirmId(ord.id);
                                    if (ord.status === 'READY') handleCompleteOrder(ord.id);
                                  }}
                                  className="min-w-0 min-h-11 rounded-lg bg-sky-500 px-1 text-xs font-bold text-white"
                                >
                                  {ord.status === 'PLANNED' ? 'Start' : ord.status === 'IN_PROGRESS' ? 'Gotowe' : 'Wydane'}
                                </button>
                              )}
                              <button
                                type="button"
                                aria-label={`Szczegóły i termin: ${ord.licensePlate}`}
                                onClick={(e) => { e.stopPropagation(); setEditingOrder(ord); }}
                                 className="min-h-11 shrink-0 flex items-center justify-center gap-1 rounded-lg bg-slate-800 text-sky-300"
                              >
                                <Eye className="h-4 w-4" /><span className="text-xs">Szczegóły</span>
                              </button>
                            </div>
                          </div>
                        )}
                        <div hidden>
                        <p className="mb-1 truncate text-xs font-bold text-sky-300" title={(ord.assignedEmployees || []).map((a: any) => a.employee?.name).filter(Boolean).join(', ')}>{(ord.assignedEmployees || []).map((a: any) => a.employee?.shortName || a.employee?.name).filter(Boolean).join(', ') || 'Bez wykonawców'}</p>
                        {!ord.scheduledStartTime && <p className="text-xs font-bold text-amber-300">Godzina orientacyjna</p>}
                        {employeeButton}
                        {isTight ? (
                          <>
                            <div className="flex items-center gap-1">
                              <span className={`font-mono font-black text-[10px] leading-tight bg-black/40 px-1 py-0.5 rounded border truncate max-w-[92px] flex items-center gap-1 ${
                                ord.isPriority ? 'border-amber-500 text-amber-300' : 'border-white/10 text-white'
                              }`}>
                                {ord.isPriority && <Zap className="w-2.5 h-2.5 text-amber-400 fill-current animate-pulse flex-shrink-0" />}
                                {ord.licensePlate}
                              </span>
                              <span
                                className="text-[8px] font-black px-1 py-0.5 rounded text-white flex-shrink-0"
                                style={{ backgroundColor: ord.department?.color || '#3b82f6' }}
                              >
                                {ord.department?.code}
                              </span>
                              {ord.isPriority && (
                                <span className="text-[7px] font-black px-1 py-0.2 rounded bg-amber-500 text-slate-950 uppercase flex-shrink-0 animate-pulse">
                                  ⚡EKSP
                                </span>
                              )}
                              <span
                                className="ml-auto font-bold text-sky-400 text-[9px] flex-shrink-0"
                                title={latestArrival ? `Najpóźniej na myjni: ${format(latestArrival, 'HH:mm')}` : undefined}
                              >⏱ {ord.durationMin}m</span>
                            </div>

                            <div className="flex items-center justify-between gap-1 mt-0.5">
                              <span className="text-[9px] text-slate-300 truncate">{ord.category?.name}</span>
                              {ord.status === 'READY' && (
                                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 flex-shrink-0" />
                              )}
                            </div>

                            <div className="mt-1">
                              {canEdit ? (
                                <>
                                  {ord.status === 'PLANNED' && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleStartOrder(ord.id); }}
                                      className="w-full py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[9px] flex items-center justify-center gap-1"
                                    >
                                      <Play className="w-2 h-2 fill-current" />
                                      START
                                    </button>
                                  )}
                                  {ord.status === 'IN_PROGRESS' && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setFinishConfirmId(ord.id); }}
                                      className="w-full py-0.5 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[9px] flex items-center justify-center gap-1"
                                    >
                                      <CheckCircle2 className="w-2 h-2 stroke-[3]" />
                                      GOTOWE
                                    </button>
                                  )}
                                  {ord.status === 'READY' && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleCompleteOrder(ord.id); }}
                                      className="w-full py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-emerald-300 font-bold text-[9px] flex items-center justify-center gap-1 border border-emerald-500/40"
                                    >
                                      <Check className="w-2 h-2" />
                                      WYDANE
                                    </button>
                                  )}
                                  {ord.status === 'COMPLETED' && (
                                    <div className="text-center text-[8px] font-black uppercase text-slate-500 py-0.5">
                                      Wydane
                                    </div>
                                  )}
                                </>
                              ) : (
                                <div className="text-center text-[8px] font-bold py-0.5">
                                  {ord.status === 'PLANNED' && <span className="text-amber-400">W kolejce</span>}
                                  {ord.status === 'IN_PROGRESS' && <span className="text-amber-300 animate-pulse">Mycie...</span>}
                                  {ord.status === 'READY' && <span className="text-emerald-400">Gotowe</span>}
                                  {ord.status === 'COMPLETED' && <span className="text-slate-500">Wydane</span>}
                                </div>
                              )}
                            </div>

                            {ord.notes && (
                              <div className="flex items-center gap-1 mt-0.5 text-[8px] text-sky-300 truncate">
                                <FileText className="w-2 h-2 text-sky-400 flex-shrink-0" />
                                <span className="truncate">{ord.notes}</span>
                              </div>
                            )}
                          </>
                        ) : isCompact ? (
                          <>
                            {isOverdue && (
                              <div className="flex items-center gap-0.5 text-[8px] font-black text-rose-400 uppercase tracking-wider mb-0.5 bg-rose-950/60 px-1 py-0.5 rounded border border-rose-500/30">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                <span>ZALEGŁA</span>
                              </div>
                            )}
                            <div className="flex items-center gap-1 mb-0.5 flex-wrap">
                              <span className="font-mono font-black text-[11px] tracking-wide bg-black/40 px-1.5 py-0.5 rounded border border-white/10 truncate flex items-center gap-1">
                                {ord.isPriority && <span className="text-amber-400 font-bold">⚡</span>}
                                {ord.licensePlate}
                              </span>
                              <span
                                className="text-[8px] font-black px-1 py-0.5 rounded text-white flex-shrink-0"
                                style={{ backgroundColor: ord.department?.color || '#3b82f6' }}
                              >
                                {ord.department?.code}
                              </span>
                              {ord.isPriority && (
                                <span
                                  className="text-[7px] font-black px-1 py-0.2 rounded bg-amber-500 text-slate-950 uppercase flex items-center gap-0.5 flex-shrink-0"
                                  title={`⚡ Ekspres: ${ord.priorityAuthorizer || ''} - ${ord.priorityReason || ''}`}
                                >
                                  <Zap className="w-2 h-2 fill-current" /> EKSPRES
                                </span>
                              )}
                              {ord.enteredByWash && (
                                <span
                                  className="text-violet-300 flex-shrink-0"
                                  title="Wprowadzone ręcznie przez myjnię (bez planowania działu)"
                                >
                                  <UserPlus className="w-2.5 h-2.5" />
                                </span>
                              )}
                            </div>
                            <div className="flex items-center justify-between text-[9px]">
                              <span className="font-bold text-sky-300 truncate">
                                {ord.category?.name}
                              </span>
                              <span
                                className="font-bold text-sky-400 flex-shrink-0 ml-1"
                                title={latestArrival ? `Najpóźniej na myjni: ${format(latestArrival, 'HH:mm')}` : undefined}
                              >⏱ {ord.durationMin}m</span>
                            </div>

                            {/* Compact action buttons (overlapping card) */}
                            {canEdit ? (
                              <div className="flex flex-col gap-1 pt-1 mt-1 border-t border-white/10">
                                {ord.status === 'PLANNED' && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleStartOrder(ord.id); }}
                                    className="py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[9px] flex items-center justify-center gap-1"
                                  >
                                    <Play className="w-2.5 h-2.5 fill-current" />
                                    ROZPOCZNIJ
                                  </button>
                                )}
                                {ord.status === 'IN_PROGRESS' && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setFinishConfirmId(ord.id); }}
                                    className="py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[9px] flex items-center justify-center gap-1 shadow-lg shadow-emerald-500/30"
                                  >
                                    <CheckCircle2 className="w-2.5 h-2.5 stroke-[3]" />
                                    GOTOWE
                                  </button>
                                )}
                                {ord.status === 'READY' && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleCompleteOrder(ord.id); }}
                                    className="py-1 rounded bg-slate-700 hover:bg-slate-600 text-emerald-300 font-bold text-[9px] flex items-center justify-center gap-1 border border-emerald-500/40"
                                  >
                                    <Check className="w-2.5 h-2.5" />
                                    WYDANE
                                  </button>
                                )}
                                <div className="flex gap-1">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setEditingOrder(ord); }}
                                    className="flex-1 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[9px] font-semibold flex items-center justify-center gap-1"
                                  >
                                    <Edit3 className="w-2.5 h-2.5" />
                                    Zmień
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(ord.id); }}
                                    className="flex-1 py-1 rounded bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 text-[9px] font-semibold flex items-center justify-center gap-1"
                                  >
                                    <Trash2 className="w-2.5 h-2.5" />
                                    Usuń
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="pt-1 mt-1 border-t border-white/10 text-center text-[9px] font-bold">
                                {ord.status === 'PLANNED' && <span className="text-amber-400">W kolejce</span>}
                                {ord.status === 'IN_PROGRESS' && <span className="text-amber-300 animate-pulse">Mycie w toku</span>}
                                {ord.status === 'READY' && <span className="text-emerald-400">Gotowe do odbioru</span>}
                                {ord.status === 'COMPLETED' && <span className="text-slate-500">Wydane</span>}
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                        {isOverdue && (
                          <div className="flex items-center gap-1 text-[9px] font-black text-rose-400 uppercase tracking-wider mb-1 bg-rose-950/60 px-1.5 py-0.5 rounded border border-rose-500/30">
                            <AlertTriangle className="w-3 h-3" />
                            <span>ZALEGŁA GODZINA</span>
                          </div>
                        )}

                        {/* Top Plate & Department */}
                        <div className="flex items-start justify-between gap-1 mb-1.5">
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono font-black text-sm sm:text-base tracking-wider bg-black/40 px-2 py-0.5 rounded border border-white/10 flex items-center gap-1">
                                {ord.isPriority && <span className="text-amber-400">⚡</span>}
                                {ord.licensePlate}
                              </span>
                              <span 
                                className="text-[9px] font-black px-1.5 py-0.5 rounded text-white"
                                style={{ backgroundColor: ord.department?.color || '#3b82f6' }}
                              >
                                {ord.department?.code}
                              </span>
                            </div>
                            <p className="text-[11px] sm:text-xs font-bold mt-0.5 truncate max-w-[170px]">
                              {ord.carModel || 'Pojazd salonowy'}
                            </p>
                          </div>

                          <div className="flex items-center gap-1 flex-wrap justify-end">
                            {ord.isPriority && (
                              <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-gradient-to-r from-amber-500 to-red-500 text-slate-950 uppercase flex items-center gap-0.5 shadow animate-pulse" title={`⚡ Zlecenie Ekspresowe: ${ord.priorityAuthorizer || ''} - ${ord.priorityReason || ''}`}>
                                <Zap className="w-2.5 h-2.5 fill-current" />
                                EKSPRES
                              </span>
                            )}
                            {ord.enteredByWash && (
                              <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-violet-500 text-white uppercase flex items-center gap-0.5 shadow" title="Auto wprowadzone ręcznie przez myjnię (dział nie zaplanował mycia)">
                                <UserPlus className="w-2.5 h-2.5" />
                                WPIS MYJNI
                              </span>
                            )}
                            {ord.isOverCapacity && (
                              <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-rose-500 text-white uppercase" title="Dodano ponad limit">
                                +OVER
                              </span>
                            )}
                            {ord.scheduledStartTime && 
                              (new Date(ord.scheduledStartTime).getTime() + (ord.durationMin || 30) * 60000) > new Date(ord.targetReadyTime).getTime() && 
                              !isCompleted && (
                              <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-rose-600 text-white uppercase flex items-center gap-0.5 shadow animate-pulse" title="Mycie zaplanowane po terminie wydania!">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                OPÓŹNIENIE
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Priority Express audit callout */}
                        {ord.isPriority && (
                          <div className="mb-1.5 px-2 py-1 rounded-lg bg-amber-950/70 border border-amber-500/40 text-[10px] text-amber-200">
                            <span className="text-amber-300 font-bold">⚡ Zatwierdził: </span>
                            <span className="font-semibold text-white">{ord.priorityAuthorizer || 'Brak'}</span>
                            {ord.priorityReason && (
                              <div className="text-[9px] text-amber-100/90 italic truncate">
                                Powód: {ord.priorityReason}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Service and Deadline */}
                        <div className="text-[11px] space-y-0.5 mb-2">
                          <p className="text-slate-300 font-medium truncate text-[10px] sm:text-[11px]">
                            {ord.category?.name}
                          </p>
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="font-bold text-sky-400">
                              ⏱ {ord.durationMin}m
                            </span>
                            <span className="font-bold text-amber-300">
                              Cel: {format(new Date(ord.targetReadyTime), 'd MMM HH:mm', { locale: pl })}
                            </span>
                          </div>
                          {latestArrival && (
                            <div className="flex items-center justify-between gap-1 text-[10px] pt-0.5">
                              <span className="text-slate-400 font-semibold">Na myjni do:</span>
                              <span className="font-mono font-bold text-sky-300">
                                {format(latestArrival, 'HH:mm')}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Note from wash bay */}
                        {ord.notes && (
                          <div className="mb-2 px-2 py-1.5 rounded-lg bg-sky-950/60 border border-sky-500/30 text-[10px] text-sky-200 flex items-start gap-1.5">
                            <FileText className="w-3 h-3 text-sky-400 flex-shrink-0 mt-0.5" />
                            <span className="leading-snug break-words">{ord.notes}</span>
                          </div>
                        )}

                        {/* Touch Action Buttons (Tablet-Friendly for wash staff, read-only status for others) */}
                        {canEdit ? (
                          <div className="grid grid-cols-2 gap-1 pt-1.5 border-t border-white/10">
                            {ord.status === 'PLANNED' && (
                              <button
                                onClick={() => handleStartOrder(ord.id)}
                                className="col-span-2 py-2 sm:py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-all flex items-center justify-center gap-1 shadow"
                              >
                                <Play className="w-3.5 h-3.5 fill-current" />
                                <span>ROZPOCZNIJ</span>
                              </button>
                            )}

                            {ord.status === 'IN_PROGRESS' && (
                              <button
                                onClick={() => setFinishConfirmId(ord.id)}
                                className="col-span-2 py-2.5 sm:py-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/30 animate-bounce-slow"
                              >
                                <CheckCircle2 className="w-4 h-4 stroke-[3]" />
                                <span>GOTOWE / ZREALIZOWANO</span>
                              </button>
                            )}

                            {ord.status === 'READY' && (
                              <button
                                onClick={() => handleCompleteOrder(ord.id)}
                                className="col-span-2 py-1.5 sm:py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 font-bold text-xs transition-all flex items-center justify-center gap-1 border border-emerald-500/40"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>WYDANE Z MYJNI</span>
                              </button>
                            )}

                            <button
                              onClick={() => openNoteModal(ord)}
                              className="py-1 rounded-lg bg-slate-800 hover:bg-sky-900/60 text-slate-300 hover:text-sky-300 text-[10px] font-semibold transition-colors flex items-center justify-center gap-1"
                            >
                              <FileText className="w-3 h-3" />
                              <span>Notatka</span>
                            </button>

                            <button
                              onClick={() => setEditingOrder(ord)}
                              className="py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-semibold transition-colors flex items-center justify-center gap-1"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Zmień</span>
                            </button>

                            <button
                              onClick={() => setDeleteConfirmId(ord.id)}
                              className="col-span-2 py-1 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 text-[10px] font-semibold transition-colors flex items-center justify-center gap-1"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Usuń</span>
                            </button>
                          </div>
                        ) : (
                          <div className="pt-1.5 border-t border-white/10 text-center py-1.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs font-bold">
                            {ord.status === 'PLANNED' && <span className="text-amber-400">Oczekuje na mycie</span>}
                            {ord.status === 'IN_PROGRESS' && <span className="text-amber-300 animate-pulse">W trakcie mycia</span>}
                            {ord.status === 'READY' && <span className="text-emerald-400">Gotowe do odbioru</span>}
                            {ord.status === 'COMPLETED' && <span className="text-slate-400">Wydane</span>}
                          </div>
                        )}

                          </>
                        )}
                        </div>

                      </div>
                    );
                  })}
            </div>
          </div>

      </div>

      {/* Drag Ghost – follows the finger while dragging */}
      {dragOrderId && dragPos && (() => {
        const draggedOrder = orders.find(o => o.id === dragOrderId);
        if (!draggedOrder) return null;
        return (
          <div
            className="fixed z-[80] pointer-events-none w-48 sm:w-56"
            style={{ left: dragPos.x + 12, top: dragPos.y - 20 }}
          >
            <div className="bg-slate-800 border-2 border-sky-400 rounded-xl p-2.5 shadow-2xl opacity-95">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-mono font-black text-xs text-white bg-black/40 px-2 py-0.5 rounded border border-white/10">
                  {draggedOrder.licensePlate}
                </span>
                <span
                  className="text-[9px] font-black px-1.5 py-0.5 rounded text-white"
                  style={{ backgroundColor: draggedOrder.department?.color || '#3b82f6' }}
                >
                  {draggedOrder.department?.code}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 truncate mt-1">
                {draggedOrder.carModel || 'Pojazd salonowy'} • {draggedOrder.category?.name}
              </p>
              {dropTarget && (
                <p className="text-[10px] font-bold text-emerald-400 mt-1">
                  {format(new Date(`${currentDate}T${dropTarget.time}`), 'HH:mm', { locale: pl })}
                </p>
              )}
            </div>
          </div>
        );
      })()}

      {/* Cancel Order Confirmation Modal (audyt: powód + autor) */}
      {cancelTarget && (
        <div className="planner-dialog fixed inset-0 z-[110] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-700 rounded-3xl p-6 sm:p-7 w-full max-w-md shadow-2xl space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto mb-3">
                <AlertOctagon className="w-8 h-8" />
              </div>
              <h3 className="font-extrabold text-lg text-white">Anulować zlecenie?</h3>
              <p className="text-sm font-bold text-rose-300 mt-1">{cancelTarget.licensePlate}</p>
              <p className="text-xs text-slate-400 mt-1">
                Zlecenie zostanie oznaczone jako <strong>ANULOWANE</strong> i zniknie z grafiku oraz obłożenia. Historia zostanie zachowana.
              </p>
            </div>

            <label className="block text-left">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Powód anulowania (opcjonalnie)</span>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                maxLength={500}
                rows={2}
                placeholder="np. Wydanie klienta odwołane, auto nie wymaga mycia"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-rose-500 resize-none"
              />
            </label>

            {cancelError && (
              <p role="alert" className="rounded-xl border border-rose-700 bg-rose-950/50 p-3 text-xs font-bold text-rose-200">
                {cancelError}
              </p>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={cancelPending}
                onClick={() => setCancelTarget(null)}
                className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs disabled:opacity-50"
              >
                Wróć
              </button>
              <button
                type="button"
                disabled={cancelPending}
                onClick={handleConfirmCancel}
                className="flex-1 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs shadow-lg shadow-rose-600/30 disabled:opacity-50"
              >
                {cancelPending ? 'Anulowanie...' : 'Tak, anuluj'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tablet-Friendly In-App Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="planner-dialog fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 sm:p-7 w-full max-w-sm shadow-2xl text-center animate-in fade-in zoom-in duration-150">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto mb-4">
              <AlertOctagon className="w-8 h-8" />
            </div>
            <h3 className="font-extrabold text-lg text-white mb-1">Usunąć to zlecenie?</h3>
            <p className="text-xs text-slate-400 mb-6">
              Pojazd zostanie usunięty z planera myjni.
            </p>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors"
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="flex-1 py-3.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-600/30 transition-all"
              >
                Tak, Usuń
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Finish Order Confirmation Modal */}
      {releaseOrderSnapshot && (
        <ReleaseOrderDialog
          order={releaseOrderSnapshot}
          employees={employees}
          onClose={() => setReleaseOrderSnapshot(null)}
          onReleased={() => {
            setReleaseOrderSnapshot(null);
            fetchDayOrders();
          }}
        />
      )}
      {finishConfirmId && (
        <div className="planner-dialog fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-emerald-700 rounded-3xl p-6 sm:p-7 w-full max-w-sm shadow-2xl text-center animate-in fade-in zoom-in duration-150">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="font-extrabold text-lg text-white mb-1">Potwierdź umycie pojazdu</h3>
            {orderForConfirm && (
              <p className="text-sm font-bold text-emerald-300 mb-1">
                {orderForConfirm.licensePlate}
                {orderForConfirm.carModel ? <span className="text-slate-400 font-normal"> • {orderForConfirm.carModel}</span> : null}
              </p>
            )}
            {orderForConfirm?.isPriority && (
              <div className="mb-3 px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold inline-flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 fill-current text-amber-400" />
                <span>Zlecenie Ekspresowe ({orderForConfirm.priorityAuthorizer || 'Wrzutka'})</span>
              </div>
            )}
            <p className="text-xs text-slate-400 mb-4">
              Zlecenie zostanie oznaczone jako zrealizowane.
            </p>

            <div className="text-left mb-5">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Notatka z myjni (opcjonalnie)
              </label>
              <textarea
                value={finishNote}
                onChange={(e) => setFinishNote(e.target.value)}
                placeholder="np. Przekazano klientowi w salonie, uwagi do lakieru..."
                rows={2}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 resize-none"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setFinishConfirmId(null)}
                className="flex-1 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors"
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={handleConfirmFinish}
                className="flex-1 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 transition-all"
              >
                Tak, Zrealizowano
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Note Edit Modal */}
      {noteEditOrderId && (() => {
        const ord = [...orders, ...pastUnfinishedOrders].find(o => o.id === noteEditOrderId);
        return (
          <div className="planner-dialog fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-sky-700 rounded-3xl p-6 sm:p-7 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-150">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-sky-500/10 text-sky-400 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-lg text-white mb-1">Notatka z myjni</h3>
                  <p className="text-sm font-bold text-sky-300">
                    {ord?.licensePlate}
                    {ord?.carModel ? <span className="text-slate-400 font-normal"> • {ord.carModel}</span> : null}
                  </p>
                </div>
              </div>

              <textarea
                value={noteEditText}
                onChange={(e) => setNoteEditText(e.target.value)}
                placeholder="np. Uwagi z myjni: co zrobiono, przekazano do działu..."
                rows={4}
                autoFocus
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-sky-500 resize-none mb-5"
              />

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setNoteEditOrderId(null)}
                  className="flex-1 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors"
                >
                  Anuluj
                </button>
                <button
                  type="button"
                  onClick={handleSaveNote}
                  className="flex-1 py-3.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-lg shadow-sky-600/30 transition-all"
                >
                  Zapisz notatkę
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Drag & Drop Reschedule Confirmation Modal */}
      {dropConfirm && (
        <div className="planner-dialog fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-sky-700 rounded-3xl p-6 sm:p-7 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-sky-500/10 text-sky-400 flex items-center justify-center flex-shrink-0">
                <CalendarClock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-lg text-white mb-1">Przenieść zlecenie?</h3>
                <p className="text-sm font-bold text-sky-300">
                  {dropConfirm.order.licensePlate}
                  {dropConfirm.order.carModel ? <span className="text-slate-400 font-normal"> • {dropConfirm.order.carModel}</span> : null}
                </p>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2.5 mb-5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Nowa data</span>
                <span className="font-bold text-white capitalize">
                  {format(new Date(`${dropConfirm.newDate}T12:00`), 'EEEE, d MMM', { locale: pl })}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Nowa godzina</span>
                <span className="font-bold text-sky-300 font-mono">{dropConfirm.newTime}</span>
              </div>
              <p className="text-xs text-slate-400">Przypisani wykonawcy pozostaną bez zmian.</p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setDropConfirm(null)}
                className="flex-1 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors"
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={handleConfirmMove}
                className="flex-1 py-3.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-lg shadow-sky-600/30 transition-all"
              >
                Zmień
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit / Schedule Order Modal */}
      {employeeOrder && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="employee-dialog-title" className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
            <h2 id="employee-dialog-title" className="text-lg font-bold text-white">Wykonawcy: {employeeOrder.licensePlate}</h2>
            <fieldset disabled={employeePending} className="mt-3 grid max-h-[50dvh] grid-cols-2 gap-2 overflow-auto">
              <legend className="mb-2 text-xs text-slate-300">Wybierz jedną lub więcej osób, albo pozostaw bez wykonawców.</legend>
              {[...employees, ...(employeeOrder.assignedEmployees?.length ? employeeOrder.assignedEmployees.map((a: any) => a.employee) : [employeeOrder.assignedEmployee]).filter((e: any) => e && !employees.some(active => active.id === e.id))].map(e => (
                <label key={e.id} className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 p-2 text-xs font-bold text-white">
                  <input type="checkbox" checked={employeeSelection.includes(e.id)} onChange={event => setEmployeeSelection(ids => event.target.checked ? [...ids, e.id] : ids.filter(id => id !== e.id))} />
                  {e.name}{!e.isActive ? ' (nieaktywny)' : !activeEmpIds.includes(e.id) && ' (poza zmianą)'}
                </label>
              ))}
            </fieldset>
            {employeeError && <p role="alert" className="mt-3 text-sm font-bold text-rose-300">{employeeError}</p>}
            <div className="mt-4 flex gap-2">
              <button type="button" disabled={employeePending} onClick={() => setEmployeeOrder(null)} className="flex-1 rounded-xl bg-slate-800 p-3 text-sm font-bold text-white">Anuluj</button>
              <button type="button" disabled={employeePending} onClick={async () => {
                if (employeePending) return;
                setEmployeePending(true);
                setEmployeeError('');
                try {
                  const res = await setOrderEmployees(employeeOrder.id, {
                    assignedEmployeeIds: employeeSelection,
                    expectedUpdatedAt: new Date(employeeOrder.updatedAt).toISOString(),
                  });
                  if (!res.success) {
                    setEmployeeError(res.error || 'Nie udało się zapisać wykonawców.');
                    return;
                  }
                  setEmployeeOrder(null);
                  await fetchDayOrders();
                } catch {
                  setEmployeeError('Błąd połączenia. Spróbuj ponownie.');
                } finally {
                  setEmployeePending(false);
                }
              }} className="flex-1 rounded-xl bg-sky-500 p-3 text-sm font-bold text-white disabled:opacity-50">{employeePending ? 'Zapisywanie...' : 'Zapisz'}</button>
            </div>
          </div>
        </div>
      )}

      {editingOrder && (
        <div className="planner-dialog fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-4 sm:p-5 w-full max-w-md shadow-2xl animate-in fade-in zoom-in duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                  {canEdit ? <Edit3 className="w-4 h-4 text-sky-400" /> : <Eye className="w-4 h-4 text-sky-400" />}
                  {canEdit ? `Harmonogram: ${editingOrder.licensePlate}` : `Podgląd: ${editingOrder.licensePlate}`}
                  {editingOrder.isPriority && (
                    <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-amber-500 text-slate-950 uppercase flex items-center gap-1 shadow">
                      <Zap className="w-2.5 h-2.5 fill-current" /> EKSPRES
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Termin wydania: <strong className="text-amber-300">{format(new Date(editingOrder.targetReadyTime), 'd MMMM, HH:mm', { locale: pl })}</strong>
                </p>
              </div>
              <button
                onClick={() => setEditingOrder(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {canEdit && (
              <div className="mb-3 flex flex-wrap gap-2">
                {['PLANNED', 'IN_PROGRESS', 'READY'].includes(editingOrder.status) && (
                  <button type="button" className="min-h-11 rounded-lg bg-sky-500 px-3 text-xs font-bold text-white" onClick={() => {
                    const order = editingOrder;
                    setEditingOrder(null);
                    if (order.status === 'PLANNED') handleStartOrder(order.id);
                    if (order.status === 'IN_PROGRESS') setFinishConfirmId(order.id);
                    if (order.status === 'READY') handleCompleteOrder(order.id);
                  }}>{editingOrder.status === 'PLANNED' ? 'Rozpocznij' : editingOrder.status === 'IN_PROGRESS' ? 'Gotowe' : 'Wydane'}</button>
                )}
                {editingOrder.status !== 'COMPLETED' && <button type="button" className="min-h-11 rounded-lg bg-slate-800 px-3 text-xs font-bold text-sky-300" onClick={() => {
                  const ids = (editingOrder.assignedEmployees || []).map((a: any) => a.employeeId);
                  setEmployeeSelection(ids.length ? ids : editingOrder.assignedEmployeeId ? [editingOrder.assignedEmployeeId] : []);
                  setEmployeeError('');
                  setEmployeeOrder(editingOrder);
                  setEditingOrder(null);
                }}>Wykonawcy</button>}
                <button type="button" className="min-h-11 rounded-lg bg-slate-800 px-3 text-xs font-bold text-sky-300" onClick={() => { openNoteModal(editingOrder); setEditingOrder(null); }}>Notatka</button>
                <button type="button" className="min-h-11 rounded-lg bg-slate-800 px-3 text-xs font-bold text-rose-300" onClick={() => { setDeleteConfirmId(editingOrder.id); setEditingOrder(null); }}>Usuń</button>
              </div>
            )}

            {/* Express Priority Banner in Modal - Ultra compact */}
            {editingOrder.releaseLogs?.length > 0 && (
              <section aria-label="Historia wydania" className="mb-4 space-y-3 rounded-2xl border border-emerald-800 bg-emerald-950/20 p-3">
                <h4 className="text-sm font-extrabold text-emerald-300">Historia wydania</h4>
                {editingOrder.releaseLogs.map((log: {
                  id: string; eventType: string; employeeName: string; sessionName: string;
                  createdAt: string | Date; checklistMarkdown: string | null;
                }) => (
                  <div key={log.id} className="text-xs text-slate-300">
                    <p className="font-bold text-white">{log.eventType === 'CHECKLIST_CONFIRMED' ? 'Potwierdzono wykonanie checklisty' : 'Pojazd wydany'}</p>
                    <p>{log.employeeName} · {format(new Date(log.createdAt), 'dd.MM.yyyy HH:mm:ss')}</p>
                    <p className="text-slate-400">Konto: {log.sessionName}</p>
                    {log.checklistMarkdown && (
                      <details className="mt-2">
                        <summary className="cursor-pointer font-bold text-sky-400">Potwierdzona treść checklisty</summary>
                        <div className="mt-2"><ChecklistMarkdown markdown={log.checklistMarkdown} /></div>
                      </details>
                    )}
                  </div>
                ))}
              </section>
            )}
            {editingOrder.isPriority && (
              <div className="mb-3 px-3 py-2 rounded-xl bg-gradient-to-r from-amber-950/80 via-slate-900 to-amber-950/70 border border-amber-500/80 text-amber-200 text-xs shadow-md">
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1.5 font-black text-amber-300 text-[11px] uppercase">
                    <Zap className="w-3.5 h-3.5 fill-amber-400 text-amber-400 animate-pulse flex-shrink-0" />
                    <span>Zlecenie EKSPRES</span>
                  </div>
                  <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-amber-500 text-slate-950 uppercase">
                    PRIORYTET
                  </span>
                </div>
                <div className="text-[10px] text-slate-300 leading-tight space-y-0.5">
                  <p>Zatwierdził: <strong className="text-white">{editingOrder.priorityAuthorizer || 'Brak'}</strong></p>
                  {editingOrder.priorityReason && (
                    <p className="italic text-amber-200/90 truncate">Powód: {editingOrder.priorityReason}</p>
                  )}
                </div>
              </div>
            )}

            {/* Delay Warning Banner in Modal */}
            {isModalScheduleLate && (
              <div className="mb-3 p-2.5 rounded-xl bg-rose-950/80 border border-rose-500 text-rose-200 text-xs space-y-1 shadow-lg animate-pulse">
                <div className="flex items-center gap-1.5 font-black text-rose-300 text-[11px]">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                  <span>Uwaga: Zakończenie mycia po terminie wydania!</span>
                </div>
                <p className="text-[10px] text-rose-200/90 leading-tight">
                  Usługa <strong>{editingOrder.category?.name || 'Mycie'}</strong> trwa <strong>{modalDuration} min</strong>.
                  Plan: <strong>{modalScheduleTime} – {(() => {
                    try {
                      const [h, m] = modalScheduleTime.split(':').map(Number);
                      const baseDate = new Date(modalScheduleDate);
                      baseDate.setHours(h, m + modalDuration, 0, 0);
                      return format(baseDate, 'HH:mm');
                    } catch {
                      return '—';
                    }
                  })()}</strong>. Gotowość działu: <strong>{format(new Date(editingOrder.targetReadyTime), 'HH:mm', { locale: pl })}</strong>.
                </p>
              </div>
            )}

            {!canEdit ? (
              /* Read-only order preview for departments */
              <div className="space-y-3">
                <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 space-y-2.5">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[9px] uppercase font-bold">Pojazd:</span>
                      <span className="font-mono font-bold text-white text-xs">{editingOrder.licensePlate}</span>
                      <p className="text-slate-300 text-[10px] truncate">{editingOrder.carModel || '—'}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px] uppercase font-bold">Dział:</span>
                      <span className="font-bold text-white text-xs">{editingOrder.department?.name}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px] uppercase font-bold">Usługa:</span>
                      <span className="font-bold text-white text-xs truncate block">{editingOrder.category?.name}</span>
                      <p className="text-sky-400 font-bold text-[9px]">⏱ {editingOrder.durationMin} min</p>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px] uppercase font-bold">Status:</span>
                      <span className={`font-bold text-xs ${
                        editingOrder.status === 'CANCELLED' ? 'text-rose-400' : 'text-emerald-400'
                      }`}>
                        {editingOrder.status === 'PLANNED' && 'W kolejce'}
                        {editingOrder.status === 'IN_PROGRESS' && 'W trakcie mycia'}
                        {editingOrder.status === 'READY' && 'Gotowe'}
                        {editingOrder.status === 'COMPLETED' && 'Wydane'}
                        {editingOrder.status === 'CANCELLED' && 'Anulowane'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px] uppercase font-bold">Odbiór:</span>
                      <span className="font-bold text-amber-300 text-[11px]">
                        {format(new Date(editingOrder.targetReadyTime), 'd MMM, HH:mm', { locale: pl })}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px] uppercase font-bold">Start w planerze:</span>
                      <span className="font-bold text-sky-400 text-[11px]">
                        {editingOrder.scheduledStartTime
                          ? format(new Date(editingOrder.scheduledStartTime), 'd MMM, HH:mm', { locale: pl })
                          : 'W poczekalni'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px] uppercase font-bold">Wykonawcy:</span>
                      <span className="font-bold text-white text-xs">
                        {(editingOrder.assignedEmployees || []).map((a: any) => a.employee?.name).filter(Boolean).join(', ') || 'Nieprzypisani'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px] uppercase font-bold">Zgłaszający:</span>
                      <span className="font-bold text-slate-300 text-xs">{editingOrder.contactPerson || '—'}</span>
                    </div>
                    {editingOrder.isPriority && (
                      <div className="col-span-2 p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px]">
                        <span className="block text-[9px] uppercase font-black text-amber-400">Priorytet Ekspres:</span>
                        <p className="font-semibold text-white">
                          Zatwierdził: <strong>{editingOrder.priorityAuthorizer || '—'}</strong>
                        </p>
                        {editingOrder.priorityReason && (
                          <p className="text-[10px] text-amber-200/90 italic mt-0.5 truncate">
                            Powód: {editingOrder.priorityReason}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {editingOrder.status === 'CANCELLED' && (
                    <div className="pt-2 border-t border-rose-900/60">
                      <span className="text-rose-400 block text-[9px] uppercase font-bold mb-0.5">Anulowane:</span>
                      <p className="text-rose-200 text-xs font-semibold">
                        {editingOrder.cancelledBy || 'brak danych'}
                        {editingOrder.cancelledAt ? ` • ${format(new Date(editingOrder.cancelledAt), 'd MMM, HH:mm', { locale: pl })}` : ''}
                      </p>
                      {editingOrder.cancelReason && (
                        <p className="text-rose-300/80 text-[11px] italic mt-0.5">Powód: {editingOrder.cancelReason}</p>
                      )}
                    </div>
                  )}

                  {editingOrder.notes && (
                    <div className="pt-2 border-t border-slate-800">
                      <span className="text-slate-400 block text-[9px] uppercase font-bold mb-0.5">Uwagi:</span>
                      <p className="text-slate-200 text-xs italic bg-slate-900 p-2 rounded-xl border border-slate-800">
                        {editingOrder.notes}
                      </p>
                    </div>
                  )}
                </div>

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setEditingOrder(null)}
                    className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors"
                  >
                    Zamknij Podgląd
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                
                {/* Date Selection (Dziś / Jutro / Pojutrze + Date Input) */}
                <div className="bg-slate-950 p-2.5 sm:p-3 rounded-2xl border border-slate-800 space-y-1.5">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    1. Dzień Realizacji Mycia
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setModalScheduleDate(format(new Date(), 'yyyy-MM-dd'))}
                      className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all ${
                        modalScheduleDate === format(new Date(), 'yyyy-MM-dd')
                          ? 'bg-sky-500 text-white shadow'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      Dziś
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalScheduleDate(format(addDays(new Date(), 1), 'yyyy-MM-dd'))}
                      className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all ${
                        modalScheduleDate === format(addDays(new Date(), 1), 'yyyy-MM-dd')
                          ? 'bg-sky-500 text-white shadow'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      Jutro
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalScheduleDate(format(addDays(new Date(), 2), 'yyyy-MM-dd'))}
                      className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all ${
                        modalScheduleDate === format(addDays(new Date(), 2), 'yyyy-MM-dd')
                          ? 'bg-sky-500 text-white shadow'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      Pojutrze
                    </button>
                    <input
                      type="date"
                      value={modalScheduleDate}
                      onChange={(e) => setModalScheduleDate(e.target.value)}
                      className="px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-bold focus:border-sky-500"
                    />
                  </div>
                </div>

                <fieldset>
                  <legend className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">2. Wykonawcy mycia</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {[...employees, ...(editingOrder.assignedEmployees || []).map((a: any) => a.employee).filter((e: any) => e && !employees.some(active => active.id === e.id))].map(e => (
                      <label key={e.id} className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 p-2 text-xs font-bold text-white">
                        <input type="checkbox" checked={modalEmployeeIds.includes(e.id)} onChange={event => setModalEmployeeIds(ids => event.target.checked ? [...ids, e.id] : ids.filter(id => id !== e.id))} />
                        {e.name}{!e.isActive ? ' (nieaktywny)' : !activeEmpIds.includes(e.id) && ' (poza zmianą)'}
                      </label>
                    ))}
                  </div>
                </fieldset>

                {/* Time Selection */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Godzina Startu
                      </label>
                      <button
                        type="button"
                        onClick={() => setModalScheduleTime(getRoundedCurrentTime(30))}
                        className="text-[9px] font-bold text-sky-400 hover:text-sky-300 px-1 py-0.5 rounded bg-sky-500/15"
                      >
                        Teraz
                      </button>
                    </div>
                    <input
                      type="time"
                      value={modalScheduleTime}
                      onChange={(e) => setModalScheduleTime(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm font-bold focus:outline-none focus:border-sky-500"
                    />
                    {/* Quick time helpers */}
                    <div className="flex items-center gap-1 mt-1.5">
                      <button
                        type="button"
                        onClick={() => setModalScheduleTime(getRoundedCurrentTime(30))}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold"
                      >
                        Teraz
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const [h, m] = (modalScheduleTime || getRoundedCurrentTime(30)).split(':').map(Number);
                          const d = new Date();
                          d.setHours(h, m + 30, 0, 0);
                          setModalScheduleTime(format(d, 'HH:mm'));
                        }}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold"
                      >
                        +30m
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const [h, m] = (modalScheduleTime || getRoundedCurrentTime(30)).split(':').map(Number);
                          const d = new Date();
                          d.setHours(h + 1, m, 0, 0);
                          setModalScheduleTime(format(d, 'HH:mm'));
                        }}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold"
                      >
                        +1h
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Czas (min)
                    </label>
                    <input
                      type="number"
                      value={modalDuration}
                      onChange={(e) => setModalDuration(parseInt(e.target.value, 10) || 30)}
                      step="5"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm font-bold focus:outline-none focus:border-sky-500"
                    />
                    <span className="text-[9px] text-slate-500 mt-1 block truncate">
                      {editingOrder.category?.name}
                    </span>
                  </div>
                </div>

                <div className={`rounded-xl border p-2.5 text-[10px] ${isModalScheduleLate ? 'border-rose-500/60 bg-rose-950/40 text-rose-200' : 'border-sky-500/30 bg-sky-950/30 text-sky-200'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black uppercase tracking-wider">Najpóźniej na myjni</span>
                    <span className="font-mono font-black text-sm">
                      {modalLatestArrival ? format(modalLatestArrival, 'HH:mm') : '—'}
                    </span>
                  </div>
                  <p className="mt-0.5 text-slate-300">
                    Usługa {modalDuration} min. Auto musi być na myjni do tej godziny, aby oddać je na{' '}
                    {format(new Date(editingOrder.targetReadyTime), 'HH:mm', { locale: pl })}.
                  </p>
                </div>

                <div>
                  <label className="flex items-center gap-2 p-2 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={modalOverCapacity}
                      onChange={(e) => setModalOverCapacity(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-sky-500 focus:ring-0"
                    />
                    <span className="text-[11px] text-slate-300 font-medium">
                      Zezwól na dodanie ponad limit (Override)
                    </span>
                  </label>
                </div>

                {modalError && (
                  <p role="alert" className="rounded-xl border border-rose-700 bg-rose-950/50 p-2.5 text-[11px] font-bold text-rose-200">
                    {modalError}
                  </p>
                )}

                {canEdit && editingOrder.status !== 'COMPLETED' && editingOrder.status !== 'CANCELLED' && (
                  <button
                    type="button"
                    onClick={() => {
                      setCancelError('');
                      setCancelReason('');
                      setCancelTarget(editingOrder);
                    }}
                    className="w-full py-2 rounded-xl border border-rose-700/60 bg-rose-950/30 text-rose-300 text-[11px] font-bold hover:bg-rose-900/40 transition-colors"
                  >
                    Anuluj zlecenie
                  </button>
                )}

                <div className="flex items-center gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingOrder(null)}
                    className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs"
                  >
                    Anuluj
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!modalScheduleDate || !modalScheduleTime) {
                        setModalError('Wybierz dzień i godzinę realizacji.');
                        return;
                      }
                      const [h, m] = modalScheduleTime.split(':').map(Number);
                      if (!Number.isFinite(h) || !Number.isFinite(m)) {
                        setModalError('Nieprawidłowa godzina realizacji.');
                        return;
                      }
                      const startDate = new Date(`${modalScheduleDate}T00:00:00`);
                      if (Number.isNaN(startDate.getTime())) {
                        setModalError('Nieprawidłowa data realizacji.');
                        return;
                      }
                      startDate.setHours(h, m, 0, 0);
                      if (Number.isNaN(startDate.getTime())) {
                        setModalError('Nieprawidłowa data lub godzina realizacji.');
                        return;
                      }
                      const duration = Number(modalDuration);
                      if (!Number.isFinite(duration) || duration < 5 || duration > 600) {
                        setModalError('Czas trwania musi mieścić się w zakresie 5-600 minut.');
                        return;
                      }

                      setModalError('');
                      try {
                        const res = await scheduleOrder(editingOrder.id, {
                          scheduledStartTime: startDate.toISOString(),
                          durationMin: duration,
                          assignedEmployeeIds: modalEmployeeIds,
                          expectedUpdatedAt: new Date(editingOrder.updatedAt).toISOString(),
                          isOverCapacity: modalOverCapacity,
                        });
                        if (!res.success) {
                          setModalError(res.error || 'Nie udało się zapisać terminu.');
                          return;
                        }
                      } catch {
                        setModalError('Błąd połączenia. Spróbuj ponownie.');
                        return;
                      }

                      // If scheduled to another date, switch to that date to show the user where it landed
                      if (modalScheduleDate !== currentDate) {
                        setCurrentDate(modalScheduleDate);
                      }

                      setEditingOrder(null);
                      fetchDayOrders();
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs shadow-lg shadow-sky-500/25"
                  >
                    Zapisz Zmiany
                  </button>
                </div>

              </div>
            )}
          </div>
        </div>
      )}

      {/* Shift Start/End Confirmation Modal (prevents accidental taps on tablet) */}
      {shiftConfirmEmp && (() => {
        const emp = employees.find(e => e.id === shiftConfirmEmp.id);
        const isStarting = shiftConfirmEmp.action === 'start';
        if (!emp) return null;
        return (
          <div className="planner-dialog fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-sky-700 rounded-3xl p-6 sm:p-7 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-150 text-center">
              <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                style={{ backgroundColor: emp.color }}
              >
                <span className="text-white font-black text-lg">{emp.shortName.slice(0, 2).toUpperCase()}</span>
              </div>
              <h3 className="font-extrabold text-lg text-white mb-1">
                {isStarting ? 'Rozpocząć zmianę?' : 'Zakończyć zmianę?'}
              </h3>
              <p className="text-sm font-bold text-sky-300 mb-1">{emp.name}</p>
              {isStarting ? (
                <p className="text-xs text-slate-400 mb-6">
                  Pracownik będzie aktywny na grafiku. Standardowa zmiana trwa 8h — po 9h nastąpi automatyczna deaktywacja.
                </p>
              ) : (
                <p className="text-xs text-slate-400 mb-6">
                  Pracownik zniknie z grafiku i nie będzie mu przypisywane nowe auta.
                </p>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShiftConfirmEmp(null)}
                  className="flex-1 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors"
                >
                  Anuluj
                </button>
                <button
                  type="button"
                  onClick={confirmShiftChange}
                  className={`flex-1 py-3.5 rounded-xl font-bold text-xs shadow-lg transition-all ${
                    isStarting
                      ? 'bg-sky-600 hover:bg-sky-500 text-white shadow-sky-600/30'
                      : 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/30'
                  }`}
                >
                  {isStarting ? 'Tak, Rozpocznij' : 'Tak, Zakończ'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Quick Add Order Modal (Manual Override from Wash Bay) */}
      {quickAddPrefill && (
        <div className="planner-dialog fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-lg max-h-[90dvh] overflow-y-auto shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-sky-400" />
                Szybkie Dodanie Auta na Myjni
              </h3>
              <button
                onClick={() => setQuickAddPrefill(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-violet-500/10 border border-violet-500/40 text-[11px] text-violet-200 flex items-start gap-2">
              <UserPlus className="w-3.5 h-3.5 text-violet-400 flex-shrink-0 mt-0.5" />
              <span>
                Zlecenie zostanie oznaczone jako <strong>wprowadzone przez myjnię</strong> — trafi do raportu myć niezaplanowanych przez dział zamawiający.
              </span>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setQuickAddError('');
                const form = e.currentTarget;
                const plate = (form.elements.namedItem('qa-plate') as HTMLInputElement).value;
                const model = (form.elements.namedItem('qa-model') as HTMLInputElement).value;
                const deptId = (form.elements.namedItem('qa-dept') as HTMLSelectElement).value;
                const catId = (form.elements.namedItem('qa-cat') as HTMLSelectElement).value;
                const employeeIds = new FormData(form).getAll('qa-emp').map(String);
                const timeStr = (form.elements.namedItem('qa-time') as HTMLInputElement).value;

                if (!plate.trim()) {
                  setQuickAddError('Podaj numer rejestracyjny.');
                  return;
                }
                const [h, m] = timeStr.split(':').map(Number);
                if (!timeStr || !Number.isFinite(h) || !Number.isFinite(m)) {
                  setQuickAddError('Wybierz prawidłową godzinę startu.');
                  return;
                }
                const startDate = new Date(`${currentDate}T00:00:00`);
                if (Number.isNaN(startDate.getTime())) {
                  setQuickAddError('Nieprawidłowa data planera.');
                  return;
                }
                startDate.setHours(h, m, 0, 0);
                if (Number.isNaN(startDate.getTime())) {
                  setQuickAddError('Nieprawidłowa godzina startu.');
                  return;
                }

                const category = categories.find((c) => c.id === catId);
                if (!category) {
                  setQuickAddError('Wybierz usługę mycia.');
                  return;
                }
                const quickAddDuration = category.defaultDurationMin || 30;
                const targetDate = new Date(startDate.getTime() + quickAddDuration * 60000);

                try {
                  const res = await createOrder({
                    licensePlate: plate.toUpperCase(),
                    carModel: model,
                    carType: 'PASSENGER',
                    departmentId: deptId,
                    categoryId: catId,
                    targetReadyTime: targetDate.toISOString(),
                    scheduledStartTime: startDate.toISOString(),
                    assignedEmployeeIds: employeeIds,
                    enteredByWash: true,
                  });
                  if (!res.success) {
                    setQuickAddError(res.error || 'Nie udało się dodać zlecenia.');
                    return;
                  }
                } catch {
                  setQuickAddError('Błąd połączenia. Spróbuj ponownie.');
                  return;
                }

                setQuickAddPrefill(null);
                fetchDayOrders();
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Nr Rejestracyjny *
                  </label>
                  <input
                    name="qa-plate"
                    required
                    placeholder="KR 12345"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono font-bold uppercase focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Model
                  </label>
                  <input
                    name="qa-model"
                    placeholder="np. Omoda 5"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Dział
                  </label>
                  <select
                    name="qa-dept"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-bold"
                  >
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Usługa
                  </label>
                  <select
                    name="qa-cat"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-bold"
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.defaultDurationMin}m)</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <fieldset>
                  <legend className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Wykonawcy mycia</legend>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {employees.map(e => (
                      <label key={e.id} className="flex min-h-9 items-center gap-2 text-xs font-bold text-white">
                        <input type="checkbox" name="qa-emp" value={e.id} defaultChecked={e.id === quickAddPrefill.employeeId} />
                        {e.name}{!activeEmpIds.includes(e.id) && ' (poza zmianą)'}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Godzina Startu
                  </label>
                  <input
                    name="qa-time"
                    type="time"
                    key={`time-${quickAddPrefill.time}`}
                    defaultValue={quickAddPrefill.time || getRoundedCurrentTime(30)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono font-bold"
                  />
                </div>
              </div>

              <p className="text-[10px] text-slate-400">
                Termin gotowości zostanie wyliczony jako godzina startu + czas wybranej usługi.
              </p>

              {quickAddError && (
                <p role="alert" className="rounded-xl border border-rose-700 bg-rose-950/50 p-3 text-xs font-bold text-rose-200">
                  {quickAddError}
                </p>
              )}

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setQuickAddPrefill(null)}
                  className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs shadow-lg shadow-sky-500/25"
                >
                  Wstaw do Planera
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Daily Shift Start / Worker Selection Modal */}
      {showShiftStartModal && (
        <div className="planner-dialog fixed inset-0 z-[100] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-slate-700 rounded-3xl p-5 sm:p-7 w-full max-w-2xl shadow-2xl space-y-6 relative animate-in fade-in zoom-in duration-150">
            <button
              onClick={() => setShowShiftStartModal(false)}
              className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Header */}
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-bold mb-2">
                <Users className="w-3.5 h-3.5" />
                <span>Obsada Zmiany • {format(new Date(currentDate), 'd MMMM yyyy', { locale: pl })}</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white">
                Rozpoczęcie zmiany w planerze
              </h2>
                <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Kto stawił się dzisiaj do pracy na myjni? Zaznacz obecnych pracowników:
              </p>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800">
              <span className="text-xs font-bold text-slate-400">
                Zaznaczono: <strong className="text-sky-400 font-mono text-sm">{shiftSelectionIds.length}</strong> / {employees.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectAllShiftSelection}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
                >
                  Wszyscy
                </button>
                <button
                  type="button"
                  onClick={clearShiftSelection}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
                >
                  Wyczyść
                </button>
              </div>
            </div>

            {/* Employee Selection Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[48vh] overflow-y-auto pr-1">
              {employees.map((emp) => {
                const isSelected = shiftSelectionIds.includes(emp.id);
                return (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => toggleShiftSelection(emp.id)}
                    className={`p-3.5 sm:p-4 rounded-2xl text-left border transition-all flex items-center justify-between gap-3 group ${
                      isSelected
                        ? 'bg-sky-500/15 border-sky-500 text-white shadow-lg shadow-sky-500/10 ring-1 ring-sky-500/50'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-800/50 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm text-white shadow-md flex-shrink-0"
                        style={{ backgroundColor: emp.color }}
                      >
                        {emp.shortName.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className={`font-extrabold text-sm truncate ${isSelected ? 'text-white' : 'text-slate-300 group-hover:text-white'}`}>
                          {emp.name}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {emp.shortName} • Stanowisko
                        </p>
                      </div>
                    </div>

                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                      isSelected ? 'bg-sky-500 text-white shadow' : 'bg-slate-800 border border-slate-700 text-transparent group-hover:border-slate-600'
                    }`}>
                      <Check className="w-4 h-4" />
                    </div>
                  </button>
                );
              })}
            </div>

            {rosterError && (
              <p role="alert" className="rounded-xl border border-rose-700 bg-rose-950/50 p-3 text-xs font-bold text-rose-200">
                {rosterError}
              </p>
            )}

            {/* Modal Actions */}
            <div className="flex items-center gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowShiftStartModal(false)}
                className="flex-1 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs sm:text-sm transition-colors"
              >
                Pomiń / Tylko podgląd
              </button>
              <button
                type="button"
                onClick={handleSaveShiftModal}
                className="flex-1 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-emerald-500/25 transition-all flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Rozpocznij zmianę ({shiftSelectionIds.length})</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
