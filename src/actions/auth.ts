'use server';

import { cookies, headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { randomBytes } from 'node:crypto';
import { SESSION_MAX_AGE, SESSION_SECRET_KEY, signSessionToken, verifySessionToken } from '@/lib/session-token';

async function getSessionSecret(): Promise<string> {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const existing = await prisma.appSetting.findUnique({ where: { key: SESSION_SECRET_KEY } });
  if (existing) {
    if (!existing.value) throw new Error('Empty session secret');
    return existing.value;
  }
  // Persist once in the shared SQLite volume; never replace another process's secret.
  try {
    const setting = await prisma.appSetting.upsert({
      where: { key: SESSION_SECRET_KEY },
      update: {},
      create: { key: SESSION_SECRET_KEY, value: randomBytes(32).toString('base64url') },
    });
    if (!setting.value) throw new Error('Empty session secret');
    return setting.value;
  } catch (error) {
    // Prisma may emulate an empty-update upsert; recover a concurrent insert.
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'P2002') throw error;
    const setting = await prisma.appSetting.findUniqueOrThrow({ where: { key: SESSION_SECRET_KEY } });
    if (!setting.value) throw new Error('Empty session secret');
    return setting.value;
  }
}

export interface SessionUser {
  slug: string;
  name: string;
  code: string;
  color: string;
  role: 'WASHER' | 'DEPARTMENT' | 'ADMIN';
}

export async function loginWithPin(slug: string, pin: string): Promise<{ success: boolean; error?: string }> {
  try {
    const dep = await prisma.department.findUnique({
      where: { slug },
    });

    if (!dep || !dep.isActive) {
      return { success: false, error: 'Nie znaleziono takiego profilu/działu.' };
    }

    if (dep.pin && dep.pin.trim() !== pin.trim()) {
      return { success: false, error: 'Nieprawidłowy kod PIN / hasło.' };
    }

    const token = signSessionToken(dep.id, await getSessionSecret());

    const cookieStore = await cookies();
    const headerList = await headers();
    // Cookie Secure tylko, gdy faktycznie mamy HTTPS (bezpośrednio lub za proxy).
    // Przy zwykłym HTTP (np. wdrożenie Docker na intranecie) przeglądarka odrzuciłaby cookie z flagą Secure.
    const proto = (headerList.get('x-forwarded-proto') || '').split(',').map((p) => p.trim());
    const isHttps = proto.includes('https');
    const forceSecure = process.env.COOKIE_SECURE === 'true';
    cookieStore.set('myjnia_session', token, {
      httpOnly: true,
      secure: forceSecure || isHttps,
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE,
      path: '/',
    });

    return { success: true };
  } catch (error) {
    console.error('Login error:', error);
    return { success: false, error: 'Wystąpił błąd podczas logowania.' };
  }
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete('myjnia_session');
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const cookie = cookieStore.get('myjnia_session');
    if (!cookie?.value) return null;
    if (!cookie.value.startsWith('v1.')) return null;
    const departmentId = verifySessionToken(cookie.value, await getSessionSecret());
    if (!departmentId) return null;
    const dep = await prisma.department.findUnique({ where: { id: departmentId } });
    if (!dep?.isActive) return null;
    return {
      slug: dep.slug,
      name: dep.name,
      code: dep.code,
      color: dep.color,
      role: dep.slug === 'admin' ? 'ADMIN' : dep.slug === 'myjnia' ? 'WASHER' : 'DEPARTMENT',
    };
  } catch {
    return null;
  }
}
