import React from 'react';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/actions/auth';
import { redirect } from 'next/navigation';
import Navigation from '@/components/Navigation';
import SettingsManager from '@/components/settings/SettingsManager';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await getCurrentUser();

  // Strona ustawień jest dostępna dla wszystkich zalogowanych,
  // ale wszystkie zakładki (Kategorie, Działy, Pracownicy, Przepustowość)
  // wymagają roli ADMIN.
  // Jeśli w ogóle nie jest zalogowany – przekieruj na stronę główną.
  if (!user) {
    redirect('/');
  }

  const isAdmin = user.role === 'ADMIN';

  const [departments, categories, employees, settingsList] = await Promise.all([
    prisma.department.findMany({ orderBy: { order: 'asc' } }),
    prisma.washCategory.findMany({ orderBy: { order: 'asc' } }),
    // Pracownicy pobierani tylko dla admina (brak potrzeby wysyłania danych jeśli zakładka ukryta)
    isAdmin ? prisma.employee.findMany({ orderBy: { name: 'asc' } }) : [],
    prisma.appSetting.findMany(),
  ]);

  const settingsMap: Record<string, string> = {
    MAX_SIMULTANEOUS_CARS: '3',
    DELIVERY_CAR_WEIGHT: '1.5',
    WORK_START_HOUR: '7',
    WORK_END_HOUR: '18',
    ALLOW_OVER_CAPACITY: 'true',
    HIDE_DEFAULT_PINS: 'false',
  };
  settingsList.forEach(s => {
    settingsMap[s.key] = s.value;
  });

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <Navigation user={user} />
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        <SettingsManager
          currentUser={user}
          isAdmin={isAdmin}
          initialDepartments={departments}
          initialCategories={categories}
          initialEmployees={employees}
          initialSettings={settingsMap}
        />
      </main>
    </div>
  );
}
