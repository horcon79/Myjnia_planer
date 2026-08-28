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
  expressCount: number;
  expressSharePercent: number;
}

export interface ExpressAuditOrder {
  id: string;
  orderNumber: string;
  licensePlate: string;
  carModel: string | null;
  departmentId: string;
  departmentName: string;
  departmentCode: string;
  departmentColor: string;
  priorityAuthorizer: string | null;
  priorityReason: string | null;
  createdAt: string;
  completedAt: string | null;
  targetReadyTime: string;
  status: string;
  assignedEmployeeName: string | null;
}

export interface WashReport {
  dateFrom: string;
  dateTo: string;
  employees: ReportRow[];
  departments: ReportRow[];
  totalCount: number;
  totalDurationMin: number;
  enteredByWashCount: number;
  expressCount: number;
  expressSharePercent: number;
  expressOrders: ExpressAuditOrder[];
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

    // Pobierz wszystkie zlecenia ekspresowe utworzone lub wykonane w tym okresie (do rejestru audytu)
    const expressOrdersRaw = await prisma.washOrder.findMany({
      where: {
        isPriority: true,
        OR: [
          { createdAt: { gte: from, lte: to } },
          { completedAt: { gte: from, lte: to } },
          { targetReadyTime: { gte: from, lte: to } },
        ],
      },
      include: {
        department: true,
        assignedEmployee: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const expressOrders: ExpressAuditOrder[] = expressOrdersRaw.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      licensePlate: o.licensePlate,
      carModel: o.carModel,
      departmentId: o.departmentId,
      departmentName: o.department?.name || 'Nieznany dział',
      departmentCode: o.department?.code || '—',
      departmentColor: o.department?.color || '#64748b',
      priorityAuthorizer: o.priorityAuthorizer,
      priorityReason: o.priorityReason,
      createdAt: o.createdAt.toISOString(),
      completedAt: o.completedAt?.toISOString() || null,
      targetReadyTime: o.targetReadyTime.toISOString(),
      status: o.status,
      assignedEmployeeName: o.assignedEmployee?.name || null,
    }));

    const empMap = new Map<string, ReportRow>();
    const deptMap = new Map<string, ReportRow>();

    const EMPTY_EMP_ID = '__none__';
    const EMPTY_DEPT_ID = '__none__';

    let totalCount = 0;
    let totalDurationMin = 0;
    let enteredByWashCount = 0;
    let totalExpressCount = 0;

    for (const o of inRange) {
      totalCount += 1;
      totalDurationMin += o.durationMin || 0;
      if (o.enteredByWash) enteredByWashCount += 1;
      if (o.isPriority) totalExpressCount += 1;

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
          expressCount: 0,
          expressSharePercent: 0,
        });
      }
      const empRow = empMap.get(empId)!;
      empRow.count += 1;
      empRow.totalDurationMin += o.durationMin || 0;
      if (o.enteredByWash) empRow.enteredByWashCount += 1;
      if (o.isPriority) empRow.expressCount += 1;

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
          expressCount: 0,
          expressSharePercent: 0,
        });
      }
      const deptRow = deptMap.get(deptId)!;
      deptRow.count += 1;
      deptRow.totalDurationMin += o.durationMin || 0;
      if (o.enteredByWash) deptRow.enteredByWashCount += 1;
      if (o.isPriority) deptRow.expressCount += 1;
    }

    // Wylicz % udziału ekspresów
    for (const row of deptMap.values()) {
      row.expressSharePercent = row.count > 0 ? Math.round((row.expressCount / row.count) * 100) : 0;
    }
    for (const row of empMap.values()) {
      row.expressSharePercent = row.count > 0 ? Math.round((row.expressCount / row.count) * 100) : 0;
    }

    const sortByCountDesc = (a: ReportRow, b: ReportRow) => b.count - a.count || b.totalDurationMin - a.totalDurationMin;

    const employees = Array.from(empMap.values()).sort(sortByCountDesc);
    const departments = Array.from(deptMap.values()).sort(sortByCountDesc);

    const totalExpressShare = totalCount > 0 ? Math.round((totalExpressCount / totalCount) * 100) : 0;

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
        expressCount: totalExpressCount,
        expressSharePercent: totalExpressShare,
        expressOrders,
      },
    };
  } catch (error) {
    console.error('getWashReport error:', error);
    return { success: false, error: 'Nie udało się pobrać raportu.' };
  }
}
