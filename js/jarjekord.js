/**
 * JÄRJEKORD – liikumised salvestuvad kohe telefoni ja saadetakse taustal serverisse.
 *
 * Iga liikumine (ja ilma internetita lisatud toode) pannakse kõigepealt seadme
 * järjekorda (IndexedDB; kui see pole saadaval, siis localStorage). Kasutaja saab
 * kinnituse kohe. Taustal saadetakse järjekord serverisse:
 *   - kohe pärast salvestamist, kui internet on olemas;
 *   - kui võrguühendus taastub, rakendus uuesti avatakse või iga 30 s järel.
 * Server tunneb sama id-ga liikumise ära, seega korduv saatmine topelt kirjet ei tee.
 *
 * Järjekorra kirje: { id, liik: 'liikumine' | 'toode', kasutaja_id, loodud,
 *                     andmed, nimetus, olek: 'ootel' | 'viga', viga }
 * Iga kirje saadetakse selle kasutaja nimel, kes selle tegi. Kui kasutaja logis
 * vahepeal välja, jäetakse tema seansivõti seadmesse alles (VANAD_VOTMED), kuni
 * tema liikumised on saadetud.
 */
(function () {
  'use strict';

  var esc = LAO.esc, $ = LAO.$, teade = LAO.teade;
  var DB_NIMI = 'laosusteem', POOD = 'jarjekord';
  var LS_VOTI = 'lao.jarjekord';          // varuvariant, kui IndexedDB pole saadaval
  var VANAD_VOTMED = 'lao.vanadVotmed';   // { kasutaja_id: token }
  var SAADETUD_VOTI = 'lao.saadetud';     // viimati saadetud liikumised (tühistamise eelvaate jaoks)
  var PAKK = 50;                          // mitu liikumist ühe päringuga
  var KORDUSE_VAHE_MS = 30000;
  var AJUTISED_VEAD = ['VORK', 'HOIVATUD', 'SERVERI_VIGA', 'VALE_VASTUS', 'SEADISTAMATA'];

  var kirjed = [];          // järjekord mälus (sama mis seadme mälus), vanemad eespool
  var saatmisel = {};       // id → true: praegu serverisse teel
  var kaib = null;          // käimasoleva sünkroonimise Promise
  var viimaneViga = '';     // viimase ebaõnnestunud saatmise põhjus (olekuriba jaoks)

  // -------------------------------------------------------------------------
  // SEADME MÄLU (IndexedDB, varuvariandina localStorage)
  // -------------------------------------------------------------------------

  var db = null;

  function avaDb() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) return reject(new Error('IndexedDB puudub'));
      var p = indexedDB.open(DB_NIMI, 1);
      p.onupgradeneeded = function () { p.result.createObjectStore(POOD, { keyPath: 'id' }); };
      p.onsuccess = function () { resolve(p.result); };
      p.onerror = function () { reject(p.error); };
    });
  }

  /** IndexedDB päring Promise'ina. */
  function idb(viis, fn) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(POOD, viis);
      var p = fn(tx.objectStore(POOD));
      tx.oncomplete = function () { resolve(p && p.result); };
      tx.onerror = tx.onabort = function () { reject(tx.error); };
    });
  }

  function lsLoe() {
    try { return JSON.parse(localStorage.getItem(LS_VOTI) || '[]'); } catch (e) { return []; }
  }
  function lsKirjuta() {
    try { localStorage.setItem(LS_VOTI, JSON.stringify(kirjed)); } catch (e) { /* täis */ }
  }

  var laetud = avaDb().then(function (d) {
    db = d;
    return idb('readonly', function (s) { return s.getAll(); });
  }).catch(function () {
    db = null; // privaatrežiim vms – kasutame localStorage'it
    return lsLoe();
  }).then(function (list) {
    // Kui varem kasutati localStorage'it, too need kirjed ka kaasa
    var ls = db ? lsLoe() : [];
    kirjed = (list || []).concat(ls.filter(function (k) { return !(list || []).some(function (x) { return x.id === k.id; }); }));
    kirjed.sort(function (a, b) { return a.loodud - b.loodud; });
    if (db && ls.length) {
      return Promise.all(ls.map(salvestaKirje)).then(function () { localStorage.removeItem(LS_VOTI); });
    }
  }).then(function () {
    LAO.rakendaOotel();
    uuendaOlekuriba();
  });

  function salvestaKirje(k) {
    if (db) return idb('readwrite', function (s) { return s.put(k); }).catch(function () { lsKirjuta(); });
    lsKirjuta();
    return Promise.resolve();
  }

  /** Lisab või uuendab kirje (mälus ja seadmes). */
  function pane(k) {
    var i = kirjed.findIndex(function (x) { return x.id === k.id; });
    if (i >= 0) kirjed[i] = k; else kirjed.push(k);
    return salvestaKirje(k);
  }

  /** Eemaldab kirje järjekorrast. */
  function kustuta(id) {
    kirjed = kirjed.filter(function (x) { return x.id !== id; });
    if (db) return idb('readwrite', function (s) { return s['delete'](id); }).catch(function () { lsKirjuta(); });
    lsKirjuta();
    return Promise.resolve();
  }

  // -------------------------------------------------------------------------
  // SEANSIVÕTMED
  // -------------------------------------------------------------------------

  function vanadVotmed() {
    try { return JSON.parse(localStorage.getItem(VANAD_VOTMED) || '{}'); } catch (e) { return {}; }
  }
  function maaraVanaVoti(kasutajaId, token) {
    var v = vanadVotmed();
    if (token) v[kasutajaId] = token; else delete v[kasutajaId];
    try { localStorage.setItem(VANAD_VOTMED, JSON.stringify(v)); } catch (e) { /* ignoreeri */ }
  }

  /** Millise võtmega selle kasutaja kirjeid saata (praegune seanss või varem jäetud võti). */
  function votiKasutajale(kasutajaId) {
    var s = API.seanss();
    if (s && s.kasutaja.id === kasutajaId) return s.token;
    return vanadVotmed()[kasutajaId] || null;
  }

  // Server ütles, et seanss on kehtetu (nt kasutaja lukustati). Kui tal on saatmata
  // liikumisi, jäta võti alles – server võtab need lukustatud kasutajalt vastu konfliktidena.
  API.kuiSeanssKaob = function (s) {
    maaraVanaVoti(s.kasutaja.id, s.token);
    laetud.then(function () {
      if (!ootelArv(s.kasutaja.id)) maaraVanaVoti(s.kasutaja.id, null);
      else synkroniseeri();
    });
  };

  // -------------------------------------------------------------------------
  // JÄRJEKORDA LISAMINE
  // -------------------------------------------------------------------------

  /** Kirjed, mis ootavad saatmist (või millel oli viga). kasutajaId → ainult selle kasutaja omad. */
  function ootel(kasutajaId) {
    return kirjed.filter(function (k) { return !kasutajaId || k.kasutaja_id === kasutajaId; });
  }
  function ootelArv(kasutajaId) {
    return ootel(kasutajaId).length;
  }

  /**
   * Salvestab liikumised järjekorda ja tagastab KOHE (serverit ootamata)
   * tulemused [{ id, ok: true, ootel: true }]. Saldod uuenevad seadmes kohe.
   */
  function salvestaLiikumised(liikumised) {
    var s = API.seanss();
    if (!s) return Promise.reject(new Error('Logi sisse.'));
    return laetud.then(function () {
      var nuud = Date.now();
      return Promise.all(liikumised.map(function (l, i) {
        var t = LAO.toode(l.toote_id);
        if (!l.skannimise_aeg) l.skannimise_aeg = new Date().toISOString();
        return pane({ id: l.id, liik: 'liikumine', kasutaja_id: s.kasutaja.id, loodud: nuud + i,
          andmed: l, nimetus: t ? t.nimetus : '', olek: 'ootel', viga: '' });
      }));
    }).then(function () {
      LAO.rakendaOotel();
      uuendaOlekuriba();
      synkroniseeri();
      return liikumised.map(function (l) { return { id: l.id, ok: true, ootel: true }; });
    });
  }

  /**
   * Ilma internetita lisatud toode: saab telefonis loodud id ja saadetakse
   * serverisse enne sellega seotud liikumisi. Tagastab tooted.lisa-ga sama kuju.
   */
  function lisaToode(data) {
    var s = API.seanss();
    if (!s) return Promise.reject(new Error('Logi sisse.'));
    data.id = data.id || LAO.uusId();
    return laetud.then(function () {
      return pane({ id: data.id, liik: 'toode', kasutaja_id: s.kasutaja.id, loodud: Date.now(),
        andmed: data, nimetus: data.nimetus, olek: 'ootel', viga: '' });
    }).then(function () {
      LAO.rakendaOotel();
      uuendaOlekuriba();
      synkroniseeri();
      return [{ id: data.id, nimetus: data.nimetus, tyyp: data.tyyp, koodid: data.kood ? [{ kood: data.kood }] : [], ootel: true }];
    });
  }

  /**
   * Tühistab liikumise. Kui see on veel saatmata, eemaldatakse see lihtsalt
   * järjekorrast; muidu lisatakse järjekorda TÜHISTUS-liikumine.
   */
  function tyhista(id) {
    var k = kirjed.filter(function (x) { return x.id === id; })[0];
    if (k && !saatmisel[id]) {
      return kustuta(id).then(function () { LAO.rakendaOotel(); uuendaOlekuriba(); return { ok: true }; });
    }
    return salvestaLiikumised([{ id: LAO.uusId(), tyyp: 'TÜHISTUS', viide: id }]).then(function (t) { return t[0]; });
  }

  /** Viimati saadetud liikumine id järgi (või null) – et tühistust saaks seadmes kohe arvestada. */
  function saadetud(id) {
    try { return JSON.parse(localStorage.getItem(SAADETUD_VOTI) || '{}')[id] || null; } catch (e) { return null; }
  }
  function jataSaadetudMeelde(list) {
    try {
      var m = JSON.parse(localStorage.getItem(SAADETUD_VOTI) || '{}');
      list.forEach(function (l) { m[l.id] = { toote_id: l.toote_id, tyyp: l.tyyp, kogus: l.kogus, tegelikKogus: l.tegelikKogus, aeg: Date.now() }; });
      var idd = Object.keys(m).sort(function (a, b) { return m[b].aeg - m[a].aeg; });
      idd.slice(100).forEach(function (id) { delete m[id]; });
      localStorage.setItem(SAADETUD_VOTI, JSON.stringify(m));
    } catch (e) { /* ignoreeri */ }
  }

  // -------------------------------------------------------------------------
  // SÜNKROONIMINE
  // -------------------------------------------------------------------------

  /** Käivitab saatmise (kui juba käib, tagastab sama Promise'i). */
  function synkroniseeri() {
    if (kaib) return kaib;
    kaib = laetud.then(function () {
      if (!navigator.onLine || !kirjed.some(function (k) { return k.olek === 'ootel'; })) return false;
      uuendaOlekuriba();
      var kasutajad = [];
      kirjed.forEach(function (k) { if (k.olek === 'ootel' && kasutajad.indexOf(k.kasutaja_id) < 0) kasutajad.push(k.kasutaja_id); });
      var saatisMidagi = false;
      return jada(kasutajad, function (kid) {
        return saadaKasutajaKirjed(kid).then(function (n) { if (n) saatisMidagi = true; });
      }).then(function () {
        viimaneViga = '';
        return saatisMidagi;
      });
    }).catch(function (err) {
      viimaneViga = err.message;
      return false;
    }).then(function (saatisMidagi) {
      kaib = null;
      saatmisel = {};
      LAO.rakendaOotel();
      uuendaOlekuriba();
      // Pärast edukat saatmist värskenda kogu nimekiri serverist
      if (saatisMidagi && API.seanss()) LAO.laeAndmed().catch(function () {});
      return saatisMidagi;
    });
    uuendaOlekuriba();
    return kaib;
  }

  /** Täidab Promise'e järjest (mitte korraga). */
  function jada(list, fn) {
    return list.reduce(function (p, x) { return p.then(function () { return fn(x); }); }, Promise.resolve());
  }

  /** Saadab ühe kasutaja kirjed: kõigepealt uued tooted, siis liikumised pakkidena. */
  function saadaKasutajaKirjed(kid) {
    var token = votiKasutajale(kid);
    if (!token) return Promise.resolve(0); // ootab, kuni see kasutaja uuesti sisse logib
    var saadetudArv = 0, lukustatud = false;

    function viga(err) {
      // Võrguviga vms → proovime hiljem uuesti. Kehtetu seanss → ootab uut sisselogimist.
      if (err.kood === 'SEANSS_KEHTETU') {
        maaraVanaVoti(kid, null);
        var s = API.seanss();
        if (s && s.kasutaja.id === kid) { API.salvestaSeanss(null); if (API.kuiSeanssKehtetu) API.kuiSeanssKehtetu(err.message); }
      }
      throw err;
    }

    var tooted = kirjed.filter(function (k) { return k.kasutaja_id === kid && k.liik === 'toode' && k.olek === 'ootel'; });
    return jada(tooted, function (k) {
      saatmisel[k.id] = true;
      return API.kutsu('tooted.lisa', Object.assign({}, k.andmed, { vorguta: true }), { token: token }).then(function (vastus) {
        saadetudArv++;
        var r = vastus[0];
        if (r.yhendatud) return seoOlemasolevaga(k, r);
        var t = LAO.toode(k.andmed.id);
        if (t) { t.ootel = false; t.koodid = r.koodid; }
        return kustuta(k.id);
      }, function (err) {
        if (AJUTISED_VEAD.indexOf(err.kood) >= 0 || err.kood === 'SEANSS_KEHTETU') return viga(err);
        // Toodet ei saa lisada (nt vigane sisend) → märgi see ja temaga seotud liikumised vigaseks
        return margiVigaseks(k, err.message).then(function () {
          return jada(kirjed.filter(function (x) { return x.liik === 'liikumine' && x.andmed.toote_id === k.andmed.id; }), function (x) {
            return margiVigaseks(x, 'Toote "' + k.nimetus + '" lisamine ebaõnnestus');
          });
        });
      });
    }).then(function () {
      var liikumised = kirjed.filter(function (k) { return k.kasutaja_id === kid && k.liik === 'liikumine' && k.olek === 'ootel'; });
      var pakid = [];
      for (var i = 0; i < liikumised.length; i += PAKK) pakid.push(liikumised.slice(i, i + PAKK));
      return jada(pakid, function (pakk) {
        pakk.forEach(function (k) { saatmisel[k.id] = true; });
        return API.kutsu('liikumised.lisa', { liikumised: pakk.map(function (k) { return k.andmed; }) }, { token: token })
          .then(function (v) {
            if (v.kasutajaLukustatud) lukustatud = true;
            var konfliktid = [];
            return jada(v.tulemused, function (r) {
              var k = pakk.filter(function (x) { return x.id === r.id; })[0];
              if (!k) return null;
              if (!r.ok) return margiVigaseks(k, r.viga || 'Server ei võtnud vastu');
              saadetudArv++;
              if (r.konflikt && !r.duplikaat) konfliktid.push({ kirje: k, pohjus: r.pohjus });
              return kustuta(k.id);
            }).then(function () {
              jataSaadetudMeelde(pakk.map(function (k) { return k.andmed; }));
              LAO.uuendaSeisud(v.tooted);
              teataKonfliktidest(konfliktid, kid);
              document.dispatchEvent(new CustomEvent('lao:saadetud', { detail: v.tulemused }));
            });
          }, viga);
      });
    }).then(function () {
      if (lukustatud) {
        maaraVanaVoti(kid, null);
        var s = API.seanss();
        if (s && s.kasutaja.id === kid) {
          API.salvestaSeanss(null);
          if (API.kuiSeanssKehtetu) API.kuiSeanssKehtetu('Kasutaja on lukustatud. Saatmata liikumised edastati adminile ülevaatamiseks.');
        }
      } else if (!ootelArv(kid) && vanadVotmed()[kid]) {
        // Välja loginud kasutaja kõik liikumised on saadetud → nüüd võib tema seansi lõpetada
        var vana = vanadVotmed()[kid];
        maaraVanaVoti(kid, null);
        var praegune = API.seanss();
        if (!praegune || praegune.token !== vana) API.kutsu('logout', {}, { token: vana }).catch(function () {});
      }
      return saadetudArv;
    });
  }

  /**
   * Sama koodiga toode oli juba serveris (kaks telefoni lisasid sama asja):
   * seo selle toote liikumised olemasoleva tootega ja märgi need adminile konfliktiks.
   */
  function seoOlemasolevaga(k, r) {
    var pohjus = 'Toode lisati kahest seadmest: "' + k.nimetus + '" seoti olemasoleva tootega "' + r.nimetus + '"';
    var seotud = kirjed.filter(function (x) { return x.liik === 'liikumine' && x.andmed.toote_id === k.andmed.id; });
    return jada(seotud, function (x) {
      x.andmed.toote_id = r.id;
      x.andmed.lisaKonflikt = pohjus;
      x.nimetus = r.nimetus;
      return pane(x);
    }).then(function () {
      return kustuta(k.id);
    }).then(function () {
      teade('„' + k.nimetus + '” oli juba lisatud teisest seadmest (' + r.nimetus + '). Liikumised seoti sellega.', 'viga');
    });
  }

  function margiVigaseks(k, tekst) {
    k.olek = 'viga';
    k.viga = tekst;
    return pane(k);
  }

  /** Teade kasutajale, kui server märkis tema liikumise konfliktiks. */
  function teataKonfliktidest(list, kid) {
    if (!list.length) return;
    var s = API.seanss();
    if (!s || s.kasutaja.id !== kid) return;
    LAO.piiks('hoiatus');
    var esimene = list[0];
    teade((list.length > 1 ? list.length + ' liikumist märgiti' : 'Liikumine märgiti') + ' adminile ülevaatamiseks: ' +
      (esimene.kirje.nimetus ? esimene.kirje.nimetus + ' – ' : '') + esimene.pohjus, 'viga');
  }

  // Automaatne saatmine: võrgu taastumisel, rakenduse avamisel ja regulaarselt
  window.addEventListener('online', function () { uuendaOlekuriba(); synkroniseeri(); });
  window.addEventListener('offline', uuendaOlekuriba);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) synkroniseeri(); });
  setInterval(function () { if (kirjed.some(function (k) { return k.olek === 'ootel'; })) synkroniseeri(); }, KORDUSE_VAHE_MS);
  laetud.then(synkroniseeri);

  // -------------------------------------------------------------------------
  // OLEKURIBA JA OOTEL LIIKUMISTE NIMEKIRI
  // -------------------------------------------------------------------------

  function uuendaOlekuriba() {
    var el = $('#olekuriba');
    if (!el) return;
    var s = API.seanss();
    var ootelN = kirjed.filter(function (k) { return k.olek === 'ootel'; }).length;
    var vigu = kirjed.length - ootelN;
    var tekst, klass;
    if (!navigator.onLine) {
      tekst = '⚠ Võrguühendus puudub' + (ootelN ? ' · Ootel: ' + ootelN : '');
      klass = 'olek-viga';
    } else if (kaib && ootelN) {
      tekst = '⟳ Saadan… (' + ootelN + ')';
      klass = 'olek-hoiatus';
    } else if (ootelN) {
      tekst = '⏳ Ootel: ' + ootelN + ' ' + (ootelN === 1 ? 'liikumine' : 'liikumist') + (viimaneViga ? ' · ' + viimaneViga : '');
      klass = 'olek-hoiatus';
    } else {
      tekst = '✓ Sünkroonitud';
      klass = 'olek-ok';
    }
    if (vigu) { tekst += ' · ⚠ Saatmata (viga): ' + vigu; klass = 'olek-viga'; }
    var konf = s && LAO.andmed.minuKonfliktid ? LAO.andmed.minuKonfliktid.length : 0;
    if (konf) tekst += ' · Sinu konflikte: ' + konf;
    if (s && s.kasutaja.roll === 'ADMIN' && LAO.andmed.konfliktideArv) tekst += ' · KONFLIKTE: ' + LAO.andmed.konfliktideArv;
    el.textContent = tekst;
    el.className = 'olekuriba ' + klass;
    el.title = 'Ava ootel liikumiste nimekiri';
  }

  /** Olekuriba vajutus → ootel liikumiste ja oma konfliktide nimekiri. */
  function avaNimekiri() {
    var s = API.seanss();
    var TYYP_NIMI = { 'VÄLJA_ANTUD': 'VÄLJA ANTUD', 'OLEKU_MUUTUS': 'OLEK' };
    var read = kirjed.slice().reverse().map(function (k) {
      var l = k.andmed, sisu;
      if (k.liik === 'toode') sisu = '<b>UUS TOODE</b> ' + esc(l.nimetus) + (l.kood ? ' <span class="vaike">' + esc(l.kood) + '</span>' : '');
      else {
        var t = LAO.toode(l.toote_id);
        sisu = '<b>' + esc(TYYP_NIMI[l.tyyp] || l.tyyp) + '</b> ' +
          (['SISSE', 'VÄLJA', 'KORRIGEERIMINE'].indexOf(l.tyyp) >= 0 ? esc(LAO.arvTekst(l.tegelikKogus !== undefined ? l.tegelikKogus : l.kogus)) + ' ' + esc(t ? t.yhik : '') + ' ' : '') +
          esc(k.nimetus || (t ? t.nimetus : '')) +
          (l.tyyp === 'VÄLJA_ANTUD' ? ' → ' + esc(l.kellele_kuhu) : '');
      }
      var muuKasutaja = s && k.kasutaja_id !== s.kasutaja.id ? ' <span class="vaike">(teine kasutaja)</span>' : '';
      return '<li class="ootel-rida' + (k.olek === 'viga' ? ' ootel-viga' : '') + '">' +
        '<div>' + sisu + muuKasutaja + '<div class="vaike">' + esc(LAO.aeg(l.skannimise_aeg || k.loodud)) +
        (k.olek === 'viga' ? ' · <b>Viga:</b> ' + esc(k.viga) : saatmisel[k.id] ? ' · saadan…' : ' · ootel') + '</div></div>' +
        (k.olek === 'viga' ? '<button type="button" class="nupp nupp-vaike nupp-oht" data-kustuta="' + esc(k.id) + '">Kustuta</button>' : '') +
        '</li>';
    }).join('');
    var konf = (LAO.andmed.minuKonfliktid || []).map(function (c) {
      return '<li class="ootel-rida"><div><b>' + esc(TYYP_NIMI[c.tyyp] || c.tyyp) + '</b> ' + esc(c.nimetus) +
        '<div class="vaike">' + esc(LAO.aeg(c.aeg)) + ' · ' + esc(c.pohjus) + '</div></div></li>';
    }).join('');
    var d = LAO.modaal('Sünkroonimine',
      '<form><p>' + esc($('#olekuriba').textContent) + '</p>' +
      (read ? '<ul class="ootel-nimekiri">' + read + '</ul>' : '<p class="vaike">Kõik liikumised on serverisse saadetud.</p>') +
      (konf ? '<h3>Sinu liikumised, mis ootavad admini ülevaatust</h3><ul class="ootel-nimekiri">' + konf + '</ul>' : '') +
      (s && s.kasutaja.roll === 'ADMIN' && LAO.andmed.konfliktideArv ? '<p><a href="#/konfliktid" data-sulge-link>Ava KONFLIKTID (' + LAO.andmed.konfliktideArv + ')</a></p>' : '') +
      '<div class="nupurida"><button type="button" class="nupp" data-sulge>Sulge</button>' +
      '<button type="submit" class="nupp nupp-pohi"' + (navigator.onLine ? '' : ' disabled') + '>Saada kohe</button></div></form>',
      function () {
        return synkroniseeri().then(function () {
          var veel = kirjed.filter(function (k) { return k.olek === 'ootel'; }).length;
          if (veel && viimaneViga) throw new Error(viimaneViga);
          teade(veel ? 'Ootel veel ' + veel + '.' : 'Kõik saadetud.');
        });
      });
    Array.prototype.forEach.call(d.querySelectorAll('[data-kustuta]'), function (b) {
      b.addEventListener('click', function () {
        if (!confirm('Kustutada see saatmata kirje? Seda ei saa tagasi võtta.')) return;
        kustuta(b.dataset.kustuta).then(function () { LAO.rakendaOotel(); uuendaOlekuriba(); d.close(); avaNimekiri(); });
      });
    });
    var link = d.querySelector('[data-sulge-link]');
    if (link) link.addEventListener('click', function () { d.close(); });
  }

  var riba = $('#olekuriba');
  if (riba) {
    riba.setAttribute('role', 'button');
    riba.tabIndex = 0;
    riba.addEventListener('click', avaNimekiri);
    riba.addEventListener('keydown', function (e) { if (e.key === 'Enter') avaNimekiri(); });
  }

  LAO.jarjekord = {
    kirjed: function () { return kirjed; },
    ootelArv: ootelArv,
    lisaToode: lisaToode,
    tyhista: tyhista,
    saadetud: saadetud,
    synkroniseeri: synkroniseeri,
    maaraVanaVoti: maaraVanaVoti,
    laetud: laetud
  };
  LAO.salvestaLiikumised = salvestaLiikumised;
  LAO.uuendaOlekuriba = uuendaOlekuriba;
})();
