import React from 'react';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/actions/auth';
import { redirect } from 'next/navigation';
import LoginSelector from '@/components/auth/LoginSelector';
import { Droplets, Sparkles, ShieldCheck } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const user = await getCurrentUser();
  
  const departments = await prisma.department.findMany({
    where: { isActive: true },
    orderBy: { order: 'asc' },
  });

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex flex-col justify-center items-center p-4 sm:p-6 lg:p-12 relative overflow-hidden">
      
      {/* Decorative background glows */}
      <div className="absolute top-1/4 -left-48 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-48 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-4xl z-10 flex flex-col items-center">
        
        {/* Header Branding */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="inline-flex items-center justify-center p-4 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 shadow-xl shadow-sky-500/25 mb-4 animate-bounce-slow">
            <Droplets className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white uppercase">
            MYJNIA PLANER
          </h1>
          <p className="text-slate-400 mt-2 text-sm sm:text-base max-w-lg mx-auto">
            Wewnętrzny system harmonogramowania i kolejkowania aut dla działów salonu i serwisu
          </p>
        </div>

        {/* Profile Card Selector */}
        <div className="w-full">
          <LoginSelector departments={departments} currentUser={user} />
        </div>

        {/* Footer info */}
        <div className="mt-12 text-center text-xs text-slate-500 flex items-center justify-center gap-4">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Środowisko Intranetowe
          </span>
          <span>•</span>
          <span>Wersja Salon 2026</span>
        </div>

      </div>
    </main>
  );
}
