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
  UserPlus,
  Zap,
  ShieldAlert,
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
      dept.expressCount || 0,
      dept.count > 0 ? `${(( (dept.expressCount || 0) / dept.count) * 100).toFixed(1)}%` : '0%',
      dept.enteredByWashCount,
      dept.count > 0 ? `${((dept.enteredByWashCount / dept.count) * 100).toFixed(1)}%` : '0%',
    ]);
    exportTableToExcel(
      `raport_dzialy_${report.dateFrom}_${report.dateTo}.xls`,
      'Ilość myć wg działów i audyt ekspresów',
      ['Dział', 'Kod', 'Liczba myć', 'Czas łączny', 'Udział w myjni %', 'Liczba Ekspres (Wrzutki)', 'Ekspresy % w dziale', 'Wprowadzone przez myjnię', 'Wpisy myjni %'],
      rows
    );
  };

  const exportExpressAudit = () => {
    if (!report || !report.expressOrders) return;
    const rows = report.expressOrders.map(ord => [
      format(new Date(ord.createdAt), 'yyyy-MM-dd HH:mm'),
      ord.orderNumber,
      ord.licensePlate,
      ord.carModel || '—',
      ord.departmentName,
      ord.priorityAuthorizer || 'Brak danych',
      ord.priorityReason || 'Wydanie natychmiastowe',
      ord.status === 'COMPLETED' ? 'Wydane' : ord.status === 'READY' ? 'Gotowe' : ord.status === 'IN_PROGRESS' ? 'W trakcie' : 'W kolejce',
      ord.assignedEmployeeName || '—',
      ord.completedAt ? format(new Date(ord.completedAt), 'yyyy-MM-dd HH:mm') : '—',
    ]);
    exportTableToExcel(
      `audit_log_ekspres_${report.dateFrom}_${report.dateTo}.xls`,
      'Rejestr Audytowy Zleceń Ekspresowych (Dla Dyrekcji)',
      ['Data zgłoszenia', 'Nr Zlecenia', 'Nr Rejestracyjny', 'Model', 'Dział', 'Osoba Decyzyjna (Zatwierdzający)', 'Uzasadnienie wrzutki', 'Status', 'Pracownik myjący', 'Zakończono'],
      rows
    );
  };

  const exportAll = () => {
    exportEmployees();
    exportDepartments();
    if (report?.expressOrders && report.expressOrders.length > 0) {
      exportExpressAudit();
    }
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
            onClick={exportAll}
            className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs shadow-lg shadow-emerald-500/25 flex items-center gap-2 flex-shrink-0"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Pobierz Excel (Wszystkie raporty + Audyt)</span>
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
              Zobaczysz zestawienie ilości wykonanych myć w podziale na pracowników, działy zamawiające oraz pełny rejestr audytowy zleceń ekspresowych.
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Łączna liczba myć</p>
                <p className="text-2xl font-black text-white">{report.totalCount}</p>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-sky-500/10 text-sky-400 flex items-center justify-center flex-shrink-0">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Łączny czas mycia</p>
                <p className="text-2xl font-black text-white">{formatDuration(report.totalDurationMin)}</p>
              </div>
            </div>

            {/* Express / Urgent Orders KPI */}
            <div className="bg-gradient-to-br from-amber-950/50 to-slate-900 border border-amber-500/60 rounded-3xl p-5 shadow-xl flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0 font-black shadow">
                <Zap className="w-6 h-6 fill-current" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                  Zlecenia Ekspres
                  <span className="block text-[9px] text-amber-200/80 normal-case font-semibold">
                    Wrzutki poza kolejką
                  </span>
                </p>
                <p className="text-2xl font-black text-white">
                  {report.expressCount}
                  <span className="text-sm font-bold text-amber-300 ml-1.5">
                    ({report.expressSharePercent}%)
                  </span>
                </p>
              </div>
            </div>

            <div className="bg-slate-900 border border-violet-500/40 rounded-3xl p-5 shadow-xl flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-violet-500/10 text-violet-400 flex items-center justify-center flex-shrink-0">
                <UserPlus className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Wprowadzone przez myjnię
                  <span className="block text-[9px] text-violet-300/80 normal-case font-semibold" title="Auta wpisane ręcznie przez myjnię — bez wcześniejszego planowania przez dział">
                    poza planem działów
                  </span>
                </p>
                <p className="text-2xl font-black text-white">
                  {report.enteredByWashCount}
                  <span className="text-sm font-bold text-violet-300 ml-1.5">
                    {report.totalCount > 0 ? `(${((report.enteredByWashCount / report.totalCount) * 100).toFixed(1)}%)` : ''}
                  </span>
                </p>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl flex items-center gap-4 sm:col-span-2 lg:col-span-1">
              <div className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-300 flex items-center justify-center flex-shrink-0">
                <CalendarRange className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Okres</p>
                <p className="text-sm font-black text-white">{formatDateRange()}</p>
              </div>
            </div>
          </div>

          {/* Departments table (Zestawienie liczby myć i ekspresów wg działów) */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-black text-white">Ilość myć i zleceń Ekspres wg działów</h2>
                  <p className="text-[11px] text-slate-400">Zamówienia wykonane z podziałem na działy i udziałem zleceń priorytetowych</p>
                </div>
              </div>
              <button
                onClick={exportDepartments}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Excel (Działy)
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    <th className="py-2.5 pr-3 font-bold">Dział</th>
                    <th className="py-2.5 pr-3 font-bold text-right">Liczba myć</th>
                    <th className="py-2.5 pr-3 font-bold text-right">Czas łączny</th>
                    <th className="py-2.5 pr-3 font-bold text-right text-amber-400">Zlecenia Ekspres (Wrzutki)</th>
                    <th className="py-2.5 pr-3 font-bold text-right text-amber-300/80">% Ekspresów</th>
                    <th className="py-2.5 pr-3 font-bold text-right" title="Auta wpisane ręcznie przez myjnię — bez planowania działu">
                      Wpisy myjni
                    </th>
                    <th className="py-2.5 font-bold text-right">Udział w salonie</th>
                  </tr>
                </thead>
                <tbody>
                  {report.departments.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
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
                        <span className="font-mono font-black text-white">{dept.count}</span>
                      </td>
                      <td className="py-3 pr-3 text-right text-slate-300 text-xs">{formatDuration(dept.totalDurationMin)}</td>
                      <td className="py-3 pr-3 text-right">
                        {dept.expressCount > 0 ? (
                          <span className="inline-flex items-center gap-1 font-mono font-black text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/30">
                            <Zap className="w-3 h-3 fill-current" />
                            {dept.expressCount}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-600 font-bold">0</span>
                        )}
                      </td>
                      <td className="py-3 pr-3 text-right">
                        <span className={`text-xs font-bold ${dept.expressSharePercent > 20 ? 'text-amber-400 font-black' : 'text-slate-400'}`}>
                          {dept.expressSharePercent}%
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-right">
                        {dept.enteredByWashCount > 0 ? (
                          <span className="inline-flex items-center gap-1.5 font-mono font-black text-violet-400" title="Liczba aut wprowadzonych ręcznie przez myjnię">
                            <UserPlus className="w-3.5 h-3.5" />
                            {dept.enteredByWashCount}
                            <span className="text-[10px] font-bold text-violet-300/70">
                              ({dept.count > 0 ? `${((dept.enteredByWashCount / dept.count) * 100).toFixed(0)}%` : '0%'})
                            </span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-600 font-bold">0</span>
                        )}
                      </td>
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

          {/* Dedykowana Sekcja Audytu: Audit Log Zleceń Ekspresowych (Dla Dyrekcji) */}
          <div className="bg-gradient-to-br from-red-950/30 via-amber-950/20 to-slate-900 border-2 border-amber-500/50 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-amber-500/30">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base sm:text-lg font-black text-white uppercase tracking-tight">
                      Rejestr Audytowy Zleceń Ekspresowych (Audit Log)
                    </h2>
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      {report.expressOrders ? report.expressOrders.length : 0} zgłoszeń
                    </span>
                  </div>
                  <p className="text-xs text-amber-200/80 mt-0.5">
                    Narzędzie kontrolne dla Dyrekcji: wykaz kto, kiedy i z jakim uzasadnieniem wprowadził auto poza kolejnością
                  </p>
                </div>
              </div>

              {report.expressOrders && report.expressOrders.length > 0 && (
                <button
                  onClick={exportExpressAudit}
                  className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 flex items-center gap-1.5 transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Pobierz Audit Log (Excel)</span>
                </button>
              )}
            </div>

            {(!report.expressOrders || report.expressOrders.length === 0) ? (
              <div className="p-8 text-center text-slate-400 text-xs bg-slate-950/60 rounded-2xl border border-slate-800">
                ✓ Brak zleceń w trybie Ekspres w wybranym okresie. Wszystkie pojazdy były planowane w normalnej kolejce.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wider text-amber-300/80 border-b border-slate-800">
                      <th className="py-2.5 pr-3 font-bold">Data zgłoszenia</th>
                      <th className="py-2.5 pr-3 font-bold">Pojazd</th>
                      <th className="py-2.5 pr-3 font-bold">Dział</th>
                      <th className="py-2.5 pr-3 font-bold">Osoba Decyzyjna (Zatwierdzający)</th>
                      <th className="py-2.5 pr-3 font-bold">Uzasadnienie Pierwszeństwa</th>
                      <th className="py-2.5 font-bold text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.expressOrders.map((ord) => (
                      <tr key={ord.id} className="border-b border-slate-800/60 hover:bg-amber-500/5 transition-colors">
                        <td className="py-3 pr-3 font-mono text-xs text-slate-300">
                          {format(new Date(ord.createdAt), 'yyyy-MM-dd HH:mm')}
                        </td>
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-xs text-white bg-black px-2 py-0.5 rounded border border-amber-500/40">
                              {ord.licensePlate}
                            </span>
                            <span className="text-xs text-slate-300 font-medium">
                              {ord.carModel || '—'}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 pr-3">
                          <span
                            className="text-[10px] font-black px-2 py-0.5 rounded text-white"
                            style={{ backgroundColor: ord.departmentColor }}
                          >
                            {ord.departmentName}
                          </span>
                        </td>
                        <td className="py-3 pr-3">
                          <strong className="text-amber-300 text-xs flex items-center gap-1">
                            <Zap className="w-3 h-3 fill-current flex-shrink-0" />
                            {ord.priorityAuthorizer || 'Brak danych'}
                          </strong>
                        </td>
                        <td className="py-3 pr-3 text-xs text-slate-200 italic max-w-xs break-words">
                          {ord.priorityReason || 'Wydanie natychmiastowe'}
                        </td>
                        <td className="py-3 text-right">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                            ord.status === 'COMPLETED'
                              ? 'bg-slate-800 text-slate-400 border-slate-700'
                              : ord.status === 'READY'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : ord.status === 'IN_PROGRESS'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              : 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                          }`}>
                            {ord.status === 'COMPLETED' ? 'WYDANE' : ord.status === 'READY' ? 'GOTOWE' : ord.status === 'IN_PROGRESS' ? 'W TRAKCIE' : 'W KOLEJCE'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
                Excel (Pracownicy)
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    <th className="py-2.5 pr-3 font-bold">Pracownik</th>
                    <th className="py-2.5 pr-3 font-bold text-right">Liczba myć</th>
                    <th className="py-2.5 pr-3 font-bold text-right">Czas łączny</th>
                    <th className="py-2.5 pr-3 font-bold text-right">Udział</th>
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
        </>
      )}
    </div>
  );
}
