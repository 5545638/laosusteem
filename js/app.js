/**
 * RAKENDUS – vaated ja navigeerimine.
 *
 * Vaated vahetuvad aadressi #-osa järgi (nt #/kasutajad). Iga vaade on
 * funktsioon, mis joonistab sisu elementi <main id="sisu">.
 * Uue vaate lisamiseks: kirjuta funktsioon ja lisa see VAATED tabelisse.
 */
(function () {
  'use strict';

  var sisu = document.getElementById('sisu');

  // -------------------------------------------------------------------------
  // ABIFUNKTSIOONID
  // -------------------------------------------------------------------------

  /** Muudab teksti HTML-i jaoks ohutuks (kasutajate sisestatud tekst!). */
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function $(sel, juur) { return (juur || document).querySelector(sel); }

  /** Näitab ekraani allservas lühiteadet. tyyp: 'ok' | 'viga' */
  var teateTaimer = null;
  function teade(tekst, tyyp) {
    var el = document.getElementById('teade');
    el.textContent = tekst;
    el.className = 'teade ' + (tyyp === 'viga' ? 'teade-viga' : 'teade-ok');
    el.hidden = false;
    clearTimeout(teateTaimer);
    teateTaimer = setTimeout(function () { el.hidden = true; }, tyyp === 'viga' ? 6000 : 3000);
  }

  /** Kuupäev ja kellaaeg Eesti vormingus. */
  function aeg(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleString('et-EE', { timeZone: 'Europe/Tallinn', dateStyle: 'short', timeStyle: 'short' });
  }

  /** Lukustab vormi nupud päringu ajaks, et topeltklõps ei saadaks kaks korda. */
  function hoivatud(vorm, jah) {
    Array.prototype.forEach.call(vorm.querySelectorAll('button, input, select'), function (el) { el.disabled = jah; });
  }

  /** Kas sisseloginud kasutaja on admin. */
  function onAdmin() {
    var s = API.seanss();
    return !!(s && s.kasutaja.roll === 'ADMIN');
  }

  /**
   * Lihtne modaalaken. sisuHtml peab sisaldama <form>-i.
   * kuiSaadab(vorm) tagastab Promise'i; õnnestumisel aken suletakse.
   */
  function modaal(pealkiri, sisuHtml, kuiSaadab) {
    var d = document.createElement('dialog');
    d.className = 'modaal';
    d.innerHTML = '<h2>' + esc(pealkiri) + '</h2>' + sisuHtml;
    document.body.appendChild(d);
    var vorm = d.querySelector('form');
    var viga = document.createElement('p');
    viga.className = 'vormi-viga';
    vorm.appendChild(viga);
    d.querySelector('[data-sulge]').addEventListener('click', function () { d.close(); });
    d.addEventListener('close', function () { d.remove(); });
    vorm.addEventListener('submit', function (e) {
      e.preventDefault();
      viga.textContent = '';
      hoivatud(vorm, true);
      Promise.resolve(kuiSaadab(vorm)).then(function () { d.close(); }, function (err) {
        hoivatud(vorm, false);
        viga.textContent = err.message;
      });
    });
    d.showModal();
    var esimene = vorm.querySelector('input, select');
    if (esimene) esimene.focus();
    return d;
  }

  // -------------------------------------------------------------------------
  // ÜLARIBA JA OLEKURIBA
  // -------------------------------------------------------------------------

  function uuendaYlariba() {
    var s = API.seanss();
    $('#ylariba').hidden = !s;
    $('#olekuriba').hidden = !s;
    if (s) $('#kasutajaNimi').textContent = s.kasutaja.nimi + (s.kasutaja.roll === 'ADMIN' ? ' (admin)' : '');
    // Olekuriba sisu (sünkroonimise olek) joonistab js/jarjekord.js
    if (LAO.uuendaOlekuriba) LAO.uuendaOlekuriba();
  }

  $('#valjaNupp').addEventListener('click', function () {
    var s = API.seanss();
    var ootel = s && LAO.jarjekord ? LAO.jarjekord.ootelArv(s.kasutaja.id) : 0;
    if (ootel) {
      // Saatmata liikumisi ei kustutata: seansivõti jääb seadmesse, kuni need on saadetud
      if (!confirm('Seadmes on ' + ootel + ' saatmata liikumist.\n\nNeid ei kustutata – need saadetakse automaatselt, ' +
        'kui internet on olemas (ka siis, kui keegi teine vahepeal sisse logib).\n\nKas logid välja?')) return;
      LAO.jarjekord.maaraVanaVoti(s.kasutaja.id, s.token);
    } else {
      if (!confirm('Kas logid välja?')) return;
      API.kutsu('logout').catch(function () { /* seadmest kustutame igal juhul */ });
    }
    API.salvestaSeanss(null);
    location.hash = '#/login';
  });

  // Kui server ütleb, et seanss on kehtetu (aegunud või kasutaja lukustatud).
  API.kuiSeanssKehtetu = function (pohjus) {
    teade(pohjus || 'Logi uuesti sisse.', 'viga');
    location.hash = '#/login';
  };

  // -------------------------------------------------------------------------
  // VAADE: SISSELOGIMINE
  // -------------------------------------------------------------------------

  function vaadeLogin() {
    if (API.seanss()) { location.hash = '#/avaleht'; return; }
    sisu.innerHTML =
      '<section class="kaart kitsas">' +
      '  <h1>Logi sisse</h1>' +
      '  <form id="loginVorm" autocomplete="on">' +
      '    <label>Kasutajanimi<input name="kasutajanimi" autocomplete="username" autocapitalize="none" required></label>' +
      '    <label>PIN<input name="pin" type="password" inputmode="numeric" pattern="[0-9]*" ' +
      '      minlength="4" maxlength="6" autocomplete="current-password" required></label>' +
      '    <button class="nupp nupp-suur nupp-pohi" type="submit">Logi sisse</button>' +
      '    <p class="vormi-viga" id="loginViga"></p>' +
      '  </form>' +
      '  <p id="seadistusLink" class="vaike" hidden><a href="#/seadistus">Süsteem on seadistamata – loo esimene admin</a></p>' +
      '  <p class="vaike"><a href="#/seaded">Seaded</a></p>' +
      '</section>';

    var vorm = $('#loginVorm');
    if (!API.apiUrl()) {
      $('#loginViga').innerHTML = 'API aadress on seadistamata. Ava <a href="#/seaded">Seaded</a>.';
    } else {
      // Kontrolli, kas esimene admin on loomata.
      API.kutsu('olek').then(function (o) { if (o.nouabSeadistust) $('#seadistusLink').hidden = false; })
        .catch(function (err) { $('#loginViga').textContent = err.message; });
    }

    vorm.addEventListener('submit', function (e) {
      e.preventDefault();
      $('#loginViga').textContent = '';
      hoivatud(vorm, true);
      API.kutsu('login', {
        kasutajanimi: vorm.kasutajanimi.value,
        pin: vorm.pin.value,
        seade: API.seadmeKirjeldus()
      }).then(function (s) {
        API.salvestaSeanss(s);
        location.hash = '#/avaleht';
        if (LAO.jarjekord) LAO.jarjekord.synkroniseeri();
        if (LAO.laeAndmed) LAO.laeAndmed().catch(function () {});
      }).catch(function (err) {
        hoivatud(vorm, false);
        vorm.pin.value = '';
        $('#loginViga').textContent = err.message;
        vorm.pin.focus();
      });
    });
    vorm.kasutajanimi.focus();
  }

  // -------------------------------------------------------------------------
  // VAADE: ESIMESE ADMINI LOOMINE
  // -------------------------------------------------------------------------

  function vaadeSeadistus() {
    sisu.innerHTML =
      '<section class="kaart kitsas">' +
      '  <h1>Esimene admin</h1>' +
      '  <p class="vaike">Seadistuskoodi näed, kui käivitad Apps Scriptis funktsiooni <b>seadista</b> (vt juhend).</p>' +
      '  <form id="seadVorm">' +
      '    <label>Seadistuskood<input name="seadistuskood" autocapitalize="characters" required></label>' +
      '    <label>Kasutajanimi<input name="kasutajanimi" autocapitalize="none" required placeholder="nt mari"></label>' +
      '    <label>Täisnimi<input name="nimi" required placeholder="nt Mari Maasikas"></label>' +
      '    <label>PIN (4–6 numbrit)<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,6}" required></label>' +
      '    <label>PIN uuesti<input name="pin2" type="password" inputmode="numeric" pattern="[0-9]{4,6}" required></label>' +
      '    <button class="nupp nupp-suur nupp-pohi" type="submit">Loo admin ja logi sisse</button>' +
      '    <p class="vormi-viga" id="seadViga"></p>' +
      '  </form>' +
      '  <p class="vaike"><a href="#/login">Tagasi</a></p>' +
      '</section>';

    var vorm = $('#seadVorm');
    vorm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (vorm.pin.value !== vorm.pin2.value) { $('#seadViga').textContent = 'PIN-id ei kattu.'; return; }
      hoivatud(vorm, true);
      API.kutsu('esimeneAdmin', {
        seadistuskood: vorm.seadistuskood.value,
        kasutajanimi: vorm.kasutajanimi.value,
        nimi: vorm.nimi.value,
        pin: vorm.pin.value,
        seade: API.seadmeKirjeldus()
      }).then(function (s) {
        API.salvestaSeanss(s);
        teade('Admin loodud. Tere tulemast!');
        location.hash = '#/avaleht';
      }).catch(function (err) {
        hoivatud(vorm, false);
        $('#seadViga').textContent = err.message;
      });
    });
  }

  // -------------------------------------------------------------------------
  // VAADE: AVALEHT (menüü)
  // -------------------------------------------------------------------------

  /**
   * Menüü kirjed. "etapp" näitab, millises etapis vaade valmib; kuni selleni
   * on nupp hall. admin: true = näha ainult adminile.
   */
  var MENYY = [
    { pealkiri: 'SISSE', kirjeldus: 'Kauba vastuvõtt', href: '#/sisse', etapp: 3 },
    { pealkiri: 'VÄLJA', kirjeldus: 'Kauba väljastamine', href: '#/valja', etapp: 3 },
    { pealkiri: 'TÖÖRIIST', kirjeldus: 'Välja / tagasi', href: '#/tooriist', etapp: 3 },
    { pealkiri: 'ÜMBER­PAIGUTUS', kirjeldus: 'Toode uuele riiulile', href: '#/paiguta', etapp: 3 },
    { pealkiri: 'LADU', kirjeldus: 'Saldod ja otsing', href: '#/ladu', etapp: 6 },
    { pealkiri: 'VÄLJAS OLEVAD', kirjeldus: 'Tööriistad väljas', href: '#/valjas', etapp: 6 },
    { pealkiri: 'AJALUGU', kirjeldus: 'Kõik liikumised', href: '#/ajalugu', etapp: 6 },
    { pealkiri: 'TOOTED', kirjeldus: 'Lisa ja muuda', href: '#/tooted', etapp: 2, admin: true },
    { pealkiri: 'RIIULID', kirjeldus: 'Asukohad', href: '#/riiulid', etapp: 2, admin: true },
    { pealkiri: 'SILDID', kirjeldus: 'Sildiprint', href: '#/sildid', etapp: 5, admin: true },
    { pealkiri: 'KASUTAJAD', kirjeldus: 'Kasutajate haldus', href: '#/kasutajad', etapp: 1, admin: true },
    { pealkiri: 'KONFLIKTID', kirjeldus: 'Vajavad ülevaatust', href: '#/konfliktid', etapp: 4, admin: true },
    { pealkiri: 'SEADED', kirjeldus: 'API aadress', href: '#/seaded', etapp: 1 }
  ];
  var VALMIS_ETAPP = 6; // tõsta pärast iga etapi valmimist

  function vaadeAvaleht(param, varske) {
    var admin = onAdmin();
    var nupud = MENYY.filter(function (m) { return !m.admin || admin; }).map(function (m) {
      var valmis = m.etapp <= VALMIS_ETAPP;
      // KONFLIKTID-paanil lahendamata konfliktide arv
      var arv = m.href === '#/konfliktid' && LAO.andmed && LAO.andmed.konfliktideArv
        ? ' <span class="arvumark">' + LAO.andmed.konfliktideArv + '</span>' : '';
      return valmis
        ? '<a class="paan' + (arv ? ' paan-hoiatus' : '') + '" href="' + m.href + '"><b>' + esc(m.pealkiri) + arv + '</b><span>' + esc(m.kirjeldus) + '</span></a>'
        : '<span class="paan paan-tulekul"><b>' + esc(m.pealkiri) + '</b><span>Tuleb etapis ' + m.etapp + '</span></span>';
    }).join('');
    // Kasutaja enda liikumised, mille server märkis konfliktiks
    var minu = (LAO.andmed && LAO.andmed.minuKonfliktid) || [];
    var hoiatus = minu.length
      ? '<div class="kaart-teade hoiatus avalehe-teade">⚠ <b>' + minu.length + ' sinu liikumist ootab admini ülevaatust.</b> ' +
        'Vajuta ülal olekuribale, et näha üksikasju.</div>'
      : '';
    sisu.innerHTML = '<section>' + hoiatus + '<div class="paanid">' + nupud + '</div></section>';
    // Värskenda andmed (ja konfliktide arvud) taustal; muutuse korral joonista uuesti
    if (!varske && navigator.onLine && LAO.laeAndmed) {
      var enne = minu.length + '/' + LAO.andmed.konfliktideArv;
      LAO.laeAndmed().then(function (d) {
        var nyyd = (d.minuKonfliktid || []).length + '/' + d.konfliktideArv;
        if (nyyd !== enne && /avaleht/.test(location.hash)) vaadeAvaleht(null, true);
      }).catch(function () { /* võrguta jääb seadmes olev */ });
    }
  }

  // -------------------------------------------------------------------------
  // VAADE: KASUTAJAD (ainult admin)
  // -------------------------------------------------------------------------

  function vaadeKasutajad() {
    sisu.innerHTML =
      '<section class="kaart">' +
      '  <div class="pealkirjarida"><h1>Kasutajad</h1>' +
      '    <button id="lisaKasutaja" class="nupp nupp-pohi" type="button">+ Lisa kasutaja</button></div>' +
      '  <div id="kasutajateTabel"><p>Laadin…</p></div>' +
      '</section>';
    $('#lisaKasutaja').addEventListener('click', avaLisaKasutaja);
    laeKasutajad();
  }

  function laeKasutajad() {
    API.kutsu('kasutajad.nimekiri').then(function (list) {
      var minuId = API.seanss().kasutaja.id;
      var read = list.map(function (k) {
        var olek = !k.aktiivne ? '<span class="silt silt-viga">Lukustatud</span>'
          : k.ajutiseltLukus ? '<span class="silt silt-hoiatus">Ajutiselt lukus (PIN)</span>'
          : '<span class="silt silt-ok">Aktiivne</span>';
        var nupud =
          '<button class="nupp nupp-vaike" data-tegevus="muuda" data-id="' + esc(k.id) + '">Muuda</button>' +
          '<button class="nupp nupp-vaike" data-tegevus="pin" data-id="' + esc(k.id) + '">Lähtesta PIN</button>' +
          (k.id === minuId ? '' : k.aktiivne
            ? '<button class="nupp nupp-vaike nupp-oht" data-tegevus="lukusta" data-id="' + esc(k.id) + '">Lukusta</button>'
            : '<button class="nupp nupp-vaike" data-tegevus="aktiveeri" data-id="' + esc(k.id) + '">Aktiveeri</button>');
        return '<tr>' +
          '<td data-silt="Kasutajanimi">' + esc(k.kasutajanimi) + '</td>' +
          '<td data-silt="Nimi">' + esc(k.nimi) + '</td>' +
          '<td data-silt="Roll">' + esc(k.roll) + '</td>' +
          '<td data-silt="Olek">' + olek + '</td>' +
          '<td data-silt="Seansse">' + k.seansse + '</td>' +
          '<td data-silt="Loodud">' + esc(aeg(k.loodud)) + '</td>' +
          '<td class="tegevused">' + nupud + '</td></tr>';
      }).join('');
      $('#kasutajateTabel').innerHTML =
        '<table class="tabel"><thead><tr><th>Kasutajanimi</th><th>Nimi</th><th>Roll</th><th>Olek</th>' +
        '<th>Seansse</th><th>Loodud</th><th></th></tr></thead><tbody>' + read + '</tbody></table>';

      Array.prototype.forEach.call(document.querySelectorAll('#kasutajateTabel [data-tegevus]'), function (b) {
        b.addEventListener('click', function () {
          var k = list.filter(function (x) { return x.id === b.dataset.id; })[0];
          ({ muuda: avaMuudaKasutaja, pin: avaLahtestaPin, lukusta: lukustaKasutaja, aktiveeri: aktiveeriKasutaja })[b.dataset.tegevus](k);
        });
      });
    }).catch(function (err) {
      $('#kasutajateTabel').innerHTML = '<p class="vormi-viga">' + esc(err.message) + '</p>';
    });
  }

  function rolliValik(valitud) {
    return '<select name="roll">' +
      '<option value="LAOTÖÖTAJA"' + (valitud === 'LAOTÖÖTAJA' ? ' selected' : '') + '>Laotöötaja</option>' +
      '<option value="ADMIN"' + (valitud === 'ADMIN' ? ' selected' : '') + '>Admin</option></select>';
  }

  var MODAALI_NUPUD =
    '<div class="nupurida"><button type="button" class="nupp" data-sulge>Loobu</button>' +
    '<button type="submit" class="nupp nupp-pohi">Salvesta</button></div>';

  function avaLisaKasutaja() {
    modaal('Lisa kasutaja',
      '<form>' +
      '<label>Kasutajanimi<input name="kasutajanimi" autocapitalize="none" required></label>' +
      '<label>Täisnimi<input name="nimi" required></label>' +
      '<label>Roll' + rolliValik('LAOTÖÖTAJA') + '</label>' +
      '<label>PIN (4–6 numbrit)<input name="pin" inputmode="numeric" pattern="[0-9]{4,6}" required></label>' +
      MODAALI_NUPUD + '</form>',
      function (v) {
        return API.kutsu('kasutajad.lisa', {
          kasutajanimi: v.kasutajanimi.value, nimi: v.nimi.value, roll: v.roll.value, pin: v.pin.value
        }).then(function () { teade('Kasutaja lisatud.'); laeKasutajad(); });
      });
  }

  function avaMuudaKasutaja(k) {
    modaal('Muuda: ' + k.kasutajanimi,
      '<form>' +
      '<label>Kasutajanimi (sisselogimiseks)<input name="kasutajanimi" autocapitalize="none" required value="' + esc(k.kasutajanimi) + '"></label>' +
      '<label>Täisnimi<input name="nimi" required value="' + esc(k.nimi) + '"></label>' +
      '<label>Roll' + rolliValik(k.roll) + '</label>' +
      MODAALI_NUPUD + '</form>',
      function (v) {
        return API.kutsu('kasutajad.muuda', { id: k.id, kasutajanimi: v.kasutajanimi.value, nimi: v.nimi.value, roll: v.roll.value })
          .then(function () {
            teade('Salvestatud.');
            // Kui muutsid iseenda andmeid, uuenda ka seadmesse salvestatud nime
            if (k.id === API.seanss().kasutaja.id) API.kutsu('mina').then(function (m) {
              var s = API.seanss(); s.kasutaja = m; API.salvestaSeanss(s); uuendaYlariba();
            });
            laeKasutajad();
          });
      });
  }

  function avaLahtestaPin(k) {
    modaal('Uus PIN: ' + k.kasutajanimi,
      '<form>' +
      '<p class="vaike">Kasutaja ajutine PIN-lukk eemaldatakse.</p>' +
      '<label>Uus PIN (4–6 numbrit)<input name="pin" inputmode="numeric" pattern="[0-9]{4,6}" required></label>' +
      MODAALI_NUPUD + '</form>',
      function (v) {
        return API.kutsu('kasutajad.lahtestaPin', { id: k.id, pin: v.pin.value })
          .then(function () { teade('PIN muudetud.'); laeKasutajad(); });
      });
  }

  function lukustaKasutaja(k) {
    if (!confirm('Lukustada kasutaja ' + k.kasutajanimi + '?\nKõik tema seadmed logitakse kohe välja.')) return;
    API.kutsu('kasutajad.lukusta', { id: k.id })
      .then(function () { teade('Kasutaja lukustatud.'); laeKasutajad(); })
      .catch(function (err) { teade(err.message, 'viga'); });
  }

  function aktiveeriKasutaja(k) {
    API.kutsu('kasutajad.aktiveeri', { id: k.id })
      .then(function () { teade('Kasutaja aktiveeritud.'); laeKasutajad(); })
      .catch(function (err) { teade(err.message, 'viga'); });
  }

  // -------------------------------------------------------------------------
  // VAADE: SEADED
  // -------------------------------------------------------------------------

  var RAKENDUSE_VERSIOON = 'v10'; // sama number mis ?v= failis index.html

  function vaadeSeaded() {
    var configUrl = (window.LAO_CONFIG && window.LAO_CONFIG.API_URL) || '';
    var kaamera = LAO.valitudKaamera();
    sisu.innerHTML =
      '<section class="kaart kitsas">' +
      '  <h1>Seaded</h1>' +
      '  <form id="seadedVorm">' +
      '    <label>Apps Scripti API aadress (lõpeb /exec)' +
      '      <input name="url" type="url" placeholder="https://script.google.com/macros/s/…/exec" value="' + esc(API.apiUrl()) + '"></label>' +
      '    <p class="vaike">' + (configUrl ? 'Vaikimisi aadress on määratud failis config.js.' : 'Failis config.js aadressi pole – see kehtib ainult selles seadmes.') + '</p>' +
      '    <div class="nupurida">' +
      '      <button type="button" id="testiNupp" class="nupp">Testi ühendust</button>' +
      '      <button type="submit" class="nupp nupp-pohi">Salvesta</button></div>' +
      '    <p id="seadedTulemus" class="vaike"></p>' +
      '  </form>' +
      (API.seanss() && onAdmin()
        ? '  <h2>Saldode kontroll</h2>' +
          '  <p class="vaike">Arvutab iga toote saldo/oleku kõigist liikumistest uuesti ja võrdleb tabeli lehega Saldod. ' +
          'Erinevus tekib ainult siis, kui Liikumiste lehte on käsitsi muudetud.</p>' +
          '  <div class="nupurida nupurida-vasak"><button type="button" id="kontrolliSaldosid" class="nupp">Kontrolli saldosid</button></div>' +
          '  <div id="saldoKontroll"></div>'
        : '') +
      '  <h2>Kaamera</h2>' +
      '  <p class="vaike">Kui telefon vahetab koodile lähedale minnes kaamerat või pilt jääb häguseks, vali siit kindel kaamera. ' +
      'iPhone\'il loeb lähedalt kõige teravamalt ülilainurkkaamera (Ultra Wide); tavaline tagakaamera vajab umbes 15 cm vahet.</p>' +
      '  <label>Skännimise kaamera<select id="kaameraValik"><option value="">Automaatne (tagakaamera)</option>' +
      (kaamera.id ? '<option value="' + esc(kaamera.id) + '" selected>' + esc(kaamera.nimi || 'Valitud kaamera') + '</option>' : '') +
      '</select></label>' +
      '  <div class="nupurida nupurida-vasak"><button type="button" id="otsiKaameraid" class="nupp">Otsi kaameraid</button></div>' +
      '  <p id="kaameraTulemus" class="vaike"></p>' +
      '  <h2>Arendusrežiim</h2>' +
      '  <label class="linnuke"><input type="checkbox" id="arendus"' + (API.arendus() ? ' checked' : '') + '> Näita aegu (skännimisel ja siin)</label>' +
      '  <div id="ajad"></div>' +
      '  <p class="vaike">Rakenduse versioon ' + RAKENDUSE_VERSIOON + ' · <a href="#/avaleht">Tagasi</a></p>' +
      '</section>';
    var vorm = $('#seadedVorm');
    vorm.addEventListener('submit', function (e) {
      e.preventDefault();
      // Kui sisestatu on sama mis config.js-is, pole seadmesse eraldi vaja salvestada.
      API.maaraApiUrl(vorm.url.value.trim() === configUrl ? '' : vorm.url.value);
      teade('Salvestatud.');
    });
    $('#testiNupp').addEventListener('click', function () {
      var vana = API.apiUrl();
      API.maaraApiUrl(vorm.url.value);
      $('#seadedTulemus').textContent = 'Kontrollin…';
      API.kutsu('olek').then(function (o) {
        $('#seadedTulemus').textContent = 'Ühendus töötab. Serveri versioon ' + o.versioon +
          (o.nouabSeadistust ? '. Esimene admin on veel loomata.' : '.');
      }).catch(function (err) {
        $('#seadedTulemus').textContent = 'Ei õnnestunud: ' + err.message;
      }).then(function () { API.maaraApiUrl(vana === configUrl ? '' : vana); });
    });
    if ($('#kontrolliSaldosid')) $('#kontrolliSaldosid').addEventListener('click', kontrolliSaldosid);
    $('#arendus').addEventListener('change', function () { API.arendus(this.checked); naitaAegu(); });
    $('#kaameraValik').addEventListener('change', function () {
      var o = this.selectedOptions[0];
      LAO.valiKaamera(this.value, this.value ? o.textContent : '');
      teade('Kaamera valitud: ' + o.textContent);
    });
    $('#otsiKaameraid').addEventListener('click', otsiKaameraid);
    naitaAegu();
  }

  /** Täidab kaamera valiku seadme kaameratega (nimed näitab brauser alles pärast kaamera luba). */
  function otsiKaameraid() {
    var tulemus = $('#kaameraTulemus'), valik = $('#kaameraValik');
    tulemus.textContent = 'Otsin…';
    LAO.kaamerad().then(function (list) {
      var praegu = LAO.valitudKaamera().id;
      valik.innerHTML = '<option value="">Automaatne (tagakaamera)</option>' + list.map(function (k, i) {
        return '<option value="' + esc(k.id) + '"' + (k.id === praegu ? ' selected' : '') + '>' + esc(k.label || 'Kaamera ' + (i + 1)) + '</option>';
      }).join('');
      tulemus.textContent = list.length ? 'Leitud ' + list.length + ' kaamerat. Vali nimekirjast.' : 'Kaameraid ei leitud.';
    }).catch(function (err) {
      var t = String(err && (err.name || err.message || err));
      tulemus.textContent = /NotAllowed|Permission/i.test(t) ? 'Kaamera kasutamine on keelatud – luba see brauseri seadetes.' : 'Ei õnnestunud: ' + t;
    });
  }

  /** Saldode lehe kontroll (admin): erinevused liikumistest arvutatud seisuga. */
  function kontrolliSaldosid() {
    var kast = $('#saldoKontroll');
    kast.innerHTML = '<p class="vaike">Kontrollin… (loeb kõik liikumised, võib võtta mõne sekundi)</p>';
    API.kutsu('saldod.kontrolli').then(function (r) {
      if (!r.erinevused.length) {
        kast.innerHTML = '<p class="kaart-teade info">✓ Kontrollitud ' + r.kontrollitud + ' toodet – kõik saldod klapivad.</p>';
        return;
      }
      kast.innerHTML = '<p class="kaart-teade hoiatus">Kontrollitud ' + r.kontrollitud + ' toodet, erinevusi: <b>' + r.erinevused.length + '</b></p>' +
        '<table class="tabel"><thead><tr><th>Toode</th><th>Saldode lehel</th><th>Liikumistest arvutatud</th></tr></thead><tbody>' +
        r.erinevused.map(function (e) {
          return '<tr><td data-silt="Toode">' + esc(e.nimetus) + '</td><td data-silt="Lehel">' + esc(e.lehel) +
            '</td><td data-silt="Arvutatud"><b>' + esc(e.arvutatud) + '</b></td></tr>';
        }).join('') + '</tbody></table>' +
        '<div class="nupurida nupurida-vasak"><button type="button" id="parandaSaldod" class="nupp nupp-pohi">Paranda Saldode leht (kasuta arvutatud väärtusi)</button></div>';
      $('#parandaSaldod').addEventListener('click', function () {
        this.disabled = true;
        API.kutsu('saldod.paranda').then(function (p) {
          teade('Saldode leht kirjutati uuesti (' + p.ridu + ' toodet).');
          LAO.laeAndmed().catch(function () {});
          kontrolliSaldosid();
        }).catch(function (err) { teade(err.message, 'viga'); });
      });
    }).catch(function (err) {
      kast.innerHTML = '<p class="vormi-viga">' + esc(err.code === 'VALE_PARING' ? 'Server on vana – kleebi uus Code.gs ja tee uus juurutus.' : err.message) + '</p>';
    });
  }

  var AJA_NIMED = {
    'otsing': 'Otsing seadmest', 'salvestus': 'Salvestus seadmesse', 'liikumised.lisa': 'Serverisse saatmine',
    'andmed': 'Nimekirja laadimine', 'tooted.lisa': 'Toote saatmine', 'soe': 'Äratus (soe)'
  };

  /** Arendusrežiimi aegade tabel (viimased mõõtmised, uuemad ees). */
  function naitaAegu() {
    var kast = $('#ajad');
    if (!kast) return;
    if (!API.arendus()) { kast.innerHTML = ''; return; }
    var m = API.mootmised().reverse();
    kast.innerHTML = !m.length ? '<p class="vaike">Mõõtmisi veel pole – skänni midagi.</p>' :
      '<table class="tabel ajad"><thead><tr><th>Kell</th><th>Tegevus</th><th>Kokku</th><th>Apps Scriptis</th></tr></thead><tbody>' +
      m.map(function (x) {
        return '<tr><td data-silt="Kell">' + new Date(x.aeg).toLocaleTimeString('et-EE') + '</td><td data-silt="Tegevus"><b>' + esc(AJA_NIMED[x.nimi] || x.nimi) +
          '</b></td><td data-silt="Kokku">' + esc(ajaTekst(x.ms)) + '</td><td data-silt="Apps Scriptis">' + (x.serveris === null ? '–' : esc(ajaTekst(x.serveris))) + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<div class="nupurida nupurida-vasak"><button type="button" class="nupp nupp-vaike" id="kopeeriAjad">Kopeeri tabel</button></div>';
    var k = $('#kopeeriAjad');
    if (k) k.addEventListener('click', function () {
      var tekst = m.map(function (x) {
        return new Date(x.aeg).toLocaleTimeString('et-EE') + '\t' + (AJA_NIMED[x.nimi] || x.nimi) + '\t' + ajaTekst(x.ms) +
          '\t' + (x.serveris === null ? '–' : ajaTekst(x.serveris));
      }).join('\n');
      (navigator.clipboard ? navigator.clipboard.writeText(tekst) : Promise.reject()).then(function () { teade('Kopeeritud.'); },
        function () { teade('Kopeerimine ei õnnestunud – tee ekraanipilt.', 'viga'); });
    });
  }

  /** Millisekundid loetavalt: 0,4 ms / 85 ms / 2,3 s */
  function ajaTekst(ms) {
    if (ms < 10) return String(Math.round(ms * 10) / 10).replace('.', ',') + ' ms';
    if (ms < 1000) return Math.round(ms) + ' ms';
    return String(Math.round(ms / 100) / 10).replace('.', ',') + ' s';
  }
  document.addEventListener('lao:mootmine', function () { if ($('#ajad')) naitaAegu(); });

  // -------------------------------------------------------------------------
  // NAVIGEERIMINE
  // -------------------------------------------------------------------------

  /** Aadress → vaade. avalik: lubatud ilma sisselogimiseta; admin: ainult adminile. */
  var VAATED = {
    'login': { fn: vaadeLogin, avalik: true },
    'seadistus': { fn: vaadeSeadistus, avalik: true },
    'seaded': { fn: vaadeSeaded, avalik: true },
    'avaleht': { fn: vaadeAvaleht },
    'kasutajad': { fn: vaadeKasutajad, admin: true }
  };

  function marsruut() {
    // Aadress kujul #/vaade või #/vaade/parameeter (nt #/toode/P-123)
    var osad = (location.hash.replace(/^#\/?/, '') || 'avaleht').split('?')[0].split('/');
    var nimi = osad[0];
    var param = osad.slice(1).map(decodeURIComponent).join('/');
    var vaade = VAATED[nimi];
    var s = API.seanss();
    if (!vaade) { location.hash = '#/avaleht'; return; }
    if (!vaade.avalik && !s) { location.hash = '#/login'; return; }
    if (vaade.admin && !onAdmin()) { location.hash = '#/avaleht'; return; }
    // Eelmise vaate koristus (nt kaamera väljalülitamine)
    if (typeof LAO.kuiLahkud === 'function') { try { LAO.kuiLahkud(); } catch (e) { /* ignoreeri */ } }
    LAO.kuiLahkud = null;
    uuendaYlariba();
    window.scrollTo(0, 0);
    vaade.fn(param);
  }

  window.addEventListener('hashchange', marsruut);
  // Esimene joonistamine alles siis, kui ka teised vaadete failid (nt js/tooted.js) on laetud
  // ja seadmesse salvestatud toodete nimekiri on mälus (IndexedDB, tavaliselt mõni ms).
  document.addEventListener('DOMContentLoaded', function () {
    var ootan = LAO.andmedLaetud || Promise.resolve();
    var aegub = new Promise(function (r) { setTimeout(r, 1500); });
    Promise.race([ootan, aegub]).then(marsruut, marsruut);
  });

  // Teistes failides kasutatavad abifunktsioonid ja vaadete tabel
  window.LAO = {
    esc: esc, $: $, teade: teade, aeg: aeg, hoivatud: hoivatud, modaal: modaal,
    onAdmin: onAdmin, MODAALI_NUPUD: MODAALI_NUPUD,
    vaated: VAATED,
    /** Joonistab praeguse vaate uuesti */
    marsruut: marsruut,
    ajaTekst: ajaTekst
  };

  // „Äratus”: Apps Script käivitub taustal juba rakenduse avamisel, mitte esimese skännimise ajal
  if (navigator.onLine && API.apiUrl()) API.kutsu('soe').catch(function () { /* vana server või võrk – pole oluline */ });

  // PWA: service worker (sw.js) hoiab rakenduse faile seadmes, et see avaneks ka ilma internetita.
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    var oliKontroller = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').catch(function () { /* vana brauser – töötab ka ilma */ });
    // iPhone hoiab avakuva-äppi mälus ega laadi lehte ise uuesti – kontrolli uut versiooni,
    // kui rakendus tuleb esiplaanile (ja iga 30 min järel)
    var kontrolliUuendust = function () {
      if (!navigator.onLine) return;
      navigator.serviceWorker.getRegistration().then(function (r) { if (r) r.update(); }).catch(function () { /* ignoreeri */ });
    };
    document.addEventListener('visibilitychange', function () { if (!document.hidden) kontrolliUuendust(); });
    setInterval(kontrolliUuendust, 30 * 60000);
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!oliKontroller) return;
      // Avalehel (pooleli vormi pole) värskenda kohe; mujal näita nuppu
      if (/^#\/avaleht|^#?$/.test(location.hash) && !document.querySelector('dialog[open]')) { location.reload(); return; }
      var riba = document.getElementById('uuendusRiba');
      if (riba) return;
      riba = document.createElement('div');
      riba.id = 'uuendusRiba';
      riba.className = 'uuendusriba';
      riba.innerHTML = 'Rakendusest on uus versioon. <button type="button" class="nupp nupp-vaike nupp-pohi">Värskenda</button>';
      riba.querySelector('button').addEventListener('click', function () { location.reload(); });
      document.body.insertBefore(riba, document.body.firstChild);
    });
  }

  // Kontrolli taustal, kas salvestatud seanss kehtib endiselt (nt kasutaja lukustati).
  if (API.seanss() && navigator.onLine) {
    API.kutsu('mina').then(function (k) {
      var s = API.seanss();
      if (!s) return;
      var rollMuutus = s.kasutaja.roll !== k.roll;
      s.kasutaja = k;
      API.salvestaSeanss(s);
      if (rollMuutus) marsruut(); else uuendaYlariba(); // roll muutus → joonista vaade uuesti
    }).catch(function () { /* võrguvea korral jätkame salvestatud andmetega */ });
  }
})();
