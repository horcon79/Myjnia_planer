// Współdzielone typy DMS (importowane bezpiecznie przez komponenty klienta — bez kodu serwerowego).

export interface DmsOrder {
  dmsOrderId: number;      // zlecenie_id (us_Zlecenie.ID)
  orderNumber: string;     // numer_zlecenia (NUMER_DLUGI)
  openDate: string | null; // data_otwarcia (yyyy-MM-dd)
  service: string;         // serwis (np. "BS-1", "BS-5")
  licensePlate: string | null; // nr_rejestracyjny; gdy brak — VIN (nr_nadwozia)
  hasPlate: boolean;       // czy pojazd ma prawdziwą rejestrację (false → pokazany jest VIN)
  brand: string;           // marka (fallback "Mercedes-Benz")
  model: string;           // model
  vin: string | null;      // nr_nadwozia
  client: string | null;   // klient (K_NAZWA)
}

export interface DmsSnapshot {
  updatedAt: string | null; // updated_at z pliku JSON
  serwisy: string[];
  count: number;
  orders: DmsOrder[];
  error: string | null;
  filePath: string;
}

export interface DmsSearchResult extends DmsOrder {
  alreadyReported: boolean; // czy pojazd ma już aktywne zlecenie mycia w danym dziale
}

export interface DmsServiceStatus {
  available: boolean;       // czy plik jest czytelny i zawiera zlecenia dla serwisu
  serviceCode: string;
  totalCount: number;       // liczba zleceń w pliku dla danego serwisu
  fileUpdatedAt: string | null;
  fileAgeMinutes: number | null;
  stale: boolean;           // plik starszy niż dozwolony wiek (dmsMaxAgeMin)
  error: string | null;
}
