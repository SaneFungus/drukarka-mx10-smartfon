'use strict';
/* Twarz z części (warstwy). Najpierw robisz zdjęcie bazowe: czyjąś twarz. Ono zajmuje całe tło obrazu.
   Potem z kolejnych zdjęć (albo z samego bazowego) obrysowujesz palcem część: oko, nos, usta, brodę, włosy…
   i stukasz, co to jest. Każdy wycinek staje się warstwą nad zdjęciem bazowym: można go przesunąć,
   powiększyć, obrócić, odbić, ukryć, przenieść wyżej lub niżej i usunąć. Każdą zmianę da się cofnąć i ponowić.
   Jak w twarz.js wszystko składamy w odcieniach szarości i dopiero gotową całość zamienia się na kropki.
   Zdjęcie bazowe i warstwy zostają w telefonie (IndexedDB) do naciśnięcia "Wyczyść".
   Warstwy ekranu: 'aparat' -> 'czesci' (układanie) albo 'aparat' -> 'wytnij' (obrys) -> 'czesci',
   z układania można też wejść w 'wytnij' na zdjęciu bazowym; na końcu 'zdjecie' (kropki i Drukuj). */
const CZ_BRZEG = 6 / W;                         // miękki brzeg wycinka: 6 kropek (ok. 0,75 mm), w ułamku szerokości obrazu
const WY_MAX = 2400;                            // zdjęcie do wycinania trzymamy większe niż zwykle: z daleka części są małe
const NAZWY_CZ = ['Oko', 'Brew', 'Nos', 'Usta', 'Broda', 'Włosy', 'Ucho', 'Inne'];
const cz = { baza:null, lista:[], nr:1, wybrany:null, suwak:'rozmiar', zrodlo:null, zrodloPrzed:null, wyNad:false, zmienBaze:false,
  obrys:null, rysuje:null, ostatni:null, widok:{ z:1, cx:0, cy:0 }, palce:new Map(), gest:null, zmieniono:false, suwakZm:false,
  zWycinania:false, cofnij:[], ponow:[], moje:new Set(), okna:new Map(), tlo:null, zaplanowane:0, wyZaplanowane:0, zapisT:0, napewno:{} };

const czWycinek = id => cz.lista.find(f => f.id === id) || null;
const czH = () => cz.baza ? cz.baza.h / cz.baza.w : 4 / 3;   // wysokość obrazu w jego szerokościach
function czNazwa(f) {                           // "Oko", a przy drugim takim samym "Oko 1", "Oko 2"
  const te = cz.lista.filter(g => g.czesc === f.czesc).sort((a, b) => a.id - b.id), nr = te.indexOf(f) + 1;
  return NAZWY_CZ[f.czesc] + (te.length > 1 ? ` ${nr}` : '');
}
const ileWarstw = n => `${n} ${n === 1 ? 'warstwa' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'warstwy' : 'warstw'}`;
function czStaty(img) {                         // średnia jasność i rozrzut całego zdjęcia, na małej kopii
  const k = 96 / Math.max(img.width, img.height), x = platno(Math.max(1, Math.round(img.width * k)), Math.max(1, Math.round(img.height * k)));
  x.drawImage(img, 0, 0, x.canvas.width, x.canvas.height);
  const g = szary(x, x.canvas.width, x.canvas.height), m = g.reduce((a, v) => a + v, 0) / g.length;
  return { id:Date.now() + Math.random(), m, d:Math.sqrt(g.reduce((a, v) => a + (v - m) * (v - m), 0) / g.length) };
}

/* ======================= COFNIJ I PONÓW ======================= */
const czStan = () => ({ baza:cz.baza, lista:cz.lista.map(f => ({ ...f })), wybrany:cz.wybrany });
function czZmiana() {                           // wywołać tuż PRZED każdą zmianą bazy albo warstw
  cz.cofnij.push(czStan()); if (cz.cofnij.length > 50) cz.cofnij.shift();
  cz.ponow = []; czSprzataj();
}
function czPrzywroc(skad, dokad) {
  if (!skad.length) return;
  dokad.push(czStan());
  const s = skad.pop();
  cz.baza = s.baza; cz.lista = s.lista.map(f => ({ ...f })); cz.wybrany = czWycinek(s.wybrany) ? s.wybrany : null;
  czSprzataj(); czZapisz(); czPokaz();
}
function czSprzataj() {                         // zdjęcia i maski, do których nic już nie prowadzi (także w Cofnij), znikają z pamięci
  const jest = new Set(), zyweId = new Set();
  const dodaj = s => { if (s.baza) jest.add(s.baza.src); for (const f of s.lista) { jest.add(f.src); zyweId.add(f.id); } };
  dodaj(cz); cz.cofnij.forEach(dodaj); cz.ponow.forEach(dodaj);
  for (const z of [cz.zrodlo, cz.zrodloPrzed]) if (z) jest.add(z.src);
  for (const src of cz.moje) if (!jest.has(src)) { usunObraz(src); cz.moje.delete(src); }
  for (const id of cz.okna.keys()) if (!zyweId.has(id)) cz.okna.delete(id);
}

/* ======================= APARAT ======================= */
function czPasek() {                            // pasek w aparacie: który krok, Ułóż i Wyczyść
  const widac = !$('foto').hidden && ust.apTryb === 'czesci' && warstwa === 'aparat', n = cz.lista.length;
  $('cz-krok').hidden = !widac;
  if (!widac) return;
  const [tytul, rada] = !cz.baza ? ['Zdjęcie bazowe', 'Zrób zdjęcie twarzy albo weź je z galerii. Będzie tłem całego obrazu.']
    : cz.zmienBaze ? ['Nowe zdjęcie bazowe', 'Zrób zdjęcie, które zastąpi tło. Warstwy zostaną na swoich miejscach.']
    : ['Z części', n ? `Na zdjęciu bazowym: ${ileWarstw(n)}. Zrób zdjęcie, z którego wytniesz kolejną część, albo ułóż.`
      : 'Zdjęcie bazowe gotowe. Teraz zrób zdjęcie, z którego wytniesz oko, nos albo usta.'];
  $('cz-krok-tytul').textContent = tytul; $('cz-krok-rada').textContent = rada;
  $('cz-krok-przyciski').hidden = !cz.baza;
  $('cz-anuluj').hidden = !cz.zmienBaze; $('cz-wyczysc2').hidden = $('cz-uloz').hidden = cz.zmienBaze;
}
function czZdjecie(src) {                       // zdjęcie ze spustu, aparatu telefonu albo galerii
  if (warstwa !== 'aparat') { usunObraz(src); return; }
  const img = obrazy.get(src), zr = czStaty(img);
  if (!cz.baza || cz.zmienBaze) {               // pierwsze zdjęcie (albo "Zmień tło") staje się tłem
    if (cz.baza) czZmiana();                    // przed dopisaniem do "moje", bo sprzątanie usunęłoby nowe zdjęcie
    cz.moje.add(src);
    cz.baza = { src, img, w:img.width, h:img.height, zr }; cz.zmienBaze = false; cz.wybrany = null;
    czSprzataj(); czZapisz(); cz.zWycinania = false; otworzWarstwe('czesci');
    return;
  }
  cz.zrodlo = { src, img, zr }; cz.moje.add(src); cz.obrys = cz.rysuje = cz.ostatni = null;
  cz.widok = { z:1, cx:img.width / 2, cy:img.height / 2 };
  czSprzataj(); otworzWarstwe('wytnij');
}
function czWarstwa(w) {                         // wywoływane z ustawWarstwe po twWarstwa
  $('wytnij').hidden = w !== 'wytnij'; $('czesci').hidden = w !== 'czesci';
  $('cz-porady').hidden = !(w === 'aparat' && ust.apTryb === 'czesci' && ust.wyPorady);
  if (w !== 'wytnij' && cz.wyNad) { cz.wyNad = false; cz.zrodlo = cz.zrodloPrzed; cz.zrodloPrzed = null; cz.obrys = cz.rysuje = null; }
  if (w === 'aparat' || !w) { cz.zrodlo = null; cz.obrys = cz.rysuje = null; }   // zdjęcie do wycinania już niepotrzebne
  if (!w) cz.zmienBaze = false;
  czSprzataj(); czPasek();
  if (w === 'wytnij') { wyPokaz(); wyOdrysuj(); }
  if (w === 'czesci') czPokaz();
}
$('cz-zaczynam').addEventListener('click', () => { ust.wyPorady = false; zapisz(); $('cz-porady').hidden = true; $('ap-spust').focus(); });
$('cz-uloz').addEventListener('click', () => { if (warstwa === 'aparat' && cz.baza) { cz.zWycinania = false; otworzWarstwe('czesci'); } });
$('cz-anuluj').addEventListener('click', () => { if (warstwa !== 'aparat') return; cz.zmienBaze = false; cz.zWycinania = false; otworzWarstwe('czesci'); });

/* ======================= WYCINANIE: OBRYS PALCEM ======================= */
const wyGlebia = () => cz.wyNad ? czGlebia() + 1 : 2;   // ile kroków Wstecz z wycinania zamyka cały aparat
function wyObrysy() {                           // to, co już wycięto z tego zdjęcia, w pikselach zdjęcia
  const z = cz.zrodlo; if (!z) return [];
  return cz.lista.filter(f => f.zr && f.zr.id === z.zr.id && f.ox !== undefined)
    .map(f => ({ id:f.id, nazwa:czNazwa(f), pkt:f.pkt.map((v, i) => v + (i % 2 ? f.oy : f.ox)) }));
}
function wyGeometria() {                        // piksel zdjęcia -> punkt na ekranie: X = ox + px * k
  const c = $('wy-zdjecie'), img = cz.zrodlo.img, v = cz.widok;
  const cw = c.clientWidth || 1, ch = c.clientHeight || 1, k = Math.min(cw / img.width, ch / img.height) * v.z;
  return { cw, ch, k, ox:cw / 2 - v.cx * k, oy:ch / 2 - v.cy * k };
}
function wyOgranicz() {                         // przybliżenie 1–8×, zdjęcie nie ucieka z ekranu
  const v = cz.widok, img = cz.zrodlo.img; v.z = ogr(v.z, 1, 8);
  const { cw, ch, k } = wyGeometria();
  for (const [os, wym, pole] of [['cx', img.width, cw], ['cy', img.height, ch]]) {
    const pol = pole / 2 / k;
    v[os] = wym <= 2 * pol ? wym / 2 : ogr(v[os], pol, wym - pol);
  }
}
function sciezkaPunktow(x, p) { x.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) x.lineTo(p[i], p[i + 1]); }
function wyOdrysuj() { if (!cz.wyZaplanowane) cz.wyZaplanowane = requestAnimationFrame(() => { cz.wyZaplanowane = 0; wyRysuj(); }); }
function wyRysuj() {
  if ($('wytnij').hidden || !cz.zrodlo) return;
  const c = $('wy-zdjecie'), pole = c.parentElement, dpr = devicePixelRatio || 1;
  const cw = Math.max(1, pole.clientWidth), ch = Math.max(1, pole.clientHeight);
  c.style.width = `${cw}px`; c.style.height = `${ch}px`;
  c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr);
  wyOgranicz();
  const { k, ox, oy } = wyGeometria(), img = cz.zrodlo.img, x = c.getContext('2d');
  x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, cw, ch);
  x.imageSmoothingQuality = 'high'; x.drawImage(img, ox, oy, img.width * k, img.height * k);
  const naEkran = p => p.map((v, i) => i % 2 ? oy + v * k : ox + v * k);
  x.lineJoin = x.lineCap = 'round';
  for (const o of wyObrysy()) {
    const p = naEkran(o.pkt);
    x.save(); x.setLineDash([5, 5]); x.lineWidth = 1.5; x.strokeStyle = 'rgba(255,255,255,.85)';
    x.beginPath(); sciezkaPunktow(x, p); x.closePath(); x.stroke(); x.restore();
    let sx = 0, sy = 0; for (let i = 0; i < p.length; i += 2) { sx += p[i]; sy += p[i + 1]; }
    const n = p.length / 2, t = o.nazwa;
    x.font = '600 13px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 3; x.strokeStyle = 'rgba(0,0,0,.7)'; x.strokeText(t, sx / n, sy / n); x.fillStyle = '#fff'; x.fillText(t, sx / n, sy / n);
  }
  if (cz.obrys) {                               // zamknięty obrys: poza nim przyciemnione, bo to nie przejdzie do wyniku
    const p = naEkran(cz.obrys);
    x.fillStyle = 'rgba(0,0,0,.55)'; x.beginPath(); x.rect(0, 0, cw, ch); sciezkaPunktow(x, p); x.closePath(); x.fill('evenodd');
    for (const [kolor, gr] of [['rgba(0,0,0,.6)', 5], ['#e8557b', 2.5]]) { x.strokeStyle = kolor; x.lineWidth = gr; x.beginPath(); sciezkaPunktow(x, p); x.closePath(); x.stroke(); }
  }
  if (cz.rysuje && cz.rysuje.length > 2) {      // obrys w trakcie rysowania
    const p = naEkran(cz.rysuje);
    for (const [kolor, gr] of [['rgba(0,0,0,.6)', 5], ['#e8557b', 2.5]]) { x.strokeStyle = kolor; x.lineWidth = gr; x.beginPath(); sciezkaPunktow(x, p); x.stroke(); }
  }
}
function wyPokaz() {
  const n = cz.lista.length, jest = !!cz.obrys, f = czWycinek(cz.ostatni), dalej = cz.wyNad ? 'Gotowe' : 'Ułóż';
  $('wy-rada').textContent = jest ? 'Teraz stuknij, co obrysowałeś. Możesz też obrysować jeszcze raz.'
    : f ? `Wycięto: ${czNazwa(f)}. Obrysuj następną część albo stuknij ${dalej}.`
    : 'Obrysuj palcem część, którą chcesz wyciąć. Dwoma palcami przybliżysz zdjęcie.';
  for (const p of $('wy-czesci').children) p.disabled = !jest;
  $('wy-uloz').textContent = !cz.wyNad && n ? `Ułóż (${n})` : dalej;
  $('wy-uloz').disabled = !cz.baza;
  $('wy-cofnij').disabled = !wyObrysy().length;
}
$('wy-czesci').innerHTML = NAZWY_CZ.map((m, i) => `<button data-czesc="${i}" disabled>${m}</button>`).join('');

function wyPunkt(e) {                           // palec -> piksel zdjęcia
  const b = $('wy-zdjecie').getBoundingClientRect(), g = wyGeometria();
  return [(e.clientX - b.left - g.ox) / g.k, (e.clientY - b.top - g.oy) / g.k];
}
function wyGest() {                             // dwa palce: odległość i środek na ekranie, do przybliżania
  const [a, b] = [...cz.palce.values()], r = $('wy-zdjecie').getBoundingClientRect();
  return { d:Math.hypot(a.x - b.x, a.y - b.y) || 1, mx:(a.x + b.x) / 2 - r.left, my:(a.y + b.y) / 2 - r.top };
}
function wyPrzybliz(z, mx, my, px, py) {        // punkt zdjęcia px,py ląduje pod mx,my na ekranie
  const v = cz.widok; v.z = ogr(z, 1, 8);
  const { cw, ch, k } = wyGeometria();
  v.cx = px - (mx - cw / 2) / k; v.cy = py - (my - ch / 2) / k;
  wyOgranicz(); wyOdrysuj();
}
const wy = $('wy-zdjecie');
wy.addEventListener('pointerdown', e => {
  if (!cz.zrodlo) return;
  wy.setPointerCapture(e.pointerId); cz.palce.set(e.pointerId, { x:e.clientX, y:e.clientY });
  if (cz.palce.size === 1) { cz.rysuje = wyPunkt(e); cz.gest = null; }
  else if (cz.palce.size === 2) {               // drugi palec: zamiast rysować, przybliżamy
    cz.rysuje = null;
    const g = wyGest(), geo = wyGeometria();
    cz.gest = { ...g, z:cz.widok.z, px:(g.mx - geo.ox) / geo.k, py:(g.my - geo.oy) / geo.k };
  }
  wyOdrysuj();
});
wy.addEventListener('pointermove', e => {
  if (!cz.palce.has(e.pointerId)) return;
  cz.palce.set(e.pointerId, { x:e.clientX, y:e.clientY });
  if (cz.gest && cz.palce.size >= 2) { const g = wyGest(); wyPrzybliz(cz.gest.z * g.d / cz.gest.d, g.mx, g.my, cz.gest.px, cz.gest.py); return; }
  if (!cz.rysuje) return;
  const p = wyPunkt(e), r = cz.rysuje, k = wyGeometria().k;
  if (Math.hypot(p[0] - r[r.length - 2], p[1] - r[r.length - 1]) * k >= 3) { r.push(...p); wyOdrysuj(); }
});
function wyPusc(e) {
  if (!cz.palce.delete(e.pointerId)) return;
  if (cz.palce.size < 2) cz.gest = null;
  const r = cz.rysuje; cz.rysuje = null;
  if (r && !cz.palce.size) {                    // linia zamyka się sama; zbyt mała to tylko dotknięcie
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < r.length; i += 2) { x0 = Math.min(x0, r[i]); x1 = Math.max(x1, r[i]); y0 = Math.min(y0, r[i + 1]); y1 = Math.max(y1, r[i + 1]); }
    if (r.length >= 12 && Math.min(x1 - x0, y1 - y0) * wyGeometria().k >= 12) { cz.obrys = r; cz.ostatni = null; }
  }
  wyPokaz(); wyOdrysuj();
}
for (const t of ['pointerup', 'pointercancel']) wy.addEventListener(t, wyPusc);
wy.addEventListener('wheel', e => {             // na komputerze: kółko myszy przybliża
  if (!cz.zrodlo) return;
  e.preventDefault();
  const b = wy.getBoundingClientRect(), g = wyGeometria(), mx = e.clientX - b.left, my = e.clientY - b.top;
  wyPrzybliz(cz.widok.z * Math.exp(-e.deltaY / 400), mx, my, (mx - g.ox) / g.k, (my - g.oy) / g.k);
}, { passive:false });
new ResizeObserver(wyOdrysuj).observe(wy.parentElement);

async function czWytnij(pkt, czesc) {           // obrys + nazwa -> nowa warstwa na wierzchu
  const z = cz.zrodlo, img = z.img;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < pkt.length; i += 2) { x0 = Math.min(x0, pkt[i]); x1 = Math.max(x1, pkt[i]); y0 = Math.min(y0, pkt[i + 1]); y1 = Math.max(y1, pkt[i + 1]); }
  const zap = Math.max(4, 0.03 * Math.max(x1 - x0, y1 - y0));
  const l = Math.max(0, Math.floor(x0 - zap)), g = Math.max(0, Math.floor(y0 - zap));
  const w = Math.max(1, Math.min(img.width, Math.ceil(x1 + zap)) - l), h = Math.max(1, Math.min(img.height, Math.ceil(y1 + zap)) - g);
  const x = platno(w, h); x.drawImage(img, -l, -g);
  czZmiana();                                   // przed zPlotna, bo sprzątanie w czZmiana nie zna jeszcze nowego wycinka
  const src = await zPlotna(x.canvas, 0.92);
  cz.moje.add(src);
  const H = czH(), s = Math.sqrt(H / (img.width * img.height)), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const f = { id:cz.nr++, src, img:obrazy.get(src), czesc, w, h, ax:cx - l, ay:cy - g, ox:l, oy:g,
    pkt:pkt.map((v, i) => Math.round((v - (i % 2 ? g : l)) * 10) / 10),
    x:ogr(cx / img.width, 0, 1), y:ogr(cy / img.height * H, 0, H), s, s0:s, rot:0, jasnosc:0, lustro:false, ukryty:false, zr:z.zr };
  cz.lista.push(f);
  cz.obrys = null; cz.ostatni = f.id; cz.wybrany = f.id;
  czZapisz(); wyPokaz(); wyOdrysuj();
}
$('wy-czesci').addEventListener('click', e => {
  const p = e.target.closest('[data-czesc]'); if (!p || !cz.obrys || !cz.zrodlo) return;
  czWytnij(cz.obrys, +p.dataset.czesc).catch(() => { $('wy-rada').textContent = 'Nie udało się wyciąć. Spróbuj jeszcze raz.'; });
});
$('wy-cofnij').addEventListener('click', () => {   // cofa ostatni wycinek z tego zdjęcia, obrys wraca do poprawienia
  const o = wyObrysy().sort((a, b) => b.id - a.id)[0]; if (!o) return;
  czZmiana(); czUsun(o.id); cz.obrys = o.pkt; cz.ostatni = null; czZapisz(); wyPokaz(); wyOdrysuj();
});
$('wy-uloz').addEventListener('click', () => {
  if (warstwa !== 'wytnij' || !cz.baza) return;
  if (cz.wyNad) zamknijWarstwe();               // wycinanie z bazowego: z powrotem do układania
  else { cz.zWycinania = true; otworzWarstwe('czesci'); }
});
$('wy-inne').addEventListener('click', () => { if (warstwa === 'wytnij') zamknijWarstwe(wyGlebia() - 1); });   // do aparatu
$('wy-zamknij').addEventListener('click', () => zamknijWarstwe(wyGlebia()));

/* ======================= SKŁADANIE ======================= */
function macierz(f, ow) {                       // piksel wycinka -> piksel obrazu o szerokości ow
  const k = f.s * ow;
  return new DOMMatrix().translate(f.x * ow, f.y * ow).rotate(f.rot).scale(f.lustro ? -k : k, k).translate(-f.ax, -f.ay);
}
function szary(x, w, h) {                       // odcienie szarości 0..1 z płótna
  const d = x.getImageData(0, 0, w, h).data, g = new Float32Array(w * h);
  for (let i = 0; i < g.length; i++) g[i] = (d[i*4] * 0.299 + d[i*4+1] * 0.587 + d[i*4+2] * 0.114) / 255;
  return g;
}
function czOkno(f, ow, oh, b) {                 // warstwa na obrazie: zapamiętujemy obrócony wycinek i maskę, przesuwanie nic nie przerysowuje
  const k = f.s * ow, klucz = `${f.src}|${k.toFixed(3)}|${f.rot.toFixed(2)}|${f.lustro}|${b.toFixed(2)}`;
  let c = cz.okna.get(f.id);
  if (!c || c.klucz !== klucz) {
    const M0 = new DOMMatrix().rotate(f.rot).scale(f.lustro ? -k : k, k).translate(-f.ax, -f.ay);
    let lx0 = Infinity, ly0 = Infinity, lx1 = -Infinity, ly1 = -Infinity;
    for (const [ax, ay] of [[0, 0], [f.w, 0], [0, f.h], [f.w, f.h]]) {
      const p = M0.transformPoint({ x:ax, y:ay });
      lx0 = Math.min(lx0, p.x); lx1 = Math.max(lx1, p.x); ly0 = Math.min(ly0, p.y); ly1 = Math.max(ly1, p.y);
    }
    const zap = Math.ceil(b) + 2;
    lx0 = Math.floor(lx0) - zap; ly0 = Math.floor(ly0) - zap;
    const lw = Math.ceil(lx1) + zap - lx0, lh = Math.ceil(ly1) + zap - ly0;
    if (lw <= 0 || lh <= 0 || lw * lh > 9 * ow * oh) return null;
    const T = new DOMMatrix().translate(-lx0, -ly0).multiply(M0);
    const xi = platno(lw, lh); xi.imageSmoothingQuality = 'high'; xi.setTransform(T); xi.drawImage(f.img, 0, 0);
    const xm = platno(lw, lh); xm.fillStyle = '#000'; xm.fillRect(0, 0, lw, lh);
    xm.setTransform(T); xm.beginPath(); sciezkaPunktow(xm, f.pkt); xm.closePath(); xm.fillStyle = '#fff'; xm.fill();
    let a;
    if (b) {
      xm.lineWidth = b / k; xm.lineJoin = 'round'; xm.strokeStyle = '#000'; xm.stroke();
      const xb = platno(lw, lh); xb.fillStyle = '#000'; xb.fillRect(0, 0, lw, lh);
      xb.filter = `blur(${(b / 3).toFixed(1)}px)`; xb.drawImage(xm.canvas, 0, 0);
      a = szary(xb, lw, lh);
    } else a = szary(xm, lw, lh);
    c = { klucz, lx0, ly0, lw, lh, g:szary(xi, lw, lh), a };
    cz.okna.set(f.id, c);
  }
  const ox = Math.round(f.x * ow) + c.lx0, oy = Math.round(f.y * ow) + c.ly0;
  const x0 = Math.max(0, ox), y0 = Math.max(0, oy), x1 = Math.min(ow, ox + c.lw), y1 = Math.min(oh, oy + c.lh);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x0, y0, w:x1 - x0, h:y1 - y0, sx:x0 - ox, sy:y0 - oy, lw:c.lw, g:c.g, a:c.a };
}
function czZloz(ow) {                           // wynik: ImageData w odcieniach szarości, szerokość ow, proporcje zdjęcia bazowego
  const oh = Math.max(1, Math.round(ow * czH())), n = ow * oh, b = ust.czMiekki ? CZ_BRZEG * ow : 0, B = cz.baza;
  let v;
  if (B) {                                      // tło: całe zdjęcie bazowe
    if (!cz.tlo || cz.tlo.src !== B.src || cz.tlo.ow !== ow) {
      const x = platno(ow, oh); x.imageSmoothingQuality = 'high'; x.drawImage(B.img, 0, 0, ow, oh);
      cz.tlo = { src:B.src, ow, g:szary(x, ow, oh) };
    }
    v = Float32Array.from(cz.tlo.g);
  } else v = new Float32Array(n).fill(1);
  for (const f of cz.lista) {
    if (f.ukryty || !f.img) continue;
    const o = czOkno(f, ow, oh, b); if (!o) continue;
    const dopasuj = ust.czRownajZdjecia && B && f.zr && f.zr.id !== B.zr.id;
    const sk = dopasuj && f.zr.d > 0.01 ? ogr(B.zr.d / f.zr.d, 0.8, 1.25) : 1;
    const sm = dopasuj ? f.zr.m : 0, bm = dopasuj ? B.zr.m : 0, jas = f.jasnosc / 200;
    for (let y = 0; y < o.h; y++) {
      const wierszO = (o.sy + y) * o.lw + o.sx, wierszV = (o.y0 + y) * ow + o.x0;
      for (let x = 0; x < o.w; x++) {
        const i = wierszO + x, a = o.a[i]; if (!a) continue;
        const g = dopasuj ? (o.g[i] - sm) * sk + bm : o.g[i];
        v[wierszV + x] = v[wierszV + x] * (1 - a) + ogr(g + jas, 0, 1) * a;
      }
    }
  }
  const im = new ImageData(ow, oh), d = im.data;
  for (let i = 0; i < n; i++) { d[i*4] = d[i*4+1] = d[i*4+2] = v[i] * 255; d[i*4+3] = 255; }
  return im;
}

/* ======================= UKŁADANIE ======================= */
const SUWAKI_CZ = { rozmiar:['Rozmiar', 10, 400], obrot:['Obrót', -180, 180], jasnosc:['Jasność', -60, 60] };
function czWartosc(f, k) { return k === 'rozmiar' ? Math.round(f.s / f.s0 * 100) : k === 'obrot' ? Math.round(f.rot) : f.jasnosc; }
const czOpis = (k, v) => k === 'rozmiar' ? `${v}%` : k === 'obrot' ? `${v}°` : `${v}`;
function czPokaz() {
  const f = czWycinek(cz.wybrany); if (!f) cz.wybrany = null;
  const nr = f ? cz.lista.indexOf(f) : -1;
  $('cz-wybor').innerHTML = wcisk('data-cz="-1"', 'Zdjęcie bazowe', !f)
    + cz.lista.map(g => wcisk(`data-cz="${g.id}"`, czNazwa(g) + (g.ukryty ? ' (ukryta)' : ''), g === f)).join('');
  const wcis = $('cz-wybor').querySelector('[aria-pressed=true]'); if (wcis) wcis.scrollIntoView({ block:'nearest', inline:'nearest' });
  $('cz-tlo').hidden = !!f; $('cz-ustaw').hidden = !f;
  $('cz-cofnij').disabled = !cz.cofnij.length; $('cz-ponow').disabled = !cz.ponow.length;
  $('cz-z-bazy').disabled = $('cz-zmien').disabled = !cz.baza;
  $('cz-miekki').setAttribute('aria-pressed', !!ust.czMiekki);
  $('cz-wyrownaj').setAttribute('aria-pressed', !!ust.czRownajZdjecia);
  if (f) {
    for (const p of $('cz-suwaki').querySelectorAll('[data-suwak]')) p.setAttribute('aria-pressed', p.dataset.suwak === cz.suwak);
    $('cz-odbij').setAttribute('aria-pressed', !!f.lustro);
    $('cz-ukryj').textContent = f.ukryty ? 'Pokaż' : 'Ukryj';
    $('cz-wyzej').disabled = nr === cz.lista.length - 1; $('cz-nizej').disabled = nr === 0;
    const [nazwa, min, max] = SUWAKI_CZ[cz.suwak], s = $('cz-suwak'), v = czWartosc(f, cz.suwak);
    $('cz-n-suwak').textContent = nazwa; s.min = min; s.max = max; s.value = v; $('cz-o-suwak').textContent = czOpis(cz.suwak, v);
  }
  $('cz-dodaj').textContent = cz.zWycinania ? 'Wytnij więcej' : 'Dodaj warstwę';
  $('cz-dalej').disabled = !cz.baza;
  $('cz-rada').textContent = !cz.baza ? 'Nie ma jeszcze zdjęcia bazowego.'
    : f ? (f.ukryty ? 'Ta warstwa jest ukryta. Stuknij "Pokaż", żeby wróciła.' : 'Przeciągnij, żeby przesunąć. Dwoma palcami powiększysz i obrócisz.')
    : cz.lista.length ? 'Dotknij warstwy na obrazie albo na liście, żeby ją wybrać.'
    : 'To jest zdjęcie bazowe. Stuknij "Dodaj warstwę" i zrób zdjęcie, z którego wytniesz część.';
  czOdrysuj();
}
function czOdrysuj() { if (!cz.zaplanowane) cz.zaplanowane = requestAnimationFrame(() => { cz.zaplanowane = 0; czRysuj(); }); }
function czRysuj() {
  if ($('czesci').hidden) return;
  const c = $('cz-podglad'), pole = c.parentElement, dpr = devicePixelRatio || 1, H = czH();
  const css = Math.max(60, Math.min(pole.clientWidth - 8, (pole.clientHeight - 8) / H));
  const im = czZloz(Math.min(576, Math.round(css * dpr)));
  c.width = im.width; c.height = im.height; c.style.width = `${css}px`; c.style.height = `${css * H}px`;
  const x = c.getContext('2d'); x.putImageData(im, 0, 0);
  const sk = im.width / css, f = czWycinek(cz.wybrany);
  if (f) {                                      // wybrana warstwa: różowy obrys (tylko na ekranie)
    x.setTransform(new DOMMatrix().scale(sk).multiply(macierz(f, css)));
    x.beginPath(); sciezkaPunktow(x, f.pkt); x.closePath(); x.setTransform(1, 0, 0, 1, 0, 0);
    x.lineJoin = 'round'; x.lineWidth = 2.5 * sk;
    x.strokeStyle = 'rgba(0,0,0,.5)'; x.stroke();
    x.strokeStyle = '#e8557b'; x.setLineDash([6 * sk, 4 * sk]); x.stroke(); x.setLineDash([]);
  }
}
function czTrafiony(px, py, css) {              // która widoczna warstwa leży pod palcem (najwyższa na wierzchu)
  const x = pomiar;
  for (let j = cz.lista.length - 1; j >= 0; j--) {
    const f = cz.lista[j]; if (f.ukryty) continue;
    const p = macierz(f, css).inverse().transformPoint({ x:px, y:py });
    x.setTransform(1, 0, 0, 1, 0, 0); x.beginPath(); sciezkaPunktow(x, f.pkt); x.closePath();
    x.lineWidth = 24 / (f.s * css);             // małe wycinki łatwo trafić także tuż obok brzegu
    if (x.isPointInPath(p.x, p.y) || x.isPointInStroke(p.x, p.y)) return f;
  }
  return null;
}
const pg = $('cz-podglad');
function czDwaPalce() {
  const [a, b] = [...cz.palce.values()];
  return { d:Math.hypot(a.x - b.x, a.y - b.y) || 1, kat:Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI, mx:(a.x + b.x) / 2, my:(a.y + b.y) / 2 };
}
function czStartGestu() {                       // stan warstwy i palców na początku ruchu
  const f = czWycinek(cz.wybrany); cz.gest = null; if (!f || !cz.palce.size) return;
  const css = pg.getBoundingClientRect().width;
  if (cz.palce.size === 1) { const [p] = cz.palce.values(); cz.gest = { css, mx:p.x, my:p.y, x:f.x, y:f.y }; }
  else cz.gest = { css, ...czDwaPalce(), x:f.x, y:f.y, s:f.s, rot:f.rot };
}
pg.addEventListener('pointerdown', e => {
  pg.setPointerCapture(e.pointerId); cz.palce.set(e.pointerId, { x:e.clientX, y:e.clientY });
  if (cz.palce.size === 1) {
    cz.zmieniono = false;
    const b = pg.getBoundingClientRect(), f = czTrafiony(e.clientX - b.left, e.clientY - b.top, b.width);
    cz.wybrany = f ? f.id : null; czPokaz();
  }
  czStartGestu();
});
pg.addEventListener('pointermove', e => {
  if (!cz.palce.has(e.pointerId)) return;
  cz.palce.set(e.pointerId, { x:e.clientX, y:e.clientY });
  const g = cz.gest, f = czWycinek(cz.wybrany); if (!g || !f) return;
  const H = czH();
  if (cz.palce.size === 1) {
    const [p] = cz.palce.values();
    if (!cz.zmieniono && Math.hypot(p.x - g.mx, p.y - g.my) < 4) return;   // samo dotknięcie tylko wybiera
    if (!cz.zmieniono) { czZmiana(); cz.zmieniono = true; }
    f.x = ogr(g.x + (p.x - g.mx) / g.css, -.1, 1.1); f.y = ogr(g.y + (p.y - g.my) / g.css, -.1, H + .1);
  } else {                                      // dwa palce: rozsunięcie = rozmiar, skręt = obrót, środek = przesunięcie
    if (!cz.zmieniono) { czZmiana(); cz.zmieniono = true; }
    const t = czDwaPalce();
    f.s = ogr(g.s * t.d / g.d, f.s0 * .1, f.s0 * 4);
    f.rot = ((g.rot + t.kat - g.kat + 540) % 360) - 180;
    f.x = ogr(g.x + (t.mx - g.mx) / g.css, -.1, 1.1); f.y = ogr(g.y + (t.my - g.my) / g.css, -.1, H + .1);
  }
  czOdrysuj();
});
function czPusc(e) {
  if (!cz.palce.delete(e.pointerId)) return;
  czStartGestu();                               // zostaje jeden palec: dalej przesuwa, bez skoku
  if (!cz.palce.size) { if (cz.zmieniono) czZapisz(); czPokaz(); }
}
for (const t of ['pointerup', 'pointercancel']) pg.addEventListener(t, czPusc);
$('cz-wybor').addEventListener('click', e => { const p = e.target.closest('[data-cz]'); if (p) { cz.wybrany = +p.dataset.cz < 0 ? null : +p.dataset.cz; czPokaz(); } });
$('cz-suwaki').addEventListener('click', e => { const p = e.target.closest('[data-suwak]'); if (p) { cz.suwak = p.dataset.suwak; czPokaz(); } });
$('cz-suwak').addEventListener('input', e => {
  const f = czWycinek(cz.wybrany); if (!f) return;
  if (!cz.suwakZm) { czZmiana(); cz.suwakZm = true; $('cz-cofnij').disabled = false; $('cz-ponow').disabled = true; }   // jedno przesunięcie suwaka = jeden krok Cofnij
  const v = +e.target.value;
  if (cz.suwak === 'rozmiar') f.s = f.s0 * v / 100; else if (cz.suwak === 'obrot') f.rot = v; else f.jasnosc = v;
  $('cz-o-suwak').textContent = czOpis(cz.suwak, v); czOdrysuj(); czZapisz();
});
$('cz-suwak').addEventListener('change', () => { cz.suwakZm = false; });
function czZmien(dzialaj) {                     // zmiana wybranej warstwy jednym przyciskiem
  const f = czWycinek(cz.wybrany); if (!f) return;
  czZmiana(); dzialaj(f, cz.lista.indexOf(f)); czZapisz(); czPokaz();
}
$('cz-odbij').addEventListener('click', () => czZmien(f => { f.lustro = !f.lustro; }));
$('cz-ukryj').addEventListener('click', () => czZmien(f => { f.ukryty = !f.ukryty; }));
$('cz-wyzej').addEventListener('click', () => czZmien((f, i) => { if (i < cz.lista.length - 1) [cz.lista[i], cz.lista[i + 1]] = [cz.lista[i + 1], f]; }));
$('cz-nizej').addEventListener('click', () => czZmien((f, i) => { if (i > 0) [cz.lista[i], cz.lista[i - 1]] = [cz.lista[i - 1], f]; }));
$('cz-usun').addEventListener('click', () => czZmien(f => czUsun(f.id)));   // da się cofnąć, więc bez pytania
$('cz-cofnij').addEventListener('click', () => czPrzywroc(cz.cofnij, cz.ponow));
$('cz-ponow').addEventListener('click', () => czPrzywroc(cz.ponow, cz.cofnij));
for (const [id, klucz] of [['cz-miekki', 'czMiekki'], ['cz-wyrownaj', 'czRownajZdjecia']])
  $(id).addEventListener('click', () => { ust[klucz] = !ust[klucz]; zapisz(); czPokaz(); });
function dwaRazy(id, napis, dzialaj) {          // "Wyczyść" nie da się cofnąć, więc trzeba dotknąć drugi raz
  $(id).addEventListener('click', () => {
    const p = $(id);
    if (!cz.napewno[id]) { p.textContent = 'Na pewno?'; cz.napewno[id] = setTimeout(() => { cz.napewno[id] = 0; p.textContent = napis; }, 3000); return; }
    clearTimeout(cz.napewno[id]); cz.napewno[id] = 0; p.textContent = napis;
    dzialaj();
  });
}
function czUsun(id) {
  cz.lista = cz.lista.filter(g => g.id !== id);
  if (cz.wybrany === id) cz.wybrany = null;
}
function czWyczysc() {                          // wszystko od nowa: zdjęcie bazowe, warstwy, Cofnij i pamięć telefonu
  cz.baza = null; cz.lista = []; cz.cofnij = []; cz.ponow = []; cz.tlo = null; cz.okna.clear();
  cz.wybrany = cz.obrys = cz.rysuje = cz.ostatni = cz.zrodlo = cz.zrodloPrzed = null; cz.wyNad = cz.zmienBaze = false;
  czSprzataj(); czZapiszTeraz();
}
const czGlebia = () => cz.zWycinania ? 3 : 2;   // ile kroków Wstecz z układania zamyka cały aparat
dwaRazy('cz-wyczysc', 'Wyczyść', () => { czWyczysc(); zamknijWarstwe(czGlebia() - 1); });   // z powrotem do aparatu
dwaRazy('cz-wyczysc2', 'Wyczyść', () => { czWyczysc(); czPasek(); });
$('cz-z-bazy').addEventListener('click', () => {   // wytnij część z samego zdjęcia bazowego
  if (warstwa !== 'czesci' || !cz.baza) return;
  cz.zrodloPrzed = cz.zrodlo; cz.zrodlo = { src:cz.baza.src, img:cz.baza.img, zr:cz.baza.zr }; cz.wyNad = true;
  cz.obrys = cz.rysuje = cz.ostatni = null; cz.widok = { z:1, cx:cz.baza.w / 2, cy:cz.baza.h / 2 };
  otworzWarstwe('wytnij');
});
$('cz-zmien').addEventListener('click', () => { if (warstwa === 'czesci') { cz.zmienBaze = true; zamknijWarstwe(czGlebia() - 1); } });
$('cz-dodaj').addEventListener('click', () => { if (warstwa === 'czesci') zamknijWarstwe(); });   // do wycinania albo do aparatu
$('cz-zamknij').addEventListener('click', () => zamknijWarstwe(czGlebia()));
$('cz-dalej').addEventListener('click', async () => {
  if (!cz.baza) return;
  const im = czZloz(2 * W), x = platno(im.width, im.height);   // dwa piksele na kropkę: kropki liczy potem rdzen.js
  x.putImageData(im, 0, 0);
  apPokaz(await zPlotna(x.canvas, 0.9), 'Twarz z części');
});
new ResizeObserver(czOdrysuj).observe(pg.parentElement);

/* ======================= PAMIĘĆ TELEFONU ======================= */
function czBaza() {
  return new Promise((ok, zle) => {
    const r = indexedDB.open('mx10-czesci', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('stan');
    r.onsuccess = () => ok(r.result); r.onerror = () => zle(r.error);
  });
}
function czZapisz() { clearTimeout(cz.zapisT); cz.zapisT = setTimeout(czZapiszTeraz, 500); }
async function czZapiszTeraz() {
  clearTimeout(cz.zapisT); cz.zapisT = 0;
  try {
    const db = await czBaza(), t = db.transaction('stan', 'readwrite'), s = t.objectStore('stan');
    if (cz.baza) {
      const { img, src, ...baza } = cz.baza;
      s.put({
        baza:{ ...baza, plik:bloby.get(src) || src },
        lista:cz.lista.map(({ img:i, src:u, ...reszta }) => ({ ...reszta, plik:bloby.get(u) || u })),
        nr:cz.nr,
      }, 'warstwy');
    } else s.delete('warstwy');                 // "Wyczyść": w telefonie nic nie zostaje
    s.delete('wycinki'); s.delete('ostatni');
    t.oncomplete = () => db.close();
  } catch (e) { log(`Części: nie zapisano (${e.name})`); }
}
document.addEventListener('visibilitychange', () => { if (document.hidden && cz.zapisT) czZapiszTeraz(); });
addEventListener('DOMContentLoaded', async () => {   // po wszystkich skryptach, bo wczytajZapisanyObraz jest w ekran.js
  try {
    const db = await czBaza(), t = db.transaction('stan', 'readwrite'), s = t.objectStore('stan');
    s.delete('wycinki'); s.delete('ostatni');
    t.oncomplete = () => db.close();
    const z = await new Promise((ok, zle) => { const r = s.get('warstwy'); r.onsuccess = () => ok(r.result); r.onerror = () => zle(r.error); });
    if (!z || !z.baza || cz.baza) return;
    const bSrc = await wczytajZapisanyObraz(z.baza.plik || z.baza.src);
    if (cz.baza) { usunObraz(bSrc); return; }   // ktoś zdążył zrobić nowe zdjęcie bazowe
    const { plik:bp, ...bReszta } = z.baza;
    cz.baza = { ...bReszta, src:bSrc, img:obrazy.get(bSrc) }; cz.moje.add(bSrc);
    for (const f of z.lista || []) {
      try {
        const fSrc = await wczytajZapisanyObraz(f.plik || f.src);
        const { plik:fp, ...fReszta } = f;
        cz.moje.add(fSrc); cz.lista.push({ ...fReszta, src:fSrc, img:obrazy.get(fSrc) });
      } catch {}
    }
    cz.nr = Math.max(z.nr | 0, ...cz.lista.map(f => f.id + 1), 1);
    czPasek(); if (warstwa === 'czesci') czPokaz();
  } catch {}
});
