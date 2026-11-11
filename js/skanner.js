/**
 * SKÄNNER – koodi lugemine kaamerast, USB-skännerist või käsitsi.
 *
 * Kaamera: oma videovoog (kuni 1920×1080) + ZXing-C++ WebAssembly dekooder
 * (js/vendor/zxing-reader.min.js), loeb QR-koode ning EAN-13/8, UPC-A/E, Code128, Code39.
 * Kui WebAssembly ei laadi, kasutatakse varuks html5-qrcode teeki (aeglasem).
 * USB-skänner käitub nagu klaviatuur: see "kirjutab" koodi tekstivälja ja
 * vajutab Enterit, seega sama väli sobib ka käsitsi sisestamiseks.
 *
 * Kasutamine:
 *   var sk = LAO.looSkanner(element, function (kood) { ... });
 *   sk.paus(true/false)  – ei reageeri koodidele (nt kui vorm on lahti)
 *   sk.peata()           – lülitab kaamera välja (vaatest lahkudes)
 */
(function () {
  'use strict';

  var esc = LAO.esc;
  var KAAMERA_VOTI = 'lao.kaamera';
  var KORDUSE_VAHE_MS = 2500; // sama koodi uuesti lugemine alles pärast seda

  /** Kas seade on puuteekraaniga (telefon/tahvel) – siis kaamera vaikimisi sees. */
  function onPuude() {
    return window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  }

  function kaameraSoovitud() {
    try {
      var v = localStorage.getItem(KAAMERA_VOTI);
      if (v !== null) return v === '1';
    } catch (e) { /* ignoreeri */ }
    return onPuude();
  }

  function salvestaKaameraSoov(jah) {
    try { localStorage.setItem(KAAMERA_VOTI, jah ? '1' : '0'); } catch (e) { /* ignoreeri */ }
  }

  // Kasutaja valitud kaamera (SEADED). Tühi = automaatne tagakaamera.
  // Vajalik nt iPhone Pro puhul, mis vahetab lähedal automaatselt kaamerat ja pilt hägustub.
  var KAAMERA_ID_VOTI = 'lao.kaameraId', KAAMERA_NIMI_VOTI = 'lao.kaameraNimi';

  function valitudKaamera() {
    try { return { id: localStorage.getItem(KAAMERA_ID_VOTI) || '', nimi: localStorage.getItem(KAAMERA_NIMI_VOTI) || '' }; }
    catch (e) { return { id: '', nimi: '' }; }
  }

  function valiKaamera(id, nimi) {
    try {
      if (id) { localStorage.setItem(KAAMERA_ID_VOTI, id); localStorage.setItem(KAAMERA_NIMI_VOTI, nimi || ''); }
      else { localStorage.removeItem(KAAMERA_ID_VOTI); localStorage.removeItem(KAAMERA_NIMI_VOTI); }
    } catch (e) { /* ignoreeri */ }
  }

  // iPhone Pro: brauseri "tagakaamera" on virtuaalne mitme objektiiviga kaamera, mis vahetab lähedal
  // objektiivi ja pilt hägustub. Kui kasutaja pole kaamerat valinud, leitakse esimesel käivitamisel
  // tavaline (1×) tagakaamera ja jäetakse see meelde.
  var AUTO_VOTI = 'lao.kaameraAuto';

  function automaatneKaamera() {
    try { return localStorage.getItem(AUTO_VOTI) || ''; } catch (e) { return ''; }
  }

  function unustaAutomaatne() {
    try { localStorage.removeItem(AUTO_VOTI); } catch (e) { /* ignoreeri */ }
  }

  function onIos() {
    return /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  /**
   * Valib tagakaamerate seast tavalise: välistab ülilainurga, tele ning mitme objektiiviga (Dual/Triple)
   * kaamerad; kui nimed on tundmatus keeles, võtab lühima nimega (iOS-is "Back Camera").
   * Tagastab deviceId või '' (kui tagakaameraid on ainult üks või midagi ei leitud).
   */
  function valiTavalineKaamera(seadmed) {
    var esi = /front|esi|eesmine|selfie|user|facetime/i;
    var tagumised = seadmed.filter(function (d) {
      if (d.kind !== 'videoinput' || !d.label) return false;
      try {
        var v = d.getCapabilities && d.getCapabilities().facingMode;
        if (v && v.length) return v.indexOf('environment') >= 0;
      } catch (e) { /* ignoreeri */ }
      return !esi.test(d.label);
    });
    if (tagumised.length < 2) return '';
    var eri = /ultra|wide|tele|dual|triple|lainurk|kahe|kolme|topelt/i;
    var tavalised = tagumised.filter(function (d) { return !eri.test(d.label); });
    var hulk = tavalised.length ? tavalised : tagumised;
    hulk.sort(function (a, b) { return a.label.length - b.label.length; });
    return hulk[0].deviceId;
  }

  /** Seadme kaamerate nimekiri [{id, label}] (küsib vajadusel kaamera luba). */
  function kaamerad() {
    if (typeof Html5Qrcode === 'undefined') return Promise.reject(new Error('Kaamera teek ei laadinud.'));
    return Html5Qrcode.getCameras();
  }

  // -------------------------------------------------------------------------
  // DEKOODER (ZXing-C++ WebAssembly, js/vendor/zxing-reader.min.js + zxing_reader.wasm)
  // -------------------------------------------------------------------------

  var ZXING_WASM = 'js/vendor/zxing_reader.wasm?v=3.1.6';
  var LUGEMISE_SEADED = {
    // Riiuli- ja tootesildid on QR; vöötkoodid jäävad tootjakoodide jaoks (ZXing-C++ loeb neid kiiresti)
    formats: ['QRCode', 'EAN13', 'EAN8', 'UPCA', 'UPCE', 'Code128', 'Code39'],
    tryHarder: true,
    tryInvert: false,
    maxNumberOfSymbols: 1
  };
  var dekooder = null;

  /** Laeb dekoodri (üks kord); Promise lükatakse tagasi, kui brauser WebAssemblyt ei toeta. */
  function laeDekooder() {
    if (!dekooder) {
      if (!window.ZXingWASM || typeof WebAssembly !== 'object') return Promise.reject(new Error('WebAssembly puudub'));
      dekooder = Promise.resolve(window.ZXingWASM.prepareZXingModule({
        overrides: { locateFile: function (f, eesliide) { return /\.wasm$/.test(f) ? ZXING_WASM : eesliide + f; } },
        fireImmediately: true
      })).catch(function (err) { dekooder = null; throw err; });
    }
    return dekooder;
  }

  // -------------------------------------------------------------------------
  // HELI JA VIBRATSIOON
  // -------------------------------------------------------------------------

  var audio = null;
  /** Brauserid lubavad heli alles pärast esimest puudutust – valmistame selle siis ette. */
  document.addEventListener('pointerdown', function () {
    if (!audio && (window.AudioContext || window.webkitAudioContext)) {
      try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audio = null; }
    }
    if (audio && audio.state === 'suspended') audio.resume();
  }, { passive: true });

  /** Lühike piiks. tyyp: 'ok' (kõrge), 'viga' (madal topeltpiiks), 'hoiatus'. */
  function piiks(tyyp) {
    try {
      if (navigator.vibrate) navigator.vibrate(tyyp === 'viga' ? [80, 60, 80] : 60);
    } catch (e) { /* ignoreeri */ }
    if (!audio) return;
    var toonid = tyyp === 'viga' ? [[330, 0], [260, 0.18]] : tyyp === 'hoiatus' ? [[600, 0], [600, 0.15]] : [[1320, 0]];
    toonid.forEach(function (t) {
      var o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = t[0];
      o.type = 'square';
      g.gain.value = 0.08;
      o.connect(g); g.connect(audio.destination);
      var algus = audio.currentTime + t[1];
      o.start(algus);
      o.stop(algus + 0.12);
    });
  }

  // -------------------------------------------------------------------------
  // SKÄNNERI KOMPONENT
  // -------------------------------------------------------------------------

  var loendur = 0;

  function looSkanner(konteiner, kuiKood, valikud) {
    valikud = valikud || {};
    var id = 'kaamera' + (++loendur);
    konteiner.innerHTML =
      '<div class="skanner">' +
      '  <div class="kaamera-raam" id="' + id + '-raam" hidden><div id="' + id + '"></div></div>' +
      '  <p class="kaamera-teade vaike" id="' + id + '-teade" hidden></p>' +
      '  <form class="kasitsi" autocomplete="off">' +
      '    <input name="kood" placeholder="' + esc(valikud.vihje || 'Skänni või sisesta kood') + '" autocapitalize="characters" enterkeyhint="go">' +
      '    <button type="submit" class="nupp nupp-pohi">OK</button>' +
      '    <button type="button" class="nupp kaamera-nupp" title="Kaamera sisse/välja">📷</button>' +
      '  </form>' +
      '</div>';

    var raam = konteiner.querySelector('#' + id + '-raam');
    var teadeEl = konteiner.querySelector('#' + id + '-teade');
    var vorm = konteiner.querySelector('form.kasitsi');
    var kaameraNupp = konteiner.querySelector('.kaamera-nupp');
    var lugeja = null;     // Html5Qrcode
    var kaameraSees = false;
    var pausil = false;
    var viimane = { kood: null, aeg: 0 };

    function tuvastatud(kood, allikas) {
      kood = String(kood || '').trim();
      if (!kood || pausil) return;
      var nuud = Date.now();
      if (allikas === 'kaamera' && kood === viimane.kood && nuud - viimane.aeg < KORDUSE_VAHE_MS) return;
      viimane = { kood: kood, aeg: nuud };
      kuiKood(kood, new Date());
    }

    vorm.addEventListener('submit', function (e) {
      e.preventDefault();
      var kood = vorm.kood.value;
      vorm.kood.value = '';
      tuvastatud(kood, 'kasitsi');
    });

    function naitaTeadet(t) {
      teadeEl.textContent = t || '';
      teadeEl.hidden = !t;
    }

    // --- Kaamera ---
    // Põhiviis: oma videovoog kõrge resolutsiooniga + ZXing-C++ (WebAssembly) dekooder,
    // mis loeb pildi nähtava osa täisresolutsioonis (~5–20 ms kaadri kohta).
    // Varuviis (kui WebAssembly ei laadi): html5-qrcode nagu varem.
    var voog = null, video = null, tsykliId = 0, varuviis = false;

    function kaivitaKaamera() {
      if (kaameraSees) return Promise.resolve();
      if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        naitaTeadet('Kaamera töötab ainult https-aadressil.'); return Promise.resolve();
      }
      raam.hidden = false;
      naitaTeadet('');
      kaameraSees = true;
      kaameraNupp.classList.add('aktiivne');
      var tsykkel = ++tsykliId;
      return laeDekooder().then(function () {
        if (tsykkel !== tsykliId) return;
        return kaivitaOmaKaamera(tsykkel);
      }, function () {
        if (tsykkel !== tsykliId) return;
        varuviis = true;
        return kaivitaHtml5();
      }).catch(kaameraViga);
    }

    function kaameraViga(err) {
      kaameraSees = false;
      tsykliId++;
      kaameraNupp.classList.remove('aktiivne');
      raam.hidden = true;
      var t = String(err && (err.name || err.message || err));
      naitaTeadet(/NotAllowed|Permission/i.test(t)
        ? 'Kaamera kasutamine on keelatud. Luba see brauseri seadetes (aadressiriba lukuikoon) või sisesta kood käsitsi.'
        : 'Kaamerat ei õnnestunud käivitada: ' + t);
    }

    function kaivitaOmaKaamera(tsykkel) {
      var valitud = valitudKaamera().id || automaatneKaamera();
      return avaVoog(valitud).catch(function (err) {
        // Valitud kaamerat pole enam (nt teine seade) – proovi automaatset tagakaamerat
        if (!valitud || /NotAllowed|Permission/i.test(String(err && (err.name || err.message || err)))) throw err;
        unustaAutomaatne();
        return avaVoog('');
      }).then(function (s) {
        if (tsykkel !== tsykliId) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
        voog = s;
        var rada = s.getVideoTracks()[0];
        // Pidev teravustamine, kus brauser seda lubab (iOS teeb seda niigi)
        try { rada.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(function () {}); } catch (e) { /* ignoreeri */ }
        var el = konteiner.querySelector('#' + id);
        el.innerHTML = '<video class="oma" playsinline muted autoplay></video><div class="sihik"></div>';
        video = el.querySelector('video');
        video.setAttribute('playsinline', ''); video.muted = true;
        video.srcObject = s;
        var mangi = video.play();
        if (mangi && mangi.catch) mangi.catch(function () {});
        // iPhone: kui kaamerat pole valitud, jäta meelde tavaline tagakaamera (vt automaatneKaamera)
        if (!valitudKaamera().id && !automaatneKaamera()) leiaTavalineKaamera(rada);
        loeKaadreid(tsykkel);
      });
    }

    /** iPhone'il: leia tavaline tagakaamera, jäta meelde ja vajadusel käivita kaamera sellega uuesti. */
    function leiaTavalineKaamera(rada) {
      if (!onIos() || !navigator.mediaDevices.enumerateDevices) return;
      navigator.mediaDevices.enumerateDevices().then(function (seadmed) {
        var tavaline = valiTavalineKaamera(seadmed);
        if (!tavaline) return;
        try { localStorage.setItem(AUTO_VOTI, tavaline); } catch (e) { /* ignoreeri */ }
        var praegu = rada.getSettings ? rada.getSettings().deviceId : '';
        if (praegu !== tavaline && kaameraSees) {
          peataKaamera().then(kaivitaKaamera);
        }
      }).catch(function () { /* ignoreeri */ });
    }

    function avaVoog(kaameraId) {
      var v = { width: { ideal: 1920 }, height: { ideal: 1080 } };
      if (kaameraId) v.deviceId = { exact: kaameraId };
      else v.facingMode = { ideal: 'environment' };
      return navigator.mediaDevices.getUserMedia({ audio: false, video: v });
    }

    var louend = null, louendCtx = null;
    var MAX_KYLG = 1440; // dekodeeritava pildi pikim külg (px); suurem pilt vähendatakse

    /** Lõikab video nähtava osa (object-fit: cover) ja annab selle dekoodrile. */
    function loeKaadreid(tsykkel) {
      var hoivatud = false;
      function jargmine() {
        if (tsykkel !== tsykliId) return;
        if (video && video.requestVideoFrameCallback) video.requestVideoFrameCallback(samm);
        else setTimeout(samm, 40);
      }
      function samm() {
        if (tsykkel !== tsykliId) return;
        var vw = video.videoWidth, vh = video.videoHeight;
        if (hoivatud || pausil || !vw || !vh || video.readyState < 2) return jargmine();
        var ew = video.clientWidth || vw, eh = video.clientHeight || vh;
        var mootkava = Math.max(ew / vw, eh / vh);          // object-fit: cover
        var sw = Math.min(vw, ew / mootkava), sh = Math.min(vh, eh / mootkava);
        var sx = (vw - sw) / 2, sy = (vh - sh) / 2;
        var k = Math.min(1, MAX_KYLG / Math.max(sw, sh));
        var cw = Math.round(sw * k), ch = Math.round(sh * k);
        if (!louend) { louend = document.createElement('canvas'); }
        if (louend.width !== cw || louend.height !== ch) { louend.width = cw; louend.height = ch; louendCtx = null; }
        louendCtx = louendCtx || louend.getContext('2d', { willReadFrequently: true });
        louendCtx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch);
        var pilt = louendCtx.getImageData(0, 0, cw, ch);
        hoivatud = true;
        window.ZXingWASM.readBarcodes(pilt, LUGEMISE_SEADED).then(function (tulem) {
          hoivatud = false;
          if (tsykkel !== tsykliId) return;
          var leitud = tulem && tulem.filter(function (t) { return t.isValid && t.text; })[0];
          if (leitud) tuvastatud(leitud.text, 'kaamera');
          jargmine();
        }, function () { hoivatud = false; jargmine(); });
      }
      jargmine();
    }

    /** Varuviis: html5-qrcode teek (aeglasem, loeb vähendatud pildilt). */
    function kaivitaHtml5() {
      if (typeof Html5Qrcode === 'undefined') { kaameraSees = false; kaameraNupp.classList.remove('aktiivne'); raam.hidden = true; naitaTeadet('Kaamera teek ei laadinud. Sisesta kood käsitsi.'); return Promise.resolve(); }
      var F = Html5QrcodeSupportedFormats;
      lugeja = lugeja || new Html5Qrcode(id, {
        verbose: false,
        formatsToSupport: [F.QR_CODE, F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39],
        experimentalFeatures: { useBarCodeDetectorIfSupported: true }
      });
      var seaded = {
        fps: 12,
        qrbox: function (w, h) { return { width: Math.floor(w * 0.85), height: Math.floor(Math.min(h * 0.6, w * 0.5)) }; }
      };
      var kaivita = function (kaamera) {
        return lugeja.start(kaamera, seaded,
          function (tekst) { tuvastatud(tekst, 'kaamera'); },
          function () { /* iga kaader ilma koodita – ignoreeri */ });
      };
      var valitud = valitudKaamera().id;
      return kaivita(valitud || { facingMode: 'environment' }).catch(function (err) {
        if (!valitud || /NotAllowed|Permission/i.test(String(err && (err.name || err.message || err)))) throw err;
        return kaivita({ facingMode: 'environment' });
      });
    }

    function peataKaamera() {
      if (!kaameraSees) return Promise.resolve();
      kaameraSees = false;
      tsykliId++;
      kaameraNupp.classList.remove('aktiivne');
      raam.hidden = true;
      if (voog) { voog.getTracks().forEach(function (t) { t.stop(); }); voog = null; }
      if (video) { video.srcObject = null; video = null; konteiner.querySelector('#' + id).innerHTML = ''; }
      if (varuviis && lugeja) return lugeja.stop().catch(function () { /* juba peatatud */ });
      return Promise.resolve();
    }

    kaameraNupp.addEventListener('click', function () {
      if (kaameraSees) { salvestaKaameraSoov(false); peataKaamera(); }
      else { salvestaKaameraSoov(true); kaivitaKaamera(); }
    });

    // Telefoni lukustamisel / teise äpi avamisel lülita kaamera välja ja tagasi tulles sisse
    function nahtavus() {
      if (document.hidden) peataKaamera();
      else if (kaameraSoovitud() && !valikud.kaameraValjas) kaivitaKaamera();
    }
    document.addEventListener('visibilitychange', nahtavus);

    if (kaameraSoovitud() && !valikud.kaameraValjas) kaivitaKaamera();
    if (!onPuude()) vorm.kood.focus(); // arvutis fookus väljale USB-skänneri jaoks

    return {
      // Pausil (vorm lahti): kaamerapilt tehakse väiksemaks, et vorm mahuks ekraanile
      paus: function (jah) { pausil = !!jah; konteiner.querySelector('.skanner').classList.toggle('pausil', pausil); },
      /** Fookus käsitsi väljale (arvutis pärast toimingut) */
      fookus: function () { if (!onPuude()) vorm.kood.focus(); },
      peata: function () {
        document.removeEventListener('visibilitychange', nahtavus);
        return peataKaamera();
      },
      peataKaamera: peataKaamera,
      kaivitaKaamera: function () { if (kaameraSoovitud()) return kaivitaKaamera(); return Promise.resolve(); }
    };
  }

  /**
   * Avab akna, milles saab skännida ühe koodi (nt riiuli silt toote lisamise vormis).
   * Tagastab Promise'i koodiga (või null, kui kasutaja loobus).
   * Kaamerat saab korraga kasutada ainult üks lugeja – LAO.aktiivneSkanner peatatakse vahepeal.
   */
  function skanniUksKood(pealkiri) {
    var pohi = LAO.aktiivneSkanner;
    var ootan = pohi ? pohi.peataKaamera() : Promise.resolve();
    return ootan.then(function () {
      return new Promise(function (resolve) {
        var valmis = false;
        var d = LAO.modaal(pealkiri || 'Skänni kood',
          // Skänneril on oma vorm – see ei tohi olla teise vormi sees (pesastatud vormi brauser ei loo)
          '<div class="uks-skanner"></div>' +
          '<form><div class="nupurida"><button type="button" class="nupp" data-sulge>Loobu</button></div></form>',
          function () {});
        var sk = looSkanner(d.querySelector('.uks-skanner'), function (kood) {
          valmis = true;
          piiks('ok');
          d.close();
          resolve(kood);
        });
        d.addEventListener('close', function () {
          sk.peata().then(function () { if (pohi) pohi.kaivitaKaamera(); });
          if (!valmis) resolve(null);
        });
      });
    });
  }

  LAO.looSkanner = looSkanner;
  LAO.skanniUksKood = skanniUksKood;
  LAO.piiks = piiks;
  LAO.kaamerad = kaamerad;
  LAO.valitudKaamera = valitudKaamera;
  LAO.valiKaamera = valiKaamera;
  LAO.onPuude = onPuude;
  LAO.automaatneKaamera = automaatneKaamera;
  LAO.unustaAutomaatne = unustaAutomaatne;
})();
