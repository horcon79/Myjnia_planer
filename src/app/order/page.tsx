import React from 'react';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/actions/auth';
import Navigation from '@/components/Navigation';
import OrderFormAndList from '@/components/orders/OrderFormAndList';

export const dynamic = 'force-dynamic';

export default async function OrderPage() {
  const user = await getCurrentUser();

  const [departments, categories, employees, settings] = await Promise.all([
    prisma.department.findMany({ where: { isActive: true }, orderBy: { order: 'asc' } }),
    prisma.washCategory.findMany({ where: { isActive: true }, orderBy: { order: 'asc' } }),
    prisma.employee.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.appSetting.findMany(),
  ]);

  const settingsMap: Record<string, string> = {
    MAX_SIMULTANEOUS_CARS: '3',
    DELIVERY_CAR_WEIGHT: '1.5',
    WORK_START_HOUR: '7',
    WORK_END_HOUR: '18',
    ALLOW_OVER_CAPACITY: 'true',
  };
  for (const s of settings) {
    settingsMap[s.key] = s.value;
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <Navigation user={user} />
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        <OrderFormAndList 
          currentUser={user}
          departments={departments}
          categories={categories}
          employees={employees}
          settings={settingsMap}
        />
      </main>
    </div>
  );
}
