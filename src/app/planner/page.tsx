import React from 'react';
import { prisma } from '@/lib/prisma';
import { INTERNAL_SETTING_PREFIX } from '@/lib/session-token';
import { getCurrentUser } from '@/actions/auth';
import { format } from 'date-fns';
import Navigation from '@/components/Navigation';
import PlannerBoard from '@/components/planner/PlannerBoard';

export const dynamic = 'force-dynamic';

export default async function PlannerPage() {
  const user = await getCurrentUser();
  const todayKey = format(new Date(), 'yyyy-MM-dd');

  const [departments, categories, employees, settingsList, rosterEntries] = await Promise.all([
    prisma.department.findMany({ where: { isActive: true }, orderBy: { order: 'asc' } }),
    prisma.washCategory.findMany({ where: { isActive: true }, orderBy: { order: 'asc' } }),
    prisma.employee.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.appSetting.findMany({ where: { NOT: { key: { startsWith: INTERNAL_SETTING_PREFIX } } } }),
    prisma.shiftRoster.findMany({ where: { dateKey: todayKey }, orderBy: { startedAt: 'asc' } }),
  ]);

  // Obsada zapisana w bazie - od pierwszej chwili widoczna na każdym urządzeniu.
  const initialRoster = rosterEntries.map(entry => ({
    employeeId: entry.employeeId,
    startedAt: entry.startedAt.toISOString(),
    endedAt: entry.endedAt ? entry.endedAt.toISOString() : null,
  }));

  const settingsMap: Record<string, string> = {
    MAX_SIMULTANEOUS_CARS: '3',
    DELIVERY_CAR_WEIGHT: '1.5',
    WORK_START_HOUR: '7',
    WORK_END_HOUR: '19',
    ALLOW_OVER_CAPACITY: 'true',
  };
  settingsList.forEach(s => {
    settingsMap[s.key] = s.value;
  });

  return (
    <div className="planner-page min-h-screen bg-slate-950 flex flex-col">
      <Navigation user={user} />
      <main className="flex-1 w-full p-2 sm:p-4 lg:p-6 flex flex-col">
        <PlannerBoard
          currentUser={user}
          departments={departments}
          categories={categories}
          employees={employees}
          settings={settingsMap}
          initialRoster={initialRoster}
        />
      </main>
    </div>
  );
}
