# Instrukcja Obsługi Systemu „Myjnia Planer”
**Wersja dokumentu:** 1.0  
**Zastosowanie:** Działy salonu i serwisu (Handlowy, Serwis, Używane), Stanowisko Myjni (Tablet) oraz Kierownik / Administrator.

---

## Spis treści
1. [Wprowadzenie i logowanie do systemu](#1-wprowadzenie-i-logowanie-do-systemu)
2. [Instrukcja dla Pracowników Działów (Handlowy, Serwis, Używane)](#2-instrukcja-dla-pracowników-działów)
   - 2.1 [Zgłaszanie pojazdu do mycia](#21-zgłaszanie-pojazdu-do-mycia)
   - 2.2 [Pobieranie danych z DMS (autouzupełnianie)](#22-pobieranie-danych-z-dms-autouzupełnianie)
   - 2.3 [Zlecenia pilne (Ekspres / Na już)](#23-zlecenia-pilne-ekspres--na-już)
   - 2.4 [Podgląd obłożenia myjni i wybór terminu](#24-podgląd-obłożenia-myjni-i-wybór-terminu)
   - 2.5 [Śledzenie statusu zleceń i ekran zbiorczy Live](#25-śledzenie-statusu-zleceń-i-ekran-zbiorczy-live)
3. [Instrukcja dla Stanowiska Myjni (Tablet na myjni)](#3-instrukcja-dla-stanowiska-myjni-tablet)
   - 3.1 [Rozpoczęcie dnia i aktywacja pracowników na zmianie](#31-rozpoczęcie-dnia-i-aktywacja-pracowników-na-zmianie)
   - 3.2 [Kolejka oczekujących i planowanie w siatce godzinowej](#32-kolejka-oczekujących-i-planowanie-w-siatce-godzinowej)
   - 3.3 [Cykl życia zlecenia: Start, Gotowe, Wydane](#33-cykl-życia-zlecenia-start-gotowe-wydane)
   - 3.4 [Szybkie dodawanie pojazdu z poziomu myjni](#34-szybkie-dodawanie-pojazdu-z-poziomu-myjni)
   - 3.5 [Obsługa zleceń zaległych z poprzednich dni](#35-obsługa-zleceń-zaległych-z-poprzednich-dni)
4. [Instrukcja dla Kierownika i Administratora](#4-instrukcja-dla-kierownika-i-administratora)
   - 4.1 [Zarządzanie usługami mycia (kategorie i czasy)](#41-zarządzanie-usługami-mycia)
   - 4.2 [Zarządzanie działami i kodami PIN](#42-zarządzanie-działami-i-kodami-pin)
   - 4.3 [Zarządzanie pracownikami myjni](#43-zarządzanie-pracownikami-myjni)
   - 4.4 [Konfiguracja przepustowości i limitów myjni](#44-konfiguracja-przepustowości-i-limitów-myjni)
   - 4.5 [Raporty, statystyki i eksport do Excela](#45-raporty-statystyki-i-eksport-do-excela)
5. [Komunikacja wewnętrzna (Czat z myjnią)](#5-komunikacja-wewnętrzna-czat-z-myjnią)
6. [Często zadawane pytania (FAQ) i dobre praktyki](#6-często-zadawane-pytania-faq-i-dobre-praktyki)

---

<div style="page-break-after: always;"></div>

## 1. Wprowadzenie i logowanie do systemu

Aplikacja **Myjnia Planer** służy do sprawnego zamawiania, kolejkowania i rozliczania myć pojazdów w salonie oraz serwisie samochodowym. Eliminuje kolejki „kto pierwszy, ten lepszy”, bieganie na myjnię i nieporozumienia dotyczące gotowości aut.

### Role w systemie:
* **Działy (`DEPARTMENT`):** Pracownicy Działu Handlowego (Nowe), Serwisu, Samochodów Używanych oraz innych marek dealerskich. Mają dostęp do zamawiania myć, podglądu kolejki i statusu swoich pojazdów.
* **Stanowisko Myjni (`WASHER`):** Tablet dotykowy na myjni. Umożliwia pracownikom myjni układanie harmonogramu, przydzielanie aut do myjkowych oraz zmianę statusów na bieżąco.
* **Kierownik / Administrator (`ADMIN`):** Dostęp do pełnej konfiguracji słowników, uprawnień, PIN-ów, limitów wydajności oraz zaawansowanych raportów z eksportem do Excela.

### Logowanie krok po kroku:
1. Otwórz w przeglądarce adres aplikacji (np. `http://localhost:3000` lub adres w sieci firmowej).
2. Na kafelkach wybierz swój profil (np. **Dział Serwisu**, **Dział Handlowy**, **Myjnia** lub **Kierownik / Admin**).
3. Wprowadź przypisany do profilu **kod PIN** i kliknij **Zaloguj się**.

> 📸 **[MIEJSCE NA ZRZUT EKRANU 1: Ekran wyboru profilu i okno wpisywania kodu PIN]**

---

<div style="page-break-after: always;"></div>

## 2. Instrukcja dla Pracowników Działów

Pracownicy działów zamawiają mycie poprzez zakładkę **Zgłoś Mycie** (`/order`).

> 📸 **[MIEJSCE NA ZRZUT EKRANU 2: Formularz „Zgłoś Mycie” z siatką dostępnych terminów]**

### 2.1 Zgłaszanie pojazdu do mycia

Aby zgłosić auto:
1. **Wybierz dział** (jeśli jesteś zalogowany jako konkretny dział, pole jest zablokowane na Twoim dziale).
2. **Podaj numer rejestracyjny** pojazdu (np. `KR 12345`).
3. **Podaj markę i model** (np. `Omoda 5`, `Jaecoo 7`).
4. **Określ typ pojazdu:**
   * **Osobowe** – standardowy czas i waga na myjni.
   * **Dostawcze / Duże** – zajmuje więcej czasu i przepustowości (domyślnie przelicznik x1.5).
5. **Wybierz rodzaj usługi** (np. *Mycie serwisowe podstawowe*, *Wydanie nowego pojazdu*, *De-konserwacja / Odwoskowanie*).
6. **Wskaż oczekiwaną godzinę gotowości:**
   * Wybierz **datę** (Dziś, Jutro lub Pojutrze).
   * Wybierz **godzinę, na którą auto MUSI być gotowe** (np. przed przyjazdem klienta o 14:00).
   * *Wskazówka:* Pod spodem widoczna jest rekomendowana godzina rozpoczęcia mycia, aby zdążyć przed wydaniem.
7. **Osoba kontaktowa i telefon** – ułatwia myjni kontakt w razie pytań.
8. **Uwagi i szablony** – skorzystaj z podpowiedzi klikając szybkie tagi (np. *„Uwaga na świeży lakier”*, *„Tylko zewnątrz”*, *„Klient czeka na miejscu”*).
9. Kliknij przycisk **Zapisz i zgłoś mycie**.

---

### 2.2 Pobieranie danych z DMS (autouzupełnianie)

Jeśli salon korzysta z integracji DMS (np. DMS Solution / zlecenia_sync):
1. Zacznij wpisywać w polu formularza **numer rejestracyjny**, **fragment VIN** lub **numer zlecenia serwisowego**.
2. System automatycznie wyświetli listę dopasowanych aktywnych zleceń z systemu DMS.
3. Kliknięcie na znaleziony pojazd **automatycznie uzupełni**:
   * Numer rejestracyjny i model,
   * Numer zlecenia DMS i VIN,
   * Sugerowaną usługę i osobę kontaktową.

> 📸 **[MIEJSCE NA ZRZUT EKRANU 3: Podpowiedzi pojazdów pobierane w czasie rzeczywistym z DMS]**

---

### 2.3 Zlecenia pilne (Ekspres / Na już)

> ⚠️ **Ważne:** Zlecenia ekspresowe zaburzają zaplanowaną kolejkę innych działów. Używaj ich wyłącznie w uzasadnionych sytuacjach awaryjnych!

Gdy auto musi trafić na myjnię natychmiast:
1. Zaznacz przełącznik **„Zlecenie pilne / Ekspres (Na już)”**.
2. Wymagane jest uzupełnienie dwóch pól:
   * **Kto zatwierdził priorytet** (np. *Kierownik Serwisu Jan Kowalski*).
   * **Powód priorytetu** (np. *Klient reklamacyjny na salonie – odbiór za 30 min*).
3. Auto otrzyma wyróżniający czerwony znacznik **PILNE** na tablecie myjni oraz na ekranach w salonie.

---

### 2.4 Podgląd obłożenia myjni i wybór terminu

W dolnej części formularza znajduje się **Siatka dostępności terminów**:
* **Zielone sloty:** Duża dostępność – bezpieczny termin na zgłoszenie.
* **Żółte / Pomarańczowe sloty:** Duże obłożenie.
* **Czerwone sloty:** Osiągnięto limit przepustowości myjni.
* Kliknięcie na dany slot czasowy automatycznie ustawia wybraną godzinę w formularzu.

---

### 2.5 Śledzenie statusu zleceń i ekran zbiorczy Live

Pracownicy działu mogą na bieżąco sprawdzać stan swoich aut w dolnej części widoku **Zgłoś Mycie** oraz na pełnoekranowym **Ekranie Statusu (`/summary`)**:

| Status | Znaczenie | Działanie dla pracownika |
| :--- | :--- | :--- |
| **Zaplanowane / W kolejce** | Zgłoszenie przyjęte, oczekuje na wjazd lub przydział do myjkowego. | Auto czeka na parkingu/stanowisku serwisu. |
| **W trakcie mycia** | Pojazd znajduje się fizycznie na stanowisku myjni. | Trwa mycie – nie przestawiaj auta. |
| **Gotowe do odbioru** | Mycie zakończone! Samochód czeka na odbiór z myjni. | **Można odebrać auto i kluczyki z myjni.** |
| **Zakończone / Wydane** | Samochód został odebrany przez dział lub wydany klientowi. | Zlecenie zarchiwizowane w historii dnia. |

> 📸 **[MIEJSCE NA ZRZUT EKRANU 4: Ekran Statusu Live (`/summary`) wyświetlany na monitorze w salonie]**

---

<div style="page-break-after: always;"></div>

## 3. Instrukcja dla Stanowiska Myjni (Tablet)

Pracownicy myjni pracują głównie na tablecie w widoku **Planer Myjni** (`/planner`). Interfejs zaprojektowano do szybkiej obsługi dotykowej.

> 📸 **[MIEJSCE NA ZRZUT EKRANU 5: Główny widok Planera Myjni na tablecie z podziałem na myjkowych i godziny]**

### 3.1 Rozpoczęcie dnia i aktywacja pracowników na zmianie
Na początku zmiany należy określić, kto danego dnia pracuje na myjni:
1. W górnym pasku kliknij przycisk **„Rozpocznij zmianę / Pracownicy”** lub kliknij w awatary pracowników.
2. Zaznacz osoby, które są dzisiaj obecne na zmianie (np. *Marek K.*, *Piotr N.*).
3. Potwierdź wybór.
4. Na tablicy planera pojawią się wyłącznie kolumny aktywnych dzisiaj pracowników. Pozwala to na precyzyjne i realne planowanie czasu pracy.

---

### 3.2 Kolejka oczekujących i planowanie w siatce godzinowej
* **Boczny panel „Oczekujące / Nieprzypisane”:** Zbiera wszystkie auta zgłoszone przez działy, które nie zostały jeszcze przypisane do konkretnej godziny lub myjkowego.
* **Przypisanie auta:**
  * **Metoda 1 (Przeciągnij i upuść):** Przeciągnij kafelek auta z kolejki na wybrany slot godzinowy i kolumnę danego pracownika.
  * **Metoda 2 (Dotknięcie):** Kliknij na kafelek auta i wybierz godzinę oraz pracownika z okna dialogowego.
* **Zmiana kolejności:** Zlecenia w obrębie siatki można dowolnie przesuwać pomiędzy godzinami i pracownikami w zależności od tempa prac.

---

### 3.3 Cykl życia zlecenia: Start, Gotowe, Wydane

Każdy kafelek pojazdu na planera posiada duże, czytelne przyciski akcji:

1. **Rozpoczęcie mycia:**
   * Gdy auto wjeżdża na stanowisko, kliknij przycisk **„Start”** (ikona trójkąta ▶️).
   * Status zmienia się na **W trakcie** (kolor niebieski z animacją). Dział widzi na swoim ekranie, że praca ruszyła.
2. **Zakończenie mycia (Gotowe do odbioru):**
   * Po zakończeniu mycia kliknij przycisk **„Gotowe”** (ikona ptaszka ✔️).
   * Opcjonalnie możesz dopisać krótką notatkę (np. *„Odprysk na masce od kamienia”*, *„Zostawiono na parkingu B2”*).
   * Dział natychmiast otrzymuje informację, że samochód jest czysty i można go odebrać.
3. **Wydanie pojazdu:**
   * Gdy doradca lub handlowiec odbierze auto z myjni, kliknij **„Zakończ / Wydaj”**. Auto przechodzi do historii dnia.

---

### 3.4 Szybkie dodawanie pojazdu z poziomu myjni
Jeśli pod myjnię podjedzie pojazd bez wcześniejszego zgłoszenia z działu („z marszu”):
1. Kliknij bezpośrednio na pusty slot godzinowy w kolumnie pracownika lub duży przycisk **„+ Szybkie mycie”**.
2. Wpisz numer rejestracyjny, wskaż dział i wybierz usługę.
3. Zlecenie natychmiast pojawi się w wybranym miejscu na planera z oznaczeniem wpisu bezpośredniego.

---

### 3.5 Obsługa zleceń zaległych z poprzednich dni
Jeśli jakieś auto z wczoraj nie zostało umyte (np. brakło czasu przed końcem zmiany):
1. Na samej górze planera pojawi się żółte ostrzeżenie: **„Niezakończone zlecenia z poprzednich dni”**.
2. Rozwiń listę i wybierz:
   * **Przenieś na dzisiaj** – auto trafia do dzisiejszej kolejki oczekujących.
   * **Anuluj zlecenie** – jeśli mycie nie jest już aktualne.

---

<div style="page-break-after: always;"></div>

## 4. Instrukcja dla Kierownika i Administratora

Kierownik i Administrator (profil `admin`) mają dostęp do pełnej konfiguracji w zakładce **Słowniki i Ustawienia** (`/settings`) oraz do zakładki **Raporty** (`/reports`).

> 📸 **[MIEJSCE NA ZRZUT EKRANU 6: Panel konfiguracji parametrów myjni i słowników]**

### 4.1 Zarządzanie usługami mycia
W zakładce **Usługi**:
* Dodawaj nowe rodzaje myć (np. *Mycie ekspresowe*, *Ceramika*, *Wydanie nowego*).
* Definiuj **domyślny czas trwania w minutach** (odpowiedzialny za rezerwację miejsca na planera).
* Wybieraj kolor etykiety.
* Dodawaj **gotowe szablony uwag**, ułatwiające doradcom zgłaszanie specyficznych wymagań.

---

### 4.2 Zarządzanie działami i kodami PIN
W zakładce **Działy**:
* Edytuj nazwy i skróty kodowe działów.
* **Zmiana kodów PIN:** Każdy dział posiada własny 4-cyfrowy kod PIN. Zmieniaj kody okresowo, aby zapobiec podszywaniu się pod inne działy.
* **Integracja DMS:** Przypisz odpowiedni kod serwisu z DMS (np. `BS-1` lub `BS-5`) do odpowiedniego działu, aby filtrować zlecenia pobierane z pliku wymiany.
* Ustaw **domyślną usługę** dla każdego działu (np. Serwis ma domyślnie *Mycie serwisowe*, a Salon *Wydanie nowego*).

---

### 4.3 Zarządzanie pracownikami myjni
W zakładce **Pracownicy**:
* Wprowadzaj imiona i nazwiska myjkowych oraz ich skróty wyświetlane na tabletach.
* Przypisuj kolory identyfikacyjne.
* Jeśli pracownik przebywa na dłuższym urlopie lub zakończył współpracę – oznacz go jako **nieaktywny** (zostanie zachowany w historii raportów, ale nie będzie wyświetlany na bieżącej liście obecności).

---

### 4.4 Konfiguracja przepustowości i limitów myjni
W zakładce **Przepustowość**:
* **Maksymalna liczba aut jednocześnie na myjni** (np. 2 lub 3 stanowiska mycia).
* **Przelicznik auta dostawczego** (np. `1.5` oznacza, że bus zajmuje 1.5 standardowego miejsca i czasu).
* **Godziny otwarcia myjni** (np. od `07:00` do `18:00`) – określają siatkę godzinową planera.
* **Polityka nadmiarowości (Over-capacity):** Czy system ma zezwalać działom na dodawanie zleceń ponad limit po wyświetleniu wyraźnego ostrzeżenia.

---

### 4.5 Raporty, statystyki i eksport do Excela
Dostępne wyłącznie dla roli `ADMIN` w zakładce **Raporty** (`/reports`).

> 📸 **[MIEJSCE NA ZRZUT EKRANU 7: Moduł raportów – wykresy wykonanych myć i przycisk eksportu do Excela]**

1. **Wybór zakresu czasu:**
   * Szybkie filtry: *Dziś*, *Ostatnie 7 dni*, *Ostatnie 30 dni*, *Ten miesiąc*.
   * Dowolny zakres od–do.
2. **Kluczowe wskaźniki w raporcie:**
   * Łączna liczba umytych pojazdów,
   * Sumaryczny i średni czas pracy,
   * Udział aut osobowych vs dostawczych,
   * Zestawienie wykonanej pracy **w podziale na pracowników myjni**,
   * Zestawienie kosztowe/ilościowe **w podziale na działy zlecające**.
3. **Eksport do Excela (`.xls`):**
   * Kliknij zielony przycisk **„Pobierz Excel (.xls)”**.
   * Wygenerowany plik arkusza kalkulacyjnego zawiera gotowe podsumowanie z podziałem na działy i pracowników, idealne do comiesięcznego rozliczenia wewnętrznego w firmie.

---

<div style="page-break-after: always;"></div>

## 5. Komunikacja wewnętrzna (Czat z myjnią)

W prawym dolnym rogu każdego ekranu znajduje się pływający widżet **Wewnętrznego Czatu**.

> 📸 **[MIEJSCE NA ZRZUT EKRANU 8: Okno pływającego czatu pomiędzy działem a myjnią]**

* **Bezpośredni kontakt:** Dział może napisać szybką wiadomość do myjni (np. *„Auto KR 12345 podstawione pod bramę 2”*, *„Proszę o dokładne umycie felg”*).
* **Informacja zwrotna z myjni:** Pracownik myjni może odpisać doradcy bez konieczności dzwonienia przez telefon (np. *„Auto gotowe, kluczyk w stacyjce”*).
* **Powiadomienia o nieprzeczytanych wiadomościach:** Czerwony wskaźnik liczby nowych wiadomości informuje o nadejściu nowej odpowiedzi.

---

<div style="page-break-after: always;"></div>

## 6. Często zadawane pytania (FAQ) i dobre praktyki

### ❓ Co zrobić, gdy na dany dzień brakuje wolnych slotów w siatce?
> Jeśli termin jest pilny, skontaktuj się z kierownikiem myjni lub skorzystaj z czatu. W wyjątkowych sytuacjach pracownik myjni lub administrator może zaakceptować zlecenie w trybie nadmiarowym (*over-capacity*).

### ❓ Zgłosiłem auto z błędem w numerze rejestracyjnym. Jak go poprawić?
> Wejdź w zakładkę **Zgłoś Mycie**, znajdź swoje auto na liście poniżej formularza i kliknij ikonę ołówka (edycja) lub skontaktuj się bezpośrednio z myjnią przez wbudowany czat.

### ❓ Kto powinien zmieniać status na „Zakończone / Wydane”?
> Status ten zmienia pracownik myjni lub doradca odbierający auto w momencie, gdy samochód fizycznie odjeżdża z placu myjni. Zwalnia to przestrzeń na parkingu odbiorczym.

### 💡 Dobre praktyki dla salonu i serwisu:
1. **Planuj z wyprzedzeniem:** Zgłaszaj wydania aut nowych i używanych dzień wcześniej – pozwala to myjni ułożyć optymalny grafik na rano.
2. **Podawaj realną godzinę gotowości:** Nie wpisuj „na 08:00 rano”, jeśli klient przychodzi po auto o 15:00. Umożliwi to sprawne obsłużenie wydań porannych.
3. **Wpisuj telefon lub imię osoby odpowiedzialnej:** W razie braku kluczyka lub wątpliwości myjnia natychmiast wie, z kim się skontaktować.
4. **Zawsze odbieraj auto bezzwłocznie po statusie „Gotowe”:** Zastawiona strefa odbiorcza blokuje wyjazd kolejnym umytym pojazdom.

---
*Dokument przygotowany do druku lub eksportu do PDF.*  
*Po wklejeniu dedykowanych zrzutów ekranu w oznaczonych miejscach, użyj opcji „Drukuj do PDF” w przeglądarce lub edytorze.*
