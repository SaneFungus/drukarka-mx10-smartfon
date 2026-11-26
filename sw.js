'use strict';
/* Praca bez internetu: najpierw sieć (żeby zawsze była najnowsza wersja), a bez sieci ostatnia zapamiętana kopia.
   Kasowane są tylko własne kopie (przedrostek "mx10-"), bo inne strony z tego samego adresu też mogą je mieć. */
const KOPIA = 'mx10-5';
const PLIKI = ['./', 'styl.css', 'rdzen.js', 'drukarka.js', 'aparat.js', 'twarz.js', 'czesci.js', 'ekran.js', 'manifest.webmanifest','ikony/ikona-192.png', 'ikony/ikona-512.png', 'ikony/ikona-maska-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(KOPIA).then(k => k.addAll(PLIKI.map(p => new Request(p, { cache:'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(nazwy => Promise.all(nazwy.filter(n => n.startsWith('mx10-') && n !== KOPIA).map(n => caches.delete(n))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const z = e.request;
  if (z.method !== 'GET' || new URL(z.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const k = await caches.open(KOPIA);
    try {
      // no-cache: pytaj serwer o świeżość, żeby po aktualizacji nie zmieszać starych i nowych plików
      const o = await fetch(z.url, { cache:'no-cache', signal:AbortSignal.timeout(4000) });
      if (o.ok) await k.put(z, o.clone());
      return o;
    } catch (blad) {
      const zapas = await k.match(z, { ignoreSearch:true }) || (z.mode === 'navigate' && await k.match('./'));
      if (zapas) return zapas;
      throw blad;
    }
  })());
});
