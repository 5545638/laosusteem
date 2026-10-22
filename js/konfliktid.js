/**
 * KONFLIKTID (ainult admin) – liikumised, mille server märkis ülevaatamiseks:
 * negatiivne saldo, juba välja antud / juba laos olev tööriist, arhiveeritud toode,
 * sama toode lisati kahest seadmest, lukustatud kasutaja liikumine.
 *
 * Iga konflikti saab:
 *   KINNITA  – jääb nii (lukustatud kasutaja liikumine läheb alles nüüd saldosse)
 *   PARANDA  – algne tühistatakse ja salvestatakse parandatud kogus/saaja/toode
 *   TÜHISTA  – liikumine tühistatakse (ajalugu jääb alles)
 */
(function () {
  'use strict';

  var esc = LAO.esc, $ = LAO.$, teade = LAO.teade;
  var sisu = document.getElementById('sisu');
  var TYYP_NIMI = { 'VÄLJA_ANTUD': 'VÄLJA ANTUD', 'OLEKU_MUUTUS': 'OLEKU MUUTUS', 'KORRIGEERIMINE': 'INVENTUUR' };

  function vaadeKonfliktid() {
    sisu.innerHTML =
      '<section class="kaart">' +
      '  <div class="pealkirjarida"><h1>Konfliktid</h1>' +
      '    <button id="kinnitaKoik" class="nupp" type="button" hidden>Kinnita kõik</button></div>' +
      '  <p class="vaike">Liikumised, mis on salvestatud, kuid vajavad ülevaatust. Konfliktiga liikumine on saldos juba arvesse läinud ' +
      '(välja arvatud lukustatud kasutaja oma, mis läheb arvesse alles kinnitamisel).</p>' +
      '  <div id="konfliktideTabel"><p>Laadin…</p></div>' +
      '  <h2>Viimati lahendatud</h2>' +
      '  <div id="lahendatudTabel" class="vaike"></div>' +
      '</section>';
    lae();
  }

  function lae() {
    API.kutsu('konfliktid.nimekiri').then(function (d) {
      LAO.andmed.konfliktideArv = d.lahtised.length;
      if (LAO.uuendaOlekuriba) LAO.uuendaOlekuriba();
      $('#konfliktideTabel').innerHTML = d.lahtised.length
        ? tabel(d.lahtised, true)
        : '<p class="kaart-teade info">✓ Lahendamata konflikte pole.</p>';
      $('#lahendatudTabel').innerHTML = d.lahendatud.length ? tabel(d.lahendatud, false) : '<p>–</p>';
      var nupp = $('#kinnitaKoik');
      nupp.hidden = d.lahtised.length < 2;
      nupp.onclick = function () {
        if (!confirm('Kinnitada kõik ' + d.lahtised.length + ' konflikti nii, nagu need on?')) return;
        lahenda({ ids: d.lahtised.map(function (k) { return k.id; }), otsus: 'KINNITA' }, 'Kõik kinnitatud.');
      };
      Array.prototype.forEach.call(document.querySelectorAll('#konfliktideTabel [data-otsus]'), function (b) {
        b.addEventListener('click', function () {
          var k = d.lahtised.filter(function (x) { return x.id === b.dataset.id; })[0];
          if (b.dataset.otsus === 'PARANDA') return avaParanda(k);
          if (b.dataset.otsus === 'TÜHISTA' && !confirm('Tühistada see liikumine?\n' + kirjeldus(k))) return;
          lahenda({ id: k.id, otsus: b.dataset.otsus }, b.dataset.otsus === 'KINNITA' ? 'Kinnitatud.' : 'Tühistatud.');
        });
      });
    }).catch(function (err) {
      $('#konfliktideTabel').innerHTML = '<p class="vormi-viga">' + esc(err.message) + '</p>';
    });
  }

  function lahenda(data, tekst) {
    return API.kutsu('konfliktid.lahenda', data).then(function () {
      teade(tekst);
      lae();
      LAO.laeAndmed().catch(function () {}); // saldod võisid muutuda
    }).catch(function (err) { teade(err.message, 'viga'); throw err; });
  }

  function kirjeldus(k) {
    var kogus = ['SISSE', 'VÄLJA', 'KORRIGEERIMINE'].indexOf(k.tyyp) >= 0 ? ' ' + LAO.arvTekst(k.kogus) + ' ' + k.yhik : '';
    var kuhu = k.kuhuTekst ? ' → ' + k.kuhuTekst : '';
    return (TYYP_NIMI[k.tyyp] || k.tyyp) + kogus + kuhu;
  }

  function seis(k) {
    if (k.saldo !== null && k.saldo !== undefined) return 'Saldo praegu: ' + LAO.arvTekst(k.saldo) + ' ' + k.yhik;
    if (k.olek) return 'Olek praegu: ' + k.olek;
    return '';
  }

  function tabel(list, tegevustega) {
    var read = list.map(function (k) {
      var nupud = tegevustega
        ? '<button class="nupp nupp-vaike nupp-pohi" data-otsus="KINNITA" data-id="' + esc(k.id) + '">Kinnita</button>' +
          (k.voibParandada ? '<button class="nupp nupp-vaike" data-otsus="PARANDA" data-id="' + esc(k.id) + '">Paranda</button>' : '') +
          '<button class="nupp nupp-vaike nupp-oht" data-otsus="TÜHISTA" data-id="' + esc(k.id) + '">Tühista</button>'
        : '';
      return '<tr>' +
        '<td data-silt="Aeg">' + esc(LAO.aeg(k.aeg)) + '</td>' +
        '<td data-silt="Kasutaja">' + esc(k.kasutaja) + (k.lukustatud ? ' <span class="silt silt-viga">lukustatud</span>' : '') + '</td>' +
        '<td data-silt="Toiming"><b>' + esc(kirjeldus(k)) + '</b>' + (k.markus ? '<div class="vaike">' + esc(k.markus) + '</div>' : '') + '</td>' +
        '<td data-silt="Toode">' + esc(k.nimetus) + '<div class="vaike">' + esc(seis(k)) + '</div></td>' +
        '<td data-silt="Põhjus" class="tekst-hoiatus">' + esc(k.pohjus) + '</td>' +
        (tegevustega ? '<td class="tegevused">' + nupud + '</td>' : '') + '</tr>';
    }).join('');
    return '<table class="tabel konfliktid"><thead><tr><th>Aeg</th><th>Kasutaja</th><th>Toiming</th><th>Toode</th><th>Põhjus</th>' +
      (tegevustega ? '<th></th>' : '') + '</tr></thead><tbody>' + read + '</tbody></table>';
  }

  /** Parandamise aken: kogus (varuosa) või kellele (tööriist) ja vajadusel teine toode. */
  function avaParanda(k) {
    var koguseline = ['SISSE', 'VÄLJA', 'KORRIGEERIMINE'].indexOf(k.tyyp) >= 0;
    var sama = LAO.andmed.tooted.filter(function (t) { return t.tyyp === k.toote_tyyp && (!t.arhiveeritud || t.id === k.toote_id) && !t.ootel; })
      .sort(function (a, b) { return a.nimetus.localeCompare(b.nimetus, 'et'); });
    LAO.modaal('Paranda: ' + kirjeldus(k),
      '<form>' +
      '<p class="vaike">' + esc(k.kasutaja) + ', ' + esc(LAO.aeg(k.aeg)) + '. Põhjus: ' + esc(k.pohjus) + '</p>' +
      '<label>Toode<select name="toote_id">' + sama.map(function (t) {
        return '<option value="' + esc(t.id) + '"' + (t.id === k.toote_id ? ' selected' : '') + '>' + esc(t.nimetus) + '</option>';
      }).join('') + '</select></label>' +
      (koguseline ? '<label>' + (k.tyyp === 'KORRIGEERIMINE' ? 'Muutus (+/−)' : 'Kogus') + ' (' + esc(k.yhik) + ')' +
        '<input name="kogus" inputmode="decimal" required value="' + esc(LAO.arvTekst(k.kogus)) + '"></label>' : '') +
      (k.tyyp === 'VÄLJA_ANTUD' ? '<label>Kellele / kuhu<input name="kellele_kuhu" required value="' + esc(k.kellele_kuhu) + '"></label>' : '') +
      '<label>Märkus<input name="markus" value="' + esc(k.markus) + '"></label>' +
      '<p class="vaike">Algne liikumine tühistatakse ja salvestatakse parandatud liikumine sama aja ja kasutajaga.</p>' +
      LAO.MODAALI_NUPUD + '</form>',
      function (v) {
        var data = { id: k.id, otsus: 'PARANDA', toote_id: v.toote_id.value, markus: v.markus.value };
        if (v.kogus) data.kogus = v.kogus.value.replace(',', '.');
        if (v.kellele_kuhu) data.kellele_kuhu = v.kellele_kuhu.value;
        return lahenda(data, 'Parandatud.');
      });
  }

  LAO.vaated['konfliktid'] = { fn: vaadeKonfliktid, admin: true };
})();
