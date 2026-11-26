'use strict';
/* Ekran wersji na smartfon: podgląd, zakładki, cofanie/ponawianie, kody QR, kadrowanie, zapis IndexedDB i udostępnianie PNG.
   Rysowanie kropek jest w rdzen.js i qr.js, rozmowa z drukarką w drukarka.js. */
let wybrany = null, zakladka = 'tresc', suwakFoto = 'contrast', suwakTekst = 'size', czcionki = [], zakresy = [];
const widok = n => document.querySelector(`[data-widok="${n}"]`);
const blok = () => bloki.find(b => b.id === wybrany) || null;
const esc = s => String(s).replace(/[&<>"']/g, z => '&#' + z.charCodeAt(0) + ';');
const fmt = v => String(Math.round(v * 100) / 100).replace('.', ',');
const cm = h => `${(h / PUNKTY_NA_CM).toFixed(1).replace('.', ',')} cm`;
const opcje = (lista, w) => lista.map(([v, t]) => `<option value="${esc(v)}"${v === w ? ' selected' : ''}>${esc(t)}</option>`).join('');
const wcisk = (atr, nazwa, ok) => `<button ${atr} aria-pressed="${!!ok}">${nazwa}</button>`;

/* ======================= KOMUNIKATY ======================= */
let komT = 0, dymekT = 0;
function powiedz(t, klasa = '') {
  const k = $('komunikat'); clearTimeout(komT);
  const pokaz = s => { k.textContent = $('ap-stan').textContent = s; };       // ap-stan: ten sam komunikat w aparacie
  pokaz(t); k.className = $('ap-stan').className = klasa;
  if (t && klasa !== 'blad' && !drukuje) komT = setTimeout(pokaz, 6000, '');
  const p = /(\d+)%/.exec(t);
  $('nav-druk').textContent = drukuje && p && !klasa ? `${p[1]}%` : 'Drukuj';
}
function dymek(t) { $('dymek-tekst').textContent = t; $('dymek').hidden = false; clearTimeout(dymekT); dymekT = setTimeout(() => { $('dymek').hidden = true; }, 6000); }
$('dymek-cofnij').addEventListener('click', () => { $('dymek').hidden = true; cofnij(); });
$('komunikat').addEventListener('click', () => { if (!drukuje) powiedz(''); });

/* ======================= COFANIE I PONAWIANIE ======================= */
const historia = [], ponowienia = [];
let kluczZmiany = '', pisanieT = 0;
const migawka = () => ({ wybrany, bloki:bloki.map(b => ({ ...b, ...(b.crop && { crop:{ ...b.crop } }) })) });
function stanHistorii() {
  $('cofnij').disabled = !historia.length;
  $('ponow').disabled = !ponowienia.length;
}
function sprzatajObrazy() {                     // zamyka ImageBitmap ze zdjęć, których nie ma już w treści, historii ani w aparacie
  const zywe = new Set();
  const zbierz = lista => { for (const b of lista) if (b.src) zywe.add(b.src); };
  zbierz(bloki);
  for (const m of historia) zbierz(m.bloki);
  for (const m of ponowienia) zbierz(m.bloki);
  if (ap.b && ap.b.src) zywe.add(ap.b.src);
  for (const f of tw.zdj) if (f && f.src) zywe.add(f.src);
  for (const src of cz.moje) zywe.add(src);
  for (const src of pa.moje) zywe.add(src);
  for (const src of [...obrazy.keys()]) if (!zywe.has(src)) usunObraz(src);
}
function zapamietaj(klucz = '', odswiezKluczMs = 0) {   // wywołać tuż przed zmianą; ten sam klucz = jeden krok cofania
  clearTimeout(pisanieT);
  if (odswiezKluczMs) pisanieT = setTimeout(() => { kluczZmiany = ''; }, odswiezKluczMs);
  if (klucz && klucz === kluczZmiany) return;
  kluczZmiany = klucz;
  historia.push(migawka()); if (historia.length > 60) historia.shift();
  ponowienia.length = 0;
  stanHistorii(); sprzatajObrazy();
}
function przywrocMigawke(skad, dokad) {
  const m = skad.pop(); kluczZmiany = ''; clearTimeout(pisanieT);
  if (!m) { stanHistorii(); return; }
  dokad.push(migawka());
  bloki = m.bloki; wybrany = m.wybrany; $('dymek').hidden = true;
  stanHistorii(); sprzatajObrazy(); pokazWszystko();
}
const cofnij = () => przywrocMigawke(historia, ponowienia);
const ponow = () => przywrocMigawke(ponowienia, historia);
$('cofnij').addEventListener('click', cofnij);
$('ponow').addEventListener('click', ponow);

/* ======================= PODGLĄD ======================= */
let zaplanowane = 0, powieksz = false;
function odswiez() { if (!zaplanowane) zaplanowane = requestAnimationFrame(() => { zaplanowane = 0; odswiezTeraz(); }); zapisz(); }
function narysujKropki(c, dok) {                // zwraca liczbę narysowanych linii
  const h = Math.min(dok.h, MAXH);
  c.width = W; c.height = Math.max(1, h);
  if (h) {
    const x = c.getContext('2d'), im = x.createImageData(W, h);
    for (let i = 0; i < W * h; i++) if (dok.px[i]) { im.data[i*4] = 28; im.data[i*4+1] = 28; im.data[i*4+2] = 40; im.data[i*4+3] = 255; }
    x.putImageData(im, 0, 0);
  }
  return h;
}
function odswiezTeraz() {
  const czesci = bloki.map(rysujBlok);
  dokument = zloz(czesci);
  let y = 0; zakresy = czesci.map((c, i) => ({ id:bloki[i].id, y, h:(y += c.h, c.h) }));
  const h = narysujKropki($('plotno'), dokument);
  $('tasma').hidden = !h; $('pusto').hidden = !!h;
  $('dlugosc').textContent = h ? `ok. ${cm(dokument.h)}${ust.copies > 1 ? ` (×${ust.copies})` : ''}` : 'pusto';
  rozmiarPodgladu(); rysujRamke(); stanPrzyciskow();
}
function rozmiarPodgladu() {                    // pełna szerokość; gdy prawie pasuje, całe piksele na kropkę (bez fałszywych wzorów)
  const dpr = devicePixelRatio || 1, miejsce = Math.min(768, $('stol').clientWidth - 40);
  let n = Math.floor(miejsce * dpr / W), css = miejsce;
  if (n >= 1 && n * W / dpr >= miejsce * 0.85) css = n * W / dpr; else n = 0;
  if (powieksz) { n = Math.ceil(2 * css * dpr / W); css = n * W / dpr; }
  $('plotno').style.width = `${css}px`;
  $('plotno').style.imageRendering = n ? 'pixelated' : 'auto';
}
function rysujRamke() {
  const z = zakresy.find(q => q.id === wybrany), r = $('ramka'), skala = $('plotno').clientWidth / W;
  r.hidden = !z || !z.h || warstwa === 'pelny' || zakladka === 'druk' || zakladka === 'ust';
  if (!r.hidden) { r.style.top = `${10 + z.y * skala - 2}px`; r.style.height = `${z.h * skala + 4}px`; }
}
function przewinDoWybranego() {
  const z = zakresy.find(q => q.id === wybrany), s = $('stol'), skala = $('plotno').clientWidth / W;
  if (!z || !z.h) return;
  const gora = 20 + z.y * skala, dol = gora + z.h * skala;
  if (z.h * skala > s.clientHeight - 20) { if (dol < s.scrollTop + 60 || gora > s.scrollTop + s.clientHeight - 60) s.scrollTop = gora - 12; }
  else if (gora < s.scrollTop + 8) s.scrollTop = gora - 12;
  else if (dol > s.scrollTop + s.clientHeight - 8) s.scrollTop = dol - s.clientHeight + 16;
}
function skupPoleBloku(id) {
  otworzZakladke('tresc');
  const li = widok('tresc').querySelector(`[data-id="${id}"]`);
  if (!li) return;
  li.scrollIntoView({ block:'nearest' });
  const pole = li.querySelector('textarea, input[type=text]');
  if (pole) pole.focus();
}
$('tasma').addEventListener('click', e => {
  if (warstwa === 'pelny' || !dokument.h) return;
  const r = $('plotno').getBoundingClientRect(), y = (e.clientY - r.top) / r.height * dokument.h;
  const z = zakresy.find(q => q.h && y >= q.y && y < q.y + q.h); if (!z) return;
  const b = bloki.find(q => q.id === z.id);
  if (wybrany === z.id && b && (b.type === 'text' || b.type === 'qr')) { skupPoleBloku(z.id); return; }
  wybrany = z.id; otworzZakladke('wyglad'); rysujRamke();
});
new ResizeObserver(() => { rozmiarPodgladu(); rysujRamke(); }).observe($('stol'));

/* ======================= WARSTWY (pełny podgląd, kadrowanie, aparat) + przycisk Wstecz + fokus ======================= */
let warstwa = null, wraca = false, poprzedniFokus = null;
const OKNA_WARSTW = { kadr:'kadrowanie', aparat:'foto', zdjecie:'foto', twarz:'twarz', wytnij:'wytnij', czesci:'czesci', paski:'paski' };
function ustawWarstwe(w) {
  const poprzednia = warstwa;
  if (!poprzednia && w && w !== 'pelny' && document.activeElement) poprzedniFokus = document.activeElement;
  warstwa = w;
  const modal = w === 'kadr' || w === 'aparat' || w === 'zdjecie' || w === 'twarz' || w === 'wytnij' || w === 'czesci' || w === 'paski';
  $('app').inert = modal;
  document.body.classList.toggle('pelny', w === 'pelny');
  $('kadrowanie').hidden = w !== 'kadr';
  $('zoom').hidden = w !== 'pelny';
  if (w !== 'pelny') { powieksz = false; $('zoom').textContent = 'Powiększ 2×'; }
  $('pelny').setAttribute('aria-label', w === 'pelny' ? 'Pokaż narzędzia' : 'Pokaż sam podgląd');
  $('pelny').querySelector('use').setAttribute('href', w === 'pelny' ? '#i-zwin' : '#i-pelny');
  apWarstwa(w); twWarstwa(w); czWarstwa(w); paWarstwa(w);
  rozmiarPodgladu(); rysujRamke();
  if (modal && w !== 'aparat') {
    const okno = $(OKNA_WARSTW[w]);
    if (okno && !okno.contains(document.activeElement)) {
      const cel = okno.querySelector('button.glowny:not(:disabled), button:not(:disabled)');
      if (cel) cel.focus({ preventScroll:true });
    }
  } else if (!w && poprzednia && poprzednia !== 'pelny' && poprzedniFokus && poprzedniFokus.isConnected) {
    poprzedniFokus.focus({ preventScroll:true }); poprzedniFokus = null;
  }
}
function otworzWarstwe(w) { history.pushState({ warstwa:w }, ''); ustawWarstwe(w); }
function zamknijWarstwe(ile = 1) { if (warstwa && !wraca) { wraca = true; history.go(-ile); } }
if (history.state && history.state.warstwa) history.replaceState(null, '');
const WSTECZ = { kadr:['zdjecie'], zdjecie:['aparat', 'twarz', 'czesci', 'paski'], twarz:['aparat'], wytnij:['aparat', 'czesci'], czesci:['aparat', 'wytnij'], paski:['aparat'] };
addEventListener('popstate', e => { wraca = false; const cel = e.state && e.state.warstwa; ustawWarstwe((WSTECZ[warstwa] || []).includes(cel) ? cel : null); });
$('pelny').addEventListener('click', () => warstwa ? zamknijWarstwe() : otworzWarstwe('pelny'));
$('zoom').addEventListener('click', () => { powieksz = !powieksz; $('zoom').textContent = powieksz ? 'Dopasuj' : 'Powiększ 2×'; rozmiarPodgladu(); });

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (ap.odliczT) { e.preventDefault(); apAnulujOdliczanie(); return; }
    if (warstwa) { e.preventDefault(); zamknijWarstwe(); }
    return;
  }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.target.matches('textarea, input[type=text]')) {
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) {
      e.preventDefault();
      if (warstwa === 'czesci') $('cz-cofnij').click();
      else if (warstwa === 'paski') $('pa-cofnij').click();
      else if (!warstwa) cofnij();
    } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
      e.preventDefault();
      if (warstwa === 'czesci') $('cz-ponow').click();
      else if (warstwa === 'paski') $('pa-ponow').click();
      else if (!warstwa) ponow();
    }
  }
});

/* ======================= ZAKŁADKI ======================= */
function otworzZakladke(n) {
  zakladka = n;
  document.querySelectorAll('[data-widok]').forEach(w => { w.hidden = w.dataset.widok !== n; });
  document.querySelectorAll('[data-zakladka]').forEach(p => p.setAttribute('aria-selected', p.dataset.zakladka === n));
  if (n === 'tresc') pokazTresc();
  if (n === 'wyglad') pokazWyglad();
  $('panel').scrollTop = 0; rysujRamke();
}
document.querySelector('nav').addEventListener('click', e => { const p = e.target.closest('[data-zakladka]'); if (p) otworzZakladke(p.dataset.zakladka); });
function pokazWszystko() { if (!blok()) wybrany = bloki.length ? bloki[bloki.length - 1].id : null; otworzZakladke(zakladka); odswiez(); }

/* ======================= TREŚĆ ======================= */
const nazwaQr = b => b.tryb === 'wifi' ? (b.ssid.trim() ? `Wi‑Fi: ${b.ssid.trim()}` : 'Kod QR Wi‑Fi')
  : (b.text.trim().split('\n')[0] || 'Pusty kod QR');
const nazwaBloku = b => b.type === 'text' ? (b.text.trim().split('\n')[0] || 'Pusty tekst')
  : b.type === 'image' ? b.name : b.type === 'qr' ? nazwaQr(b) : b.line === 'none' ? 'Odstęp' : 'Linia';
const IKONA = { text:'i-tekst', image:'i-zdjecie', qr:'i-qr', space:'i-odstep' };
const maTresc = () => bloki.length > 1 || bloki.some(b => b.type !== 'text' || b.text.trim());

function pokazTresc() {
  const el = widok('tresc');
  el.innerHTML = `<div class="rzad dodaj">
      <button data-dodaj="text"><svg><use href="#i-tekst"/></svg>Tekst</button>
      <button data-dodaj="galeria"><svg><use href="#i-zdjecie"/></svg>Zdjęcie</button>
      <button data-dodaj="aparat"><svg><use href="#i-aparat"/></svg>Aparat</button>
      <button data-dodaj="qr"><svg><use href="#i-qr"/></svg>Kod QR</button>
      <button data-dodaj="space"><svg><use href="#i-odstep"/></svg>Odstęp</button></div>
    <ul class="lista">${bloki.map(htmlPozycji).join('')}</ul>
    ${maTresc() ? '<div class="rzad tresc-dol"><button data-wyczysc-wszystko>Wyczyść wydruk</button></div>' : ''}`;
  for (const b of bloki) if (b.type === 'image') {
    const c = el.querySelector(`[data-mini="${b.id}"]`), img = obrazy.get(b.src); if (!img || !c) continue;
    const s = Math.max(72 / img.width, 72 / img.height);
    c.getContext('2d').drawImage(img, (72 - img.width * s) / 2, (72 - img.height * s) / 2, img.width * s, img.height * s);
  }
}
function htmlEdycjiQr(b) {
  let w = `<div class="chipy" role="group" aria-label="Rodzaj kodu QR">
    ${wcisk('data-qr-tryb="tekst"', 'Link / tekst', b.tryb !== 'wifi')}
    ${wcisk('data-qr-tryb="wifi"', 'Wi‑Fi', b.tryb === 'wifi')}</div>`;
  if (b.tryb === 'wifi') {
    w += `<input type="text" data-qr-pole="ssid" value="${esc(b.ssid)}" aria-label="Nazwa sieci Wi‑Fi" placeholder="Nazwa sieci (SSID)" autocapitalize="none" autocorrect="off" spellcheck="false">`;
    if (b.szyfr !== 'nopass') w += `<input type="text" data-qr-pole="haslo" value="${esc(b.haslo)}" aria-label="Hasło do Wi‑Fi" placeholder="Hasło do sieci" autocapitalize="none" autocorrect="off" spellcheck="false">`;
    w += `<div class="chipy" role="group" aria-label="Zabezpieczenie sieci">
      ${[['WPA','WPA / WPA2'],['nopass','Bez hasła'],['WEP','WEP']].map(([v, t]) => wcisk(`data-qr-szyfr="${v}"`, t, b.szyfr === v)).join('')}
      ${wcisk('data-qr-ukryta="1"', 'Ukryta sieć', b.ukryta)}</div>`;
  } else {
    w += `<textarea rows="2" data-qr-pole="text" aria-label="Tekst lub adres strony do kodu QR" placeholder="https://… albo dowolny tekst" autocapitalize="none" spellcheck="false">${'\n' + esc(b.text)}</textarea>`;
  }
  return w;
}
function htmlPozycji(b, i) {
  const ten = b.id === wybrany;
  let w = `<li class="${ten ? 'wybrany' : ''}" data-id="${b.id}"><button class="poz" data-akcja="wybierz" aria-expanded="${ten}">
    ${b.type === 'image' ? `<canvas width="72" height="72" data-mini="${b.id}"></canvas>` : `<svg><use href="#${IKONA[b.type]}"/></svg>`}<span data-nazwa>${esc(nazwaBloku(b))}</span></button>`;
  if (ten) {
    w += '<div class="srodek">';
    if (b.type === 'text') w += `<textarea rows="3" data-tekst-pole="1" aria-label="Treść tekstu" placeholder="Wpisz tekst do wydrukowania">${'\n' + esc(b.text)}</textarea>`;
    if (b.type === 'qr') w += htmlEdycjiQr(b);
    if (b.type === 'image') w += '<div class="rzad"><button data-akcja="kadruj">Kadruj</button><button data-akcja="obrot">Obróć o 90°</button></div>';
    w += `<div class="rzad akcje"><button data-akcja="gora" aria-label="Przesuń wyżej"${i ? '' : ' disabled'}>↑</button>
      <button data-akcja="dol" aria-label="Przesuń niżej"${i < bloki.length - 1 ? '' : ' disabled'}>↓</button>
      <button data-akcja="kopia">Powiel</button><button data-akcja="usun">Usuń</button></div></div>`;
  }
  return w + '</li>';
}
widok('tresc').addEventListener('input', e => {
  const b = blok(); if (!b) return;
  if (e.target.dataset.tekstPole) {
    const czyByloPusto = !maTresc();
    zapamietaj(`${b.id}:text`, 1800);
    b.text = e.target.value;
    e.target.closest('li').querySelector('[data-nazwa]').textContent = nazwaBloku(b);
    if (czyByloPusto !== !maTresc()) {
      const btn = widok('tresc').querySelector('[data-wyczysc-wszystko]');
      if (!btn && maTresc()) widok('tresc').insertAdjacentHTML('beforeend', '<div class="rzad tresc-dol"><button data-wyczysc-wszystko>Wyczyść wydruk</button></div>');
    }
    odswiez(); requestAnimationFrame(() => requestAnimationFrame(przewinDoWybranego));
  } else if (e.target.dataset.qrPole && b.type === 'qr') {
    const pole = e.target.dataset.qrPole;
    zapamietaj(`${b.id}:qr:${pole}`, 1800);
    b[pole] = e.target.value;
    e.target.closest('li').querySelector('[data-nazwa]').textContent = nazwaBloku(b);
    if (tekstDlaQr(b) && !generujQr(tekstDlaQr(b))) powiedz('Tekst jest za długi na kod QR (maks. ok. 850 znaków).', 'blad');
    else if ($('komunikat').classList.contains('blad')) powiedz('');
    odswiez(); requestAnimationFrame(() => requestAnimationFrame(przewinDoWybranego));
  }
});
widok('tresc').addEventListener('change', e => {
  if (e.target.matches('textarea, input[type=text]')) kluczZmiany = '';
});
widok('tresc').addEventListener('click', e => {
  if (e.target.closest('[data-wyczysc-wszystko]')) {
    if (!maTresc()) return;
    zapamietaj(); bloki = [nowyTekst()]; wybrany = bloki[0].id;
    sprzatajObrazy(); pokazTresc(); odswiez(); dymek('Wyczyszczono wydruk.');
    return;
  }
  const bQr = blok();
  if (bQr && bQr.type === 'qr') {
    const tr = e.target.closest('[data-qr-tryb]'), sz = e.target.closest('[data-qr-szyfr]'), uk = e.target.closest('[data-qr-ukryta]');
    if (tr || sz || uk) {
      zapamietaj();
      if (tr) { bQr.tryb = tr.dataset.qrTryb; if (bQr.tryb === 'wifi' && !bQr.ssid && !bQr.haslo) bQr.podpis = true; }
      if (sz) bQr.szyfr = sz.dataset.qrSzyfr;
      if (uk) bQr.ukryta = !bQr.ukryta;
      pokazTresc(); odswiez(); return;
    }
  }
  const p = e.target.closest('[data-akcja]'); if (!p) return;
  const id = +p.closest('[data-id]').dataset.id, b = bloki.find(q => q.id === id), i = bloki.indexOf(b), akcja = p.dataset.akcja;
  if (akcja === 'wybierz') {
    wybrany = wybrany === id ? null : id; pokazTresc(); rysujRamke(); przewinDoWybranego();
    const li = widok('tresc').querySelector(`[data-id="${id}"]`); li.scrollIntoView({ block:'nearest' }); li.querySelector('.poz').focus({ preventScroll:true });
    return;
  }
  if (akcja === 'kadruj') { otworzKadr(b); return; }
  zapamietaj();
  if (akcja === 'gora') [bloki[i-1], bloki[i]] = [b, bloki[i-1]];
  if (akcja === 'dol') [bloki[i+1], bloki[i]] = [b, bloki[i+1]];
  if (akcja === 'obrot') b.rot = (b.rot + 90) % 360;
  if (akcja === 'kopia') { const k = { ...b, ...(b.crop && { crop:{ ...b.crop } }), id:nrBloku++ }; bloki.splice(i + 1, 0, k); wybrany = k.id; }
  if (akcja === 'usun') { bloki.splice(i, 1); cache.delete(id); wybrany = null; sprzatajObrazy(); dymek('Usunięto.'); }
  pokazTresc(); odswiez();
  const q = widok('tresc').querySelector(`[data-id="${wybrany}"] [data-akcja="${akcja}"]`);
  if (q && !q.disabled) q.focus();
  requestAnimationFrame(() => requestAnimationFrame(przewinDoWybranego));
});
document.addEventListener('click', e => {
  const p = e.target.closest('[data-dodaj]'); if (!p) return;
  const co = p.dataset.dodaj;
  if (co === 'galeria') { $('plik').click(); return; }
  if (co === 'aparat') { otworzAparat(); return; }
  // Pusty tekst na starcie: pisz w nim albo zastąp go kodem QR, zamiast mnożyć puste bloki.
  let b = co === 'text' && bloki.find(q => q.type === 'text' && !q.text.trim());
  if (!b) {
    zapamietaj();
    if (bloki.length === 1 && bloki[0].type === 'text' && !bloki[0].text.trim() && co === 'qr') bloki.pop();
    b = co === 'text' ? nowyTekst() : co === 'qr' ? nowyQr() : nowyOdstep();
    bloki.push(b);
  }
  wybrany = b.id; otworzZakladke('tresc'); odswiez();
  const li = widok('tresc').querySelector(`[data-id="${b.id}"]`); if (li) li.scrollIntoView({ block:'nearest' });
  const pole = li && li.querySelector('textarea, input[type=text]'); if (pole) pole.focus();
});
document.addEventListener('focusin', e => document.body.classList.toggle('pisze', e.target.matches('textarea, input[type=text]')));
document.addEventListener('focusout', () => { kluczZmiany = ''; document.body.classList.remove('pisze'); });

/* ======================= WYGLĄD ======================= */
const RASTRY = [['fs','Zdjęcie'],['atkinson','Jaśniejsze'],['bayer','Wzór'],['dots','Gazeta'],['lines','Linie'],['prog','Rysunek']];
const SUWAKI = {
  size:['Rozmiar',10,300,1], line:['Odstęp linii',0.7,2.5,0.05], h:['Wysokość',2,400,2],
  bright:['Jasność',-100,100,1], contrast:['Kontrast',0.2,3,0.05], gamma:['Cienie',0.4,2.5,0.05], width:['Szerokość, %',10,100,1],
  qrWidth:['Wielkość kodu, %',25,100,1],
  threshold:['Próg czerni',1,254,1], cell:['Wielkość kropek',3,24,1],
};
const WYROWNANIE = [['left','Do lewej'],['center','Do środka'],['right','Do prawej']];
const suwak = (b, k, kluczPola = k) => { const [t, min, max, step] = SUWAKI[k];
  return `<label><span class="etykieta">${t}<output data-o>${fmt(b[kluczPola])}</output></span><input type="range" data-k="${kluczPola}" min="${min}" max="${max}" step="${step}" value="${b[kluczPola]}"></label>`; };
const wyrownaj = b => `<div class="rzad" role="group" aria-label="Wyrównanie">${WYROWNANIE.map(([v, t]) => wcisk(`data-ustaw="align" data-v="${v}"`, t, b.align === v)).join('')}</div>`;
const przelaczniki = (b, lista) => `<div class="chipy">${lista.map(([k, t]) => wcisk(`data-przelacz="${k}"`, t, b[k])).join('')}</div>`;

function pokazWyglad() {
  const el = widok('wyglad'), b = blok();
  const przewin = [...el.querySelectorAll('.chipy')].map(c => c.scrollLeft);
  if (!b) { el.innerHTML = '<p class="podp">Dotknij elementu na podglądzie, żeby zmienić jego wygląd.</p>'; return; }
  let w = '';
  if (b.type === 'text') {
    const lista = czcionki.some(([n]) => n === b.font) ? czcionki : [...czcionki, [b.font, b.font]];
    const limitBaneru = b.banner && !b.fit ? maxRozmiarBaneru(b) : Infinity;
    w = `<p class="tytul"><span>${esc(nazwaBloku(b))}</span><button data-edytuj-tresc>Edytuj tekst</button></p>
      <div class="chipy">${['size','line'].map(k => wcisk(`data-suwak="${k}"`, SUWAKI[k][0], suwakTekst === k)).join('')}${[['bold','Pogrubienie'],['italic','Kursywa']].map(([k, t]) => wcisk(`data-przelacz="${k}"`, t, b[k])).join('')}</div>
      ${b.fit && suwakTekst === 'size' ? '<p class="podp">Rozmiar dobiera się sam, bo włączone jest dopasowanie do szerokości.</p>' : suwak(b, suwakTekst)}
      ${suwakTekst === 'size' && b.size > limitBaneru ? `<p class="podp">W banerze rozmiar ograniczono do ${limitBaneru}, żeby wiersze zmieściły się na taśmie.</p>` : ''}
      ${wyrownaj(b)}
      <label style="margin-bottom:10px"><span class="etykieta">Czcionka</span><select data-k="font">${opcje(lista, b.font)}</select></label>
      ${przelaczniki(b, [['fit','Dopasuj do szerokości'],['banner','Baner (obrót o 90°)'],['invert','Białe na czarnym']])}`;
  } else if (b.type === 'qr') {
    const opcjePodpisu = [['podpis', b.tryb === 'wifi' ? 'Podpis z nazwą sieci' : 'Podpis z tekstem pod kodem'],
      ...(b.tryb === 'wifi' && b.podpis && b.szyfr !== 'nopass' ? [['pokazHaslo', 'Pokaż też hasło']] : [])];
    w = `<p class="tytul"><span>${esc(nazwaBloku(b))}</span><button data-edytuj-tresc>Edytuj kod</button></p>
      ${suwak(b, 'qrWidth', 'width')}
      ${b.width < 100 ? wyrownaj(b) : ''}
      ${przelaczniki(b, opcjePodpisu)}`;
  } else if (b.type === 'image') {
    const lista = ['contrast','bright','gamma','width', ...(b.dither === 'prog' ? ['threshold'] : []), ...(b.dither === 'dots' || b.dither === 'lines' ? ['cell'] : [])];
    if (!lista.includes(suwakFoto)) suwakFoto = 'contrast';
    w = `<p class="tytul"><span>${esc(b.name)}</span><button data-oryginal>Oryginał (przytrzymaj)</button></p>
      <div class="chipy" role="group" aria-label="Styl zdjęcia">${RASTRY.map(([v, t]) => wcisk(`data-ustaw="dither" data-v="${v}"`, t, b.dither === v)).join('')}</div>
      <div class="chipy" role="group" aria-label="Co stroić">${lista.map(k => wcisk(`data-suwak="${k}"`, SUWAKI[k][0].replace(', %', ''), suwakFoto === k)).join('')}</div>
      ${suwak(b, suwakFoto)}
      ${b.width < 100 ? wyrownaj(b) : ''}
      ${przelaczniki(b, [['mirror','Odbicie lustrzane'],['invert','Negatyw']])}
      <div class="rzad"><button data-domyslne>Przywróć domyślne</button></div>`;
  } else {
    w = `<p class="tytul"><span>${esc(nazwaBloku(b))}</span></p>${suwak(b, 'h')}
      <div class="rzad" role="group" aria-label="Linia">${[['none','Brak'],['solid','Ciągła'],['dashed','Przerywana']].map(([v, t]) => wcisk(`data-ustaw="line" data-v="${v}"`, t, b.line === v)).join('')}</div>`;
  }
  el.innerHTML = w;
  el.querySelectorAll('.chipy').forEach((c, i) => { c.scrollLeft = przewin[i] || 0; });
}
widok('wyglad').addEventListener('input', e => {
  const b = blok(), k = e.target.dataset.k; if (!b || !k) return;
  zapamietaj(`${b.id}:${k}`);
  b[k] = e.target.type === 'range' ? +e.target.value : e.target.value;
  const o = e.target.closest('label').querySelector('[data-o]'); if (o) o.textContent = fmt(b[k]);
  odswiez();
});
widok('wyglad').addEventListener('change', e => { kluczZmiany = ''; if (e.target.dataset.k === 'width' || e.target.dataset.k === 'size') pokazWyglad(); });
widok('wyglad').addEventListener('click', e => {
  const p = e.target.closest('button'), b = blok(); if (!p || !b) return;
  const d = p.dataset;
  if ('edytujTresc' in d) { skupPoleBloku(b.id); return; }
  if (d.suwak) { if (b.type === 'text') suwakTekst = d.suwak; else suwakFoto = d.suwak; }
  else if (d.ustaw) { zapamietaj(); b[d.ustaw] = d.v; if (d.v === 'prog') suwakFoto = 'threshold'; }
  else if (d.przelacz) { zapamietaj(); b[d.przelacz] = !b[d.przelacz]; }
  else if ('domyslne' in d) { zapamietaj(); const n = noweZdjecie(b.src, b.name); for (const k of ['width','align','bright','contrast','gamma','dither','threshold','cell','invert','mirror']) b[k] = n[k]; }
  else return;
  const znak = ['suwak','ustaw','przelacz'].map(k => d[k] ? `[data-${k}="${d[k]}"]${d.v ? `[data-v="${d.v}"]` : ''}` : '').join('');
  pokazWyglad(); odswiez();
  const q = znak && widok('wyglad').querySelector(znak); if (q) q.focus({ preventScroll:true });
});
/* Oryginał: dopóki przycisk jest przytrzymany, w miejscu zdjęcia widać odcienie szarości zamiast kropek. */
function pokazOryginal() {
  const b = blok(), z = zakresy.find(q => q.id === wybrany), p = b && b.type === 'image' && przygotujZdjecie(b); if (!p || !z) return;
  const im = p.x.getImageData(0, 0, p.tw, p.th), d = im.data;
  for (let i = 0; i < d.length; i += 4) d[i] = d[i+1] = d[i+2] = d[i]*0.299 + d[i+1]*0.587 + d[i+2]*0.114;
  const x = $('plotno').getContext('2d'); x.clearRect(0, z.y, W, z.h); x.putImageData(im, p.off, z.y);
  przewinDoWybranego();
}
let oryginal = false;
const puscOryginal = () => { if (oryginal) { oryginal = false; odswiezTeraz(); } };
widok('wyglad').addEventListener('pointerdown', e => { if (e.target.closest('[data-oryginal]')) { e.target.setPointerCapture(e.pointerId); oryginal = true; pokazOryginal(); } });
widok('wyglad').addEventListener('keydown', e => { if (e.target.matches('[data-oryginal]') && (e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); oryginal = true; pokazOryginal(); } });
for (const t of ['pointerup', 'pointercancel', 'keyup']) widok('wyglad').addEventListener(t, puscOryginal);
widok('wyglad').addEventListener('contextmenu', e => { if (e.target.closest('[data-oryginal]')) e.preventDefault(); });

/* ======================= ZDJĘCIA I EKSPORT PNG ======================= */
async function zarejestrujBlob(blob) {
  const bmp = await createImageBitmap(blob);
  const src = URL.createObjectURL(blob);
  bloby.set(src, blob); obrazy.set(src, bmp);
  return src;
}
async function wczytajZapisanyObraz(dane) {
  if (dane instanceof Blob) return zarejestrujBlob(dane);
  if (typeof dane === 'string' && obrazy.has(dane)) return dane;
  const blob = await (await fetch(dane)).blob();
  return zarejestrujBlob(blob);
}
async function zPlotna(canvas, jakosc = 0.88) {
  const blob = await new Promise((ok, zle) => canvas.toBlob(b => b ? ok(b) : zle(new Error('Brak obrazu')), 'image/jpeg', jakosc));
  return zarejestrujBlob(blob);
}
async function zObrazu(obraz, w, h, max = 1200) {   // zmniejsza do max px, zapamiętuje jako Blob + ImageBitmap i zwraca krótki adres
  const skala = Math.min(1, max / Math.max(w, h)), x = platno(Math.round(w * skala), Math.round(h * skala));
  x.imageSmoothingQuality = 'high'; x.drawImage(obraz, 0, 0, x.canvas.width, x.canvas.height);
  return zPlotna(x.canvas, 0.88);
}
async function zPliku(f, max) {
  const bmp = await createImageBitmap(f, { imageOrientation:'from-image' });
  try { return await zObrazu(bmp, bmp.width, bmp.height, max); } finally { bmp.close(); }
}
async function dodajPliki(pliki) {
  if (!pliki.length) return;
  powiedz('Wczytuję zdjęcie…'); let dodano = 0;
  const przed = migawka(), zle = [];
  if (bloki.length === 1 && bloki[0].type === 'text' && !bloki[0].text.trim()) bloki = [];
  for (const f of pliki) {
    try {
      const b = noweZdjecie(await zPliku(f), f.name || 'Zdjęcie'); bloki.push(b); wybrany = b.id; dodano++;
    } catch { zle.push(f.name || 'plik'); }
  }
  if (!bloki.length) bloki = przed.bloki;
  if (dodano) {
    historia.push(przed); ponowienia.length = 0; kluczZmiany = ''; stanHistorii();
    otworzZakladke('wyglad'); odswiezTeraz(); zapisz(); przewinDoWybranego();
  }
  if (zle.length) powiedz(`Nie udało się odczytać: ${zle.join(', ')}. Działają m.in. JPG, PNG, WebP i GIF.`, 'blad'); else powiedz('');
}
$('plik').addEventListener('change', e => { dodajPliki([...e.target.files]); e.target.value = ''; });
document.addEventListener('paste', e => { const p = [...e.clipboardData.files].filter(f => f.type.startsWith('image/')); if (p.length) { e.preventDefault(); dodajPliki(p); } });
document.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); document.body.classList.add('upuszczanie'); } });
document.addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('upuszczanie'); });
document.addEventListener('drop', e => { document.body.classList.remove('upuszczanie'); if (e.dataTransfer.files.length) { e.preventDefault(); dodajPliki([...e.dataTransfer.files]); } });

async function udostepnijKropki(dok, nazwa = 'Wydruk MX10') {
  if (!dok || !dok.h) return;
  const h = Math.min(dok.h, MAXH), skala = h <= 7500 ? 2 : 1, marg = 12 * skala;
  const cw = W * skala + 2 * marg, ch = h * skala + 2 * marg;
  const x = platno(cw, ch);
  x.fillStyle = '#fdfdfb'; x.fillRect(0, 0, cw, ch);
  const im = x.getImageData(0, 0, cw, ch), d = im.data;
  for (let y = 0; y < h; y++) for (let px = 0; px < W; px++) {
    if (!dok.px[y * W + px]) continue;
    for (let dy = 0; dy < skala; dy++) for (let dx = 0; dx < skala; dx++) {
      const i = ((marg + y * skala + dy) * cw + marg + px * skala + dx) * 4;
      d[i] = 28; d[i + 1] = 28; d[i + 2] = 40; d[i + 3] = 255;
    }
  }
  x.putImageData(im, 0, 0);
  const blob = await new Promise(ok => x.canvas.toBlob(ok, 'image/png'));
  if (!blob) { powiedz('Nie udało się przygotować obrazu.', 'blad'); return; }
  const bezpieczna = (nazwa || 'wydruk-mx10').replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-|-$/g, '') || 'wydruk-mx10';
  const plik = new File([blob], `${bezpieczna}.png`, { type:'image/png' });
  if (navigator.canShare && navigator.canShare({ files:[plik] })) {
    try { await navigator.share({ files:[plik], title:nazwa }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = plik.name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  powiedz('Zapisano obraz PNG.', 'dobrze');
}
$('zapisz-obraz').addEventListener('click', () => { odswiezTeraz(); udostepnijKropki(dokument, nazwaBloku(bloki[0] || nowyTekst())); });

/* ======================= KADROWANIE ======================= */
const naEkran = (b, x, y) => { const [u, v] = { 0:[x, y], 90:[1 - y, x], 180:[1 - x, 1 - y], 270:[y, 1 - x] }[b.rot]; return [b.mirror ? 1 - u : u, v]; };
const zEkranu = (b, u, v) => { if (b.mirror) u = 1 - u; return { 0:[u, v], 90:[v, 1 - u], 180:[1 - u, 1 - v], 270:[1 - v, u] }[b.rot]; };
const KM = 14;
const wKadrze = e => { const q = $('kadr').getBoundingClientRect(), w = q.width - 2 * KM, h = q.height - 2 * KM; return { u:(e.clientX - q.left - KM) / w, v:(e.clientY - q.top - KM) / h, w, h }; };
const ogr = (v, a, b) => Math.min(b, Math.max(a, v));
let kadr = null;                               // { b, r:[x0,y0,x1,y1] na ekranie 0..1, prop, w, h, chwyt }
function wymiaryObrazuKadru(b) {
  const img = obrazy.get(b.src), bok = b.rot % 180 !== 0;
  return { img, iw:bok ? img.height : img.width, ih:bok ? img.width : img.height, bok };
}
function ustawProporcjeKadru(prop) {
  if (!kadr) return;
  kadr.prop = prop;
  for (const p of $('kadr-proporcje').children) p.setAttribute('aria-pressed', +p.dataset.prop === prop);
  if (!prop) { rysujKadr(); return; }
  const { iw, ih } = wymiaryObrazuKadru(kadr.b), k = prop * ih / iw;
  const r = kadr.r, cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2;
  let dv = Math.min(r[3] - r[1], (r[2] - r[0]) / k, 1, 1 / k);
  dv = Math.max(0.06, Math.min(dv, 1, 1 / k));
  const du = Math.min(1, dv * k); dv = du / k;
  const x0 = ogr(cx - du / 2, 0, 1 - du), y0 = ogr(cy - dv / 2, 0, 1 - dv);
  kadr.r = [x0, y0, x0 + du, y0 + dv];
  rysujKadr();
}
function otworzKadr(b) {
  if (!obrazy.get(b.src)) return;
  const [ax, ay] = naEkran(b, b.crop.x, b.crop.y), [bx, by] = naEkran(b, b.crop.x + b.crop.w, b.crop.y + b.crop.h);
  kadr = { b, r:[Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)], prop:0, chwyt:null };
  for (const p of $('kadr-proporcje').children) p.setAttribute('aria-pressed', +p.dataset.prop === 0);
  otworzWarstwe('kadr'); rysujKadr();
}
function rysujKadr() {
  if (!kadr || warstwa !== 'kadr') return;
  const { b, r } = kadr, { img, iw, ih, bok } = wymiaryObrazuKadru(b), c = $('kadr'), pole = c.parentElement, dpr = devicePixelRatio || 1;
  const s = Math.min((pole.clientWidth - 2 * KM) / iw, (pole.clientHeight - 2 * KM) / ih);
  const w = Math.max(40, Math.round(iw * s)), h = Math.max(40, Math.round(ih * s));
  c.width = (w + 2 * KM) * dpr; c.height = (h + 2 * KM) * dpr; c.style.width = `${w + 2 * KM}px`; c.style.height = `${h + 2 * KM}px`;
  const x = c.getContext('2d'); x.scale(dpr, dpr); x.translate(KM, KM);
  x.save(); x.translate(w / 2, h / 2); if (b.mirror) x.scale(-1, 1); x.rotate(b.rot * Math.PI / 180);
  const dw = bok ? h : w, dh = bok ? w : h; x.drawImage(img, -dw / 2, -dh / 2, dw, dh); x.restore();
  const p = [r[0] * w, r[1] * h, (r[2] - r[0]) * w, (r[3] - r[1]) * h];
  x.fillStyle = 'rgba(0,0,0,.6)'; x.beginPath(); x.rect(0, 0, w, h); x.rect(...p); x.fill('evenodd');
  x.strokeStyle = '#fff'; x.lineWidth = 2; x.strokeRect(...p);
  x.fillStyle = '#e8557b'; for (const px of [r[0], r[2]]) for (const py of [r[1], r[3]]) { x.beginPath(); x.arc(px * w, py * h, 9, 0, 7); x.fill(); x.stroke(); }
}
$('kadr-proporcje').addEventListener('click', e => {
  const p = e.target.closest('[data-prop]'); if (p) ustawProporcjeKadru(+p.dataset.prop);
});
$('kadr').addEventListener('pointerdown', e => {
  if (!kadr) return;
  const { u, v, w, h } = wKadrze(e), r = kadr.r;
  const ix = Math.abs(u - r[0]) < Math.abs(u - r[2]) ? 0 : 2, iy = Math.abs(v - r[1]) < Math.abs(v - r[3]) ? 1 : 3;
  const blisko = Math.abs(u - r[ix]) * w < 32 && Math.abs(v - r[iy]) * h < 32;
  const srodek = u > r[0] && u < r[2] && v > r[1] && v < r[3];
  kadr.chwyt = blisko ? { rog:[ix, iy] } : srodek ? { u, v, r:[...r] } : { rog:[2, 3], nowy:[u, v] };
  if (kadr.chwyt.nowy) kadr.przed = [...r];
  $('kadr').setPointerCapture(e.pointerId);
});
$('kadr').addEventListener('pointermove', e => {
  if (!kadr || !kadr.chwyt) return;
  const m = wKadrze(e), u = ogr(m.u, 0, 1), v = ogr(m.v, 0, 1), ch = kadr.chwyt, r = kadr.r, MIN = 0.04;
  const { iw, ih } = wymiaryObrazuKadru(kadr.b), k = kadr.prop ? kadr.prop * ih / iw : 0;
  if (ch.nowy) {
    const [a, c] = ch.nowy.map(t => ogr(t, 0, 1));
    if (k) {
      const zx = u >= a ? 1 : -1, zy = v >= c ? 1 : -1;
      const maxDv = Math.min((zx > 0 ? 1 - a : a) / k, zy > 0 ? 1 - c : c);
      const dv = ogr(Math.max(Math.abs(u - a) / k, Math.abs(v - c)), 0, maxDv), du = dv * k;
      kadr.r = [Math.min(a, a + zx * du), Math.min(c, c + zy * dv), Math.max(a, a + zx * du), Math.max(c, c + zy * dv)];
    } else kadr.r = [Math.min(a, u), Math.min(c, v), Math.max(a, u), Math.max(c, v)];
  } else if (ch.rog) {
    const [ix, iy] = ch.rog;
    if (k) {
      const ax = r[2 - ix], ay = r[4 - iy], zx = ix === 0 ? -1 : 1, zy = iy === 1 ? -1 : 1;
      const maxDv = Math.min((zx > 0 ? 1 - ax : ax) / k, zy > 0 ? 1 - ay : ay);
      const dv = ogr(Math.max(zx * (u - ax) / k, zy * (v - ay)), MIN, Math.max(MIN, maxDv)), du = dv * k;
      r[ix] = ax + zx * du; r[iy] = ay + zy * dv;
    } else {
      r[ix] = ix === 0 ? Math.min(u, r[2] - MIN) : Math.max(u, r[0] + MIN);
      r[iy] = iy === 1 ? Math.min(v, r[3] - MIN) : Math.max(v, r[1] + MIN);
    }
  } else {
    const w = ch.r[2] - ch.r[0], h = ch.r[3] - ch.r[1], x = ogr(ch.r[0] + u - ch.u, 0, 1 - w), y = ogr(ch.r[1] + v - ch.v, 0, 1 - h);
    kadr.r = [x, y, x + w, y + h];
  }
  rysujKadr();
});
for (const t of ['pointerup', 'pointercancel']) $('kadr').addEventListener(t, () => {
  if (!kadr || !kadr.chwyt) return;
  const r = kadr.r; if (kadr.chwyt.nowy && (r[2] - r[0] < 0.04 || r[3] - r[1] < 0.04)) kadr.r = kadr.przed;
  kadr.chwyt = null; rysujKadr();
});
$('kadr-cale').addEventListener('click', () => { if (kadr) { kadr.r = [0, 0, 1, 1]; ustawProporcjeKadru(0); } });
$('kadr-anuluj').addEventListener('click', () => zamknijWarstwe());
$('kadr-ok').addEventListener('click', () => {
  const { b, r } = kadr, [ax, ay] = zEkranu(b, r[0], r[1]), [bx, by] = zEkranu(b, r[2], r[3]);
  const wDokumentach = bloki.includes(b);
  if (wDokumentach) zapamietaj();
  b.crop = { x:Math.min(ax, bx), y:Math.min(ay, by), w:Math.abs(ax - bx), h:Math.abs(ay - by) };
  cache.delete(b.id);
  zamknijWarstwe();
  if (wDokumentach) odswiez();
});
new ResizeObserver(rysujKadr).observe($('kadr').parentElement);

/* ======================= ZAPIS NA URZĄDZENIU (IndexedDB + Blob) ======================= */
const KLUCZ_UST = 'mx10-ust-v1';
let zapisT = 0;
function bazaDokumentu() {
  return new Promise((ok, zle) => {
    const r = indexedDB.open('mx10-dokument', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('stan');
    r.onsuccess = () => ok(r.result); r.onerror = () => zle(r.error);
  });
}
function zapisz() { clearTimeout(zapisT); zapisT = setTimeout(zapiszTeraz, 400); }
async function zapiszTeraz() {
  clearTimeout(zapisT); zapisT = 0;
  try { localStorage.setItem(KLUCZ_UST, JSON.stringify(ust)); } catch {}
  try {
    const db = await bazaDokumentu(), t = db.transaction('stan', 'readwrite');
    const zapisane = bloki.map(b => b.type === 'image' ? { ...b, plik:bloby.get(b.src) || b.src } : b);
    t.objectStore('stan').put({ bloki:zapisane, ust }, 'biezacy');
    t.oncomplete = () => db.close();
  } catch (e) {
    log(`Zapis dokumentu: ${e.name}`);
  }
}
document.addEventListener('visibilitychange', () => { if (document.hidden && zapisT) zapiszTeraz(); });
async function odczytaj() {
  try {
    const zapasUst = JSON.parse(localStorage.getItem(KLUCZ_UST) || 'null');
    if (zapasUst) ust = { ...DOMYSLNE, ...zapasUst };
  } catch {}
  let z = null, zeStarego = false;
  try {
    const db = await bazaDokumentu(), t = db.transaction('stan', 'readonly');
    z = await new Promise((ok, zle) => { const r = t.objectStore('stan').get('biezacy'); r.onsuccess = () => ok(r.result); r.onerror = () => zle(r.error); });
    db.close();
  } catch {}
  if (!z) {
    try {
      z = JSON.parse(localStorage.getItem(KLUCZ) || 'null');
      if (z) zeStarego = true;
    } catch {}
  }
  if (z) {
    ust = { ...DOMYSLNE, ...z.ust };
    if (z.ust && !('apStyl' in z.ust)) ust.pakiet = DOMYSLNE.pakiet;
    for (const b of z.bloki || []) {
      if (b.type === 'image') {
        try {
          const src = await wczytajZapisanyObraz(b.plik || b.src);
          const { plik:fp, ...reszta } = b;
          bloki.push({ ...reszta, src, id:nrBloku++ });
        } catch {}
        continue;
      }
      if (b.type === 'text' && b.font === 'Segoe UI') b.font = 'sans-serif';
      bloki.push({ ...b, id:nrBloku++ });
    }
    if (zeStarego) {
      await zapiszTeraz();
      try { localStorage.removeItem(KLUCZ); } catch {}
    }
    if (bloki.length) return;
  }
  bloki.push(nowyTekst());
}

/* ======================= ODBIÓR Z "UDOSTĘPNIJ DO MX10" ======================= */
async function odbierzUdostepnione(parametry) {
  let paczka = null;
  try {
    const db = await new Promise((ok, zle) => {
      const r = indexedDB.open('mx10-udostepnione', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('dane');
      r.onsuccess = () => ok(r.result); r.onerror = () => zle(r.error);
    });
    const t = db.transaction('dane', 'readwrite'), s = t.objectStore('dane');
    paczka = await new Promise(ok => { const r = s.get('ostatnie'); r.onsuccess = () => ok(r.result); r.onerror = () => ok(null); });
    if (paczka) s.delete('ostatnie');
    t.oncomplete = () => db.close();
  } catch {}
  const pliki = (paczka && paczka.pliki) || [];
  const title = (paczka && paczka.title) || parametry.get('title') || '';
  const text = (paczka && paczka.text) || parametry.get('text') || '';
  const url = (paczka && paczka.url) || parametry.get('url') || '';
  if (pliki.length) await dodajPliki(pliki);
  const adres = url.trim() || (/^https?:\/\/\S+$/i.test(text.trim()) ? text.trim() : '');
  const calyTekst = [title.trim(), text.trim(), url.trim()].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join('\n');
  if (!calyTekst) return;
  zapamietaj();
  if (bloki.length === 1 && bloki[0].type === 'text' && !bloki[0].text.trim()) bloki.pop();
  if (/^WIFI:/i.test(text.trim())) {
    const b = nowyQr({ tryb:'tekst', text:text.trim(), podpis:false });
    bloki.push(b); wybrany = b.id;
  } else if (adres && (!text.trim() || text.trim() === adres)) {
    if (title.trim() && title.trim() !== adres) bloki.push({ ...nowyTekst(), text:title.trim(), size:30, bold:true });
    const b = nowyQr({ tryb:'tekst', text:adres, podpis:true });
    bloki.push(b); wybrany = b.id;
  } else {
    const b = { ...nowyTekst(), text:calyTekst };
    bloki.push(b); wybrany = b.id;
  }
  otworzZakladke('wyglad'); odswiezTeraz(); zapisz(); przewinDoWybranego();
  powiedz('Dodano udostępnioną treść.', 'dobrze');
}

/* ======================= DRUK I POŁĄCZENIE ======================= */
function stanPrzyciskow() {
  const s = $('stan'), jest = polaczona(), bt = !!navigator.bluetooth, zajete = drukuje || !!dr.laczenie, zaDlugie = dokument.h > MAXH;
  $('stan-tekst').textContent = dr.laczenie ? 'Łączę…' : jest ? 'Połączona' : 'Połącz';
  s.className = dr.laczenie ? 'trwa' : jest ? 'jest' : '';
  s.disabled = !bt || zajete;
  s.setAttribute('aria-label', jest ? 'Drukarka połączona, pokaż ustawienia' : 'Połącz z drukarką');
  $('polacz').textContent = jest ? `Rozłącz ${dr.urz.name || 'drukarkę'}` : 'Połącz z drukarką';
  $('polacz').disabled = !bt || zajete;
  $('drukuj').disabled = !bt || zajete || !dokument.h || zaDlugie;
  $('drukuj').textContent = zaDlugie ? 'Za długi (ponad 3,7 m)' : drukuje ? 'Drukuję…' : 'Drukuj teraz';
  $('zapisz-obraz').disabled = !dokument.h;
  for (const id of ['wysun', 'test', 'testTel', 'inne']) $(id).disabled = !bt || zajete;
  $('ap-drukuj').disabled = !bt || zajete || !ap.kropki;
  $('ap-drukuj').textContent = dr.laczenie ? 'Łączę…' : drukuje ? 'Drukuję…' : 'Drukuj';
  $('stop').hidden = $('postep').hidden = $('ap-stop').hidden = !drukuje;
  if (!drukuje) $('nav-druk').textContent = 'Drukuj';
}
const nazwijBlad = e => powiedz(e.name === 'NotFoundError' ? 'Nie wybrano drukarki.' : e.message, 'blad');
async function polaczIpowiedz(wszystkie) { try { await polacz(wszystkie); powiedz('Połączono z drukarką.', 'dobrze'); } catch (e) { nazwijBlad(e); } }
async function drukujIpokaz(zadania, opis) {
  const p = drukujZadania(zadania, opis);
  otworzZakladke('druk');                       // tu jest postęp i Stop
  await p; if (!$('komunikat').classList.contains('blad')) { const t = $('komunikat').textContent; powiedz(t, $('komunikat').className); }
}
$('stan').addEventListener('click', () => polaczona() ? otworzZakladke('ust') : polaczIpowiedz(false));
$('polacz').addEventListener('click', () => {
  if (polaczona()) { dr.urz.gatt.disconnect(); dr.tx = null; powiedz('Rozłączono.'); stanPrzyciskow(); return; }
  polaczIpowiedz(false);
});
$('inne').addEventListener('click', () => polaczIpowiedz(true));
$('drukuj').addEventListener('click', () => {
  odswiezTeraz();
  drukujIpokaz(Array.from({ length:ust.copies }, () => ({ ...dokument, energy:ust.energy, feed:ust.feed })), 'Drukuję…');
});
$('test').addEventListener('click', () => drukujIpokaz(MOCE_TESTU.map((m, i) => ({ ...wzorTestowy(m), energy:m, feed:i === MOCE_TESTU.length - 1 ? ust.feed : 16 })), 'Drukuję pasek testowy…'));
$('testTel').addEventListener('click', () => {
  log(`Wersja: ${WERSJA}. Przeglądarka: ${navigator.userAgent}`);
  const z = (tytul, pakiet, feed) => ({ ...wzorTestowy(0, tytul), energy:ust.energy, feed, pakiet });
  drukujIpokaz([z('A: po 20 bajtów', 20, 60), z('B: cała linia', 0, ust.feed)], 'Drukuję test telefonu…');
});
$('wysun').addEventListener('click', () => drukujZadania([{ px:new Uint8Array(0), h:0, energy:ust.energy, feed:Math.max(80, ust.feed) }], 'Wysuwam papier…'));
$('stop').addEventListener('click', () => { przerwij = true; });
$('kopiuj').addEventListener('click', async () => { try { await navigator.clipboard.writeText(wpisy.join('\n')); powiedz('Skopiowano dziennik.'); } catch { powiedz('Zaznacz dziennik palcem i skopiuj.'); } });

/* ======================= USTAWIENIA ======================= */
function pokazUst() {
  document.querySelectorAll('[data-s]').forEach(el => { el.value = ust[el.dataset.s]; });
  $('o-energy').textContent = ust.energy; $('o-feed').textContent = cm(ust.feed); $('o-delay').textContent = `${ust.delay} ms`; $('o-copies').textContent = ust.copies;
  document.querySelectorAll('[data-moc]').forEach(p => p.setAttribute('aria-pressed', +p.dataset.moc === ust.energy));
  $('mniej').disabled = ust.copies <= 1; $('wiecej').disabled = ust.copies >= 50;
  if (dokument.h) $('dlugosc').textContent = `ok. ${cm(dokument.h)}${ust.copies > 1 ? ` (×${ust.copies})` : ''}`;
}
document.querySelectorAll('[data-s]').forEach(el => el.addEventListener(el.type === 'range' ? 'input' : 'change', () => {
  ust[el.dataset.s] = el.dataset.s === 'feedMode' ? el.value : +el.value; pokazUst(); zapisz();
}));
document.querySelectorAll('[data-moc]').forEach(p => p.addEventListener('click', () => { ust.energy = +p.dataset.moc; pokazUst(); zapisz(); }));
for (const [id, o] of [['mniej', -1], ['wiecej', 1]]) $(id).addEventListener('click', () => { ust.copies = ogr(ust.copies + o, 1, 50); pokazUst(); zapisz(); });
addEventListener('beforeunload', e => { if (drukuje) e.preventDefault(); });

/* ======================= INSTALACJA I PRACA BEZ INTERNETU ======================= */
let zaproszenie = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); zaproszenie = e; $('blok-instaluj').hidden = false; });
addEventListener('appinstalled', () => { zaproszenie = null; $('blok-instaluj').hidden = true; });
$('instaluj').addEventListener('click', async () => {
  if (!zaproszenie) return;
  zaproszenie.prompt(); await zaproszenie.userChoice;
  zaproszenie = null; $('blok-instaluj').hidden = true;
});
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(e => log(`Praca bez internetu niedostępna: ${e.message}`));

(async () => {
  $('wersja').textContent = `Wersja: ${WERSJA}`;
  if (!navigator.bluetooth) {
    $('brak').hidden = false;
    if (czyIOS()) $('brak').textContent = 'Na iPhonie i iPadzie Safari oraz Chrome nie obsługują Bluetooth na stronach. Otwórz ten adres w aplikacji Bluefy — podgląd i zapis obrazów działają także tutaj.';
  }
  czcionki = dostepneCzcionki();
  await odczytaj();
  wybrany = bloki.length ? bloki[0].id : null;
  pokazUst(); pokazWszystko();
  const parametry = new URLSearchParams(location.search);
  const startAparat = parametry.has('aparat');
  const maUdostepnione = parametry.has('odbierz') || parametry.has('text') || parametry.has('url') || parametry.has('title');
  if (location.search) history.replaceState(null, '', location.pathname);
  if (maUdostepnione) await odbierzUdostepnione(parametry);
  else if (startAparat) otworzAparat();
})();
