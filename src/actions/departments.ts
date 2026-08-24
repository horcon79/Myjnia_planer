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

export async function getDepartments() {
  try {
    const departments = await prisma.department.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
    });
    return { success: true, departments };
  } catch (error) {
    console.error('getDepartments error:', error);
    return { success: false, error: 'Nie udało się pobrać działów.', departments: [] };
  }
}

export async function getAllDepartmentsAdmin() {
  try {
    const departments = await prisma.department.findMany({
      orderBy: { order: 'asc' },
    });
    return { success: true, departments };
  } catch (error) {
    console.error('getAllDepartmentsAdmin error:', error);
    return { success: false, error: 'Nie udało się pobrać działów.', departments: [] };
  }
}

export async function upsertDepartment(data: {
  id?: string;
  slug: string;
  name: string;
  code: string;
  color: string;
  icon?: string;
  pin: string;
  order?: number;
  isActive?: boolean;
}) {
  try {
    await requireAdmin();
    if (data.id) {
      const updated = await prisma.department.update({
        where: { id: data.id },
        data: {
          slug: data.slug.toLowerCase().trim(),
          name: data.name.trim(),
          code: data.code.trim().toUpperCase(),
          color: data.color,
          icon: data.icon || 'Car',
          pin: data.pin.trim(),
          order: data.order ?? 0,
          isActive: data.isActive ?? true,
        },
      });
      revalidatePath('/settings');
      revalidatePath('/');
      return { success: true, department: updated };
    } else {
      const created = await prisma.department.create({
        data: {
          slug: data.slug.toLowerCase().trim(),
          name: data.name.trim(),
          code: data.code.trim().toUpperCase(),
          color: data.color,
          icon: data.icon || 'Car',
          pin: data.pin.trim(),
          order: data.order ?? 0,
          isActive: data.isActive ?? true,
        },
      });
      revalidatePath('/settings');
      revalidatePath('/');
      return { success: true, department: created };
    }
  } catch (error) {
    console.error('upsertDepartment error:', error);
    return { success: false, error: 'Błąd podczas zapisywania działu.' };
  }
}

export async function toggleDepartmentActive(id: string, isActive: boolean) {
  try {
    await requireAdmin();
    await prisma.department.update({
      where: { id },
      data: { isActive },
    });
    revalidatePath('/settings');
    revalidatePath('/');
    return { success: true };
  } catch (error) {
    return { success: false, error: 'Nie udało się zmienić statusu działu.' };
  }
}

export async function deleteDepartment(id: string) {
  try {
    await requireAdmin();
    // Delete any orders related to this department or prevent foreign key break
    await prisma.washOrder.deleteMany({
      where: { departmentId: id },
    });

    await prisma.department.delete({
      where: { id },
    });

    revalidatePath('/settings');
    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('deleteDepartment error:', error);
    return { success: false, error: 'Nie udało się usunąć działu.' };
  }
}
