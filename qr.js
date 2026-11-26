'use strict';
/* Generator kodów QR (ISO/IEC 18004, wersje 1–20, tryb bajtowy UTF-8, korekcja M z zapasem L).
   Działa całkowicie w telefonie, bez internetu i zewnętrznych bibliotek. */
const QR_EC_M = [[10,1],[16,1],[26,1],[18,2],[24,2],[16,4],[18,4],[22,4],[22,5],[26,5],
  [30,5],[22,8],[22,9],[24,9],[24,10],[28,10],[28,11],[26,13],[26,14],[26,16]];
const QR_EC_L = [[7,1],[10,1],[15,1],[20,1],[26,1],[18,2],[20,2],[24,2],[30,2],[18,4],
  [20,4],[24,4],[26,4],[30,4],[22,6],[24,6],[28,6],[30,6],[28,7],[28,8]];

const QR_EXP = new Uint8Array(512), QR_LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  QR_EXP[i] = QR_EXP[i + 255] = x; QR_LOG[x] = i;
  x = (x << 1) ^ (x & 128 ? 0x11d : 0);
}
const qrMnoz = (a, b) => a && b ? QR_EXP[QR_LOG[a] + QR_LOG[b]] : 0;

function qrResztaRS(dane, ileEc) {
  const w = new Uint8Array(ileEc + 1); w[0] = 1;
  for (let i = 0; i < ileEc; i++) {
    const a = QR_EXP[i];
    for (let j = i + 1; j > 0; j--) w[j] ^= qrMnoz(w[j - 1], a);
  }
  const r = new Uint8Array(ileEc);
  for (const b of dane) {
    const k = b ^ r[0];
    r.copyWithin(0, 1); r[ileEc - 1] = 0;
    for (let j = 0; j < ileEc; j++) r[j] ^= qrMnoz(w[j + 1], k);
  }
  return r;
}

function qrOsieWyr(w) {
  if (w === 1) return [];
  const ile = Math.floor(w / 7) + 2, ost = 10 + 4 * w;
  const krok = ile === 2 ? 0 : Math.ceil((ost - 6) / (ile - 1) / 2) * 2;
  const os = [6];
  for (let i = ile - 2; i >= 0; i--) os.push(ost - i * krok);
  return os;
}

function qrWzorce(w) {                          // rezerwuje wzorce stałe i zwraca { N, wolne, funkcja, siatka }
  const N = 17 + 4 * w, siatka = new Uint8Array(N * N), funkcja = new Uint8Array(N * N);
  const ustaw = (x, y, c) => { if (x >= 0 && x < N && y >= 0 && y < N) { siatka[y * N + x] = c ? 1 : 0; funkcja[y * N + x] = 1; } };
  const znacznik = (ox, oy) => {
    for (let dy = -1; dy <= 7; dy++) for (let dx = -1; dx <= 7; dx++) {
      const wRamce = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
      const czarny = wRamce && (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
      ustaw(ox + dx, oy + dy, czarny);
    }
  };
  znacznik(0, 0); znacznik(N - 7, 0); znacznik(0, N - 7);
  for (let i = 8; i < N - 8; i++) { ustaw(i, 6, i % 2 === 0); ustaw(6, i, i % 2 === 0); }
  const os = qrOsieWyr(w);
  for (const ay of os) for (const ax of os) {
    if ((ax < 9 && ay < 9) || (ax > N - 10 && ay < 9) || (ax < 9 && ay > N - 10)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
      ustaw(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  for (let i = 0; i < 9; i++) { if (i !== 6) { ustaw(8, i, 0); ustaw(i, 8, 0); } }
  for (let i = 0; i < 8; i++) { ustaw(N - 1 - i, 8, 0); ustaw(8, N - 1 - i, 0); }
  ustaw(8, 4 * w + 9, 1);                       // stały ciemny moduł
  if (w >= 7) {
    let b = w << 12;
    for (let i = 17; i >= 12; i--) if ((b >> i) & 1) b ^= 0x1f25 << (i - 12);
    const vbits = (w << 12) | b;
    for (let i = 0; i < 18; i++) {
      const c = (vbits >> i) & 1, a = Math.floor(i / 3), d = N - 11 + (i % 3);
      ustaw(a, d, c); ustaw(d, a, c);
    }
  }
  let wolne = 0; for (let i = 0; i < N * N; i++) if (!funkcja[i]) wolne++;
  return { N, wolne, funkcja, siatka };
}

function qrWpiszFormat(siatka, N, ecBity, maska) {
  const dane = (ecBity << 3) | maska;
  let r = dane << 10;
  for (let i = 14; i >= 10; i--) if ((r >> i) & 1) r ^= 0x537 << (i - 10);
  const f = ((dane << 10) | r) ^ 0x5412;
  const lewoGoraX = [8,8,8,8,8,8,8,8,7,5,4,3,2,1,0];
  const lewoGoraY = [0,1,2,3,4,5,7,8,8,8,8,8,8,8,8];
  for (let i = 0; i < 15; i++) {
    const bit = (f >> i) & 1;
    siatka[lewoGoraY[i] * N + lewoGoraX[i]] = bit;
    if (i < 8) siatka[8 * N + (N - 1 - i)] = bit;
    else siatka[(N - 15 + i) * N + 8] = bit;
  }
}

const QR_MASKI = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (x, y) => ((x * y) % 2 + (x * y) % 3) === 0,
  (x, y) => (((x * y) % 2 + (x * y) % 3) % 2) === 0,
  (x, y) => (((x + y) % 2 + (x * y) % 3) % 2) === 0,
];

function qrKara(s, N) {                         // ocena maski wg ISO/IEC 18004 (mniejsza = czytelniejszy kod)
  let kara = 0, czarne = 0;
  const wzorzecLinii = czyWiersz => {
    for (let a = 0; a < N; a++) {
      let pop = -1, dl = 0;
      const paski = [];
      for (let b = 0; b < N; b++) {
        const c = s[czyWiersz ? a * N + b : b * N + a];
        if (c === pop) dl++; else { if (dl) paski.push(dl); pop = c; dl = 1; }
      }
      paski.push(dl);
      for (const d of paski) if (d >= 5) kara += d - 2;
      // Szukamy czarnego wzorca 1:1:3:1:1 z 4 jasnymi modułami po jednej ze stron
      let kolor = s[czyWiersz ? a * N : a];
      for (let i = 0; i <= paski.length - 5; i++, kolor ^= 1) {
        if (kolor !== 1) continue;
        const k = paski[i];
        if (paski[i+1] === k && paski[i+2] === 3 * k && paski[i+3] === k && paski[i+4] === k) {
          const lewo = i === 0 || paski[i - 1] >= 4 * k, prawo = i + 5 >= paski.length || paski[i + 5] >= 4 * k;
          if (lewo || prawo) kara += 40;
        }
      }
    }
  };
  wzorzecLinii(true); wzorzecLinii(false);
  for (let y = 0; y < N - 1; y++) for (let x = 0; x < N - 1; x++) {
    const c = s[y * N + x];
    if (c === s[y * N + x + 1] && c === s[(y + 1) * N + x] && c === s[(y + 1) * N + x + 1]) kara += 3;
  }
  for (let i = 0; i < N * N; i++) czarne += s[i];
  kara += Math.floor(Math.abs(czarne * 20 - N * N * 10) / (N * N)) * 10;
  return kara;
}

function generujQr(tekst) {                     // zwraca { N, s:Uint8Array(N*N) } albo null gdy tekst pusty/za długi
  const bajty = new TextEncoder().encode(tekst);
  if (!bajty.length) return null;
  let wybrane = null;
  for (const [tabela, ecBity] of [[QR_EC_M, 0], [QR_EC_L, 1]]) {
    for (let w = 1; w <= 20; w++) {
      const wz = qrWzorce(w), calosc = wz.wolne >> 3, [ecNaBlok, blokow] = tabela[w - 1];
      const pojemnosc = calosc - ecNaBlok * blokow, bityDl = w <= 9 ? 8 : 16;
      if (4 + bityDl + bajty.length * 8 <= pojemnosc * 8) { wybrane = { w, wz, calosc, pojemnosc, ecNaBlok, blokow, ecBity, bityDl }; break; }
    }
    if (wybrane) break;
  }
  if (!wybrane) return null;
  const { wz:{ N, funkcja, siatka:baza }, calosc, pojemnosc, ecNaBlok, blokow, ecBity, bityDl } = wybrane;

  const bity = [], dopisz = (wart, ile) => { for (let i = ile - 1; i >= 0; i--) bity.push((wart >> i) & 1); };
  dopisz(0b0100, 4); dopisz(bajty.length, bityDl);
  for (const b of bajty) dopisz(b, 8);
  const brak = pojemnosc * 8 - bity.length;
  dopisz(0, Math.min(4, brak));
  while (bity.length & 7) bity.push(0);
  const slowa = new Uint8Array(pojemnosc);
  for (let i = 0; i < bity.length >> 3; i++) {
    let v = 0; for (let k = 0; k < 8; k++) v = (v << 1) | bity[i * 8 + k];
    slowa[i] = v;
  }
  for (let i = bity.length >> 3, p = 0; i < pojemnosc; i++, p ^= 1) slowa[i] = p ? 0x11 : 0xec;

  const krotkich = blokow - (pojemnosc % blokow), dlKr = Math.floor(pojemnosc / blokow);
  const daneBl = [], ecBl = [];
  for (let i = 0, poz = 0; i < blokow; i++) {
    const dl = dlKr + (i >= krotkich ? 1 : 0), wyc = slowa.subarray(poz, poz + dl);
    poz += dl; daneBl.push(wyc); ecBl.push(qrResztaRS(wyc, ecNaBlok));
  }
  const strumien = new Uint8Array(calosc); let k = 0;
  for (let c = 0; c <= dlKr; c++) for (let i = 0; i < blokow; i++) if (c < daneBl[i].length) strumien[k++] = daneBl[i][c];
  for (let c = 0; c < ecNaBlok; c++) for (let i = 0; i < blokow; i++) strumien[k++] = ecBl[i][c];

  const surowa = Uint8Array.from(baza);
  let bitNr = 0, wGore = true;
  for (let x = N - 1; x > 0; x -= 2) {
    if (x === 6) x--;
    for (let krok = 0; krok < N; krok++) {
      const y = wGore ? N - 1 - krok : krok;
      for (const dx of [0, -1]) {
        const px = x + dx, idx = y * N + px;
        if (funkcja[idx]) continue;
        surowa[idx] = bitNr < strumien.length * 8 ? (strumien[bitNr >> 3] >> (7 - (bitNr & 7))) & 1 : 0;
        bitNr++;
      }
    }
    wGore = !wGore;
  }

  let najlepsza = null, minKara = Infinity;
  for (let m = 0; m < 8; m++) {
    const kopia = Uint8Array.from(surowa), fn = QR_MASKI[m];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!funkcja[y * N + x] && fn(x, y)) kopia[y * N + x] ^= 1;
    qrWpiszFormat(kopia, N, ecBity, m);
    const ocena = qrKara(kopia, N);
    if (ocena < minKara) { minKara = ocena; najlepsza = kopia; }
  }
  return { N, s:najlepsza };
}

const escWifi = s => String(s || '').replace(/([\\;,"':])/g, '\\$1');
function tekstDlaQr(b) {
  if (b.tryb === 'wifi') {
    const ssid = b.ssid.trim();
    if (!ssid) return '';
    const typ = b.szyfr === 'nopass' ? 'nopass' : (b.szyfr || 'WPA');
    return `WIFI:T:${typ};S:${escWifi(ssid)};${typ !== 'nopass' && b.haslo ? `P:${escWifi(b.haslo)};` : ''}${b.ukryta ? 'H:true;' : ''};`;
  }
  return b.text.trim();
}
