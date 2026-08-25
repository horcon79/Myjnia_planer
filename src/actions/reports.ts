'use server';

import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/actions/auth';

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    throw new Error('Brak uprawnień administratora.');
  }
}

export interface ReportRow {
  id: string;
  name: string;
  code: string;
  color: string;
  count: number;
  totalDurationMin: number;
  enteredByWashCount: number;
}

export interface WashReport {
  dateFrom: string;
  dateTo: string;
  employees: ReportRow[];
  departments: ReportRow[];
  totalCount: number;
  totalDurationMin: number;
  enteredByWashCount: number;
}

function dateInRange(date: Date | null, from: Date, to: Date): boolean {
  if (!date) return false;
  return date >= from && date <= to;
}

export async function getWashReport(dateFrom: string, dateTo: string): Promise<{ success: boolean; report?: WashReport; error?: string }> {
  try {
    await requireAdmin();

    const from = new Date(`${dateFrom}T00:00:00`);
    const to = new Date(`${dateTo}T23:59:59.999`);

    // Mycia = zlecenia oznaczone jako zrealizowane (READY / COMPLETED)
    const orders = await prisma.washOrder.findMany({
      where: { status: { in: ['READY', 'COMPLETED'] } },
      include: {
        department: true,
        assignedEmployee: true,
      },
    });

    const inRange = orders.filter((o) => {
      // Data "wykonania" = completedAt, z fallbackiem na termin gotowości / utworzenia
      const done = o.completedAt ?? o.targetReadyTime ?? o.createdAt;
      return dateInRange(done, from, to);
    });

    const empMap = new Map<string, ReportRow>();
    const deptMap = new Map<string, ReportRow>();

    const EMPTY_EMP_ID = '__none__';
    const EMPTY_DEPT_ID = '__none__';

    let totalCount = 0;
    let totalDurationMin = 0;
    let enteredByWashCount = 0;

    for (const o of inRange) {
      totalCount += 1;
      totalDurationMin += o.durationMin || 0;
      if (o.enteredByWash) enteredByWashCount += 1;

      const empId = o.assignedEmployeeId || EMPTY_EMP_ID;
      if (!empMap.has(empId)) {
        empMap.set(empId, {
          id: empId,
          name: o.assignedEmployee?.name || 'Bez przypisanego pracownika',
          code: o.assignedEmployee?.shortName || '—',
          color: o.assignedEmployee?.color || '#64748b',
          count: 0,
          totalDurationMin: 0,
          enteredByWashCount: 0,
        });
      }
      const empRow = empMap.get(empId)!;
      empRow.count += 1;
      empRow.totalDurationMin += o.durationMin || 0;
      if (o.enteredByWash) empRow.enteredByWashCount += 1;

      const deptId = o.departmentId || EMPTY_DEPT_ID;
      if (!deptMap.has(deptId)) {
        deptMap.set(deptId, {
          id: deptId,
          name: o.department?.name || 'Nieznany dział',
          code: o.department?.code || '—',
          color: o.department?.color || '#64748b',
          count: 0,
          totalDurationMin: 0,
          enteredByWashCount: 0,
        });
      }
      const deptRow = deptMap.get(deptId)!;
      deptRow.count += 1;
      deptRow.totalDurationMin += o.durationMin || 0;
      if (o.enteredByWash) deptRow.enteredByWashCount += 1;
    }

    const sortByCountDesc = (a: ReportRow, b: ReportRow) => b.count - a.count || b.totalDurationMin - a.totalDurationMin;

    const employees = Array.from(empMap.values()).sort(sortByCountDesc);
    const departments = Array.from(deptMap.values()).sort(sortByCountDesc);

    return {
      success: true,
      report: {
        dateFrom,
        dateTo,
        employees,
        departments,
        totalCount,
        totalDurationMin,
        enteredByWashCount,
      },
    };
  } catch (error) {
    console.error('getWashReport error:', error);
    return { success: false, error: 'Nie udało się pobrać raportu.' };
  }
}
