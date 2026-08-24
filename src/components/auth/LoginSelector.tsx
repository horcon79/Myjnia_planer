'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { loginWithPin, SessionUser } from '@/actions/auth';
import { 
  Car, 
  Wrench, 
  BadgeCheck, 
  Sparkles, 
  Droplets, 
  ShieldAlert, 
  ArrowRight, 
  Lock, 
  CheckCircle2,
  X
} from 'lucide-react';

interface DepartmentItem {
  id: string;
  slug: string;
  name: string;
  code: string;
  color: string;
  icon?: string | null;
  pin: string;
}

interface LoginSelectorProps {
  departments: DepartmentItem[];
  currentUser: SessionUser | null;
}

export default function LoginSelector({ departments, currentUser }: LoginSelectorProps) {
  const router = useRouter();
  const [selectedDept, setSelectedDept] = useState<DepartmentItem | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const getIcon = (slug: string) => {
    switch (slug) {
      case 'handlowy':
        return <Car className="w-8 h-8 text-white" />;
      case 'serwis':
        return <Wrench className="w-8 h-8 text-white" />;
      case 'uzywane':
        return <BadgeCheck className="w-8 h-8 text-white" />;
      case 'omoda':
        return <Sparkles className="w-8 h-8 text-white" />;
      case 'myjnia':
        return <Droplets className="w-8 h-8 text-white" />;
      default:
        return <ShieldAlert className="w-8 h-8 text-white" />;
    }
  };

  const handleSelect = (dept: DepartmentItem) => {
    setSelectedDept(dept);
    setPinInput(dept.pin || '1234'); // Pre-fill default PIN for quick intranet access
    setErrorMsg('');
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDept) return;

    setLoading(true);
    setErrorMsg('');

    try {
      const res = await loginWithPin(selectedDept.slug, pinInput);
      if (res.success) {
        if (selectedDept.slug === 'myjnia') {
          router.push('/planner');
        } else if (selectedDept.slug === 'admin') {
          router.push('/settings');
        } else {
          router.push('/order');
        }
        router.refresh();
      } else {
        setErrorMsg(res.error || 'Błąd logowania');
      }
    } catch {
      setErrorMsg('Wystąpił nieoczekiwany błąd');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      {/* Current logged in status if any */}
      {currentUser && (
        <div className="mb-6 bg-slate-800/80 border border-sky-500/30 rounded-2xl p-4 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow"
              style={{ backgroundColor: currentUser.color || '#0284c7' }}
            >
              {currentUser.code}
            </div>
            <div>
              <p className="text-xs text-slate-400">Jesteś aktualnie zalogowany jako:</p>
              <p className="text-base font-bold text-white">{currentUser.name}</p>
            </div>
          </div>
          <button
            onClick={() => router.push(currentUser.role === 'WASHER' ? '/planner' : '/order')}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-sm shadow-lg shadow-sky-500/25 transition-all"
          >
            <span>Przejdź do aplikacji</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Department Grid */}
      <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4 text-center">
        Wybierz swój profil lub stanowisko
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {departments.map((dept) => {
          const isWasher = dept.slug === 'myjnia';
          return (
            <button
              key={dept.id}
              onClick={() => handleSelect(dept)}
              className={`p-5 rounded-2xl text-left border transition-all relative overflow-hidden flex flex-col justify-between group ${
                isWasher 
                  ? 'bg-gradient-to-br from-sky-900/60 to-slate-900 border-sky-500/50 hover:border-sky-400 hover:shadow-xl hover:shadow-sky-500/20 col-span-1 sm:col-span-2 lg:col-span-1'
                  : 'bg-slate-900/70 border-slate-800 hover:border-slate-700 hover:bg-slate-800/80 hover:shadow-lg'
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div 
                  className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform"
                  style={{ backgroundColor: dept.color || '#3b82f6' }}
                >
                  {getIcon(dept.slug)}
                </div>
                <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300">
                  {dept.code}
                </span>
              </div>

              <div>
                <h3 className="font-extrabold text-lg text-white group-hover:text-sky-300 transition-colors">
                  {dept.name}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  {isWasher 
                    ? 'Tablet i planer stanowisk myjni' 
                    : dept.slug === 'admin' 
                    ? 'Konfiguracja słowników i limitów'
                    : 'Zgłaszanie aut i podgląd statusów'}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-semibold text-sky-400">
                <span>Zaloguj się</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>
          );
        })}
      </div>

      {/* Modal PIN / Password confirmation */}
      {selectedDept && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl relative animate-in fade-in zoom-in duration-150">
            
            <button
              onClick={() => setSelectedDept(null)}
              className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div 
                className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg text-white shadow-lg"
                style={{ backgroundColor: selectedDept.color }}
              >
                {selectedDept.code}
              </div>
              <div>
                <h3 className="font-extrabold text-xl text-white">{selectedDept.name}</h3>
                <p className="text-xs text-slate-400">Potwierdź kod PIN lub hasło działu</p>
              </div>
            </div>

            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Kod PIN / Hasło
                </label>
                <div className="relative">
                  <Lock className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    placeholder="Wpisz PIN"
                    autoFocus
                    className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono text-lg tracking-widest focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Domyślny PIN: <span className="font-mono text-slate-400">{selectedDept.pin || '1234'}</span>
                </p>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-medium">
                  {errorMsg}
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedDept(null)}
                  className="flex-1 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm transition-colors"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-3.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-sm shadow-lg shadow-sky-500/25 transition-all flex items-center justify-center gap-2"
                >
                  {loading ? 'Logowanie...' : 'Zaloguj'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
