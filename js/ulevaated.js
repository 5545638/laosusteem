/**
 * ÜLEVAATED (peamiselt arvutis):
 *   LADU           – kõik tooted saldo/olekuga, otsing ja filtrid, miinimumist allpool esile tõstetud
 *   VÄLJAS OLEVAD  – välja antud (ja remondis/kadunud) tööriistad: kellel, mis kuupäevast, mitu päeva
 *   AJALUGU        – kõik liikumised filtritega (kuupäev, toode, tüüp, kasutaja)
 * Igast vaatest saab CSV-faili Exceli jaoks (semikoolon eraldajaks, UTF-8 BOM).
 */
(function () {
  'use strict';

  var esc = LAO.esc, $ = LAO.$, teade = LAO.teade;
  var sisu = document.getElementById('sisu');

  // -------------------------------------------------------------------------
  // CSV EKSPORT
  // -------------------------------------------------------------------------

  /** Üks lahter: arv koma-ga, tekst vajadusel jutumärkides. */
  function csvLahter(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return String(v).replace('.', ',');
    var s = String(v);
    // Kaitse Exceli valemite eest (=, +, -, @ alguses)
    if (/^[=+\-@]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = "'" + s;
    return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /** read = [[päis…], [väärtused…], …] → fail allalaadimiseks. */
  function ekspordi(failinimi, read) {
    var tekst = '﻿' + read.map(function (r) { return r.map(csvLahter).join(';'); }).join('\r\n') + '\r\n';
    LAO.laadiAlla(failinimi + '-' + new Date().toISOString().slice(0, 10) + '.csv', tekst);
  }

  /** Kuupäev Exceli jaoks: 22.10.2026 14:05 */
  function aegCsv(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleString('et-EE', { timeZone: 'Europe/Tallinn', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');
  }

  function paevi(iso) {
    if (!iso) return '';
    return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
  }

  /** Laeb andmed serverist (kui internet on); vaade joonistatakse kohe seadmes olevaga. */
  function varskenda(joonista) {
    if (LAO.andmed.laetud) joonista();
    if (navigator.onLine) LAO.laeAndmed().then(joonista).catch(function (err) {
      if (!LAO.andmed.laetud) sisu.innerHTML = '<section class="kaart"><p class="vormi-viga">' + esc(err.message) + '</p></section>';
    });
  }

  // -------------------------------------------------------------------------
  // LADU
  // -------------------------------------------------------------------------

  var laoFilter = { otsing: '', tyyp: '', kategooria: '', riiul: '', madal: false };

  function vaadeLadu() {
    sisu.innerHTML =
      '<section class="kaart">' +
      '  <div class="pealkirjarida"><h1>Ladu</h1><button id="laoCsv" class="nupp" type="button">⬇ CSV (Excel)</button></div>' +
      '  <div class="tooriba">' +
      '    <input id="lOtsing" type="search" placeholder="Otsi nimetuse, koodi või kategooria järgi" value="' + esc(laoFilter.otsing) + '">' +
      '    <select id="lTyyp"><option value="">Kõik tüübid</option><option value="VARUOSA">Varuosad</option><option value="TÖÖRIIST">Tööriistad</option></select>' +
      '    <select id="lKategooria"></select><select id="lRiiul"></select>' +
      '    <label class="linnuke"><input id="lMadal" type="checkbox"> Alla miinimumi</label>' +
      '  </div>' +
      '  <p id="laoArv" class="vaike"></p>' +
      '  <div id="laoTabel"><p>Laadin…</p></div>' +
      '</section>';
    $('#lTyyp').value = laoFilter.tyyp;
    $('#lMadal').checked = laoFilter.madal;
    $('#lOtsing').addEventListener('input', function (e) { laoFilter.otsing = e.target.value; joonistaLadu(); });
    [['#lTyyp', 'tyyp'], ['#lKategooria', 'kategooria'], ['#lRiiul', 'riiul']].forEach(function (p) {
      $(p[0]).addEventListener('change', function (e) { laoFilter[p[1]] = e.target.value; joonistaLadu(); });
    });
    $('#lMadal').addEventListener('change', function (e) { laoFilter.madal = e.target.checked; joonistaLadu(); });
    $('#laoCsv').addEventListener('click', function () {
      ekspordi('saldod', [['Koodid', 'Nimetus', 'Tüüp', 'Kategooria', 'Riiul', 'Saldo', 'Olek', 'Kellel / kus', 'Ühik', 'Miinimumkogus', 'Alla miinimumi']]
        .concat(laoList().map(function (t) {
          var r = LAO.riiul(t.riiul_id);
          return [t.koodid.map(function (k) { return k.kood; }).join(', '), t.nimetus, LAO.tyypNimi(t.tyyp), t.kategooria,
            r ? r.kood : '', t.tyyp === 'VARUOSA' ? t.saldo : '', t.olek || '', t.kellele || '', t.yhik,
            t.miinimumkogus === null ? '' : t.miinimumkogus, LAO.allMiinimumi(t) ? 'jah' : ''];
        })));
    });
    varskenda(joonistaLadu);
    if (!LAO.onPuude()) $('#lOtsing').focus();
  }

  function laoList() {
    var otsing = laoFilter.otsing.trim().toLowerCase();
    return LAO.andmed.tooted.filter(function (t) {
      if (t.arhiveeritud) return false;
      if (laoFilter.tyyp && t.tyyp !== laoFilter.tyyp) return false;
      if (laoFilter.kategooria && t.kategooria !== laoFilter.kategooria) return false;
      if (laoFilter.riiul && t.riiul_id !== laoFilter.riiul) return false;
      if (laoFilter.madal && !LAO.allMiinimumi(t)) return false;
      if (!otsing) return true;
      return (t.nimetus + ' ' + t.kategooria + ' ' + t.koodid.map(function (k) { return k.kood; }).join(' ')).toLowerCase().indexOf(otsing) >= 0;
    }).sort(function (a, b) { return a.nimetus.localeCompare(b.nimetus, 'et'); });
  }

  function joonistaLadu() {
    if (!$('#laoTabel')) return;
    $('#lKategooria').innerHTML = '<option value="">Kõik kategooriad</option>' + LAO.unikaalsed(LAO.andmed.tooted, 'kategooria').map(function (k) {
      return '<option' + (k === laoFilter.kategooria ? ' selected' : '') + '>' + esc(k) + '</option>';
    }).join('');
    $('#lRiiul').innerHTML = LAO.riiuliValikud(laoFilter.riiul).replace('– pole määratud –', 'Kõik riiulid');
    var list = laoList();
    var madal = list.filter(LAO.allMiinimumi).length;
    $('#laoArv').textContent = list.length + ' toodet' + (madal ? ' · ' + madal + ' alla miinimumi' : '');
    $('#laoTabel').innerHTML = list.length ? '<table class="tabel"><thead><tr><th>Kood(id)</th><th>Nimetus</th><th>Tüüp</th><th>Kategooria</th>' +
      '<th>Riiul</th><th>Saldo / olek</th><th>Miinimum</th></tr></thead><tbody>' + list.map(function (t) {
        var r = LAO.riiul(t.riiul_id);
        return '<tr' + (LAO.allMiinimumi(t) ? ' class="rida-madal"' : '') + '>' +
          '<td data-silt="Kood"><code>' + esc(t.koodid.map(function (k) { return k.kood; }).join(', ') || (t.ootel ? '(saatmata)' : '')) + '</code></td>' +
          '<td data-silt="Nimetus"><b>' + esc(t.nimetus) + '</b></td>' +
          '<td data-silt="Tüüp">' + esc(LAO.tyypNimi(t.tyyp)) + '</td>' +
          '<td data-silt="Kategooria">' + esc(t.kategooria) + '</td>' +
          '<td data-silt="Riiul">' + esc(r ? r.kood : '') + '</td>' +
          '<td data-silt="Saldo">' + LAO.seisHtml(t) + '</td>' +
          '<td data-silt="Miinimum">' + esc(t.miinimumkogus === null ? '' : LAO.arvTekst(t.miinimumkogus) + ' ' + t.yhik) + '</td></tr>';
      }).join('') + '</tbody></table>' : '<p class="vaike">Midagi ei leitud.</p>';
  }

  // -------------------------------------------------------------------------
  // VÄLJAS OLEVAD TÖÖRIISTAD
  // -------------------------------------------------------------------------

  var valjasKoik = false; // ka REMONDIS / KADUNUD

  function vaadeValjas() {
    sisu.innerHTML =
      '<section class="kaart">' +
      '  <div class="pealkirjarida"><h1>Väljas olevad tööriistad</h1><button id="valjasCsv" class="nupp" type="button">⬇ CSV (Excel)</button></div>' +
      '  <div class="tooriba"><input id="vOtsing" type="search" placeholder="Otsi tööriista või inimese/objekti järgi">' +
      '  <label class="linnuke"><input id="vKoik" type="checkbox"' + (valjasKoik ? ' checked' : '') + '> Näita ka remondis ja kadunud</label></div>' +
      '  <p id="valjasArv" class="vaike"></p>' +
      '  <div id="valjasTabel"><p>Laadin…</p></div>' +
      '</section>';
    $('#vOtsing').addEventListener('input', joonistaValjas);
    $('#vKoik').addEventListener('change', function (e) { valjasKoik = e.target.checked; joonistaValjas(); });
    $('#valjasCsv').addEventListener('click', function () {
      ekspordi('valjas-olevad-tooriistad', [['Tööriist', 'Kood', 'Olek', 'Kellel / kus', 'Alates', 'Päevi väljas']]
        .concat(valjasList().map(function (t) {
          return [t.nimetus, t.koodid.map(function (k) { return k.kood; }).join(', '), t.olek, t.kellele, aegCsv(t.alates), paevi(t.alates)];
        })));
    });
    varskenda(joonistaValjas);
  }

  function valjasList() {
    var otsing = ($('#vOtsing') ? $('#vOtsing').value : '').trim().toLowerCase();
    return LAO.andmed.tooted.filter(function (t) {
      if (t.tyyp !== 'TÖÖRIIST' || t.arhiveeritud) return false;
      if (t.olek !== 'VÄLJA ANTUD' && !(valjasKoik && (t.olek === 'REMONDIS' || t.olek === 'KADUNUD'))) return false;
      return !otsing || (t.nimetus + ' ' + (t.kellele || '') + ' ' + t.koodid.map(function (k) { return k.kood; }).join(' ')).toLowerCase().indexOf(otsing) >= 0;
    }).sort(function (a, b) { return String(a.alates).localeCompare(String(b.alates)); }); // kõige kauem väljas eespool
  }

  function joonistaValjas() {
    if (!$('#valjasTabel')) return;
    var list = valjasList();
    $('#valjasArv').textContent = list.length + ' tööriista';
    $('#valjasTabel').innerHTML = list.length ? '<table class="tabel"><thead><tr><th>Tööriist</th><th>Kood</th><th>Olek</th>' +
      '<th>Kellel / kus</th><th>Alates</th><th>Päevi</th></tr></thead><tbody>' + list.map(function (t) {
        var p = paevi(t.alates);
        return '<tr' + (p >= 30 ? ' class="rida-madal"' : '') + '>' +
          '<td data-silt="Tööriist"><b>' + esc(t.nimetus) + '</b></td>' +
          '<td data-silt="Kood"><code>' + esc(t.koodid.map(function (k) { return k.kood; }).join(', ')) + '</code></td>' +
          '<td data-silt="Olek">' + LAO.seisHtml({ tyyp: 'TÖÖRIIST', olek: t.olek }) + '</td>' +
          '<td data-silt="Kellel / kus">' + esc(t.kellele) + '</td>' +
          '<td data-silt="Alates">' + esc(LAO.aeg(t.alates)) + '</td>' +
          '<td data-silt="Päevi"><b>' + esc(p) + '</b></td></tr>';
      }).join('') + '</tbody></table>' : '<p class="kaart-teade info">Kõik tööriistad on laos.</p>';
  }

  // -------------------------------------------------------------------------
  // AJALUGU
  // -------------------------------------------------------------------------

  var TYYBID = ['SISSE', 'VÄLJA', 'KORRIGEERIMINE', 'VÄLJA_ANTUD', 'TAGASTATUD', 'OLEKU_MUUTUS', 'ÜMBERPAIGUTUS', 'TÜHISTUS'];
  var TYYP_NIMI = { 'VÄLJA_ANTUD': 'VÄLJA ANTUD', 'OLEKU_MUUTUS': 'OLEKU MUUTUS', 'KORRIGEERIMINE': 'INVENTUUR' };
  var ajaluguFilter = { alates: '', kuni: '', toote_id: '', tyyp: '', kasutaja_id: '' };
  var kasutajad = [];

  function vaadeAjalugu(param) {
    if (param) ajaluguFilter.toote_id = param; // #/ajalugu/<toote_id> (nt tootekaardilt)
    var tooted = LAO.andmed.tooted.slice().sort(function (a, b) { return a.nimetus.localeCompare(b.nimetus, 'et'); });
    sisu.innerHTML =
      '<section class="kaart">' +
      '  <div class="pealkirjarida"><h1>Ajalugu</h1><button id="ajCsv" class="nupp" type="button">⬇ CSV (Excel)</button></div>' +
      '  <form id="ajVorm" class="tooriba">' +
      '    <label class="vaike">Alates<input type="date" name="alates" value="' + esc(ajaluguFilter.alates) + '"></label>' +
      '    <label class="vaike">Kuni<input type="date" name="kuni" value="' + esc(ajaluguFilter.kuni) + '"></label>' +
      '    <select name="toote_id"><option value="">Kõik tooted</option>' + tooted.map(function (t) {
        return '<option value="' + esc(t.id) + '"' + (t.id === ajaluguFilter.toote_id ? ' selected' : '') + '>' + esc(t.nimetus) + '</option>';
      }).join('') + '</select>' +
      '    <select name="tyyp"><option value="">Kõik tüübid</option>' + TYYBID.map(function (t) {
        return '<option value="' + t + '"' + (t === ajaluguFilter.tyyp ? ' selected' : '') + '>' + esc(TYYP_NIMI[t] || t) + '</option>';
      }).join('') + '</select>' +
      '    <select name="kasutaja_id"><option value="">Kõik kasutajad</option></select>' +
      '  </form>' +
      '  <p id="ajArv" class="vaike"></p>' +
      '  <div id="ajTabel"><p>Laadin…</p></div>' +
      '</section>';
    var vorm = $('#ajVorm');
    joonistaKasutajad();
    vorm.addEventListener('change', function () {
      ['alates', 'kuni', 'toote_id', 'tyyp', 'kasutaja_id'].forEach(function (n) { ajaluguFilter[n] = vorm[n].value; });
      laeAjalugu();
    });
    vorm.addEventListener('submit', function (e) { e.preventDefault(); });
    $('#ajCsv').addEventListener('click', function () {
      var b = $('#ajCsv');
      b.disabled = true;
      API.kutsu('liikumised.nimekiri', Object.assign({ max: 5000 }, ajaluguFilter)).then(function (d) {
        ekspordi('ajalugu', [['Aeg', 'Tüüp', 'Toode', 'Kogus', 'Ühik', 'Kellele / kuhu', 'Märkus', 'Kasutaja', 'Tühistatud', 'Konflikt', 'Konflikti põhjus', 'Serverisse jõudis']]
          .concat(d.read.map(function (r) {
            return [aegCsv(r.aeg), TYYP_NIMI[r.tyyp] || r.tyyp, r.nimetus, r.kogus === '' ? '' : Number(r.kogus), r.yhik, r.kellele_kuhu, r.markus,
              r.kasutaja, r.tyhistatud ? 'jah' : '', r.konflikt ? (r.lahendatud ? 'lahendatud' : 'jah') : '', r.pohjus, aegCsv(r.serveriAeg)];
          })));
        if (d.kokku > d.read.length) teade('Eksporditi ' + d.read.length + ' uusimat ' + d.kokku + '-st. Kitsenda kuupäevi.', 'viga');
      }).catch(function (err) { teade(err.message, 'viga'); }).then(function () { b.disabled = false; });
    });
    laeAjalugu();
  }

  function joonistaKasutajad() {
    var sel = document.querySelector('#ajVorm [name=kasutaja_id]');
    if (!sel || !kasutajad.length) return;
    sel.innerHTML = '<option value="">Kõik kasutajad</option>' + kasutajad.map(function (k) {
      return '<option value="' + esc(k.id) + '"' + (k.id === ajaluguFilter.kasutaja_id ? ' selected' : '') + '>' + esc(k.nimi) + '</option>';
    }).join('');
  }

  function laeAjalugu() {
    $('#ajTabel').innerHTML = '<p>Laadin…</p>';
    API.kutsu('liikumised.nimekiri', Object.assign({ max: 500 }, ajaluguFilter)).then(function (d) {
      if (!$('#ajTabel')) return;
      kasutajad = d.kasutajad;
      joonistaKasutajad();
      $('#ajArv').textContent = d.kokku + ' liikumist' + (d.kokku > d.read.length ? ' (näidatakse ' + d.read.length + ' uusimat, CSV-s kuni 5000)' : '');
      $('#ajTabel').innerHTML = d.read.length ? '<table class="tabel ajalugu"><thead><tr><th>Aeg</th><th>Tüüp</th><th>Toode</th><th>Kogus</th>' +
        '<th>Kellele / kuhu</th><th>Märkus</th><th>Kasutaja</th></tr></thead><tbody>' + d.read.map(function (r) {
          var klass = r.tyhistatud ? 'rida-tyhistatud' : (r.konflikt && !r.lahendatud) ? 'rida-madal' : '';
          var silt = r.tyhistatud ? ' <span class="silt">tühistatud</span>' : '';
          if (r.konflikt) silt += ' <span class="silt ' + (r.lahendatud ? '' : 'silt-hoiatus') + '" title="' + esc(r.pohjus) + '">' + (r.lahendatud ? 'konflikt lahendatud' : 'konflikt') + '</span>';
          if (!r.arvesse) silt += ' <span class="silt silt-viga">ei lähe arvesse</span>';
          var kogus = ['SISSE', 'VÄLJA', 'KORRIGEERIMINE'].indexOf(r.tyyp) >= 0 ? LAO.arvTekst(r.kogus) + ' ' + r.yhik : '';
          return '<tr class="' + klass + '">' +
            '<td data-silt="Aeg">' + esc(LAO.aeg(r.aeg)) + '</td>' +
            '<td data-silt="Tüüp"><b>' + esc(TYYP_NIMI[r.tyyp] || r.tyyp) + '</b>' + silt + '</td>' +
            '<td data-silt="Toode">' + esc(r.nimetus) + '</td>' +
            '<td data-silt="Kogus">' + esc(kogus) + '</td>' +
            '<td data-silt="Kellele / kuhu">' + esc(r.kellele_kuhu) + '</td>' +
            '<td data-silt="Märkus">' + esc(r.markus) + (r.konflikt ? '<div class="vaike tekst-hoiatus">' + esc(r.pohjus) + '</div>' : '') + '</td>' +
            '<td data-silt="Kasutaja">' + esc(r.kasutaja) + '</td></tr>';
        }).join('') + '</tbody></table>' : '<p class="vaike">Liikumisi ei leitud.</p>';
    }).catch(function (err) {
      if ($('#ajTabel')) $('#ajTabel').innerHTML = '<p class="vormi-viga">' + esc(err.message) + '</p>';
    });
  }

  LAO.ekspordiCsv = ekspordi;
  LAO.vaated['ladu'] = { fn: vaadeLadu };
  LAO.vaated['valjas'] = { fn: vaadeValjas };
  LAO.vaated['ajalugu'] = { fn: vaadeAjalugu };
})();
