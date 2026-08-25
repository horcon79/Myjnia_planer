# Plan wdrożenia — Integracja DMS Solution (plik JSON) z Myjnia Planer

**Status:** wdrożone
**Architektura:** aplikacja Myjnia Planer **nie łączy się bezpośrednio z Firebird**. Osobny program w Pythonie (CRON co 15 min) pobiera zlecenia z systemu DMS i zapisuje je do pliku `zlecenia_sync/zlecenia.json`. Myjnia Planer tylko **czyta ten plik** (cache w pamięci po mtime).

---

## 1. Kontrakt pliku `zlecenia_sync/zlecenia.json`

```jsonc
{
  "updated_at": "2026-08-25T12:16:37.058189",   // timestamp generacji
  "serwisy": ["BS-1", "BS-5"],
  "count": 29,
  "zlecenia": [
    {
      "zlecenie_id": 396357,          // us_Zlecenie.ID
      "numer_zlecenia": "2805/BS-1/2026",
      "data_otwarcia": "2026-08-25",
      "serwis": "BS-1",               // klucz filtra per dział
      "nr_rejestracyjny": "FLLK40",   // może być null
      "marka": "Mercedes-Benz",
      "model": "GLC Coupe GLC 200 4M Coupe",
      "vin": "W1NKJ5BB8VF675951",
      "klient": "MOJSIUK ..."
    }
  ]
}
```

- Plik może nie istnieć (np. po starcie maszyny przed pierwszym przebiegiem CRON-a) → aplikacja pokazuje czytelny błąd "brak danych DMS".
- `zlecenia_sync/` jest w `.gitignore` (dane osobowe klientów) — plik nigdy nie trafia do repozytorium.

---

## 2. Architektura

```
Python + CRON (15 min) ──► zlecenia_sync/zlecenia.json (na dysku)
                                   │
                                   ▼
Myjnia Planer (Next.js)
  src/actions/dms.ts (server actions: searchDmsVehicles / getDmsStatus / refreshDmsCache)
        │
        ▼
  src/lib/dms.ts ── cache po mtime (odczyt tylko gdy plik się zmienił)
        │
        ▼
  fs (lokalny plik)   • Prisma (SQLite) — konfiguracja działu + referencje DMS na zleceniach
```

- **Brak zależności natywnych** (bez node-firebird, bez fbclient.dll).
- **Brak bezpośredniego obciążania bazy DMS** — Myjnia Planer widzi tylko snapshot w pliku.
- Cache po `mtime`: po zmianie pliku przez CRON aplikacja automatycznie wczytuje nowe dane; pomiędzy zmianami nie czyta dysku ponownie.

---

## 3. Model danych (Prisma)

```prisma
model Department {
  // ...istniejące pola...
  dmsEnabled      Boolean @default(false) // Integracja DMS Solution
  dmsServiceCode  String? // np. "BS-1", "BS-5" (pole "serwis" w pliku JSON)
  dmsMaxAgeMin    Int     @default(15)    // próg ostrzeżenia o nieświeżych danych
}

model WashOrder {
  // ...istniejące pola...
  dmsOrderId     Int?    // zlecenie_id z DMS (us_Zlecenie.ID)
  dmsOrderNumber String? // numer_zlecenia z DMS
  dmsVin         String? // VIN z DMS
}
```

- Migracja: `npm run db:push` (additive, bez utraty danych).
- `dmsOrderId` pozwala w przyszłości: raporty "ile myć z DMS", wykrywanie duplikatów (pojazd już zgłoszony).

---

## 4. Warstwa odczytu — `src/lib/dms.ts`

- `readDmsSnapshot()` — odczyt pliku z cache'em po `mtime`; przy błędzie zwraca ostatni dobry snapshot + `error`.
- `searchDmsOrders(serviceCode, query, limit=15)` — normalizacja (uppercase, usunięcie spacji), dopasowanie **prefixowe** ≥3 znaków po `nr_rejestracyjny` LUB `numer_zlecenia`.
- `getDmsServiceStatus(serviceCode, maxAgeMin)` — dostępność, liczba zleceń serwisu, `fileAgeMinutes`, flaga `stale`.
- `clearDmsCache()` — dla przycisku "Odśwież".

## 5. Server actions — `src/actions/dms.ts`

| Akcja | Opis | Uprawnienia |
|---|---|---|
| `searchDmsVehicles(departmentId, query)` | wyszukiwanie + flaga `alreadyReported` (czy pojazd ma już aktywne zlecenie mycia) | dział (swój) / ADMIN |
| `getDmsStatus(departmentId)` | stan integracji | j.w. |
| `refreshDmsCache(departmentId)` | czyści cache i wczytuje plik ponownie | j.w. |

## 6. Słownik działów — `SettingsManager.tsx`

W modalu działu sekcja **"Integracja DMS Solution"**:
- przełącznik `dmsEnabled`,
- pole `dmsServiceCode` (np. `BS-1`) — wymagane przy włączonej integracji,
- pole `dmsMaxAgeMin` (domyślnie 15),
- **podgląd statusu**: liczba zleceń serwisu, data generacji pliku, ostrzeżenie o nieświeżych danych, przycisk "Odśwież".

## 7. Formularz zgłoszenia — `OrderFormAndList.tsx`

Dla działu z włączoną integracją pod polem rejestracji pojawia się panel **"Wybierz pojazd z DMS (BS-x)"**:
- wyszukiwarka ≥3 znaki (rejestracja lub nr zlecenia), lista wyników (rejestracja • marka model • nr zlecenia • klient • data otwarcia, z adnotacją "✓ już zgłoszone"),
- wybór → autofill rejestracji i "marka model", zapis referencji DMS (`dmsOrderId`, `dmsOrderNumber`, `dmsVin`),
- ręczne wpisanie rejestracji czyści referencję DMS (użytkownik zawsze może pominąć integrację),
- przycisk "Odśwież" + informacja o świeżości danych.

---

## 8. Bezpieczeństwo i niezawodność

- Plik `zlecenia_sync/` w `.gitignore` — dane osobowe nie trafiają do repozytorium.
- Tylko odczyt pliku; brak zapisu do DMS.
- Weryfikacja uprawnień w server actions (dział → własny slug, ADMIN → wszystko).
- Gdy plik niedostępny → czytelny komunikat w UI, formularz działa w trybie ręcznym.
- `dmsMaxAgeMin` → ostrzeżenie gdy CRON nie odświeżył danych na czas.

---

## 9. Kroki wdrożenia (wykonane)

1. `prisma/schema.prisma` + `npm run db:push` (nowe pola `Department`, `WashOrder`).
2. `src/lib/dms-types.ts` (współdzielone typy) + `src/lib/dms.ts` (odczyt JSON, cache mtime, wyszukiwarka).
3. `src/actions/dms.ts` (searchDmsVehicles / getDmsStatus / refreshDmsCache).
4. `src/actions/orders.ts` + `src/actions/departments.ts` — obsługa nowych pól.
5. `SettingsManager.tsx` — konfiguracja DMS przy dziale + podgląd statusu.
6. `OrderFormAndList.tsx` — wyszukiwarka DMS + autofill + zapis referencji.
7. `.gitignore` — dodano `/zlecenia_sync`.

## 10. Testy

- [x] `npx tsx` — odczyt pliku (29 zleceń, serwisy BS-1/BS-5), wyszukiwanie `ZK2`→3, `280`→5, status BS-1 (21 zleceń, wiek 12 min).
- [x] `npx tsc --noEmit` — przechodzi.
- [x] ESLint — brak nowych błędów (pozostałe to istniejące naruszenia repo).
- [ ] Ręczne: wybór z DMS → autofill → zapis → widoczność w planerze.
- [ ] Ręczne: odcięcie pliku → komunikat; włączenie integracji w słowniku → panel w formularzu.

---

## 11. Ryzyka i mitygacje

| Ryzyko | Mitygacja |
|---|---|
| Plik chwilowo nieobecny (przerwa CRON-a) | czytelny błąd + tryb ręczny; `dmsMaxAgeMin` ostrzega o nieświeżych danych |
| Duże pliki / wiele działów | limit wyników wyszukiwania (15), `FIRST`-analog po stronie Python |
| Duplikat zgłoszenia | flaga `alreadyReported` w wynikach (na podstawie aktywnych zleceń mycia) |
| Zmiana struktury JSON przez program Python | kontrakt w sekcji 1; mapa pól tylko w `src/lib/dms.ts` |

---

## 12. Zakres NA PÓŹNIEJ

- Raporty: kolumna "mycia z DMS" (`WashOrder.dmsOrderId != null`).
- Wykrywanie duplikatów wg `dmsOrderId` przy zgłaszaniu (blokada / ostrzeżenie).
- Metryki dostępności danych DMS (monitoring wieku pliku).
