'use strict';
/* Twarz z trzech zdjęć: czoło z 1., oczy i nos z 2., usta i broda z 3.
   Na obrazie z aparatu leży kontur głowy w ramce 3:4. Ramka to dokładnie to, co pójdzie na papier,
   więc zamrożone poprzednie zdjęcia widać w tym samym miejscu, w którym znajdą się na wydruku.
   Fragmenty składamy w odcieniach szarości (szew, wyrównanie jasności) i dopiero całość zamienia się
   na kropki w rdzen.js. Gdyby składać gotowe kropki, na szwie urwałby się ich układ.
   Warstwy: 'aparat' (obraz na żywo z konturem) -> 'twarz' (dopasowanie) -> 'zdjecie' (kropki i Drukuj). */
const GLOWA = { gora:0.06, wys:0.80 };                       // czubek głowy i wysokość głowy, w ułamkach wysokości ramki
const SZEW = [GLOWA.gora + 0.40 * GLOWA.wys, GLOWA.gora + 0.74 * GLOWA.wys];   // tuż nad brwiami; między nosem a wargą
const ZAKLADKA = 24 / W;                                     // miękki szew: 24 kropki na papierze (ok. 3 mm), w ułamku szerokości ramki
const CZESCI = [
  ['Czoło', 'Czubek głowy przy górze konturu, brwi tuż pod kreską.'],
  ['Oczy i nos', 'Brwi tuż pod górną kreską, koniec nosa nad dolną.'],
  ['Usta i broda', 'Nos tuż nad kreską, broda na dole konturu.'],
];
const tw = { zdj:[null, null, null], krok:0, wybrany:0, chwyt:null, zaplanowane:0, napewno:0 };

/* ======================= RAMKA I KONTUR ======================= */
function ramaDla(w, h) {                       // największa ramka 3:4 na środku obrazu, z małym marginesem; w ułamkach obrazu
  const fh = Math.min(h, w / 0.75) * 0.94, fw = fh * 0.75;
  return { x:(w - fw) / 2 / w, y:(h - fh) / 2 / h, w:fw / w, h:fh / h };
}
function rysujFragment(x, f, X, Y, FW, FH) {   // ramka zdjęcia f trafia w prostokąt X,Y,FW,FH; potem przesunięcie i rozmiar
  const iw = f.img.width, ih = f.img.height, r = f.rama, k = FW / (r.w * iw) * f.s;
  const sx = (r.x + r.w / 2) * iw, sy = (r.y + r.h / 2) * ih;
  x.drawImage(f.img, X + FW / 2 + f.dx * FW - sx * k, Y + FH / 2 + f.dy * FH - sy * k, iw * k, ih * k);
}
/* Kontur z klasycznych proporcji głowy (jednostka = wysokość głowy, u = w bok od osi, v = w dół od czubka):
   oczy w połowie wysokości, uszy od brwi do podstawy nosa, szerokość ok. 3/4 wysokości. Prawa połowa, lewa to odbicie. */
const PRAWA = [[.2,0, .354,.154, .358,.385], [.362,.558, .331,.712, .269,.827], [.215,.927, .115,1, 0,1]];
function sciezkaKonturu(x, P) {
  x.moveTo(...P(0, 0));
  for (const s of PRAWA) x.bezierCurveTo(...P(s[0], s[1]), ...P(s[2], s[3]), ...P(s[4], s[5]));
  const pocz = [[0, 0], ...PRAWA.map(s => [s[4], s[5]])];
  for (let i = PRAWA.length - 1; i >= 0; i--) { const s = PRAWA[i], p = pocz[i]; x.bezierCurveTo(...P(-s[2], s[3]), ...P(-s[0], s[1]), ...P(-p[0], p[1])); }
  for (const z of [1, -1]) {                   // uszy i szyja
    x.moveTo(...P(.358 * z, .442)); x.bezierCurveTo(...P(.408 * z, .45), ...P(.408 * z, .696), ...P(.346 * z, .712));
    x.moveTo(...P(.1 * z, .985)); x.lineTo(...P(.115 * z, 1.135));
  }
}
function rysujKontur(x, X, Y, FW, FH, alfa = 1) {
  const H = GLOWA.wys * FH, gora = Y + GLOWA.gora * FH, cx = X + FW / 2, P = (u, v) => [cx + u * H, gora + v * H];
  x.save(); x.globalAlpha = alfa; x.lineCap = 'round'; x.lineJoin = 'round';
  for (const [kolor, gr] of [['rgba(0,0,0,.55)', 4], ['#fff', 2]]) {        // ciemny obrys pod jasną linią: widać na każdym tle
    x.strokeStyle = kolor; x.lineWidth = gr;
    x.beginPath(); sciezkaKonturu(x, P); x.stroke();
    x.lineWidth = gr + 1.5; x.beginPath();     // kreski: oczy, podstawa nosa
    for (const z of [1, -1]) { x.moveTo(...P(.162 * z, .5)); x.lineTo(...P(.246 * z, .5)); }
    x.moveTo(...P(-.04, .715)); x.lineTo(...P(.04, .715)); x.stroke();
  }
  x.setLineDash([2, 6]); x.lineWidth = 1.2; x.strokeStyle = 'rgba(255,255,255,.6)';   // oś symetrii: głowa prosto
  x.beginPath(); x.moveTo(...P(0, .15)); x.lineTo(...P(0, 1)); x.stroke();
  x.restore();
}

/* ======================= OBRAZ NA ŻYWO Z KONTUREM ======================= */
function twNakladka() {
  const c = $('tw-nakladka'), v = $('ap-wideo');
  const wlaczona = !$('foto').hidden && ust.apTryb === 'twarz' && warstwa === 'aparat';
  c.hidden = $('tw-krok').hidden = !wlaczona;
  if (!wlaczona) return;
  pokazKrok();
  const pole = c.parentElement, dpr = devicePixelRatio || 1, cw = pole.clientWidth, ch = pole.clientHeight;
  c.width = Math.max(1, Math.round(cw * dpr)); c.height = Math.max(1, Math.round(ch * dpr));
  c.classList.toggle('lustro', ap.kier === 'user');          // tak samo jak obraz z przedniego aparatu
  const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!v.videoWidth) return;
  const s = Math.min(cw / v.videoWidth, ch / v.videoHeight), vw = v.videoWidth * s, vh = v.videoHeight * s;
  const vx = (cw - vw) / 2, vy = (ch - vh) / 2, r = ramaDla(v.videoWidth, v.videoHeight);
  const X = vx + r.x * vw, Y = vy + r.y * vh, FW = r.w * vw, FH = r.h * vh, zak = ZAKLADKA * FW;
  const granice = [vy, Y + SZEW[0] * FH, Y + SZEW[1] * FH, vy + vh];
  x.fillStyle = 'rgba(0,0,0,.35)';                          // poza ramką nic się nie wydrukuje
  x.beginPath(); x.rect(vx, vy, vw, vh); x.rect(X, Y, FW, FH); x.fill('evenodd');
  for (let i = 0; i < 3; i++) {
    if (i === tw.krok) continue;
    const g = granice[i], d = granice[i + 1], f = tw.zdj[i];
    x.save(); x.beginPath(); x.rect(vx, g, vw, d - g); x.clip();
    if (f) rysujFragment(x, f, X, Y, FW, FH); else { x.fillStyle = 'rgba(0,0,0,.6)'; x.fillRect(vx, g, vw, d - g); }
    x.restore();
    if (f && Math.abs(i - tw.krok) === 1) {   // zakładka: kawałek sąsiedniego zdjęcia półprzezroczyście nad obrazem na żywo
      x.save(); x.globalAlpha = .5; x.beginPath(); x.rect(vx, i < tw.krok ? d : g - zak, vw, zak); x.clip();
      rysujFragment(x, f, X, Y, FW, FH); x.restore();
    }
  }
  x.save(); x.setLineDash([8, 6]); x.lineWidth = 1.5; x.strokeStyle = 'rgba(255,255,255,.85)';
  for (const y of [granice[1], granice[2]]) { x.beginPath(); x.moveTo(vx, y); x.lineTo(vx + vw, y); x.stroke(); }
  x.restore();
  rysujKontur(x, X, Y, FW, FH);
}
function pokazKrok() {
  const komplet = tw.zdj.every(Boolean), [nazwa, rada] = CZESCI[tw.krok], p = $('tw-krok-przycisk');
  $('tw-krok-nr').textContent = `${tw.krok + 1} z 3 · ${nazwa}`;
  $('tw-krok-rada').textContent = rada;
  p.hidden = !komplet && tw.krok === 0;
  p.textContent = komplet ? 'Dopasuj' : 'Cofnij ujęcie';
}
$('tw-krok-przycisk').addEventListener('click', () => {
  if (warstwa !== 'aparat') return;
  if (tw.zdj.every(Boolean)) { otworzWarstwe('twarz'); return; }
  if (tw.krok === 0) return;
  tw.krok--; usunZdjecie(tw.krok); twNakladka();
});
function usunZdjecie(i) { if (tw.zdj[i]) obrazy.delete(tw.zdj[i].src); tw.zdj[i] = null; }
function twUjecie(src, rama) {                  // zdjęcie bieżącego fragmentu (spust, aparat telefonu albo galeria)
  if (warstwa !== 'aparat') { obrazy.delete(src); return; }
  usunZdjecie(tw.krok);
  tw.zdj[tw.krok] = { src, img:obrazy.get(src), rama, dx:0, dy:0, s:1, jasnosc:0 };
  tw.wybrany = tw.krok;
  const brak = tw.zdj.findIndex(f => !f);
  if (brak < 0) { otworzWarstwe('twarz'); return; }
  tw.krok = brak; twNakladka();
  if (!ap.strumien) apUruchom();               // po aparacie telefonu albo galerii wraca obraz na żywo
}
function twZPliku(src) { const img = obrazy.get(src); twUjecie(src, ramaDla(img.width, img.height)); }
function twWyczysc() { for (let i = 0; i < 3; i++) usunZdjecie(i); tw.krok = tw.wybrany = 0; }

function twWarstwa(w) {                         // wywoływane z ustawWarstwe po apWarstwa
  const t = ust.apTryb === 'twarz', zKilku = ust.apTryb !== 'zdjecie';   // zKilku: tu albo w czesci.js
  $('twarz').hidden = w !== 'twarz';
  for (const p of $('ap-tryby').children) p.setAttribute('aria-pressed', p.dataset.tryb === ust.apTryb);
  if (w === 'aparat') $('ap-telefon').hidden = zKilku;
  $('tw-galeria').hidden = $('ap-porady').hidden = w !== 'aparat' || !zKilku;
  $('tw-porady').hidden = !(w === 'aparat' && t && ust.twPorady);
  twNakladka();
  if (w === 'twarz') pokazDopasowanie();
}
$('ap-tryby').addEventListener('click', e => {
  const p = e.target.closest('[data-tryb]'); if (!p) return;
  const bylo = JSON.stringify(apRozdzielczosc());
  ust.apTryb = p.dataset.tryb; zapisz(); twWarstwa(warstwa); czWarstwa(warstwa); paWarstwa(warstwa);
  if (warstwa === 'aparat' && ap.strumien && JSON.stringify(apRozdzielczosc()) !== bylo) apUruchom();   // "Z części" chce ostrzejszego obrazu
});
$('ap-porady').addEventListener('click', () => {
  const id = { czesci:'cz', paski:'pa' }[ust.apTryb] || 'tw';
  $(`${id}-porady`).hidden = false; $(`${id}-zaczynam`).focus();
});
$('tw-zaczynam').addEventListener('click', () => { ust.twPorady = false; zapisz(); $('tw-porady').hidden = true; $('ap-spust').focus(); });
$('tw-galeria').addEventListener('click', () => $('tw-plik').click());
$('tw-plik').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { const src = await zPliku(f, apMax()); if (ust.apTryb === 'czesci') czZdjecie(src); else if (ust.apTryb === 'paski') paZdjecie(src); else twZPliku(src); }
  catch { apInfo('Nie udało się odczytać tego zdjęcia.'); setTimeout(() => apInfo(''), 3000); }
});
for (const t of ['loadedmetadata', 'resize']) $('ap-wideo').addEventListener(t, twNakladka);
new ResizeObserver(twNakladka).observe($('tw-nakladka').parentElement);

/* ======================= SKŁADANIE ======================= */
function waga(y, s, b) {                        // udział dolnego zdjęcia w wierszu y; b = szerokość przejścia
  if (!b) return y + 0.5 >= s ? 1 : 0;
  const t = ogr((y + 0.5 - s) / b + 0.5, 0, 1);
  return t * t * (3 - 2 * t);
}
function wyrownajJasnosc(a, b, s, pol, ow, oh) {       // dolne zdjęcie b dostaje jasność i kontrast górnego a w pasie przy szwie
  const y0 = Math.max(0, Math.round(s - pol)), y1 = Math.min(oh, Math.round(s + pol)), x0 = Math.round(ow * .3), x1 = Math.round(ow * .7);
  let n = 0, sa = 0, sb = 0, qa = 0, qb = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = y * ow + x; sa += a[i]; sb += b[i]; qa += a[i] * a[i]; qb += b[i] * b[i]; n++; }
  if (!n) return;
  const ma = sa / n, mb = sb / n, da = Math.sqrt(Math.max(0, qa / n - ma * ma)), db = Math.sqrt(Math.max(0, qb / n - mb * mb));
  const k = db > 0.01 ? ogr(da / db, 0.8, 1.25) : 1;
  for (let i = 0; i < b.length; i++) b[i] = (b[i] - mb) * k + ma;
}
function zlozTwarz(ow) {                        // wynik: ImageData w odcieniach szarości, szerokość ow, proporcje ramki 3:4
  const oh = Math.round(ow / 0.75), n = ow * oh;
  const szare = tw.zdj.map(f => {
    const x = platno(ow, oh); x.imageSmoothingQuality = 'high'; rysujFragment(x, f, 0, 0, ow, oh);
    const d = x.getImageData(0, 0, ow, oh).data, g = new Float32Array(n);
    for (let i = 0; i < n; i++) g[i] = (d[i*4] * 0.299 + d[i*4+1] * 0.587 + d[i*4+2] * 0.114) / 255;
    return g;
  });
  const szew = SZEW.map(v => v * oh), b = ust.twSzew === 'miekki' ? ZAKLADKA * ow : 0;
  if (ust.twWyrownaj) for (let i = 1; i < 3; i++) wyrownajJasnosc(szare[i - 1], szare[i], szew[i - 1], Math.max(b, oh * 0.03), ow, oh);
  szare.forEach((g, i) => { const o = tw.zdj[i].jasnosc / 200; if (o) for (let k = 0; k < n; k++) g[k] += o; });
  const im = new ImageData(ow, oh), d = im.data;
  for (let y = 0; y < oh; y++) {
    const w1 = waga(y, szew[0], b), w2 = waga(y, szew[1], b);
    for (let i = y * ow, k = i + ow; i < k; i++) {
      const v = ((szare[0][i] * (1 - w1) + szare[1][i] * w1) * (1 - w2) + szare[2][i] * w2) * 255;
      d[i*4] = d[i*4+1] = d[i*4+2] = v; d[i*4+3] = 255;
    }
  }
  return im;
}

/* ======================= DOPASOWANIE ======================= */
function pokazDopasowanie() {
  if (!tw.zdj.every(Boolean)) return;
  const f = tw.zdj[tw.wybrany];
  for (const p of $('tw-czesci').children) p.setAttribute('aria-pressed', +p.dataset.czesc === tw.wybrany);
  for (const p of document.querySelectorAll('[data-szew]')) p.setAttribute('aria-pressed', p.dataset.szew === ust.twSzew);
  $('tw-wyrownaj').setAttribute('aria-pressed', !!ust.twWyrownaj);
  $('tw-rozmiar').value = Math.round(f.s * 100); $('tw-o-rozmiar').textContent = `${Math.round(f.s * 100)}%`;
  $('tw-jasnosc').value = f.jasnosc; $('tw-o-jasnosc').textContent = f.jasnosc;
  odrysujDopasowanie();
}
function odrysujDopasowanie() { if (!tw.zaplanowane) tw.zaplanowane = requestAnimationFrame(() => { tw.zaplanowane = 0; rysujDopasowanie(); }); }
function rysujDopasowanie() {
  if ($('twarz').hidden || !tw.zdj.every(Boolean)) return;
  const c = $('tw-podglad'), pole = c.parentElement, dpr = devicePixelRatio || 1;
  const css = Math.max(60, Math.min(pole.clientWidth - 8, (pole.clientHeight - 8) * 0.75)), H = css / 0.75;
  const im = zlozTwarz(Math.min(576, Math.round(css * dpr)));
  c.width = im.width; c.height = im.height; c.style.width = `${css}px`; c.style.height = `${H}px`;
  const x = c.getContext('2d'); x.putImageData(im, 0, 0);
  x.setTransform(im.width / css, 0, 0, im.width / css, 0, 0);
  rysujKontur(x, 0, 0, css, H, .35);
  const g = [0, SZEW[0] * H, SZEW[1] * H, H];
  x.strokeStyle = '#e8557b'; x.lineWidth = 3;
  x.strokeRect(1.5, g[tw.wybrany] + 1.5, css - 3, g[tw.wybrany + 1] - g[tw.wybrany] - 3);
}
const fragment = () => tw.zdj[tw.wybrany];
$('tw-podglad').addEventListener('pointerdown', e => {
  const r = $('tw-podglad').getBoundingClientRect(), v = (e.clientY - r.top) / r.height;
  tw.wybrany = v < SZEW[0] ? 0 : v < SZEW[1] ? 1 : 2;
  const f = fragment(); if (!f) return;
  tw.chwyt = { x:e.clientX, y:e.clientY, dx:f.dx, dy:f.dy, w:r.width, h:r.height };
  $('tw-podglad').setPointerCapture(e.pointerId); pokazDopasowanie();
});
$('tw-podglad').addEventListener('pointermove', e => {
  const ch = tw.chwyt, f = fragment(); if (!ch || !f) return;
  f.dx = ogr(ch.dx + (e.clientX - ch.x) / ch.w, -.5, .5); f.dy = ogr(ch.dy + (e.clientY - ch.y) / ch.h, -.5, .5);
  odrysujDopasowanie();
});
for (const t of ['pointerup', 'pointercancel']) $('tw-podglad').addEventListener(t, () => { tw.chwyt = null; });
$('tw-czesci').addEventListener('click', e => { const p = e.target.closest('[data-czesc]'); if (p) { tw.wybrany = +p.dataset.czesc; pokazDopasowanie(); } });
$('tw-rozmiar').addEventListener('input', e => { const f = fragment(); if (!f) return; f.s = +e.target.value / 100; $('tw-o-rozmiar').textContent = `${e.target.value}%`; odrysujDopasowanie(); });
$('tw-jasnosc').addEventListener('input', e => { const f = fragment(); if (!f) return; f.jasnosc = +e.target.value; $('tw-o-jasnosc').textContent = f.jasnosc; odrysujDopasowanie(); });
$('twarz').addEventListener('click', e => {
  const p = e.target.closest('[data-szew]');
  if (p) { ust.twSzew = p.dataset.szew; zapisz(); pokazDopasowanie(); }
  else if (e.target.closest('#tw-wyrownaj')) { ust.twWyrownaj = !ust.twWyrownaj; zapisz(); pokazDopasowanie(); }
});
$('tw-powtorz').addEventListener('click', () => { tw.krok = tw.wybrany; zamknijWarstwe(); });   // Wstecz do aparatu, z tym fragmentem do zrobienia
$('tw-zamknij').addEventListener('click', () => zamknijWarstwe(2));
$('tw-od-nowa').addEventListener('click', () => {   // dwa dotknięcia, bo zdjęć nie da się przywrócić
  const p = $('tw-od-nowa');
  if (!tw.napewno) { p.textContent = 'Na pewno?'; tw.napewno = setTimeout(() => { tw.napewno = 0; p.textContent = 'Od nowa'; }, 3000); return; }
  clearTimeout(tw.napewno); tw.napewno = 0; p.textContent = 'Od nowa';
  twWyczysc(); zamknijWarstwe();
});
$('tw-dalej').addEventListener('click', async () => {
  if (!tw.zdj.every(Boolean)) return;
  const im = zlozTwarz(2 * W), x = platno(im.width, im.height);   // dwa piksele na kropkę: kropki liczy potem rdzen.js
  x.putImageData(im, 0, 0);
  const src = x.canvas.toDataURL('image/jpeg', 0.9);
  obrazy.set(src, await createImageBitmap(x.canvas));
  apPokaz(src, 'Twarz z trzech zdjęć');
});
new ResizeObserver(odrysujDopasowanie).observe($('tw-podglad').parentElement);
