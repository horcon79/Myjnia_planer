// Czyste funkcje pomocnicze planera - wspólne dla klienta i testów.

export const SHIFT_MAX_MS = 9 * 60 * 60 * 1000;
export const DEFAULT_SERVICE_DURATION_MIN = 30;

export interface PlannerQueueCandidate {
  status: string;
  scheduledStartTime?: string | Date | null;
  assignedEmployeeId?: string | null;
}

export interface ShiftEntryLike {
  startedAt: string | Date;
  endedAt?: string | Date | null;
}

/**
 * Kolejka "Do przydzielenia" zawiera wyłącznie zlecenia zaplanowane, którym brakuje
 * terminu lub pracownika. Wydane (COMPLETED), gotowe (READY) i anulowane (CANCELLED)
 * nigdy nie mogą wrócić do tej sekcji.
 */
export function isQueueOrder(order: PlannerQueueCandidate): boolean {
  return order.status === 'PLANNED' && (!order.scheduledStartTime || !order.assignedEmployeeId);
}

/** Wpis obsady jest aktywny, dopóki nie został zakończony i nie minęło 9 h od startu. */
export function isActiveShiftEntry(entry: ShiftEntryLike, now: number = Date.now(), maxMs: number = SHIFT_MAX_MS): boolean {
  if (entry.endedAt) return false;
  const started = new Date(entry.startedAt).getTime();
  if (Number.isNaN(started)) return false;
  return now - started < maxMs;
}

export function isCancelled(order: { status: string }): boolean {
  return order.status === 'CANCELLED';
}

export interface OrderTimingLike {
  targetReadyTime?: string | Date | null;
  scheduledStartTime?: string | Date | null;
  scheduledEndTime?: string | Date | null;
  durationMin?: number | null;
}

export interface ServiceWindow {
  startMs: number;
  endMs: number;
}

export interface CapacityOrderLike extends OrderTimingLike {
  id?: string;
  licensePlate?: string;
  status?: string;
  carType?: string | null;
}

export interface SlotUsageConflict {
  order: CapacityOrderLike;
  window: ServiceWindow;
}

export interface SlotUsage {
  usedCapacity: number;
  activeOrdersCount: number;
  conflicts: SlotUsageConflict[];
}

function toTimestamp(value: string | Date | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function resolveDurationMs(
  durationMin: number | null | undefined,
  fallbackDurationMin: number,
): number {
  const candidate = Number.isFinite(durationMin) ? Number(durationMin) : fallbackDurationMin;
  return Math.max(0, candidate) * 60000;
}

/**
 * Rzeczywiste okno pracy nad zleceniem:
 * - jawne planowanie: [scheduledStartTime, scheduledEndTime ?? start + duration],
 * - zlecenie tylko z terminem gotowości: [targetReadyTime - duration, targetReadyTime].
 * Przedziały są lewostronnie domknięte, więc zlecenie kończące się o 16:00 nie zajmuje slotu 16:00–16:30.
 */
export function getOrderServiceWindow(
  order: OrderTimingLike,
  fallbackDurationMin: number = DEFAULT_SERVICE_DURATION_MIN,
): ServiceWindow | null {
  const durationMs = resolveDurationMs(order.durationMin, fallbackDurationMin);

  if (order.scheduledStartTime) {
    const startMs = toTimestamp(order.scheduledStartTime);
    if (startMs === null) return null;
    const endMs = toTimestamp(order.scheduledEndTime) ?? startMs + durationMs;
    return endMs > startMs ? { startMs, endMs } : null;
  }

  if (order.targetReadyTime) {
    const endMs = toTimestamp(order.targetReadyTime);
    if (endMs === null) return null;
    return { startMs: endMs - durationMs, endMs };
  }

  return null;
}

/** Najpóźniejszy moment przyjęcia auta, aby usługa zakończyła się na czas. */
export function getLatestArrivalTime(
  targetReadyTime: string | Date | null | undefined,
  durationMin: number | null | undefined,
  fallbackDurationMin: number = DEFAULT_SERVICE_DURATION_MIN,
): Date | null {
  const endMs = toTimestamp(targetReadyTime);
  if (endMs === null) return null;
  return new Date(endMs - resolveDurationMs(durationMin, fallbackDurationMin));
}

/** Najpóźniejszy moment przyjęcia auta wyliczony z terminu gotowości zlecenia. */
export function getOrderLatestArrivalTime(
  order: OrderTimingLike,
  fallbackDurationMin: number = DEFAULT_SERVICE_DURATION_MIN,
): Date | null {
  return getLatestArrivalTime(order.targetReadyTime, order.durationMin, fallbackDurationMin);
}

/**
 * Obłożenie stanowisk w oknie [slotStartMs, slotEndMs) - wspólne dla siatki dostępności
 * i walidacji serwerowej. Zlecenia zakończone/anulowane nie obciążają zdolności.
 */
export function computeSlotUsage(
  orders: CapacityOrderLike[],
  slotStartMs: number,
  slotEndMs: number,
  options: { deliveryCarWeight?: number; fallbackDurationMin?: number } = {},
): SlotUsage {
  const deliveryCarWeight = Number.isFinite(options.deliveryCarWeight)
    ? Number(options.deliveryCarWeight)
    : 1.5;
  const fallbackDurationMin = options.fallbackDurationMin ?? DEFAULT_SERVICE_DURATION_MIN;
  const conflicts: SlotUsageConflict[] = [];
  let usedCapacity = 0;

  for (const order of orders) {
    if (order.status === 'COMPLETED' || order.status === 'CANCELLED') continue;
    const window = getOrderServiceWindow(order, fallbackDurationMin);
    if (!window) continue;
    const overlaps = window.startMs < slotEndMs && window.endMs > slotStartMs;
    if (!overlaps) continue;

    usedCapacity += order.carType === 'DELIVERY' ? deliveryCarWeight : 1;
    conflicts.push({ order, window });
  }

  return { usedCapacity, activeOrdersCount: conflicts.length, conflicts };
}
