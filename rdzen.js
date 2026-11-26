'use strict';
/* ======================= STAŁE I STAN ======================= */
const W = 384, WB = W / 8, MAXH = 30000, KLUCZ = 'mx10-smartfon-v1', WERSJA = 'smartfon 0.7 (2026-11-26)';
const PUNKTY_NA_CM = 80;                      // 384 punkty = 48 mm druku
const $ = id => document.getElementById(id);
/* Kandydaci: najpierw rodziny Androida, potem Windows. Na ekranie pojawią się tylko te, które na danym urządzeniu
   istnieją i różnią się od poprzednich (Android podstawia np. Roboto pod kilka nazw). */
const OGOLNE = ['sans-serif', 'serif', 'monospace', 'cursive'];
const KANDYDACI = [['sans-serif','Zwykła'],['serif','Szeryfowa'],['monospace','Maszynowa'],['sans-serif-condensed','Wąska'],
  ['sans-serif-light','Cienka'],['sans-serif-black','Bardzo gruba'],['cursive','Odręczna'],['casual','Swobodna'],
  ['serif-monospace','Stara maszyna'],['sans-serif-smallcaps','Kapitaliki'],
  ...['Arial Black','Bahnschrift','Cambria','Comic Sans MS','Consolas','Courier New','Franklin Gothic Medium','Gabriola','Georgia',
    'Impact','Ink Free','Palatino Linotype','Segoe Print','Segoe Script','Times New Roman','Verdana'].map(n => [n, n])];
const DOMYSLNE = { energy:16000, speed:32, copies:1, feed:128, feedMode:'lines', delay:15, pakiet:0,   // 0 = cała ramka w jednym zapisie (sprawdzone na telefonie)
  apStyl:'fs', apJasnosc:0,                    // ostatni styl i jasność w aparacie
  apTryb:'zdjecie', twPorady:true, twSzew:'miekki', twWyrownaj:true,     // twarz z trzech zdjęć (twarz.js)
  wyPorady:true, czMiekki:true, czRownajZdjecia:false };   // twarz z części (czesci.js)
let bloki = [], ust = { ...DOMYSLNE }, nrBloku = 1, dokument = { h:0, px:new Uint8Array(0) };
const obrazy = new Map();                     // src -> ImageBitmap
const cache = new Map();                      // id  -> {klucz, wynik}

const nowyTekst = () => ({ id:nrBloku++, type:'text', text:'', font:'sans-serif', size:40, bold:false, italic:false,
  align:'left', line:1.2, fit:false, banner:false, invert:false });
const nowyOdstep = () => ({ id:nrBloku++, type:'space', h:32, line:'none' });
const noweZdjecie = (src, name) => ({ id:nrBloku++, type:'image', src, name, crop:{x:0,y:0,w:1,h:1}, rot:0, mirror:false, width:100,
  align:'center', bright:0, contrast:1.2, gamma:1.35, dither:'fs', threshold:128, cell:6, invert:false });

/* ======================= RENDEROWANIE BLOKÓW ======================= */
function platno(w, h) {
  const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h);
  const x = c.getContext('2d', { willReadFrequently:true }); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  return x;
}
const pomiar = platno(1, 1);
const nazwaCss = n => OGOLNE.includes(n) ? n : `"${n.replace(/["\\]/g, '')}"`;
const opisCzcionki = (b, size) => `${b.italic ? 'italic ' : ''}${b.bold ? 'bold ' : ''}${size}px ${nazwaCss(b.font)}, sans-serif`;

function dostepneCzcionki() {
  const probka = 'mmwwiillAZ@19gf', znane = new Set(), wynik = [];
  const miara = f => { pomiar.font = `60px ${f}`; return pomiar.measureText(probka).width; };
  for (const [n, opis] of KANDYDACI) {
    const podpis = miara(`${nazwaCss(n)}, monospace`) + '|' + miara(`${nazwaCss(n)}, serif`);
    const brak = !OGOLNE.includes(n) && podpis === miara('monospace') + '|' + miara('serif');
    if (brak || znane.has(podpis)) continue;
    znane.add(podpis); wynik.push([n, opis]);
  }
  return wynik;
}
function zawin(x, tekst, max) {
  const wynik = [];
  for (const akapit of tekst.split('\n')) {
    if (max === Infinity) { wynik.push(akapit); continue; }
    let linia = '';
    for (const kawalek of akapit.match(/\s+|\S+/g) || []) {
      if (x.measureText(linia + kawalek).width <= max) { linia += kawalek; continue; }
      if (/^\s/.test(kawalek)) { wynik.push(linia); linia = ''; continue; }
      if (linia.trim()) { wynik.push(linia.trimEnd()); linia = ''; }
      for (const znak of kawalek) {
        if (linia && x.measureText(linia + znak).width > max) { wynik.push(linia); linia = ''; }
        linia += znak;
      }
    }
    wynik.push(linia);
  }
  return wynik;
}
function doBitow(x, prog) {
  const { width:w, height:h } = x.canvas, d = x.getImageData(0, 0, w, h).data, px = new Uint8Array(w * h);
  for (let i = 0; i < px.length; i++) px[i] = (d[i*4]*0.299 + d[i*4+1]*0.587 + d[i*4+2]*0.114) < prog ? 1 : 0;
  return px;
}
function rysujTekst(b) {
  const tekst = b.text.replace(/\t/g, '    ').replace(/\s+$/, '');
  if (!tekst.trim()) return { h:0, px:new Uint8Array(0) };
  let size = b.size, linie;
  const szer = ls => Math.max(1, ...ls.map(l => pomiar.measureText(l).width));
  const bezZawijania = b.fit || b.banner;
  if (b.banner) {
    const n = tekst.split('\n').length, pelny = W / (n * Math.max(1.15, b.line));
    size = Math.max(6, Math.floor(b.fit ? pelny : Math.min(size, pelny)));
  } else if (b.fit) {
    pomiar.font = opisCzcionki(b, 100);
    size = Math.max(6, Math.min(600, Math.floor(100 * (W - 4) / szer(tekst.split('\n')))));
  }
  pomiar.font = opisCzcionki(b, size);
  linie = zawin(pomiar, tekst, bezZawijania ? Infinity : W);
  const m = pomiar.measureText('Ąg'), asc = m.fontBoundingBoxAscent, desc = m.fontBoundingBoxDescent;
  const lh = size * b.line, zapas = Math.max(0, (asc + desc - lh) / 2);
  const wys = Math.ceil(lh * linie.length + 2 * zapas);
  const cw = b.banner ? Math.min(MAXH, Math.ceil(szer(linie)) + 8) : W;
  const ch = b.banner ? W : Math.min(MAXH, wys);
  const x = platno(cw, ch);
  x.font = opisCzcionki(b, size); x.fillStyle = '#000'; x.textBaseline = 'alphabetic';
  x.textAlign = b.align;
  const px0 = b.align === 'left' ? (b.banner ? 4 : 0) : b.align === 'right' ? cw - (b.banner ? 4 : 0) : cw / 2;
  const y0 = (b.banner ? (W - wys) / 2 : 0) + zapas + (lh - asc - desc) / 2 + asc;
  linie.forEach((l, i) => x.fillText(l, px0, y0 + i * lh));
  let px = doBitow(x, 150), h = ch;
  if (b.banner) {                              // obrót o 90 stopni w prawo
    const o = new Uint8Array(W * cw);
    for (let y = 0; y < cw; y++) for (let k = 0; k < W; k++) o[y * W + k] = px[(W - 1 - k) * cw + y];
    px = o; h = cw;
  }
  if (b.invert) for (let i = 0; i < px.length; i++) px[i] ^= 1;
  return { h, px };
}

const BAYER = [0,32,8,40,2,34,10,42,48,16,56,24,50,18,58,26,12,44,4,36,14,46,6,38,60,28,52,20,62,30,54,22,
               3,35,11,43,1,33,9,41,51,19,59,27,49,17,57,25,15,47,7,39,13,45,5,37,63,31,55,23,61,29,53,21];
function raster(v, w, h, b) {                  // v: jasność 0..1, wynik: 1 = czarna kropka
  const px = new Uint8Array(w * h);
  if (b.dither === 'fs' || b.dither === 'atkinson') {
    const a = Float32Array.from(v);
    const wagi = b.dither === 'fs' ? [[1,0,7/16],[-1,1,3/16],[0,1,5/16],[1,1,1/16]]
                                   : [[1,0,1/8],[2,0,1/8],[-1,1,1/8],[0,1,1/8],[1,1,1/8],[0,2,1/8]];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, czarny = a[i] < 0.5, e = a[i] - (czarny ? 0 : 1);
      px[i] = czarny ? 1 : 0;
      for (const [dx, dy, q] of wagi) { const nx = x + dx, ny = y + dy; if (nx >= 0 && nx < w && ny < h) a[ny * w + nx] += e * q; }
    }
    return px;
  }
  const T = Math.PI * 2 / b.cell;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = b.dither === 'bayer' ? (BAYER[(y & 7) * 8 + (x & 7)] + 0.5) / 64
      : b.dither === 'dots' ? 0.5 + 0.25 * (Math.cos((x + y) * T * Math.SQRT1_2) + Math.cos((x - y) * T * Math.SQRT1_2))
      : b.dither === 'lines' ? 0.5 + 0.5 * Math.cos(y * T)
      : b.threshold / 255;
    px[y * w + x] = v[y * w + x] < Math.max(t, 0.015) ? 1 : 0;   // pełna czerń bez białych prześwitów
  }
  return px;
}
function przygotujZdjecie(b) {                 // kadr, obrót i skala; jeszcze bez strojenia i kropek
  const img = obrazy.get(b.src);
  if (!img) return null;
  const sx = b.crop.x * img.width, sy = b.crop.y * img.height;
  const sw = Math.max(1, b.crop.w * img.width), sh = Math.max(1, b.crop.h * img.height);
  const bok = b.rot % 180 !== 0, rw = bok ? sh : sw, rh = bok ? sw : sh;
  const tw = Math.max(8, Math.round(W * b.width / 100)), th = Math.min(MAXH, Math.max(1, Math.round(tw * rh / rw)));
  const x = platno(tw, th);
  x.imageSmoothingQuality = 'high';
  x.translate(tw / 2, th / 2);
  if (b.mirror) x.scale(-1, 1);
  x.rotate(b.rot * Math.PI / 180);
  const dw = bok ? th : tw, dh = bok ? tw : th;
  x.drawImage(img, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh);
  const off = b.align === 'left' ? 0 : b.align === 'right' ? W - tw : (W - tw) >> 1;
  return { x, tw, th, off };
}
function rysujZdjecie(b) {
  const p = przygotujZdjecie(b);
  if (!p) return { h:0, px:new Uint8Array(0) };
  const { x, tw, th, off } = p;
  const d = x.getImageData(0, 0, tw, th).data, v = new Float32Array(tw * th);
  for (let i = 0; i < v.length; i++) {
    let j = (d[i*4]*0.299 + d[i*4+1]*0.587 + d[i*4+2]*0.114) / 255;
    j = Math.pow(j, 1 / b.gamma);
    j = (j - 0.5) * b.contrast + 0.5 + b.bright / 200;
    j = Math.min(1, Math.max(0, j));
    v[i] = b.invert ? 1 - j : j;
  }
  const maly = raster(v, tw, th, b);
  if (tw === W) return { h:th, px:maly };
  const px = new Uint8Array(W * th);
  for (let y = 0; y < th; y++) px.set(maly.subarray(y * tw, (y + 1) * tw), y * W + off);
  return { h:th, px };
}
function rysujOdstep(b) {
  const px = new Uint8Array(W * b.h), srodek = Math.max(0, (b.h >> 1) - 1);
  if (b.line !== 'none') for (let y = srodek; y < Math.min(b.h, srodek + 2); y++)
    for (let x = 0; x < W; x++) px[y * W + x] = b.line === 'solid' || x % 16 < 9 ? 1 : 0;
  return { h:b.h, px };
}
function rysujBlok(b) {
  const klucz = JSON.stringify({ ...b, src:b.src && b.src.length }) + (b.src ? obrazy.has(b.src) : '');
  const c = cache.get(b.id);
  if (c && c.klucz === klucz) return c.wynik;
  const wynik = b.type === 'text' ? rysujTekst(b) : b.type === 'image' ? rysujZdjecie(b) : rysujOdstep(b);
  cache.set(b.id, { klucz, wynik });
  return wynik;
}
function zloz(czesci) {
  const h = czesci.reduce((s, c) => s + c.h, 0), px = new Uint8Array(W * h);
  let y = 0; for (const c of czesci) { px.set(c.px, y * W); y += c.h; }
  return { h, px };
}
