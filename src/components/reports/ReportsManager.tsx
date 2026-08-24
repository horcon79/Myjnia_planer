'use client';

import React, { useState, useCallback } from 'react';
import { getWashReport, WashReport } from '@/actions/reports';
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { pl } from 'date-fns/locale';
import {
  BarChart3,
  FileSpreadsheet,
  Users,
  Building2,
  CalendarRange,
  RefreshCw,
  Download,
  AlertTriangle,
  Sparkles,
  Clock,
} from 'lucide-react';

const presetPresets = [
  { label: 'Dziś', days: 0, month: false },
  { label: 'Ostatnie 7 dni', days: 7, month: false },
  { label: 'Ostatnie 30 dni', days: 30, month: false },
  { label: 'Ten miesiąc', days: -1, month: true },
];

export default function ReportsManager() {
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 6), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [report, setReport] = useState<WashReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadReport = useCallback(async (from: string, to: string) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await getWashReport(from, to);
      if (res.success && res.report) {
        setReport(res.report);
      } else {
        setErrorMsg(res.error || 'Nie udało się pobrać raportu.');
        setReport(null);
      }
    } catch (e) {
      console.error(e);
      setErrorMsg('Wystąpił błąd podczas generowania raportu.');
      setReport(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handlePreset = (preset: { days: number; month: boolean }) => {
    let from: string;
    let to: string;
    if (preset.month) {
      from = format(startOfMonth(new Date()), 'yyyy-MM-dd');
      to = format(endOfMonth(new Date()), 'yyyy-MM-dd');
    } else if (preset.days === 0) {
      from = format(new Date(), 'yyyy-MM-dd');
      to = format(new Date(), 'yyyy-MM-dd');
    } else {
      from = format(subDays(new Date(), preset.days - 1), 'yyyy-MM-dd');
      to = format(new Date(), 'yyyy-MM-dd');
    }
    setDateFrom(from);
    setDateTo(to);
    loadReport(from, to);
  };

  const formatDuration = (min: number) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h === 0) return `${m} min`;
    if (m === 0) return `${h} h`;
    return `${h} h ${m} min`;
  };

  const formatDateRange = () => {
    if (!report) return '—';
    const from = new Date(`${report.dateFrom}T12:00:00`);
    const to = new Date(`${report.dateTo}T12:00:00`);
    return `${format(from, 'd MMM yyyy', { locale: pl })} – ${format(to, 'd MMM yyyy', { locale: pl })}`;
  };

  const escapeHtml = (v: string | number) =>
    String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const exportTableToExcel = (filename: string, title: string, headers: string[], rows: (string | number)[][]) => {
    const thead = `<thead><tr>${headers.map(h => `<th style="background:#0ea5e9;color:#fff;font-weight:bold;padding:8px;border:1px solid #cbd5e1;">${escapeHtml(h)}</th>`).join('')}</tr></thead>`;
    const tbody = `<tbody>${rows.map(r => `<tr>${r.map(c => `<td style="padding:6px;border:1px solid #cbd5e1;">${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody>`;

    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
      <head>
        <meta charset="utf-8">
        <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>${title}</x:Name></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
      </head>
      <body>
        <h2>${escapeHtml(title)}</h2>
        <p><strong>Okres:</strong> ${escapeHtml(formatDateRange())}</p>
        <table border="1">${thead}${tbody}</table>
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff', html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportEmployees = () => {
    if (!report) return;
    const rows = report.employees.map(emp => [
      emp.name,
      emp.code,
      emp.count,
      formatDuration(emp.totalDurationMin),
      report.totalCount > 0 ? `${((emp.count / report.totalCount) * 100).toFixed(1)}%` : '0%',
    ]);
    exportTableToExcel(
      `raport_pracownicy_${report.dateFrom}_${report.dateTo}.xls`,
      'Ilość myć wg pracowników',
      ['Pracownik', 'Skrót', 'Liczba myć', 'Czas łączny', 'Udział %'],
      rows
    );
  };

  const exportDepartments = () => {
    if (!report) return;
    const rows = report.departments.map(dept => [
      dept.name,
      dept.code,
      dept.count,
      formatDuration(dept.totalDurationMin),
      report.totalCount > 0 ? `${((dept.count / report.totalCount) * 100).toFixed(1)}%` : '0%',
    ]);
    exportTableToExcel(
      `raport_dzialy_${report.dateFrom}_${report.dateTo}.xls`,
      'Ilość myć wg działów',
      ['Dział', 'Kod', 'Liczba myć', 'Czas łączny', 'Udział %'],
      rows
    );
  };

  const exportBoth = () => {
    exportEmployees();
    exportDepartments();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-2xl">
            <BarChart3 className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">
              Raporty Myjni
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Zestawienia ilości myć dla administratora, z eksportem do Excela
            </p>
          </div>
        </div>
        {report && (
          <button
            onClick={exportBoth}
            className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs shadow-lg shadow-emerald-500/25 flex items-center gap-2 flex-shrink-0"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Pobierz Excel (oba raporty)</span>
          </button>
        )}
      </div>

      {/* Period selector */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-end gap-4">
          <div className="flex items-center gap-2 mb-1 text-slate-400">
            <CalendarRange className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Zakres dat</span>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Od</label>
              <input
                type="date"
                value={dateFrom}
                max={dateTo}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm font-bold focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Do</label>
              <input
                type="date"
                value={dateTo}
                min={dateFrom}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm font-bold focus:border-emerald-500"
              />
            </div>

            <button
              onClick={() => loadReport(dateFrom, dateTo)}
              disabled={isLoading}
              className="px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs shadow-lg shadow-sky-500/25 flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isLoading ? 'Generowanie...' : 'Generuj raport'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2 lg:ml-auto">
            {presetPresets.map((p) => (
              <button
                key={p.label}
                onClick={() => handlePreset(p)}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {errorMsg && (
          <div className="mt-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {!report && !isLoading && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-16 flex flex-col items-center justify-center text-center gap-4 shadow-xl">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-xl font-black text-white mb-1">Wybierz okres i wygeneruj raport</h3>
            <p className="text-sm text-slate-400 max-w-md">
              Zobaczysz zestawienie ilości wykonanych myć w podziale na pracowników oraz działy zamawiające.
            </p>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-16 flex flex-col items-center justify-center text-center gap-3 shadow-xl">
          <RefreshCw className="w-10 h-10 text-emerald-400 animate-spin" />
          <p className="text-sm font-bold text-slate-300">Generowanie raportu...</p>
        </div>
      )}

      {report && !isLoading && (
        <>
          {/* Summary tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Łączna liczba myć</p>
                <p className="text-2xl font-black text-white">{report.totalCount}</p>
              </div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-sky-500/10 text-sky-400 flex items-center justify-center">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Łączny czas mycia</p>
                <p className="text-2xl font-black text-white">{formatDuration(report.totalDurationMin)}</p>
              </div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <CalendarRange className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Okres</p>
                <p className="text-lg font-black text-white">{formatDateRange()}</p>
              </div>
            </div>
          </div>

          {/* Employees table */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-black text-white">Ilość myć wg pracowników</h2>
                  <p className="text-[11px] text-slate-400">Wykonane mycia w zadanym okresie</p>
                </div>
              </div>
              <button
                onClick={exportEmployees}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Excel
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    <th className="py-2.5 pr-3 font-bold">Pracownik</th>
                    <th className="py-2.5 pr-3 font-bold text-right">Liczba myć</th>
                    <th className="py-2.5 pr-3 font-bold text-right">Czas łączny</th>
                    <th className="py-2.5 font-bold text-right">Udział</th>
                  </tr>
                </thead>
                <tbody>
                  {report.employees.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-500">
                        Brak myć w wybranym okresie.
                      </td>
                    </tr>
                  )}
                  {report.employees.map((emp) => (
                    <tr key={emp.id} className="border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-[11px] text-white flex-shrink-0"
                            style={{ backgroundColor: emp.color }}
                          >
                            {emp.code.slice(0, 2).toUpperCase()}
                          </div>
                          <span className="font-bold text-white">{emp.name}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-3 text-right">
                        <span className="font-mono font-black text-emerald-400">{emp.count}</span>
                      </td>
                      <td className="py-3 pr-3 text-right text-slate-300 text-xs">{formatDuration(emp.totalDurationMin)}</td>
                      <td className="py-3 text-right">
                        <span className="text-xs font-bold text-slate-300">
                          {report.totalCount > 0 ? `${((emp.count / report.totalCount) * 100).toFixed(1)}%` : '0%'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Departments table */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-black text-white">Ilość myć wg działów</h2>
                  <p className="text-[11px] text-slate-400">Zamówienia wykonane w podziale na działy</p>
                </div>
              </div>
              <button
                onClick={exportDepartments}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Excel
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    <th className="py-2.5 pr-3 font-bold">Dział</th>
                    <th className="py-2.5 pr-3 font-bold text-right">Liczba myć</th>
                    <th className="py-2.5 pr-3 font-bold text-right">Czas łączny</th>
                    <th className="py-2.5 font-bold text-right">Udział</th>
                  </tr>
                </thead>
                <tbody>
                  {report.departments.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-500">
                        Brak myć w wybranym okresie.
                      </td>
                    </tr>
                  )}
                  {report.departments.map((dept) => (
                    <tr key={dept.id} className="border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-[11px] text-white flex-shrink-0"
                            style={{ backgroundColor: dept.color }}
                          >
                            {dept.code.slice(0, 2).toUpperCase()}
                          </div>
                          <span className="font-bold text-white">{dept.name}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-3 text-right">
                        <span className="font-mono font-black text-amber-400">{dept.count}</span>
                      </td>
                      <td className="py-3 pr-3 text-right text-slate-300 text-xs">{formatDuration(dept.totalDurationMin)}</td>
                      <td className="py-3 text-right">
                        <span className="text-xs font-bold text-slate-300">
                          {report.totalCount > 0 ? `${((dept.count / report.totalCount) * 100).toFixed(1)}%` : '0%'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
