/**
 * SKÄNNIMINE – telefoni vaated (töötavad ka arvutis USB-skänneriga).
 *
 *   #/sisse      – kauba vastuvõtt (varuosa kogus juurde)
 *   #/valja      – kauba väljastamine (kogus maha)
 *   #/tooriist   – tööriista väljaandmine ja tagastamine
 *   #/paiguta    – toote ümberpaigutamine: skänni toode → skänni uus riiul
 *
 * Kõigis vaadetes:
 *   - tundmatu kood → avaneb kiirlisamise vorm (kood eeltäidetud), pärast
 *     salvestamist jätkub pooleli jäänud toiming;
 *   - riiuli silt → näidatakse selle riiuli tooteid, millest saab valida;
 *   - pärast kinnitamist saab oma viimase liikumise kohe tühistada.
 */
(function () {
  'use strict';

  var esc = LAO.esc, $ = LAO.$, teade = LAO.teade;
  var sisu = document.getElementById('sisu');

  var REZIIMID = {
    sisse: { pealkiri: 'SISSE', klass: 'r-sisse', vihje: 'Skänni vastuvõetav toode' },
    valja: { pealkiri: 'VÄLJA', klass: 'r-valja', vihje: 'Skänni väljastatav toode' },
    tooriist: { pealkiri: 'TÖÖRIIST', klass: 'r-tooriist', vihje: 'Skänni tööriist' },
    paiguta: { pealkiri: 'ÜMBERPAIGUTUS', klass: 'r-paiguta', vihje: 'Skänni toode, siis uus riiul' }
  };

  var reziim = null;     // 'sisse' | 'valja' | 'tooriist' | 'paiguta'
  var skanner = null;
  var paigutatav = null; // ümberpaigutuse 1. samm: valitud toode

  // -------------------------------------------------------------------------
  // VAATE ÜLESEHITUS
  // -------------------------------------------------------------------------

  function looVaade(r) {
    return function (algkood) {
      reziim = r;
      paigutatav = null;
      var R = REZIIMID[r];
      sisu.innerHTML =
        '<section class="skanni-vaade ' + R.klass + '">' +
        '  <div class="reziimi-riba"><a href="#/avaleht" class="tagasi" aria-label="Tagasi">←</a><b>' + R.pealkiri + '</b></div>' +
        '  <div id="skanner"></div>' +
        '  <div id="tulemus"></div>' +
        '  <div id="toiming"><p class="juhis">' + esc(R.vihje) + '</p></div>' +
        '</section>';
      skanner = LAO.looSkanner($('#skanner'), kuiKood, { vihje: R.vihje });
      LAO.aktiivneSkanner = skanner;
      LAO.kuiLahkud = function () { skanner.peata(); LAO.aktiivneSkanner = null; };

      // Värskenda nimekirja taustal (nimetused ja saldod on kohe seadmest olemas)
      LAO.taustaUuendus(); // kui viimasest laadimisest on üle minuti

      if (algkood) kuiKood(algkood, new Date());
    };
  }

  /** Lähtestab toimingu ala ja jätkab skännimist. */
  function valmis(juhis) {
    $('#toiming').innerHTML = '<p class="juhis">' + esc(juhis || REZIIMID[reziim].vihje) + '</p>';
    skanner.paus(false);
    skanner.fookus();
  }

  // -------------------------------------------------------------------------
  // KOODI TÖÖTLEMINE
  // -------------------------------------------------------------------------

  var ajad = {}; // arendusrežiimi jaoks: viimase skänni otsingu ja salvestuse aeg
  var skanniNr = 0; // iga skänn suurendab – taustal saabunud vastus teab, kas see käib veel praeguse kohta

  /** Otsing ainult seadme nimekirjast – serverit ei oodata. */
  function kuiKood(kood, aeg) {
    skanniNr++;
    var t0 = performance.now();
    var leitud = LAO.leiaKoodiga(kood);
    ajad = { otsing: performance.now() - t0 };
    API.mootmine('otsing', ajad.otsing);
    if (leitud) return kasitle(leitud, kood, aeg);
    tundmatu(kood, aeg);
  }

  function kasitle(leitud, kood, aeg) {
    if (leitud.riiul) {
      LAO.piiks('ok');
      return reziim === 'paiguta' ? paigutaRiiulile(leitud.riiul) : naitaRiiulit(leitud.riiul, aeg);
    }
    var t = leitud.toode;
    LAO.piiks('ok');
    if (reziim === 'paiguta') return valiPaigutatav(t);
    if (reziim === 'tooriist') {
      if (t.tyyp !== 'TÖÖRIIST') return valeTyyp(t, 'See on varuosa, mitte tööriist.', 'sisse', 'Ava SISSE', 'valja', 'Ava VÄLJA', kood);
      return tooriistaVorm(t, aeg);
    }
    if (t.tyyp === 'TÖÖRIIST') return valeTyyp(t, 'See on tööriist.', 'tooriist', 'Ava TÖÖRIIST (välja/tagasi)', null, null, kood);
    return koguseVorm(t, aeg);
  }

  /**
   * Tundmatu kood → kiirlisamise vorm avaneb kohe; pärast salvestamist jätka sama toiminguga.
   * Taustal kontrollitakse serverist, kas keegi on selle koodi vahepeal lisanud – kui jah,
   * suletakse vorm ja jätkatakse olemasoleva tootega.
   */
  function tundmatu(kood, aeg) {
    LAO.piiks('hoiatus');
    skanner.paus(true);
    var aken = null, salvestatud = false, minu = skanniNr;
    $('#toiming').innerHTML =
      '<div class="kaart-teade hoiatus"><b>Tundmatu kood:</b> <code>' + esc(kood) + '</code>' +
      '<p>Seda koodi pole seadme nimekirjas.</p>' +
      '<div class="nupurida nupurida-vasak"><button class="nupp nupp-pohi nupp-suur" id="kiirlisa">+ Lisa uus toode</button>' +
      '<button class="nupp nupp-suur" id="loobu">Loobu</button></div></div>';
    $('#loobu').addEventListener('click', function () { if (aken) aken.close(); valmis(); });
    function avaVorm() {
      aken = LAO.avaLisaToode({ kood: kood, tyyp: reziim === 'tooriist' ? 'TÖÖRIIST' : 'VARUOSA' }, function (loodud) {
        salvestatud = true;
        var t = LAO.toode(loodud[0].id);
        if (t) kasitle({ toode: t }, kood, aeg); else valmis();
      }, { kohe: true });
      aken.addEventListener('close', function () {
        aken = null;
        // Loobus vormist → tagasi skännima (kui vahepeal midagi muud ei juhtunud)
        if (!salvestatud && minu === skanniNr) valmis('Kood ' + kood + ' jäi lisamata. ' + REZIIMID[reziim].vihje);
      });
    }
    $('#kiirlisa').addEventListener('click', avaVorm);
    avaVorm();

    if (!navigator.onLine) return;
    LAO.laeAndmed().then(function () {
      var leitud = LAO.leiaKoodiga(kood);
      // Kasutaja on juba edasi läinud (salvestas, loobus või skännis uue koodi)
      if (!leitud || salvestatud || minu !== skanniNr || !$('#kiirlisa')) return;
      if (aken) { salvestatud = true; aken.close(); } // ära mine sulgemisel tagasi skännima
      teade('See kood on juba olemas: ' + (leitud.toode ? leitud.toode.nimetus : 'riiul ' + leitud.riiul.kood));
      kasitle(leitud, kood, aeg);
    }).catch(function () { /* võrgu viga – kasutaja jätkab lisamisega */ });
  }

  function valeTyyp(t, tekst, r1, n1, r2, n2, kood) {
    LAO.piiks('hoiatus');
    $('#toiming').innerHTML = tooteKaart(t) +
      '<div class="kaart-teade hoiatus">' + esc(tekst) + '<div class="nupurida nupurida-vasak">' +
      '<a class="nupp nupp-suur nupp-pohi" href="#/' + r1 + '/' + encodeURIComponent(kood) + '">' + esc(n1) + '</a>' +
      (r2 ? '<a class="nupp nupp-suur nupp-pohi" href="#/' + r2 + '/' + encodeURIComponent(kood) + '">' + esc(n2) + '</a>' : '') +
      '<button class="nupp nupp-suur" id="loobu">Loobu</button></div></div>';
    $('#loobu').addEventListener('click', function () { valmis(); });
  }

  // -------------------------------------------------------------------------
  // TOOTE KAART JA RIIULI NIMEKIRI
  // -------------------------------------------------------------------------

  function tooteKaart(t) {
    var r = LAO.riiul(t.riiul_id);
    return '<div class="toote-kaart">' +
      '<div class="toote-nimi">' + esc(t.nimetus) + '</div>' +
      '<div class="toote-info"><code>' + esc(t.koodid[0] ? t.koodid[0].kood : '') + '</code>' +
      (r ? ' · Riiul <b>' + esc(r.kood) + '</b>' : '') + '</div>' +
      '<div class="toote-seis">' + (t.tyyp === 'VARUOSA' ? 'Saldo: ' : 'Olek: ') + LAO.seisHtml(t) + '</div>' +
      (t.arhiveeritud ? '<div class="kaart-teade viga">Toode on arhiveeritud – liikumine märgitakse adminile ülevaatamiseks.</div>' : '') +
      '</div>';
  }

  /** Riiuli skännimisel: riiuli tooted, millest saab valida (väikeste detailide jaoks). */
  function naitaRiiulit(riiul, aeg) {
    var tooriist = reziim === 'tooriist';
    var tooted = LAO.andmed.tooted.filter(function (t) {
      return t.riiul_id === riiul.id && !t.arhiveeritud && (t.tyyp === 'TÖÖRIIST') === tooriist;
    }).sort(function (a, b) { return a.nimetus.localeCompare(b.nimetus, 'et'); });
    $('#toiming').innerHTML =
      '<div class="riiuli-pais">Riiul <b>' + esc(riiul.kood) + '</b>' + (riiul.nimetus ? ' – ' + esc(riiul.nimetus) : '') + '</div>' +
      (tooted.length ? '<p class="vaike">Vali toode:</p><div class="valiknimekiri">' + tooted.map(function (t) {
        return '<button class="valik" data-id="' + esc(t.id) + '"><span>' + esc(t.nimetus) + '</span>' + LAO.seisHtml(t) + '</button>';
      }).join('') + '</div>' : '<p class="vaike">Sellel riiulil pole ' + (tooriist ? 'tööriistu' : 'varuosi') + '.</p>') +
      '<div class="nupurida nupurida-vasak"><button class="nupp nupp-suur" id="loobu">Tagasi</button></div>';
    $('#loobu').addEventListener('click', function () { valmis(); });
    Array.prototype.forEach.call(document.querySelectorAll('#toiming .valik'), function (b) {
      b.addEventListener('click', function () { kasitle({ toode: LAO.toode(b.dataset.id) }, '', aeg); });
    });
  }

  // -------------------------------------------------------------------------
  // SISSE / VÄLJA: koguse vorm
  // -------------------------------------------------------------------------

  /** VÄLJA: masin, mille kuluks varuosa läheb (nimekiri tuleb Masinakuludest). Viimane valik jääb meelde. */
  function masinaValik() {
    var viimane = '';
    try { viimane = localStorage.getItem('lao.masin') || ''; } catch (e) { /* ignoreeri */ }
    return '  <label class="masin-valik">Masin<select name="masin">' +
      '<option value="">— masinat ei vali (üldkulu) —</option>' +
      LAO.andmed.masinad.map(function (m) {
        return '<option value="' + esc(m.nimi) + '"' + (m.nimi === viimane ? ' selected' : '') + '>' + esc(m.nimi) + '</option>';
      }).join('') + '</select></label>';
  }

  function koguseVorm(t, aeg) {
    skanner.paus(true);
    var valja = reziim === 'valja';
    $('#toiming').innerHTML = tooteKaart(t) +
      '<form id="koguseVorm" autocomplete="off">' +
      '  <div class="kogus">' +
      '    <button type="button" class="kogus-nupp" data-muuda="-1" aria-label="Vähem">−</button>' +
      '    <input name="kogus" inputmode="decimal" value="1" aria-label="Kogus">' +
      '    <button type="button" class="kogus-nupp" data-muuda="1" aria-label="Rohkem">+</button>' +
      '  </div>' +
      '  <div class="kogus-yhik">' + esc(t.yhik) + '</div>' +
      '  <p id="saldoHoiatus" class="kaart-teade viga" hidden></p>' +
      (valja && (LAO.andmed.masinad || []).length ? masinaValik() : '') +
      '  <input name="markus" placeholder="' + (valja ? 'Märkus (kellele, mille jaoks) – valikuline' : 'Märkus (tarnija, arve nr) – valikuline') + '">' +
      '  <div class="nupurida suured-nupud">' +
      '    <button type="button" class="nupp nupp-suur" id="loobu">Katkesta</button>' +
      '    <button type="submit" class="nupp nupp-suur ' + (valja ? 'nupp-valja' : 'nupp-sisse') + '" id="kinnita">' +
      (valja ? 'KINNITA VÄLJA' : 'KINNITA SISSE') + '</button>' +
      '  </div>' +
      '</form>';

    var vorm = $('#koguseVorm');
    function kogus() { return Number(String(vorm.kogus.value).replace(',', '.')); }
    function kontrolli() {
      var k = kogus();
      var hoiatus = $('#saldoHoiatus');
      if (valja && isFinite(k) && t.saldo - k < 0) {
        hoiatus.textContent = 'Saldo läheks negatiivseks (' + LAO.arvTekst(Math.round((t.saldo - k) * 1000) / 1000) + ' ' + t.yhik + '). ' +
          'Kinnitamisel märgitakse liikumine adminile ülevaatamiseks.';
        hoiatus.hidden = false;
        $('#kinnita').textContent = 'KINNITA IKKAGI';
      } else {
        hoiatus.hidden = true;
        $('#kinnita').textContent = valja ? 'KINNITA VÄLJA' : 'KINNITA SISSE';
      }
    }
    Array.prototype.forEach.call(vorm.querySelectorAll('[data-muuda]'), function (b) {
      b.addEventListener('click', function () {
        var k = kogus();
        if (!isFinite(k)) k = 0;
        k = Math.max(1, Math.round((k + Number(b.dataset.muuda)) * 1000) / 1000);
        vorm.kogus.value = LAO.arvTekst(k);
        kontrolli();
      });
    });
    vorm.kogus.addEventListener('input', kontrolli);
    vorm.kogus.addEventListener('focus', function () { vorm.kogus.select(); });
    $('#loobu').addEventListener('click', function () { valmis(); });
    vorm.addEventListener('submit', function (e) {
      e.preventDefault();
      var k = kogus();
      if (!isFinite(k) || k <= 0) { teade('Kogus peab olema suurem kui 0.', 'viga'); return; }
      var masin = vorm.masin ? vorm.masin.value : '';
      if (masin) { try { localStorage.setItem('lao.masin', masin); } catch (e2) { /* ignoreeri */ } }
      salvesta(vorm, {
        id: LAO.uusId(), toote_id: t.id, tyyp: valja ? 'VÄLJA' : 'SISSE', kogus: k,
        kellele_kuhu: valja ? masin : '',
        markus: vorm.markus.value, skannimise_aeg: aeg.toISOString()
      }, t, function (uus) {
        return (valja ? 'VÄLJA ' : 'SISSE ') + LAO.arvTekst(k) + ' ' + t.yhik + ' – ' + t.nimetus + (valja && masin ? ' → ' + masin : '') +
          '. Saldo nüüd ' + LAO.arvTekst(uus.saldo) + ' ' + t.yhik + '.';
      });
    });
    kontrolli();
    if (!LAO.onPuude()) $('#kinnita').focus(); // arvutis: Enter kinnitab koguse 1
  }

  // -------------------------------------------------------------------------
  // TÖÖRIIST: välja / tagasi
  // -------------------------------------------------------------------------

  function tooriistaVorm(t, aeg) {
    skanner.paus(true);
    var admin = LAO.onAdmin();
    var html = tooteKaart(t);
    if (t.olek === 'LAOS') {
      html +=
        '<form id="tooriistaVorm" autocomplete="off">' +
        '  <label>Kellele / kuhu *<input name="kellele" list="kelleleList" required placeholder="nt Jaan Tamm või Objekt Tartu"></label>' +
        '  <datalist id="kelleleList">' + kelleleValikud() + '</datalist>' +
        '  <input name="markus" placeholder="Märkus – valikuline">' +
        '  <div class="nupurida suured-nupud">' +
        '    <button type="button" class="nupp nupp-suur" id="loobu">Katkesta</button>' +
        '    <button type="submit" class="nupp nupp-suur nupp-valja">ANNA VÄLJA</button></div>' +
        '</form>';
    } else {
      var paevi = t.alates ? Math.floor((Date.now() - new Date(t.alates)) / 86400000) : null;
      html +=
        '<div class="kaart-teade ' + (t.olek === 'VÄLJA ANTUD' ? 'hoiatus' : 'viga') + '">' +
        (t.olek === 'VÄLJA ANTUD' ? 'Väljas: <b>' + esc(t.kellele) + '</b>' : 'Olek: <b>' + esc(t.olek) + '</b>') +
        (t.alates ? '<br>alates ' + esc(LAO.aeg(t.alates)) + (paevi !== null ? ' (' + paevi + ' päeva)' : '') : '') +
        '</div>' +
        '<form id="tooriistaVorm" autocomplete="off">' +
        '  <input name="markus" placeholder="Märkus (nt seisukord) – valikuline">' +
        '  <div class="nupurida suured-nupud">' +
        '    <button type="button" class="nupp nupp-suur" id="loobu">Katkesta</button>' +
        '    <button type="submit" class="nupp nupp-suur nupp-sisse">TAGASTA LATTU</button></div>' +
        '</form>';
    }
    if (admin) {
      html += '<div class="nupurida nupurida-vasak admin-olekud"><span class="vaike">Admin:</span>' +
        (t.olek !== 'REMONDIS' ? '<button class="nupp nupp-vaike" data-olek="REMONDIS">Märgi remonti</button>' : '') +
        (t.olek !== 'KADUNUD' ? '<button class="nupp nupp-vaike nupp-oht" data-olek="KADUNUD">Märgi kadunuks</button>' : '') +
        '</div>';
    }
    $('#toiming').innerHTML = html;

    var vorm = $('#tooriistaVorm');
    $('#loobu').addEventListener('click', function () { valmis(); });
    vorm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (t.olek === 'LAOS') {
        var kellele = vorm.kellele.value.trim();
        if (!kellele) { vorm.kellele.focus(); return; }
        salvesta(vorm, {
          id: LAO.uusId(), toote_id: t.id, tyyp: 'VÄLJA_ANTUD', kellele_kuhu: kellele,
          markus: vorm.markus.value, skannimise_aeg: aeg.toISOString()
        }, t, function () { return 'VÄLJA ANTUD: ' + t.nimetus + ' → ' + kellele; });
      } else {
        salvesta(vorm, {
          id: LAO.uusId(), toote_id: t.id, tyyp: 'TAGASTATUD', markus: vorm.markus.value, skannimise_aeg: aeg.toISOString()
        }, t, function () { return 'TAGASTATUD: ' + t.nimetus + ' on laos.'; });
      }
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-olek]'), function (b) {
      b.addEventListener('click', function () {
        if (!confirm('Märkida „' + t.nimetus + '” olekusse ' + b.dataset.olek + '?')) return;
        salvesta(vorm, {
          id: LAO.uusId(), toote_id: t.id, tyyp: 'OLEKU_MUUTUS', kellele_kuhu: b.dataset.olek,
          markus: vorm.markus.value, skannimise_aeg: new Date().toISOString()
        }, t, function () { return t.nimetus + ': olek ' + b.dataset.olek + '.'; });
      });
    });
    if (vorm.kellele) vorm.kellele.focus();
  }

  /** Kellele/kuhu soovitused: serveri nimekiri + selles seadmes viimati kasutatud. */
  function kelleleValikud() {
    var kohalikud = [];
    try { kohalikud = JSON.parse(localStorage.getItem('lao.kellele') || '[]'); } catch (e) { /* ignoreeri */ }
    var nahtud = {};
    return kohalikud.concat(LAO.andmed.kelleleSoovitused || []).filter(function (v) {
      var k = v.toLowerCase();
      if (nahtud[k]) return false;
      nahtud[k] = true;
      return true;
    }).map(function (v) { return '<option value="' + esc(v) + '">'; }).join('');
  }

  function jataKellegeMeelde(v) {
    try {
      var list = JSON.parse(localStorage.getItem('lao.kellele') || '[]').filter(function (x) { return x.toLowerCase() !== v.toLowerCase(); });
      list.unshift(v);
      localStorage.setItem('lao.kellele', JSON.stringify(list.slice(0, 30)));
    } catch (e) { /* ignoreeri */ }
  }

  // -------------------------------------------------------------------------
  // ÜMBERPAIGUTUS
  // -------------------------------------------------------------------------

  function valiPaigutatav(t) {
    paigutatav = t;
    var r = LAO.riiul(t.riiul_id);
    $('#toiming').innerHTML = tooteKaart(t) +
      '<div class="kaart-teade info"><b>Nüüd skänni uue riiuli silt</b> või vali nimekirjast.' +
      '<p>Praegu: ' + esc(r ? r.kood : 'riiul määramata') + '</p>' +
      '<select id="uusRiiul">' + LAO.riiuliValikud('').replace('– pole määratud –', '– vali riiul –') + '</select>' +
      '<div class="nupurida suured-nupud"><button class="nupp nupp-suur" id="loobu">Katkesta</button>' +
      '<button class="nupp nupp-suur nupp-pohi" id="paigutaNupp">Paiguta</button></div></div>';
    $('#loobu').addEventListener('click', function () { paigutatav = null; valmis(); });
    $('#paigutaNupp').addEventListener('click', function () {
      var r2 = LAO.riiul($('#uusRiiul').value);
      if (!r2) { teade('Vali riiul või skänni riiuli silt.', 'viga'); return; }
      paigutaRiiulile(r2);
    });
    skanner.paus(false); // ootame riiuli skännimist
  }

  function paigutaRiiulile(riiul) {
    var t = paigutatav;
    if (!t) { teade('Skänni kõigepealt toode, siis riiul.', 'viga'); LAO.piiks('viga'); return; }
    if (t.riiul_id === riiul.id) { teade('Toode on juba riiulil ' + riiul.kood + '.'); return; }
    skanner.paus(true);
    var vana = LAO.riiul(t.riiul_id);
    salvesta(null, {
      id: LAO.uusId(), toote_id: t.id, tyyp: 'ÜMBERPAIGUTUS', kellele_kuhu: riiul.id, skannimise_aeg: new Date().toISOString()
    }, t, function () {
      return t.nimetus + ': ' + (vana ? vana.kood : '(riiulita)') + ' → ' + riiul.kood;
    }, true);
    paigutatav = null;
  }

  // -------------------------------------------------------------------------
  // SALVESTAMINE JA TÜHISTAMINE
  // -------------------------------------------------------------------------

  /**
   * Salvestab liikumise (kohe seadmesse, serverisse taustal – vt js/jarjekord.js).
   * kirjeldus(uusSeis) → tulemuse tekst. eiTyhista: ümberpaigutust ei saa tühistada.
   */
  function salvesta(vorm, liikumine, t, kirjeldus, eiTyhista) {
    if (vorm) LAO.hoivatud(vorm, true);
    var nupud = document.querySelectorAll('#toiming button');
    Array.prototype.forEach.call(nupud, function (b) { b.disabled = true; });
    var t0 = performance.now();
    LAO.salvestaLiikumised([liikumine]).then(function (tul) {
      ajad.salvestus = performance.now() - t0;
      API.mootmine('salvestus', ajad.salvestus);
      var r = tul[0];
      if (!r.ok) throw new Error(r.viga || 'Salvestamine ebaõnnestus.');
      if (liikumine.kellele_kuhu && liikumine.tyyp === 'VÄLJA_ANTUD') jataKellegeMeelde(liikumine.kellele_kuhu);
      var uus = LAO.toode(t.id) || t;
      naitaTulemust(kirjeldus(uus), r, liikumine, eiTyhista);
      valmis();
    }).catch(function (err) {
      LAO.piiks('viga');
      if (vorm) LAO.hoivatud(vorm, false);
      Array.prototype.forEach.call(nupud, function (b) { b.disabled = false; });
      teade(err.message, 'viga');
      if (!vorm) valmis();
    });
  }

  var naidatav = null; // viimase tulemuse liikumise id (et serveri vastus saaks teksti uuendada)

  /** Roheline teade viimase toimingu kohta + saatmise olek + Tühista-nupp. */
  function naitaTulemust(tekst, r, liikumine, eiTyhista) {
    LAO.piiks('ok');
    naidatav = liikumine.id;
    $('#tulemus').innerHTML =
      '<div class="tulemus tulemus-ok">' +
      '<div class="tulemus-tekst">✓ ' + esc(tekst) +
      '<div class="vaike saatmise-olek">' + (navigator.onLine ? 'Salvestatud, saadan serverisse…' : 'Salvestatud seadmesse – saadetakse, kui internet tagasi tuleb.') + '</div>' +
      (API.arendus() ? '<div class="vaike ajarida">⏱ otsing ' + LAO.ajaTekst(ajad.otsing || 0) + ' · salvestus seadmesse ' + LAO.ajaTekst(ajad.salvestus || 0) +
        ' · server <span class="serveriaeg">…</span></div>' : '') + '</div>' +
      (eiTyhista ? '' : '<button class="nupp nupp-vaike" id="tyhista">Tühista</button>') +
      '</div>';
    if (eiTyhista) return;
    $('#tyhista').addEventListener('click', function () {
      var b = $('#tyhista');
      b.disabled = true;
      LAO.jarjekord.tyhista(liikumine.id).then(function (tul) {
        if (!tul.ok) throw new Error(tul.viga);
        LAO.piiks('ok');
        naidatav = null;
        $('#tulemus').innerHTML = '<div class="tulemus tulemus-info"><div class="tulemus-tekst">Tühistatud: ' + esc(tekst) + '</div></div>';
      }).catch(function (err) { b.disabled = false; teade(err.message, 'viga'); });
    });
  }

  // Serveri vastus jõudis: uuenda viimase tulemuse olekurida (või näita konflikti)
  document.addEventListener('lao:saadetud', function (e) {
    var r = (e.detail || []).filter(function (x) { return x.id === naidatav; })[0];
    var kast = document.querySelector('#tulemus .tulemus');
    if (!r || !kast) return;
    var olek = kast.querySelector('.saatmise-olek');
    if (!r.ok) {
      kast.className = 'tulemus tulemus-hoiatus';
      olek.innerHTML = '<b>Server ei võtnud vastu:</b> ' + esc(r.viga);
    } else if (r.konflikt) {
      kast.className = 'tulemus tulemus-hoiatus';
      olek.innerHTML = '<b>Märgitud adminile ülevaatamiseks:</b> ' + esc(r.pohjus);
    } else {
      olek.textContent = '✓ Serveris';
    }
    // Arendusrežiim: serverisse saatmise aeg (viimane liikumised.lisa mõõtmine)
    var sa = kast.querySelector('.serveriaeg');
    var m = API.mootmised().filter(function (x) { return x.nimi === 'liikumised.lisa'; }).pop();
    if (sa && m) sa.textContent = LAO.ajaTekst(m.ms) + (m.serveris !== null ? ' (Apps Scriptis ' + LAO.ajaTekst(m.serveris) + ')' : '');
  });

  LAO.vaated['sisse'] = { fn: looVaade('sisse') };
  LAO.vaated['valja'] = { fn: looVaade('valja') };
  LAO.vaated['tooriist'] = { fn: looVaade('tooriist') };
  LAO.vaated['paiguta'] = { fn: looVaade('paiguta') };
})();
