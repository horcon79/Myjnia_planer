'use server';

import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/actions/auth';
import { SHIFT_MAX_MS } from '@/lib/planner';
import { revalidatePath } from 'next/cache';

export interface ShiftEntryDTO {
  employeeId: string;
  startedAt: string;
  endedAt: string | null;
}

function isDateKey(value: string): boolean {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Start zmiany: teraz dla dnia dzisiejszego, a dla dni przyszłych/przeszłych godzina rozpoczęcia pracy. */
function shiftStartedAt(dateKey: string, now: Date): Date {
  if (dateKey === localDateKey(now)) return now;
  const configured = new Date(`${dateKey}T07:00:00`);
  if (Number.isNaN(configured.getTime())) return now;
  return configured;
}

function toDTO(entry: { employeeId: string; startedAt: Date; endedAt: Date | null }): ShiftEntryDTO {
  return {
    employeeId: entry.employeeId,
    startedAt: entry.startedAt.toISOString(),
    endedAt: entry.endedAt ? entry.endedAt.toISOString() : null,
  };
}

export async function getShiftRoster(dateKey: string) {
  try {
    if (!await getCurrentUser()) {
      return { success: false, error: 'Brak sesji.', roster: [] as ShiftEntryDTO[] };
    }
    if (!isDateKey(dateKey)) {
      return { success: false, error: 'Nieprawidłowa data.', roster: [] as ShiftEntryDTO[] };
    }
    const entries = await prisma.shiftRoster.findMany({
      where: { dateKey },
      orderBy: { startedAt: 'asc' },
    });
    return { success: true, roster: entries.map(toDTO) };
  } catch (error) {
    console.error('getShiftRoster error:', error);
    return { success: false, error: 'Nie udało się pobrać obsady zmiany.', roster: [] as ShiftEntryDTO[] };
  }
}

/**
 * Ustawia obsadę zmiany dla danego dnia. Wspólne źródło prawdy w bazie - widoczne
 * dla tabletu myjni i wszystkich działów na ich urządzeniach.
 */
export async function setShiftRoster(dateKey: string, employeeIds: string[]) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'WASHER' && user.role !== 'ADMIN')) {
      return { success: false, error: 'Brak uprawnień. Obsadę zmiany może zmieniać tylko myjnia lub kierownik.' };
    }
    if (!isDateKey(dateKey)) {
      return { success: false, error: 'Nieprawidłowa data.' };
    }
    if (!Array.isArray(employeeIds)) {
      return { success: false, error: 'Nieprawidłowa lista pracowników.' };
    }

    const uniqueIds = Array.from(new Set(employeeIds.filter(id => typeof id === 'string' && id.trim())));
    if (uniqueIds.length > 50) {
      return { success: false, error: 'Zbyt wielu pracowników na zmianie.' };
    }

    const employees = await prisma.employee.findMany({
      where: { id: { in: uniqueIds }, isActive: true },
      select: { id: true },
    });
    const validIds = employees.map(employee => employee.id);
    const now = new Date();
    const startedAt = shiftStartedAt(dateKey, now);
    const isCurrentDay = dateKey === localDateKey(now);
    const hasExpired = (entryStartedAt: Date) =>
      isCurrentDay && now.getTime() - entryStartedAt.getTime() >= SHIFT_MAX_MS;

    const entries = await prisma.$transaction(async tx => {
      const existing = await tx.shiftRoster.findMany({ where: { dateKey } });
      const existingMap = new Map(existing.map(entry => [entry.employeeId, entry]));

      for (const employeeId of validIds) {
        const current = existingMap.get(employeeId);
        if (!current) {
          await tx.shiftRoster.create({ data: { dateKey, employeeId, startedAt } });
        } else if (current.endedAt || hasExpired(current.startedAt)) {
          // Ponowne rozpoczęcie zmiany (po zakończeniu lub po 9 h wygaśnięcia).
          await tx.shiftRoster.update({
            where: { id: current.id },
            data: { endedAt: null, startedAt },
          });
        }
      }

      for (const current of existing) {
        if (!validIds.includes(current.employeeId) && !current.endedAt) {
          await tx.shiftRoster.update({
            where: { id: current.id },
            data: { endedAt: now },
          });
        }
      }

      return tx.shiftRoster.findMany({
        where: { dateKey },
        orderBy: { startedAt: 'asc' },
      });
    });

    revalidatePath('/planner');
    return { success: true, roster: entries.map(toDTO) };
  } catch (error) {
    console.error('setShiftRoster error:', error);
    return { success: false, error: 'Nie udało się zapisać obsady zmiany.' };
  }
}
