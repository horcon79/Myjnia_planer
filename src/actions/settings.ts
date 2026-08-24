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

export async function getAppSettings() {
  try {
    const settingsList = await prisma.appSetting.findMany();
    const settingsMap: Record<string, string> = {
      MAX_SIMULTANEOUS_CARS: '3',
      DELIVERY_CAR_WEIGHT: '1.5',
      WORK_START_HOUR: '7',
      WORK_END_HOUR: '18',
      ALLOW_OVER_CAPACITY: 'true',
    };

    for (const item of settingsList) {
      settingsMap[item.key] = item.value;
    }

    return { success: true, settings: settingsMap };
  } catch (error) {
    console.error('getAppSettings error:', error);
    return {
      success: false,
      settings: {
        MAX_SIMULTANEOUS_CARS: '3',
        DELIVERY_CAR_WEIGHT: '1.5',
        WORK_START_HOUR: '7',
        WORK_END_HOUR: '18',
        ALLOW_OVER_CAPACITY: 'true',
      },
    };
  }
}

export async function updateAppSetting(key: string, value: string) {
  try {
    await requireAdmin();
    await prisma.appSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
    revalidatePath('/settings');
    revalidatePath('/planner');
    revalidatePath('/order');
    return { success: true };
  } catch (error) {
    console.error('updateAppSetting error:', error);
    return { success: false, error: 'Nie udało się zapisać ustawienia.' };
  }
}
