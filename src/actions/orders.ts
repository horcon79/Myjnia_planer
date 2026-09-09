'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/actions/auth';

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
  enteredByWash?: boolean; // Wprowadzone ręcznie przez myjnię (bez planowania działu)
  isPriority?: boolean; // Tryb Ekspres / Na już
  priorityAuthorizer?: string | null; // Osoba decyzyjna
  priorityReason?: string | null; // Uzasadnienie pierwszeństwa
  dmsOrderId?: number | null; // Referencja zlecenia DMS (zlecenie_id)
  dmsOrderNumber?: string | null; // Numer zlecenia DMS (numer_zlecenia)
  dmsVin?: string | null; // VIN z DMS
}

export async function getOrdersForDate(dateStr: string) {
  try {
    if (!await getCurrentUser()) {
      return { success: false, error: 'Zaloguj się, aby wyświetlić zlecenia i historię wydania.', orders: [], pastUnfinishedOrders: [] };
    }
    const targetDate = new Date(dateStr);
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

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
        releaseLogs: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: [
        { isPriority: 'desc' },
        { targetReadyTime: 'asc' },
      ],
    });

    return { success: true, orders, pastUnfinishedOrders };
  } catch (error) {
    console.error('getOrdersForDate error:', error);
    return { success: false, error: 'Nie udało się pobrać zleceń.', orders: [], pastUnfinishedOrders: [] };
  }
}

export async function createOrder(input: CreateOrderInput) {
  try {
    const category = await prisma.washCategory.findUnique({
      where: { id: input.categoryId },
    });

    if (!category) {
      return { success: false, error: 'Nie znaleziono kategorii mycia.' };
    }

    if (input.isPriority) {
      const user = await getCurrentUser();
      if (user && user.role !== 'WASHER' && user.role !== 'ADMIN') {
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

    // Wygeneruj unikalny numer zlecenia na dziś
    const countToday = await prisma.washOrder.count();
    const orderNumber = `Z-${countToday + 101}`;

    const targetDate = new Date(input.targetReadyTime);

    let scheduledStart: Date | null = null;
    let scheduledEnd: Date | null = null;

    if (input.scheduledStartTime) {
      scheduledStart = new Date(input.scheduledStartTime);
      scheduledEnd = new Date(scheduledStart.getTime() + durationMin * 60000);
    }

    const newOrder = await prisma.washOrder.create({
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
        assignedEmployeeId: input.assignedEmployeeId || null,
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
      },
    });

    revalidatePath('/planner');
    revalidatePath('/order');
    revalidatePath('/summary');

    return { success: true, order: newOrder };
  } catch (error) {
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
    if (!['PLANNED', 'IN_PROGRESS', 'READY', 'CANCELLED'].includes(newStatus)) {
      return { success: false, error: 'Nieprawidłowy status zlecenia.' };
    }

    const dataToUpdate: any = { status: newStatus };

    if (newStatus === 'IN_PROGRESS') {
      dataToUpdate.startedAt = new Date();
    } else if (newStatus === 'READY') {
      dataToUpdate.completedAt = new Date();
    }

    const updated = await prisma.washOrder.update({
      where: { id: orderId },
      data: dataToUpdate,
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

export async function scheduleOrder(
  orderId: string,
  data: {
    scheduledStartTime: string;
    durationMin?: number;
    assignedEmployeeId?: string | null;
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

    const duration = data.durationMin ?? current.durationMin;
    const start = new Date(data.scheduledStartTime);
    const end = new Date(start.getTime() + duration * 60000);

    const updated = await prisma.washOrder.update({
      where: { id: orderId },
      data: {
        scheduledStartTime: start,
        scheduledEndTime: end,
        durationMin: duration,
        assignedEmployeeId: data.assignedEmployeeId,
        isOverCapacity: data.isOverCapacity ?? false,
      },
      include: {
        department: true,
        category: true,
        assignedEmployee: true,
      },
    });

    revalidatePath('/planner');
    revalidatePath('/order');
    return { success: true, order: updated };
  } catch (error) {
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

    const trimmed = note?.trim();
    const dataToUpdate: any = {
      status: 'READY',
      completedAt: new Date(),
      ...(trimmed ? { notes: trimmed } : {}),
    };

    const updated = await prisma.washOrder.update({
      where: { id: orderId },
      data: dataToUpdate,
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
