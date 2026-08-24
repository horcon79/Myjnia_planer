'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  CalendarDays, 
  PlusCircle, 
  Tv2, 
  Settings2, 
  LogOut, 
  UserCircle2, 
  Droplets,
  Wrench,
  Car,
  BadgeCheck,
  Sparkles,
  ShieldAlert,
  BarChart3
} from 'lucide-react';
import { SessionUser, logout } from '@/actions/auth';

interface NavigationProps {
  user: SessionUser | null;
}

export default function Navigation({ user }: NavigationProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleLogout = async () => {
    await logout();
    router.push('/');
    router.refresh();
  };

  const navItems = [
    {
      label: 'Planer Myjni',
      href: '/planner',
      icon: CalendarDays,
      role: 'ALL',
      badge: 'Tablet',
    },
    {
      label: 'Zgłoś Mycie',
      href: '/order',
      icon: PlusCircle,
      role: 'ALL',
      badge: 'Działy',
    },
    {
      label: 'Ekran Statusu',
      href: '/summary',
      icon: Tv2,
      role: 'ALL',
      badge: 'Live',
    },
    {
      label: 'Słowniki i Ustawienia',
      href: '/settings',
      icon: Settings2,
      role: 'ADMIN_WASHER',
      badge: null,
    },
    {
      label: 'Raporty',
      href: '/reports',
      icon: BarChart3,
      role: 'ADMIN',
      badge: null,
    },
  ];

  const visibleNavItems = navItems.filter((item) => {
    // Nowa pozycja "Raporty" widoczna wyłącznie dla administratora.
    // Pozostałe pozycje zachowują dotychczasowe zachowanie (widoczne dla wszystkich).
    if (item.role === 'ADMIN') return user?.role === 'ADMIN';
    return true;
  });

  return (
    <header className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20">
          
          {/* Logo & Brand */}
          <Link 
            href={user?.role === 'WASHER' ? '/planner' : '/order'} 
            className="flex items-center gap-3 group"
          >
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 flex items-center justify-center shadow-lg shadow-sky-500/20 group-hover:scale-105 transition-transform">
              <Droplets className="w-6 h-6 md:w-7 md:h-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg md:text-xl tracking-tight text-white group-hover:text-sky-400 transition-colors">
                  MYJNIA PLANER
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400 border border-sky-500/30 uppercase tracking-wider">
                  Salon & Serwis
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium hidden sm:block">
                Zarządzanie kolejką i przepustowością
              </p>
            </div>
          </Link>

          {/* Desktop & Tablet Navigation */}
          <nav className="hidden md:flex items-center gap-2 lg:gap-3">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                    isActive
                      ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/25 scale-100'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                      isActive ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* User Profile / Switcher */}
          <div className="flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/60 rounded-xl p-1.5 md:p-2 pr-3">
                <div 
                  className="w-8 h-8 md:w-9 md:h-9 rounded-lg flex items-center justify-center font-bold text-xs text-white shadow"
                  style={{ backgroundColor: user.color || '#0284c7' }}
                >
                  {user.code || user.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="text-left hidden sm:block">
                  <p className="text-xs font-bold text-white truncate max-w-[130px] leading-tight">
                    {user.name}
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium">
                    {user.role === 'WASHER' ? 'Tablet Myjni' : user.role === 'ADMIN' ? 'Zarządca' : 'Dział Zamawiający'}
                  </p>
                </div>
                <button
                  onClick={handleLogout}
                  title="Zmień profil / wyloguj"
                  className="ml-1 p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-700/50 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <Link
                href="/"
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-all shadow"
              >
                <UserCircle2 className="w-4 h-4" />
                <span>Wybierz Profil</span>
              </Link>
            )}
          </div>

        </div>

        {/* Mobile Navigation bar */}
        <div className="flex md:hidden items-center justify-around py-2 border-t border-slate-800/80 gap-1">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 flex flex-col items-center py-2 px-1 rounded-lg text-center text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-5 h-5 mb-0.5" />
                <span className="text-[11px] leading-tight">{item.label.split(' ')[0]}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
