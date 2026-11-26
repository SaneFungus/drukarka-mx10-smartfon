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

function* ramkiZadania(z) {                    // z: {px, h, energy, feed} -> {r, pauza}
  yield { r:ramka(0xa3, [0]), pauza:60 };      // chwila na odpowiedź drukarki o papierze i klapce zanim ruszy grzanie
  yield { r:ramka(0xa4, [50]) }; yield { r:ramka(0xbd, [ust.speed]) };
  yield { r:ramka(0xaf, [z.energy & 0xff, z.energy >> 8]) }; yield { r:ramka(0xbe, [1]) }; yield { r:ramka(0xa9, [0]) };
  yield { r:ramka(0xa6, POCZATEK) };
  for (let y = 0; y < z.h; y++) yield { r:ramka(0xa2, linia(z.px, y)) };
  yield* ramkiKonca(z.feed);
}
function* ramkiKonca(feed) {
  yield { r:ramka(0xa6, KONIEC) }; yield { r:ramka(0xbd, [8]) };
  if (feed && ust.feedMode === 'cmd') yield { r:ramka(0xa1, [feed & 0xff, feed >> 8]) };
  else for (let i = 0; i < feed; i++) yield { r:ramka(0xa2, PUSTA), pusta:true };
  yield { r:ramka(0xa3, [0]) };
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
const USLUGA = 0xae30, ZAPIS = 0xae01, ODBIOR = 0xae02, BLEDY_STOP = 1 | 2 | 4;
const dr = { urz:null, tx:null, pauza:false, laczenie:null, stan:0, pominZnane:false };
let drukuje = false, przerwij = false, pakiet = 0;   // pakiet: wielkość paczki bieżącego zadania, 0 = cała ramka
class Przerwano extends Error {}
class BladDrukarki extends Error {}

const hex = d => [...d].map(b => b.toString(16).padStart(2, '0')).join(' ');
const wpisy = [];
function log(t) { wpisy.push(`${new Date().toLocaleTimeString('pl')} ${t}`); if (wpisy.length > 80) wpisy.shift(); $('dziennik').textContent = wpisy.join('\n'); }
const polaczona = () => !!(dr.tx && dr.urz && dr.urz.gatt.connected);
const czyIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function przypiszUrzadzenie(u) {
  if (dr.urz === u) return;
  if (dr.urz && dr.urz.gatt.connected) dr.urz.gatt.disconnect();
  u.addEventListener('gattserverdisconnected', () => { if (u !== dr.urz) return; dr.tx = null; dr.pauza = false; log('Rozłączono'); stanPrzyciskow(); });
  dr.urz = u; dr.tx = null;
  if (u.id) { ust.urzId = u.id; zapisz(); }
  log(`Wybrano: ${u.name || 'bez nazwy'}`);
}
async function wybierz(wszystkie) {
  if (!navigator.bluetooth) throw new Error(czyIOS()
    ? 'Na iPhonie i iPadzie Safari oraz Chrome nie obsługują Bluetooth na stronach. Otwórz ten adres w aplikacji Bluefy.'
    : 'Ta przeglądarka nie obsługuje Bluetooth. Otwórz ten adres w Google Chrome.');
  const dodatkowe = [USLUGA, 0xaf30];
  let u;
  try {
    u = await navigator.bluetooth.requestDevice(wszystkie ? { acceptAllDevices:true, optionalServices:dodatkowe }
      : { filters:[{ namePrefix:'MX' }], optionalServices:dodatkowe });
  } catch (e) {
    if (navigator.bluetooth.getAvailability && !(await navigator.bluetooth.getAvailability().catch(() => true)))
      throw new Error('Bluetooth jest wyłączony. Włącz go w ustawieniach telefonu i spróbuj ponownie.');
    if (e.name === 'SecurityError') { dr.pominZnane = true; throw new Error('Dotknij przycisku jeszcze raz, aby wybrać drukarkę z listy.'); }
    throw e;
  }
  przypiszUrzadzenie(u);
}
async function podlaczGatt(u, limitMs = 0) {
  const obietnica = u.gatt.connect();
  const serwer = limitMs ? await Promise.race([obietnica, czekaj(limitMs).then(() => { throw new Error('limit czasu'); })]) : await obietnica;
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
}
function polacz(wszystkie = false) {
  if (!dr.laczenie) dr.laczenie = laczenie(wszystkie).finally(() => { dr.laczenie = null; stanPrzyciskow(); });
  stanPrzyciskow();
  return dr.laczenie;
}
async function laczenie(wszystkie) {
  if (!wszystkie && !dr.urz && !dr.pominZnane && navigator.bluetooth && navigator.bluetooth.getDevices) {
    try {
      const znane = await navigator.bluetooth.getDevices();
      const u = znane.find(d => ust.urzId && d.id === ust.urzId) || znane.find(d => d.name && d.name.startsWith('MX'));
      if (u) {
        przypiszUrzadzenie(u);
        await podlaczGatt(u, 1700);            // krótka próba, żeby nie wygasł gest dotknięcia dla requestDevice
        return;
      }
    } catch (e) { log(`Znana drukarka niedostępna: ${e.message}`); dr.urz = null; }
  }
  dr.pominZnane = false;
  if (wszystkie || !dr.urz) await wybierz(wszystkie);
  let blad;
  for (let proba = 1; proba <= 3; proba++) {
    try { await podlaczGatt(dr.urz); return; }
    catch (e) { blad = e; log(`Próba ${proba}: ${e.message}`); await czekaj(600); }
  }
  dr.urz = null;                               // następnym razem znów pokaż listę
  throw new Error('Nie udało się połączyć. Sprawdź, czy drukarka jest włączona i nie trzyma jej inna aplikacja (np. Fun Print), potem spróbuj ponownie. Szczegół: ' + blad.message);
}
function odebrano(d) {
  log(`odbiór: ${hex(d)}`);
  if (d.length < 7 || d[0] !== 0x51 || d[1] !== 0x78) return;
  if (d[2] === 0xae) dr.pauza = d[6] === 0x10;
  if (d[2] === 0xa3) dr.stan = d[6];
}
function ostrzezenia(maska = dr.stan) {
  return [[1, 'brak papieru'], [2, 'otwarta klapka'], [4, 'przegrzana głowica'], [8, 'słaba bateria']]
    .filter(([m]) => maska & m).map(([, t]) => t).join(', ');
}
async function wyslij(bajty, opcje = {}) {
  let czekano = 0;
  while (dr.pauza && polaczona()) {
    if (przerwij) throw new Przerwano();
    if (!opcje.bezStanu && (dr.stan & BLEDY_STOP)) throw new BladDrukarki(ostrzezenia(dr.stan & BLEDY_STOP));
    if (!czekano) powiedz('Drukarka prosi o chwilę przerwy…');
    await czekaj(50); czekano += 50;
    if (czekano > 60000) throw new Error('Drukarka od minuty nie przyjmuje danych. Wyłącz ją i włącz ponownie.');
  }
  if (!polaczona()) throw new Error('Drukarka się rozłączyła.');
  if (!opcje.bezStanu && (dr.stan & BLEDY_STOP)) throw new BladDrukarki(ostrzezenia(dr.stan & BLEDY_STOP));
  const krok = pakiet || bajty.length;
  for (let i = 0; i < bajty.length; i += krok) {
    const kawalek = bajty.slice(i, i + krok);
    if (dr.tx.properties.writeWithoutResponse) await dr.tx.writeValueWithoutResponse(kawalek);
    else await dr.tx.writeValueWithResponse(kawalek);
    if (i + krok < bajty.length) await czekaj(2);
  }
  await czekaj(opcje.pauza ?? (opcje.pusta ? Math.min(ust.delay, 6) : ust.delay));
  if (!opcje.bezStanu && (dr.stan & BLEDY_STOP)) throw new BladDrukarki(ostrzezenia(dr.stan & BLEDY_STOP));
}
async function drukujZadania(zadania, opis) {
  if (drukuje) return;
  drukuje = true; przerwij = false; dr.stan = 0; stanPrzyciskow();
  const ile = zadania.reduce((s, z) => s + z.h + 10 + (z.feed ? (ust.feedMode === 'lines' ? z.feed : 1) : 0), 0);
  let n = 0, blokada = null;
  try {
    if (!polaczona()) { powiedz('Łączę z drukarką…'); await polacz(); }
    dr.stan = 0;
    try { blokada = await navigator.wakeLock.request('screen'); } catch {}
    powiedz(opis);
    for (const z of zadania) {
      pakiet = z.pakiet ?? ust.pakiet;
      const start = performance.now(), n0 = n;
      for (const el of ramkiZadania(z)) {
        if (przerwij) throw new Przerwano();
        await wyslij(el.r, el);
        $('postep').value = Math.min(1, ++n / Math.max(1, ile));
        if (n % 16 === 0) powiedz(`${opis} ${Math.min(99, Math.round(100 * n / Math.max(1, ile)))}%`);
      }
      log(`Zadanie: ${n - n0} ramek, paczka ${pakiet || 'cała'}, ${((performance.now() - start) / Math.max(1, n - n0)).toFixed(1)} ms na ramkę`);
    }
    await czekaj(400);
    const o = ostrzezenia();
    powiedz(o ? `Wysłano, ale drukarka zgłasza: ${o}.` : 'Wysłano całość do drukarki.', dr.stan & BLEDY_STOP ? 'blad' : 'dobrze');
    log(`Wysłano ramek: ${n}`);
  } catch (e) {
    if (e instanceof Przerwano) {
      dr.pauza = false;
      try { przerwij = false; for (const el of ramkiKonca(40)) await wyslij(el.r, { ...el, bezStanu:true }); } catch {}
      powiedz('Zatrzymano drukowanie.');
    } else if (e instanceof BladDrukarki) {
      dr.pauza = false;
      try { await wyslij(ramka(0xa6, KONIEC), { bezStanu:true }); } catch {}
      log(`Błąd drukarki: ${e.message}`);
      powiedz(`Przerwano druk – drukarka zgłasza: ${e.message}.`, 'blad');
    } else {
      log(`Błąd: ${e.name} ${e.message}`);
      const o = ostrzezenia();
      powiedz(e.name === 'NotFoundError' ? 'Nie wybrano drukarki.' : e.message + (n ? ` Wysłano ${Math.round(100 * n / Math.max(1, ile))}% wydruku.` : '') + (o ? ` Zgłoszenie drukarki: ${o}.` : ''), 'blad');
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
