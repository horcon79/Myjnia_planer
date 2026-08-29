'use server';

import { prisma } from '@/lib/prisma';
import { getCurrentUser, SessionUser } from '@/actions/auth';

export interface ChatMessageDTO {
  id: string;
  threadId: string;
  body: string;
  createdAt: string;
  senderType: 'DEPARTMENT' | 'WASHER' | 'ADMIN';
  senderDepartmentSlug: string | null;
  senderDepartmentName: string | null;
  senderDepartmentColor: string | null;
  senderName: string;
  senderEmployeeId: string | null;
  senderEmployeeName: string | null;
  isMine: boolean;
}

export interface ChatThreadDTO {
  id: string;
  departmentId: string | null;
  departmentName: string | null;
  departmentSlug: string | null;
  departmentColor: string | null;
  subject: string | null;
  isClosed: boolean;
  updatedAt: string;
  lastMessage: ChatMessageDTO | null;
  unreadCount: number;
  messageCount: number;
}

export interface ChatStateDTO {
  threads: ChatThreadDTO[];
  totalUnread: number;
  departments: { id: string; slug: string; name: string; code: string; color: string }[];
  employees: { id: string; name: string; shortName: string; color: string }[];
}

function readerKeyFor(user: SessionUser): string {
  if (user.role === 'ADMIN') return 'ADMIN';
  if (user.role === 'WASHER') return 'WASHER';
  return `DEPARTMENT:${user.slug}`;
}

function canSeeAllThreads(user: SessionUser): boolean {
  return user.role === 'WASHER' || user.role === 'ADMIN';
}

function mySenderKey(user: SessionUser): string {
  if (user.role === 'ADMIN') return 'ADMIN';
  if (user.role === 'WASHER') return 'WASHER';
  return `DEPT:${user.slug}`;
}

function isMineMessage(user: SessionUser, msg: { senderType: string; senderDepartmentSlug: string | null }): boolean {
  if (user.role === 'ADMIN') return msg.senderType === 'ADMIN';
  if (user.role === 'WASHER') return msg.senderType === 'WASHER';
  return msg.senderType === 'DEPARTMENT' && msg.senderDepartmentSlug === user.slug;
}

function serializeMessage(
  user: SessionUser,
  m: {
    id: string;
    threadId: string;
    body: string;
    createdAt: Date;
    senderType: string;
    senderDepartmentSlug: string | null;
    senderName: string;
    senderEmployeeId: string | null;
    senderEmployee?: { name: string } | null;
    thread?: { department?: { name: string; slug: string; color: string } | null };
  }
): ChatMessageDTO {
  const dep = m.thread?.department ?? null;
  return {
    id: m.id,
    threadId: m.threadId,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    senderType: m.senderType as ChatMessageDTO['senderType'],
    senderDepartmentSlug: m.senderDepartmentSlug,
    senderDepartmentName: dep?.name ?? m.senderDepartmentSlug,
    senderDepartmentColor: dep?.color ?? null,
    senderName: m.senderName,
    senderEmployeeId: m.senderEmployeeId,
    senderEmployeeName: m.senderEmployee?.name ?? null,
    isMine: isMineMessage(user, m),
  };
}

export async function getChatState(): Promise<ChatStateDTO> {
  const user = await getCurrentUser();
  if (!user) return { threads: [], totalUnread: 0, departments: [], employees: [] };

  const where = canSeeAllThreads(user)
    ? {}
    : { department: { slug: user.slug } };

  const [threads, departments, employees] = await Promise.all([
    prisma.chatThread.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: {
        department: { select: { name: true, slug: true, color: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            senderEmployee: { select: { name: true } },
            thread: { include: { department: { select: { name: true, slug: true, color: true } } } },
          },
        },
        _count: { select: { messages: true } },
      },
    }),
    prisma.department.findMany({
      where: { isActive: true, slug: { notIn: ['myjnia', 'admin'] } },
      orderBy: { order: 'asc' },
      select: { id: true, slug: true, name: true, code: true, color: true },
    }),
    prisma.employee.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, shortName: true, color: true },
    }),
  ]);

  const rKey = readerKeyFor(user);
  const threadIds = threads.map((t) => t.id);
  const reads = threadIds.length
    ? await prisma.chatRead.findMany({
        where: { readerKey: rKey, message: { threadId: { in: threadIds } } },
        select: { messageId: true },
      })
    : [];
  const readSet = new Set(reads.map((r) => r.messageId));

  const dtos: ChatThreadDTO[] = [];
  for (const t of threads) {
    const allMsgs = await prisma.chatMessage.findMany({
      where: { threadId: t.id },
      select: { id: true, senderType: true, senderDepartmentSlug: true },
    });
    const unreadCount = allMsgs.filter(
      (m) => !readSet.has(m.id) && !isMineMessage(user, m)
    ).length;

    const last = t.messages[0];
    dtos.push({
      id: t.id,
      departmentId: t.departmentId,
      departmentName: t.department?.name ?? null,
      departmentSlug: t.department?.slug ?? null,
      departmentColor: t.department?.color ?? null,
      subject: t.subject,
      isClosed: t.isClosed,
      updatedAt: t.updatedAt.toISOString(),
      lastMessage: last ? serializeMessage(user, last) : null,
      unreadCount,
      messageCount: t._count.messages,
    });
  }

  dtos.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const totalUnread = dtos.reduce((acc, t) => acc + t.unreadCount, 0);

  return { threads: dtos, totalUnread, departments, employees };
}

export async function getThreadMessages(threadId: string): Promise<{ success: boolean; error?: string; messages?: ChatMessageDTO[] }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: 'Brak sesji.' };

  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    include: { department: { select: { slug: true } } },
  });
  if (!thread) return { success: false, error: 'Nie znaleziono rozmowy.' };

  if (!canSeeAllThreads(user) && thread.department?.slug !== user.slug) {
    return { success: false, error: 'Brak dostępu do tej rozmowy.' };
  }

  const messages = await prisma.chatMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: 'asc' },
    include: {
      senderEmployee: { select: { name: true } },
      thread: { include: { department: { select: { name: true, slug: true, color: true } } } },
    },
  });

  // Oznacz jako przeczytane (idempotentnie)
  const rKey = readerKeyFor(user);
  const unread = messages.filter((m) => !isMineMessage(user, m));
  for (const m of unread) {
    await prisma.chatRead.upsert({
      where: { messageId_readerKey: { messageId: m.id, readerKey: rKey } },
      create: { messageId: m.id, readerKey: rKey },
      update: {},
    });
  }

  return {
    success: true,
    messages: messages.map((m) => serializeMessage(user, m)),
  };
}

export async function sendChatMessage(data: {
  threadId?: string | null;
  departmentId?: string | null; // dla nowej rozmowy (wymagane dla działu zakładającego wątek z myjnią)
  body: string;
  senderName: string;
  asEmployeeId?: string | null; // tylko dla myjni - wysłanie jako konkretny pracownik
}): Promise<{ success: boolean; error?: string; threadId?: string }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: 'Brak sesji. Zaloguj się.' };

  const body = data.body?.trim();
  if (!body) return { success: false, error: 'Wiadomość nie może być pusta.' };
  if (body.length > 4000) return { success: false, error: 'Wiadomość jest zbyt długa (max 4000 znaków).' };

  const senderName = data.senderName?.trim();
  if (!senderName) return { success: false, error: 'Podaj imię / nazwisko nadawcy.' };
  if (senderName.length > 60) return { success: false, error: 'Imię jest zbyt długie (max 60 znaków).' };

  let senderType: 'DEPARTMENT' | 'WASHER' | 'ADMIN';
  let senderDepartmentSlug: string | null = null;
  let senderEmployeeId: string | null = null;

  if (user.role === 'ADMIN') {
    senderType = 'ADMIN';
  } else if (user.role === 'WASHER') {
    senderType = 'WASHER';
    if (data.asEmployeeId) {
      const emp = await prisma.employee.findFirst({
        where: { id: data.asEmployeeId, isActive: true },
      });
      if (!emp) return { success: false, error: 'Nie znaleziono wybranego pracownika myjni.' };
      senderEmployeeId = emp.id;
    }
  } else {
    senderType = 'DEPARTMENT';
    senderDepartmentSlug = user.slug;
  }

  try {
    // Znajdź lub utwórz wątek
    let threadId = data.threadId || null;
    if (threadId) {
      const thread = await prisma.chatThread.findUnique({
        where: { id: threadId },
        include: { department: { select: { slug: true } } },
      });
      if (!thread) return { success: false, error: 'Nie znaleziono rozmowy.' };
      if (!canSeeAllThreads(user) && thread.department?.slug !== user.slug) {
        return { success: false, error: 'Brak dostępu do tej rozmowy.' };
      }
    } else {
      // Nowy wątek
      let newDepartmentId: string | null = null;
      if (canSeeAllThreads(user)) {
        // Myjnia/admin rozpoczyna rozmowę z działem (lub globalną)
        if (data.departmentId) {
          const dep = await prisma.department.findFirst({ where: { id: data.departmentId, isActive: true } });
          if (!dep) return { success: false, error: 'Nie znaleziono działu.' };
          newDepartmentId = dep.id;
        }
      } else {
        // Dział rozpoczyna rozmowę z myjnią - wątek przypisany do działu
        const dep = await prisma.department.findUnique({ where: { slug: user.slug } });
        if (!dep) return { success: false, error: 'Nie znaleziono działu.' };
        newDepartmentId = dep.id;
      }
      const thread = await prisma.chatThread.create({
        data: { departmentId: newDepartmentId },
      });
      threadId = thread.id;
    }

    await prisma.chatMessage.create({
      data: {
        threadId,
        senderType,
        senderDepartmentSlug,
        senderName,
        senderEmployeeId,
        body,
      },
    });

    await prisma.chatThread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() },
    });

    return { success: true, threadId };
  } catch (error) {
    console.error('sendChatMessage error:', error);
    return { success: false, error: 'Błąd podczas wysyłania wiadomości.' };
  }
}

export async function markThreadRead(threadId: string): Promise<{ success: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { success: false };

  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    include: { department: { select: { slug: true } } },
  });
  if (!thread) return { success: false };
  if (!canSeeAllThreads(user) && thread.department?.slug !== user.slug) {
    return { success: false };
  }

  const rKey = readerKeyFor(user);
  const msgs = await prisma.chatMessage.findMany({
    where: { threadId },
    select: { id: true, senderType: true, senderDepartmentSlug: true },
  });
  const unread = msgs.filter((m) => !isMineMessage(user, m));
  for (const m of unread) {
    await prisma.chatRead.upsert({
      where: { messageId_readerKey: { messageId: m.id, readerKey: rKey } },
      create: { messageId: m.id, readerKey: rKey },
      update: {},
    });
  }
  return { success: true };
}

export async function closeThread(threadId: string): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user || (user.role !== 'WASHER' && user.role !== 'ADMIN')) {
    return { success: false, error: 'Brak uprawnień.' };
  }
  try {
    await prisma.chatThread.update({ where: { id: threadId }, data: { isClosed: true } });
    return { success: true };
  } catch {
    return { success: false, error: 'Nie udało się zamknąć rozmowy.' };
  }
}
