'use strict';
/* Aparat w aplikacji: obraz na żywo -> spust (z opcjonalnym samowyzwalaczem 3 s) -> podgląd kropek -> Drukuj / Wyślij / Kadruj.
   Zdjęcie drukuje się osobno, bez reszty treści. "Do treści" dokłada je do wydruku w głównym ekranie.
   Warstwa 'aparat' = obraz na żywo, warstwa 'zdjecie' = zrobione zdjęcie (obsługa Wstecz w ekran.js). */
const ap = { strumien:null, nr:0, kier:'environment', lampa:false, b:null, kropki:null, suwak:'bright', odliczT:0, od:0, zaplanowane:0, z:'aparat' };
const apGlebia = () => warstwa === 'zdjecie' ? (ap.z === 'aparat' ? 2 : ap.z === 'czesci' ? 1 + czGlebia() : 3)
  : warstwa === 'czesci' ? czGlebia() : warstwa === 'wytnij' ? wyGlebia() : warstwa === 'twarz' || warstwa === 'paski' ? 2 : 1;

/* ======================= OBRAZ NA ŻYWO ======================= */
function apAnulujOdliczanie() {
  if (ap.odliczT) { clearTimeout(ap.odliczT); ap.odliczT = 0; }
  $('ap-odliczanie').hidden = true; $('ap-odliczanie').textContent = '';
}
function apZatrzymaj() {
  ap.nr++;                                     // unieważnia włączanie i odliczanie, które jeszcze trwają
  apAnulujOdliczanie();
  if (ap.strumien) for (const t of ap.strumien.getTracks()) t.stop();
  ap.strumien = null; ap.lampa = false;
  $('ap-wideo').srcObject = null;
  $('ap-spust').disabled = true; $('ap-lampa').hidden = $('ap-zegar').hidden = $('ap-zamien').hidden = true;
}
function apInfo(t, blad = false) { $('ap-info').hidden = !t; $('ap-info-tekst').textContent = t; $('ap-telefon2').hidden = !blad; }
const apRozdzielczosc = () => ust.apTryb === 'czesci'
  ? { width:{ ideal:2560 }, height:{ ideal:1920 } } : { width:{ ideal:1600 }, height:{ ideal:1200 } };
const apMax = () => ust.apTryb === 'czesci' ? WY_MAX : 1200;
async function apUruchom() {
  apZatrzymaj();
  const nr = ap.nr, v = $('ap-wideo');
  apInfo('Włączam aparat…');
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new DOMException('', 'NotSupportedError');
    const s = await navigator.mediaDevices.getUserMedia({ audio:false, video:{ facingMode:{ ideal:ap.kier }, ...apRozdzielczosc() } });
    if (nr !== ap.nr) { for (const t of s.getTracks()) t.stop(); return; }
    ap.strumien = s;
    const tor = s.getVideoTracks()[0], moze = tor.getCapabilities ? tor.getCapabilities() : {};
    tor.addEventListener('ended', () => { if (nr === ap.nr) { apZatrzymaj(); apInfo('Aparat został wyłączony przez telefon.', true); } });
    v.classList.toggle('lustro', ap.kier === 'user');
    v.srcObject = s; await v.play();
    if (nr !== ap.nr) return;
    $('ap-lampa').hidden = !moze.torch; $('ap-lampa').setAttribute('aria-pressed', 'false');
    $('ap-zegar').hidden = false; $('ap-zegar').setAttribute('aria-pressed', !!ust.apZegar);
    $('ap-spust').disabled = false; apInfo('');
    const ile = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput').length;
    if (nr === ap.nr) $('ap-zamien').hidden = ile < 2;
  } catch (e) {
    if (nr !== ap.nr) return;
    apZatrzymaj(); log(`Aparat: ${e.name} ${e.message}`);
    apInfo({ NotAllowedError:'Aplikacja nie ma zgody na aparat. Zezwól na niego w ustawieniach tej strony w Chrome albo użyj aparatu telefonu.',
      NotFoundError:'Nie znaleziono aparatu w tym urządzeniu.',
      NotReadableError:'Aparat jest zajęty przez inną aplikację. Zamknij ją i spróbuj ponownie.',
      NotSupportedError:'Ta przeglądarka nie daje dostępu do aparatu na żywo.' }[e.name] || 'Nie udało się włączyć aparatu.', true);
  }
}
function otworzAparat() { if (!warstwa) otworzWarstwe('aparat'); }
function apWarstwa(w) {                         // wywoływane z ustawWarstwe przy każdej zmianie warstwy
  $('foto').hidden = w !== 'aparat' && w !== 'zdjecie';
  $('ap-zywo').hidden = w !== 'aparat'; $('ap-gotowe').hidden = w !== 'zdjecie';
  $('ap-telefon').hidden = w !== 'aparat';
  $('ap-kadruj').hidden = $('ap-udostepnij').hidden = w !== 'zdjecie';
  if (w !== 'aparat') apAnulujOdliczanie();
  const wKadrzeAparatu = w === 'kadr' && kadr && kadr.b === ap.b;
  if (w !== 'zdjecie' && !wKadrzeAparatu && ap.b) { if (!bloki.includes(ap.b)) usunObraz(ap.b.src); ap.b = ap.kropki = null; }
  if (w === 'aparat') { if (ap.strumien) $('ap-wideo').play().catch(() => {}); else apUruchom(); $('ap-spust').focus(); }
  else if (w === 'zdjecie') { $('ap-wideo').pause(); if (ap.b) apPrzelicz(); }
  else if (!wKadrzeAparatu) apZatrzymaj();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) apZatrzymaj(); else if (warstwa === 'aparat' && !ap.strumien) apUruchom();
});

/* ======================= ZROBIONE ZDJĘCIE ======================= */
function apUstawSuwak() {
  if (!ap.b) return;
  for (const p of $('ap-parametry').children) p.setAttribute('aria-pressed', p.dataset.apSuwak === ap.suwak);
  const s = $('ap-suwak');
  if (ap.suwak === 'bright') { s.min = -100; s.max = 100; s.step = 1; s.value = ap.b.bright; $('ap-o-suwak').textContent = ap.b.bright; }
  else { s.min = 0.2; s.max = 3; s.step = 0.05; s.value = ap.b.contrast; $('ap-o-suwak').textContent = fmt(ap.b.contrast); }
}
function apPokaz(src, nazwa = 'Zdjęcie z aparatu') {
  if (!['aparat', 'twarz', 'czesci', 'paski'].includes(warstwa)) { usunObraz(src); return; }
  ap.z = warstwa;
  ap.b = { ...noweZdjecie(src, nazwa), dither:ust.apStyl, bright:ust.apJasnosc, contrast:ust.apKontrast };
  ap.od = performance.now();
  $('ap-powtorz').textContent = ap.z === 'aparat' ? 'Powtórz' : 'Dopasuj';
  $('ap-style').innerHTML = RASTRY.map(([v, t]) => wcisk(`data-styl="${v}"`, t, v === ust.apStyl)).join('');
  apUstawSuwak();
  if (!drukuje) powiedz('');
  otworzWarstwe('zdjecie'); apPrzelicz();
}
function apPrzelicz() {
  if (!ap.b) return;
  ap.kropki = rysujZdjecie(ap.b);
  narysujKropki($('ap-papier'), ap.kropki); apRozmiar(); stanPrzyciskow();
}
function apRozmiar() {                          // całe zdjęcie na ekranie; gdy prawie pasuje, całe piksele na kropkę
  if (!ap.kropki || warstwa !== 'zdjecie') return;
  const c = $('ap-papier'), pole = c.parentElement, dpr = devicePixelRatio || 1, h = Math.max(1, ap.kropki.h);
  let css = Math.max(40, Math.min(768, pole.clientWidth - 16, (pole.clientHeight - 16) * W / h));
  const n = Math.floor(css * dpr / W), rowno = n >= 1 && n * W / dpr >= css * 0.85;
  if (rowno) css = n * W / dpr;
  c.style.width = `${css}px`; c.style.imageRendering = rowno ? 'pixelated' : 'auto';
}
const apZaWczesnie = () => performance.now() - ap.od < 400;   // drugie dotknięcie spustu nie może trafić w przycisk pod palcem

async function apZrobZdjecie() {
  const v = $('ap-wideo'); if (!ap.strumien || v.videoWidth < 32) return;
  $('ap-spust').disabled = true;
  const bl = $('ap-blysk'); bl.hidden = false; setTimeout(() => { bl.hidden = true; }, 110);
  try {
    const src = await zObrazu(v, v.videoWidth, v.videoHeight, apMax());
    if (ust.apTryb === 'twarz') twUjecie(src, ramaDla(v.videoWidth, v.videoHeight));
    else if (ust.apTryb === 'czesci') czZdjecie(src);
    else if (ust.apTryb === 'paski') paZdjecie(src);
    else apPokaz(src);
  }
  catch { apInfo('Nie udało się zrobić zdjęcia. Spróbuj jeszcze raz.'); setTimeout(() => apInfo(''), 3000); }
  finally { $('ap-spust').disabled = !ap.strumien; }
}
$('ap-spust').addEventListener('click', () => {
  const v = $('ap-wideo'); if (!ap.strumien || v.videoWidth < 32) return;
  if (ap.odliczT) { apAnulujOdliczanie(); return; }   // ponowne dotknięcie spustu przerywa odliczanie
  if (!ust.apZegar) { apZrobZdjecie(); return; }
  let sek = 3;
  const odl = $('ap-odliczanie'), nr = ap.nr;
  const krok = () => {
    if (nr !== ap.nr || warstwa !== 'aparat' || !ap.strumien) { apAnulujOdliczanie(); return; }
    if (!sek) { apAnulujOdliczanie(); apZrobZdjecie(); return; }
    odl.textContent = sek--; odl.hidden = false;
    ap.odliczT = setTimeout(krok, 1000);
  };
  krok();
});
$('ap-zegar').addEventListener('click', () => {
  ust.apZegar = !ust.apZegar; zapisz();
  $('ap-zegar').setAttribute('aria-pressed', ust.apZegar);
  if (!ust.apZegar) apAnulujOdliczanie();
});
$('ap-zamien').addEventListener('click', () => { ap.kier = ap.kier === 'user' ? 'environment' : 'user'; apUruchom(); });
$('ap-lampa').addEventListener('click', async () => {
  const tor = ap.strumien && ap.strumien.getVideoTracks()[0]; if (!tor) return;
  try { await tor.applyConstraints({ advanced:[{ torch:!ap.lampa }] }); ap.lampa = !ap.lampa; $('ap-lampa').setAttribute('aria-pressed', ap.lampa); }
  catch { $('ap-lampa').hidden = true; }
});
for (const id of ['ap-telefon', 'ap-telefon2']) $(id).addEventListener('click', () => { apZatrzymaj(); apInfo('Otwieram aparat telefonu…', true); $('aparat').click(); });
$('aparat').addEventListener('cancel', () => { if (warstwa === 'aparat' && !ap.strumien) apUruchom(); });
$('aparat').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { const src = await zPliku(f, apMax()); apZatrzymaj(); if (ust.apTryb === 'twarz') twZPliku(src); else if (ust.apTryb === 'czesci') czZdjecie(src); else if (ust.apTryb === 'paski') paZdjecie(src); else apPokaz(src); }
  catch { apZatrzymaj(); apInfo('Nie udało się odczytać tego zdjęcia.', true); }
});

$('ap-style').addEventListener('click', e => {
  const p = e.target.closest('[data-styl]'); if (!p || !ap.b) return;
  ap.b.dither = ust.apStyl = p.dataset.styl; zapisz();
  for (const q of $('ap-style').children) q.setAttribute('aria-pressed', q === p);
  apPrzelicz();
});
$('ap-parametry').addEventListener('click', e => {
  const p = e.target.closest('[data-ap-suwak]'); if (!p || !ap.b) return;
  ap.suwak = p.dataset.apSuwak; apUstawSuwak();
});
$('ap-suwak').addEventListener('input', e => {
  if (!ap.b) return;
  const v = +e.target.value;
  if (ap.suwak === 'bright') { ap.b.bright = ust.apJasnosc = v; $('ap-o-suwak').textContent = v; }
  else { ap.b.contrast = ust.apKontrast = v; $('ap-o-suwak').textContent = fmt(v); }
  zapisz();
  if (!ap.zaplanowane) ap.zaplanowane = requestAnimationFrame(() => { ap.zaplanowane = 0; apPrzelicz(); });
});
$('ap-kadruj').addEventListener('click', () => { if (!apZaWczesnie() && ap.b) otworzKadr(ap.b); });
$('ap-udostepnij').addEventListener('click', () => { if (!apZaWczesnie() && ap.kropki && ap.b) udostepnijKropki(ap.kropki, ap.b.name); });
$('ap-zamknij').addEventListener('click', () => zamknijWarstwe(apGlebia()));
$('ap-powtorz').addEventListener('click', () => { if (!apZaWczesnie()) zamknijWarstwe(); });
$('ap-edytuj').addEventListener('click', () => {
  if (apZaWczesnie() || !ap.b || bloki.includes(ap.b)) return;
  zapamietaj(); bloki.push(ap.b); wybrany = ap.b.id;
  zamknijWarstwe(apGlebia()); if (ap.z === 'twarz') twWyczysc();
  otworzZakladke('wyglad'); odswiezTeraz(); zapisz(); przewinDoWybranego();
});
$('ap-drukuj').addEventListener('click', async () => {
  if (apZaWczesnie() || !ap.b || drukuje) return;
  apPrzelicz(); apZatrzymaj();                  // podczas druku aparat nie zużywa baterii
  const b = ap.b;
  await drukujZadania([{ ...ap.kropki, energy:ust.energy, feed:ust.feed }], 'Drukuję zdjęcie…');
  if (ap.b === b && ap.z === 'aparat' && $('komunikat').classList.contains('dobrze')) $('ap-powtorz').textContent = 'Następne';
});
$('ap-stop').addEventListener('click', () => { przerwij = true; });
new ResizeObserver(apRozmiar).observe($('ap-papier').parentElement);
