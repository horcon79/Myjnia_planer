# Dealer Myjnia Planer

Source-available system do zarządzania i planowania prac myjni samochodowej w firmie (dealer samochodowy, firma transportowa, serwis lub flota). Aplikacja przeznaczona do użytku na tablecie przy myjni oraz na komputerach działów zamawiających.

System pozwala działom zgłaszać mycia, pracownikom myjni planować je w grafiku, a kierownikowi kontrolować przepustowość i rozliczać wykonaną pracę.

> **Licencja:** kod źródłowy jest dostępny na zasadach **PolyForm Noncommercial License 1.0.0**. Użycie niekomercyjne, testowanie i ocena rozwiązania są dozwolone w zakresie tej licencji. **Użycie produkcyjne w działalności gospodarczej wymaga odrębnej licencji komercyjnej.** Szczegóły: [COMMERCIAL_LICENSE.md](COMMERCIAL_LICENSE.md).

---

## Funkcje

- **Zgłaszanie myć** — działy (handlowy, serwis, salon, auta używane itd.) zgłaszają pojazd do umycia z terminem gotowości i komentarzem.
- **Planer myjni (tablet)** — grafik godzinowy w podziale na pracowników, obsługa dotykowa:
  - rozpoczynanie i kończenie mycia,
  - przenoszenie auta między godzinami i pracownikami (przytrzymaj i przeciągnij),
  - przypisywanie niezaplanowanych aut.
- **Ekran statusu** — podgląd na żywo: gotowe, w trakcie, planowane, zakończone.
- **Słowniki i konfiguracja** — usługi (kategorie mycia), działy z kodami PIN, pracownicy oraz reguły przepustowości (maks. auta jednocześnie, godziny pracy).
- **Raporty (tylko admin)** — ilość myć wg pracowników i wg działów w wybranym okresie, z eksportem do Excela (`.xls`).

## Role i uprawnienia

| Rola | Opis | Dostęp |
| ------ | ------ | -------- |
| `DEPARTMENT` | Dział zamawiający (np. handlowy, serwis) | Zgłaszanie myć, status, słowniki (podgląd) |
| `WASHER` | Stanowisko myjni (tablet) | Planer, status |
| `ADMIN` | Kierownik / zarząd | Wszystko, w tym edycja słowników, konfiguracja i raporty |

## Technologie

- **Next.js 16** (App Router, Server Actions)
- **React 19** + TypeScript
- **Prisma ORM** + **SQLite** (`prisma/dev.db`)
- **Tailwind CSS 4**
- **date-fns** (daty, locale PL)

## Wymagania

- Node.js 20+ (rozwój lokalny)
- npm (rozwój lokalny)
- Docker 24+ z Docker Compose v2 (wdrożenie produkcyjne)

## Instalacja i uruchomienie

```bash
# 1. Zainstaluj zależności
npm install

# 2. Wygeneruj klienta Prisma i utwórz bazę SQLite
npx prisma generate
npx prisma db push

# 3. Zasiej dane startowe (działy, usługi, pracownicy, przykładowe mycia)
npm run db:seed

# 4. Uruchom tryb deweloperski
npm run dev
```

Otwórz <http://localhost:3000>. Po stronie głównej wybierz profil i zaloguj się kodem PIN.

> Uruchomienie aplikacji w celu testów lub oceny nie oznacza automatycznie prawa do jej komercyjnego wykorzystania. Przed wdrożeniem produkcyjnym w firmie zapoznaj się z sekcją **Licencja** poniżej.

## Wdrożenie z Docker (produkcja / testy)

Projekt zawiera gotowy `Dockerfile` oraz `docker-compose.yml`. Baza SQLite jest trzymana na nazwanym wolumenie, więc dane przetrwają ponowny build i restart kontenera.

### Pierwsze uruchomienie

```bash
# Zbuduj obraz i uruchom kontener w tle
docker compose up -d --build

# Podgląd logów (tworzenie schematu, seed, start serwera)
docker compose logs -f
```

Aplikacja będzie dostępna pod <http://localhost:3000>.

Przy pierwszym starcie kontener automatycznie:

1. wykonuje `prisma db push` (tworzy/aktualizuje schemat bazy),
2. na nowej bazie uruchamia seed z danymi startowymi (loginy jak w tabeli poniżej).

### Aktualizacja do nowej wersji

```bash
# Zatrzymaj, zbuduj nową wersję, uruchom ponownie
docker compose up -d --build
# lub bez przebudowy, jeśli obraz już zbudowano
docker compose restart
```

Dane (baza `myjnia.db`) pozostają na wolumenie `myjnia_data` — nie ma ryzyka utraty przy aktualizacji.

### Użyteczne polecenia

```bash
docker compose ps          # status kontenera
docker compose logs -f     # podgląd logów na żywo
docker compose down        # zatrzymanie (dane na wolumenie zostają)
docker compose down -v     # zatrzymanie i USUNIĘCIE wolumenu z danymi (ostrożnie!)
docker compose exec myjnia-planer npx prisma studio   # podgląd bazy
```

### Konfiguracja kontenera

Zmienne środowiskowe w `docker-compose.yml`:

| Zmienna | Domyślnie | Opis |
| ------- | --------- | ---- |
| `PORT` | `3000` | Port wewnątrz kontenera |
| `DATABASE_URL` | `file:/data/myjnia.db` | Lokalizacja bazy SQLite (na wolumenie `/data`) |
| `TZ` | `Europe/Warsaw` | Strefa czasowa |

Port na hoście można zmienić edytując mapowanie `"3000:3000"` (np. `"8080:3000"`), a dane — zmieniając nazwę wolumenu `myjnia_data`.

## Dane startowe (seed)

| Profil | Kod PIN | Rola |
| -------- | --------- | ------ |
| `admin` (Kierownik / Zarząd) | `admin2026` | ADMIN |
| `myjnia` (Stanowisko Myjni) | `myjnia2026` | WASHER |
| `handlowy`, `serwis`, `uzywane`, `omoda` | `1234` | DEPARTMENT |

> Zmień domyślne kody PIN po pierwszym uruchomieniu w **Słowniki i Ustawienia → Działy Salonu**.

## Podstawowe polecenia

```bash
npm run dev         # serwer deweloperski
npm run build       # produkcyjny build
npm start           # uruchomienie builda produkcyjnego
npm run lint        # ESLint
npx prisma studio   # podgląd bazy danych w przeglądarce
npx prisma db push  # synchronizacja schematu z bazą
```

## Struktura projektu

```
prisma/
  schema.prisma     # model danych (działy, usługi, pracownicy, zlecenia, ustawienia)
  seed.ts           # dane startowe
src/
  actions/          # Server Actions (auth, zlecenia, słowniki, raporty, ustawienia)
  app/              # strony: /, /order, /planner, /summary, /settings, /reports
  components/       # komponenty interfejsu (planner, orders, settings, reports, summary, auth)
  lib/prisma.ts     # współdzielone połączenie Prisma
```

## Konfiguracja

Ustawienia systemowe są przechowywane w bazie (model `AppSetting`) i edytowalne w **Słowniki i Ustawienia → Reguły Przepustowości Myjni**:

- `MAX_SIMULTANEOUS_CARS` — maksymalna liczba aut mytych jednocześnie (domyślnie 3)
- `DELIVERY_CAR_WEIGHT` — wagowy odpowiednik auta dostawczego
- `WORK_START_HOUR` / `WORK_END_HOUR` — godziny pracy myjni (domyślnie 7–19)
- `ALLOW_OVER_CAPACITY` — zezwól na przekroczenie limitu

## Licencja

Myjnia Planer jest projektem **source-available**, a nie klasycznym projektem open-source.

Kod źródłowy jest udostępniany na licencji **PolyForm Noncommercial License 1.0.0** — zobacz [LICENSE](LICENSE).

W uproszczeniu:

- **bezpłatnie:** zastosowania niekomercyjne dozwolone przez PolyForm, w tym testowanie, nauka, badania i ocena rozwiązania,
- **licencja komercyjna wymagana:** produkcyjne wykorzystanie aplikacji w działalności gospodarczej, w tym przez dealerów samochodowych, serwisy, floty, firmy transportowe, wypożyczalnie, myjnie komercyjne, integratorów i dostawców SaaS,
- **warunki komercyjne:** zobacz [COMMERCIAL_LICENSE.md](COMMERCIAL_LICENSE.md).

Publiczna dostępność repozytorium nie oznacza zgody na bezpłatne komercyjne wykorzystanie aplikacji.

Kontakt w sprawie licencji, wdrożeń i współpracy: **horcon.koszalin@gmail.com**
