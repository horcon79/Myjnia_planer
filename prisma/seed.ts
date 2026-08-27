import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Sprawdzanie stanu bazy danych...');

  const depCount = await prisma.department.count();
  const settingsCount = await prisma.appSetting.count();

  if (depCount > 0 && settingsCount > 0) {
    console.log(`Baza danych zawiera już dane (${depCount} działów, ${settingsCount} ustawień). Pomijam wgrywanie danych startowych, aby nie nadpisać konfiguracji.`);
    return;
  }

  console.log('Inicjalizacja nowej bazy danych danymi startowymi...');

  // 1. Settings
  const settings = [
    { key: 'MAX_SIMULTANEOUS_CARS', value: '3' },
    { key: 'DELIVERY_CAR_WEIGHT', value: '1.5' },
    { key: 'WORK_START_HOUR', value: '7' },
    { key: 'WORK_END_HOUR', value: '19' },
    { key: 'ALLOW_OVER_CAPACITY', value: 'true' },
  ];

  for (const s of settings) {
    await prisma.appSetting.upsert({
      where: { key: s.key },
      update: {}, // NIGDY nie nadpisuj ustawień jeśli już istnieją
      create: s,
    });
  }

  // 2. Departments
  const departments = [
    { slug: 'handlowy', name: 'Dział Handlowy (Nowe)', code: 'DH', color: '#2563eb', icon: 'Car', pin: '1234', order: 1 },
    { slug: 'serwis', name: 'Dział Serwisu', code: 'DS', color: '#16a34a', icon: 'Wrench', pin: '1234', order: 2 },
    { slug: 'uzywane', name: 'Samochody Używane', code: 'SU', color: '#d97706', icon: 'BadgeCheck', pin: '1234', order: 3 },
    { slug: 'omoda', name: 'Omoda & Jaecoo Salon', code: 'OJ', color: '#7c3aed', icon: 'Sparkles', pin: '1234', order: 4 },
    { slug: 'myjnia', name: 'Stanowisko Myjni (Tablet)', code: 'MY', color: '#0284c7', icon: 'Droplets', pin: 'myjnia2026', order: 5 },
    { slug: 'admin', name: 'Kierownik / Zarząd', code: 'ADM', color: '#dc2626', icon: 'ShieldAlert', pin: 'admin2026', order: 6 },
  ];

  const createdDeps: Record<string, string> = {};
  for (const d of departments) {
    const dep = await prisma.department.upsert({
      where: { slug: d.slug },
      update: {}, // NIGDY nie nadpisuj zmienionych przez użytkownika PIN-ów ani nazw
      create: d,
    });
    createdDeps[d.slug] = dep.id;
  }

  // 3. Wash Categories
  const categories = [
    {
      name: 'Mycie standardowe',
      defaultDurationMin: 30,
      color: '#3b82f6',
      description: 'Zewnątrz + mycie progów + suszenie',
      suggestedNotes: 'Płukanie ciśnieniowe, mycie szyb z zewnątrz',
      order: 1,
    },
    {
      name: 'Przygotowanie nowego auta do wydania',
      defaultDurationMin: 150,
      color: '#8b5cf6',
      description: 'Kompleksowe przygotowanie pod klienta salonu',
      suggestedNotes: 'Odkurzanie, mycie szyb bez smug, czyszczenie tworzyw, nabłyszczenie opon, perfumowanie',
      order: 2,
    },
    {
      name: 'Rozklejenie i mycie samochodu demo',
      defaultDurationMin: 120,
      color: '#f59e0b',
      description: 'Usuwanie folii i grafik reklamowych + deironizacja',
      suggestedNotes: 'Usunięcie kleju po naklejkach reklamowych, odtłuszczenie lakieru',
      order: 3,
    },
    {
      name: 'Mycie serwisowe / szybkie',
      defaultDurationMin: 20,
      color: '#10b981',
      description: 'Przeglądowe mycie po naprawie mechanicznej',
      suggestedNotes: 'Płukanie nadkoli, mycie z zewnątrz',
      order: 4,
    },
    {
      name: 'Kompleksowe czyszczenie wnętrza + pranie',
      defaultDurationMin: 90,
      color: '#ec4899',
      description: 'Ekstrakcyjne pranie tapicerki i impregnacja plastików',
      suggestedNotes: 'Pranie foteli przednich i kanapy, neutralizacja zapachów',
      order: 5,
    },
  ];

  const createdCats: Record<string, string> = {};
  for (const c of categories) {
    const existing = await prisma.washCategory.findFirst({ where: { name: c.name } });
    if (existing) {
      createdCats[c.name] = existing.id;
    } else {
      const cat = await prisma.washCategory.create({ data: c });
      createdCats[c.name] = cat.id;
    }
  }

  // 4. Employees (5 pracowników)
  const employees = [
    { name: 'Marek Kowalski', shortName: 'Marek K.', color: '#0284c7' },
    { name: 'Piotr Nowak', shortName: 'Piotr N.', color: '#10b981' },
    { name: 'Tomasz Wiśniewski', shortName: 'Tomek W.', color: '#f59e0b' },
    { name: 'Jan Zieliński', shortName: 'Janek Z.', color: '#8b5cf6' },
    { name: 'Robert Lewandowski', shortName: 'Robert L.', color: '#ec4899' },
  ];

  const createdEmps: string[] = [];
  for (const e of employees) {
    const existing = await prisma.employee.findFirst({ where: { name: e.name } });
    if (existing) {
      createdEmps.push(existing.id);
    } else {
      const emp = await prisma.employee.create({ data: e });
      createdEmps.push(emp.id);
    }
  }

  // 5. Sample Orders (opcjonalne, TYLKO jeśli jawnie włączone w env: SEED_SAMPLE_ORDERS=true)
  if (process.env.SEED_SAMPLE_ORDERS === 'true') {
    const today = new Date();
    const setHour = (h: number, m: number = 0) => {
      const d = new Date(today);
      d.setHours(h, m, 0, 0);
      return d;
    };

    const sampleOrders = [
      {
        orderNumber: 'Z-101',
        licensePlate: 'KR 8832A',
        carModel: 'Omoda 5 1.6 T-GDI (Czarna)',
        carType: 'PASSENGER',
        departmentId: createdDeps['omoda'],
        categoryId: createdCats['Przygotowanie nowego auta do wydania'],
        targetReadyTime: setHour(15, 0),
        scheduledStartTime: setHour(8, 0),
        scheduledEndTime: setHour(10, 30),
        durationMin: 150,
        assignedEmployeeId: createdEmps[0],
        status: 'IN_PROGRESS',
        notes: 'Wydanie z klientem o 15:30. Zwrócić uwagę na felgi 18".',
        contactPerson: 'Kamil (Salon Omoda)',
        startedAt: setHour(8, 5),
      },
    ];

    for (const o of sampleOrders) {
      const existing = await prisma.washOrder.findFirst({ where: { orderNumber: o.orderNumber } });
      if (!existing) {
        await prisma.washOrder.create({ data: o });
      }
    }
  }

  console.log('Inicjalizacja danych startowych zakończona pomyślnie!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
