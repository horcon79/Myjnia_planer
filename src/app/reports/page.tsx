import React from 'react';
import { getCurrentUser } from '@/actions/auth';
import { redirect } from 'next/navigation';
import Navigation from '@/components/Navigation';
import ReportsManager from '@/components/reports/ReportsManager';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const user = await getCurrentUser();

  // Strona raportów jest dostępna wyłącznie dla administratora
  if (!user || user.role !== 'ADMIN') {
    redirect('/');
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <Navigation user={user} />
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        <ReportsManager />
      </main>
    </div>
  );
}
