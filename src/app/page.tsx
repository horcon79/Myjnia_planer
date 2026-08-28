import React from 'react';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/actions/auth';
import LoginSelector from '@/components/auth/LoginSelector';
import { AnimatedDroplet } from '@/components/AnimatedDroplet';
import { getAppVersion } from '@/lib/version';
import { ShieldCheck } from 'lucide-react';
import { getServerI18n } from '@/i18n/server';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const user = await getCurrentUser();
  const appVersion = getAppVersion();
  const { messages } = await getServerI18n();

  const [departments, settingsList] = await Promise.all([
    prisma.department.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
    }),
    prisma.appSetting.findMany(),
  ]);

  const hideDefaultPins = settingsList.find(s => s.key === 'HIDE_DEFAULT_PINS')?.value === 'true';

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex flex-col justify-center items-center p-4 sm:p-6 lg:p-12 relative overflow-hidden">
      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
        <LanguageSwitcher />
      </div>

      <div className="absolute top-1/4 -left-48 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-48 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-4xl z-10 flex flex-col items-center">
        <div className="text-center mb-8 sm:mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-white shadow-xl shadow-sky-500/25 mb-4 overflow-hidden">
            <AnimatedDroplet size={64} />
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white uppercase">
            {messages.common.appName}
          </h1>
          <p className="text-slate-400 mt-2 text-sm sm:text-base max-w-lg mx-auto">
            {messages.home.subtitle}
          </p>
        </div>

        <div className="w-full">
          <LoginSelector departments={departments} currentUser={user} hideDefaultPins={hideDefaultPins} />
        </div>

        <div className="mt-12 text-center text-xs text-slate-500 flex items-center justify-center gap-4">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            {messages.home.intranet}
          </span>
          <span>•</span>
          <span>{messages.common.version} {appVersion}</span>
        </div>
      </div>
    </main>
  );
}
