'use strict';
/* Twarz z części (wycinanki): robisz zwykłe zdjęcie, z bliska albo z daleka, albo bierzesz je z galerii.
   Na zdjęciu obrysowujesz palcem część ciała (oko, nos, ucho…) i stukasz, co to jest.
   Do wyniku przechodzi tylko obrysowany kawałek: trafia w swoje miejsce na białej kartce z konturem głowy,
   a tam można go przesunąć, powiększyć, obrócić i odbić. Z jednego zdjęcia można wyciąć kilka części.
   Jak w twarz.js wszystko składamy w odcieniach szarości i dopiero gotową całość zamienia się na kropki.
   Wycinki zostają w telefonie (IndexedDB) do naciśnięcia "Wyczyść".
   Warstwy: 'aparat' -> 'wytnij' (obrys na zdjęciu) -> 'czesci' (układanie) -> 'zdjecie' (kropki i Drukuj). */
const CZ_BRZEG = 6 / W;                         // miękki brzeg wycinka: 6 kropek (ok. 0,75 mm), w ułamku szerokości kartki
const WY_MAX = 2400;                            // zdjęcie do wycinania trzymamy większe niż zwykle: z daleka części są małe
const CZ_K = GLOWA.wys / 0.75;                  // jednostka głowy w szerokościach kartki (kartka 3:4)
const KARTKA_H = 1 / 0.75;                      // wysokość kartki w jej szerokościach
/* Miejsca na konturze w jednostkach głowy jak w twarz.js: u = w bok od osi, v = w dół od czubka, w i h = rozmiar.
   Strona "po lewej" to lewa strona wydruku. Wycinek dopasowuje się do swojego miejsca, potem można go zmienić. */
const MIEJSCA = [
  { nazwa:'Włosy', ksztalt:'czapka', u:0, v:.13, w:.86, h:.38 },
  { nazwa:'Oko po lewej', ksztalt:'owal', u:-.17, v:.5, w:.2, h:.12 },
  { nazwa:'Oko po prawej', ksztalt:'owal', u:.17, v:.5, w:.2, h:.12 },
  { nazwa:'Nos', ksztalt:'owal', u:0, v:.62, w:.18, h:.24 },
  { nazwa:'Usta', ksztalt:'owal', u:0, v:.8, w:.3, h:.12 },
  { nazwa:'Broda', ksztalt:'owal', u:0, v:.93, w:.32, h:.13 },
  { nazwa:'Ucho po lewej', ksztalt:'owal', u:-.385, v:.58, w:.11, h:.28 },
  { nazwa:'Ucho po prawej', ksztalt:'owal', u:.385, v:.58, w:.11, h:.28 },
  { nazwa:'Inne', ksztalt:null, u:0, v:.5, w:.3, h:.3 },
];
const RANGA = [1, 5, 5, 4, 3, 2, 0, 0, 6];      // nowy wycinek od spodu: uszy, włosy, broda, usta, nos, oczy, inne na wierzchu
/* lista = wycinki od spodu do wierzchu: {id,src,img,czesc,w,h,ax,ay,pkt,x,y,s,s0,rot,jasnosc,lustro,zr}
   src = prostokąt wycięty ze zdjęcia, pkt = obrys w jego pikselach, ax,ay = środek obrysu,
   zr = {id,m,d}: z którego zdjęcia i jego średnia jasność i rozrzut (do wyrównania zdjęć między sobą),
   x,y = miejsce środka na kartce (w szerokościach kartki), s = szerokość kartki na piksel wycinka, s0 = s na początku.
   zrodlo = zdjęcie, z którego teraz wycinasz (nie zapisuje się w telefonie, zostają tylko wycinki). */
const cz = { lista:[], nr:1, wybrany:null, suwak:'rozmiar', zrodlo:null, obrys:null, rysuje:null, ostatni:null,
  widok:{ z:1, cx:0, cy:0 }, palce:new Map(), gest:null, zWycinania:false, zaplanowane:0, wyZaplanowane:0, zapisT:0, napewno:{} };

const czWycinek = id => cz.lista.find(f => f.id === id) || null;
function czNazwa(f) {                           // "Oko po lewej", a przy drugim takim samym "Oko po lewej 2"
  const te = cz.lista.filter(g => g.czesc === f.czesc).sort((a, b) => a.id - b.id), nr = te.indexOf(f) + 1;
  return MIEJSCA[f.czesc].nazwa + (te.length > 1 ? ` ${nr}` : '');
}
const ileWycinkow = n => `${n} ${n === 1 ? 'wycinek' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'wycinki' : 'wycinków'}`;

/* ======================= APARAT ======================= */
function czPasek() {                            // pasek w aparacie: ile wycinków czeka, Ułóż i Wyczyść
  const widac = !$('foto').hidden && ust.apTryb === 'czesci' && warstwa === 'aparat', n = cz.lista.length;
  $('cz-krok').hidden = !widac;
  if (!widac) return;
  $('cz-krok-rada').textContent = n ? `W pamięci: ${ileWycinkow(n)}. Zrób kolejne zdjęcie albo ułóż.`
    : 'Zrób zdjęcie albo weź je z galerii. Potem obrysujesz palcem nos, oko czy ucho.';
  $('cz-krok-przyciski').hidden = !n;
}
function czZdjecie(src) {                       // zdjęcie ze spustu, aparatu telefonu albo galerii: teraz obrys
  if (warstwa !== 'aparat') { obrazy.delete(src); return; }
  if (cz.zrodlo) obrazy.delete(cz.zrodlo.src);
  const img = obrazy.get(src), k = 96 / Math.max(img.width, img.height), x = platno(Math.round(img.width * k), Math.round(img.height * k));
  x.drawImage(img, 0, 0, x.canvas.width, x.canvas.height);
  const g = szary(x, x.canvas.width, x.canvas.height), m = g.reduce((a, v) => a + v, 0) / g.length;
  const zr = { id:Date.now(), m, d:Math.sqrt(g.reduce((a, v) => a + (v - m) * (v - m), 0) / g.length) };   // jasność całego zdjęcia
  cz.zrodlo = { src, img, zr, obrysy:[] }; cz.obrys = cz.rysuje = cz.ostatni = null;
  cz.widok = { z:1, cx:img.width / 2, cy:img.height / 2 };
  otworzWarstwe('wytnij');
}
function czWarstwa(w) {                         // wywoływane z ustawWarstwe po twWarstwa
  $('wytnij').hidden = w !== 'wytnij'; $('czesci').hidden = w !== 'czesci';
  $('cz-porady').hidden = !(w === 'aparat' && ust.apTryb === 'czesci' && ust.wyPorady);
  czPasek();
  if (w === 'wytnij') { wyPokaz(); wyOdrysuj(); }
  if (w === 'czesci') czPokaz();
  if (!w && cz.zrodlo) { obrazy.delete(cz.zrodlo.src); cz.zrodlo = null; }   // aparat zamknięty: zdjęcie do wycinania już niepotrzebne
}
$('cz-zaczynam').addEventListener('click', () => { ust.wyPorady = false; zapisz(); $('cz-porady').hidden = true; $('ap-spust').focus(); });
$('cz-uloz').addEventListener('click', () => { if (warstwa === 'aparat') { cz.zWycinania = false; otworzWarstwe('czesci'); } });

/* ======================= WYCINANIE: OBRYS PALCEM ======================= */
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
  for (const o of cz.zrodlo.obrysy) {           // to, co już wycięto z tego zdjęcia
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
  const n = cz.lista.length, jest = !!cz.obrys, f = czWycinek(cz.ostatni);
  $('wy-rada').textContent = jest ? 'Teraz stuknij, co obrysowałeś. Możesz też obrysować jeszcze raz.'
    : f ? `Wycięto: ${czNazwa(f)}. Obrysuj następną część albo stuknij Ułóż.`
    : 'Obrysuj palcem część, którą chcesz wyciąć. Dwoma palcami przybliżysz zdjęcie.';
  for (const p of $('wy-czesci').children) p.disabled = !jest;
  $('wy-uloz').textContent = n ? `Ułóż (${n})` : 'Ułóż';
  $('wy-uloz').disabled = !n;
  $('wy-cofnij').disabled = !(cz.zrodlo && cz.zrodlo.obrysy.length);
}
$('wy-czesci').innerHTML = MIEJSCA.map((m, i) => `<button data-czesc="${i}" disabled>${m.nazwa}</button>`).join('');

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

async function czWytnij(pkt, czesc) {           // obrys + nazwa -> nowy wycinek na swoim miejscu
  const img = cz.zrodlo.img;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < pkt.length; i += 2) { x0 = Math.min(x0, pkt[i]); x1 = Math.max(x1, pkt[i]); y0 = Math.min(y0, pkt[i + 1]); y1 = Math.max(y1, pkt[i + 1]); }
  const zap = Math.max(4, 0.03 * Math.max(x1 - x0, y1 - y0));
  const l = Math.max(0, Math.floor(x0 - zap)), g = Math.max(0, Math.floor(y0 - zap));
  const w = Math.max(1, Math.min(img.width, Math.ceil(x1 + zap)) - l), h = Math.max(1, Math.min(img.height, Math.ceil(y1 + zap)) - g);
  const x = platno(w, h); x.drawImage(img, -l, -g);
  const src = x.canvas.toDataURL('image/jpeg', 0.92);
  obrazy.set(src, await createImageBitmap(x.canvas));
  const m = MIEJSCA[czesc], bw = m.w * CZ_K, bh = m.h * GLOWA.wys * KARTKA_H;
  const s = Math.min(bw / Math.max(1, x1 - x0), bh / Math.max(1, y1 - y0));
  const f = { id:cz.nr++, src, img:obrazy.get(src), czesc, w, h, ax:(x0 + x1) / 2 - l, ay:(y0 + y1) / 2 - g,
    pkt:pkt.map((v, i) => Math.round((v - (i % 2 ? g : l)) * 10) / 10),
    x:.5 + m.u * CZ_K, y:(GLOWA.gora + m.v * GLOWA.wys) * KARTKA_H, s, s0:s, rot:0, jasnosc:0, lustro:false, zr:cz.zrodlo.zr };
  let gdzie = cz.lista.length;                  // nad wycinkami niższej lub tej samej rangi
  while (gdzie > 0 && RANGA[cz.lista[gdzie - 1].czesc] > RANGA[czesc]) gdzie--;
  cz.lista.splice(gdzie, 0, f);
  cz.zrodlo.obrysy.push({ id:f.id, pkt, nazwa:czNazwa(f) });
  cz.obrys = null; cz.ostatni = f.id; cz.wybrany = f.id;
  czZapisz(); wyPokaz(); wyOdrysuj();
}
$('wy-czesci').addEventListener('click', e => {
  const p = e.target.closest('[data-czesc]'); if (!p || !cz.obrys || !cz.zrodlo) return;
  czWytnij(cz.obrys, +p.dataset.czesc).catch(() => { $('wy-rada').textContent = 'Nie udało się wyciąć. Spróbuj jeszcze raz.'; });
});
$('wy-cofnij').addEventListener('click', () => {   // cofa ostatni wycinek z tego zdjęcia, obrys wraca do poprawienia
  const o = cz.zrodlo && cz.zrodlo.obrysy[cz.zrodlo.obrysy.length - 1]; if (!o) return;
  czUsun(o.id); cz.obrys = o.pkt; cz.ostatni = null; czZapisz(); wyPokaz(); wyOdrysuj();
});
$('wy-uloz').addEventListener('click', () => { if (warstwa === 'wytnij' && cz.lista.length) { cz.zWycinania = true; otworzWarstwe('czesci'); } });
$('wy-inne').addEventListener('click', () => { if (warstwa === 'wytnij') zamknijWarstwe(); });
$('wy-zamknij').addEventListener('click', () => zamknijWarstwe(2));

/* ======================= SKŁADANIE ======================= */
function ksztalt(x, typ, X, Y, w, h) {          // zarys miejsca (tylko na ekranie, jako podpowiedź)
  if (typ === 'owal') { x.moveTo(X + w, Y + h / 2); x.ellipse(X + w / 2, Y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); return; }
  const P = (a, b) => [X + a * w, Y + b * h];   // czapka: łuk nad głową, dolny brzeg wygięty jak linia włosów
  x.moveTo(...P(0, .95));
  x.bezierCurveTo(...P(0, .15), ...P(.22, 0), ...P(.5, 0));
  x.bezierCurveTo(...P(.78, 0), ...P(1, .15), ...P(1, .95));
  x.bezierCurveTo(...P(.88, .62), ...P(.68, .52), ...P(.5, .58));
  x.bezierCurveTo(...P(.32, .52), ...P(.12, .62), ...P(0, .95));
  x.closePath();
}
function macierz(f, ow) {                       // piksel wycinka -> piksel kartki o szerokości ow
  const k = f.s * ow;
  return new DOMMatrix().translate(f.x * ow, f.y * ow).rotate(f.rot).scale(f.lustro ? -k : k, k).translate(-f.ax, -f.ay);
}
function szary(x, w, h) {                       // odcienie szarości 0..1 z płótna
  const d = x.getImageData(0, 0, w, h).data, g = new Float32Array(w * h);
  for (let i = 0; i < g.length; i++) g[i] = (d[i*4] * 0.299 + d[i*4+1] * 0.587 + d[i*4+2] * 0.114) / 255;
  return g;
}
function czOkno(f, ow, oh, b) {                 // wycinek na kartce: jego obszar, szarości i miękka maska 0..1
  const M = macierz(f, ow);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [a, c] of [[0, 0], [f.w, 0], [0, f.h], [f.w, f.h]]) {
    const p = M.transformPoint({ x:a, y:c }); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(ow, Math.ceil(x1)); y1 = Math.min(oh, Math.ceil(y1));
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0) return null;
  const T = new DOMMatrix().translate(-x0, -y0).multiply(M);
  const xi = platno(w, h); xi.imageSmoothingQuality = 'high'; xi.setTransform(T); xi.drawImage(f.img, 0, 0);
  const xm = platno(w, h); xm.fillStyle = '#000'; xm.fillRect(0, 0, w, h);
  xm.setTransform(T); xm.beginPath(); sciezkaPunktow(xm, f.pkt); xm.closePath(); xm.fillStyle = '#fff'; xm.fill();
  let a;
  if (b) {                                      // brzeg najpierw cofnięty do środka, potem rozmyty: nic spoza obrysu nie wchodzi
    xm.lineWidth = b / (f.s * ow); xm.lineJoin = 'round'; xm.strokeStyle = '#000'; xm.stroke();
    const xb = platno(w, h); xb.fillStyle = '#000'; xb.fillRect(0, 0, w, h);
    xb.filter = `blur(${(b / 3).toFixed(1)}px)`; xb.drawImage(xm.canvas, 0, 0);
    a = szary(xb, w, h);
  } else a = szary(xm, w, h);
  return { x0, y0, w, h, g:szary(xi, w, h), a };
}
function czZloz(ow) {                           // wynik: ImageData w odcieniach szarości, szerokość ow, kartka 3:4
  const oh = Math.round(ow * KARTKA_H), n = ow * oh, b = ust.czMiekki ? CZ_BRZEG * ow : 0;
  const v = new Float32Array(n).fill(1);
  if (ust.czKontur) {                           // kontur głowy szarą kreską na białej kartce
    const x = platno(ow, oh), H = GLOWA.wys * oh, gora = GLOWA.gora * oh, P = (u, w) => [ow / 2 + u * H, gora + w * H];
    x.fillStyle = '#000'; x.fillRect(0, 0, ow, oh);
    x.strokeStyle = '#fff'; x.lineWidth = Math.max(1, 1.6 * ow / W); x.lineCap = x.lineJoin = 'round';
    x.beginPath(); sciezkaKonturu(x, P); x.stroke();
    const L = szary(x, ow, oh);
    for (let i = 0; i < n; i++) if (L[i]) v[i] = v[i] * (1 - L[i]) + 0.12 * L[i];
  }
  const okna = cz.lista.map(f => czOkno(f, ow, oh, b));
  /* Wyrównanie zdjęć: całe zdjęcia (nie pojedyncze wycinki) dostają wspólną jasność i kontrast.
     Wycinki z jednego zdjęcia zmieniają się tak samo, więc ciemne usta zostają ciemniejsze od skóry. */
  const zdj = [...new Map(cz.lista.filter(f => f.zr).map(f => [f.zr.id, f.zr])).values()];
  if (ust.czRownajZdjecia && zdj.length > 1) {
    const M = zdj.reduce((a, s) => a + s.m, 0) / zdj.length, D = zdj.reduce((a, s) => a + s.d, 0) / zdj.length;
    okna.forEach((o, j) => {
      const s = cz.lista[j].zr; if (!o || !s) return;
      const k = s.d > 0.01 ? ogr(D / s.d, 0.8, 1.25) : 1;
      for (let i = 0; i < o.g.length; i++) o.g[i] = (o.g[i] - s.m) * k + M;
    });
  }
  cz.lista.forEach((f, j) => {
    const o = okna[j]; if (!o) return;
    const jas = f.jasnosc / 200;
    for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) {
      const i = y * o.w + x, a = o.a[i]; if (!a) continue;
      const i2 = (o.y0 + y) * ow + o.x0 + x; v[i2] = v[i2] * (1 - a) + ogr(o.g[i] + jas, 0, 1) * a;
    }
  });
  const im = new ImageData(ow, oh), d = im.data;
  for (let i = 0; i < n; i++) { d[i*4] = d[i*4+1] = d[i*4+2] = v[i] * 255; d[i*4+3] = 255; }
  return im;
}

/* ======================= UKŁADANIE ======================= */
const SUWAKI_CZ = { rozmiar:['Rozmiar', 30, 300], obrot:['Obrót', -180, 180], jasnosc:['Jasność', -60, 60] };
function czWartosc(f, k) { return k === 'rozmiar' ? Math.round(f.s / f.s0 * 100) : k === 'obrot' ? Math.round(f.rot) : f.jasnosc; }
const czOpis = (k, v) => k === 'rozmiar' ? `${v}%` : k === 'obrot' ? `${v}°` : `${v}`;
function czPokaz() {
  const f = czWycinek(cz.wybrany); if (!f) cz.wybrany = null;
  $('cz-wybor').innerHTML = wcisk('data-cz="-1"', 'Kartka', !f) + cz.lista.map(g => wcisk(`data-cz="${g.id}"`, czNazwa(g), g === f)).join('');
  const wcis = $('cz-wybor').querySelector('[aria-pressed=true]'); if (wcis) wcis.scrollIntoView({ block:'nearest', inline:'nearest' });
  $('cz-kartka').hidden = !!f; $('cz-ustaw').hidden = !f; $('cz-usun').hidden = !f;
  $('cz-kontur').setAttribute('aria-pressed', !!ust.czKontur);
  $('cz-miekki').setAttribute('aria-pressed', !!ust.czMiekki);
  $('cz-wyrownaj').setAttribute('aria-pressed', !!ust.czRownajZdjecia);
  $('cz-wyrownaj').hidden = new Set(cz.lista.map(f => f.zr && f.zr.id)).size < 2;   // ma sens dopiero przy dwóch zdjęciach
  if (f) {
    for (const p of $('cz-suwaki').querySelectorAll('[data-suwak]')) p.setAttribute('aria-pressed', p.dataset.suwak === cz.suwak);
    $('cz-odbij').setAttribute('aria-pressed', !!f.lustro);
    $('cz-wierzch').disabled = cz.lista[cz.lista.length - 1] === f;
    const [nazwa, min, max] = SUWAKI_CZ[cz.suwak], s = $('cz-suwak'), v = czWartosc(f, cz.suwak);
    $('cz-n-suwak').textContent = nazwa; s.min = min; s.max = max; s.value = v; $('cz-o-suwak').textContent = czOpis(cz.suwak, v);
  }
  $('cz-dodaj').textContent = cz.zWycinania ? 'Wytnij więcej' : 'Nowe zdjęcie';
  $('cz-dalej').disabled = !cz.lista.length;
  $('cz-rada').textContent = !cz.lista.length ? 'Nie ma jeszcze wycinków. Zrób zdjęcie i obrysuj część.'
    : f ? 'Przeciągnij, żeby przesunąć. Dwoma palcami powiększysz i obrócisz.' : 'Dotknij wycinka, żeby go wybrać.';
  czOdrysuj();
}
function czOdrysuj() { if (!cz.zaplanowane) cz.zaplanowane = requestAnimationFrame(() => { cz.zaplanowane = 0; czRysuj(); }); }
function czRysuj() {
  if ($('czesci').hidden) return;
  const c = $('cz-podglad'), pole = c.parentElement, dpr = devicePixelRatio || 1;
  const css = Math.max(60, Math.min(pole.clientWidth - 8, (pole.clientHeight - 8) * 0.75)), H = css * KARTKA_H;
  const im = czZloz(Math.min(576, Math.round(css * dpr)));
  c.width = im.width; c.height = im.height; c.style.width = `${css}px`; c.style.height = `${H}px`;
  const x = c.getContext('2d'); x.putImageData(im, 0, 0);
  const sk = im.width / css; x.setTransform(sk, 0, 0, sk, 0, 0);
  x.save(); x.setLineDash([3, 4]); x.strokeStyle = 'rgba(0,0,0,.3)'; x.lineWidth = 1;   // miejsca bez wycinka: tylko na ekranie
  MIEJSCA.forEach((m, i) => {
    if (!m.ksztalt || cz.lista.some(f => f.czesc === i)) return;
    const w = m.w * CZ_K * css, h = m.h * GLOWA.wys * H, cx = (.5 + m.u * CZ_K) * css, cy = (GLOWA.gora + m.v * GLOWA.wys) * H;
    x.beginPath(); ksztalt(x, m.ksztalt, cx - w / 2, cy - h / 2, w, h); x.stroke();
  });
  x.restore();
  const f = czWycinek(cz.wybrany);
  if (f) {                                      // wybrany wycinek: różowy obrys
    x.save(); x.setTransform(new DOMMatrix().scale(sk).multiply(macierz(f, css)));
    x.beginPath(); sciezkaPunktow(x, f.pkt); x.closePath(); x.restore();
    x.lineJoin = 'round'; x.strokeStyle = '#e8557b'; x.lineWidth = 2.5; x.setLineDash([6, 4]); x.stroke(); x.setLineDash([]);
  }
}
function czTrafiony(px, py, css) {              // który wycinek leży pod palcem (najwyższy na wierzchu)
  const x = pomiar;
  for (let j = cz.lista.length - 1; j >= 0; j--) {
    const f = cz.lista[j], p = macierz(f, css).inverse().transformPoint({ x:px, y:py });
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
function czStartGestu() {                       // stan wycinka i palców na początku ruchu
  const f = czWycinek(cz.wybrany); cz.gest = null; if (!f || !cz.palce.size) return;
  const css = pg.getBoundingClientRect().width;
  if (cz.palce.size === 1) { const [p] = cz.palce.values(); cz.gest = { css, mx:p.x, my:p.y, x:f.x, y:f.y }; }
  else cz.gest = { css, ...czDwaPalce(), x:f.x, y:f.y, s:f.s, rot:f.rot };
}
pg.addEventListener('pointerdown', e => {
  pg.setPointerCapture(e.pointerId); cz.palce.set(e.pointerId, { x:e.clientX, y:e.clientY });
  if (cz.palce.size === 1) {
    const b = pg.getBoundingClientRect(), f = czTrafiony(e.clientX - b.left, e.clientY - b.top, b.width);
    cz.wybrany = f ? f.id : null; czPokaz();
  }
  czStartGestu();
});
pg.addEventListener('pointermove', e => {
  if (!cz.palce.has(e.pointerId)) return;
  cz.palce.set(e.pointerId, { x:e.clientX, y:e.clientY });
  const g = cz.gest, f = czWycinek(cz.wybrany); if (!g || !f) return;
  if (cz.palce.size === 1) {
    const [p] = cz.palce.values();
    f.x = ogr(g.x + (p.x - g.mx) / g.css, -.1, 1.1); f.y = ogr(g.y + (p.y - g.my) / g.css, -.1, KARTKA_H + .1);
  } else {                                      // dwa palce: rozsunięcie = rozmiar, skręt = obrót, środek = przesunięcie
    const t = czDwaPalce();
    f.s = ogr(g.s * t.d / g.d, f.s0 * .3, f.s0 * 3);
    f.rot = ((g.rot + t.kat - g.kat + 540) % 360) - 180;
    f.x = ogr(g.x + (t.mx - g.mx) / g.css, -.1, 1.1); f.y = ogr(g.y + (t.my - g.my) / g.css, -.1, KARTKA_H + .1);
  }
  czOdrysuj();
});
function czPusc(e) {
  if (!cz.palce.delete(e.pointerId)) return;
  czStartGestu();                               // zostaje jeden palec: dalej przesuwa, bez skoku
  if (!cz.palce.size) { czZapisz(); czPokaz(); }
}
for (const t of ['pointerup', 'pointercancel']) pg.addEventListener(t, czPusc);
$('cz-wybor').addEventListener('click', e => { const p = e.target.closest('[data-cz]'); if (p) { cz.wybrany = +p.dataset.cz < 0 ? null : +p.dataset.cz; czPokaz(); } });
$('cz-suwaki').addEventListener('click', e => { const p = e.target.closest('[data-suwak]'); if (p) { cz.suwak = p.dataset.suwak; czPokaz(); } });
$('cz-suwak').addEventListener('input', e => {
  const f = czWycinek(cz.wybrany); if (!f) return;
  const v = +e.target.value;
  if (cz.suwak === 'rozmiar') f.s = f.s0 * v / 100; else if (cz.suwak === 'obrot') f.rot = v; else f.jasnosc = v;
  $('cz-o-suwak').textContent = czOpis(cz.suwak, v); czOdrysuj(); czZapisz();
});
$('cz-odbij').addEventListener('click', () => { const f = czWycinek(cz.wybrany); if (f) { f.lustro = !f.lustro; czZapisz(); czPokaz(); } });
$('cz-wierzch').addEventListener('click', () => {
  const f = czWycinek(cz.wybrany); if (!f) return;
  cz.lista = [...cz.lista.filter(g => g !== f), f]; czZapisz(); czPokaz();
});
for (const [id, klucz] of [['cz-kontur', 'czKontur'], ['cz-miekki', 'czMiekki'], ['cz-wyrownaj', 'czRownajZdjecia']])
  $(id).addEventListener('click', () => { ust[klucz] = !ust[klucz]; zapisz(); czPokaz(); });
function dwaRazy(id, napis, dzialaj) {          // wycinków nie da się przywrócić, więc trzeba dotknąć drugi raz
  $(id).addEventListener('click', () => {
    const p = $(id);
    if (!cz.napewno[id]) { p.textContent = 'Na pewno?'; cz.napewno[id] = setTimeout(() => { cz.napewno[id] = 0; p.textContent = napis; }, 3000); return; }
    clearTimeout(cz.napewno[id]); cz.napewno[id] = 0; p.textContent = napis;
    dzialaj();
  });
}
function czUsun(id) {
  const f = czWycinek(id); if (!f) return;
  obrazy.delete(f.src); cz.lista = cz.lista.filter(g => g !== f);
  if (cz.wybrany === id) cz.wybrany = null;
  if (cz.zrodlo) cz.zrodlo.obrysy = cz.zrodlo.obrysy.filter(o => o.id !== id);
}
function czWyczysc() {                          // wszystko od nowa: wycinki, zdjęcie do wycinania i pamięć telefonu
  for (const f of cz.lista) obrazy.delete(f.src);
  cz.lista = []; cz.wybrany = cz.obrys = cz.rysuje = cz.ostatni = null;
  if (cz.zrodlo) { obrazy.delete(cz.zrodlo.src); cz.zrodlo = null; }
  czZapiszTeraz();
}
const czGlebia = () => cz.zWycinania ? 3 : 2;   // ile kroków Wstecz z układania zamyka cały aparat
dwaRazy('cz-usun', 'Usuń', () => { if (cz.wybrany === null) return; czUsun(cz.wybrany); czZapisz(); czPokaz(); });
dwaRazy('cz-wyczysc', 'Wyczyść', () => { czWyczysc(); zamknijWarstwe(czGlebia() - 1); });   // z powrotem do aparatu
dwaRazy('cz-wyczysc2', 'Wyczyść', () => { czWyczysc(); czPasek(); });
$('cz-dodaj').addEventListener('click', () => { if (warstwa === 'czesci') zamknijWarstwe(); });   // do wycinania albo do aparatu
$('cz-zamknij').addEventListener('click', () => zamknijWarstwe(czGlebia()));
$('cz-dalej').addEventListener('click', async () => {
  if (!cz.lista.length) return;
  const im = czZloz(2 * W), x = platno(im.width, im.height);   // dwa piksele na kropkę: kropki liczy potem rdzen.js
  x.putImageData(im, 0, 0);
  const src = x.canvas.toDataURL('image/jpeg', 0.9);
  obrazy.set(src, await createImageBitmap(x.canvas));
  apPokaz(src, 'Twarz z części');
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
    if (cz.lista.length) s.put({ lista:cz.lista.map(({ img, ...reszta }) => reszta), nr:cz.nr }, 'wycinki');
    else s.delete('wycinki');                   // "Wyczyść": w telefonie nic nie zostaje
    s.delete('ostatni');                        // zdjęcia z wersji 0.5 (otwory) nie są już potrzebne
    t.oncomplete = () => db.close();
  } catch (e) { log(`Części: nie zapisano (${e.name})`); }
}
document.addEventListener('visibilitychange', () => { if (document.hidden && cz.zapisT) czZapiszTeraz(); });
addEventListener('DOMContentLoaded', async () => {   // po wszystkich skryptach, bo wczytajSrc jest w ekran.js
  try {
    const db = await czBaza();
    const z = await new Promise((ok, zle) => { const r = db.transaction('stan').objectStore('stan').get('wycinki'); r.onsuccess = () => ok(r.result); r.onerror = () => zle(r.error); });
    db.close();
    if (!z || cz.lista.length) return;
    for (const f of z.lista || []) { try { await wczytajSrc(f.src); cz.lista.push({ ...f, img:obrazy.get(f.src) }); } catch {} }
    cz.nr = Math.max(z.nr | 0, ...cz.lista.map(f => f.id + 1), 1);
    czPasek();
  } catch {}
});
