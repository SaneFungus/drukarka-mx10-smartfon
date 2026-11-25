'use strict';
/* ======================= PROTOKÓŁ DRUKARKI ======================= */
function crc8(dane) { let c = 0; for (const b of dane) { c ^= b; for (let i = 0; i < 8; i++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff; } return c; }
function ramka(cmd, dane) {
  return Uint8Array.from([0x51, 0x78, cmd, 0x00, dane.length & 0xff, dane.length >> 8, ...dane, crc8(dane), 0xff]);
}
function linia(px, y) {                        // 48 bajtów, najmłodszy bit = lewy punkt
  const b = new Uint8Array(WB);
  for (let x = 0; x < W; x++) if (px[y * W + x]) b[x >> 3] |= 1 << (x & 7);
  return b;
}
const POCZATEK = [0xaa,0x55,0x17,0x38,0x44,0x5f,0x5f,0x5f,0x44,0x38,0x2c];
const KONIEC   = [0xaa,0x55,0x17,0,0,0,0,0,0,0,0x17];
const PUSTA = new Uint8Array(WB);

function* ramkiZadania(z) {                    // z: {px, h, energy, feed}
  yield ramka(0xa3, [0]); yield ramka(0xa4, [50]); yield ramka(0xbd, [ust.speed]);
  yield ramka(0xaf, [z.energy & 0xff, z.energy >> 8]); yield ramka(0xbe, [1]); yield ramka(0xa9, [0]);
  yield ramka(0xa6, POCZATEK);
  for (let y = 0; y < z.h; y++) yield ramka(0xa2, linia(z.px, y));
  yield* ramkiKonca(z.feed);
}
function* ramkiKonca(feed) {
  yield ramka(0xa6, KONIEC); yield ramka(0xbd, [8]);
  if (feed && ust.feedMode === 'cmd') yield ramka(0xa1, [feed & 0xff, feed >> 8]);
  else for (let i = 0; i < feed; i++) yield ramka(0xa2, PUSTA);
  yield ramka(0xa3, [0]);
}

/* Zegar w osobnym wątku: karta w tle spowalnia zwykłe zegary do 1 s, co przerywałoby druk. */
const czekaj = (() => {
  const oczek = new Map(); let nr = 0, w = null;
  const gotowe = id => { const o = oczek.get(id); if (o) { oczek.delete(id); clearTimeout(o.t); o.ok(); } };
  try {
    w = new Worker(URL.createObjectURL(new Blob(['onmessage=e=>setTimeout(()=>postMessage(e.data[0]),e.data[1])'])));
    w.onmessage = e => gotowe(e.data); w.onerror = () => { w = null; };
  } catch { w = null; }
  return ms => new Promise(ok => {
    const id = ++nr; oczek.set(id, { ok, t:setTimeout(gotowe, w ? ms + 1500 : ms, id) });
    if (w) w.postMessage([id, ms]);
  });
})();

/* ======================= POŁĄCZENIE BLUETOOTH ======================= */
const USLUGA = 0xae30, ZAPIS = 0xae01, ODBIOR = 0xae02;
const dr = { urz:null, tx:null, pauza:false, laczenie:null, stan:0 };
let drukuje = false, przerwij = false, pakiet = 0;   // pakiet: wielkość paczki bieżącego zadania, 0 = cała ramka
class Przerwano extends Error {}

const hex = d => [...d].map(b => b.toString(16).padStart(2, '0')).join(' ');
const wpisy = [];
function log(t) { wpisy.push(`${new Date().toLocaleTimeString('pl')} ${t}`); if (wpisy.length > 80) wpisy.shift(); $('dziennik').textContent = wpisy.join('\n'); }
const polaczona = () => !!(dr.tx && dr.urz && dr.urz.gatt.connected);

async function wybierz(wszystkie) {
  if (!navigator.bluetooth) throw new Error('Ta przeglądarka nie obsługuje Bluetooth. Użyj Chrome lub Edge.');
  if (!(await navigator.bluetooth.getAvailability())) throw new Error('Bluetooth jest wyłączony. Włącz go w ustawieniach systemu i spróbuj ponownie.');
  const dodatkowe = [USLUGA, 0xaf30];
  const u = await navigator.bluetooth.requestDevice(wszystkie ? { acceptAllDevices:true, optionalServices:dodatkowe }
    : { filters:[{ namePrefix:'MX' }], optionalServices:dodatkowe });
  u.addEventListener('gattserverdisconnected', () => { if (u !== dr.urz) return; dr.tx = null; dr.pauza = false; log('Rozłączono'); stanPrzyciskow(); });
  if (dr.urz && dr.urz !== u && dr.urz.gatt.connected) dr.urz.gatt.disconnect();
  dr.urz = u; dr.tx = null; log(`Wybrano: ${u.name || 'bez nazwy'}`);
}
function polacz(wszystkie = false) {
  if (!dr.laczenie) dr.laczenie = laczenie(wszystkie).finally(() => { dr.laczenie = null; stanPrzyciskow(); });
  stanPrzyciskow();
  return dr.laczenie;
}
async function laczenie(wszystkie) {
  if (wszystkie || !dr.urz) await wybierz(wszystkie);
  let blad;
  for (let proba = 1; proba <= 3; proba++) {
    try {
      const serwer = await dr.urz.gatt.connect();
      const usluga = await serwer.getPrimaryService(USLUGA);
      const tx = await usluga.getCharacteristic(ZAPIS);
      log(`ae01: ${['write', 'writeWithoutResponse'].filter(p => tx.properties[p]).join(', ')}`);
      dr.pauza = false; dr.stan = 0;
      try {
        const rx = await usluga.getCharacteristic(ODBIOR);
        rx.addEventListener('characteristicvaluechanged', e => odebrano(new Uint8Array(e.target.value.buffer, e.target.value.byteOffset, e.target.value.byteLength)));
        await rx.startNotifications();
      } catch (e) { log(`Brak sygnałów zwrotnych (ae02): ${e.message}`); }
      dr.tx = tx; log('Połączono');
      return;
    } catch (e) { blad = e; log(`Próba ${proba}: ${e.message}`); await czekaj(600); }
  }
  dr.urz = null;                               // następnym razem znów pokaż listę
  throw new Error('Nie udało się połączyć. Sprawdź, czy drukarka jest włączona i nie trzyma jej telefon (aplikacja Fun Print), potem spróbuj ponownie. Szczegół: ' + blad.message);
}
function odebrano(d) {
  log(`odbiór: ${hex(d)}`);
  if (d.length < 7 || d[0] !== 0x51 || d[1] !== 0x78) return;
  if (d[2] === 0xae) dr.pauza = d[6] === 0x10;
  if (d[2] === 0xa3) dr.stan = d[6];
}
function ostrzezenia() {
  return [[1, 'brak papieru'], [2, 'otwarta klapka'], [4, 'przegrzana głowica'], [8, 'słaba bateria']].filter(([m]) => dr.stan & m).map(([, t]) => t).join(', ');
}
async function wyslij(bajty) {
  let czekano = 0;
  while (dr.pauza && polaczona()) {
    if (przerwij) throw new Przerwano();
    if (!czekano) powiedz('Drukarka prosi o chwilę przerwy…');
    await czekaj(50); czekano += 50;
    if (czekano > 60000) throw new Error('Drukarka od minuty nie przyjmuje danych. Wyłącz ją i włącz ponownie.');
  }
  if (!polaczona()) throw new Error('Drukarka się rozłączyła.');
  const krok = pakiet || bajty.length;
  for (let i = 0; i < bajty.length; i += krok) {
    const kawalek = bajty.slice(i, i + krok);
    if (dr.tx.properties.writeWithoutResponse) await dr.tx.writeValueWithoutResponse(kawalek);
    else await dr.tx.writeValueWithResponse(kawalek);
  }
  await czekaj(ust.delay);
}
async function drukujZadania(zadania, opis) {
  if (drukuje) return;
  drukuje = true; przerwij = false; stanPrzyciskow();
  const ile = zadania.reduce((s, z) => s + z.h + 10 + (ust.feedMode === 'lines' ? z.feed : 1), 0);
  let n = 0, blokada = null;
  try {
    if (!polaczona()) { powiedz('Łączę z drukarką…'); await polacz(); }
    try { blokada = await navigator.wakeLock.request('screen'); } catch {}
    powiedz(opis);
    for (const z of zadania) {
      pakiet = z.pakiet ?? ust.pakiet;
      const start = performance.now(), n0 = n;
      for (const r of ramkiZadania(z)) {
        if (przerwij) throw new Przerwano();
        await wyslij(r);
        $('postep').value = ++n / ile;
        if (n % 16 === 0) powiedz(`${opis} ${Math.min(99, Math.round(100 * n / ile))}%`);
      }
      log(`Zadanie: ${n - n0} ramek, paczka ${pakiet || 'cała'}, ${((performance.now() - start) / (n - n0)).toFixed(1)} ms na ramkę`);
    }
    await czekaj(400);
    const o = ostrzezenia();
    powiedz(o ? `Wysłano, ale drukarka zgłasza: ${o}.` : 'Wysłano całość do drukarki.', o ? 'blad' : 'dobrze');
    log(`Wysłano ramek: ${n}`);
  } catch (e) {
    if (e instanceof Przerwano) {
      dr.pauza = false;
      try { przerwij = false; for (const r of ramkiKonca(40)) await wyslij(r); } catch {}
      powiedz('Zatrzymano drukowanie.');
    } else {
      log(`Błąd: ${e.name} ${e.message}`);
      const o = ostrzezenia();
      powiedz(e.name === 'NotFoundError' ? 'Nie wybrano drukarki.' : e.message + (n ? ` Wysłano ${Math.round(100 * n / ile)}% wydruku.` : '') + (o ? ` Zgłoszenie drukarki: ${o}.` : ''), 'blad');
    }
  } finally {
    drukuje = false; $('postep').value = 0; stanPrzyciskow();
    if (blokada) blokada.release().catch(() => {});
  }
}

/* ======================= PASEK TESTOWY ======================= */
const MOCE_TESTU = [8000, 12000, 16000, 20000, 26000, 32000];
function wzorTestowy(moc, tytul = `Moc ${moc}`) {
  const t = rysujTekst({ ...nowyTekst(), text:tytul, size:34, bold:true, line:1.1 });
  const m = rysujTekst({ ...nowyTekst(), text:'Zażółć gęślą jaźń 0123456789', size:20, line:1.2 });
  const v = new Float32Array(W * 48); for (let y = 0; y < 48; y++) for (let x = 0; x < W; x++) v[y * W + x] = x / (W - 1);
  const klin = { h:48, px:raster(v, W, 48, { dither:'fs' }) };
  const kreski = { h:16, px:new Uint8Array(W * 16) };
  for (let y = 0; y < 16; y++) for (let x = 0; x < W; x++) kreski.px[y * W + x] = x < W / 3 ? x & 1 : x < 2 * W / 3 ? (x >> 1) & 1 : (x >> 2) & 1;
  return zloz([t, m, klin, rysujOdstep({ h:6, line:'none' }), kreski]);
}

