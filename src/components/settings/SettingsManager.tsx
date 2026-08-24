'use client';

import React, { useState } from 'react';
import { SessionUser } from '@/actions/auth';
import { upsertCategory, deleteCategory } from '@/actions/categories';
import { upsertDepartment, toggleDepartmentActive } from '@/actions/departments';
import { upsertEmployee, toggleEmployeeActive } from '@/actions/employees';
import { updateAppSetting } from '@/actions/settings';
import { 
  Settings, 
  Layers, 
  Users, 
  Building2, 
  Plus, 
  Edit3, 
  Trash2, 
  Check, 
  Save, 
  ShieldCheck, 
  Clock, 
  Palette, 
  Sparkles,
  Sliders,
  X
} from 'lucide-react';
import { useRouter } from 'next/navigation';

interface SettingsManagerProps {
  currentUser: SessionUser | null;
  isAdmin: boolean;
  initialDepartments: any[];
  initialCategories: any[];
  initialEmployees: any[];
  initialSettings: Record<string, string>;
}

export default function SettingsManager({
  currentUser,
  isAdmin,
  initialDepartments,
  initialCategories,
  initialEmployees,
  initialSettings,
}: SettingsManagerProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'categories' | 'departments' | 'employees' | 'capacity'>('categories');

  // Categories state
  const [categories, setCategories] = useState<any[]>(initialCategories);
  const [catModal, setCatModal] = useState<any | null>(null);

  // Departments state
  const [departments, setDepartments] = useState<any[]>(initialDepartments);
  const [deptModal, setDeptModal] = useState<any | null>(null);

  // Employees state
  const [employees, setEmployees] = useState<any[]>(initialEmployees);
  const [empModal, setEmpModal] = useState<any | null>(null);

  // Capacity settings state
  const [settings, setSettings] = useState<Record<string, string>>(initialSettings);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSavedMsg, setSettingsSavedMsg] = useState(false);

  // Category Save
  const handleSaveCategory = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const name = (form.elements.namedItem('cat-name') as HTMLInputElement).value;
    const duration = parseInt((form.elements.namedItem('cat-duration') as HTMLInputElement).value, 10);
    const color = (form.elements.namedItem('cat-color') as HTMLInputElement).value;
    const desc = (form.elements.namedItem('cat-desc') as HTMLInputElement).value;
    const notes = (form.elements.namedItem('cat-notes') as HTMLInputElement).value;

    const res = await upsertCategory({
      id: catModal?.id,
      name,
      defaultDurationMin: duration,
      color,
      description: desc,
      suggestedNotes: notes,
    });

    if (res.success && res.category) {
      if (catModal?.id) {
        setCategories(prev => prev.map(c => c.id === res.category.id ? res.category : c));
      } else {
        setCategories(prev => [...prev, res.category]);
      }
      setCatModal(null);
      router.refresh();
    }
  };

  // Department Save
  const handleSaveDepartment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const name = (form.elements.namedItem('dept-name') as HTMLInputElement).value;
    const slug = (form.elements.namedItem('dept-slug') as HTMLInputElement).value;
    const code = (form.elements.namedItem('dept-code') as HTMLInputElement).value;
    const color = (form.elements.namedItem('dept-color') as HTMLInputElement).value;
    const pin = (form.elements.namedItem('dept-pin') as HTMLInputElement).value;

    const res = await upsertDepartment({
      id: deptModal?.id,
      name,
      slug,
      code,
      color,
      pin,
    });

    if (res.success && res.department) {
      if (deptModal?.id) {
        setDepartments(prev => prev.map(d => d.id === res.department.id ? res.department : d));
      } else {
        setDepartments(prev => [...prev, res.department]);
      }
      setDeptModal(null);
      router.refresh();
    }
  };

  // Employee Save
  const handleSaveEmployee = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const name = (form.elements.namedItem('emp-name') as HTMLInputElement).value;
    const shortName = (form.elements.namedItem('emp-short') as HTMLInputElement).value;
    const color = (form.elements.namedItem('emp-color') as HTMLInputElement).value;

    const res = await upsertEmployee({
      id: empModal?.id,
      name,
      shortName,
      color,
    });

    if (res.success && res.employee) {
      if (empModal?.id) {
        setEmployees(prev => prev.map(emp => emp.id === res.employee.id ? res.employee : emp));
      } else {
        setEmployees(prev => [...prev, res.employee]);
      }
      setEmpModal(null);
      router.refresh();
    }
  };

  // Settings Save
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await updateAppSetting('MAX_SIMULTANEOUS_CARS', settings.MAX_SIMULTANEOUS_CARS);
      await updateAppSetting('DELIVERY_CAR_WEIGHT', settings.DELIVERY_CAR_WEIGHT);
      await updateAppSetting('WORK_START_HOUR', settings.WORK_START_HOUR);
      await updateAppSetting('WORK_END_HOUR', settings.WORK_END_HOUR);
      await updateAppSetting('HIDE_DEFAULT_PINS', settings.HIDE_DEFAULT_PINS === 'true' ? 'true' : 'false');
      setSettingsSavedMsg(true);
      setTimeout(() => setSettingsSavedMsg(false), 3000);
      router.refresh();
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="space-y-8">
      
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-sky-500/10 text-sky-400 rounded-2xl">
            <Settings className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight">
              Słowniki i Konfiguracja Systemu
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Zarządzaj usługami, czasami mycia, komentarzami, pracownikami i limitami przepustowości
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
        {/* Kategorie – tylko admin */}
        {isAdmin ? (
          <button
            onClick={() => setActiveTab('categories')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all flex-shrink-0 ${
              activeTab === 'categories'
                ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/25'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Kategorie i Czasy Mycia ({categories.length})</span>
          </button>
        ) : (
          <div
            className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm flex-shrink-0 bg-slate-900/50 text-slate-600 border border-slate-800/50 cursor-not-allowed select-none"
            title="Tylko administrator może zarządzać kategoriami"
          >
            <Sparkles className="w-4 h-4" />
            <span>Kategorie i Czasy Mycia</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 uppercase font-black">ADMIN</span>
          </div>
        )}

        {/* Działy – tylko admin */}
        {isAdmin ? (
          <button
            onClick={() => setActiveTab('departments')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all flex-shrink-0 ${
              activeTab === 'departments'
                ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/25'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Działy Salonu i PINy ({departments.length})</span>
          </button>
        ) : (
          <div
            className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm flex-shrink-0 bg-slate-900/50 text-slate-600 border border-slate-800/50 cursor-not-allowed select-none"
            title="Tylko administrator może zarządzać działami"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Działy Salonu</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 uppercase font-black">ADMIN</span>
          </div>
        )}

        {/* Pracownicy – tylko admin */}
        {isAdmin ? (
          <button
            onClick={() => setActiveTab('employees')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all flex-shrink-0 ${
              activeTab === 'employees'
                ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/25'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Pracownicy Myjni ({employees.length})</span>
          </button>
        ) : (
          <div
            className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm flex-shrink-0 bg-slate-900/50 text-slate-600 border border-slate-800/50 cursor-not-allowed select-none"
            title="Tylko administrator może zarządzać pracownikami"
          >
            <Users className="w-4 h-4" />
            <span>Pracownicy Myjni</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 uppercase font-black">ADMIN</span>
          </div>
        )}

        {/* Reguły Przepustowości – tylko admin */}
        {isAdmin ? (
          <button
            onClick={() => setActiveTab('capacity')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all flex-shrink-0 ${
              activeTab === 'capacity'
                ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/25'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Reguły Przepustowości Myjni</span>
          </button>
        ) : (
          <div
            className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm flex-shrink-0 bg-slate-900/50 text-slate-600 border border-slate-800/50 cursor-not-allowed select-none"
            title="Tylko administrator może zmieniać reguły przepustowości"
          >
            <Sliders className="w-4 h-4" />
            <span>Reguły Przepustowości Myjni</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 uppercase font-black">ADMIN</span>
          </div>
        )}
      </div>

      {/* TAB 1: Categories / Wash Services */}
      {activeTab === 'categories' && (
        !isAdmin ? (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-16 flex flex-col items-center justify-center text-center gap-4 shadow-xl">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 flex items-center justify-center">
              <ShieldCheck className="w-8 h-8 text-rose-400" />
            </div>
            <div>
              <h3 className="text-xl font-black text-white mb-1">Dostęp tylko dla Administratora</h3>
              <p className="text-sm text-slate-400 max-w-sm">Zarządzanie kategoriami usług i czasami mycia jest zarezerwowane wyłącznie dla konta administratora systemu.</p>
            </div>
          </div>
        ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Lista Usług i Czasów Trwania</h2>
            <button
              onClick={() => setCatModal({ defaultDurationMin: 30, color: '#3b82f6' })}
              className="px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs shadow-lg shadow-sky-500/25 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>+ Dodaj Nową Usługę</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between hover:border-slate-700 transition-colors"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      <h3 className="font-extrabold text-base text-white">{cat.name}</h3>
                    </div>
                    <span className="font-mono font-black text-xs px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-sky-400">
                      ⏱ {cat.defaultDurationMin} min ({cat.defaultDurationMin >= 60 ? `${(cat.defaultDurationMin / 60).toFixed(1)}h` : `${cat.defaultDurationMin}m`})
                    </span>
                  </div>

                  {cat.description && (
                    <p className="text-xs text-slate-400 mb-3">{cat.description}</p>
                  )}

                  {cat.suggestedNotes && (
                    <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 mb-3">
                      <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                        Szablony komentarzy / uwag:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {cat.suggestedNotes.split(',').map((tag: string, idx: number) => (
                          <span key={idx} className="text-[11px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-md">
                            {tag.trim()}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800/80">
                  <button
                    onClick={() => setCatModal(cat)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors flex items-center gap-1.5"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edytuj</span>
                  </button>
                  <button
                    onClick={async () => {
                      if (confirm(`Czy na pewno usunąć kategorię "${cat.name}"?`)) {
                        await deleteCategory(cat.id);
                        setCategories(prev => prev.filter(c => c.id !== cat.id));
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 text-xs font-bold transition-colors flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Usuń</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        )
      )}

      {/* TAB 2: Departments */}
      {activeTab === 'departments' && (
        !isAdmin ? (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-16 flex flex-col items-center justify-center text-center gap-4 shadow-xl">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 flex items-center justify-center">
              <ShieldCheck className="w-8 h-8 text-rose-400" />
            </div>
            <div>
              <h3 className="text-xl font-black text-white mb-1">Dostęp tylko dla Administratora</h3>
              <p className="text-sm text-slate-400 max-w-sm">Zarządzanie działami salonu i kodami PIN jest zarezerwowane wyłącznie dla konta administratora systemu.</p>
            </div>
          </div>
        ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Działy Salonu i Kody Dostępowe</h2>
            <button
              onClick={() => setDeptModal({ color: '#2563eb', pin: '1234' })}
              className="px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs shadow-lg shadow-sky-500/25 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>+ Dodaj Nowy Dział</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {departments.map((dept) => (
              <div
                key={dept.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow"
                      style={{ backgroundColor: dept.color }}
                    >
                      {dept.code}
                    </div>
                    <span className="font-mono text-xs text-slate-400 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                      PIN: {dept.pin}
                    </span>
                  </div>

                  <h3 className="font-extrabold text-base text-white">{dept.name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Identyfikator: {dept.slug}</p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800/80 mt-4">
                  <button
                    onClick={() => setDeptModal(dept)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors flex items-center gap-1.5"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edytuj</span>
                  </button>

                  <button
                    onClick={async () => {
                      if (confirm(`Czy na pewno usunąć dział "${dept.name}"? Spowoduje to również usunięcie powiązanych zleceń.`)) {
                        const { deleteDepartment } = await import('@/actions/departments');
                        await deleteDepartment(dept.id);
                        setDepartments(prev => prev.filter(d => d.id !== dept.id));
                        router.refresh();
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 text-xs font-bold transition-colors flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Usuń</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        )
      )}

      {/* TAB 3: Employees */}
      {activeTab === 'employees' && (
        !isAdmin ? (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-16 flex flex-col items-center justify-center text-center gap-4 shadow-xl">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 flex items-center justify-center">
              <ShieldCheck className="w-8 h-8 text-rose-400" />
            </div>
            <div>
              <h3 className="text-xl font-black text-white mb-1">Dostęp tylko dla Administratora</h3>
              <p className="text-sm text-slate-400 max-w-sm">Zarządzanie pracownikami myjni jest zarezerwowane wyłącznie dla konta administratora systemu.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Pracownicy Myjni</h2>
            <button
              onClick={() => setEmpModal({ color: '#10b981' })}
              className="px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs shadow-lg shadow-sky-500/25 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>+ Dodaj Pracownika</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {employees.map((emp) => (
              <div
                key={emp.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-sm text-white shadow-lg"
                    style={{ backgroundColor: emp.color }}
                  >
                    {emp.shortName.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base text-white">{emp.name}</h3>
                    <p className="text-xs text-slate-400">Skrót: {emp.shortName}</p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800/80 mt-4">
                  <button
                    onClick={() => setEmpModal(emp)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors flex items-center gap-1.5"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edytuj</span>
                  </button>

                  <button
                    onClick={async () => {
                      if (confirm(`Czy na pewno usunąć pracownika "${emp.name}"?`)) {
                        const { deleteEmployee } = await import('@/actions/employees');
                        await deleteEmployee(emp.id);
                        setEmployees(prev => prev.filter(e => e.id !== emp.id));
                        router.refresh();
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 text-xs font-bold transition-colors flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Usuń</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        )
      )}

      {/* TAB 4: Capacity & Shop Rules */}
      {activeTab === 'capacity' && (
        !isAdmin ? (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-16 flex flex-col items-center justify-center text-center gap-4 shadow-xl">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 flex items-center justify-center">
              <ShieldCheck className="w-8 h-8 text-rose-400" />
            </div>
            <div>
              <h3 className="text-xl font-black text-white mb-1">Dostęp tylko dla Administratora</h3>
              <p className="text-sm text-slate-400 max-w-sm">Zmiana reguł przepustowości myjni jest zarezerwowana wyłącznie dla konta administratora systemu.</p>
            </div>
          </div>
        ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl max-w-2xl">
          <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
            <Sliders className="w-6 h-6 text-sky-400" />
            Konfiguracja Przepustowości Myjni
          </h2>
          <p className="text-xs text-slate-400 mb-6">
            Ustal limity aut mytych jednocześnie oraz godziny pracy
          </p>

          <form onSubmit={handleSaveSettings} className="space-y-6">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Maksymalna Liczba Aut Mytych Jednocześnie
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={settings.MAX_SIMULTANEOUS_CARS}
                onChange={(e) => setSettings(prev => ({ ...prev, MAX_SIMULTANEOUS_CARS: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-lg font-bold focus:border-sky-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Domyślnie 3 auta na raz (np. 3 osobowe lub 1 dostawczy + 1 osobowy). Pracownicy mogą ręcznie dodać kolejne auto w razie potrzeby.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Godzina Otwarcia Myjni
                </label>
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={settings.WORK_START_HOUR}
                  onChange={(e) => setSettings(prev => ({ ...prev, WORK_START_HOUR: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono font-bold focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Godzina Zamknięcia Myjni
                </label>
                <input
                  type="number"
                  min="0"
                  max="24"
                  value={settings.WORK_END_HOUR}
                  onChange={(e) => setSettings(prev => ({ ...prev, WORK_END_HOUR: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono font-bold focus:border-sky-500"
                />
              </div>
            </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Bezpieczeństwo Logowania
                </label>
                <label className="flex items-start gap-3 p-4 rounded-xl bg-slate-950 border border-slate-700 cursor-pointer transition-colors hover:border-sky-500/50">
                  <input
                    type="checkbox"
                    checked={settings.HIDE_DEFAULT_PINS === 'true'}
                    onChange={(e) => setSettings(prev => ({ ...prev, HIDE_DEFAULT_PINS: e.target.checked ? 'true' : 'false' }))}
                    className="mt-0.5 w-5 h-5 rounded-md accent-sky-500 cursor-pointer"
                  />
                  <span>
                    <span className="block text-sm font-bold text-white">Nie podpowiadaj domyślnych haseł przy logowaniu</span>
                    <span className="block text-[11px] text-slate-500 mt-1">
                      Ukrywa podpowiedzi PIN oraz nie uzupełnia pola hasła na ekranie logowania.
                      Działy będą musiały znać swój kod PIN, aby się zalogować.
                    </span>
                  </span>
                </label>
              </div>

            {settingsSavedMsg && (
              <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-2">
                <Check className="w-4 h-4" />
                <span>Ustawienia zostały pomyślnie zapisane!</span>
              </div>
            )}

            <button
              type="submit"
              disabled={savingSettings}
              className="w-full py-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-extrabold text-sm shadow-xl shadow-sky-500/25 transition-all flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>Zapisz Ustawienia Przepustowości</span>
            </button>
          </form>
        </div>
        )
      )}

      {/* Modal Category Edit */}
      {catModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 sm:p-7 w-full max-w-lg shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-extrabold text-lg text-white">
                {catModal.id ? 'Edytuj Usługę Mycia' : 'Dodaj Nową Usługę Mycia'}
              </h3>
              <button onClick={() => setCatModal(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Nazwa Usługi *</label>
                <input
                  name="cat-name"
                  required
                  defaultValue={catModal.name || ''}
                  placeholder="np. Przygotowanie nowego auta do wydania"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:border-sky-500 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Czas Trwania (minuty) *</label>
                  <input
                    name="cat-duration"
                    type="number"
                    required
                    step="5"
                    defaultValue={catModal.defaultDurationMin || 30}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-base font-mono font-bold focus:border-sky-500"
                  />
                  <span className="text-[10px] text-slate-500">np. 30 (pół godz.), 120 (2h), 150 (2.5h)</span>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Kolor Etykiety</label>
                  <input
                    name="cat-color"
                    type="color"
                    defaultValue={catModal.color || '#3b82f6'}
                    className="w-full h-11 rounded-xl bg-slate-950 border border-slate-700 cursor-pointer p-1"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Opis Usługi</label>
                <input
                  name="cat-desc"
                  defaultValue={catModal.description || ''}
                  placeholder="np. Mycie z zewnątrz + szyby bez smug"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Szablony Komentarzy / Podpowiedzi
                </label>
                <input
                  name="cat-notes"
                  defaultValue={catModal.suggestedNotes || ''}
                  placeholder="Wydanie VIP, Odkurzanie, Usunięcie kleju (po przecinku)"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:border-sky-500"
                />
                <span className="text-[10px] text-slate-500">Wpisz podpowiedzi rozdzielone przecinkami</span>
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setCatModal(null)}
                  className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs shadow-lg"
                >
                  Zapisz
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Department Edit */}
      {deptModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-lg shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-extrabold text-lg text-white">
                {deptModal.id ? 'Edytuj Dział' : 'Dodaj Dział'}
              </h3>
              <button onClick={() => setDeptModal(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDepartment} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Nazwa Działu *</label>
                <input
                  name="dept-name"
                  required
                  defaultValue={deptModal.name || ''}
                  placeholder="np. Dział Handlowy"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Skrót (2-3 litery) *</label>
                  <input
                    name="dept-code"
                    required
                    maxLength={4}
                    defaultValue={deptModal.code || ''}
                    placeholder="DH"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono font-bold uppercase"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Identyfikator (slug) *</label>
                  <input
                    name="dept-slug"
                    required
                    defaultValue={deptModal.slug || ''}
                    placeholder="handlowy"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Kod PIN / Hasło *</label>
                  <input
                    name="dept-pin"
                    required
                    defaultValue={deptModal.pin || '1234'}
                    placeholder="1234"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Kolor Działu</label>
                  <input
                    name="dept-color"
                    type="color"
                    defaultValue={deptModal.color || '#2563eb'}
                    className="w-full h-11 rounded-xl bg-slate-950 border border-slate-700 cursor-pointer p-1"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setDeptModal(null)}
                  className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs shadow-lg"
                >
                  Zapisz Dział
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Employee Edit */}
      {empModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-md shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-extrabold text-lg text-white">
                {empModal.id ? 'Edytuj Pracownika' : 'Dodaj Pracownika Myjni'}
              </h3>
              <button onClick={() => setEmpModal(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEmployee} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Imię i Nazwisko *</label>
                <input
                  name="emp-name"
                  required
                  defaultValue={empModal.name || ''}
                  placeholder="np. Marek Kowalski"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Skrót na Kafelku *</label>
                  <input
                    name="emp-short"
                    required
                    defaultValue={empModal.shortName || ''}
                    placeholder="Marek K."
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Kolor Avatara</label>
                  <input
                    name="emp-color"
                    type="color"
                    defaultValue={empModal.color || '#10b981'}
                    className="w-full h-11 rounded-xl bg-slate-950 border border-slate-700 cursor-pointer p-1"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setEmpModal(null)}
                  className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs shadow-lg"
                >
                  Zapisz Pracownika
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
