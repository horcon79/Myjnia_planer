'use server';

import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/actions/auth';
import { searchDmsOrders, getDmsServiceStatus, clearDmsCache } from '@/lib/dms';
import type { DmsSearchResult, DmsServiceStatus } from '@/lib/dms-types';

export type { DmsSearchResult } from '@/lib/dms-types';

async function resolveDepartment(departmentId: string) {
  const user = await getCurrentUser();
  if (!user) return { user: null as null, dept: null as null, error: 'Brak zalogowania.' };

  const dept = await prisma.department.findUnique({ where: { id: departmentId } });
  if (!dept) return { user, dept: null as null, error: 'Nie znaleziono działu.' };

  const allowed = user.role === 'ADMIN' || (user.role === 'DEPARTMENT' && user.slug === dept.slug);
  if (!allowed) {
    return { user, dept: null as null, error: 'Brak uprawnień do tego działu.' };
  }

  if (!dept.dmsEnabled || !dept.dmsServiceCode) {
    return { user, dept: null as null, error: 'Integracja DMS nie jest włączona dla tego działu.' };
  }

  return { user, dept, error: null as string | null };
}

/** Wyszukiwanie pojazdów/zleceń DMS dla danego działu (>=3 znaki rejestracji lub numeru zlecenia). */
export async function searchDmsVehicles(
  departmentId: string,
  query: string,
): Promise<{ success: boolean; results?: DmsSearchResult[]; error?: string }> {
  try {
    const { dept, error } = await resolveDepartment(departmentId);
    if (!dept) return { success: false, error: error ?? 'Brak dostępu.' };

    const orders = await searchDmsOrders(dept.dmsServiceCode!, query);

    // Jakie pojazdy są już w aktywnych zleceniach mycia tego działu?
    const active = await prisma.washOrder.findMany({
      where: { departmentId: dept.id, status: { in: ['PLANNED', 'IN_PROGRESS', 'READY'] } },
      select: { dmsOrderId: true, licensePlate: true },
    });
    const reportedOrderIds = new Set(active.map((o) => o.dmsOrderId).filter((v): v is number => v != null));
    const reportedPlates = new Set(active.map((o) => (o.licensePlate || '').toUpperCase().replace(/\s+/g, '')));

    const results: DmsSearchResult[] = orders.map((o) => {
      const plate = (o.licensePlate || '').toUpperCase().replace(/\s+/g, '');
      const alreadyReported = (o.dmsOrderId != null && reportedOrderIds.has(o.dmsOrderId)) ||
        (plate.length > 0 && reportedPlates.has(plate));
      return { ...o, alreadyReported };
    });

    return { success: true, results };
  } catch (err) {
    console.error('searchDmsVehicles error:', err);
    return { success: false, error: 'Nie udało się wyszukać w danych DMS.' };
  }
}

/** Stan integracji DMS dla działu (dostępność, świeżość pliku, błędy). */
export async function getDmsStatus(
  departmentId: string,
): Promise<{ success: boolean; status?: DmsServiceStatus; error?: string }> {
  try {
    const { dept, error } = await resolveDepartment(departmentId);
    if (!dept) return { success: false, error: error ?? 'Brak dostępu.' };

    const status = await getDmsServiceStatus(dept.dmsServiceCode!, dept.dmsMaxAgeMin);
    return { success: true, status };
  } catch (err) {
    console.error('getDmsStatus error:', err);
    return { success: false, error: 'Nie udało się pobrać statusu DMS.' };
  }
}

/** Wymuszone odświeżenie — czyści cache pamięci i odczytuje plik ponownie. */
export async function refreshDmsCache(
  departmentId: string,
): Promise<{ success: boolean; status?: DmsServiceStatus; error?: string }> {
  try {
    const { dept, error } = await resolveDepartment(departmentId);
    if (!dept) return { success: false, error: error ?? 'Brak dostępu.' };

    clearDmsCache();
    const status = await getDmsServiceStatus(dept.dmsServiceCode!, dept.dmsMaxAgeMin);
    return { success: true, status };
  } catch (err) {
    console.error('refreshDmsCache error:', err);
    return { success: false, error: 'Nie udało się odświeżyć danych DMS.' };
  }
}
