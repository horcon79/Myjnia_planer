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
    // Unassign this employee from any orders so deletion doesn't fail foreign keys
    await prisma.washOrder.updateMany({
      where: { assignedEmployeeId: id },
      data: { assignedEmployeeId: null },
    });

    await prisma.employee.delete({
      where: { id },
    });

    revalidatePath('/settings');
    revalidatePath('/planner');
    return { success: true };
  } catch (error) {
    console.error('deleteEmployee error:', error);
    return { success: false, error: 'Nie udało się usunąć pracownika.' };
  }
}
