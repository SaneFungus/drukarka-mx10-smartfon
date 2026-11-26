'use strict';
/* Paski: obraz złożony z pasków (poziomych albo pionowych), każdy pasek z innego zdjęcia.
   Liczbę pasków, ich kierunek i szerokość wybierasz sam, także później: paski można dodawać i usuwać.
   Ramka 3:4 jak w twarz.js: każde zdjęcie leży na całej ramce, a pasek pokazuje tylko swój kawałek.
   Dlatego po poszerzeniu paska widać więcej tego samego zdjęcia, a nie pustkę.
   Każde zdjęcie paska od razu zapisuje się w telefonie (IndexedDB), do naciśnięcia "Wyczyść".
   Jak w twarz.js składamy w odcieniach szarości i dopiero całość zamienia się na kropki.
   Warstwy ekranu: 'aparat' (obraz na żywo z paskami) -> 'paski' (układanie) -> 'zdjecie' (kropki i Drukuj). */
const PA_BRZEG = 16 / W;                        // miękki brzeg: 16 kropek (ok. 2 mm), w ułamku szerokości ramki
const PA_MIN = 0.02;                            // najwęższy pasek: 2% ramki
const PA_MAX = 20;                              // najwięcej pasków
const pa = { kier:'poziome', lista:[], nr:1, krok:0, wybrany:null, suwak:'szerokosc', palce:new Map(), gest:null, zmieniono:false,
  suwakZm:false, cofnij:[], ponow:[], moje:new Set(), cache:new Map(), zaplanowane:0, zapisT:0 };

const paPusty = u => ({ id:pa.nr++, u, src:null, img:null, rama:null, dx:0, dy:0, s:1, jasnosc:0, zr:null });
function paStart(n = 3) { pa.lista = []; for (let i = 0; i < n; i++) pa.lista.push(paPusty(1 / n)); pa.krok = 0; pa.wybrany = pa.lista[0].id; }
paStart();
const paPasek = id => pa.lista.find(f => f.id === id) || null;
const paPion = () => pa.kier === 'pionowe';
const ilePaskow = n => `${n} ${n === 1 ? 'pasek' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'paski' : 'pasków'}`;
const paZdjec = () => pa.lista.filter(f => f.img).length;
function paGranice(D) {                         // początki pasków (i koniec ostatniego) w pikselach wzdłuż osi
  const a = [0]; for (const f of pa.lista) a.push(a[a.length - 1] + f.u * D);
  a[pa.lista.length] = D; return a;
}
function paRowno() {                            // po każdej zmianie: suma szerokości = 1, nikt węższy niż PA_MIN
  const L = pa.lista; for (const f of L) f.u = Math.max(PA_MIN, f.u);
  const s = L.reduce((a, f) => a + f.u, 0); for (const f of L) f.u /= s;
}

/* ======================= COFNIJ I PONÓW ======================= */
const paStan = () => ({ kier:pa.kier, lista:pa.lista.map(f => ({ ...f })), wybrany:pa.wybrany, krok:pa.krok });
function paZmiana() {                           // wywołać tuż PRZED każdą zmianą pasków
  pa.cofnij.push(paStan()); if (pa.cofnij.length > 50) pa.cofnij.shift();
  pa.ponow = []; paSprzataj();
}
function paPrzywroc(skad, dokad) {
  if (!skad.length) return;
  dokad.push(paStan());
  const s = skad.pop();
  pa.kier = s.kier; pa.lista = s.lista.map(f => ({ ...f })); pa.wybrany = paPasek(s.wybrany) ? s.wybrany : pa.lista[0].id;
  pa.krok = Math.min(s.krok, pa.lista.length - 1);
  paSprzataj(); paZapisz(); paPokaz();
}
function paSprzataj() {                         // zdjęcia i bufory, do których nic już nie prowadzi (także w Cofnij), znikają z pamięci
  const jest = new Set(), zyweId = new Set();
  const dodaj = s => { for (const f of s.lista) { zyweId.add(f.id); if (f.src) jest.add(f.src); } };
  dodaj(pa); pa.cofnij.forEach(dodaj); pa.ponow.forEach(dodaj);
  for (const src of pa.moje) if (!jest.has(src)) { usunObraz(src); pa.moje.delete(src); }
  for (const id of pa.cache.keys()) if (!zyweId.has(id)) pa.cache.delete(id);
}

/* ======================= ZMIANY PASKÓW ======================= */
function paDodaj(po) {                          // nowy pusty pasek za paskiem nr po; zabiera innym po równo (w proporcji)
  const n = pa.lista.length; if (n >= PA_MAX) return null;
  for (const f of pa.lista) f.u *= n / (n + 1);
  const f = paPusty(1 / (n + 1)); pa.lista.splice(po + 1, 0, f); paRowno();
  return f;
}
function paUsun(i) {                            // jego szerokość dostają pozostałe (w proporcji)
  if (pa.lista.length < 2) return;
  pa.lista.splice(i, 1); paRowno();
  pa.krok = Math.min(pa.krok, pa.lista.length - 1);
  if (!paPasek(pa.wybrany)) pa.wybrany = pa.lista[Math.min(i, pa.lista.length - 1)].id;
}
function paSzerokosc(f, u) {                    // pasek f dostaje szerokość u; reszta oddaje (albo dostaje) w proporcji do swojego zapasu ponad PA_MIN
  const inne = pa.lista.filter(g => g !== f), m = inne.length;
  if (!m) return;
  u = ogr(u, PA_MIN, 1 - m * PA_MIN);
  const zapas = inne.reduce((a, g) => a + g.u - PA_MIN, 0), nowy = 1 - u - m * PA_MIN;
  for (const g of inne) g.u = PA_MIN + (zapas > 1e-9 ? (g.u - PA_MIN) * nowy / zapas : nowy / m);
  f.u = u; paRowno();
}

/* ======================= APARAT ======================= */
function paNakladka() {                         // obraz na żywo: ramka, paski, wcześniejsze zdjęcia w swoich paskach
  const c = $('pa-nakladka'), v = $('ap-wideo');
  const wlaczona = !$('foto').hidden && ust.apTryb === 'paski' && warstwa === 'aparat';
  c.hidden = $('pa-krok').hidden = $('pa-ustaw').hidden = !wlaczona;
  if (!wlaczona) return;
  paKrok();
  const pole = c.parentElement, dpr = devicePixelRatio || 1, cw = pole.clientWidth, ch = pole.clientHeight;
  c.width = Math.max(1, Math.round(cw * dpr)); c.height = Math.max(1, Math.round(ch * dpr));
  c.classList.toggle('lustro', ap.kier === 'user');
  const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
  const r = paRamkaEkranu(); if (!r) return;
  const { vx, vy, vw, vh, X, Y, FW, FH } = r, pion = paPion(), a = paGranice(pion ? FW : FH);
  x.fillStyle = 'rgba(0,0,0,.4)';               // poza ramką nic się nie wydrukuje
  x.beginPath(); x.rect(vx, vy, vw, vh); x.rect(X, Y, FW, FH); x.fill('evenodd');
  const prost = i => pion ? [X + a[i], Y, a[i + 1] - a[i], FH] : [X, Y + a[i], FW, a[i + 1] - a[i]];
  pa.lista.forEach((f, i) => {
    if (i === pa.krok) return;
    const p = prost(i);
    x.save(); x.beginPath(); x.rect(...p); x.clip();
    if (f.img) { rysujFragment(x, f, X, Y, FW, FH); x.fillStyle = 'rgba(0,0,0,.3)'; }   // zrobione: widać, ale ciemniej
    else x.fillStyle = 'rgba(0,0,0,.65)';
    x.fillRect(...p); x.restore();
  });
  x.save(); x.setLineDash([8, 6]); x.lineWidth = 1.5; x.strokeStyle = 'rgba(255,255,255,.8)';
  for (let i = 1; i < pa.lista.length; i++) {
    x.beginPath();
    if (pion) { x.moveTo(X + a[i], Y); x.lineTo(X + a[i], Y + FH); } else { x.moveTo(X, Y + a[i]); x.lineTo(X + FW, Y + a[i]); }
    x.stroke();
  }
  x.restore();
  const p = prost(pa.krok);                     // ten pasek robisz teraz
  x.lineWidth = 3; x.strokeStyle = 'rgba(0,0,0,.5)'; x.strokeRect(p[0] + 1.5, p[1] + 1.5, p[2] - 3, p[3] - 3);
  x.lineWidth = 2; x.strokeStyle = '#e8557b'; x.strokeRect(p[0] + 1.5, p[1] + 1.5, p[2] - 3, p[3] - 3);
}
function paRamkaEkranu() {                      // gdzie na ekranie leży ramka 3:4 obrazu z aparatu
  const v = $('ap-wideo'), pole = $('pa-nakladka').parentElement, cw = pole.clientWidth, ch = pole.clientHeight;
  if (!v.videoWidth) return null;
  const s = Math.min(cw / v.videoWidth, ch / v.videoHeight), vw = v.videoWidth * s, vh = v.videoHeight * s;
  const vx = (cw - vw) / 2, vy = (ch - vh) / 2, r = ramaDla(v.videoWidth, v.videoHeight);
  return { cw, vx, vy, vw, vh, X:vx + r.x * vw, Y:vy + r.y * vh, FW:r.w * vw, FH:r.h * vh };
}
function paKrok() {                             // pasek u góry i liczba pasków na dole
  const n = pa.lista.length, f = pa.lista[pa.krok], z = paZdjec();
  $('pa-krok-tytul').textContent = `Pasek ${pa.krok + 1} z ${n}`;
  $('pa-krok-rada').textContent = !z ? 'Wybierz na dole kierunek i liczbę pasków. Potem zrób zdjęcie paska w różowej ramce.'
    : f.img ? 'Ten pasek ma już zdjęcie. Nowe zdjęcie je zastąpi. Dotknij innego paska, żeby go wybrać.'
    : 'Dopasuj twarz do sąsiednich pasków i zrób zdjęcie. Dotknij innego paska, żeby go wybrać.';
  $('pa-krok-przyciski').hidden = !z;
  $('pa-uloz').textContent = `Ułóż (${z}/${n})`;
  for (const p of $('pa-ustaw').querySelectorAll('[data-kier]')) p.setAttribute('aria-pressed', p.dataset.kier === pa.kier);
  $('pa-ile').textContent = n; $('pa-ile').setAttribute('aria-label', ilePaskow(n));
  $('pa-mniej').disabled = n < 2; $('pa-wiecej').disabled = n >= PA_MAX;
}
function paZdjecie(src) {                       // zdjęcie ze spustu albo z galerii trafia do bieżącego paska
  if (warstwa !== 'aparat') { usunObraz(src); return; }
  const img = obrazy.get(src);
  paZmiana(); pa.moje.add(src);                 // w tej kolejności: sprzątanie w paZmiana nie zna jeszcze nowego zdjęcia
  const f = pa.lista[pa.krok];
  Object.assign(f, { src, img, rama:ramaDla(img.width, img.height), dx:0, dy:0, s:1, jasnosc:0, zr:czStaty(img) });
  pa.wybrany = f.id; paZapisz();
  const n = pa.lista.length, brak = [...Array(n).keys()].map(k => (pa.krok + 1 + k) % n).find(k => !pa.lista[k].img);
  if (brak === undefined) { otworzWarstwe('paski'); return; }
  pa.krok = brak; paNakladka();
  if (!ap.strumien) apUruchom();                // po galerii wraca obraz na żywo
}
function paWarstwa(w) {                         // wywoływane z ustawWarstwe po czWarstwa
  $('paski').hidden = w !== 'paski';
  $('pa-porady').hidden = !(w === 'aparat' && ust.apTryb === 'paski' && ust.paPorady);
  paSprzataj(); paNakladka();
  if (w === 'paski') paPokaz();
}
$('pa-zaczynam').addEventListener('click', () => { ust.paPorady = false; zapisz(); $('pa-porady').hidden = true; $('ap-spust').focus(); });
$('pa-ustaw').addEventListener('click', e => {
  if (warstwa !== 'aparat') return;
  const k = e.target.closest('[data-kier]'), n = pa.lista.length;
  if (k) { if (k.dataset.kier !== pa.kier) { paZmiana(); pa.kier = k.dataset.kier; } }
  else if (e.target.closest('#pa-wiecej')) { if (n < PA_MAX) { paZmiana(); paDodaj(n - 1); } }
  else if (e.target.closest('#pa-mniej')) { if (n > 1) { paZmiana(); paUsun(n - 1); } }
  else return;
  paZapisz(); paNakladka();
});
$('ap-wideo').parentElement.addEventListener('click', e => {   // dotknięcie paska na obrazie z aparatu: teraz ten
  if (warstwa !== 'aparat' || ust.apTryb !== 'paski' || e.target.closest('button, #pa-krok, #pa-porady, #ap-info, #ap-odliczanie')) return;
  const r = paRamkaEkranu(); if (!r) return;
  const b = $('pa-nakladka').getBoundingClientRect();
  let px = e.clientX - b.left; const py = e.clientY - b.top;
  if (ap.kier === 'user') px = r.cw - px;       // obraz z przedniego aparatu jest odbity
  const t = paPion() ? (px - r.X) / r.FW : (py - r.Y) / r.FH;
  if (t < 0 || t > 1 || (paPion() ? py < r.Y || py > r.Y + r.FH : px < r.X || px > r.X + r.FW)) return;
  const a = paGranice(1); let i = 0; while (i < pa.lista.length - 1 && t >= a[i + 1]) i++;
  pa.krok = i; paNakladka();
});
$('pa-uloz').addEventListener('click', () => { if (warstwa === 'aparat' && paZdjec()) otworzWarstwe('paski'); });
const paPoziomo = matchMedia('(max-height:520px) and (orientation:landscape)');   // to samo co w styl.css
function paMiejsceUstawien() {                  // telefon poziomo: kierunek i liczba pasków w kolumnie z podpowiedzią
  if (paPoziomo.matches) $('pa-krok').append($('pa-ustaw')); else $('ap-tryby').after($('pa-ustaw'));
}
paMiejsceUstawien(); paPoziomo.addEventListener('change', paMiejsceUstawien);
for (const t of ['loadedmetadata', 'resize']) $('ap-wideo').addEventListener(t, paNakladka);
new ResizeObserver(paNakladka).observe($('pa-nakladka').parentElement);

/* ======================= SKŁADANIE ======================= */
function paSzare(f, ow, oh) {                   // pełna ramka paska zapamiętana w szarościach: zmiana szerokości nie przerysowuje zdjęć
  const klucz = `${f.src}|${f.dx}|${f.dy}|${f.s}|${ow}`;
  let c = pa.cache.get(f.id);
  if (!c || c.klucz !== klucz) {
    const x = platno(ow, oh); x.imageSmoothingQuality = 'high'; rysujFragment(x, f, 0, 0, ow, oh);
    c = { klucz, g:szary(x, ow, oh) };
    pa.cache.set(f.id, c);
  }
  return c.g;
}
function paZloz(ow, ekran = false) {            // wynik: ImageData w odcieniach szarości, szerokość ow, proporcje 3:4
  const oh = Math.round(ow / 0.75), n = ow * oh, L = pa.lista, pion = paPion(), D = pion ? ow : oh;
  const b = ust.paMiekki ? PA_BRZEG * ow : 0, a = paGranice(D);
  const v = new Float32Array(n), ws = new Float32Array(n);
  const zr = L.filter(f => f.img && f.zr).map(f => f.zr), M = zr.reduce((s, z) => s + z.m, 0) / (zr.length || 1), Dd = zr.reduce((s, z) => s + z.d, 0) / (zr.length || 1);
  L.forEach((f, i) => {
    const lo = Math.max(0, Math.floor(i ? a[i] - b / 2 : 0)), hi = Math.min(D, Math.ceil(i < L.length - 1 ? a[i + 1] + b / 2 : D));
    if (hi <= lo) return;
    const wagi = new Float32Array(hi - lo);     // udział paska w każdej linii wzdłuż osi
    for (let t = lo; t < hi; t++) wagi[t - lo] = (i ? waga(t, a[i], b) : 1) * (i < L.length - 1 ? 1 - waga(t, a[i + 1], b) : 1);
    const [rx, ry, rw, rh] = pion ? [lo, 0, hi - lo, oh] : [0, lo, ow, hi - lo];
    if (f.img) {
      const pelny = paSzare(f, ow, oh);
      const dopasuj = ust.paWyrownaj && f.zr;
      const k = dopasuj && f.zr.d > 0.01 ? ogr(Dd / f.zr.d, 0.8, 1.25) : 1, jas = f.jasnosc / 200;
      for (let yy = 0; yy < rh; yy++) {
        const wy = ry + yy;
        for (let xx = 0; xx < rw; xx++) {
          const w = wagi[pion ? xx : yy]; if (!w) continue;
          const idx = wy * ow + rx + xx;
          let q = pelny[idx];
          if (dopasuj) q = (q - f.zr.m) * k + M;
          v[idx] += ogr(q + jas, 0, 1) * w; ws[idx] += w;
        }
      }
    } else {
      const pusty = ekran ? 0.82 : 1;
      for (let yy = 0; yy < rh; yy++) for (let xx = 0; xx < rw; xx++) {
        const w = wagi[pion ? xx : yy]; if (!w) continue;
        const idx = (ry + yy) * ow + rx + xx; v[idx] += pusty * w; ws[idx] += w;
      }
    }
  });
  const im = new ImageData(ow, oh), d = im.data;
  for (let i = 0; i < n; i++) { d[i*4] = d[i*4+1] = d[i*4+2] = (ws[i] ? v[i] / ws[i] : 1) * 255; d[i*4+3] = 255; }
  return im;
}

/* ======================= UKŁADANIE ======================= */
const SUWAKI_PA = { szerokosc:['Szerokość paska', 2, 90], rozmiar:['Rozmiar zdjęcia', 50, 300], jasnosc:['Jasność paska', -60, 60] };
function paWartosc(f, k) { return k === 'szerokosc' ? Math.round(f.u * 100) : k === 'rozmiar' ? Math.round(f.s * 100) : f.jasnosc; }
const paOpis = (k, v) => k === 'jasnosc' ? `${v}` : `${v}%`;
function paPokaz() {
  let f = paPasek(pa.wybrany); if (!f) { f = pa.lista[0]; pa.wybrany = f.id; }
  const i = pa.lista.indexOf(f), n = pa.lista.length, brak = pa.lista.map((g, k) => g.img ? 0 : k + 1).filter(Boolean);
  $('pa-wybor').innerHTML = pa.lista.map((g, k) => wcisk(`data-pa="${g.id}" aria-label="Pasek ${k + 1}${g.img ? '' : ', bez zdjęcia'}"${g.img ? '' : ' class="pa-pusty"'}`, k + 1, g === f)).join('');
  const wcis = $('pa-wybor').querySelector('[aria-pressed=true]'); if (wcis) wcis.scrollIntoView({ block:'nearest', inline:'nearest' });
  $('pa-cofnij').disabled = !pa.cofnij.length; $('pa-ponow').disabled = !pa.ponow.length;
  for (const p of $('pa-suwaki').querySelectorAll('[data-suwak]')) p.setAttribute('aria-pressed', p.dataset.suwak === pa.suwak);
  for (const p of $('paski').querySelectorAll('[data-kier]')) p.setAttribute('aria-pressed', p.dataset.kier === pa.kier);
  $('pa-miekki').setAttribute('aria-pressed', !!ust.paMiekki); $('pa-wyrownaj').setAttribute('aria-pressed', !!ust.paWyrownaj);
  $('pa-dodaj').disabled = n >= PA_MAX; $('pa-usun').disabled = n < 2;
  $('pa-rowne').disabled = n < 2 || pa.lista.every(g => Math.abs(g.u - 1 / n) < 1e-4);
  const [nazwa, min, max] = SUWAKI_PA[pa.suwak], s = $('pa-suwak'), w = paWartosc(f, pa.suwak);
  $('pa-n-suwak').textContent = nazwa; s.min = min; s.max = max; s.value = w; $('pa-o-suwak').textContent = paOpis(pa.suwak, w);
  s.disabled = pa.suwak === 'szerokosc' ? n < 2 : !f.img;
  $('pa-zrob').textContent = f.img ? `Nowe zdjęcie paska ${i + 1}` : `Zrób zdjęcie paska ${i + 1}`;
  $('pa-dalej').disabled = !!brak.length;
  $('pa-rada').textContent = brak.length ? `${brak.length === 1 ? 'Pasek' : 'Paski'} ${brak.join(', ')} ${brak.length === 1 ? 'nie ma' : 'nie mają'} jeszcze zdjęcia. Zrób je albo usuń ${brak.length === 1 ? 'ten pasek' : 'te paski'}.`
    : 'Przeciągnij granicę, żeby zmienić szerokość. Zdjęcie w pasku przesuniesz palcem, dwoma palcami powiększysz.';
  paOdrysuj();
}
function paOdrysuj() { if (!pa.zaplanowane) pa.zaplanowane = requestAnimationFrame(() => { pa.zaplanowane = 0; paRysuj(); }); }
function paRysuj() {
  if ($('paski').hidden) return;
  const c = $('pa-podglad'), pole = c.parentElement, dpr = devicePixelRatio || 1;
  const css = Math.max(60, Math.min(pole.clientWidth - 8, (pole.clientHeight - 8) * 0.75)), H = css / 0.75;
  const im = paZloz(Math.min(576, Math.round(css * dpr)), true);
  c.width = im.width; c.height = im.height; c.style.width = `${css}px`; c.style.height = `${H}px`;
  const x = c.getContext('2d'); x.putImageData(im, 0, 0);
  x.setTransform(im.width / css, 0, 0, im.width / css, 0, 0);
  const pion = paPion(), D = pion ? css : H, a = paGranice(D), f = paPasek(pa.wybrany), i = pa.lista.indexOf(f);
  const prost = k => pion ? [a[k], 0, a[k + 1] - a[k], H] : [0, a[k], css, a[k + 1] - a[k]];
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '600 16px sans-serif';
  pa.lista.forEach((g, k) => {                  // pasek bez zdjęcia: jego numer
    if (g.img) return; const p = prost(k);
    if (Math.min(p[2], p[3]) >= 18) { x.fillStyle = '#5a6570'; x.fillText(k + 1, p[0] + p[2] / 2, p[1] + p[3] / 2); }
  });
  for (let k = 1; k < pa.lista.length; k++) {   // granice z uchwytem pośrodku: za nie się ciągnie
    const t = a[k];
    x.lineWidth = 1; x.strokeStyle = 'rgba(0,0,0,.45)'; x.beginPath();
    if (pion) { x.moveTo(t, 0); x.lineTo(t, H); } else { x.moveTo(0, t); x.lineTo(css, t); }
    x.stroke();
    const [ux, uy, uw, uh] = pion ? [t - 4, H / 2 - 16, 8, 32] : [css / 2 - 16, t - 4, 32, 8];
    x.fillStyle = '#fff'; x.strokeStyle = 'rgba(0,0,0,.6)'; x.lineWidth = 1.5;
    x.beginPath(); x.roundRect(ux, uy, uw, uh, 4); x.fill(); x.stroke();
  }
  if (f) {                                      // wybrany pasek: różowa ramka (tylko na ekranie)
    const p = prost(i);
    x.lineWidth = 3; x.strokeStyle = 'rgba(0,0,0,.5)'; x.strokeRect(p[0] + 1.5, p[1] + 1.5, p[2] - 3, p[3] - 3);
    x.lineWidth = 2; x.strokeStyle = '#e8557b'; x.setLineDash([6, 4]); x.strokeRect(p[0] + 1.5, p[1] + 1.5, p[2] - 3, p[3] - 3); x.setLineDash([]);
  }
}
const pp = $('pa-podglad');
function paTrafiony(e) {                        // granica (do ciągnięcia) albo pasek pod palcem
  const b = pp.getBoundingClientRect(), pion = paPion(), D = pion ? b.width : b.height;
  const t = pion ? e.clientX - b.left : e.clientY - b.top, a = paGranice(D);
  let gr = -1, odl = Infinity;
  for (let k = 1; k < pa.lista.length; k++) {
    const zasieg = Math.max(6, Math.min(16, 0.4 * (a[k] - a[k - 1]), 0.4 * (a[k + 1] - a[k])));
    const o = Math.abs(t - a[k]); if (o <= zasieg && o < odl) { odl = o; gr = k; }
  }
  let i = 0; while (i < pa.lista.length - 1 && t >= a[i + 1]) i++;
  return { gr, i, D, t, a };
}
function paDwaPalce() {
  const [a, b] = [...pa.palce.values()];
  return { d:Math.hypot(a.x - b.x, a.y - b.y) || 1, mx:(a.x + b.x) / 2, my:(a.y + b.y) / 2 };
}
function paStartGestu(granica) {                // stan paska i palców na początku ruchu
  const f = paPasek(pa.wybrany), b = pp.getBoundingClientRect(); pa.gest = null; if (!f || !pa.palce.size) return;
  if (pa.palce.size === 1) {
    const [p] = pa.palce.values();
    pa.gest = { w:b.width, h:b.height, mx:p.x, my:p.y, dx:f.dx, dy:f.dy, granica };
  } else if (f.img) pa.gest = { w:b.width, h:b.height, ...paDwaPalce(), dx:f.dx, dy:f.dy, s:f.s };
}
pp.addEventListener('pointerdown', e => {
  pp.setPointerCapture(e.pointerId); pa.palce.set(e.pointerId, { x:e.clientX, y:e.clientY });
  let granica = null;
  if (pa.palce.size === 1) {
    pa.zmieniono = false;
    const h = paTrafiony(e);
    if (h.gr > 0) granica = { k:h.gr, t:h.t, D:h.D, lewy:h.a[h.gr - 1], prawy:h.a[h.gr + 1] };
    else { pa.wybrany = pa.lista[h.i].id; paPokaz(); }
  }
  paStartGestu(granica);
});
pp.addEventListener('pointermove', e => {
  if (!pa.palce.has(e.pointerId)) return;
  pa.palce.set(e.pointerId, { x:e.clientX, y:e.clientY });
  const g = pa.gest, f = paPasek(pa.wybrany); if (!g) return;
  if (pa.palce.size === 1) {
    const [p] = pa.palce.values();
    if (!pa.zmieniono && Math.hypot(p.x - g.mx, p.y - g.my) < 4) return;   // samo dotknięcie tylko wybiera
    if (g.granica) {                            // granica między paskami k-1 i k
      const G = g.granica, L = pa.lista;
      if (!pa.zmieniono) { paZmiana(); pa.zmieniono = true; }
      const t = ogr(G.t + (paPion() ? p.x - g.mx : p.y - g.my), G.lewy + PA_MIN * G.D, G.prawy - PA_MIN * G.D);
      L[G.k - 1].u = (t - G.lewy) / G.D; L[G.k].u = (G.prawy - t) / G.D;
    } else {
      if (!f || !f.img) return;
      if (!pa.zmieniono) { paZmiana(); pa.zmieniono = true; }
      f.dx = ogr(g.dx + (p.x - g.mx) / g.w, -1, 1); f.dy = ogr(g.dy + (p.y - g.my) / g.h, -1, 1);
    }
  } else {                                      // dwa palce: rozsunięcie = rozmiar, środek = przesunięcie
    if (!f || !f.img || g.s === undefined) return;
    if (!pa.zmieniono) { paZmiana(); pa.zmieniono = true; }
    const t = paDwaPalce();
    f.s = ogr(g.s * t.d / g.d, 0.5, 3);
    f.dx = ogr(g.dx + (t.mx - g.mx) / g.w, -1, 1); f.dy = ogr(g.dy + (t.my - g.my) / g.h, -1, 1);
  }
  paOdrysuj();
});
function paPusc(e) {
  if (!pa.palce.delete(e.pointerId)) return;
  paStartGestu(null);                           // zostaje jeden palec: dalej przesuwa zdjęcie, bez skoku
  if (!pa.palce.size) { if (pa.zmieniono) paZapisz(); paPokaz(); }
}
for (const t of ['pointerup', 'pointercancel']) pp.addEventListener(t, paPusc);
pp.addEventListener('wheel', e => {             // na komputerze: kółko myszy zmienia rozmiar zdjęcia w pasku
  const f = paPasek(pa.wybrany); if (!f || !f.img) return;
  e.preventDefault(); paZmiana(); f.s = ogr(f.s * Math.exp(-e.deltaY / 600), 0.5, 3); paZapisz(); paPokaz();
}, { passive:false });
$('pa-wybor').addEventListener('click', e => { const p = e.target.closest('[data-pa]'); if (p) { pa.wybrany = +p.dataset.pa; paPokaz(); } });
$('pa-suwaki').addEventListener('click', e => { const p = e.target.closest('[data-suwak]'); if (p) { pa.suwak = p.dataset.suwak; paPokaz(); } });
$('pa-suwak').addEventListener('input', e => {
  const f = paPasek(pa.wybrany); if (!f) return;
  if (!pa.suwakZm) { paZmiana(); pa.suwakZm = true; $('pa-cofnij').disabled = false; $('pa-ponow').disabled = true; }   // jedno przesunięcie suwaka = jeden krok Cofnij
  const v = +e.target.value;
  if (pa.suwak === 'szerokosc') paSzerokosc(f, v / 100); else if (pa.suwak === 'rozmiar') f.s = v / 100; else f.jasnosc = v;
  $('pa-o-suwak').textContent = paOpis(pa.suwak, v); paOdrysuj(); paZapisz();
});
$('pa-suwak').addEventListener('change', () => { pa.suwakZm = false; paPokaz(); });
function paZmien(dzialaj) {                     // zmiana jednym przyciskiem, z krokiem Cofnij
  const f = paPasek(pa.wybrany); if (!f) return;
  paZmiana(); dzialaj(f, pa.lista.indexOf(f)); paZapisz(); paPokaz();
}
$('pa-dodaj').addEventListener('click', () => paZmien((f, i) => { const g = paDodaj(i); if (g) pa.wybrany = g.id; }));
$('pa-usun').addEventListener('click', () => paZmien((f, i) => paUsun(i)));   // da się cofnąć, więc bez pytania
$('pa-rowne').addEventListener('click', () => paZmien(() => { for (const g of pa.lista) g.u = 1 / pa.lista.length; }));
$('pa-kierunki').addEventListener('click', e => { const p = e.target.closest('[data-kier]'); if (p && p.dataset.kier !== pa.kier) paZmien(() => { pa.kier = p.dataset.kier; }); });
for (const [id, klucz] of [['pa-miekki', 'paMiekki'], ['pa-wyrownaj', 'paWyrownaj']])
  $(id).addEventListener('click', () => { ust[klucz] = !ust[klucz]; zapisz(); paPokaz(); });
$('pa-cofnij').addEventListener('click', () => paPrzywroc(pa.cofnij, pa.ponow));
$('pa-ponow').addEventListener('click', () => paPrzywroc(pa.ponow, pa.cofnij));
$('pa-zrob').addEventListener('click', () => {  // z powrotem do aparatu, z tym paskiem do zrobienia
  if (warstwa !== 'paski') return;
  pa.krok = Math.max(0, pa.lista.indexOf(paPasek(pa.wybrany))); zamknijWarstwe();
});
function paWyczysc() {                          // wszystkie zdjęcia pasków znikają; kierunek i liczba pasków zostają
  pa.cofnij = []; pa.ponow = []; pa.cache.clear(); paStart(pa.lista.length); paSprzataj(); paZapiszTeraz();
}
dwaRazy('pa-wyczysc', 'Wyczyść', () => { paWyczysc(); zamknijWarstwe(); });   // z powrotem do aparatu
dwaRazy('pa-wyczysc2', 'Wyczyść', () => { paWyczysc(); paNakladka(); });
$('pa-zamknij').addEventListener('click', () => zamknijWarstwe(2));
$('pa-dalej').addEventListener('click', async () => {
  if (pa.lista.some(f => !f.img)) return;
  const im = paZloz(2 * W), x = platno(im.width, im.height);   // dwa piksele na kropkę: kropki liczy potem rdzen.js
  x.putImageData(im, 0, 0);
  apPokaz(await zPlotna(x.canvas, 0.9), 'Paski');
});
new ResizeObserver(paOdrysuj).observe(pp.parentElement);

/* ======================= PAMIĘĆ TELEFONU ======================= */
function paZapisz() { clearTimeout(pa.zapisT); pa.zapisT = setTimeout(paZapiszTeraz, 500); }
async function paZapiszTeraz() {                // ta sama baza co w czesci.js, osobny klucz
  clearTimeout(pa.zapisT); pa.zapisT = 0;
  try {
    const db = await czBaza(), t = db.transaction('stan', 'readwrite');
    t.objectStore('stan').put({
      kier:pa.kier,
      lista:pa.lista.map(({ img, src, ...reszta }) => ({ ...reszta, plik:src ? (bloby.get(src) || src) : null })),
      nr:pa.nr, krok:pa.krok,
    }, 'paski');
    t.oncomplete = () => db.close();
  } catch (e) { log(`Paski: nie zapisano (${e.name})`); }
}
document.addEventListener('visibilitychange', () => { if (document.hidden && pa.zapisT) paZapiszTeraz(); });
addEventListener('DOMContentLoaded', async () => {   // po wszystkich skryptach, bo wczytajZapisanyObraz jest w ekran.js
  try {
    const db = await czBaza(), t = db.transaction('stan', 'readonly');
    const z = await new Promise((ok, zle) => { const r = t.objectStore('stan').get('paski'); r.onsuccess = () => ok(r.result); r.onerror = () => zle(r.error); });
    db.close();
    if (!z || !z.lista || !z.lista.length || paZdjec() || pa.cofnij.length) return;
    const lista = [];
    for (const f of z.lista) {
      let src = null, img = null;
      const dane = f.plik || f.src;
      if (dane) { try { src = await wczytajZapisanyObraz(dane); img = obrazy.get(src); pa.moje.add(src); } catch {} }
      const { plik:fp, ...fReszta } = f;
      lista.push({ ...fReszta, src:img ? src : null, img });
    }
    if (paZdjec() || pa.cofnij.length) { for (const f of lista) if (f.src) usunObraz(f.src); return; }
    pa.kier = z.kier === 'pionowe' ? 'pionowe' : 'poziome'; pa.lista = lista; paRowno();
    pa.nr = Math.max(z.nr | 0, ...lista.map(f => f.id + 1), 1);
    pa.krok = Math.min(z.krok | 0, lista.length - 1); pa.wybrany = lista[0].id;
    paNakladka(); if (warstwa === 'paski') paPokaz();
  } catch {}
}, { once:true });
