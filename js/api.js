/**
 * API – suhtlus Apps Scripti taustasüsteemiga.
 *
 * Kõik päringud on POST kujul { action, token, data }.
 * Keha saadetakse tekstina (text/plain), et brauser ei teeks CORS-eelpäringut –
 * Apps Script seda ei toeta.
 */
(function () {
  'use strict';

  var SEANSI_VOTI = 'lao.seanss';
  var API_VOTI = 'lao.apiUrl';

  /** Viga, mille saadab server (või võrguviga). */
  function ApiViga(teade, kood) {
    var e = new Error(teade);
    e.kood = kood || 'VIGA';
    return e;
  }

  /** Apps Scripti aadress: seadmes salvestatud või config.js-ist. */
  function apiUrl() {
    var kohalik = null;
    try { kohalik = localStorage.getItem(API_VOTI); } catch (e) { /* privaatrežiim */ }
    return kohalik || (window.LAO_CONFIG && window.LAO_CONFIG.API_URL) || '';
  }

  function maaraApiUrl(url) {
    try {
      if (url) localStorage.setItem(API_VOTI, url.trim());
      else localStorage.removeItem(API_VOTI);
    } catch (e) { /* ignoreeri */ }
  }

  /** Seadmesse salvestatud seanss { token, kehtibKuni, kasutaja } või null. */
  function seanss() {
    try {
      var s = JSON.parse(localStorage.getItem(SEANSI_VOTI) || 'null');
      if (s && s.token && new Date(s.kehtibKuni) > new Date()) return s;
    } catch (e) { /* ignoreeri */ }
    return null;
  }

  function salvestaSeanss(s) {
    try {
      if (s) localStorage.setItem(SEANSI_VOTI, JSON.stringify(s));
      else localStorage.removeItem(SEANSI_VOTI);
    } catch (e) { /* ignoreeri */ }
  }

  /** Lihtne seadme kirjeldus, mida admin näeb seansside juures. */
  function seadmeKirjeldus() {
    var ua = navigator.userAgent || '';
    var os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'Mac' : 'Muu';
    return os + ' – ' + ua.slice(0, 150);
  }

  /**
   * Saadab päringu serverisse. Tagastab Promise'i serveri "data" väärtusega.
   * Kui seanss on kehtetu, kustutatakse see seadmest ja kutsutakse
   * API.kuiSeanssKehtetu (app.js suunab siis sisselogimisele).
   */
  function kutsu(action, data) {
    var url = apiUrl();
    if (!url) return Promise.reject(ApiViga('API aadress on seadistamata (vaata SEADED).', 'SEADISTAMATA'));
    var s = seanss();
    var keha = JSON.stringify({ action: action, token: s ? s.token : null, data: data || {} });

    return fetch(url, { method: 'POST', body: keha, redirect: 'follow' })
      .catch(function () {
        throw ApiViga('Serveriga ei saa ühendust. Kontrolli internetti.', 'VORK');
      })
      .then(function (vastus) {
        if (!vastus.ok) throw ApiViga('Server vastas veaga (' + vastus.status + ').', 'VORK');
        return vastus.json().catch(function () {
          throw ApiViga('Server ei vastanud korrektselt. Kontrolli API aadressi.', 'VALE_VASTUS');
        });
      })
      .then(function (json) {
        if (json.ok) return json.data;
        if (json.code === 'SEANSS_KEHTETU') {
          salvestaSeanss(null);
          if (typeof API.kuiSeanssKehtetu === 'function') API.kuiSeanssKehtetu(json.error);
        }
        throw ApiViga(json.error || 'Tundmatu viga', json.code);
      });
  }

  var API = {
    kutsu: kutsu,
    apiUrl: apiUrl,
    maaraApiUrl: maaraApiUrl,
    seanss: seanss,
    salvestaSeanss: salvestaSeanss,
    seadmeKirjeldus: seadmeKirjeldus,
    kuiSeanssKehtetu: null
  };
  window.API = API;
})();
