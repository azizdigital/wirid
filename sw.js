/* Panduan Ibadah — Service Worker (offline penuh)
   v5: precache teras + downloader aset dikendalikan oleh halaman (index.html).
   Jika tambah/ubah fail, naikkan nombor versi di bawah. */
const CACHE = 'panduan-wirid-dan-doa';

importScripts('./precache-manifest.js'); // sediakan self.APP_CORE & self.APP_ASSETS

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // Precache teras sahaja semasa install (ringan & pantas).
      // Aset besar (audio/gambar) dimuat turun oleh halaman dengan progress bar.
      return Promise.all((self.APP_CORE || []).map(function (u) {
        return c.add(u).catch(function () { /* jangan gagalkan install */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  var sameOrigin = url.origin === location.origin;

  // Navigasi: cuba rangkaian, gagal -> index.html dari cache (offline)
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (r) {
        var cp = r.clone();
        caches.open(CACHE).then(function (c) { c.put('./index.html', cp); });
        return r;
      }).catch(function () { return caches.match('./index.html'); })
    );
    return;
  }

  // Audio: guna pathname sbg kunci cache (abaikan header Range)
  // supaya offline berfungsi walaupun browser hantar Range request.
  if (sameOrigin && /\.mp3$/i.test(url.pathname)) {
    e.respondWith(
      caches.open(CACHE).then(function (c) {
        return c.match(url.pathname).then(function (cached) {
          if (cached) return cached;
          return fetch(url.pathname).then(function (r) {
            if (r && r.status === 200) {
              var cp = r.clone();
              c.put(url.pathname, cp);
            }
            return r;
          });
        });
      }).catch(function () { return new Response('', { status: 504, statusText: 'Offline' }); })
    );
    return;
  }

  var fontHost = url.hostname.indexOf('googleapis.com') !== -1 || url.hostname.indexOf('gstatic.com') !== -1;

  // Cache-first; simpan ke cache untuk aset sendiri + font Google (offline)
  e.respondWith(
    caches.match(req, { ignoreVary: true }).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (r) {
        if (r && (r.status === 200 || r.type === 'opaque') && (sameOrigin || fontHost)) {
          var cp = r.clone();
          caches.open(CACHE).then(function (c) { c.put(req, cp); });
        }
        return r;
      }).catch(function () { return new Response('', { status: 504, statusText: 'Offline' }); });
    })
  );
});
