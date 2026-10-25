// Czyste funkcje pomocnicze planera - wspólne dla klienta i testów.

export const SHIFT_MAX_MS = 9 * 60 * 60 * 1000;

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
