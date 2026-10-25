'use server';

import { randomUUID } from 'node:crypto';
import { headers } from 'next/headers';
import { getCurrentUser } from '@/actions/auth';
import { getAppVersion } from '@/lib/version';
import {
  appendSupportReport,
  listSupportReports,
  type SupportReport,
  type SupportReportType,
} from '@/lib/support-store';

const MAX_MESSAGE_LENGTH = 4000;
const MIN_MESSAGE_LENGTH = 3;
const MAX_LOCATION_LENGTH = 500;
const MAX_USER_AGENT_LENGTH = 300;
const REPORT_LIST_LIMIT = 500;
const ALLOWED_TYPES: SupportReportType[] = ['BUG', 'CHANGE', 'IDEA'];

export interface SupportReportDTO {
  id: string;
  createdAt: string;
  type: SupportReportType;
  message: string;
  session: {
    login: string;
    name: string;
    code: string;
    role: string;
  };
  location: string;
  appVersion: string | null;
}

export interface SupportListResult {
  success: boolean;
  reports: SupportReportDTO[];
  error?: string;
}

export interface SupportSubmitResult {
  success: boolean;
  report?: SupportReportDTO;
  error?: string;
}

function serializeReport(report: SupportReport): SupportReportDTO {
  return {
    id: report.id,
    createdAt: report.createdAt,
    type: report.type,
    message: report.message,
    session: report.session,
    location: report.location,
    appVersion: report.appVersion,
  };
}

function sanitizeLocation(value: string | null | undefined): string {
  const raw = value?.trim();
  if (!raw) return '/';

  try {
    const url = new URL(raw, 'http://myjnia.local');
    return `${url.pathname}${url.search}${url.hash}`.slice(0, MAX_LOCATION_LENGTH) || '/';
  } catch {
    return raw.slice(0, MAX_LOCATION_LENGTH);
  }
}

export async function getSupportReports(): Promise<SupportListResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, reports: [], error: 'Zaloguj się, aby zobaczyć zgłoszenia.' };
  }

  try {
    const reports = await listSupportReports(REPORT_LIST_LIMIT);
    return { success: true, reports: reports.map(serializeReport) };
  } catch (error) {
    console.error('Support reports read error:', error);
    return { success: false, reports: [], error: 'Nie udało się odczytać listy zgłoszeń.' };
  }
}

export async function submitSupportReport(input: {
  type?: string;
  message?: string;
  location?: string;
}): Promise<SupportSubmitResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: 'Sesja wygasła. Zaloguj się ponownie, aby wysłać zgłoszenie.' };
  }

  const message = typeof input?.message === 'string' ? input.message.trim() : '';
  if (message.length < MIN_MESSAGE_LENGTH) {
    return { success: false, error: 'Opisz zgłoszenie (minimum 3 znaki).' };
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return { success: false, error: `Zgłoszenie może mieć maksymalnie ${MAX_MESSAGE_LENGTH} znaków.` };
  }

  const requestedType = typeof input?.type === 'string' ? input.type.toUpperCase() : 'BUG';
  const type: SupportReportType = ALLOWED_TYPES.includes(requestedType as SupportReportType)
    ? (requestedType as SupportReportType)
    : 'BUG';

  let reference = input?.location;
  let userAgent: string | null = null;
  try {
    const requestHeaders = await headers();
    const referer = requestHeaders.get('referer');
    if (!reference?.trim() && referer) reference = referer;
    userAgent = requestHeaders.get('user-agent')?.slice(0, MAX_USER_AGENT_LENGTH) ?? null;
  } catch {
    // Nagłówki są tylko dodatkowym kontekstem - brak dostępu nie blokuje zgłoszenia.
  }

  const report: SupportReport = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    type,
    message,
    session: {
      login: user.slug,
      name: user.name,
      code: user.code,
      role: user.role,
    },
    location: sanitizeLocation(reference),
    userAgent,
    appVersion: getAppVersion(),
  };

  try {
    await appendSupportReport(report);
    return { success: true, report: serializeReport(report) };
  } catch (error) {
    console.error('Support report save error:', error);
    return { success: false, error: 'Nie udało się zapisać zgłoszenia. Spróbuj ponownie później.' };
  }
}
