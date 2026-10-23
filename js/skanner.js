/**
 * SKÄNNER – koodi lugemine kaamerast, USB-skännerist või käsitsi.
 *
 * Kaamera: html5-qrcode teek (js/vendor/html5-qrcode.min.js), toetab
 * EAN-13, EAN-8, UPC-A, UPC-E, Code128, Code39 ja QR-koode.
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

    function kaivitaKaamera() {
      if (kaameraSees) return Promise.resolve();
      if (typeof Html5Qrcode === 'undefined') { naitaTeadet('Kaamera teek ei laadinud. Sisesta kood käsitsi.'); return Promise.resolve(); }
      if (!window.isSecureContext) { naitaTeadet('Kaamera töötab ainult https-aadressil.'); return Promise.resolve(); }
      raam.hidden = false;
      naitaTeadet('');
      var F = Html5QrcodeSupportedFormats;
      lugeja = lugeja || new Html5Qrcode(id, {
        verbose: false,
        formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.QR_CODE],
        experimentalFeatures: { useBarCodeDetectorIfSupported: true }
      });
      kaameraSees = true;
      kaameraNupp.classList.add('aktiivne');
      return lugeja.start(
        { facingMode: 'environment' },
        {
          fps: 12,
          // Lugemisala: lai ja madal riba – sobib nii vöötkoodile kui QR-ile
          qrbox: function (w, h) { return { width: Math.floor(w * 0.85), height: Math.floor(Math.min(h * 0.6, w * 0.5)) }; }
        },
        function (tekst) { tuvastatud(tekst, 'kaamera'); },
        function () { /* iga kaader ilma koodita – ignoreeri */ }
      ).catch(function (err) {
        kaameraSees = false;
        kaameraNupp.classList.remove('aktiivne');
        raam.hidden = true;
        var t = String(err && (err.name || err.message || err));
        naitaTeadet(/NotAllowed|Permission/i.test(t)
          ? 'Kaamera kasutamine on keelatud. Luba see brauseri seadetes (aadressiriba lukuikoon) või sisesta kood käsitsi.'
          : 'Kaamerat ei õnnestunud käivitada: ' + t);
      });
    }

    function peataKaamera() {
      if (!kaameraSees || !lugeja) return Promise.resolve();
      kaameraSees = false;
      kaameraNupp.classList.remove('aktiivne');
      raam.hidden = true;
      return lugeja.stop().catch(function () { /* juba peatatud */ });
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
  LAO.onPuude = onPuude;
})();
