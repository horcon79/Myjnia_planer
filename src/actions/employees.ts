'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/actions/auth';

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    throw new Error('Brak uprawnień administratora.');
  }
}

export async function getEmployees() {
  try {
    const employees = await prisma.employee.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    return { success: true, employees };
  } catch (error) {
    console.error('getEmployees error:', error);
    return { success: false, error: 'Nie udało się pobrać listy pracowników.', employees: [] };
  }
}

export async function getAllEmployeesAdmin() {
  try {
    const employees = await prisma.employee.findMany({
      orderBy: { name: 'asc' },
    });
    return { success: true, employees };
  } catch (error) {
    console.error('getAllEmployeesAdmin error:', error);
    return { success: false, error: 'Nie udało się pobrać pracowników.', employees: [] };
  }
}

export async function upsertEmployee(data: {
  id?: string;
  name: string;
  shortName: string;
  color: string;
  isActive?: boolean;
}) {
  try {
    await requireAdmin();
    if (data.id) {
      const updated = await prisma.employee.update({
        where: { id: data.id },
        data: {
          name: data.name.trim(),
          shortName: data.shortName.trim(),
          color: data.color,
          isActive: data.isActive ?? true,
        },
      });
      revalidatePath('/settings');
      revalidatePath('/planner');
      return { success: true, employee: updated };
    } else {
      const created = await prisma.employee.create({
        data: {
          name: data.name.trim(),
          shortName: data.shortName.trim(),
          color: data.color,
          isActive: data.isActive ?? true,
        },
      });
      revalidatePath('/settings');
      revalidatePath('/planner');
      return { success: true, employee: created };
    }
  } catch (error) {
    console.error('upsertEmployee error:', error);
    return { success: false, error: 'Błąd zapisu pracownika.' };
  }
}

export async function toggleEmployeeActive(id: string, isActive: boolean) {
  try {
    await requireAdmin();
    await prisma.employee.update({
      where: { id },
      data: { isActive },
    });
    revalidatePath('/settings');
    revalidatePath('/planner');
    return { success: true };
  } catch (error) {
    return { success: false, error: 'Nie udało się zmienić statusu pracownika.' };
  }
}

export async function deleteEmployee(id: string) {
  try {
    await requireAdmin();
    await prisma.$transaction(async (tx) => {
      const orders = await tx.washOrder.findMany({
        where: { assignedEmployeeId: id },
        select: {
          id: true,
          assignedEmployees: {
            where: { employeeId: { not: id } },
            orderBy: { employeeId: 'asc' },
            take: 1,
            select: { employeeId: true },
          },
        },
      });
      for (const order of orders) {
        await tx.washOrder.update({
          where: { id: order.id },
          data: { assignedEmployeeId: order.assignedEmployees[0]?.employeeId ?? null },
        });
      }
      await tx.employee.delete({ where: { id } });
    });

    revalidatePath('/settings');
    revalidatePath('/planner');
    return { success: true };
  } catch (error) {
    console.error('deleteEmployee error:', error);
    return { success: false, error: 'Nie udało się usunąć pracownika.' };
  }
}
