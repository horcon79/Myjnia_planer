'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { SessionUser } from '@/actions/auth';
import { 
  getOrdersForDate, 
  updateOrderStatus, 
  scheduleOrder, 
  deleteOrder,
  createOrder,
  finishOrderWithNote,
  addOrderNote
} from '@/actions/orders';
import { 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
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
  AlertCircle, 
  Sparkles,
  Layers,
  ArrowRight,
  Target,
  X,
  AlertOctagon,
  CalendarClock,
  Move,
  FileText,
  UserPlus
} from 'lucide-react';
import { format, addDays, subDays } from 'date-fns';
import { pl } from 'date-fns/locale';

interface PlannerBoardProps {
  currentUser: SessionUser | null;
  departments: any[];
  categories: any[];
  employees: any[];
  settings: Record<string, string>;
}

export default function PlannerBoard({
  currentUser,
  departments,
  categories,
  employees,
  settings,
}: PlannerBoardProps) {
  // Current selected date
  const [currentDate, setCurrentDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [orders, setOrders] = useState<any[]>([]);
  const [pastUnfinishedOrders, setPastUnfinishedOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Active employees on shift (persisted in localStorage / session)
  const [activeEmpIds, setActiveEmpIds] = useState<string[]>(employees.map(e => e.id));

  // Shift start timestamps (ms epoch) per employee – used for auto-deactivation & elapsed time
  const [shiftStartTimes, setShiftStartTimes] = useState<Record<string, number>>({});
  // Confirmation modal for starting/ending a shift (prevents accidental taps)
  const [shiftConfirmEmp, setShiftConfirmEmp] = useState<{ id: string; action: 'start' | 'end' } | null>(null);
  // Tick for refreshing elapsed-time labels
  const [nowTick, setNowTick] = useState(0);

  // Modals and confirmation state
  const [editingOrder, setEditingOrder] = useState<any | null>(null);
  const [modalScheduleDate, setModalScheduleDate] = useState(currentDate);
  const [modalScheduleTime, setModalScheduleTime] = useState('08:00');
  const [modalDuration, setModalDuration] = useState(30);
  const [modalEmployeeId, setModalEmployeeId] = useState('');
  const [modalOverCapacity, setModalOverCapacity] = useState(false);

  // Quick Add – null = zamknięte; obiekt = otwarte z prefillem godziny i pracownika
  const [quickAddPrefill, setQuickAddPrefill] = useState<{ time: string; employeeId: string } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [finishConfirmId, setFinishConfirmId] = useState<string | null>(null);
  const [finishNote, setFinishNote] = useState('');
  const [noteEditOrderId, setNoteEditOrderId] = useState<string | null>(null);
  const [noteEditText, setNoteEditText] = useState('');
  const [showOverdueTodayPanel, setShowOverdueTodayPanel] = useState(true); // domyślnie rozwinięty

  // Drag & Drop (long-press) rescheduling state
  const [dragOrderId, setDragOrderId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ time: string; employeeId: string } | null>(null);
  const [dropConfirm, setDropConfirm] = useState<any | null>(null);
  const longPressTimer = useRef<any>(null);
  const dragRef = useRef<{ order: any; pointerId: number; startX: number; startY: number; active: boolean } | null>(null);
  const dropTargetRef = useRef<{ time: string; employeeId: string } | null>(null);

  // Long-press on empty slot cell → open Quick Add with prefilled time/employee
  const cellLongPressTimer = useRef<any>(null);
  const cellPressRef = useRef<{ pointerId: number; time: string; employeeId: string; startX: number; startY: number } | null>(null);

  // Container ref for auto-scrolling
  const timelineScrollRef = useRef<HTMLDivElement>(null);

  // Capacity Settings
  const maxCarsLimit = parseInt(settings.MAX_SIMULTANEOUS_CARS || '3', 10);
  const workStartHour = parseInt(settings.WORK_START_HOUR || '7', 10);
  const workEndHour = parseInt(settings.WORK_END_HOUR || '18', 10);

  // Timeline geometry: fixed slot height + gap so absolute card positioning aligns with slot cells
  const SLOT_HEIGHT = 74;
  const SLOT_GAP = 8;
  const SLOT_STEP = SLOT_HEIGHT + SLOT_GAP;

  // Shift length limits: standard 8h shift, auto-deactivate after 9h
  const STANDARD_SHIFT_MS = 8 * 60 * 60 * 1000;
  const AUTO_DEACTIVATE_MS = 9 * 60 * 60 * 1000;

  // Sync modal state whenever editingOrder changes
  useEffect(() => {
    if (editingOrder) {
      const d = editingOrder.scheduledStartTime
        ? format(new Date(editingOrder.scheduledStartTime), 'yyyy-MM-dd')
        : currentDate;
      const t = editingOrder.scheduledStartTime
        ? format(new Date(editingOrder.scheduledStartTime), 'HH:mm')
        : getRoundedCurrentTime(30);
      setModalScheduleDate(d);
      setModalScheduleTime(t);
      setModalDuration(editingOrder.durationMin || 30);
      setModalEmployeeId(
        editingOrder.assignedEmployeeId && activeEmpIds.includes(editingOrder.assignedEmployeeId)
          ? editingOrder.assignedEmployeeId
          : (activeEmpIds[0] || employees[0]?.id || '')
      );
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
      return schedEnd.getTime() > targetReady.getTime() || schedDate.getTime() > targetReady.getTime();
    } catch {
      return false;
    }
  }, [editingOrder, modalScheduleDate, modalScheduleTime, modalDuration]);

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

  // Polling data
  const fetchDayOrders = async () => {
    try {
      const res = await getOrdersForDate(currentDate);
      if (res.success) {
        if (res.orders) setOrders(res.orders);
        if (res.pastUnfinishedOrders) setPastUnfinishedOrders(res.pastUnfinishedOrders);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDayOrders();
    const interval = setInterval(fetchDayOrders, 6000); // Polling co 6s na tablecie
    return () => clearInterval(interval);
  }, [currentDate]);

  // Load saved shift staff on mount
  // Load shift staff + start times for the CURRENT viewed day (per-day roster)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`myjnia_shift_employees_${currentDate}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const validIds = parsed.filter((id: string) => employees.some(e => e.id === id));
          setActiveEmpIds(validIds);
        }
      } else {
        // No shift configured for this day → default: everyone is available
        setActiveEmpIds(employees.map(e => e.id));
      }

      const savedTimes = localStorage.getItem(`myjnia_shift_times_${currentDate}`);
      if (savedTimes) {
        const parsedTimes = JSON.parse(savedTimes);
        if (parsedTimes && typeof parsedTimes === 'object') {
          setShiftStartTimes(parsedTimes);
        }
      } else {
        setShiftStartTimes({});
      }
    } catch (e) {
      console.error(e);
    }
  }, [employees, currentDate]);

  // Auto-scroll to current hour when date is today
  const isToday = currentDate === format(new Date(), 'yyyy-MM-dd');

  const scrollToCurrentTime = (smooth: boolean = true) => {
    if (!isToday) return;
    const scroller = timelineScrollRef.current;
    if (!scroller) return;
    const currentSlot = getCurrentSlotString();
    const targetElement = document.getElementById(`slot-row-${currentSlot}`);
    if (!targetElement) return;

    // Pozycjonujemy bieżący slot tak, aby domyślnie widoczny był zakres ~ -2h .. +2h.
    const scrollerRect = scroller.getBoundingClientRect();
    const elRect = targetElement.getBoundingClientRect();
    const relativeTop = elRect.top - scrollerRect.top + scroller.scrollTop;
    const offset = Math.max(0, relativeTop - 4 * SLOT_STEP - 12);
    scroller.scrollTo({ top: offset, behavior: smooth ? 'smooth' : 'auto' });
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

  // Refresh "elapsed time" labels every 60s
  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Auto-deactivate employees whose shift has exceeded AUTO_DEACTIVATE_MS (9h)
  useEffect(() => {
    const checkAutoDeactivate = () => {
      const now = Date.now();
      setActiveEmpIds(prev => {
        const stillValid = prev.filter(id => {
          const start = shiftStartTimes[id];
          if (!start) return true;
          return now - start < AUTO_DEACTIVATE_MS;
        });
        if (stillValid.length !== prev.length) {
          const nextTimes: Record<string, number> = {};
          stillValid.forEach(id => {
            if (shiftStartTimes[id]) nextTimes[id] = shiftStartTimes[id];
          });
          setShiftStartTimes(nextTimes);
          try {
            localStorage.setItem(`myjnia_shift_employees_${currentDate}`, JSON.stringify(stillValid));
            localStorage.setItem(`myjnia_shift_times_${currentDate}`, JSON.stringify(nextTimes));
          } catch (e) {
            console.error(e);
          }
          return stillValid;
        }
        return prev;
      });
    };

    const interval = setInterval(checkAutoDeactivate, 60000);
    checkAutoDeactivate();
    return () => clearInterval(interval);
  }, [shiftStartTimes, currentDate]);

  // Click on employee chip → ask for confirmation (prevents accidental taps)
  const requestShiftChange = (empId: string, currentlyActive: boolean) => {
    setShiftConfirmEmp({ id: empId, action: currentlyActive ? 'end' : 'start' });
  };

  // Confirm start/end of shift (persisted per day)
  const confirmShiftChange = () => {
    if (!shiftConfirmEmp) return;
    const { id, action } = shiftConfirmEmp;

    setActiveEmpIds(prev => {
      let next: string[];
      if (action === 'start') {
        next = prev.includes(id) ? prev : [...prev, id];
      } else {
        next = prev.filter(eid => eid !== id);
      }
      try {
        localStorage.setItem(`myjnia_shift_employees_${currentDate}`, JSON.stringify(next));
      } catch (e) {
        console.error(e);
      }
      return next;
    });

    if (action === 'start') {
      setShiftStartTimes(prev => {
        const next = { ...prev, [id]: Date.now() };
        try {
          localStorage.setItem(`myjnia_shift_times_${currentDate}`, JSON.stringify(next));
        } catch (e) {
          console.error(e);
        }
        return next;
      });
    } else {
      setShiftStartTimes(prev => {
        const next = { ...prev };
        delete next[id];
        try {
          localStorage.setItem(`myjnia_shift_times_${currentDate}`, JSON.stringify(next));
        } catch (e) {
          console.error(e);
        }
        return next;
      });
    }

    setShiftConfirmEmp(null);
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
    await updateOrderStatus(orderId, 'IN_PROGRESS');
    fetchDayOrders();
  };

  const handleCompleteOrder = async (orderId: string) => {
    await updateOrderStatus(orderId, 'COMPLETED');
    fetchDayOrders();
  };

  const handleConfirmDelete = async () => {
    if (deleteConfirmId) {
      await deleteOrder(deleteConfirmId);
      setDeleteConfirmId(null);
      fetchDayOrders();
    }
  };

  const handleConfirmFinish = async () => {
    if (finishConfirmId) {
      await finishOrderWithNote(finishConfirmId, finishNote);
      setFinishNote('');
      setFinishConfirmId(null);
      fetchDayOrders();
    }
  };

  const openNoteModal = (ord: any) => {
    setNoteEditOrderId(ord.id);
    setNoteEditText(ord.notes || '');
  };

  const handleSaveNote = async () => {
    if (noteEditOrderId) {
      await addOrderNote(noteEditOrderId, noteEditText);
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
    clearLongPress();
  };

  const handleCardPointerDown = (e: React.PointerEvent, ord: any) => {
    if (ord.status === 'COMPLETED') return;
    if ((e.target as HTMLElement).closest('button')) return;

    dragRef.current = { order: ord, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, active: false };
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
      clearLongPress();
      dragRef.current = null;
    }
  };

  const handleCardPointerUp = (e: React.PointerEvent) => {
    const ref = dragRef.current;
    if (!ref || ref.pointerId !== e.pointerId) return;
    clearLongPress();
    if (!ref.active) {
      dragRef.current = null;
      setDragOrderId(null);
      setDragPos(null);
      setDropTarget(null);
    }
  };

  const handleDragMove = (e: PointerEvent) => {
    e.preventDefault();
    setDragPos({ x: e.clientX, y: e.clientY });

    const el = document.elementFromPoint(e.clientX, e.clientY);
    const cell = el?.closest('[data-drop-cell]') as HTMLElement | null;
    if (cell) {
      const time = cell.getAttribute('data-drop-time');
      const empId = cell.getAttribute('data-drop-emp');
      if (time && empId) {
        const target = { time, employeeId: empId };
        setDropTarget(target);
        dropTargetRef.current = target;
        return;
      }
    }
    setDropTarget(null);
    dropTargetRef.current = null;
  };

  const handleDragEnd = (e: PointerEvent) => {
    endDrag();
    const ref = dragRef.current;
    const target = dropTargetRef.current;
    dragRef.current = null;
    dropTargetRef.current = null;
    setDropTarget(null);
    setDragPos(null);
    setDragOrderId(null);

    if (ref && target) {
      const order = ref.order;
      const oldStart = order.scheduledStartTime ? new Date(order.scheduledStartTime) : null;
      const oldDate = oldStart ? format(oldStart, 'yyyy-MM-dd') : null;
      const oldTime = oldStart ? format(oldStart, 'HH:mm') : null;
      const changed = oldDate !== currentDate || oldTime !== target.time || order.assignedEmployeeId !== target.employeeId;
      if (changed) {
        setDropConfirm({
          order,
          newDate: currentDate,
          newTime: target.time,
          newEmployeeId: target.employeeId,
        });
      }
    }
  };

  const handleConfirmMove = async () => {
    if (!dropConfirm) return;
    const [h, m] = dropConfirm.newTime.split(':').map(Number);
    const start = new Date(dropConfirm.newDate);
    start.setHours(h, m, 0, 0);
    await scheduleOrder(dropConfirm.order.id, {
      scheduledStartTime: start.toISOString(),
      assignedEmployeeId: dropConfirm.newEmployeeId,
    });
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
    // Nie uruchamiaj, gdy naciśnięto kartę zlecenia lub przycisk
    if ((e.target as HTMLElement).closest('[data-order-card], button')) return;

    cellPressRef.current = { pointerId: e.pointerId, time: slotTime, employeeId: empId, startX: e.clientX, startY: e.clientY };
    clearCellLongPress();
    cellLongPressTimer.current = setTimeout(() => {
      const ref = cellPressRef.current;
      if (!ref || ref.pointerId !== e.pointerId) return;
      setQuickAddPrefill({ time: ref.time, employeeId: ref.employeeId });
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

    await scheduleOrder(ord.id, {
      scheduledStartTime: todayDate.toISOString(),
      durationMin: ord.durationMin || 30,
      assignedEmployeeId: ord.assignedEmployeeId || activeEmpIds[0] || employees[0]?.id,
    });

    fetchDayOrders();
  };

  // Active workers list
  const activeEmployees = useMemo(() => {
    return employees.filter(e => activeEmpIds.includes(e.id));
  }, [employees, activeEmpIds]);

  // Hours intervals based on configured working hours
  const timeSlots = useMemo(() => {
    const slots: string[] = [];
    for (let h = workStartHour; h <= workEndHour; h++) {
      slots.push(`${h.toString().padStart(2, '0')}:00`);
      if (h < workEndHour) {
        slots.push(`${h.toString().padStart(2, '0')}:30`);
      }
    }
    return slots;
  }, [workStartHour, workEndHour]);

  // Unassigned / Unscheduled orders strictly on this viewed date
  const unassignedOrders = useMemo(() => {
    return orders.filter(
      o => !o.scheduledStartTime || !o.assignedEmployeeId || (o.status === 'PLANNED' && !o.scheduledStartTime)
    );
  }, [orders]);

  // Overdue uncompleted orders on TODAY (earlier hours of today)
  const overdueOrdersToday = useMemo(() => {
    if (!isToday) return [];
    const now = new Date();
    const currentSlotMinutes = now.getHours() * 60 + now.getMinutes();

    return orders.filter(o => {
      if (!o.scheduledStartTime || o.status === 'COMPLETED' || o.status === 'READY') return false;
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

  // Column width calculations based on active employee count (1-5+)
  const columnMinWidth = activeEmployees.length >= 4 ? '185px' : '220px';
  const gridTemplate = `75px repeat(${activeEmployees.length}, minmax(${columnMinWidth}, 1fr))`;

  // Timeline geometry: fixed slot height + gap so absolute card positioning aligns with slot cells
  const columnHeight = timeSlots.length * SLOT_STEP - SLOT_GAP;

  // Card layouts: for each employee, orders spanning their duration + overlap lanes (columns)
  const cardLayouts = useMemo(() => {
    const result: Record<string, { order: any; startIdx: number; numSlots: number; lane: number; laneCount: number }[]> = {};

    activeEmployees.forEach((emp) => {
      const dayOrders = orders
        .filter(o => o.assignedEmployeeId === emp.id && o.scheduledStartTime
          && format(new Date(o.scheduledStartTime), 'yyyy-MM-dd') === currentDate)
        .map(o => {
          const start = new Date(o.scheduledStartTime).getTime();
          return { o, start, end: start + (o.durationMin || 30) * 60000 };
        })
        .sort((a, b) => a.start - b.start);

      // Group into connected components of overlapping intervals
      const comps: { start: number; end: number; items: typeof dayOrders }[] = [];
      dayOrders.forEach(it => {
        const overlapping = comps.filter(c => it.start < c.end && c.start < it.end);
        if (overlapping.length === 0) {
          comps.push({ start: it.start, end: it.end, items: [it] });
        } else {
          const main = overlapping[0];
          main.items.push(it);
          main.start = Math.min(main.start, it.start);
          main.end = Math.max(main.end, it.end);
          for (let i = 1; i < overlapping.length; i++) {
            const c = overlapping[i];
            main.items.push(...c.items);
            main.start = Math.min(main.start, c.start);
            main.end = Math.max(main.end, c.end);
            comps.splice(comps.indexOf(c), 1);
          }
        }
      });

      // Assign lanes (columns) greedily within each component
      const layouts: { order: any; startIdx: number; numSlots: number; lane: number; laneCount: number }[] = [];
      comps.forEach(c => {
        const items = [...c.items].sort((a, b) => a.start - b.start);
        const laneEnds: number[] = [];
        const laneFor: number[] = [];

        // 1) Pass 1: assign a lane to every order (track each lane's current end time)
        items.forEach(it => {
          let lane = laneEnds.findIndex(e => e <= it.start);
          if (lane === -1) {
            lane = laneEnds.length;
            laneEnds.push(it.end);
          } else {
            laneEnds[lane] = it.end;
          }
          laneFor.push(lane);
        });

        // 2) Pass 2: ALL orders in this component share the same laneCount,
        //    so overlapping cards get the same width and sit side by side.
        const laneCount = laneEnds.length;
        items.forEach((it, i) => {
          const startDate = new Date(it.start);
          const startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
          const startIdx = Math.max(0, Math.min(Math.floor(startMinutes / 30) - workStartHour * 2, timeSlots.length - 1));
          const numSlots = Math.max(1, Math.round((it.o.durationMin || 30) / 30));
          layouts.push({ order: it.o, startIdx, numSlots, lane: laneFor[i], laneCount });
        });
      });

      result[emp.id] = layouts;
    });

    return result;
  }, [orders, activeEmployees, currentDate, timeSlots, workStartHour]);

  // Which (emp, slotIdx) cells are covered by at least one card (for the "+" hint)
  const coveredCells = useMemo(() => {
    const set = new Set<string>();
    Object.entries(cardLayouts).forEach(([empId, layouts]) => {
      layouts.forEach(l => {
        const endIdx = Math.min(l.startIdx + l.numSlots, timeSlots.length);
        for (let i = l.startIdx; i < endIdx; i++) set.add(`${empId}|${i}`);
      });
    });
    return set;
  }, [cardLayouts, timeSlots.length]);

  return (
    <div className="flex-1 flex flex-col space-y-4">
      
      {/* Top Tablet Action Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 sm:p-4 shadow-xl flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        
        {/* Date Navigator */}
        <div className="flex items-center gap-1.5 sm:gap-2">
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

        {/* Shift Staff Selector (Up to 5 employees) */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mr-1">
            <Users className="w-3.5 h-3.5 text-sky-400" />
            Zmiana ({activeEmployees.length}):
          </span>
          {employees.map((emp) => {
            const isActive = activeEmpIds.includes(emp.id);
            const overShift = isActive && isOverShift(emp.id);
            const elapsed = isActive && shiftStartTimes[emp.id] ? formatElapsedTime(shiftStartTimes[emp.id]) : null;
            return (
              <button
                key={emp.id}
                onClick={() => requestShiftChange(emp.id, isActive)}
                className={`px-2.5 py-1.5 sm:py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
                  isActive
                    ? overShift
                      ? 'bg-amber-950/80 border-amber-500 text-amber-200 shadow'
                      : 'bg-slate-800 border-sky-500 text-white shadow'
                    : 'bg-slate-950/60 border-slate-800 text-slate-500 hover:text-slate-300'
                }`}
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
            );
          })}
        </div>

        {/* Capacity Indicator & Override Add Button */}
        <div className="flex items-center gap-2">
          <div className={`px-3 py-2 rounded-xl border flex items-center gap-2 text-xs font-bold ${
            currentHourLoad >= maxCarsLimit
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
              : 'bg-slate-950 border-slate-800 text-slate-300'
          }`}>
            <Layers className="w-4 h-4 text-sky-400" />
            <span>Myte: <strong className="text-white text-sm">{currentHourLoad}</strong> / {maxCarsLimit}</span>
          </div>

          <button
            onClick={() => setQuickAddPrefill({
              time: getRoundedCurrentTime(30),
              employeeId: activeEmployees[0]?.id || employees[0]?.id || '',
            })}
            className="px-3.5 py-2 sm:py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-extrabold text-xs shadow-lg shadow-sky-500/20 transition-all flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>+ DODAJ</span>
          </button>
        </div>

      </div>

      {/* RED Alert Drawer for PAST Unfinished Orders (from previous days) */}
      {isToday && pastUnfinishedOrders.length > 0 && (
        <div id="past-orders-panel" className="bg-gradient-to-r from-rose-950/90 via-red-950/80 to-slate-950 border-2 border-rose-500 rounded-3xl p-4 sm:p-5 shadow-2xl space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 font-black">
                <AlertOctagon className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-black text-rose-300 uppercase tracking-tight">
                  Niezrealizowane Auta z Poprzednich Dni ({pastUnfinishedOrders.length})
                </h3>
                <p className="text-xs text-rose-200/80">
                  Te pojazdy nie zostały umyte w wyznaczonym dniu. Przepisz je na dzisiejszy wolny slot lub oznacz jako gotowe.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {pastUnfinishedOrders.map((pOrd) => (
              <div
                key={pOrd.id}
                className="bg-slate-950/90 border border-rose-500/50 rounded-2xl p-3.5 flex flex-col justify-between shadow-lg"
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
                    onClick={() => setFinishConfirmId(pOrd.id)}
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
      )}

      {/* Alert banner for today's overdue cars (earlier hours of today) */}
      {overdueOrdersToday.length > 0 && (
        <div className="bg-gradient-to-r from-amber-950/80 via-rose-950/50 to-slate-900 border border-amber-500/50 rounded-2xl shadow-lg overflow-hidden">
          {/* Header row */}
          <div className="p-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
              <div>
                <p className="text-xs font-extrabold text-white">
                  Uwaga: {overdueOrdersToday.length} {overdueOrdersToday.length === 1 ? 'auto ma zaległą wcześniejszą godzinę' : 'auta mają zaległe wcześniejsze godziny'} na dzisiejszym grafiku!
                </p>
                <p className="text-[11px] text-amber-200">
                  Kliknij aby zobaczyć zaległe auta i wykonać akcję.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowOverdueTodayPanel(prev => !prev)}
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow whitespace-nowrap flex items-center gap-1.5"
            >
              {showOverdueTodayPanel ? 'Zwiń ↑' : `Pokaż (${overdueOrdersToday.length}) ↓`}
            </button>
          </div>

          {/* Expandable list of overdue today's orders */}
          {showOverdueTodayPanel && (
            <div className="border-t border-amber-500/30 p-3.5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 bg-slate-950/60">
              {overdueOrdersToday.map((ord) => (
                <div
                  key={ord.id}
                  className="bg-slate-900 border border-amber-500/40 rounded-2xl p-3 flex flex-col justify-between shadow"
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
                      </div>
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase whitespace-nowrap">
                        Plan: {format(new Date(ord.scheduledStartTime), 'HH:mm')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 truncate">
                      {ord.carModel || 'Pojazd'} • <span className="text-slate-400">{ord.category?.name}</span>
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 mt-2.5 pt-2 border-t border-amber-500/20">
                    <button
                      onClick={() => handleMoveToToday(ord)}
                      className="py-1.5 px-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-black text-[10px] transition-all flex items-center justify-center gap-1 shadow"
                    >
                      <CalendarClock className="w-3 h-3" />
                      Teraz
                    </button>
                    <button
                      onClick={() => setFinishConfirmId(ord.id)}
                      className="py-1.5 px-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[10px] transition-all flex items-center justify-center gap-1 shadow"
                    >
                      <CheckCircle2 className="w-3 h-3 stroke-[3]" />
                      Gotowe
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Unscheduled / Waiting Queue Bar for viewed date (if any) */}
      {unassignedOrders.length > 0 && (
        <div className="bg-gradient-to-r from-slate-900 via-sky-950/40 to-slate-900 border border-sky-500/30 rounded-2xl p-3.5 shadow-lg">
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-xs font-black uppercase tracking-wider text-sky-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-sky-400" />
              Poczekalnia aut do przydzielenia ({unassignedOrders.length})
            </h3>
            <span className="text-[11px] text-slate-400">
              Tapnij auto, aby przypisać pracownika i godzinę
            </span>
          </div>

          <div className="flex items-center gap-2.5 overflow-x-auto pb-1.5">
            {unassignedOrders.map((ord) => (
              <div
                key={ord.id}
                onClick={() => setEditingOrder(ord)}
                className="flex-shrink-0 bg-slate-950 border border-slate-700 hover:border-sky-400 p-2.5 rounded-xl cursor-pointer transition-all shadow hover:scale-102 flex items-center gap-2.5"
              >
                <div 
                  className="w-1.5 h-9 rounded-full"
                  style={{ backgroundColor: ord.department?.color || '#3b82f6' }}
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-black text-xs text-white">{ord.licensePlate}</span>
                    <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-slate-800 text-slate-300">
                      {ord.department?.code}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 truncate max-w-[130px]">{ord.category?.name}</p>
                  <p className="text-[10px] text-amber-300 font-bold">
                    Na: {format(new Date(ord.targetReadyTime), 'HH:mm')}
                  </p>
                </div>
                <button className="p-1.5 rounded-lg bg-sky-500/20 text-sky-400 hover:bg-sky-500 hover:text-white transition-colors">
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Grid: Staff Columns & Timeline (Scrollable & Auto-centered) */}
      <div 
        ref={timelineScrollRef}
        className="flex-1 bg-slate-900 border border-slate-800 rounded-3xl p-3 sm:p-5 shadow-2xl overflow-x-auto max-h-[75vh] overflow-y-auto relative"
      >
        <div className="flex items-center justify-end mb-2 text-[10px] text-slate-500 gap-4">
          <span className="flex items-center gap-1.5">
            <Plus className="w-3 h-3 text-emerald-400" />
            Przytrzymaj puste pole lub kliknij 2x, aby szybko dodać auto
          </span>
          <span className="flex items-center gap-1.5">
            <Move className="w-3 h-3 text-sky-400" />
            Przytrzymaj auto i przeciągnij, aby zmienić godzinę lub pracownika
          </span>
        </div>
        {activeEmployees.length === 0 ? (
          <div className="p-16 text-center text-slate-500">
            <Users className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            <h3 className="text-lg font-bold text-white">Brak aktywnych pracowników na zmianie</h3>
            <p className="text-xs text-slate-400 mt-1">Wybierz pracowników na pasku powyżej, aby zobaczyć grafik (do 5 osób).</p>
          </div>
        ) : (
          <div className="min-w-full">
            
            {/* Sticky Columns Header (Employees) */}
            <div 
              className="grid gap-2 sm:gap-3 mb-3 sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md pb-2 border-b border-slate-800" 
              style={{ gridTemplateColumns: gridTemplate }}
            >
              <div className="flex items-center justify-center font-bold text-[11px] uppercase tracking-wider text-slate-400 bg-slate-950 rounded-xl border border-slate-800">
                Czas
              </div>

              {activeEmployees.map((emp) => {
                // Only count active orders strictly belonging to this viewed day
                const empOrders = orders.filter((o) => {
                  if (o.assignedEmployeeId !== emp.id || o.status === 'COMPLETED') return false;
                  if (!o.scheduledStartTime) return false;
                  return format(new Date(o.scheduledStartTime), 'yyyy-MM-dd') === currentDate;
                });

                return (
                  <div
                    key={emp.id}
                    className="bg-slate-950 border border-slate-800 p-2 sm:p-3 rounded-2xl flex items-center justify-between shadow"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center font-bold text-xs text-white shadow flex-shrink-0"
                        style={{ backgroundColor: emp.color }}
                      >
                        {emp.shortName.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="truncate">
                        <h4 className="font-extrabold text-xs sm:text-sm text-white truncate">{emp.name}</h4>
                        <span className="text-[10px] text-slate-400 hidden sm:block">Stanowisko</span>
                      </div>
                    </div>

                    <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 text-sky-400 border border-slate-700 flex-shrink-0">
                      {empOrders.length}
                    </span>
                  </div>
                );
              })}

            </div>

            {/* Time Grid: fixed-height columns per employee, cards span their duration */}
            <div className="grid gap-2 sm:gap-3" style={{ gridTemplateColumns: gridTemplate }}>
              {/* Time labels column */}
              <div className="flex flex-col gap-2">
                {timeSlots.map((slot) => {
                  const currentSlot = getCurrentSlotString();
                  const isCurrentSlot = isToday && slot === currentSlot;
                  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
                  const [slotH, slotM] = slot.split(':').map(Number);
                  const isPastSlot = isToday && (slotH * 60 + slotM) < nowMinutes - 30;

                  return (
                    <div
                      key={slot}
                      id={`slot-row-${slot}`}
                      className={`flex flex-col items-center justify-center font-mono font-bold text-xs rounded-xl border transition-colors ${
                        isCurrentSlot
                          ? 'bg-sky-500 text-white border-sky-400 shadow-lg shadow-sky-500/30'
                          : 'bg-slate-950 text-slate-400 border-slate-800'
                      } ${isPastSlot ? 'opacity-85' : ''}`}
                      style={{ height: SLOT_HEIGHT }}
                    >
                      <span>{slot}</span>
                      {isCurrentSlot && (
                        <span className="text-[8px] uppercase tracking-tighter font-black bg-white/20 px-1 rounded mt-0.5">
                          TERAZ
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Employee columns */}
              {activeEmployees.map((emp) => (
                <div key={emp.id} className="group relative" style={{ height: columnHeight }}>
                  {/* Background slot cells (drop targets + long-press quick add) */}
                  {timeSlots.map((slot, slotIdx) => {
                    const currentSlot = getCurrentSlotString();
                    const isCurrentSlot = isToday && slot === currentSlot;
                    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
                    const [slotH, slotM] = slot.split(':').map(Number);
                    const isPastSlot = isToday && (slotH * 60 + slotM) < nowMinutes - 30;
                    const isCovered = coveredCells.has(`${emp.id}|${slotIdx}`);

                    return (
                      <div
                        key={slot}
                        data-drop-cell
                        data-drop-time={slot}
                        data-drop-emp={emp.id}
                        onPointerDown={(e) => handleCellPointerDown(e, slot, emp.id)}
                        onPointerMove={handleCellPointerMove}
                        onPointerUp={handleCellPointerUp}
                        onPointerCancel={handleCellPointerUp}
                        onDoubleClick={(e) => {
                          if ((e.target as HTMLElement).closest('[data-order-card], button')) return;
                          setQuickAddPrefill({ time: slot, employeeId: emp.id });
                        }}
                        className={`absolute left-0 right-0 rounded-2xl flex items-center justify-center transition-all border ${
                          dropTarget && dropTarget.time === slot && dropTarget.employeeId === emp.id
                            ? 'bg-emerald-500/20 border-emerald-400 ring-2 ring-emerald-400/60'
                            : isCurrentSlot
                            ? 'bg-slate-950/80 border-sky-500/40'
                            : 'bg-slate-950/40 border-slate-800/60 hover:bg-slate-950/80'
                        } ${isPastSlot ? 'opacity-85' : ''}`}
                        style={{ top: slotIdx * SLOT_STEP, height: SLOT_HEIGHT }}
                      >
                        {!isCovered && (
                          <span className="text-slate-700 group-hover:text-sky-400 transition-colors pointer-events-none">
                            <Plus className="w-4 h-4 opacity-40 group-hover:opacity-100" />
                          </span>
                        )}
                      </div>
                    );
                  })}

                  {/* Order cards – absolutely positioned, spanning full service duration */}
                  {(cardLayouts[emp.id] || []).map((layout) => {
                    const ord = layout.order;
                    const isReady = ord.status === 'READY';
                    const isInProgress = ord.status === 'IN_PROGRESS';
                    const isCompleted = ord.status === 'COMPLETED';
                    const laneWidth = 100 / layout.laneCount;
                    const cardTop = layout.startIdx * SLOT_STEP;
                    const cardHeight = Math.max(SLOT_HEIGHT, layout.numSlots * SLOT_STEP - SLOT_GAP);

                    // Compact layout for overlapping cards – full actions only when there's no collision
                    const isCompact = layout.laneCount > 1;
                    // Short cards (<= 2 slots) get a tight vertical layout so they fit their duration span
                    const isTight = layout.numSlots <= 2;
                    const isCondensed = isCompact || isTight;

                    // Check if this order starts earlier than current time (today) and is unfinished
                    const cardSlot = timeSlots[Math.min(layout.startIdx, timeSlots.length - 1)];
                    const [cH, cM] = cardSlot.split(':').map(Number);
                    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
                    const isOverdue = isToday && (cH * 60 + cM) < nowMinutes - 30 && !isCompleted && !isReady;

                    return (
                      <div
                        key={ord.id}
                        data-order-card
                        data-drop-cell
                        data-drop-time={cardSlot}
                        data-drop-emp={emp.id}
                        onPointerDown={(e) => handleCardPointerDown(e, ord)}
                        onPointerMove={handleCardPointerMove}
                        onPointerUp={handleCardPointerUp}
                        onPointerCancel={handleCardPointerUp}
                        onClick={() => { if (isCondensed) setEditingOrder(ord); }}
                        style={{
                          touchAction: 'none',
                          position: 'absolute',
                          top: cardTop,
                          height: cardHeight,
                          minHeight: 0,
                          overflowY: 'auto',
                          overflowX: 'hidden',
                          left: `calc(${layout.lane * laneWidth}% + ${layout.lane > 0 ? SLOT_GAP / 2 : 0}px)`,
                          width: `calc(${laneWidth}% - ${SLOT_GAP}px)`,
                          zIndex: dragOrderId === ord.id ? 30 : (isCompact ? 20 : 10),
                        }}
                        className={`rounded-xl border transition-all relative shadow select-none ${
                          isCompact ? 'overflow-hidden' : ''
                        } ${
                          dragOrderId === ord.id
                            ? 'opacity-40 ring-2 ring-sky-400 scale-95'
                            : ''
                        } ${
                          isOverdue
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
                        {isTight ? (
                          <>
                            <div className="flex items-center gap-1">
                              <span className="font-mono font-black text-[10px] leading-tight bg-black/40 px-1 py-0.5 rounded border border-white/10 truncate max-w-[92px]">
                                {ord.licensePlate}
                              </span>
                              <span
                                className="text-[8px] font-black px-1 py-0.5 rounded text-white flex-shrink-0"
                                style={{ backgroundColor: ord.department?.color || '#3b82f6' }}
                              >
                                {ord.department?.code}
                              </span>
                              <span className="ml-auto font-bold text-sky-400 text-[9px] flex-shrink-0">⏱ {ord.durationMin}m</span>
                            </div>

                            <div className="flex items-center justify-between gap-1 mt-0.5">
                              <span className="text-[9px] text-slate-300 truncate">{ord.category?.name}</span>
                              {ord.status === 'READY' && (
                                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 flex-shrink-0" />
                              )}
                            </div>

                            <div className="mt-1">
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
                            <div className="flex items-center gap-1 mb-0.5">
                              <span className="font-mono font-black text-[11px] tracking-wide bg-black/40 px-1.5 py-0.5 rounded border border-white/10 truncate">
                                {ord.licensePlate}
                              </span>
                              <span
                                className="text-[8px] font-black px-1 py-0.5 rounded text-white flex-shrink-0"
                                style={{ backgroundColor: ord.department?.color || '#3b82f6' }}
                              >
                                {ord.department?.code}
                              </span>
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
                              <span className="font-bold text-sky-400 flex-shrink-0 ml-1">⏱ {ord.durationMin}m</span>
                            </div>

                            {/* Compact action buttons (overlapping card) */}
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
                                  className="py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[9px] flex items-center justify-center gap-1"
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
                              <span className="font-mono font-black text-sm sm:text-base tracking-wider bg-black/40 px-2 py-0.5 rounded border border-white/10">
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

                          <div className="flex items-center gap-1">
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
                        </div>

                        {/* Note from wash bay */}
                        {ord.notes && (
                          <div className="mb-2 px-2 py-1.5 rounded-lg bg-sky-950/60 border border-sky-500/30 text-[10px] text-sky-200 flex items-start gap-1.5">
                            <FileText className="w-3 h-3 text-sky-400 flex-shrink-0 mt-0.5" />
                            <span className="leading-snug break-words">{ord.notes}</span>
                          </div>
                        )}

                        {/* Touch Action Buttons (Tablet-Friendly) */}
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
                            className="py-1 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 text-[10px] font-semibold transition-colors flex items-center justify-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Usuń</span>
                          </button>

                        </div>

                          </>
                        )}

                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

          </div>
        )}

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
                  {format(new Date(`${currentDate}T${dropTarget.time}`), 'HH:mm', { locale: pl })} →
                  {employees.find(e => e.id === dropTarget.employeeId)?.name}
                </p>
              )}
            </div>
          </div>
        );
      })()}

      {/* Tablet-Friendly In-App Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
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
      {finishConfirmId && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
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
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
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
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
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
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Pracownik</span>
                <span className="font-bold text-white">
                  {employees.find(e => e.id === dropConfirm.newEmployeeId)?.name || '—'}
                </span>
              </div>
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
      {editingOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-lg shadow-2xl animate-in fade-in zoom-in duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
                  <Edit3 className="w-5 h-5 text-sky-400" />
                  Harmonogram: {editingOrder.licensePlate}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Wnioskowana data wydania przez dział: <strong className="text-amber-300">{format(new Date(editingOrder.targetReadyTime), 'd MMMM, HH:mm', { locale: pl })}</strong>
                </p>
              </div>
              <button
                onClick={() => setEditingOrder(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Delay Warning Banner in Modal */}
            {isModalScheduleLate && (
              <div className="mb-4 p-3.5 rounded-2xl bg-rose-950/80 border border-rose-500 text-rose-200 text-xs space-y-1 shadow-lg animate-pulse">
                <div className="flex items-center gap-2 font-black text-rose-300">
                  <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <span>Uwaga: Data mycia późniejsza niż termin wydania pojazdu!</span>
                </div>
                <p className="text-[11px] text-rose-200/90 leading-relaxed">
                  Planowany termin mycia to <strong>{format(new Date(`${modalScheduleDate}T${modalScheduleTime}`), 'd MMMM HH:mm', { locale: pl })}</strong>, a dział wnioskował gotowość na <strong>{format(new Date(editingOrder.targetReadyTime), 'd MMMM HH:mm', { locale: pl })}</strong>.<br/>
                  W module <em>Zgłoś Mycie</em> oraz na <em>Ekranie Statusu</em> pojawi się powiadomienie o opóźnieniu.
                </p>
              </div>
            )}

            <div className="space-y-4">
              
              {/* Date Selection (Dziś / Jutro / Pojutrze + Date Input) */}
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                  1. Dzień Realizacji Mycia
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setModalScheduleDate(format(new Date(), 'yyyy-MM-dd'))}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
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
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
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
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
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
                    className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-bold focus:border-sky-500"
                  />
                </div>
              </div>

              {/* Employee Selection (Restricted to active shift staff) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  2. Przypisany Pracownik Myjni (ze zmiany)
                </label>
                <select
                  value={modalEmployeeId}
                  onChange={(e) => setModalEmployeeId(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold text-sm focus:outline-none focus:border-sky-500"
                >
                  {(activeEmployees.length > 0 ? activeEmployees : employees).map(e => (
                    <option key={e.id} value={e.id}>{e.name} ({e.shortName})</option>
                  ))}
                </select>
              </div>

              {/* Time Selection */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                      Godzina Startu
                    </label>
                    <button
                      type="button"
                      onClick={() => setModalScheduleTime(getRoundedCurrentTime(30))}
                      className="text-[10px] font-bold text-sky-400 hover:text-sky-300 px-1.5 py-0.5 rounded bg-sky-500/15"
                    >
                      Teraz ({getRoundedCurrentTime(30)})
                    </button>
                  </div>
                  <input
                    type="time"
                    value={modalScheduleTime}
                    onChange={(e) => setModalScheduleTime(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-base font-bold focus:outline-none focus:border-sky-500"
                  />
                  {/* Quick time helpers */}
                  <div className="flex items-center gap-1.5 mt-2">
                    <button
                      type="button"
                      onClick={() => setModalScheduleTime(getRoundedCurrentTime(30))}
                      className="text-[10px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold"
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
                      className="text-[10px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold"
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
                      className="text-[10px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold"
                    >
                      +1h
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Czas Trwania (min)
                  </label>
                  <input
                    type="number"
                    value={modalDuration}
                    onChange={(e) => setModalDuration(parseInt(e.target.value, 10) || 30)}
                    step="5"
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-base font-bold focus:outline-none focus:border-sky-500"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Kategoria: {editingOrder.category?.name}
                  </span>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modalOverCapacity}
                    onChange={(e) => setModalOverCapacity(e.target.checked)}
                    className="w-4 h-4 rounded text-sky-500 focus:ring-0"
                  />
                  <span className="text-xs text-slate-300 font-semibold">
                    Zezwól na dodanie ponad limit przepustowości (Override)
                  </span>
                </label>
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingOrder(null)}
                  className="flex-1 py-3.5 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs"
                >
                  Anuluj
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const [h, m] = modalScheduleTime.split(':').map(Number);
                    const startDate = new Date(modalScheduleDate);
                    startDate.setHours(h, m, 0, 0);

                    await scheduleOrder(editingOrder.id, {
                      scheduledStartTime: startDate.toISOString(),
                      durationMin: modalDuration,
                      assignedEmployeeId: modalEmployeeId,
                      isOverCapacity: modalOverCapacity,
                    });

                    // If scheduled to another date, switch to that date to show the user where it landed
                    if (modalScheduleDate !== currentDate) {
                      setCurrentDate(modalScheduleDate);
                    }

                    setEditingOrder(null);
                    fetchDayOrders();
                  }}
                  className="flex-1 py-3.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs shadow-lg shadow-sky-500/25"
                >
                  Zapisz Zmiany
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Shift Start/End Confirmation Modal (prevents accidental taps on tablet) */}
      {shiftConfirmEmp && (() => {
        const emp = employees.find(e => e.id === shiftConfirmEmp.id);
        const isStarting = shiftConfirmEmp.action === 'start';
        if (!emp) return null;
        return (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
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
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-lg shadow-2xl animate-in fade-in zoom-in duration-150">
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
                const form = e.currentTarget;
                const plate = (form.elements.namedItem('qa-plate') as HTMLInputElement).value;
                const model = (form.elements.namedItem('qa-model') as HTMLInputElement).value;
                const deptId = (form.elements.namedItem('qa-dept') as HTMLSelectElement).value;
                const catId = (form.elements.namedItem('qa-cat') as HTMLSelectElement).value;
                const empId = (form.elements.namedItem('qa-emp') as HTMLSelectElement).value;
                const timeStr = (form.elements.namedItem('qa-time') as HTMLInputElement).value;

                const [h, m] = timeStr.split(':').map(Number);
                const startDate = new Date(currentDate);
                startDate.setHours(h, m, 0, 0);

                const targetDate = new Date(startDate.getTime() + 60 * 60000);

                await createOrder({
                  licensePlate: plate.toUpperCase(),
                  carModel: model,
                  carType: 'PASSENGER',
                  departmentId: deptId,
                  categoryId: catId,
                  targetReadyTime: targetDate.toISOString(),
                  scheduledStartTime: startDate.toISOString(),
                  assignedEmployeeId: empId,
                  enteredByWash: true,
                });

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
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Pracownik Myjni (ze zmiany)
                  </label>
                  <select
                    name="qa-emp"
                    key={`emp-${quickAddPrefill.employeeId}`}
                    defaultValue={quickAddPrefill.employeeId || activeEmployees[0]?.id || employees[0]?.id}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-bold"
                  >
                    {(activeEmployees.length > 0 ? activeEmployees : employees).map(e => (
                      <option key={e.id} value={e.id}>{e.name} ({e.shortName})</option>
                    ))}
                  </select>
                </div>

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

    </div>
  );
}
