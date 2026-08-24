'use server';

import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

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

    if (!dep) {
      return { success: false, error: 'Nie znaleziono takiego profilu/działu.' };
    }

    if (dep.pin && dep.pin.trim() !== pin.trim()) {
      return { success: false, error: 'Nieprawidłowy kod PIN / hasło.' };
    }

    let role: 'WASHER' | 'DEPARTMENT' | 'ADMIN' = 'DEPARTMENT';
    if (dep.slug === 'myjnia') role = 'WASHER';
    if (dep.slug === 'admin') role = 'ADMIN';

    const sessionData: SessionUser = {
      slug: dep.slug,
      name: dep.name,
      code: dep.code,
      color: dep.color,
      role,
    };

    const cookieStore = await cookies();
    cookieStore.set('myjnia_session', JSON.stringify(sessionData), {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 dni
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
    return JSON.parse(cookie.value) as SessionUser;
  } catch {
    return null;
  }
}
