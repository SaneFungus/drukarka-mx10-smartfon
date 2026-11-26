'use strict';
/* Praca bez internetu i odbiór treści z "Udostępnij do MX10":
   - zapisane pliki podawane są od razu z pamięci telefonu (brak czekania przy słabym zasięgu),
   - w tle cała paczka sprawdzana jest jako całość, żeby nigdy nie zmieszać starych i nowych skryptów,
   - kasowane są tylko własne kopie (przedrostek "mx10-"). */
const KOPIA = 'mx10-9';
const PLIKI = ['./', 'styl.css', 'rdzen.js', 'qr.js', 'drukarka.js', 'aparat.js', 'twarz.js', 'czesci.js', 'paski.js', 'ekran.js',
  'manifest.webmanifest', 'ikony/ikona-192.png', 'ikony/ikona-512.png', 'ikony/ikona-maska-512.png'];
let ostatnieOdswiezanie = 0;

function bazaUdostepnionych() {
  return new Promise((ok, zle) => {
    const r = indexedDB.open('mx10-udostepnione', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('dane');
    r.onsuccess = () => ok(r.result); r.onerror = () => zle(r.error);
  });
}

async function zapiszUdostepnione(zadanie) {
  const form = await zadanie.formData();
  const pliki = form.getAll('zdjecia').filter(f => f && typeof f.size === 'number' && f.size > 0);
  const pola = { title:form.get('title') || '', text:form.get('text') || '', url:form.get('url') || '' };
  const db = await bazaUdostepnionych(), t = db.transaction('dane', 'readwrite');
  t.objectStore('dane').put({ pliki, ...pola, czas:Date.now() }, 'ostatnie');
  await new Promise((ok, zle) => { t.oncomplete = ok; t.onerror = () => zle(t.error); });
  db.close();
}

async function odswiezPaczke() {
  const teraz = Date.now();
  if (teraz - ostatnieOdswiezanie < 20000) return;
  ostatnieOdswiezanie = teraz;
  try {
    const pobrane = await Promise.all(PLIKI.map(async p => {
      const o = await fetch(p, { cache:'no-cache', signal:AbortSignal.timeout(5000) });
      if (!o.ok) throw new Error(p);
      return [p, o];
    }));
    const k = await caches.open(KOPIA);
    await Promise.all(pobrane.map(([p, o]) => k.put(p, o)));
  } catch {}
}

self.addEventListener('install', e => {
  e.waitUntil(caches.open(KOPIA).then(k => k.addAll(PLIKI.map(p => new Request(p, { cache:'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(nazwy => Promise.all(nazwy.filter(n => n.startsWith('mx10-') && n !== KOPIA).map(n => caches.delete(n))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const z = e.request, u = new URL(z.url);
  if (u.origin !== location.origin) return;
  if (z.method === 'POST' && u.searchParams.has('udostepnione')) {
    e.respondWith(zapiszUdostepnione(z).then(() => Response.redirect('./?odbierz=1', 303)).catch(() => Response.redirect('./', 303)));
    return;
  }
  if (z.method !== 'GET') return;
  e.respondWith((async () => {
    const k = await caches.open(KOPIA);
    const zapisany = await k.match(z, { ignoreSearch:true }) || (z.mode === 'navigate' && await k.match('./'));
    if (zapisany) {
      if (z.mode === 'navigate') e.waitUntil(odswiezPaczke());
      return zapisany;
    }
    const o = await fetch(z);
    if (o.ok) await k.put(z, o.clone());
    return o;
  })());
});
