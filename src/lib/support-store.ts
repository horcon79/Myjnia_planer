import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export type SupportReportType = 'BUG' | 'CHANGE' | 'IDEA';

export interface SupportReportSession {
  login: string;
  name: string;
  code: string;
  role: string;
}

export interface SupportReport {
  id: string;
  createdAt: string;
  type: SupportReportType;
  message: string;
  session: SupportReportSession;
  location: string;
  userAgent: string | null;
  appVersion: string | null;
}

export const SUPPORT_REPORTS_FILE = 'reports.json';
export const SUPPORT_REPORTS_LIMIT = 5000;

let writeQueue: Promise<unknown> = Promise.resolve();

export function getSupportDataDir(): string {
  const configured = process.env.SUPPORT_DATA_DIR?.trim();
  return configured && configured.length > 0 ? configured : path.join(process.cwd(), 'support');
}

export function getSupportReportsPath(): string {
  return path.join(getSupportDataDir(), SUPPORT_REPORTS_FILE);
}

function isSupportReport(value: unknown): value is SupportReport {
  if (!value || typeof value !== 'object') return false;
  const report = value as Partial<SupportReport>;
  return typeof report.id === 'string'
    && typeof report.createdAt === 'string'
    && (report.type === 'BUG' || report.type === 'CHANGE' || report.type === 'IDEA')
    && typeof report.message === 'string'
    && Boolean(report.session)
    && typeof report.session?.login === 'string'
    && typeof report.location === 'string';
}

async function readReportsFile(): Promise<SupportReport[]> {
  const filePath = getSupportReportsPath();

  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSupportReport);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return [];

    if (error instanceof SyntaxError) {
      // Uszkodzonego pliku nie nadpisujemy bez śladu - zachowujemy kopię do ręcznego odzyskania.
      try {
        await fs.rename(filePath, `${filePath}.corrupt-${Date.now()}`);
        return [];
      } catch {
        throw error;
      }
    }

    throw error;
  }
}

async function writeReportsFile(reports: SupportReport[]): Promise<void> {
  const directory = getSupportDataDir();
  const filePath = getSupportReportsPath();
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;

  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(temporaryPath, JSON.stringify(reports, null, 2), { encoding: 'utf8', mode: 0o644 });
  await fs.rename(temporaryPath, filePath);
}

export async function listSupportReports(limit = SUPPORT_REPORTS_LIMIT): Promise<SupportReport[]> {
  const reports = await readReportsFile();
  return reports
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.max(1, limit));
}

export async function appendSupportReport(report: SupportReport): Promise<void> {
  const task = writeQueue.then(async () => {
    const reports = await readReportsFile();
    reports.unshift(report);
    await writeReportsFile(reports.slice(0, SUPPORT_REPORTS_LIMIT));
  });

  // Kolejne zapisy czekają na poprzedni, nawet jeśli ten zakończy się błędem.
  writeQueue = task.catch(() => undefined);
  return task;
}
