'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/actions/auth';
import { computeSlotUsage, getOrderServiceWindow } from '@/lib/planner';
import type { Prisma } from '@prisma/client';

const CAPACITY_SETTING_DEFAULTS: Record<string, string> = {
  MAX_SIMULTANEOUS_CARS: '3',
  DELIVERY_CAR_WEIGHT: '1.5',
  ALLOW_OVER_CAPACITY: 'true',
};

async function getCapacityConfig(tx: Prisma.TransactionClient) {
  const rows = await tx.appSetting.findMany({
    where: { key: { in: Object.keys(CAPACITY_SETTING_DEFAULTS) } },
  });
  const values: Record<string, string> = { ...CAPACITY_SETTING_DEFAULTS };
  for (const row of rows) values[row.key] = row.value;

  const maxCars = Number.parseFloat(values.MAX_SIMULTANEOUS_CARS);
  const deliveryCarWeight = Number.parseFloat(values.DELIVERY_CAR_WEIGHT);

  return {
    maxCars: Number.isFinite(maxCars) && maxCars > 0 ? maxCars : 3,
    deliveryCarWeight: Number.isFinite(deliveryCarWeight) && deliveryCarWeight > 0 ? deliveryCarWeight : 1.5,
  };
}

/**
 * Walidacja i zapis muszą odbywać się w tej samej transakcji SQLite.
 */
async function validateCapacityWindow(tx: Prisma.TransactionClient, params: {
  start: Date;
  end: Date;
  carType: string;
  excludeOrderId?: string;
}): Promise<string | null> {
  const config = await getCapacityConfig(tx);

  const existing = await tx.washOrder.findMany({
    where: {
      ...(params.excludeOrderId ? { id: { not: params.excludeOrderId } } : {}),
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
    },
    select: {
      id: true,
      licensePlate: true,
      status: true,
      carType: true,
      durationMin: true,
      scheduledStartTime: true,
      scheduledEndTime: true,
      targetReadyTime: true,
    },
  });

  const usage = computeSlotUsage(existing, params.start.getTime(), params.end.getTime(), {
    deliveryCarWeight: config.deliveryCarWeight,
  });
  const candidateWeight = params.carType === 'DELIVERY' ? config.deliveryCarWeight : 1;
  const totalWeight = usage.usedCapacity + candidateWeight;

  if (totalWeight > config.maxCars + 1e-9) {
    return `Brak wolnych stanowisk w tym terminie: zajęte ${usage.usedCapacity}/${config.maxCars}, a to auto waży ${candidateWeight}. Wybierz inny termin.`;
  }

  return null;
}

async function checkPlannerPermission() {
  const user = await getCurrentUser();
  if (!user || (user.role !== 'WASHER' && user.role !== 'ADMIN')) {
    return { allowed: false, error: 'Brak uprawnień. Tylko stanowisko myjni oraz kierownik mogą modyfikować terminarz w planerze.' };
  }
  return { allowed: true };
}

export interface CreateOrderInput {
  licensePlate: string;
  carModel?: string;
  carType: 'PASSENGER' | 'DELIVERY';
  departmentId: string;
  categoryId: string;
  targetReadyTime: string; // ISO string
  notes?: string;
  contactPerson?: string;
  scheduledStartTime?: string; // Optional direct slot
  assignedEmployeeId?: string;
  assignedEmployeeIds?: string[];
  enteredByWash?: boolean; // Wprowadzone ręcznie przez myjnię (bez planowania działu)
  isPriority?: boolean; // Tryb Ekspres / Na już
  priorityAuthorizer?: string | null; // Osoba decyzyjna
  priorityReason?: string | null; // Uzasadnienie pierwszeństwa
  dmsOrderId?: number | null; // Referencja zlecenia DMS (zlecenie_id)
  dmsOrderNumber?: string | null; // Numer zlecenia DMS (numer_zlecenia)
  dmsVin?: string | null; // VIN z DMS
}

function getDayRange(dateStr: string) {
  const targetDate = new Date(dateStr);
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  return { startOfDay, endOfDay };
}

async function loadBoardForDate(dateStr: string) {
  const { startOfDay, endOfDay } = getDayRange(dateStr);

  // Zlecenia przypisane bezpośrednio do tego dnia (po planowanym starcie lub terminie gotowości)
  const orders = await prisma.washOrder.findMany({
    where: {
      OR: [
        {
          scheduledStartTime: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        {
          scheduledStartTime: null,
          targetReadyTime: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
      ],
    },
    include: {
      department: true,
      category: true,
      assignedEmployee: true,
      assignedEmployees: { include: { employee: true } },
      releaseLogs: { orderBy: { createdAt: 'desc' } },
    },
    orderBy: [
      { isPriority: 'desc' }, // Priorytetowe na górze
      { scheduledStartTime: 'asc' },
      { targetReadyTime: 'asc' },
    ],
  });

  // Zlecenia z przeszłości, które nie zostały jeszcze ukończone (Zaległe z wczoraj / poprzednich dni)
  const pastUnfinishedOrders = await prisma.washOrder.findMany({
    where: {
      status: { in: ['PLANNED', 'IN_PROGRESS'] },
      OR: [
        {
          scheduledStartTime: {
            lt: startOfDay,
          },
        },
        {
          scheduledStartTime: null,
          targetReadyTime: {
            lt: startOfDay,
          },
        },
      ],
    },
    include: {
      department: true,
      category: true,
      assignedEmployee: true,
      assignedEmployees: { include: { employee: true } },
      releaseLogs: { orderBy: { createdAt: 'desc' } },
    },
    orderBy: [
      { isPriority: 'desc' },
      { targetReadyTime: 'asc' },
    ],
  });

  return { orders, pastUnfinishedOrders };
}

export async function getOrdersForDate(dateStr: string) {
  try {
    if (!await getCurrentUser()) {
      return { success: false, error: 'Zaloguj się, aby wyświetlić zlecenia i historię wydania.', orders: [], departmentOrders: [], pastUnfinishedOrders: [], capacityOrders: [] };
    }
    const board = await loadBoardForDate(dateStr);
    const { startOfDay, endOfDay } = getDayRange(dateStr);
    const targetOrders = await prisma.washOrder.findMany({
      where: { targetReadyTime: { gte: startOfDay, lte: endOfDay }, id: { notIn: board.orders.map(order => order.id) } },
      include: {
        department: true,
        category: true,
        assignedEmployee: true,
        assignedEmployees: { include: { employee: true } },
        releaseLogs: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: [{ isPriority: 'desc' }, { scheduledStartTime: 'asc' }, { targetReadyTime: 'asc' }],
    });
    const active = await prisma.washOrder.findMany({
      where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } },
      select: { id: true, licensePlate: true, status: true, carType: true, durationMin: true, scheduledStartTime: true, scheduledEndTime: true, targetReadyTime: true },
    });
    const capacityOrders = new Map(board.orders.map(({ id, licensePlate, status, carType, durationMin, scheduledStartTime, scheduledEndTime, targetReadyTime }) =>
      [id, { id, licensePlate, status, carType, durationMin, scheduledStartTime, scheduledEndTime, targetReadyTime }]));
    for (const order of active) {
      const window = getOrderServiceWindow(order);
      if (window && window.startMs < endOfDay.getTime() + 1 && window.endMs > startOfDay.getTime()) {
        capacityOrders.set(order.id, order);
      }
    }
    return { success: true, ...board, departmentOrders: [...board.orders, ...targetOrders], capacityOrders: [...capacityOrders.values()] };
  } catch (error) {
    console.error('getOrdersForDate error:', error);
    return { success: false, error: 'Nie udało się pobrać zleceń.', orders: [], departmentOrders: [], pastUnfinishedOrders: [], capacityOrders: [] };
  }
}

/**
 * Snapshot planera: zlecenia dnia + zaległe + obsada zmiany + auta gotowe do wydania poza grafikiem.
 * Jeden round-trip dla pollingu 6 s, dzięki czemu obsada jest widoczna na wszystkich urządzeniach.
 */
export async function getPlannerSnapshot(dateStr: string) {
  try {
    if (!await getCurrentUser()) {
      return {
        success: false,
        error: 'Zaloguj się, aby wyświetlić planer.',
        orders: [],
        pastUnfinishedOrders: [],
        roster: [],
        pendingReleases: [],
      };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return {
        success: false,
        error: 'Nieprawidłowa data.',
        orders: [],
        pastUnfinishedOrders: [],
        roster: [],
        pendingReleases: [],
      };
    }

    const [board, roster, pendingReleases] = await Promise.all([
      loadBoardForDate(dateStr),
      prisma.shiftRoster.findMany({
        where: { dateKey: dateStr },
        orderBy: { startedAt: 'asc' },
      }),
      // Wszystkie auta gotowe do odbioru - klient odfiltruje te, które są już widoczne na grafiku.
      prisma.washOrder.findMany({
        where: { status: 'READY' },
        include: { department: true, category: true, assignedEmployee: true, assignedEmployees: { include: { employee: true } } },
        orderBy: { targetReadyTime: 'asc' },
        take: 100,
      }),
    ]);

    return {
      success: true,
      ...board,
      roster: roster.map(entry => ({
        employeeId: entry.employeeId,
        startedAt: entry.startedAt.toISOString(),
        endedAt: entry.endedAt ? entry.endedAt.toISOString() : null,
      })),
      pendingReleases,
    };
  } catch (error) {
    console.error('getPlannerSnapshot error:', error);
    return {
      success: false,
      error: 'Nie udało się pobrać planera.',
      orders: [],
      pastUnfinishedOrders: [],
      roster: [],
      pendingReleases: [],
    };
  }
}

export async function createOrder(input: CreateOrderInput) {
  try {
    const user = await getCurrentUser();
    if (!user || !['DEPARTMENT', 'WASHER', 'ADMIN'].includes(user.role)) {
      return { success: false, error: 'Brak uprawnień do tworzenia zleceń.' };
    }
    if (!input || typeof input.licensePlate !== 'string' || !input.licensePlate.trim() ||
        !['PASSENGER', 'DELIVERY'].includes(input.carType) ||
        typeof input.targetReadyTime !== 'string') {
      return { success: false, error: 'Nieprawidłowe dane zlecenia.' };
    }
    if (user.role === 'DEPARTMENT') {
      const department = await prisma.department.findUnique({ where: { id: input.departmentId } });
      if (!department || department.slug !== user.slug || input.enteredByWash || input.assignedEmployeeId || input.assignedEmployeeIds !== undefined) {
        return { success: false, error: 'Możesz zgłosić zlecenie tylko dla własnego działu, bez przypisywania pracowników.' };
      }
    }
    const ids = input.assignedEmployeeIds !== undefined ? input.assignedEmployeeIds : input.assignedEmployeeId ? [input.assignedEmployeeId] : [];
    if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !id.trim()) || new Set(ids).size !== ids.length) {
      return { success: false, error: 'Nieprawidłowa lista pracowników.' };
    }
    if (input.assignedEmployeeIds !== undefined) {
      const auth = await checkPlannerPermission();
      if (!auth.allowed) return { success: false, error: auth.error };
    }
    const category = await prisma.washCategory.findUnique({
      where: { id: input.categoryId },
    });

    if (!category) {
      return { success: false, error: 'Nie znaleziono kategorii mycia.' };
    }

    if (input.isPriority) {
      if (user.role !== 'WASHER' && user.role !== 'ADMIN') {
        return { 
          success: false, 
          error: 'Brak uprawnień. Tylko stanowisko Myjni oraz Kierownik / Admin mogą zgłaszać i planować zlecenia w trybie Ekspres poza kolejką.' 
        };
      }
      if (!input.priorityAuthorizer?.trim()) {
        return { success: false, error: 'Dla zlecenia Ekspres wymagane jest wskazanie osoby decyzyjnej zatwierdzającej priorytet.' };
      }
      if (!input.priorityReason?.trim()) {
        return { success: false, error: 'Dla zlecenia Ekspres wymagane jest podanie uzasadnienia pierwszeństwa.' };
      }
    }

    const durationMin = category.defaultDurationMin;
    if (!Number.isInteger(durationMin) || durationMin < 5 || durationMin > 600) {
      return { success: false, error: 'Nieprawidłowy czas trwania kategorii mycia.' };
    }
    const targetDate = new Date(input.targetReadyTime);
    if (Number.isNaN(targetDate.getTime())) {
      return { success: false, error: 'Nieprawidłowy termin gotowości.' };
    }

    const scheduledStart = input.scheduledStartTime !== undefined
      ? new Date(input.scheduledStartTime)
      : new Date(targetDate.getTime() - durationMin * 60000);
    if (Number.isNaN(scheduledStart.getTime())) {
      return { success: false, error: 'Nieprawidłowa godzina startu mycia.' };
    }
    const scheduledEnd = new Date(scheduledStart.getTime() + durationMin * 60000);
    if (user.role === 'DEPARTMENT' && scheduledEnd > targetDate) {
      return { success: false, error: 'Zakończenie mycia wypada po terminie gotowości.' };
    }

    const newOrder = await prisma.$transaction(async tx => {
      const capacityError = await validateCapacityWindow(tx, { start: scheduledStart, end: scheduledEnd, carType: input.carType });
      if (capacityError) return { error: capacityError };
      if (ids.length && await tx.employee.count({ where: { id: { in: ids }, isActive: true } }) !== ids.length) {
        throw new Error('INVALID_EMPLOYEES');
      }
      const orderNumber = `Z-${await tx.washOrder.count() + 101}`;
      const order = await tx.washOrder.create({
      data: {
        orderNumber,
        licensePlate: input.licensePlate.trim().toUpperCase(),
        carModel: input.carModel?.trim() || null,
        carType: input.carType,
        departmentId: input.departmentId,
        categoryId: input.categoryId,
        targetReadyTime: targetDate,
        scheduledStartTime: scheduledStart,
        scheduledEndTime: scheduledEnd,
        durationMin,
        assignedEmployeeId: ids[0] || null,
        assignedEmployees: { create: ids.map(employeeId => ({ employeeId })) },
        status: 'PLANNED',
        enteredByWash: input.enteredByWash ?? false,
        isPriority: input.isPriority ?? false,
        priorityAuthorizer: input.isPriority ? input.priorityAuthorizer?.trim() || null : null,
        priorityReason: input.isPriority ? input.priorityReason?.trim() || null : null,
        dmsOrderId: input.dmsOrderId ?? null,
        dmsOrderNumber: input.dmsOrderNumber?.trim() || null,
        dmsVin: input.dmsVin?.trim() || null,
        notes: input.notes?.trim() || null,
        contactPerson: input.contactPerson?.trim() || null,
      },
      include: {
        department: true,
        category: true,
        assignedEmployee: true,
        assignedEmployees: { include: { employee: true } },
      },
    });
      return { order };
    });
    if ('error' in newOrder) return { success: false, error: newOrder.error };

    revalidatePath('/planner');
    revalidatePath('/order');
    revalidatePath('/summary');

    return { success: true, order: newOrder.order };
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_EMPLOYEES') return { success: false, error: 'Wybierz aktywnych pracowników myjni.' };
    console.error('createOrder error:', error);
    return { success: false, error: 'Błąd podczas tworzenia zlecenia.' };
  }
}

export async function updateOrderStatus(
  orderId: string,
  newStatus: 'PLANNED' | 'IN_PROGRESS' | 'READY' | 'COMPLETED' | 'CANCELLED'
) {
  try {
    const auth = await checkPlannerPermission();
    if (!auth.allowed) return { success: false, error: auth.error };

    if (newStatus === 'COMPLETED') {
      return { success: false, error: 'Wydaj pojazd przyciskiem Wydane w planerze i potwierdź wymagane czynności.' };
    }
    if (newStatus === 'CANCELLED') {
      return { success: false, error: 'Anuluj zlecenie przyciskiem Anuluj - zapisujemy wtedy powód i historię.' };
    }
    if (!['PLANNED', 'IN_PROGRESS', 'READY'].includes(newStatus)) {
      return { success: false, error: 'Nieprawidłowy status zlecenia.' };
    }

    const current = await prisma.washOrder.findUnique({
      where: { id: orderId },
      select: { status: true },
    });
    if (!current) return { success: false, error: 'Nie znaleziono zlecenia.' };
    if (current.status === 'CANCELLED') {
      return { success: false, error: 'Zlecenie zostało anulowane.' };
    }
    if (current.status === 'COMPLETED') {
      return { success: false, error: 'Zlecenie zostało już wydane.' };
    }

    const dataToUpdate: any = { status: newStatus };

    if (newStatus === 'IN_PROGRESS') {
      dataToUpdate.startedAt = new Date();
    } else if (newStatus === 'READY') {
      dataToUpdate.completedAt = new Date();
    }

    const changed = await prisma.washOrder.updateMany({
      where: { id: orderId, status: current.status },
      data: dataToUpdate,
    });
    if (changed.count !== 1) return { success: false, error: 'Zlecenie uległo zmianie. Odśwież widok i spróbuj ponownie.' };
    const updated = await prisma.washOrder.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        department: true,
        category: true,
        assignedEmployee: true,
      },
    });

    revalidatePath('/planner');
    revalidatePath('/order');
    revalidatePath('/summary');

    return { success: true, order: updated };
  } catch (error) {
    console.error('updateOrderStatus error:', error);
    return { success: false, error: 'Nie udało się zaktualizować statusu.' };
  }
}

export async function cancelOrder(orderId: string, input?: { reason?: string }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'Zaloguj się, aby anulować zlecenie.' };
    }
    if (typeof orderId !== 'string' || !orderId.trim()) {
      return { success: false, error: 'Nieprawidłowe zlecenie.' };
    }
    const reason = (input?.reason || '').trim().slice(0, 500);

    const order = await prisma.washOrder.findUnique({
      where: { id: orderId },
      include: { department: true },
    });
    if (!order) return { success: false, error: 'Nie znaleziono zlecenia.' };

    if (user.role === 'DEPARTMENT') {
      if (order.department.slug !== user.slug) {
        return { success: false, error: 'Możesz anulować tylko zlecenia własnego działu.' };
      }
    } else if (user.role !== 'WASHER' && user.role !== 'ADMIN') {
      return { success: false, error: 'Brak uprawnień do anulowania zlecenia.' };
    }

    // Idempotencja jest dostępna tylko dla uprawnionych użytkowników.
    if (order.status === 'CANCELLED') return { success: true, order };
    if (order.status === 'COMPLETED') {
      return { success: false, error: 'Wydanego zlecenia nie można anulować.' };
    }
    if (user.role === 'DEPARTMENT' && order.status !== 'PLANNED') {
      return { success: false, error: 'Zlecenie jest już w realizacji - anulowanie zgłoś do myjni.' };
    }

    // Status i dział muszą pozostać zgodne z danymi użytymi do autoryzacji.
    const changed = await prisma.washOrder.updateMany({
      where: { id: orderId, status: order.status, departmentId: order.departmentId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledBy: `${user.name} (${user.code})`,
        cancelledFromStatus: order.status,
        cancelReason: reason || null,
      },
    });

    if (changed.count !== 1) {
      return { success: false, error: 'Zlecenie uległo zmianie. Odśwież widok i spróbuj ponownie.' };
    }

    const updated = await prisma.washOrder.findUniqueOrThrow({
      where: { id: orderId },
      include: { department: true, category: true, assignedEmployee: true },
    });

    revalidatePath('/planner');
    revalidatePath('/order');
    revalidatePath('/summary');

    return { success: true, order: updated };
  } catch (error) {
    console.error('cancelOrder error:', error);
    return { success: false, error: 'Nie udało się anulować zlecenia.' };
  }
}

export async function releaseOrder(orderId: string, input: {
  employeeId: string;
  checklistConfirmed: boolean;
  checklistMarkdown: string;
  categoryId: string;
}) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'WASHER' && user.role !== 'ADMIN')) {
      return { success: false, error: 'Brak uprawnień do wydania pojazdu.' };
    }
    if (typeof orderId !== 'string' || !orderId.trim() || !input ||
        typeof input.employeeId !== 'string' || !input.employeeId.trim() ||
        typeof input.categoryId !== 'string' || !input.categoryId.trim() ||
        typeof input.checklistConfirmed !== 'boolean' ||
        typeof input.checklistMarkdown !== 'string' || input.checklistMarkdown.length > 20000) {
      return { success: false, error: 'Nieprawidłowe dane wydania. Wybierz pracownika.' };
    }

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.washOrder.findUnique({
        where: { id: orderId }, include: { category: true },
      });
      if (!order || order.status !== 'READY') {
        return { success: false as const, error: 'Wydać można tylko pojazd gotowy do odbioru.' };
      }
      const employee = await tx.employee.findUnique({ where: { id: input.employeeId } });
      if (!employee?.isActive) {
        return { success: false as const, error: 'Wybierz aktywnego pracownika wydającego pojazd.' };
      }
      if (input.categoryId !== order.categoryId ||
          (input.checklistConfirmed && !order.category.checklistRequired) ||
          (order.category.checklistRequired && input.checklistMarkdown !== order.category.checklistMarkdown)) {
        return { success: false as const, error: 'Kategoria lub checklista uległa zmianie. Zamknij okno, odśwież planer i potwierdź aktualną checklistę.' };
      }
      if (order.category.checklistRequired &&
          (!order.category.checklistMarkdown?.trim() || !input.checklistConfirmed)) {
        return { success: false as const, error: 'Potwierdź wykonanie wymaganej checklisty przed wydaniem.' };
      }
      const createdAt = new Date();
      // Conditional write and durable unique audit key protect against concurrent/repeated issuance.
      const changed = await tx.washOrder.updateMany({
        where: { id: orderId, status: 'READY', categoryId: order.categoryId },
        data: { status: 'COMPLETED', completedAt: createdAt },
      });
      if (changed.count !== 1) {
        return { success: false as const, error: 'Zlecenie uległo zmianie. Odśwież widok.' };
      }
      const snapshot = {
        orderId, orderIdSnapshot: orderId, orderNumber: order.orderNumber,
        licensePlate: order.licensePlate, categoryName: order.category.name,
        sessionSlug: user.slug, sessionName: user.name, sessionRole: user.role,
        employeeId: employee.id, employeeName: employee.name, createdAt,
        checklistMarkdown: order.category.checklistRequired ? order.category.checklistMarkdown : null,
      };
      if (order.category.checklistRequired) {
        await tx.orderReleaseLog.create({ data: { ...snapshot, eventType: 'CHECKLIST_CONFIRMED' } });
      }
      await tx.orderReleaseLog.create({ data: { ...snapshot, eventType: 'VEHICLE_RELEASED' } });
      const updated = await tx.washOrder.findUniqueOrThrow({
        where: { id: orderId },
        include: {
          department: true, category: true, assignedEmployee: true,
          releaseLogs: { orderBy: { createdAt: 'desc' } },
        },
      });
      return { success: true as const, order: updated };
    });
    if (result.success) {
      revalidatePath('/planner');
      revalidatePath('/order');
      revalidatePath('/summary');
    }
    return result;
  } catch (error) {
    console.error('releaseOrder error:', error);
    return { success: false, error: 'Nie udało się wydać pojazdu. Odśwież widok i sprawdź, czy nie został już wydany.' };
  }
}

export async function setOrderEmployees(orderId: string, data: {
  assignedEmployeeIds: string[];
  expectedUpdatedAt: string;
}) {
  try {
    const auth = await checkPlannerPermission();
    if (!auth.allowed) return { success: false, error: auth.error };
    if (typeof orderId !== 'string' || !orderId.trim() || !data ||
        !Array.isArray(data.assignedEmployeeIds) ||
        data.assignedEmployeeIds.some(id => typeof id !== 'string' || !id.trim()) ||
        new Set(data.assignedEmployeeIds).size !== data.assignedEmployeeIds.length ||
        typeof data.expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(data.expectedUpdatedAt))) {
      return { success: false, error: 'Nieprawidłowe dane przypisania pracowników.' };
    }

    const result = await prisma.$transaction(async tx => {
      const current = await tx.washOrder.findUnique({
        where: { id: orderId },
        include: { assignedEmployees: { select: { employeeId: true } } },
      });
      if (!current) return { error: 'Nie znaleziono zlecenia.' };
      if (!['PLANNED', 'IN_PROGRESS', 'READY'].includes(current.status)) {
        return { error: 'Nie można zmienić pracowników wydanego lub anulowanego zlecenia.' };
      }
      if (new Date(data.expectedUpdatedAt).getTime() !== current.updatedAt.getTime()) {
        return { error: 'Zlecenie uległo zmianie. Odśwież widok i spróbuj ponownie.' };
      }
      const existing = new Set(current.assignedEmployees.map(assignment => assignment.employeeId));
      if (current.assignedEmployeeId) existing.add(current.assignedEmployeeId);
      const added = data.assignedEmployeeIds.filter(id => !existing.has(id));
      if (added.length && await tx.employee.count({ where: { id: { in: added }, isActive: true } }) !== added.length) {
        return { error: 'Wybierz aktywnych pracowników myjni.' };
      }
      const changed = await tx.washOrder.updateMany({
        where: { id: orderId, status: current.status, updatedAt: current.updatedAt },
        data: {
          assignedEmployeeId: data.assignedEmployeeIds[0] || null,
          updatedAt: new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1)),
        },
      });
      if (changed.count !== 1) return { error: 'Zlecenie uległo zmianie. Odśwież widok i spróbuj ponownie.' };
      await tx.orderEmployee.deleteMany({ where: { orderId } });
      if (data.assignedEmployeeIds.length) {
        await tx.orderEmployee.createMany({ data: data.assignedEmployeeIds.map(employeeId => ({ orderId, employeeId })) });
      }
      const order = await tx.washOrder.findUniqueOrThrow({
        where: { id: orderId },
        include: { department: true, category: true, assignedEmployee: true, assignedEmployees: { include: { employee: true } } },
      });
      return { order };
    });
    if ('error' in result) return { success: false, error: result.error };
    revalidatePath('/planner');
    revalidatePath('/order');
    revalidatePath('/summary');
    return { success: true, order: result.order };
  } catch (error) {
    console.error('setOrderEmployees error:', error);
    return { success: false, error: 'Nie udało się zmienić przypisania. Odśwież widok i spróbuj ponownie.' };
  }
}

export async function scheduleOrder(
  orderId: string,
  data: {
    scheduledStartTime: string;
    durationMin?: number;
    assignedEmployeeId?: string | null;
    assignedEmployeeIds?: string[];
    expectedUpdatedAt?: string;
    isOverCapacity?: boolean;
  }
) {
  try {
    const auth = await checkPlannerPermission();
    if (!auth.allowed) return { success: false, error: auth.error };

    const current = await prisma.washOrder.findUnique({
      where: { id: orderId },
    });

    if (!current) return { success: false, error: 'Nie znaleziono zlecenia.' };
    if (data.expectedUpdatedAt !== undefined && new Date(data.expectedUpdatedAt).getTime() !== current.updatedAt.getTime()) {
      return { success: false, error: 'Zlecenie uległo zmianie. Odśwież widok i spróbuj ponownie.' };
    }
    if (current.status === 'CANCELLED') {
      return { success: false, error: 'Zlecenie zostało anulowane - nie można go planować.' };
    }
    if (current.status === 'COMPLETED') {
      return { success: false, error: 'Zlecenie zostało już wydane.' };
    }

    const start = new Date(data.scheduledStartTime);
    if (Number.isNaN(start.getTime())) {
      return { success: false, error: 'Nieprawidłowa data lub godzina rozpoczęcia.' };
    }
    const duration = data.durationMin ?? current.durationMin;
    if (!Number.isFinite(duration) || duration < 5 || duration > 600) {
      return { success: false, error: 'Czas trwania musi mieścić się w zakresie 5-600 minut.' };
    }
    const ids = data.assignedEmployeeIds !== undefined ? data.assignedEmployeeIds : data.assignedEmployeeId !== undefined ? (data.assignedEmployeeId ? [data.assignedEmployeeId] : []) : undefined;
    if (ids !== undefined && (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !id.trim()) || new Set(ids).size !== ids.length)) {
      return { success: false, error: 'Nieprawidłowa lista pracowników.' };
    }
    const end = new Date(start.getTime() + duration * 60000);

    const updated = await prisma.$transaction(async tx => {
    const capacityError = await validateCapacityWindow(tx, { start, end, carType: current.carType, excludeOrderId: orderId });
    if (capacityError) return { error: capacityError };
    const existingIds = ids?.length ? (await tx.orderEmployee.findMany({ where: { orderId }, select: { employeeId: true } })).map(a => a.employeeId) : [];
    const newIds = ids?.filter(id => !existingIds.includes(id)) || [];
    if (newIds.length && await tx.employee.count({ where: { id: { in: newIds }, isActive: true } }) !== newIds.length) {
      throw new Error('INVALID_EMPLOYEES');
    }
    const changed = await tx.washOrder.updateMany({
      where: { id: orderId, status: current.status, updatedAt: current.updatedAt },
      data: {
        scheduledStartTime: start,
        scheduledEndTime: end,
        durationMin: duration,
        assignedEmployeeId: ids === undefined ? undefined : ids[0] || null,
        isOverCapacity: data.isOverCapacity ?? false,
      },
    });
    if (changed.count !== 1) return { error: 'Zlecenie uległo zmianie. Odśwież widok i spróbuj ponownie.' };
    if (ids !== undefined) {
      await tx.orderEmployee.deleteMany({ where: { orderId } });
      if (ids.length) await tx.orderEmployee.createMany({ data: ids.map(employeeId => ({ orderId, employeeId })) });
    }
    const order = await tx.washOrder.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        department: true,
        category: true,
        assignedEmployee: true,
        assignedEmployees: { include: { employee: true } },
      },
    });
    return { order };
    });
    if ('error' in updated) return { success: false, error: updated.error };

    revalidatePath('/planner');
    revalidatePath('/order');
    return { success: true, order: updated.order };
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_EMPLOYEES') return { success: false, error: 'Wybierz aktywnych pracowników myjni.' };
    console.error('scheduleOrder error:', error);
    return { success: false, error: 'Błąd podczas planowania terminu.' };
  }
}

export async function quickFinishOrder(orderId: string) {
  return updateOrderStatus(orderId, 'READY');
}

export async function addOrderNote(orderId: string, note: string) {
  try {
    const auth = await checkPlannerPermission();
    if (!auth.allowed) return { success: false, error: auth.error };

    const trimmed = note.trim();
    const updated = await prisma.washOrder.update({
      where: { id: orderId },
      data: { notes: trimmed || null },
      include: {
        department: true,
        category: true,
        assignedEmployee: true,
      },
    });

    revalidatePath('/planner');
    revalidatePath('/order');
    revalidatePath('/summary');

    return { success: true, order: updated };
  } catch (error) {
    console.error('addOrderNote error:', error);
    return { success: false, error: 'Nie udało się zapisać notatki.' };
  }
}

// Zakończenie mycia z opcjonalną notatką od myjni (status READY)
export async function finishOrderWithNote(orderId: string, note?: string) {
  try {
    const auth = await checkPlannerPermission();
    if (!auth.allowed) return { success: false, error: auth.error };

    const current = await prisma.washOrder.findUnique({
      where: { id: orderId },
      select: { status: true },
    });
    if (!current) return { success: false, error: 'Nie znaleziono zlecenia.' };
    if (current.status === 'CANCELLED') {
      return { success: false, error: 'Zlecenie zostało anulowane.' };
    }
    if (current.status === 'COMPLETED') {
      return { success: false, error: 'Zlecenie zostało już wydane.' };
    }

    const trimmed = note?.trim();
    const dataToUpdate: any = {
      status: 'READY',
      completedAt: new Date(),
      ...(trimmed ? { notes: trimmed } : {}),
    };

    const changed = await prisma.washOrder.updateMany({
      where: { id: orderId, status: current.status },
      data: dataToUpdate,
    });
    if (changed.count !== 1) return { success: false, error: 'Zlecenie uległo zmianie. Odśwież widok i spróbuj ponownie.' };
    const updated = await prisma.washOrder.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        department: true,
        category: true,
        assignedEmployee: true,
      },
    });

    revalidatePath('/planner');
    revalidatePath('/order');
    revalidatePath('/summary');

    return { success: true, order: updated };
  } catch (error) {
    console.error('finishOrderWithNote error:', error);
    return { success: false, error: 'Nie udało się zakończyć zlecenia.' };
  }
}

export async function deleteOrder(orderId: string) {
  try {
    const auth = await checkPlannerPermission();
    if (!auth.allowed) return { success: false, error: auth.error };

    await prisma.washOrder.delete({
      where: { id: orderId },
    });

    revalidatePath('/planner');
    revalidatePath('/order');
    return { success: true };
  } catch (error) {
    console.error('deleteOrder error:', error);
    return { success: false, error: 'Nie udało się usunąć zlecenia.' };
  }
}
