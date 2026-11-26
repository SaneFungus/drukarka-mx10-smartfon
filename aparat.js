'use strict';
/* Aparat w aplikacji: obraz na żywo -> spust -> podgląd kropek -> Drukuj.
   Zdjęcie drukuje się osobno, bez reszty treści. "Edytuj" dokłada je do wydruku w głównym ekranie.
   Warstwa 'aparat' = obraz na żywo, warstwa 'zdjecie' = zrobione zdjęcie (obsługa Wstecz w ekran.js). */
const ap = { strumien:null, nr:0, kier:'environment', lampa:false, b:null, kropki:null, od:0, zaplanowane:0, z:'aparat' };
/* Ile kroków Wstecz zamyka cały aparat: aparat -> zdjęcie, aparat -> twarz -> zdjęcie (twarz.js)
   albo aparat -> [wytnij] -> czesci -> [wytnij z bazowego] -> zdjęcie (czesci.js). ap.z = warstwa, z której przyszło zdjęcie. */
const apGlebia = () => warstwa === 'zdjecie' ? (ap.z === 'aparat' ? 2 : ap.z === 'czesci' ? 1 + czGlebia() : 3)
  : warstwa === 'czesci' ? czGlebia() : warstwa === 'wytnij' ? wyGlebia() : warstwa === 'twarz' ? 2 : 1;

/* ======================= OBRAZ NA ŻYWO ======================= */
function apZatrzymaj() {
  ap.nr++;                                     // unieważnia włączanie, które jeszcze trwa
  if (ap.strumien) for (const t of ap.strumien.getTracks()) t.stop();
  ap.strumien = null; ap.lampa = false;
  $('ap-wideo').srcObject = null;
  $('ap-spust').disabled = true; $('ap-lampa').hidden = $('ap-zamien').hidden = true;
}
function apInfo(t, blad = false) { $('ap-info').hidden = !t; $('ap-info-tekst').textContent = t; $('ap-telefon2').hidden = !blad; }
const apRozdzielczosc = () => ust.apTryb === 'czesci'   // przy wycinaniu z daleka liczy się każdy szczegół
  ? { width:{ ideal:2560 }, height:{ ideal:1920 } } : { width:{ ideal:1600 }, height:{ ideal:1200 } };
const apMax = () => ust.apTryb === 'czesci' ? WY_MAX : 1200;   // największy bok zapamiętanego zdjęcia
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
  if (w !== 'zdjecie' && ap.b) { if (!bloki.includes(ap.b)) obrazy.delete(ap.b.src); ap.b = ap.kropki = null; }
  if (w === 'aparat') { if (ap.strumien) $('ap-wideo').play().catch(() => {}); else apUruchom(); $('ap-spust').focus(); }
  else if (w === 'zdjecie') $('ap-wideo').pause();
  else apZatrzymaj();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) apZatrzymaj(); else if (warstwa === 'aparat' && !ap.strumien) apUruchom();
});

/* ======================= ZROBIONE ZDJĘCIE ======================= */
function apPokaz(src, nazwa = 'Zdjęcie z aparatu') {
  if (!['aparat', 'twarz', 'czesci'].includes(warstwa)) { obrazy.delete(src); return; }
  ap.z = warstwa;
  ap.b = { ...noweZdjecie(src, nazwa), dither:ust.apStyl, bright:ust.apJasnosc };
  ap.od = performance.now();
  $('ap-powtorz').textContent = ap.z === 'aparat' ? 'Powtórz' : 'Dopasuj';
  $('ap-style').innerHTML = RASTRY.map(([v, t]) => wcisk(`data-styl="${v}"`, t, v === ust.apStyl)).join('');
  $('ap-jasnosc').value = ust.apJasnosc; $('ap-o-jasnosc').textContent = ust.apJasnosc;
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
const apZaWczesnie = () => performance.now() - ap.od < 400;   // drugie dotknięcie spustu nie może trafić w przycisk, który pojawił się pod palcem

$('ap-spust').addEventListener('click', async () => {
  const v = $('ap-wideo'); if (!ap.strumien || v.videoWidth < 32) return;   // aparat dopiero się budzi
  $('ap-spust').disabled = true;
  try {
    const src = await zObrazu(v, v.videoWidth, v.videoHeight, apMax());
    if (ust.apTryb === 'twarz') twUjecie(src, ramaDla(v.videoWidth, v.videoHeight));
    else if (ust.apTryb === 'czesci') czZdjecie(src);
    else apPokaz(src);
  }
  catch { apInfo('Nie udało się zrobić zdjęcia. Spróbuj jeszcze raz.'); setTimeout(() => apInfo(''), 3000); }
  finally { $('ap-spust').disabled = !ap.strumien; }
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
  try { const src = await zPliku(f, apMax()); apZatrzymaj(); if (ust.apTryb === 'twarz') twZPliku(src); else if (ust.apTryb === 'czesci') czZdjecie(src); else apPokaz(src); }
  catch { apZatrzymaj(); apInfo('Nie udało się odczytać tego zdjęcia.', true); }
});

$('ap-style').addEventListener('click', e => {
  const p = e.target.closest('[data-styl]'); if (!p || !ap.b) return;
  ap.b.dither = ust.apStyl = p.dataset.styl; zapisz();
  for (const q of $('ap-style').children) q.setAttribute('aria-pressed', q === p);
  apPrzelicz();
});
$('ap-jasnosc').addEventListener('input', e => {
  if (!ap.b) return;
  ap.b.bright = ust.apJasnosc = +e.target.value; $('ap-o-jasnosc').textContent = ust.apJasnosc; zapisz();
  if (!ap.zaplanowane) ap.zaplanowane = requestAnimationFrame(() => { ap.zaplanowane = 0; apPrzelicz(); });
});
$('ap-zamknij').addEventListener('click', () => zamknijWarstwe(apGlebia()));
$('ap-powtorz').addEventListener('click', () => { if (!apZaWczesnie()) zamknijWarstwe(); });
$('ap-edytuj').addEventListener('click', () => {
  if (apZaWczesnie() || !ap.b || bloki.includes(ap.b)) return;
  zapamietaj(); bloki.push(ap.b); wybrany = ap.b.id;
  zamknijWarstwe(apGlebia()); if (ap.z === 'twarz') twWyczysc();   // złożona twarz jest już w treści; wycinki zostają do "Wyczyść"
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
