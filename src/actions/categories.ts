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

export async function getCategories() {
  try {
    const categories = await prisma.washCategory.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
    });
    return { success: true, categories };
  } catch (error) {
    console.error('getCategories error:', error);
    return { success: false, error: 'Nie udało się pobrać kategorii.', categories: [] };
  }
}

export async function getAllCategoriesAdmin() {
  try {
    const categories = await prisma.washCategory.findMany({
      orderBy: { order: 'asc' },
    });
    return { success: true, categories };
  } catch (error) {
    console.error('getAllCategoriesAdmin error:', error);
    return { success: false, error: 'Nie udało się pobrać kategorii.', categories: [] };
  }
}

export async function upsertCategory(data: {
  id?: string;
  name: string;
  defaultDurationMin: number;
  color: string;
  description?: string;
  suggestedNotes?: string;
  order?: number;
  isActive?: boolean;
}) {
  try {
    await requireAdmin();
    if (data.id) {
      const updated = await prisma.washCategory.update({
        where: { id: data.id },
        data: {
          name: data.name.trim(),
          defaultDurationMin: Number(data.defaultDurationMin),
          color: data.color,
          description: data.description?.trim() || null,
          suggestedNotes: data.suggestedNotes?.trim() || null,
          order: data.order ?? 0,
          isActive: data.isActive ?? true,
        },
      });
      revalidatePath('/settings');
      revalidatePath('/order');
      revalidatePath('/planner');
      return { success: true, category: updated };
    } else {
      const created = await prisma.washCategory.create({
        data: {
          name: data.name.trim(),
          defaultDurationMin: Number(data.defaultDurationMin),
          color: data.color,
          description: data.description?.trim() || null,
          suggestedNotes: data.suggestedNotes?.trim() || null,
          order: data.order ?? 0,
          isActive: data.isActive ?? true,
        },
      });
      revalidatePath('/settings');
      revalidatePath('/order');
      revalidatePath('/planner');
      return { success: true, category: created };
    }
  } catch (error) {
    console.error('upsertCategory error:', error);
    return { success: false, error: 'Błąd podczas zapisywania kategorii mycia.' };
  }
}

export async function deleteCategory(id: string) {
  try {
    await requireAdmin();
    await prisma.washCategory.update({
      where: { id },
      data: { isActive: false },
    });
    revalidatePath('/settings');
    revalidatePath('/order');
    return { success: true };
  } catch (error) {
    return { success: false, error: 'Nie udało się dezaktywować kategorii.' };
  }
}
