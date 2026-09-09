'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { releaseOrder } from '@/actions/orders';
import ChecklistMarkdown from '@/components/ChecklistMarkdown';

interface ReleaseOrderDialogProps {
  order: {
    id: string;
    licensePlate: string;
    categoryId: string;
    category: { name: string; checklistRequired: boolean; checklistMarkdown: string | null };
  };
  employees: { id: string; name: string; isActive: boolean }[];
  onClose: () => void;
  onReleased: () => void;
}

export default function ReleaseOrderDialog({ order, employees, onClose, onReleased }: ReleaseOrderDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [employeeId, setEmployeeId] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const required = order.category.checklistRequired;
  const markdown = order.category.checklistMarkdown || '';

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previousFocus?.focus();
    };
  }, []);

  return (
    <dialog ref={dialogRef} aria-labelledby="release-title" onCancel={(event) => {
      event.preventDefault();
      if (!pending) onClose();
    }} className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-3xl border border-emerald-700 bg-slate-900 p-5 text-white shadow-2xl backdrop:bg-slate-950/80 sm:p-7">
      <h2 id="release-title" className="text-xl font-extrabold">{required ? 'Potwierdzenie checklisty' : 'Wydanie pojazdu'}</h2>
      <p className="mt-2 font-mono text-lg font-bold text-emerald-300">{order.licensePlate}</p>
      <p className="mb-5 text-sm text-slate-400">{order.category.name}</p>
      {required && (
        <div className="mb-5 rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
          <ChecklistMarkdown markdown={markdown} />
        </div>
      )}
      <form onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        setError('');
        startTransition(async () => {
          try {
            const result = await releaseOrder(order.id, {
              employeeId,
              categoryId: order.categoryId,
              checklistConfirmed: required,
              checklistMarkdown: markdown,
            });
            if (!result.success) {
              setError(result.error || 'Nie udało się wydać pojazdu.');
              return;
            }
            onReleased();
          } catch {
            setError('Nie udało się zapisać wydania. Sprawdź połączenie i spróbuj ponownie.');
          }
        });
      }} className="space-y-4">
        <label className="block text-sm font-bold">
          Osoba potwierdzająca i wydająca pojazd
          <select required value={employeeId} disabled={pending} onChange={event => setEmployeeId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white">
            <option value="">Wybierz swoje imię i nazwisko</option>
            {employees.filter(employee => employee.isActive).map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
          </select>
        </label>
        <p className="text-xs text-slate-400">{required ? 'Przycisk potwierdza wykonanie całej powyższej checklisty i wydaje pojazd.' : 'Przycisk oznacza pojazd jako wydany.'} Zapiszemy wybranego pracownika, konto sesji i czas operacji w historii zlecenia.</p>
        {error && <p role="alert" className="rounded-xl border border-rose-700 bg-rose-950/50 p-3 text-sm text-rose-200">{error}</p>}
        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <button type="button" disabled={pending} onClick={onClose} className="rounded-xl bg-slate-800 px-5 py-3 text-sm font-bold disabled:opacity-50">Anuluj</button>
          <button type="submit" disabled={pending || !employeeId || (required && !markdown.trim())} className="flex-1 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-extrabold text-slate-950 hover:bg-emerald-400 disabled:opacity-50">{pending ? 'Zapisywanie...' : required ? 'Potwierdź wykonanie / Pojazd wydany' : 'Pojazd wydany'}</button>
        </div>
      </form>
    </dialog>
  );
}
