# Propozycje poprawek i rozwoju – MX10 (wersja na smartfon)

Dokument zbiera wyniki przeglądu aplikacji **MX10 – smartfon** oraz plan usprawnień z zachowaniem jej głównych założeń:
- **Smartfon na pierwszym miejscu** – wygodna obsługa kciukiem (pola dotykowe min. 44–48 px), czytelność na małym ekranie w pionie i poziomie, brak przeładowania interfejsu.
- **Zero zewnętrznych zależności** – czysty HTML, CSS i JavaScript, brak kroków budowania.
- **Pełna praca bez internetu (PWA)** – wszystkie funkcje (w tym kody QR i obróbka zdjęć) działają lokalnie w telefonie.

---

## Etap 1 – wdrażany pakiet poprawek, wydajności i funkcji

### 1. Połączenie Bluetooth, obsługa błędów drukarki i systemów mobilnych
- **Natychmiastowa reakcja na błędy drukarki (`0xa3`)** – zerowanie `dr.stan` przed startem zadania oraz sprawdzanie bitów błędu (`brak papieru`, `otwarta klapka`, `przegrzana głowica`) w trakcie wysyłania ramek w `drukarka.js`, aby przerwać wysyłanie od razu zamiast przesyłać tysiące linii „w próżnię”. Ostrzeżenie o `słabej baterii` nie przerywa druku, ale jest pokazywane w podsumowaniu.
- **Usunięcie blokady `navigator.bluetooth.getAvailability()` przed `requestDevice()`** – na części telefonów z Androidem `getAvailability()` zwraca `false` mimo sprawnego modułu lub blokuje systemowe okienko Chrome *„Zezwolić na włączenie Bluetooth?”*. Wywołanie bezpośrednio `requestDevice()` (ze sprawdzeniem dostępności dopiero przy błędzie) pozwala systemowi samemu włączyć Bluetooth.
- **Automatyczne łączenie ze znaną drukarką (`navigator.bluetooth.getDevices()`)** – jeśli przeglądarka pamięta wcześniej sparowaną drukarkę MX10, aplikacja próbuje połączyć się z nią bezpośrednio bez otwierania systemowej listy wyboru za każdym razem.
- **Szybszy wysuw papieru po wydruku** – puste linie wysuwu (`PUSTA`) nie grzeją głowicy, więc mogą być wysyłane z krótszą pauzą niż linie z grafiką, co skraca końcówkę wydruku o 1,5–3 s.
- **Czytelny komunikat na iPhonie i iPadzie (iOS/iPadOS)** – wykrycie iOS (gdzie ani Safari, ani Google Chrome nie mają Web Bluetooth z powodu ograniczeń WebKit) i wyświetlenie konkretnej wskazówki o przeglądarce **Bluefy** zamiast mylącego odesłania do Chrome.

### 2. Pamięć, wydajność na smartfonach i praca offline
- **Zwalnianie pamięci `ImageBitmap` (`bmp.close()`)** – jawne zamykanie bitmap GPU/RAM przy usuwaniu zdjęć z mapy `obrazy` we wszystkich trybach (`ekran.js`, `aparat.js`, `twarz.js`, `czesci.js`, `paski.js`) oraz automatyczne odśmiecanie nieużywanych zdjęć po wypadnięciu z historii `Cofnij`/`Ponów`.
- **Zapis głównego dokumentu w `IndexedDB` zamiast `localStorage`** – przeniesienie przechowywania bloków i zdjęć z `localStorage` (limit ~5 MB i kosztowne `JSON.stringify` ciągów Base64) do `IndexedDB` z obiektami `Blob` (z automatyczną migracją dotychczasowego zapisu z `localStorage`).
- **Cache warstw i fragmentów podczas gestów dotykowych** – zapamiętywanie przeliczonych masek (w tym rozmycia `blur`) i pikseli warstw w `czesci.js`, `paski.js` oraz `twarz.js`, aby przesuwanie elementu jednym palcem nie tworzyło dziesiątek tymczasowych elementów `<canvas>` i wywołań `getImageData()` w każdej klatce animacji.
- **Bezpieczny i szybki Service Worker (`sw.js`)** – natychmiastowe podawanie zapisanych plików z pamięci podręcznej (brak 4-sekundowego oczekiwania na słabym zasięgu komórkowym) z atomową aktualizacją całej paczki plików w tle, bez ryzyka pomieszania starego i nowego skryptu.

### 3. Historia zmian, wygoda obsługi (UX) i dostępność na telefonie
- **Poprawione `Cofnij` i dodane `Ponów` na głównym ekranie**:
  - brak pustych kroków historii przy klikaniu *„Wpisz tekst”* na pustym dokumencie,
  - dzielenie dłuższego pisania w `<textarea>` na osobne kroki cofania po krótkiej przerwie lub wyjściu z pola,
  - przycisk **Ponów** obok **Cofnij** w górnym pasku.
- **Szybsza edycja na małym ekranie**:
  - przycisk *„Edytuj tekst”* w zakładce `Wygląd` dla wybranego bloku tekstowego oraz przejście prosto do edycji tekstu po ponownym stuknięciu już zaznaczonego tekstu na podglądzie taśmy,
  - przycisk *„Wyczyść”* na zakładce `Treść` (gdy jest więcej elementów), pozwalający jednym dotknięciem zacząć nowy wydruk z bezpiecznym cofnięciem z dymka,
  - czytelna informacja w `Wygląd`, gdy w trybie `Baner (obrót o 90°)` maksymalny rozmiar czcionki jest ograniczony szerokością taśmy.
- **Ulepszenia w aparacie i kadrowaniu**:
  - **samowyzwalacz (3 s)** w aparacie – ułatwia robienie zdjęć samemu (szczególnie w trybach *Twarz z trzech* i *Paski*),
  - strojenie **kontrastu** oraz szybkie **kadrowanie** dostępne od razu na ekranie zrobionego zdjęcia (`#ap-gotowe`), bez konieczności przenoszenia zdjęcia do głównego dokumentu,
  - szybkie proporcje kadru (`Dowolny`, `1:1`, `3:4`) oraz `ResizeObserver` w oknie `#kadrowanie`.
- **Dostępność i fokus** – przenoszenie i przywracanie fokusu przy otwieraniu/zamykaniu warstw modalnych (`inert`), `role="tabpanel"` na widokach zakładek, ikona `apple-touch-icon` oraz obsługa `Escape` i `Ctrl+Z`/`Ctrl+Y` (np. przy podłączonej klawiaturze lub teście na komputerze).

### 4. Nowe funkcje w Etapie 1
- **Generator kodów QR (`qr.js`)** – nowy typ bloku **Kod QR** działający w 100% offline:
  - tryb **Tekst / Link** (strony WWW, dowolny tekst, wizytówka, numer telefonu),
  - tryb **Wi‑Fi** (nazwa sieci SSID, hasło, zabezpieczenie WPA/WEP/otwarta, sieć ukryta – automatyczny format `WIFI:T:...`) z opcjonalnym podpisem pod kodem,
  - dobór rozmiaru na taśmie i wyrównania, ostre rysowanie modułów bez rozmycia.
- **Zapisz / Udostępnij obraz (PNG + Web Share API)**:
  - w podglądzie gotowego zdjęcia/kolażu (`#ap-gotowe`) – możliwość udostępnienia lub zapisania do galerii telefonu (zarówno w gładkich odcieniach szarości z kolażu, jak i w charakterystycznych kropkach drukarki),
  - na głównym ekranie (zakładka `Drukuj`) – możliwość udostępnienia lub zapisania całego wydruku jako pliku PNG.
- **„Udostępnij do MX10” (`share_target` w PWA)** – po zainstalowaniu aplikacji na Androidzie możliwość wysyłania zdjęć oraz zaznaczonego tekstu/linków bezpośrednio z Galerii lub przeglądarki przez systemowe menu *Udostępnij → MX10* (obsługa zapytań `POST multipart/form-data` w `sw.js`).

---

## Etap 2 – propozycje na kolejne wersje

1. **Lepsze odwzorowanie kolorowych emoji w tekście** – wykrywanie kolorowych piktogramów podczas renderowania tekstu w `rdzen.js` i nakładanie na nie rastra (np. Atkinsona/Floyda–Steinberga) zamiast twardego progu jasności `150`, dzięki czemu żółte emoji (😊, ⭐, 👍) nie będą tracić wypełnienia.
2. **Szkicownik / odręczny podpis palcem** – lekki blok rysunkowy (pióro o zmiennej grubości, gumka, cofnij) do szybkich odręcznych notatek, strzałek i podpisów na taśmie.
3. **Ramki ozdobne, etykiety i listy odhaczane (`☐`)** – proste obramowania wokół tekstu (np. etykieta na słoik/przyprawy, ramka prezentowa, datownik) oraz szybka zamiana wierszy tekstu w listę zakupów/zadań z kwadracikami do odhaczania długopisem na papierze.
4. **Zapisane szablony w telefonie** – możliwość zapisania w `IndexedDB` kilku ulubionych projektów (np. stałych etykiet lub wizytówki z kodem QR) i wczytywania ich jednym dotknięciem.
5. **Przeciąganie bloków na liście treści** – zmiana kolejności bloków w zakładce `Treść` przytrzymaniem i przesunięciem palcem obok dotychczasowych przycisków `↑` / `↓`.
