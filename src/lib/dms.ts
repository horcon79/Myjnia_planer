import fs from 'fs/promises';
import path from 'path';
import type { DmsOrder, DmsServiceStatus, DmsSnapshot } from './dms-types';

// Moduł serwerowy: odczyt pliku JSON ze zleceniami DMS (generowanego zewnętrznym CRON-em).
// Cache w pamięci procesu oparty o mtime pliku — unikamy ponownego odczytu, dopóki plik się nie zmieni.

const DEFAULT_FILE = path.resolve(process.cwd(), 'zlecenia_sync', 'zlecenia.json');
const MAX_AGE_MIN_DEFAULT = 15;

let cached: { mtimeMs: number; snapshot: DmsSnapshot } | null = null;

export function getDmsFilePath(): string {
  const env = process.env.DMS_FILE_PATH;
  return env ? path.resolve(process.cwd(), env) : DEFAULT_FILE;
}

function normalize(s: string | null | undefined): string {
  return (s ?? '').toUpperCase().replace(/\s+/g, '');
}

export function clearDmsCache(): void {
  cached = null;
}

export async function readDmsSnapshot(): Promise<DmsSnapshot> {
  const filePath = getDmsFilePath();
  try {
    const st = await fs.stat(filePath);
    if (cached && cached.mtimeMs === st.mtimeMs) {
      return cached.snapshot;
    }
    const raw = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(raw) as {
      updated_at?: string;
      serwisy?: string[];
      count?: number;
      zlecenia?: unknown[];
    };

    type DmsFileOrder = {
      zlecenie_id?: unknown;
      numer_zlecenia?: unknown;
      data_otwarcia?: unknown;
      serwis?: unknown;
      nr_rejestracyjny?: unknown;
      marka?: unknown;
      model?: unknown;
      vin?: unknown;
      klient?: unknown;
    };

    const orders: DmsOrder[] = Array.isArray(data.zlecenia)
      ? (data.zlecenia as DmsFileOrder[]).map((z) => {
          const plate = z?.nr_rejestracyjny ? String(z.nr_rejestracyjny) : null;
          const vin = z?.vin ? String(z.vin) : null;
          return {
            dmsOrderId: Number(z?.zlecenie_id) || 0,
            orderNumber: String(z?.numer_zlecenia ?? ''),
            openDate: z?.data_otwarcia ? String(z.data_otwarcia) : null,
            service: String(z?.serwis ?? ''),
            // Gdy brak rejestracji — podstawiamy VIN, aby pojazd był identyfikowalny i wyszukiwalny
            licensePlate: plate || vin || null,
            hasPlate: Boolean(plate),
            brand: String(z?.marka ?? 'Mercedes-Benz'),
            model: String(z?.model ?? ''),
            vin,
            client: z?.klient ? String(z.klient) : null,
          };
        })
      : [];

    const snapshot: DmsSnapshot = {
      updatedAt: data.updated_at ? String(data.updated_at) : null,
      serwisy: Array.isArray(data.serwisy) ? data.serwisy.map(String) : [],
      count: orders.length,
      orders,
      error: null,
      filePath,
    };

    cached = { mtimeMs: st.mtimeMs, snapshot };
    return snapshot;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Plik niedostępny — zwracamy ostatni snapshot z błędem, jeśli mamy cokolwiek.
    if (cached) {
      return { ...cached.snapshot, error: message };
    }
    return { updatedAt: null, serwisy: [], count: 0, orders: [], error: message, filePath };
  }
}

/** Wyszukiwanie po pierwszych >=3 znakach (rejestracja LUB numer zlecenia), znormalizowane. */
export async function searchDmsOrders(
  serviceCode: string,
  query: string,
  limit = 15,
): Promise<DmsOrder[]> {
  const q = normalize(query);
  if (q.length < 3) return [];

  const snapshot = await readDmsSnapshot();
  const service = serviceCode.trim().toUpperCase();
  const out: DmsOrder[] = [];

  for (const order of snapshot.orders) {
    if (order.service.toUpperCase() !== service) continue;
    const plate = normalize(order.licensePlate);
    const num = normalize(order.orderNumber);
    const matched = (plate && plate.startsWith(q)) || (num && num.startsWith(q));
    if (matched) {
      out.push(order);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** Stan integracji dla danego serwisu (do podglądu w słowniku i formularzu). */
export async function getDmsServiceStatus(
  serviceCode: string,
  maxAgeMin = MAX_AGE_MIN_DEFAULT,
): Promise<DmsServiceStatus> {
  const service = serviceCode.trim().toUpperCase();
  const snapshot = await readDmsSnapshot();

  const totalCount = snapshot.orders.filter((o) => o.service.toUpperCase() === service).length;

  let fileAgeMinutes: number | null = null;
  if (snapshot.updatedAt) {
    const parsed = new Date(snapshot.updatedAt).getTime();
    if (!Number.isNaN(parsed)) {
      fileAgeMinutes = Math.max(0, Math.round((Date.now() - parsed) / 60000));
    }
  }

  const stale = fileAgeMinutes !== null && fileAgeMinutes > Math.max(1, maxAgeMin || MAX_AGE_MIN_DEFAULT);

  return {
    available: !snapshot.error && snapshot.orders.length > 0,
    serviceCode: service,
    totalCount,
    fileUpdatedAt: snapshot.updatedAt,
    fileAgeMinutes,
    stale,
    error: snapshot.error,
  };
}
