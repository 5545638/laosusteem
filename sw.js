/**
 * SERVICE WORKER – rakendus avaneb ka ilma internetita.
 *
 * Paigaldamisel salvestatakse brauseri vahemällu kõik rakenduse failid (FAILID).
 * Leht ise (index.html) ja config.js loetakse alati kõigepealt võrgust (et uuendused
 * jõuaksid kohe kohale) ja ainult siis vahemälust, kui võrku pole. Ülejäänud failid
 * on versiooninumbriga (?v=5) ja tulevad otse vahemälust – kiire avanemine.
 * API päringud (script.google.com) käivad alati otse serverisse, neid ei puudutata.
 *
 * UUENDAMISEL: tõsta VERSIOON ja ?v= numbrid siin ja failis index.html.
 */
var VERSIOON = 'laosusteem-v5';
var FAILID = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css?v=5',
  'js/config.js?v=5',
  'js/api.js?v=5',
  'js/app.js?v=5',
  'js/andmed.js?v=5',
  'js/jarjekord.js?v=5',
  'js/tooted.js?v=5',
  'js/riiulid.js?v=5',
  'js/import.js?v=5',
  'js/vendor/html5-qrcode.min.js?v=2.3.8',
  'js/skanner.js?v=5',
  'js/skannimine.js?v=5',
  'js/vendor/jsbarcode.all.min.js?v=3.11.6',
  'js/vendor/qrcode.js?v=1.4.4',
  'js/sildid.js?v=5',
  'js/ulevaated.js?v=5',
  'js/konfliktid.js?v=5',
  'ikoonid/ikoon-192.png',
  'ikoonid/ikoon-512.png',
  'ikoonid/favicon-32.png',
  'ikoonid/apple-touch-icon.png'
];
var VORGU_OOTEAEG_MS = 4000;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSIOON).then(function (c) { return c.addAll(FAILID); }).then(function () { return self.skipWaiting(); }));
});

// Vanade versioonide vahemälud kustutatakse
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (nimed) {
    return Promise.all(nimed.filter(function (n) { return n !== VERSIOON; }).map(function (n) { return caches['delete'](n); }));
  }).then(function () { return self.clients.claim(); }));
});

/** Võrgust (kui vastab mõistliku ajaga), muidu vahemälust. */
function vorkEnne(paring, varuVoti) {
  return new Promise(function (resolve, reject) {
    var valmis = false;
    var taimer = setTimeout(function () {
      caches.match(varuVoti || paring).then(function (v) { if (v && !valmis) { valmis = true; resolve(v); } });
    }, VORGU_OOTEAEG_MS);
    fetch(paring).then(function (vastus) {
      clearTimeout(taimer);
      if (vastus.ok) {
        var koopia = vastus.clone();
        caches.open(VERSIOON).then(function (c) { c.put(varuVoti || paring, koopia); });
      }
      if (!valmis) { valmis = true; resolve(vastus); }
    }).catch(function () {
      clearTimeout(taimer);
      caches.match(varuVoti || paring).then(function (v) {
        if (valmis) return;
        valmis = true;
        if (v) resolve(v); else reject(new Error('Võrguühendus puudub'));
      });
    });
  });
}

self.addEventListener('fetch', function (e) {
  var p = e.request;
  if (p.method !== 'GET') return;
  var url = new URL(p.url);
  if (url.origin !== self.location.origin) return; // API ja muud serverid – otse

  if (p.mode === 'navigate') { e.respondWith(vorkEnne(p, 'index.html')); return; }
  if (/\/js\/config\.js$/.test(url.pathname)) { e.respondWith(vorkEnne(p)); return; }
  // Versioonitud failid: vahemälust, puudumisel võrgust (ja salvesta)
  e.respondWith(caches.match(p).then(function (v) {
    return v || fetch(p).then(function (vastus) {
      if (vastus.ok) { var koopia = vastus.clone(); caches.open(VERSIOON).then(function (c) { c.put(p, koopia); }); }
      return vastus;
    });
  }));
});
