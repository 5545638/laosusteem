/**
 * RIIULID – riiulite ja asukohtade haldus (ainult admin).
 *
 * #/riiulid – nimekiri, lisamine, hulgilisamine, muutmine, arhiveerimine
 * ning riiulil olevate toodete vaatamine.
 */
(function () {
  'use strict';

  var esc = LAO.esc, $ = LAO.$, teade = LAO.teade;
  var sisu = document.getElementById('sisu');
  var filter = { otsing: '', tsoon: '', arhiiv: false };

  function vaadeRiiulid() {
    sisu.innerHTML =
      '<section class="kaart">' +
      '  <div class="pealkirjarida"><h1>Riiulid</h1>' +
      '    <div class="nupurida">' +
      '      <button id="hulgiNupp" class="nupp" type="button">Hulgilisamine</button>' +
      '      <button id="lisaRiiul" class="nupp nupp-pohi" type="button">+ Lisa riiul</button></div></div>' +
      '  <div class="tooriba">' +
      '    <input id="rOtsing" type="search" placeholder="Otsi koodi või nimetuse järgi" value="' + esc(filter.otsing) + '">' +
      '    <select id="rTsoon"></select>' +
      '    <label class="linnuke"><input id="rArhiiv" type="checkbox"> Näita arhiveerituid</label>' +
      '  </div>' +
      '  <p id="riiuliArv" class="vaike"></p>' +
      '  <div id="riiuliTabel"><p>Laadin…</p></div>' +
      '</section>';

    $('#lisaRiiul').addEventListener('click', avaLisaRiiul);
    $('#hulgiNupp').addEventListener('click', avaHulgi);
    $('#rArhiiv').checked = filter.arhiiv;
    $('#rOtsing').addEventListener('input', function (e) { filter.otsing = e.target.value; joonista(); });
    $('#rTsoon').addEventListener('change', function (e) { filter.tsoon = e.target.value; joonista(); });
    $('#rArhiiv').addEventListener('change', function (e) { filter.arhiiv = e.target.checked; joonista(); });

    if (LAO.andmed.laetud) joonista();
    laeJaJoonista();
  }

  function laeJaJoonista() {
    return LAO.laeAndmed().then(joonista).catch(function (err) {
      if (!LAO.andmed.laetud) $('#riiuliTabel').innerHTML = '<p class="vormi-viga">' + esc(err.message) + '</p>';
      else teade(err.message, 'viga');
    });
  }

  /** Mitu (aktiivset) toodet igal riiulil on. */
  function tooteidRiiulil() {
    var arv = {};
    LAO.andmed.tooted.forEach(function (t) { if (t.riiul_id && !t.arhiveeritud) arv[t.riiul_id] = (arv[t.riiul_id] || 0) + 1; });
    return arv;
  }

  function joonista() {
    if (!$('#riiuliTabel')) return;
    var d = LAO.andmed;
    $('#rTsoon').innerHTML = '<option value="">Kõik tsoonid</option>' + LAO.unikaalsed(d.riiulid, 'tsoon').map(function (z) {
      return '<option' + (z === filter.tsoon ? ' selected' : '') + '>' + esc(z) + '</option>';
    }).join('');

    var otsing = filter.otsing.trim().toLowerCase();
    var arv = tooteidRiiulil();
    var list = d.riiulid.filter(function (r) {
      if (r.arhiveeritud && !filter.arhiiv) return false;
      if (filter.tsoon && r.tsoon !== filter.tsoon) return false;
      if (otsing && (r.kood + ' ' + r.nimetus).toLowerCase().indexOf(otsing) < 0) return false;
      return true;
    }).sort(function (a, b) { return a.kood.localeCompare(b.kood, 'et', { numeric: true }); });

    $('#riiuliArv').textContent = list.length + ' riiulit';
    if (!list.length) {
      $('#riiuliTabel').innerHTML = '<p class="vaike">' + (d.riiulid.length ? 'Filtritele vastavaid riiuleid pole.' : 'Riiuleid pole veel lisatud. Kasuta „Hulgilisamist”, et luua korraga terve riiulirida.') + '</p>';
      return;
    }
    $('#riiuliTabel').innerHTML =
      '<table class="tabel"><thead><tr><th>Kood</th><th>Nimetus</th><th>Tsoon</th><th>Tooteid</th><th></th></tr></thead><tbody>' +
      list.map(function (r) {
        return '<tr' + (r.arhiveeritud ? ' class="rida-arhiiv"' : '') + '>' +
          '<td data-silt="Kood"><code>' + esc(r.kood) + '</code>' + (r.arhiveeritud ? ' <span class="silt">arhiveeritud</span>' : '') + '</td>' +
          '<td data-silt="Nimetus">' + esc(r.nimetus) + '</td>' +
          '<td data-silt="Tsoon">' + esc(r.tsoon) + '</td>' +
          '<td data-silt="Tooteid">' + (arv[r.id] || 0) + '</td>' +
          '<td class="tegevused">' +
          '<button class="nupp nupp-vaike" data-t="tooted" data-id="' + esc(r.id) + '">Tooted</button>' +
          '<button class="nupp nupp-vaike" data-t="muuda" data-id="' + esc(r.id) + '">Muuda</button>' +
          (r.arhiveeritud
            ? '<button class="nupp nupp-vaike" data-t="taasta" data-id="' + esc(r.id) + '">Taasta</button>'
            : '<button class="nupp nupp-vaike nupp-oht" data-t="arhiveeri" data-id="' + esc(r.id) + '">Arhiveeri</button>') +
          '</td></tr>';
      }).join('') + '</tbody></table>';

    Array.prototype.forEach.call(document.querySelectorAll('#riiuliTabel [data-t]'), function (b) {
      b.addEventListener('click', function () {
        var r = LAO.riiul(b.dataset.id);
        ({ tooted: naitaTooteid, muuda: avaMuudaRiiul, arhiveeri: arhiveeri, taasta: arhiveeri })[b.dataset.t](r, arv[r.id] || 0);
      });
    });
  }

  function avaLisaRiiul() {
    LAO.modaal('Lisa riiul',
      '<form autocomplete="off">' +
      '<label>Kood * <span class="vaike">(nt A01-03; „R-” lisatakse ette automaatselt)</span><input name="kood" required autocapitalize="characters"></label>' +
      '<label>Nimetus / kirjeldus<input name="nimetus"></label>' +
      '<label>Tsoon<input name="tsoon" list="tsoonid" placeholder="nt Lao vasak sein"></label>' + tsoonideList() +
      LAO.MODAALI_NUPUD + '</form>',
      function (v) {
        return API.kutsu('riiulid.lisa', { kood: v.kood.value, nimetus: v.nimetus.value, tsoon: v.tsoon.value })
          .then(function (r) { teade('Lisatud riiul ' + r.kood + '.'); return laeJaJoonista(); });
      });
  }

  function avaMuudaRiiul(r) {
    LAO.modaal('Muuda riiulit',
      '<form autocomplete="off">' +
      '<label>Kood *<input name="kood" required value="' + esc(r.kood) + '" autocapitalize="characters"></label>' +
      '<p class="vaike">Koodi muutmisel tuleb riiuli silt uuesti printida.</p>' +
      '<label>Nimetus / kirjeldus<input name="nimetus" value="' + esc(r.nimetus) + '"></label>' +
      '<label>Tsoon<input name="tsoon" list="tsoonid" value="' + esc(r.tsoon) + '"></label>' + tsoonideList() +
      LAO.MODAALI_NUPUD + '</form>',
      function (v) {
        return API.kutsu('riiulid.muuda', { id: r.id, kood: v.kood.value, nimetus: v.nimetus.value, tsoon: v.tsoon.value })
          .then(function () { teade('Salvestatud.'); return laeJaJoonista(); });
      });
  }

  function arhiveeri(r, tooteid) {
    if (!r.arhiveeritud && !confirm('Arhiveerida riiul ' + r.kood + '?' +
      (tooteid ? '\nRiiulil on ' + tooteid + ' toodet – need jäävad selle riiuli külge, kuni need ümber paigutad.' : ''))) return;
    API.kutsu('riiulid.arhiveeri', { id: r.id, arhiveeritud: !r.arhiveeritud })
      .then(function () { teade(r.arhiveeritud ? 'Taastatud.' : 'Arhiveeritud.'); return laeJaJoonista(); })
      .catch(function (err) { teade(err.message, 'viga'); });
  }

  /** Näitab riiulil olevaid tooteid koos saldodega. */
  function naitaTooteid(r) {
    var tooted = LAO.andmed.tooted.filter(function (t) { return t.riiul_id === r.id && !t.arhiveeritud; })
      .sort(function (a, b) { return a.nimetus.localeCompare(b.nimetus, 'et'); });
    var d = LAO.modaal(r.kood + (r.nimetus ? ' – ' + r.nimetus : ''),
      '<form>' + (tooted.length
        ? '<table class="tabel"><tbody>' + tooted.map(function (t) {
          return '<tr class="rida-klikitav" data-id="' + esc(t.id) + '"><td>' + esc(t.nimetus) + '</td><td>' + LAO.seisHtml(t) + '</td></tr>';
        }).join('') + '</tbody></table>'
        : '<p class="vaike">Sellel riiulil pole tooteid.</p>') +
      '<div class="nupurida"><button type="button" class="nupp" data-sulge>Sulge</button></div></form>',
      function () {});
    Array.prototype.forEach.call(d.querySelectorAll('tr[data-id]'), function (tr) {
      tr.addEventListener('click', function () { d.close(); location.hash = '#/toode/' + encodeURIComponent(tr.dataset.id); });
    });
  }

  /** Hulgilisamine eelvaatega. */
  function avaHulgi() {
    var d = LAO.modaal('Riiulite hulgilisamine',
      '<form autocomplete="off">' +
      '<p class="vaike">Näide: riiulid A01–A10, igaühel korrused 1–5 → luuakse 50 riiulit R-A01-01 … R-A10-05.</p>' +
      '<div class="valjad-kolm">' +
      '  <label>Täht / eesliide<input name="eesliide" value="A" maxlength="5" autocapitalize="characters"></label>' +
      '  <label>Riiulid alates<input name="alates" type="number" min="0" value="1" required></label>' +
      '  <label>kuni<input name="kuni" type="number" min="0" value="10" required></label>' +
      '</div>' +
      '<div class="valjad-kolm">' +
      '  <label>Numbri pikkus<select name="kohti"><option value="1">1 (A1)</option><option value="2" selected>2 (A01)</option><option value="3">3 (A001)</option></select></label>' +
      '  <label>Korrused alates<input name="korrusAlates" type="number" min="0" value="1" placeholder="tühi = ei"></label>' +
      '  <label>kuni<input name="korrusKuni" type="number" min="0" value="5"></label>' +
      '</div>' +
      '<label>Tsoon<input name="tsoon" list="tsoonid" placeholder="nt Lao vasak sein"></label>' + tsoonideList() +
      '<p id="hulgiEelvaade" class="eelvaade"></p>' +
      '<div class="nupurida"><button type="button" class="nupp" data-sulge>Loobu</button>' +
      '<button type="submit" class="nupp nupp-pohi">Loo riiulid</button></div></form>',
      function (v) {
        return API.kutsu('riiulid.hulgi', {
          eesliide: v.eesliide.value, alates: v.alates.value, kuni: v.kuni.value, kohti: v.kohti.value,
          korrusAlates: v.korrusAlates.value, korrusKuni: v.korrusKuni.value, tsoon: v.tsoon.value
        }).then(function (tul) {
          teade('Loodud ' + tul.loodud.length + ' riiulit' + (tul.vahele.length ? ', ' + tul.vahele.length + ' oli juba olemas' : '') + '.');
          return laeJaJoonista();
        });
      });

    var v = d.querySelector('form');
    function eelvaade() {
      var e = v.eesliide.value.trim().toUpperCase();
      var a = parseInt(v.alates.value, 10), k = parseInt(v.kuni.value, 10), kohti = parseInt(v.kohti.value, 10);
      var onK = v.korrusAlates.value !== '';
      var ka = parseInt(v.korrusAlates.value, 10), kk = parseInt(v.korrusKuni.value, 10);
      if (isNaN(a) || isNaN(k) || k < a || (onK && (isNaN(ka) || isNaN(kk) || kk < ka))) {
        $('#hulgiEelvaade').textContent = 'Kontrolli numbreid (lõpp peab olema suurem kui algus).';
        return;
      }
      var pad = function (n, p) { n = String(n); while (n.length < p) n = '0' + n; return n; };
      var kood = function (n, kr) { return 'R-' + e + pad(n, kohti) + (onK ? '-' + pad(kr, 2) : ''); };
      var arv = (k - a + 1) * (onK ? kk - ka + 1 : 1);
      $('#hulgiEelvaade').textContent = 'Luuakse ' + arv + ' riiulit: ' + kood(a, ka) + (arv > 1 ? ' … ' + kood(k, kk) : '') +
        (arv > 1000 ? ' – liiga palju, korraga kuni 1000.' : '');
    }
    v.addEventListener('input', eelvaade);
    eelvaade();
  }

  function tsoonideList() {
    return '<datalist id="tsoonid">' + LAO.unikaalsed(LAO.andmed.riiulid, 'tsoon').map(function (z) {
      return '<option value="' + esc(z) + '">';
    }).join('') + '</datalist>';
  }

  LAO.vaated['riiulid'] = { fn: vaadeRiiulid, admin: true };
})();
