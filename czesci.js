'use strict';
/* Twarz z części: nieobowiązkowa baza (całe zdjęcie twarzy), na niej półprzezroczysta biała kartka z konturem głowy
   i otworami, a w otworach części z osobnych zdjęć: włosy, oczy, nos, usta, broda, uszy.
   Każdą część fotografuje się z bliska, w ramce o kształcie jej otworu, więc ma dużo szczegółów.
   Jak w twarz.js wszystko składamy w odcieniach szarości i dopiero gotową całość zamienia się na kropki.
   Zdjęcia i ustawienia części zostają w telefonie (IndexedDB) do naciśnięcia "Od nowa".
   Warstwy: 'aparat' (obraz na żywo) -> 'czesci' (dopasowanie) -> 'zdjecie' (kropki i Drukuj). */
const CZ_BRZEG = 16 / W;                        // miękki brzeg otworu: 16 kropek (2 mm), w ułamku szerokości ramki
const CZ_K = GLOWA.wys / 0.75;                  // jednostka głowy w ułamku szerokości ramki (ramka 3:4)
/* Otwory w jednostkach głowy jak kontur w twarz.js: u = w bok od osi, v = w dół od czubka, w i h = rozmiar.
   Strona "po lewej" to lewa strona wydruku. */
const MIEJSCA = [
  { nazwa:'Włosy', ksztalt:'czapka', u:0, v:.13, w:.86, h:.38, rada:'Włosy wypełniają łuk, linia włosów na jego dolnym brzegu.' },
  { nazwa:'Oko po lewej', ksztalt:'owal', u:-.17, v:.5, w:.2, h:.12, rada:'Oko na środku owalu, kąciki prawie przy brzegach.' },
  { nazwa:'Oko po prawej', ksztalt:'owal', u:.17, v:.5, w:.2, h:.12, rada:'Oko na środku owalu, kąciki prawie przy brzegach.' },
  { nazwa:'Nos', ksztalt:'owal', u:0, v:.62, w:.18, h:.24, rada:'Nasada nosa u góry, nozdrza tuż nad dolnym brzegiem.' },
  { nazwa:'Usta', ksztalt:'owal', u:0, v:.8, w:.3, h:.12, rada:'Kąciki ust prawie przy bokach owalu.' },
  { nazwa:'Broda', ksztalt:'owal', u:0, v:.93, w:.32, h:.13, rada:'Broda na środku, jej dół przy dolnym brzegu.' },
  { nazwa:'Ucho po lewej', ksztalt:'owal', u:-.385, v:.58, w:.11, h:.28, rada:'Zdjęcie z boku głowy, całe ucho w owalu.' },
  { nazwa:'Ucho po prawej', ksztalt:'owal', u:.385, v:.58, w:.11, h:.28, rada:'Zdjęcie z boku głowy, całe ucho w owalu.' },
];
const KOLEJNOSC = [6, 7, 0, 5, 4, 3, 1, 2];     // od spodu: uszy, włosy, broda, usta, nos, oczy na wierzchu
const KROKI = 1 + MIEJSCA.length;               // krok 0 = baza, kroki 1..8 = części
/* zdj[0] = baza {src,img,rama,dx,dy,s,jasnosc}; zdj[1..8] = części, dodatkowo ox,oy (przesunięcie otworu) i r (jego rozmiar);
   dx,dy,s części = położenie i powiększenie zdjęcia w otworze. wybrany: -1 kartka, 0 baza, 1..8 część. */
const cz = { zdj:Array(KROKI).fill(null), krok:0, wybrany:-1, powrot:false, ruch:'czesc', chwyt:null, zaplanowane:0, zapisT:0, napewno:{} };

/* ======================= KSZTAŁTY I MIEJSCA ======================= */
function ksztalt(x, typ, X, Y, w, h) {          // dokłada kształt otworu do bieżącej ścieżki
  if (typ === 'owal') { x.moveTo(X + w, Y + h / 2); x.ellipse(X + w / 2, Y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); return; }
  const P = (a, b) => [X + a * w, Y + b * h];   // czapka: łuk nad głową, dolny brzeg wygięty jak linia włosów
  x.moveTo(...P(0, .95));
  x.bezierCurveTo(...P(0, .15), ...P(.22, 0), ...P(.5, 0));
  x.bezierCurveTo(...P(.78, 0), ...P(1, .15), ...P(1, .95));
  x.bezierCurveTo(...P(.88, .62), ...P(.68, .52), ...P(.5, .58));
  x.bezierCurveTo(...P(.32, .52), ...P(.12, .62), ...P(0, .95));
  x.closePath();
}
function miejsce(i, X, Y, FW, FH) {             // prostokąt otworu i-tej części w ramce X,Y,FW,FH (z jej przesunięciem i rozmiarem)
  const m = MIEJSCA[i], f = cz.zdj[i + 1], r = f ? f.r : 1;
  const cx = X + (0.5 + m.u * CZ_K + (f ? f.ox : 0)) * FW, cy = Y + (GLOWA.gora + m.v * GLOWA.wys + (f ? f.oy : 0)) * FH;
  const w = m.w * CZ_K * FW * r, h = m.h * GLOWA.wys * FH * r;
  return { x:cx - w / 2, y:cy - h / 2, w, h };
}
function czRama(w, h, krok = cz.krok) {         // ramka zdjęcia w ułamkach obrazu: dla bazy 3:4, dla części kształt jej otworu
  if (krok === 0) return ramaDla(w, h);
  const m = MIEJSCA[krok - 1], a = m.w / m.h, fw = Math.min(w * .82, h * .82 * a), fh = fw / a;
  return { x:(w - fw) / 2 / w, y:(h - fh) / 2 / h, w:fw / w, h:fh / h };
}

/* ======================= OBRAZ NA ŻYWO ======================= */
function rysujMape(x, X, Y, FW, FH) {           // mała mapka szablonu: który otwór teraz wypełniasz
  x.save();
  x.fillStyle = 'rgba(20,23,26,.75)'; x.beginPath(); x.roundRect(X - 6, Y - 6, FW + 12, FH + 12, 10); x.fill();
  const H = GLOWA.wys * FH, gora = Y + GLOWA.gora * FH, cx = X + FW / 2, P = (u, v) => [cx + u * H, gora + v * H];
  x.strokeStyle = 'rgba(255,255,255,.7)'; x.lineWidth = 1.2; x.beginPath(); sciezkaKonturu(x, P); x.stroke();
  for (let i = 0; i < MIEJSCA.length; i++) {
    const r = miejsce(i, X, Y, FW, FH);
    x.beginPath(); ksztalt(x, MIEJSCA[i].ksztalt, r.x, r.y, r.w, r.h);
    x.fillStyle = i + 1 === cz.krok ? '#e8557b' : cz.zdj[i + 1] ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.08)';
    x.fill(); x.stroke();
  }
  if (cz.krok === 0) { x.strokeStyle = '#e8557b'; x.lineWidth = 2.5; x.strokeRect(X - 2, Y - 2, FW + 4, FH + 4); }
  x.restore();
}
function czNakladka() {
  const c = $('cz-nakladka'), v = $('ap-wideo');
  const wlaczona = !$('foto').hidden && ust.apTryb === 'czesci' && warstwa === 'aparat';
  c.hidden = $('cz-krok').hidden = !wlaczona;
  if (!wlaczona) return;
  czPokazKrok();
  const pole = c.parentElement, dpr = devicePixelRatio || 1, cw = pole.clientWidth, ch = pole.clientHeight;
  c.width = Math.max(1, Math.round(cw * dpr)); c.height = Math.max(1, Math.round(ch * dpr));
  c.classList.toggle('lustro', ap.kier === 'user');
  const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!v.videoWidth) return;
  const s = Math.min(cw / v.videoWidth, ch / v.videoHeight), vw = v.videoWidth * s, vh = v.videoHeight * s;
  const vx = (cw - vw) / 2, vy = (ch - vh) / 2, r = czRama(v.videoWidth, v.videoHeight);
  const X = vx + r.x * vw, Y = vy + r.y * vh, FW = r.w * vw, FH = r.h * vh;
  const sciezka = () => { if (cz.krok === 0) x.rect(X, Y, FW, FH); else ksztalt(x, MIEJSCA[cz.krok - 1].ksztalt, X, Y, FW, FH); };
  x.fillStyle = cz.krok === 0 ? 'rgba(0,0,0,.35)' : 'rgba(0,0,0,.5)';   // poza ramką nic nie wejdzie do wydruku
  x.beginPath(); x.rect(vx, vy, vw, vh); sciezka(); x.fill('evenodd');
  if (cz.krok === 0) {                          // baza: kontur jak w twarzy z trzech i zarysy otworów
    rysujKontur(x, X, Y, FW, FH);
    x.save(); x.setLineDash([4, 5]); x.strokeStyle = 'rgba(255,255,255,.7)'; x.lineWidth = 1.2;
    for (let i = 0; i < MIEJSCA.length; i++) { const m = miejsce(i, X, Y, FW, FH); x.beginPath(); ksztalt(x, MIEJSCA[i].ksztalt, m.x, m.y, m.w, m.h); x.stroke(); }
    x.restore();
  } else {
    x.save(); x.lineJoin = 'round';
    for (const [kolor, gr] of [['rgba(0,0,0,.55)', 4], ['#fff', 2]]) { x.strokeStyle = kolor; x.lineWidth = gr; x.beginPath(); sciezka(); x.stroke(); }
    x.restore();
  }
  const mh = Math.min(ch * .24, 140), mw = mh * .75;
  rysujMape(x, cw - mw - 14, ch - mh - 14, mw, mh);
}
function czPokazKrok() {
  const k = cz.krok, nazwa = k === 0 ? 'Baza: cała twarz' : MIEJSCA[k - 1].nazwa;
  $('cz-krok-nr').textContent = `${k + 1} z ${KROKI} · ${nazwa}`;
  $('cz-krok-rada').textContent = k === 0 ? 'Policzki przy konturze. Bazę można pominąć, wtedy pod kartką jest biel.' : MIEJSCA[k - 1].rada;
  $('cz-wstecz').disabled = k === 0;
  $('cz-pomin').textContent = cz.powrot ? 'Zostaw' : k === 0 ? 'Bez bazy' : 'Pomiń';
}
function czNaKrok(k) { cz.krok = ogr(k, 0, KROKI - 1); czZapisz(); czNakladka(); }
$('cz-wstecz').addEventListener('click', () => { if (warstwa === 'aparat') { cz.powrot = false; czNaKrok(cz.krok - 1); } });
$('cz-pomin').addEventListener('click', () => {
  if (warstwa !== 'aparat') return;
  if (cz.powrot || cz.krok === KROKI - 1) { cz.powrot = false; otworzWarstwe('czesci'); return; }
  czNaKrok(cz.krok + 1);
});
$('cz-gotowe').addEventListener('click', () => { if (warstwa === 'aparat') { cz.powrot = false; otworzWarstwe('czesci'); } });

function czUsun(i) { if (cz.zdj[i]) obrazy.delete(cz.zdj[i].src); cz.zdj[i] = null; }
function czUjecie(src, rama) {                  // zdjęcie bieżącego kroku (spust, aparat telefonu albo galeria)
  if (warstwa !== 'aparat') { obrazy.delete(src); return; }
  czUsun(cz.krok);
  cz.zdj[cz.krok] = { src, img:obrazy.get(src), rama, dx:0, dy:0, s:1, ox:0, oy:0, r:1, jasnosc:0 };
  cz.wybrany = cz.krok;
  if (cz.powrot || cz.krok === KROKI - 1) { cz.powrot = false; czZapisz(); otworzWarstwe('czesci'); return; }
  czNaKrok(cz.krok + 1);
  if (!ap.strumien) apUruchom();               // po aparacie telefonu albo galerii wraca obraz na żywo
}
function czZPliku(src) { const img = obrazy.get(src); czUjecie(src, czRama(img.width, img.height)); }
function czWyczysc() { for (let i = 0; i < KROKI; i++) czUsun(i); cz.krok = 0; cz.wybrany = -1; cz.powrot = false; czZapisz(); }

function czWarstwa(w) {                         // wywoływane z ustawWarstwe po twWarstwa
  const t = ust.apTryb === 'czesci';
  $('czesci').hidden = w !== 'czesci';
  $('cz-porady').hidden = !(w === 'aparat' && t && ust.czPorady);
  czNakladka();
  if (w === 'czesci') czPokaz();
}
$('cz-zaczynam').addEventListener('click', () => { ust.czPorady = false; zapisz(); $('cz-porady').hidden = true; $('ap-spust').focus(); });
for (const t of ['loadedmetadata', 'resize']) $('ap-wideo').addEventListener(t, czNakladka);
new ResizeObserver(czNakladka).observe($('cz-nakladka').parentElement);

/* ======================= SKŁADANIE ======================= */
function szary(x, w, h) {                       // odcienie szarości 0..1 z płótna
  const d = x.getImageData(0, 0, w, h).data, g = new Float32Array(w * h);
  for (let i = 0; i < g.length; i++) g[i] = (d[i*4] * 0.299 + d[i*4+1] * 0.587 + d[i*4+2] * 0.114) / 255;
  return g;
}
function okno(i, ow, oh, b) {                   // otwór i-tej części: obszar na wydruku i miękka maska 0..1
  const r = miejsce(i, 0, 0, ow, oh), zap = Math.ceil(b * 1.5) + 2;
  const x0 = Math.max(0, Math.floor(r.x - zap)), y0 = Math.max(0, Math.floor(r.y - zap));
  const x1 = Math.min(ow, Math.ceil(r.x + r.w + zap)), y1 = Math.min(oh, Math.ceil(r.y + r.h + zap));
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0) return null;
  const x = platno(w, h); x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
  if (b) x.filter = `blur(${(b / 2).toFixed(1)}px)`;
  x.fillStyle = '#fff'; x.beginPath(); ksztalt(x, MIEJSCA[i].ksztalt, r.x - x0, r.y - y0, r.w, r.h); x.fill();
  return { r, x0, y0, w, h, a:szary(x, w, h) };
}
function czWyrownaj(g, o, baza, ow) {           // część dostaje jasność i kontrast bazy w tym samym miejscu
  let n = 0, sa = 0, sb = 0, qa = 0, qb = 0;
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) {
    const i = y * o.w + x; if (o.a[i] < .5) continue;
    const a = baza[(o.y0 + y) * ow + o.x0 + x], b = g[i];
    sa += a; sb += b; qa += a * a; qb += b * b; n++;
  }
  if (n < 20) return;
  const ma = sa / n, mb = sb / n, da = Math.sqrt(Math.max(0, qa / n - ma * ma)), db = Math.sqrt(Math.max(0, qb / n - mb * mb));
  const k = db > 0.01 ? ogr(da / db, 0.8, 1.25) : 1;
  for (let i = 0; i < g.length; i++) g[i] = (g[i] - mb) * k + ma;
}
function czZloz(ow) {                           // wynik: ImageData w odcieniach szarości, szerokość ow, proporcje ramki 3:4
  const oh = Math.round(ow / 0.75), n = ow * oh, b = ust.czMiekki ? CZ_BRZEG * ow : 0, baza = cz.zdj[0];
  let v = new Float32Array(n).fill(1), bazaG = null;
  if (baza) {
    const x = platno(ow, oh); x.imageSmoothingQuality = 'high'; rysujFragment(x, baza, 0, 0, ow, oh);
    bazaG = szary(x, ow, oh); const o = baza.jasnosc / 200; if (o) for (let i = 0; i < n; i++) bazaG[i] += o;
    v = Float32Array.from(bazaG);
  }
  const okna = MIEJSCA.map((m, i) => okno(i, ow, oh, b));
  const U = new Float32Array(n);               // wszystkie otwory kartki razem
  for (const o of okna) if (o) for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) {
    const i = (o.y0 + y) * ow + o.x0 + x, a = o.a[y * o.w + x]; if (a > U[i]) U[i] = a;
  }
  const k = ust.czKrycie / 100;                 // biała kartka
  if (k) for (let i = 0; i < n; i++) { const s = k * (1 - U[i]); v[i] = v[i] * (1 - s) + s; }
  if (ust.czKontur) {                           // kontur narysowany na kartce, w otworach go nie ma
    const x = platno(ow, oh), H = GLOWA.wys * oh, gora = GLOWA.gora * oh, P = (u, w) => [ow / 2 + u * H, gora + w * H];
    x.fillStyle = '#000'; x.fillRect(0, 0, ow, oh);
    x.strokeStyle = '#fff'; x.lineWidth = Math.max(1, 1.6 * ow / W); x.lineCap = x.lineJoin = 'round';
    x.beginPath(); sciezkaKonturu(x, P); x.stroke();
    const L = szary(x, ow, oh);
    for (let i = 0; i < n; i++) { const l = L[i] * (1 - U[i]); if (l) v[i] = v[i] * (1 - l) + 0.12 * l; }
  }
  for (const i of KOLEJNOSC) {                  // części w otworach
    const f = cz.zdj[i + 1], o = okna[i]; if (!f || !o) continue;
    const x = platno(o.w, o.h); x.imageSmoothingQuality = 'high';
    rysujFragment(x, f, o.r.x - o.x0, o.r.y - o.y0, o.r.w, o.r.h);
    const g = szary(x, o.w, o.h);
    if (bazaG && ust.czWyrownaj) czWyrownaj(g, o, bazaG, ow);
    const jas = f.jasnosc / 200;
    for (let y = 0; y < o.h; y++) for (let xx = 0; xx < o.w; xx++) {
      const j = y * o.w + xx, a = o.a[j]; if (!a) continue;
      const i2 = (o.y0 + y) * ow + o.x0 + xx; v[i2] = v[i2] * (1 - a) + (g[j] + jas) * a;
    }
  }
  const im = new ImageData(ow, oh), d = im.data;
  for (let i = 0; i < n; i++) { d[i*4] = d[i*4+1] = d[i*4+2] = v[i] * 255; d[i*4+3] = 255; }
  return im;
}

/* ======================= DOPASOWANIE ======================= */
const czWybrany = () => cz.wybrany >= 0 ? cz.zdj[cz.wybrany] : null;
function czPokaz() {
  const wybory = [[-1, 'Kartka'], ...(cz.zdj[0] ? [[0, 'Baza']] : []), ...MIEJSCA.map((m, i) => [i + 1, m.nazwa]).filter(([i]) => cz.zdj[i])];
  if (!wybory.some(([i]) => i === cz.wybrany)) cz.wybrany = -1;
  $('cz-wybor').innerHTML = wybory.map(([i, t]) => wcisk(`data-cz="${i}"`, t, i === cz.wybrany)).join('');
  const wcis = $('cz-wybor').querySelector('[aria-pressed=true]'); if (wcis) wcis.scrollIntoView({ block:'nearest', inline:'nearest' });
  const kartka = cz.wybrany < 0, czesc = cz.wybrany > 0, f = czWybrany();
  $('cz-kartka').hidden = !kartka; $('cz-ustaw').hidden = kartka; $('cz-usun').hidden = kartka;
  $('cz-krycie').value = ust.czKrycie; $('cz-o-krycie').textContent = `${ust.czKrycie}%`;
  $('cz-kontur').setAttribute('aria-pressed', !!ust.czKontur);
  $('cz-miekki').setAttribute('aria-pressed', !!ust.czMiekki);
  $('cz-wyrownaj').setAttribute('aria-pressed', !!ust.czWyrownaj && !!cz.zdj[0]); $('cz-wyrownaj').disabled = !cz.zdj[0];
  if (f) {
    const wOtworze = czesc && cz.ruch === 'zdjecie';   // jeden suwak naraz, żeby podgląd był większy
    $('cz-ruch').hidden = !czesc; $('cz-pole-zoom').hidden = !wOtworze; $('cz-pole-rozmiar').hidden = wOtworze;
    for (const p of $('cz-ruch').children) p.setAttribute('aria-pressed', p.dataset.ruch === cz.ruch);
    const roz = $('cz-rozmiar'), s = czesc ? f.r : f.s;
    roz.min = czesc ? 50 : 70; roz.max = czesc ? 200 : 140; roz.value = Math.round(s * 100);
    $('cz-o-rozmiar').textContent = `${Math.round(s * 100)}%`;
    $('cz-zoom').value = Math.round(f.s * 100); $('cz-o-zoom').textContent = `${Math.round(f.s * 100)}%`;
    $('cz-jasnosc').value = f.jasnosc; $('cz-o-jasnosc').textContent = f.jasnosc;
  }
  $('cz-powtorz').textContent = kartka ? 'Więcej zdjęć' : 'Zrób ponownie';
  $('cz-rada').textContent = kartka ? 'Dotknij części na podglądzie, żeby ją wybrać.'
    : !czesc ? 'Przeciągnij, żeby przesunąć bazę pod kartką.'
    : cz.ruch === 'zdjecie' ? 'Przeciągnij, żeby przesunąć zdjęcie w otworze.' : 'Przeciągnij część, żeby przesunąć ją razem z otworem.';
  czOdrysuj();
}
function czOdrysuj() { if (!cz.zaplanowane) cz.zaplanowane = requestAnimationFrame(() => { cz.zaplanowane = 0; czRysuj(); }); }
function czRysuj() {
  if ($('czesci').hidden) return;
  const c = $('cz-podglad'), pole = c.parentElement, dpr = devicePixelRatio || 1;
  const css = Math.max(60, Math.min(pole.clientWidth - 8, (pole.clientHeight - 8) * 0.75)), H = css / 0.75;
  const im = czZloz(Math.min(576, Math.round(css * dpr)));
  c.width = im.width; c.height = im.height; c.style.width = `${css}px`; c.style.height = `${H}px`;
  const x = c.getContext('2d'); x.putImageData(im, 0, 0);
  x.setTransform(im.width / css, 0, 0, im.width / css, 0, 0);
  x.save(); x.setLineDash([3, 4]); x.strokeStyle = 'rgba(0,0,0,.3)'; x.lineWidth = 1;   // puste otwory: tylko na ekranie
  for (let i = 0; i < MIEJSCA.length; i++) if (!cz.zdj[i + 1]) { const r = miejsce(i, 0, 0, css, H); x.beginPath(); ksztalt(x, MIEJSCA[i].ksztalt, r.x, r.y, r.w, r.h); x.stroke(); }
  x.restore();
  x.strokeStyle = '#e8557b'; x.lineWidth = 3;
  if (cz.wybrany === 0) x.strokeRect(1.5, 1.5, css - 3, H - 3);
  else if (cz.wybrany > 0) { const r = miejsce(cz.wybrany - 1, 0, 0, css, H); x.beginPath(); ksztalt(x, MIEJSCA[cz.wybrany - 1].ksztalt, r.x, r.y, r.w, r.h); x.stroke(); }
}
function czTrafiona(px, py, css, H) {           // która część leży pod palcem (najwyższa na wierzchu)
  const x = pomiar;
  for (let k = KOLEJNOSC.length - 1; k >= 0; k--) {
    const i = KOLEJNOSC[k]; if (!cz.zdj[i + 1]) continue;
    const r = miejsce(i, 0, 0, css, H); x.beginPath(); ksztalt(x, MIEJSCA[i].ksztalt, r.x, r.y, r.w, r.h);
    if (x.isPointInPath(px, py)) return i + 1;
  }
  return cz.zdj[0] ? 0 : null;
}
$('cz-podglad').addEventListener('pointerdown', e => {
  const c = $('cz-podglad'), b = c.getBoundingClientRect(), px = e.clientX - b.left, py = e.clientY - b.top;
  const t = czTrafiona(px, py, b.width, b.height); if (t === null) return;
  cz.wybrany = t;
  const f = cz.zdj[t], czesc = t > 0, wZdjeciu = czesc && cz.ruch === 'zdjecie';
  const r = czesc ? miejsce(t - 1, 0, 0, b.width, b.height) : { w:b.width, h:b.height };
  cz.chwyt = { x:e.clientX, y:e.clientY, a:wZdjeciu || !czesc ? f.dx : f.ox, b:wZdjeciu || !czesc ? f.dy : f.oy,
    w:wZdjeciu ? r.w : b.width, h:wZdjeciu ? r.h : b.height, pola:wZdjeciu || !czesc ? ['dx', 'dy'] : ['ox', 'oy'] };
  c.setPointerCapture(e.pointerId); czPokaz();
});
$('cz-podglad').addEventListener('pointermove', e => {
  const ch = cz.chwyt, f = czWybrany(); if (!ch || !f) return;
  f[ch.pola[0]] = ogr(ch.a + (e.clientX - ch.x) / ch.w, -.5, .5);
  f[ch.pola[1]] = ogr(ch.b + (e.clientY - ch.y) / ch.h, -.5, .5);
  czOdrysuj();
});
for (const t of ['pointerup', 'pointercancel']) $('cz-podglad').addEventListener(t, () => { if (cz.chwyt) { cz.chwyt = null; czZapisz(); } });
$('cz-wybor').addEventListener('click', e => { const p = e.target.closest('[data-cz]'); if (p) { cz.wybrany = +p.dataset.cz; czPokaz(); } });
$('cz-ruch').addEventListener('click', e => { const p = e.target.closest('[data-ruch]'); if (p) { cz.ruch = p.dataset.ruch; czPokaz(); } });
$('cz-rozmiar').addEventListener('input', e => {
  const f = czWybrany(); if (!f) return;
  f[cz.wybrany > 0 ? 'r' : 's'] = +e.target.value / 100; $('cz-o-rozmiar').textContent = `${e.target.value}%`; czOdrysuj(); czZapisz();
});
$('cz-zoom').addEventListener('input', e => { const f = czWybrany(); if (!f) return; f.s = +e.target.value / 100; $('cz-o-zoom').textContent = `${e.target.value}%`; czOdrysuj(); czZapisz(); });
$('cz-jasnosc').addEventListener('input', e => { const f = czWybrany(); if (!f) return; f.jasnosc = +e.target.value; $('cz-o-jasnosc').textContent = f.jasnosc; czOdrysuj(); czZapisz(); });
$('cz-krycie').addEventListener('input', e => { ust.czKrycie = +e.target.value; $('cz-o-krycie').textContent = `${ust.czKrycie}%`; zapisz(); czOdrysuj(); });
for (const [id, klucz] of [['cz-kontur', 'czKontur'], ['cz-miekki', 'czMiekki'], ['cz-wyrownaj', 'czWyrownaj']])
  $(id).addEventListener('click', () => { ust[klucz] = !ust[klucz]; zapisz(); czPokaz(); });
function dwaRazy(id, napis, dzialaj) {          // zdjęć nie da się przywrócić, więc trzeba dotknąć drugi raz
  $(id).addEventListener('click', () => {
    const p = $(id);
    if (!cz.napewno[id]) { p.textContent = 'Na pewno?'; cz.napewno[id] = setTimeout(() => { cz.napewno[id] = 0; p.textContent = napis; }, 3000); return; }
    clearTimeout(cz.napewno[id]); cz.napewno[id] = 0; p.textContent = napis;
    dzialaj();
  });
}
dwaRazy('cz-usun', 'Usuń', () => { if (cz.wybrany < 0) return; czUsun(cz.wybrany); cz.wybrany = -1; czZapisz(); czPokaz(); });
dwaRazy('cz-od-nowa', 'Od nowa', () => { czWyczysc(); zamknijWarstwe(); });
$('cz-powtorz').addEventListener('click', () => {   // Wstecz do aparatu, z wybraną częścią do zrobienia
  if (cz.wybrany >= 0) { cz.krok = cz.wybrany; cz.powrot = true; }
  else { const brak = cz.zdj.findIndex(f => !f); cz.krok = brak < 0 ? 0 : brak; cz.powrot = false; }
  czZapisz(); zamknijWarstwe();
});
$('cz-zamknij').addEventListener('click', () => zamknijWarstwe(2));
$('cz-dalej').addEventListener('click', async () => {
  const im = czZloz(2 * W), x = platno(im.width, im.height);   // dwa piksele na kropkę: kropki liczy potem rdzen.js
  x.putImageData(im, 0, 0);
  const src = x.canvas.toDataURL('image/jpeg', 0.9);
  obrazy.set(src, await createImageBitmap(x.canvas));
  apPokaz(src, 'Twarz z części');
});
new ResizeObserver(czOdrysuj).observe($('cz-podglad').parentElement);

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
  clearTimeout(cz.zapisT);
  try {
    const db = await czBaza(), t = db.transaction('stan', 'readwrite');
    t.objectStore('stan').put({ zdj:cz.zdj.map(f => { if (!f) return null; const { img, ...reszta } = f; return reszta; }), krok:cz.krok }, 'ostatni');
    t.oncomplete = () => db.close();
  } catch (e) { log(`Części: nie zapisano (${e.name})`); }
}
document.addEventListener('visibilitychange', () => { if (document.hidden && cz.zapisT) czZapiszTeraz(); });
addEventListener('DOMContentLoaded', async () => {   // po wszystkich skryptach, bo wczytajSrc jest w ekran.js
  try {
    const db = await czBaza();
    const z = await new Promise((ok, zle) => { const r = db.transaction('stan').objectStore('stan').get('ostatni'); r.onsuccess = () => ok(r.result); r.onerror = () => zle(r.error); });
    db.close();
    if (!z) return;
    for (let i = 0; i < KROKI; i++) {
      const f = z.zdj[i]; if (!f || cz.zdj[i]) continue;
      try { await wczytajSrc(f.src); cz.zdj[i] = { ...f, img:obrazy.get(f.src) }; } catch {}
    }
    cz.krok = ogr(z.krok | 0, 0, KROKI - 1);
    czNakladka();
  } catch {}
});
