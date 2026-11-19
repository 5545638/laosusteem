/**
 * SKÄNNIMINE – telefoni vaated (töötavad ka arvutis USB-skänneriga).
 *
 *   #/sisse      – kauba vastuvõtt (varuosa kogus juurde)
 *   #/valja      – kauba väljastamine (kogus maha)
 *   #/tooriist   – tööriista väljaandmine ja tagastamine
 *   #/paiguta    – toote paigutamine: skänni toode → kohe palutakse riiul. Uus (tundmatu)
 *                  kood luuakse ilma nimeta ja seotakse riiuliga; nime lisab admin hiljem.
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
    skanni: { pealkiri: 'SKÄNNI', klass: 'r-skanni', vihje: 'Skänni toode, tööriist või riiul' },
    sisse: { pealkiri: 'SISSE', klass: 'r-sisse', vihje: 'Skänni vastuvõetav toode' },
    valja: { pealkiri: 'VÄLJA', klass: 'r-valja', vihje: 'Skänni väljastatav toode' },
    tooriist: { pealkiri: 'TÖÖRIIST', klass: 'r-tooriist', vihje: 'Skänni tööriist' },
    paiguta: { pealkiri: 'PAIGUTA', klass: 'r-paiguta', vihje: 'Skänni toode, siis riiul' }
  };

  var reziim = null;     // 'skanni' | 'sisse' | 'valja' | 'tooriist' | 'paiguta' (skanni = rakendus pakub tegevuse ise)
  var skanner = null;
  var riiuliOotel = null; // uus toode salvestatud, ootame riiuli silti: { toode, edasi }
  var paigutatav = null; // paigutamise 1. samm: valitud toode või { uus: true, kood, tyyp } (tundmatu kood)

  // -------------------------------------------------------------------------
  // VAATE ÜLESEHITUS
  // -------------------------------------------------------------------------

  function looVaade(r) {
    return function (algkood) {
      reziim = r;
      paigutatav = null;
      riiuliOotel = null;
      var R = REZIIMID[r];
      sisu.innerHTML =
        '<section class="skanni-vaade ' + R.klass + '">' +
        '  <div class="reziimi-riba"><a href="#/avaleht" class="tagasi" aria-label="Tagasi">←</a><b>' + R.pealkiri + '</b></div>' +
        '  <div id="skanner"></div>' +
        '  <div id="tulemus"></div>' +
        '  <div id="toiming"></div>' +
        '</section>';
      skanner = LAO.looSkanner($('#skanner'), kuiKood, { vihje: R.vihje });
      LAO.aktiivneSkanner = skanner;
      LAO.kuiLahkud = function () { skanner.peata(); LAO.aktiivneSkanner = null; };
      naitaJuhis();

      // Värskenda nimekirja taustal (nimetused ja saldod on kohe seadmest olemas)
      LAO.taustaUuendus(); // kui viimasest laadimisest on üle minuti

      if (algkood) kuiKood(algkood, new Date());
    };
  }

  /** Lähtestab toimingu ala ja jätkab skännimist. */
  function valmis(juhis) {
    naitaJuhis(juhis);
    skanner.paus(false);
    skanner.fookus();
  }

  /** Juhis + nupp „Otsi nime järgi” (väljastamine/tagastus ilma skännimata). */
  function naitaJuhis(juhis) {
    var kiirVoimalik = reziim === 'sisse' || reziim === 'valja';
    $('#toiming').innerHTML = '<p class="juhis">' + esc(juhis || REZIIMID[reziim].vihje) + '</p>' +
      '<div class="nupurida"><button type="button" class="nupp nupp-suur otsi-nupp" id="otsiNupp">🔍 Otsi nime järgi</button></div>' +
      (kiirVoimalik ? '<label class="linnuke kiir-luliti"><input type="checkbox" id="kiirLuliti"' + (kiirSees() ? ' checked' : '') + '> ' +
        '⚡ Kiirrežiim: iga skänn salvestab kohe 1 ' + (reziim === 'valja' && kiirMasin() ? '(masin ' + esc(kiirMasin()) + ')' : 'tk') +
        ' – vale korral vajuta Tühista</label>' : '');
    $('#otsiNupp').addEventListener('click', function () { naitaOtsing(''); });
    if (kiirVoimalik) $('#kiirLuliti').addEventListener('change', function () {
      try { localStorage.setItem('lao.kiir.' + reziim, this.checked ? '1' : '0'); } catch (e) { /* ignoreeri */ }
    });
  }

  /** Kiirrežiim (SISSE/VÄLJA): skännimine salvestab kohe koguse 1 ilma vormita. Seade jätab meelde. */
  function kiirSees() {
    if (reziim !== 'sisse' && reziim !== 'valja') return false;
    try { return localStorage.getItem('lao.kiir.' + reziim) === '1'; } catch (e) { return false; }
  }

  /** VÄLJA kiirrežiimis: viimati valitud masin (kui see on veel nimekirjas). */
  function kiirMasin() {
    var m = '';
    try { m = localStorage.getItem('lao.masin') || ''; } catch (e) { /* ignoreeri */ }
    return (LAO.andmed.masinad || []).some(function (x) { return x.nimi === m; }) ? m : '';
  }

  // -------------------------------------------------------------------------
  // OTSING ILMA SKÄNNIMATA
  // -------------------------------------------------------------------------

  var OTSINGU_MAX = 40;

  /** Seadme nimekirjast tooted, mis sobivad praegusesse vaatesse (TÖÖRIIST → tööriistad, SISSE/VÄLJA → varuosad). */
  function otsiTooteid(paring) {
    var sonad = String(paring || '').toLowerCase().split(/\s+/).filter(Boolean);
    return LAO.andmed.tooted.filter(function (t) {
      if (t.arhiveeritud) return false;
      if (reziim === 'tooriist' && t.tyyp !== 'TÖÖRIIST') return false;
      if ((reziim === 'sisse' || reziim === 'valja') && t.tyyp === 'TÖÖRIIST') return false;
      if (!sonad.length) return true;
      var pohi = LAO.komplektiPohi(t), r = LAO.riiul(t.riiul_id);
      var tekst = (t.nimetus + ' ' + (t.kategooria || '') + ' ' + t.koodid.map(function (k) { return k.kood; }).join(' ') +
        (pohi ? ' ' + pohi.nimetus : '') + (r ? ' ' + r.kood : '') + (t.kellele ? ' ' + t.kellele : '')).toLowerCase();
      return sonad.every(function (s) { return tekst.indexOf(s) >= 0; });
    }).sort(function (a, b) { return a.nimetus.localeCompare(b.nimetus, 'et', { numeric: true }); });
  }

  /** Otsingulahter + nimekiri; valik viib sama vormini nagu skännimine. Skänner jääb tööle. */
  function naitaOtsing(algus, uus) {
    var tooriist = reziim === 'tooriist';
    $('#toiming').innerHTML =
      '<form id="otsinguVorm" class="otsing" autocomplete="off">' +
      '  <input type="search" name="q" placeholder="Nimi, kood, kategooria või riiul' + (tooriist ? ' (ka kellel väljas)' : '') + '" enterkeyhint="search">' +
      '</form>' +
      '<p class="vaike" id="otsinguArv"></p>' +
      '<div class="valiknimekiri" id="otsinguTulemus"></div>' +
      '<div class="nupurida nupurida-vasak"><button type="button" class="nupp nupp-suur" id="loobu">Tagasi</button>' +
      (uus ? '<button type="button" class="nupp nupp-suur" id="uusKood">+ Lisa uus kood ' + esc(uus.kood) + '</button>' : '') + '</div>';
    if (uus) $('#uusKood').addEventListener('click', function () {
      if (reziim === 'paiguta') uusPaigutatav(uus.kood, uus.aeg, uus.toores); else tundmatu(uus.kood, uus.aeg, uus.toores);
    });
    var vorm = $('#otsinguVorm'), sisend = vorm.q;
    sisend.value = algus || '';
    var list = [];
    function joonista() {
      list = otsiTooteid(sisend.value);
      var naita = list.slice(0, OTSINGU_MAX);
      $('#otsinguArv').textContent = !list.length ? 'Ühtegi ' + (tooriist ? 'tööriista' : 'toodet') + ' ei leitud.' :
        list.length > naita.length ? 'Leiti ' + list.length + ', näidatakse ' + naita.length + ' – kitsenda otsingut.' :
        (sisend.value.trim() ? 'Leiti ' + list.length + '.' : 'Vali nimekirjast või kirjuta otsingusse.');
      $('#otsinguTulemus').innerHTML = naita.map(function (t) {
        var r = LAO.riiul(t.riiul_id), pohi = LAO.komplektiPohi(t);
        return '<button type="button" class="valik" data-id="' + esc(t.id) + '"><span>' + esc(t.nimetus) +
          '<span class="vaike valik-info"><code>' + esc(LAO.esimeneKood(t)) + '</code>' + (r ? ' · ' + esc(r.kood) : '') +
          (pohi ? ' · kuulub: ' + esc(pohi.nimetus) : '') + '</span></span>' + LAO.seisHtml(t) + '</button>';
      }).join('');
    }
    var taimer = null;
    sisend.addEventListener('input', function () { clearTimeout(taimer); taimer = setTimeout(joonista, 120); });
    vorm.addEventListener('submit', function (e) {
      e.preventDefault();
      clearTimeout(taimer);
      var q = sisend.value.trim();
      if (!q) return;
      // USB-skänner kirjutas koodi otsingusse – käitu nagu skänn
      if (LAO.leiaKoodiga(LAO.puhastaKood(q))) return kuiKood(q, new Date(), q);
      joonista();
      if (list.length === 1) kasitle({ toode: list[0] }, '', new Date());
    });
    $('#otsinguTulemus').addEventListener('click', function (e) {
      var b = e.target.closest('.valik');
      if (!b) return;
      var t = LAO.toode(b.dataset.id);
      if (t) kasitle({ toode: t }, '', new Date());
    });
    $('#loobu').addEventListener('click', function () { valmis(); });
    joonista();
    sisend.focus();
  }

  // -------------------------------------------------------------------------
  // KOODI TÖÖTLEMINE
  // -------------------------------------------------------------------------

  var ajad = {}; // arendusrežiimi jaoks: viimase skänni otsingu ja salvestuse aeg
  var skanniNr = 0; // iga skänn suurendab – taustal saabunud vastus teab, kas see käib veel praeguse kohta

  /** Otsing ainult seadme nimekirjast – serverit ei oodata. */
  function kuiKood(kood, aeg, toores, allikas) {
    kood = LAO.puhastaKood(kood);
    skanniNr++;
    var t0 = performance.now();
    var leitud = LAO.leiaKoodiga(kood);
    ajad = { otsing: performance.now() - t0 };
    API.mootmine('otsing', ajad.otsing);
    if (leitud) return kasitle(leitud, kood, aeg);
    // Käsitsi kirjutatud nimi (mitte kood) → näita nimeotsingu tulemusi, mitte uue toote vormi
    if (allikas === 'kasitsi' && toores && otsiTooteid(toores).length) { LAO.piiks('hoiatus'); return naitaOtsing(String(toores).trim(), { kood: kood, aeg: aeg, toores: toores }); }
    if (reziim === 'paiguta') return uusPaigutatav(kood, aeg, toores);
    tundmatu(kood, aeg, toores);
  }

  function kasitle(leitud, kood, aeg) {
    if (leitud.riiul && riiuliOotel) { LAO.piiks('ok'); return uusRiiulile(leitud.riiul); }
    riiuliOotel = null; // skänniti midagi muud – riiulisamm jääb vahele
    if (leitud.riiul) {
      LAO.piiks('ok');
      // SKÄNNI: pärast „📍 Riiul” ootab toode riiulit
      return reziim === 'paiguta' || (reziim === 'skanni' && paigutatav) ? paigutaRiiulile(leitud.riiul) : naitaRiiulit(leitud.riiul, aeg);
    }
    var t = leitud.toode;
    LAO.piiks('ok');
    if (reziim === 'paiguta') return valiPaigutatav(t);
    paigutatav = null;
    if (reziim === 'skanni') return t.tyyp === 'TÖÖRIIST' ? tooriistaVorm(t, aeg) : koguseVorm(t, aeg);
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
  function tundmatu(kood, aeg, toores) {
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
      aken = LAO.avaLisaToode({ kood: kood, mudel: LAO.tehaseMudel(toores), tyyp: reziim === 'tooriist' ? 'TÖÖRIIST' : 'VARUOSA' }, function (loodud) {
        salvestatud = true;
        var t = LAO.toode(loodud[0].id);
        if (!t) return valmis();
        var jatka = function () { var t2 = LAO.toode(t.id) || t; kasitle({ toode: t2 }, kood, aeg); };
        // Riiulit vormis ei valitud → järgmine samm: skänni riiuli silt
        if (!t.riiul_id && (LAO.andmed.riiulid || []).length) return kusiRiiul(t, jatka);
        jatka();
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

  /** Uue toote 2. samm: riiuli silt (või valik nimekirjast / vahele jätmine), siis edasi(). */
  function kusiRiiul(t, edasi) {
    riiuliOotel = { toode: t, edasi: edasi };
    $('#toiming').innerHTML = tooteKaart(t) +
      '<div class="kaart-teade info"><b>📍 Nüüd skänni riiuli silt</b>' +
      '<select id="uusRiiul">' + LAO.riiuliValikud('').replace('– pole määratud –', '– või vali riiul –') + '</select>' +
      '<div class="nupurida suured-nupud"><button type="button" class="nupp nupp-suur" id="jataVahele">Jäta vahele</button>' +
      '<button type="button" class="nupp nupp-suur nupp-pohi" id="paigutaNupp">Lisa riiulile</button></div></div>';
    $('#jataVahele').addEventListener('click', function () { riiuliOotel = null; edasi(); });
    $('#paigutaNupp').addEventListener('click', function () {
      var r = LAO.riiul($('#uusRiiul').value);
      if (!r) { teade('Vali riiul või skänni riiuli silt.', 'viga'); return; }
      uusRiiulile(r);
    });
    skanner.paus(false); // ootame riiuli skännimist
  }

  function uusRiiulile(riiul) {
    var o = riiuliOotel;
    riiuliOotel = null;
    skanner.paus(true);
    var t = LAO.toode(o.toode.id) || o.toode;
    LAO.salvestaLiikumised([{
      id: LAO.uusId(), toote_id: t.id, tyyp: 'ÜMBERPAIGUTUS', kellele_kuhu: riiul.id, skannimise_aeg: new Date().toISOString()
    }]).then(function (tul) {
      if (!tul[0].ok) throw new Error(tul[0].viga || 'Salvestamine ebaõnnestus.');
      naitaTulemust(t.nimetus + ' → riiul ' + riiul.kood, { ok: true }, { id: null }, true);
      o.edasi();
    }).catch(function (err) { LAO.piiks('viga'); teade(err.message, 'viga'); o.edasi(); });
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
      (r ? ' · Riiul <b>' + esc(r.kood) + '</b>' : '') +
      (t.koodid[0] && LAO.kiirprint ? ' <button type="button" class="nupp nupp-vaike sildi-nupp" data-silt="' + esc(t.id) + '">🖨 Silt</button>' : '') + '</div>' +
      '<div class="toote-seis">' + (t.tyyp === 'VARUOSA' ? 'Saldo: ' : 'Olek: ') + LAO.seisHtml(t) + '</div>' +
      '<div class="toote-kirjeldus" data-kirjeldus-tekst="' + esc(t.id) + '"' + (t.kirjeldus ? '' : ' hidden') + '>' + esc(t.kirjeldus || '') + '</div>' +
      '<button type="button" class="nupp nupp-vaike kirjeldus-nupp" data-kirjeldus="' + esc(t.id) + '">✎ ' + (t.kirjeldus ? 'Muuda kirjeldust' : 'Lisa kirjeldus') + '</button>' +
      (reziim === 'skanni' ? ' <button type="button" class="nupp nupp-vaike riiul-nupp" data-riiul-toode="' + esc(t.id) + '">📍 ' + (r ? 'Muuda riiulit' : 'Vali riiul') + '</button>' : '') +
      komplektiInfo(t) +
      (LAO.onNimeta(t) ? '<div class="vaike">Nimi on lisamata' + (LAO.onAdmin() ? ' – <a href="#/toode/' + encodeURIComponent(t.id) + '">lisa nimi</a>' : '') + '</div>' : '') +
      (t.arhiveeritud ? '<div class="kaart-teade viga">Toode on arhiveeritud – liikumine märgitakse adminile ülevaatamiseks.</div>' : '') +
      '</div>';
  }

  /** Tööriistakomplekt: osal „Kuulub: Akutrell …”, põhitööriistal osade nimekiri koos olekutega. */
  function komplektiInfo(t) {
    var pohi = LAO.komplektiPohi(t);
    if (pohi) {
      var pr = LAO.riiul(pohi.riiul_id);
      return '<div class="komplekt-info">Kuulub: <b>' + esc(pohi.nimetus) + '</b> <code>' + esc(LAO.esimeneKood(pohi)) + '</code>' +
        '<div class="vaike">' + LAO.seisHtml(pohi) + (pr ? ' · Riiul <b>' + esc(pr.kood) + '</b>' : '') + '</div></div>';
    }
    var osad = LAO.komplektiOsad(t);
    if (!osad.length) return '';
    return '<div class="komplekt-info">Komplekti osad:' + osad.map(function (o) {
      return '<div class="komplekt-osa"><span>' + esc(o.nimetus) + ' <code>' + esc(LAO.esimeneKood(o)) + '</code></span>' + LAO.seisHtml(o) + '</div>';
    }).join('') + '</div>';
  }

  /** Linnukesed: koos põhitööriistaga välja antavad / tagastatavad komplekti osad (vaikimisi kõik). */
  function osadeValik(osad, pealkiri) {
    if (!osad.length) return '';
    return '<fieldset class="komplekt-valik"><legend>' + esc(pealkiri) + '</legend>' + osad.map(function (o) {
      return '<label class="linnuke"><input type="checkbox" name="osa" value="' + esc(o.id) + '" checked> ' +
        esc(o.nimetus) + ' <code>' + esc(LAO.esimeneKood(o)) + '</code></label>';
    }).join('') + '</fieldset>';
  }

  function valitudOsad(vorm) {
    return Array.prototype.map.call(vorm.querySelectorAll('[name=osa]:checked'), function (c) { return LAO.toode(c.value); })
      .filter(function (o) { return !!o; });
  }

  /** Riiuli skännimisel: riiuli tooted, millest saab valida (väikeste detailide jaoks). */
  function naitaRiiulit(riiul, aeg) {
    var tooriist = reziim === 'tooriist';
    var tooted = LAO.andmed.tooted.filter(function (t) {
      return t.riiul_id === riiul.id && !t.arhiveeritud && (reziim === 'skanni' || (t.tyyp === 'TÖÖRIIST') === tooriist);
    }).sort(function (a, b) { return a.nimetus.localeCompare(b.nimetus, 'et'); });
    $('#toiming').innerHTML =
      '<div class="riiuli-pais">Riiul <b>' + esc(riiul.kood) + '</b>' + (riiul.nimetus ? ' – ' + esc(riiul.nimetus) : '') + '</div>' +
      (tooted.length ? '<p class="vaike">Vali toode:</p><div class="valiknimekiri">' + tooted.map(function (t) {
        return '<button class="valik" data-id="' + esc(t.id) + '"><span>' + esc(t.nimetus) + '</span>' + LAO.seisHtml(t) + '</button>';
      }).join('') + '</div>' : '<p class="vaike">Sellel riiulil pole ' + (reziim === 'skanni' ? 'tooteid' : tooriist ? 'tööriistu' : 'varuosi') + '.</p>') +
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
    // Kiirrežiim: kogus 1 kohe (VÄLJA puhul ainult siis, kui saldo ei lähe negatiivseks – muidu tavaline vorm)
    if (kiirSees() && !t.arhiveeritud && !(reziim === 'valja' && t.saldo - 1 < 0)) return kiirSalvesta(t, aeg);
    var molemad = reziim === 'skanni'; // SKÄNNI: nii SISSE kui VÄLJA nupp
    var valja = reziim === 'valja';
    var masinad = (LAO.andmed.masinad || []).length;
    $('#toiming').innerHTML = tooteKaart(t) +
      '<form id="koguseVorm" autocomplete="off">' +
      '  <div class="kogus">' +
      '    <button type="button" class="kogus-nupp" data-muuda="-1" aria-label="Vähem">−</button>' +
      '    <input name="kogus" inputmode="decimal" value="1" aria-label="Kogus">' +
      '    <button type="button" class="kogus-nupp" data-muuda="1" aria-label="Rohkem">+</button>' +
      '  </div>' +
      '  <div class="kogus-yhik">' + esc(t.yhik) + '</div>' +
      '  <p id="saldoHoiatus" class="kaart-teade viga" hidden></p>' +
      ((valja || molemad) && masinad ? masinaValik() : '') +
      '  <textarea name="markus" rows="2" placeholder="' + (molemad ? 'Märkus selle liikumise kohta – valikuline' : valja ? 'Märkus (kellele, mille jaoks) – valikuline' : 'Märkus (tarnija, arve nr, muu vajalik) – valikuline') + '"></textarea>' +
      (molemad
        ? '  <div class="nupurida kaks-suunda">' +
          '    <button type="submit" class="nupp nupp-suur nupp-valja" data-suund="VÄLJA" id="kinnitaValja">− VÄLJA</button>' +
          '    <button type="submit" class="nupp nupp-suur nupp-sisse" data-suund="SISSE" id="kinnita">+ SISSE</button>' +
          '  </div>' +
          '  <button type="button" class="nupp katkesta-rida" id="loobu">Katkesta</button>'
        : '  <div class="nupurida suured-nupud">' +
          '    <button type="button" class="nupp nupp-suur" id="loobu">Katkesta</button>' +
          '    <button type="submit" class="nupp nupp-suur ' + (valja ? 'nupp-valja' : 'nupp-sisse') + '" id="kinnita">' +
          (valja ? 'KINNITA VÄLJA' : 'KINNITA SISSE') + '</button>' +
          '  </div>') +
      '</form>';

    var vorm = $('#koguseVorm');
    var suund = valja ? 'VÄLJA' : 'SISSE';
    function kogus() { return Number(String(vorm.kogus.value).replace(',', '.')); }
    function kontrolli() {
      var k = kogus();
      var hoiatus = $('#saldoHoiatus');
      var neg = (valja || molemad) && isFinite(k) && t.saldo - k < 0;
      if (neg) {
        hoiatus.textContent = (molemad ? 'VÄLJA korral läheks saldo negatiivseks (' : 'Saldo läheks negatiivseks (') +
          LAO.arvTekst(Math.round((t.saldo - k) * 1000) / 1000) + ' ' + t.yhik + '). ' +
          'Kinnitamisel märgitakse liikumine adminile ülevaatamiseks.';
        hoiatus.hidden = false;
      } else hoiatus.hidden = true;
      if (molemad) $('#kinnitaValja').textContent = neg ? '− VÄLJA IKKAGI' : '− VÄLJA';
      else $('#kinnita').textContent = neg ? 'KINNITA IKKAGI' : valja ? 'KINNITA VÄLJA' : 'KINNITA SISSE';
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
    // SKÄNNI: kumba nuppu vajutati (Enter klaviatuuril = SISSE)
    Array.prototype.forEach.call(vorm.querySelectorAll('[data-suund]'), function (b) {
      b.addEventListener('click', function () { suund = b.dataset.suund; });
    });
    vorm.kogus.addEventListener('input', kontrolli);
    vorm.kogus.addEventListener('focus', function () { vorm.kogus.select(); });
    $('#loobu').addEventListener('click', function () { valmis(); });
    vorm.addEventListener('submit', function (e) {
      e.preventDefault();
      var k = kogus();
      if (!isFinite(k) || k <= 0) { teade('Kogus peab olema suurem kui 0.', 'viga'); return; }
      var v = suund === 'VÄLJA';
      var masin = v && vorm.masin ? vorm.masin.value : '';
      if (masin) { try { localStorage.setItem('lao.masin', masin); } catch (e2) { /* ignoreeri */ } }
      salvesta(vorm, {
        id: LAO.uusId(), toote_id: t.id, tyyp: v ? 'VÄLJA' : 'SISSE', kogus: k,
        kellele_kuhu: masin,
        markus: vorm.markus.value, skannimise_aeg: aeg.toISOString()
      }, t, function (uus) {
        return (v ? 'VÄLJA ' : 'SISSE ') + LAO.arvTekst(k) + ' ' + t.yhik + ' – ' + t.nimetus + (masin ? ' → ' + masin : '') +
          '. Saldo nüüd ' + LAO.arvTekst(uus.saldo) + ' ' + t.yhik + '.';
      });
    });
    kontrolli();
    if (!LAO.onPuude()) $('#kinnita').focus(); // arvutis: Enter kinnitab koguse 1
  }

  /** Kiirrežiim: salvestab kohe koguse 1 (tulemuses on Tühista). */
  function kiirSalvesta(t, aeg) {
    var v = reziim === 'valja';
    var masin = v ? kiirMasin() : '';
    salvesta(null, {
      id: LAO.uusId(), toote_id: t.id, tyyp: v ? 'VÄLJA' : 'SISSE', kogus: 1,
      kellele_kuhu: masin, markus: '', skannimise_aeg: aeg.toISOString()
    }, t, function (uus) {
      return (v ? 'VÄLJA 1 ' : 'SISSE 1 ') + t.yhik + ' – ' + t.nimetus + (masin ? ' → ' + masin : '') +
        '. Saldo nüüd ' + LAO.arvTekst(uus.saldo) + ' ' + t.yhik + '.';
    });
  }

  // -------------------------------------------------------------------------
  // TÖÖRIIST: välja / tagasi
  // -------------------------------------------------------------------------

  function tooriistaVorm(t, aeg) {
    skanner.paus(true);
    var admin = LAO.onAdmin();
    var html = tooteKaart(t);
    var osad = LAO.komplektiOsad(t);
    var kiired = t.olek === 'LAOS' ? kelleleList().slice(0, 6) : [];
    if (t.olek === 'LAOS') {
      html +=
        '<form id="tooriistaVorm" autocomplete="off">' +
        (kiired.length ? '  <div class="sildike">Anna välja – vajuta nimele:</div><div class="kellele-kiir">' + kiired.map(function (v) {
          return '<button type="button" class="nupp kiirnupp" data-kellele="' + esc(v) + '">' + esc(v) + '</button>';
        }).join('') + '</div>' : '') +
        '  <label>' + (kiired.length ? 'või kirjuta kellele / kuhu' : 'Kellele / kuhu *') + '<input name="kellele" list="kelleleList" required placeholder="nt Jaan Tamm või Objekt Tartu"></label>' +
        '  <datalist id="kelleleList">' + kelleleValikud() + '</datalist>' +
        osadeValik(osad.filter(function (o) { return o.olek === 'LAOS'; }), 'Anna koos välja') +
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
        (t.olek === 'VÄLJA ANTUD' ? osadeValik(osad.filter(function (o) {
          return o.olek === 'VÄLJA ANTUD' && o.kellele === t.kellele;
        }), 'Tagasta koos') : '') +
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
        var kaasa = valitudOsad(vorm);
        salvesta(vorm, {
          id: LAO.uusId(), toote_id: t.id, tyyp: 'VÄLJA_ANTUD', kellele_kuhu: kellele,
          markus: vorm.markus.value, skannimise_aeg: aeg.toISOString()
        }, t, function () { return 'VÄLJA ANTUD: ' + t.nimetus + osadeTekst(kaasa) + ' → ' + kellele; }, false,
        kaasa.map(function (o) {
          return { id: LAO.uusId(), toote_id: o.id, tyyp: 'VÄLJA_ANTUD', kellele_kuhu: kellele,
            markus: vorm.markus.value, skannimise_aeg: aeg.toISOString() };
        }));
      } else {
        var tagasi = valitudOsad(vorm);
        salvesta(vorm, {
          id: LAO.uusId(), toote_id: t.id, tyyp: 'TAGASTATUD', markus: vorm.markus.value, skannimise_aeg: aeg.toISOString()
        }, t, function () { return 'TAGASTATUD: ' + t.nimetus + osadeTekst(tagasi) + ' on laos.'; }, false,
        tagasi.map(function (o) {
          return { id: LAO.uusId(), toote_id: o.id, tyyp: 'TAGASTATUD', markus: vorm.markus.value, skannimise_aeg: aeg.toISOString() };
        }));
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
    // Kiirnupp: nimi + kohe välja (komplekti osad ja märkus lähevad kaasa nagu vormis)
    Array.prototype.forEach.call(vorm.querySelectorAll('[data-kellele]'), function (b) {
      b.addEventListener('click', function () {
        vorm.kellele.value = b.dataset.kellele;
        if (vorm.requestSubmit) vorm.requestSubmit(); else vorm.querySelector('[type=submit]').click();
      });
    });
    // Telefonis ei ava klaviatuuri (kataks kiirnupud); arvutis fookus väljale
    if (vorm.kellele && (!LAO.onPuude() || !kiired.length)) vorm.kellele.focus();
  }

  function osadeTekst(osad) {
    return osad.length ? ' + ' + osad.map(function (o) { return o.nimetus; }).join(', ') : '';
  }

  /** Kellele/kuhu soovitused: serveri nimekiri + selles seadmes viimati kasutatud. */
  function kelleleList() {
    var kohalikud = [];
    try { kohalikud = JSON.parse(localStorage.getItem('lao.kellele') || '[]'); } catch (e) { /* ignoreeri */ }
    var nahtud = {};
    return kohalikud.concat(LAO.andmed.kelleleSoovitused || []).filter(function (v) {
      var k = String(v).toLowerCase();
      if (!k || nahtud[k]) return false;
      nahtud[k] = true;
      return true;
    });
  }

  function kelleleValikud() {
    return kelleleList().map(function (v) { return '<option value="' + esc(v) + '">'; }).join('');
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

  /** Riiuli valik nimekirjast (kui silti pole käepärast) + Katkesta. */
  function riiuliValikHtml(nupuTekst) {
    return '<select id="uusRiiul">' + LAO.riiuliValikud('').replace('– pole määratud –', '– või vali riiul –') + '</select>' +
      '<div class="nupurida suured-nupud"><button class="nupp nupp-suur" id="loobu">Katkesta</button>' +
      '<button class="nupp nupp-suur nupp-pohi" id="paigutaNupp">' + esc(nupuTekst) + '</button></div>';
  }

  function seoRiiuliValik() {
    $('#loobu').addEventListener('click', function () { paigutatav = null; valmis(); });
    $('#paigutaNupp').addEventListener('click', function () {
      var r2 = LAO.riiul($('#uusRiiul').value);
      if (!r2) { teade('Vali riiul või skänni riiuli silt.', 'viga'); return; }
      paigutaRiiulile(r2);
    });
  }

  function valiPaigutatav(t) {
    paigutatav = t;
    var r = LAO.riiul(t.riiul_id);
    $('#toiming').innerHTML = tooteKaart(t) +
      '<div class="kaart-teade info"><b>Nüüd skänni riiuli silt</b>' +
      '<p>Praegu: ' + esc(r ? r.kood : 'riiul määramata') + '</p>' +
      riiuliValikHtml('Paiguta') + '</div>';
    seoRiiuliValik();
    skanner.paus(false); // ootame riiuli skännimist
  }

  /**
   * Tundmatu kood PAIGUTA-režiimis: nime ei küsita, kohe palutakse riiul.
   * Toode luuakse riiuli skännimisel ajutise nimega „(nimeta) <kood>”.
   */
  function uusPaigutatav(kood, aeg, toores) {
    LAO.piiks('hoiatus');
    var minu = skanniNr;
    var tyyp = (paigutatav && paigutatav.uus && paigutatav.tyyp) || 'VARUOSA'; // jäta eelmine valik meelde
    paigutatav = { uus: true, kood: kood, tyyp: tyyp, mudel: LAO.tehaseMudel(toores) };
    $('#toiming').innerHTML =
      '<div class="kaart-teade hoiatus"><b>Uus kood:</b> <code>' + esc(kood) + '</code>' +
      '<p>Toode lisatakse ilma nimeta – nime saad lisada hiljem.</p>' +
      '<div class="segment" id="uusTyyp">' +
      '  <label><input type="radio" name="uusTyyp" value="VARUOSA"' + (tyyp === 'VARUOSA' ? ' checked' : '') + '><span>Varuosa</span></label>' +
      '  <label><input type="radio" name="uusTyyp" value="TÖÖRIIST"' + (tyyp === 'TÖÖRIIST' ? ' checked' : '') + '><span>Tööriist</span></label>' +
      '</div></div>' +
      '<div class="kaart-teade info"><b>Nüüd skänni riiuli silt</b>' +
      riiuliValikHtml('Lisa riiulile') +
      '<div class="nupurida nupurida-vasak"><button class="nupp nupp-vaike" id="nimiKohe">Lisa nimi kohe</button></div></div>';
    seoRiiuliValik();
    Array.prototype.forEach.call(document.querySelectorAll('[name=uusTyyp]'), function (r) {
      r.addEventListener('change', function () { if (paigutatav && paigutatav.uus) paigutatav.tyyp = r.value; });
    });
    $('#nimiKohe').addEventListener('click', function () {
      var p = paigutatav;
      skanner.paus(true);
      var salvestatud = false;
      var aken = LAO.avaLisaToode({ kood: kood, mudel: p ? p.mudel : '', tyyp: p ? p.tyyp : 'VARUOSA' }, function (loodud) {
        salvestatud = true;
        var t = LAO.toode(loodud[0].id);
        if (!t) { paigutatav = null; return valmis(); }
        var r = LAO.riiul(t.riiul_id);
        if (r) { // riiul valiti juba vormis
          paigutatav = null;
          naitaTulemust('Uus toode ' + t.nimetus + ' → riiul ' + r.kood, { ok: true }, { id: t.id }, true, null, t.id);
          return valmis();
        }
        valiPaigutatav(t);
      }, { kohe: true });
      aken.addEventListener('close', function () {
        if (!salvestatud && minu === skanniNr) skanner.paus(false); // tagasi riiuli ootamisse
      });
    });
    skanner.paus(false); // ootame riiuli skännimist (või uut tootekoodi)
  }

  function paigutaRiiulile(riiul) {
    var t = paigutatav;
    if (!t) { teade('Skänni kõigepealt toode, siis riiul.', 'viga'); LAO.piiks('viga'); return; }
    if (t.uus) return lisaUusRiiulile(t, riiul);
    if (t.riiul_id === riiul.id) {
      // Juba õigel kohal – kinnita ja oota järgmist toodet
      paigutatav = null;
      naitaTulemust(t.nimetus + ' on juba riiulil ' + riiul.kood + '.', { ok: true }, { id: null }, true);
      return valmis();
    }
    skanner.paus(true);
    var vana = LAO.riiul(t.riiul_id);
    salvesta(null, {
      id: LAO.uusId(), toote_id: t.id, tyyp: 'ÜMBERPAIGUTUS', kellele_kuhu: riiul.id, skannimise_aeg: new Date().toISOString()
    }, t, function () {
      return t.nimetus + ': ' + (vana ? vana.kood : '(riiulita)') + ' → ' + riiul.kood;
    }, true);
    paigutatav = null;
  }

  /** Uus toode ajutise nimega otse riiulile – seadmesse kohe, serverisse taustal (vt js/jarjekord.js). */
  function lisaUusRiiulile(p, riiul) {
    skanner.paus(true);
    paigutatav = null;
    if (LAO.leiaKoodiga(p.kood)) { // keegi lisas vahepeal (taustauuendus) – paiguta olemasolev
      var leitud = LAO.leiaKoodiga(p.kood);
      if (leitud.toode) { paigutatav = leitud.toode; return paigutaRiiulile(riiul); }
    }
    LAO.jarjekord.lisaToode({
      kood: p.kood, nimetus: LAO.nimetaNimi(p.mudel || p.kood), tyyp: p.tyyp, yhik: 'tk',
      kategooria: '', riiul_id: riiul.id, miinimumkogus: ''
    }).then(function (loodud) {
      naitaTulemust('Uus toode ' + p.kood + ' → riiul ' + riiul.kood + ' (nimi lisamata)', { ok: true }, { id: loodud[0].id }, true, null, loodud[0].id);
      valmis();
    }).catch(function (err) {
      LAO.piiks('viga');
      teade(err.message, 'viga');
      valmis();
    });
  }

  // -------------------------------------------------------------------------
  // SALVESTAMINE JA TÜHISTAMINE
  // -------------------------------------------------------------------------

  /**
   * Salvestab liikumise (kohe seadmesse, serverisse taustal – vt js/jarjekord.js).
   * kirjeldus(uusSeis) → tulemuse tekst. eiTyhista: ümberpaigutust ei saa tühistada.
   * lisad: samas toimingus kaasa minevad liikumised (komplekti osad) – tühistatakse koos.
   */
  function salvesta(vorm, liikumine, t, kirjeldus, eiTyhista, lisad) {
    if (vorm) LAO.hoivatud(vorm, true);
    var nupud = document.querySelectorAll('#toiming button');
    Array.prototype.forEach.call(nupud, function (b) { b.disabled = true; });
    var t0 = performance.now();
    lisad = lisad || [];
    LAO.salvestaLiikumised([liikumine].concat(lisad)).then(function (tul) {
      ajad.salvestus = performance.now() - t0;
      API.mootmine('salvestus', ajad.salvestus);
      var r = tul[0];
      if (!r.ok) throw new Error(r.viga || 'Salvestamine ebaõnnestus.');
      if (liikumine.kellele_kuhu && liikumine.tyyp === 'VÄLJA_ANTUD') jataKellegeMeelde(liikumine.kellele_kuhu);
      var uus = LAO.toode(t.id) || t;
      naitaTulemust(kirjeldus(uus), r, liikumine, eiTyhista, lisad);
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
  function naitaTulemust(tekst, r, liikumine, eiTyhista, lisad, sildiToode) {
    LAO.piiks('ok');
    naidatav = liikumine.id; // null = midagi ei salvestatud (nt toode oli juba õigel riiulil)
    $('#tulemus').innerHTML =
      '<div class="tulemus tulemus-ok">' +
      '<div class="tulemus-tekst">✓ ' + esc(tekst) +
      (liikumine.id === null ? '' : '<div class="vaike saatmise-olek">' + (navigator.onLine ? 'Salvestatud, saadan serverisse…' : 'Salvestatud seadmesse – saadetakse, kui internet tagasi tuleb.') + '</div>') +
      (API.arendus() ? '<div class="vaike ajarida">⏱ otsing ' + LAO.ajaTekst(ajad.otsing || 0) + ' · salvestus seadmesse ' + LAO.ajaTekst(ajad.salvestus || 0) +
        ' · server <span class="serveriaeg">…</span></div>' : '') + '</div>' +
      (sildiToode && LAO.kiirprint ? '<button type="button" class="nupp nupp-vaike sildi-nupp" data-silt="' + esc(sildiToode) + '">🖨 Silt</button>' : '') +
      (eiTyhista ? '' : '<button class="nupp nupp-vaike" id="tyhista">Tühista</button>') +
      '</div>';
    if (eiTyhista) return;
    $('#tyhista').addEventListener('click', function () {
      var b = $('#tyhista');
      b.disabled = true;
      // Komplekt: koos välja antud / tagastatud osad tühistatakse koos põhitööriistaga
      var idd = [liikumine.id].concat((lisad || []).map(function (l) { return l.id; }));
      LAO.jarjekord.tyhistaMitu(idd).then(function (tul) {
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
    if (!olek) return;
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

  // 🖨 Silt: skännitud toote kaardil ja uue toote tulemuses (prindiaken js/sildid.js)
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.sildi-nupp');
    if (b && LAO.kiirprint) LAO.kiirprint({ toode: b.dataset.silt });
  });

  // ✎ Toote kirjeldus: püsiv tekst toote juures (Code.gs tooted.kirjeldus, vajab internetti)
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.kirjeldus-nupp');
    if (!b) return;
    var t = LAO.toode(b.dataset.kirjeldus);
    if (!t) return;
    LAO.modaal('Kirjeldus: ' + t.nimetus,
      '<form><textarea name="kirjeldus" rows="5" maxlength="1000" placeholder="nt mõõdud, sobivus, kust tellida">' + esc(t.kirjeldus || '') + '</textarea>' +
      LAO.MODAALI_NUPUD + '</form>',
      function (v) {
        if (t.ootel) return Promise.reject(new Error('Toode on veel serverisse saatmata – proovi hetke pärast uuesti.'));
        if (!navigator.onLine) return Promise.reject(new Error('Kirjelduse salvestamiseks on vaja internetti.'));
        return API.kutsu('tooted.kirjeldus', { id: t.id, kirjeldus: v.kirjeldus.value }).then(function (r) {
          t.kirjeldus = r && r.kirjeldus !== undefined ? r.kirjeldus : v.kirjeldus.value.trim();
          var el = document.querySelector('[data-kirjeldus-tekst="' + t.id + '"]');
          if (el) { el.textContent = t.kirjeldus; el.hidden = !t.kirjeldus; }
          b.textContent = '✎ ' + (t.kirjeldus ? 'Muuda kirjeldust' : 'Lisa kirjeldus');
          teade('Kirjeldus salvestatud.');
          LAO.laeAndmed().catch(function () { /* taustal */ });
        }, function (err) {
          if (err.kood === 'VALE_PARING') throw new Error('Server on vana – kleebi uus Code.gs ja tee uus juurutus.');
          throw err;
        });
      });
  });

  // 📍 SKÄNNI vaates: toode → riiul (nagu PAIGUTA)
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.riiul-nupp');
    if (!b || reziim !== 'skanni') return;
    var t = LAO.toode(b.dataset.riiulToode);
    if (t) valiPaigutatav(t);
  });

  LAO.vaated['skanni'] = { fn: looVaade('skanni') };
  LAO.vaated['sisse'] = { fn: looVaade('sisse') };
  LAO.vaated['valja'] = { fn: looVaade('valja') };
  LAO.vaated['tooriist'] = { fn: looVaade('tooriist') };
  LAO.vaated['paiguta'] = { fn: looVaade('paiguta') };
})();
