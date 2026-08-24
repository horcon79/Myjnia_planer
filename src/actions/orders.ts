'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

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
}

export async function getOrdersForDate(dateStr: string) {
  try {
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
      },
      orderBy: [
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
      },
      orderBy: { targetReadyTime: 'asc' },
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
        status: scheduledStart ? 'PLANNED' : 'PLANNED',
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
    const dataToUpdate: any = { status: newStatus };

    if (newStatus === 'IN_PROGRESS') {
      dataToUpdate.startedAt = new Date();
    } else if (newStatus === 'READY' || newStatus === 'COMPLETED') {
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
