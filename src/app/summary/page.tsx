import React from 'react';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/actions/auth';
import Navigation from '@/components/Navigation';
import SalonDashboard from '@/components/summary/SalonDashboard';

export const dynamic = 'force-dynamic';

export default async function SummaryPage() {
  const user = await getCurrentUser();

  const [departments, categories] = await Promise.all([
    prisma.department.findMany({ where: { isActive: true }, orderBy: { order: 'asc' } }),
    prisma.washCategory.findMany({ where: { isActive: true }, orderBy: { order: 'asc' } }),
  ]);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <Navigation user={user} />
      <main className="flex-1 w-full p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto flex flex-col">
        <SalonDashboard
          currentUser={user}
          departments={departments}
          categories={categories}
        />
      </main>
    </div>
  );
}
