/**
 * TOOTED – toodete nimekiri, lisamine ja tootekaart (ainult admin).
 *
 * Vaated:
 *   #/tooted        – nimekiri otsingu ja filtritega
 *   #/toode/<id>    – tootekaart: andmete muutmine, koodid, arhiveerimine
 * Toote lisamise aken (LAO.avaLisaToode) on kasutusel ka etapis 3 tundmatu
 * koodi kiirlisamisel.
 */
(function () {
  'use strict';

  var esc = LAO.esc, $ = LAO.$, teade = LAO.teade;
  var sisu = document.getElementById('sisu');

  // Filtrid jäävad meelde, kui vahepeal tootekaarti vaatad
  var filter = { otsing: '', tyyp: '', kategooria: '', riiul: '', arhiiv: false, madal: false };

  // -------------------------------------------------------------------------
  // TOODETE NIMEKIRI
  // -------------------------------------------------------------------------

  function vaadeTooted() {
    sisu.innerHTML =
      '<section class="kaart">' +
      '  <div class="pealkirjarida"><h1>Tooted</h1>' +
      '    <div class="nupurida">' +
      '      <a class="nupp" href="#/import">Impordi CSV</a>' +
      '      <button id="lisaToode" class="nupp nupp-pohi" type="button">+ Lisa toode</button></div></div>' +
      '  <div class="tooriba">' +
      '    <input id="fOtsing" type="search" placeholder="Otsi nimetuse, koodi või kategooria järgi" value="' + esc(filter.otsing) + '">' +
      '    <select id="fTyyp"><option value="">Kõik tüübid</option><option value="VARUOSA">Varuosad</option><option value="TÖÖRIIST">Tööriistad</option></select>' +
      '    <select id="fKategooria"></select>' +
      '    <select id="fRiiul"></select>' +
      '    <label class="linnuke"><input id="fMadal" type="checkbox"> Alla miinimumi</label>' +
      '    <label class="linnuke"><input id="fArhiiv" type="checkbox"> Näita arhiveerituid</label>' +
      '  </div>' +
      '  <p id="tooteArv" class="vaike"></p>' +
      '  <div id="tooteTabel"><p>Laadin…</p></div>' +
      '</section>';

    $('#lisaToode').addEventListener('click', function () { avaLisaToode({}, function () { joonistaTabel(); }); });
    $('#fTyyp').value = filter.tyyp;
    $('#fMadal').checked = filter.madal;
    $('#fArhiiv').checked = filter.arhiiv;

    var taimer;
    $('#fOtsing').addEventListener('input', function (e) {
      clearTimeout(taimer);
      taimer = setTimeout(function () { filter.otsing = e.target.value; joonistaTabel(); }, 150);
    });
    [['#fTyyp', 'tyyp'], ['#fKategooria', 'kategooria'], ['#fRiiul', 'riiul']].forEach(function (p) {
      $(p[0]).addEventListener('change', function (e) { filter[p[1]] = e.target.value; joonistaTabel(); });
    });
    $('#fMadal').addEventListener('change', function (e) { filter.madal = e.target.checked; joonistaTabel(); });
    $('#fArhiiv').addEventListener('change', function (e) { filter.arhiiv = e.target.checked; joonistaTabel(); });

    // Näita kohe seadmes olevaid andmeid, siis uuenda serverist
    if (LAO.andmed.laetud) joonistaTabel();
    LAO.laeAndmed().then(joonistaTabel).catch(function (err) {
      if (!LAO.andmed.laetud) $('#tooteTabel').innerHTML = '<p class="vormi-viga">' + esc(err.message) + '</p>';
      else teade(err.message, 'viga');
    });
    $('#fOtsing').focus();
  }

  /** Täidab filtrite valikud ja joonistab tabeli vastavalt filtritele. */
  function joonistaTabel() {
    if (!$('#tooteTabel')) return; // kasutaja liikus vahepeal mujale
    var d = LAO.andmed;

    $('#fKategooria').innerHTML = '<option value="">Kõik kategooriad</option>' +
      LAO.unikaalsed(d.tooted, 'kategooria').map(function (k) {
        return '<option' + (k === filter.kategooria ? ' selected' : '') + '>' + esc(k) + '</option>';
      }).join('');
    $('#fRiiul').innerHTML = LAO.riiuliValikud(filter.riiul).replace('– pole määratud –', 'Kõik riiulid');

    var otsing = filter.otsing.trim().toLowerCase();
    var list = d.tooted.filter(function (t) {
      if (t.arhiveeritud && !filter.arhiiv) return false;
      if (filter.tyyp && t.tyyp !== filter.tyyp) return false;
      if (filter.kategooria && t.kategooria !== filter.kategooria) return false;
      if (filter.riiul && t.riiul_id !== filter.riiul) return false;
      if (filter.madal && !LAO.allMiinimumi(t)) return false;
      if (otsing) {
        var tekst = (t.nimetus + ' ' + t.kategooria + ' ' + t.koodid.map(function (k) { return k.kood; }).join(' ')).toLowerCase();
        if (tekst.indexOf(otsing) < 0) return false;
      }
      return true;
    }).sort(function (a, b) { return a.nimetus.localeCompare(b.nimetus, 'et', { numeric: true }); });

    $('#tooteArv').textContent = list.length + ' toodet' + (list.length !== d.tooted.length ? ' (kokku ' + d.tooted.length + ')' : '');
    if (!list.length) {
      $('#tooteTabel').innerHTML = '<p class="vaike">' + (d.tooted.length ? 'Filtritele vastavaid tooteid pole.' : 'Tooteid pole veel lisatud.') + '</p>';
      return;
    }
    // Suure nimekirja korral näitame esimesed 500 (otsing kitsendab)
    var naita = list.slice(0, 500);
    $('#tooteTabel').innerHTML =
      '<table class="tabel"><thead><tr><th>Kood</th><th>Nimetus</th><th>Tüüp</th><th>Kategooria</th>' +
      '<th>Riiul</th><th>Saldo / olek</th><th>Min</th></tr></thead><tbody>' +
      naita.map(function (t) {
        var r = LAO.riiul(t.riiul_id);
        var klass = 'rida-klikitav' + (LAO.allMiinimumi(t) ? ' rida-madal' : '') + (t.arhiveeritud ? ' rida-arhiiv' : '');
        return '<tr class="' + klass + '" data-id="' + esc(t.id) + '">' +
          '<td data-silt="Kood"><code>' + esc(t.koodid[0] ? t.koodid[0].kood : '') + '</code>' +
          (t.koodid.length > 1 ? ' <span class="vaike">+' + (t.koodid.length - 1) + '</span>' : '') + '</td>' +
          '<td data-silt="Nimetus"><b>' + esc(t.nimetus) + '</b>' + (t.arhiveeritud ? ' <span class="silt">arhiveeritud</span>' : '') + '</td>' +
          '<td data-silt="Tüüp">' + esc(LAO.tyypNimi(t.tyyp)) + '</td>' +
          '<td data-silt="Kategooria">' + esc(t.kategooria) + '</td>' +
          '<td data-silt="Riiul">' + esc(r ? r.kood : '') + '</td>' +
          '<td data-silt="Saldo / olek">' + LAO.seisHtml(t) + '</td>' +
          '<td data-silt="Min">' + esc(LAO.arvTekst(t.miinimumkogus)) + '</td></tr>';
      }).join('') + '</tbody></table>' +
      (list.length > naita.length ? '<p class="vaike">Näidatakse esimesed 500. Kitsenda otsingut.</p>' : '');

    Array.prototype.forEach.call(document.querySelectorAll('#tooteTabel tr[data-id]'), function (tr) {
      tr.addEventListener('click', function () { location.hash = '#/toode/' + encodeURIComponent(tr.dataset.id); });
    });
  }

  // -------------------------------------------------------------------------
  // TOOTE LISAMINE (kasutatakse ka kiirlisamisel)
  // -------------------------------------------------------------------------

  /**
   * Avab toote lisamise akna.
   * eel: eeltäidetud väärtused, nt { kood: '4006381333931' }
   * kuiValmis(loodudTooted): kutsutakse pärast salvestamist (andmed on juba värskendatud).
   */
  function avaLisaToode(eel, kuiValmis) {
    eel = eel || {};
    var admin = LAO.onAdmin();
    var d = modaalHtml(eel, admin);
    var dialog = LAO.modaal('Lisa toode', d, function (v) {
      var tyyp = v.tyyp.value;
      return API.kutsu('tooted.lisa', {
        kood: v.kood.value.trim(),
        lisaSisekood: v.lisaSisekood.checked,
        nimetus: v.nimetus.value,
        tyyp: tyyp,
        yhik: v.yhik.value,
        kategooria: v.kategooria.value,
        riiul_id: v.riiul_id.value,
        miinimumkogus: tyyp === 'VARUOSA' ? v.miinimumkogus.value : '',
        algsaldo: admin && tyyp === 'VARUOSA' ? v.algsaldo.value : '',
        eksemplare: tyyp === 'TÖÖRIIST' && !v.kood.value.trim() ? v.eksemplare.value : 1
      }).then(function (loodud) {
        var koodid = loodud.map(function (t) { return t.koodid.map(function (k) { return k.kood; }).join(', '); });
        teade(loodud.length > 1 ? 'Lisatud ' + loodud.length + ' eksemplari: ' + koodid.join('; ') : 'Lisatud: ' + koodid[0]);
        return LAO.laeAndmed().catch(function () {}).then(function () { if (kuiValmis) kuiValmis(loodud); });
      });
    });

    var vorm = dialog.querySelector('form');
    // Tüübi järgi näita/peida välju
    function uuendaValju() {
      var tooriist = vorm.tyyp.value === 'TÖÖRIIST';
      var koodOlemas = !!vorm.kood.value.trim();
      dialog.querySelectorAll('.ainult-varuosa').forEach(function (el) { el.hidden = tooriist; });
      dialog.querySelector('.ainult-eksemplarid').hidden = !tooriist || koodOlemas;
      dialog.querySelector('.ainult-kood').hidden = !koodOlemas;
    }
    Array.prototype.forEach.call(vorm.querySelectorAll('[name=tyyp]'), function (r) { r.addEventListener('change', uuendaValju); });
    vorm.kood.addEventListener('input', uuendaValju);
    // USB-skänner saadab koodi järel Enteri – liigu siis nimetuse väljale, mitte ära salvesta
    vorm.kood.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); vorm.nimetus.focus(); }
    });
    uuendaValju();
    (eel.kood ? vorm.nimetus : vorm.kood).focus();
    return dialog;
  }

  function modaalHtml(eel, admin) {
    var tyyp = eel.tyyp || 'VARUOSA';
    return '<form autocomplete="off">' +
      '<label>Kood <span class="vaike">(skänni või sisesta; tühjaks jättes luuakse sisekood)</span>' +
      '  <input name="kood" value="' + esc(eel.kood || '') + '" autocapitalize="characters"></label>' +
      '<label class="linnuke ainult-kood"><input type="checkbox" name="lisaSisekood"> Lisa ka meie sisekood (nt kui tootja kood on halvasti loetav)</label>' +
      '<label>Nimetus *<input name="nimetus" required value="' + esc(eel.nimetus || '') + '"></label>' +
      '<div class="valjarida"><span class="sildike">Tüüp</span><div class="segment">' +
      '  <label><input type="radio" name="tyyp" value="VARUOSA"' + (tyyp === 'VARUOSA' ? ' checked' : '') + '><span>Varuosa</span></label>' +
      '  <label><input type="radio" name="tyyp" value="TÖÖRIIST"' + (tyyp === 'TÖÖRIIST' ? ' checked' : '') + '><span>Tööriist</span></label>' +
      '</div></div>' +
      '<label class="ainult-varuosa">Ühik<select name="yhik">' + LAO.YHIKUD.map(function (y) {
        return '<option' + (y === (eel.yhik || 'tk') ? ' selected' : '') + '>' + y + '</option>';
      }).join('') + '</select></label>' +
      '<label>Kategooria<input name="kategooria" list="kategooriad" value="' + esc(eel.kategooria || '') + '"></label>' +
      '<datalist id="kategooriad">' + LAO.unikaalsed(LAO.andmed.tooted, 'kategooria').map(function (k) {
        return '<option value="' + esc(k) + '">';
      }).join('') + '</datalist>' +
      '<label>Riiul<select name="riiul_id">' + LAO.riiuliValikud(eel.riiul_id || '') + '</select></label>' +
      '<label class="ainult-varuosa">Miinimumkogus <span class="vaike">(alla selle tõstetakse esile)</span>' +
      '  <input name="miinimumkogus" inputmode="decimal" value="' + esc(eel.miinimumkogus || '') + '"></label>' +
      (admin ? '<label class="ainult-varuosa">Algsaldo <span class="vaike">(praegu laos olev kogus)</span><input name="algsaldo" inputmode="decimal"></label>' : '') +
      '<label class="ainult-eksemplarid">Eksemplaride arv <span class="vaike">(iga eksemplar saab oma T-koodi)</span>' +
      '  <input name="eksemplare" type="number" min="1" max="100" value="1"></label>' +
      LAO.MODAALI_NUPUD + '</form>';
  }

  // -------------------------------------------------------------------------
  // TOOTEKAART
  // -------------------------------------------------------------------------

  function vaadeToode(id) {
    var t = LAO.toode(id);
    if (!t) {
      sisu.innerHTML = '<section class="kaart"><p>Laadin…</p></section>';
      LAO.laeAndmed().then(function () {
        if (LAO.toode(id)) vaadeToode(id);
        else sisu.innerHTML = '<section class="kaart"><p>Toodet ei leitud.</p><a href="#/tooted">← Tooted</a></section>';
      }).catch(function (err) { sisu.innerHTML = '<section class="kaart"><p class="vormi-viga">' + esc(err.message) + '</p></section>'; });
      return;
    }
    var varuosa = t.tyyp === 'VARUOSA';
    sisu.innerHTML =
      '<p><a href="#/tooted">← Tooted</a></p>' +
      '<section class="kaart">' +
      '  <div class="pealkirjarida"><h1>' + esc(t.nimetus) + '</h1>' +
      '    <div>' + (t.arhiveeritud ? '<span class="silt silt-viga">Arhiveeritud</span> ' : '') +
      '      <span class="silt">' + esc(LAO.tyypNimi(t.tyyp)) + '</span></div></div>' +
      '  <p class="suur-seis">' + (varuosa ? 'Saldo: ' : 'Olek: ') + LAO.seisHtml(t) +
      (t.alates ? ' <span class="vaike">alates ' + esc(LAO.aeg(t.alates)) + '</span>' : '') + '</p>' +
      '</section>' +

      '<div class="kaksveergu">' +
      '<section class="kaart">' +
      '  <h2>Andmed</h2>' +
      '  <form id="tooteVorm">' +
      '    <label>Nimetus *<input name="nimetus" required value="' + esc(t.nimetus) + '"></label>' +
      (varuosa ? '<label>Ühik<select name="yhik">' + LAO.YHIKUD.map(function (y) {
        return '<option' + (y === t.yhik ? ' selected' : '') + '>' + y + '</option>';
      }).join('') + '</select></label>' : '') +
      '    <label>Kategooria<input name="kategooria" list="kategooriad2" value="' + esc(t.kategooria) + '"></label>' +
      '    <datalist id="kategooriad2">' + LAO.unikaalsed(LAO.andmed.tooted, 'kategooria').map(function (k) {
        return '<option value="' + esc(k) + '">';
      }).join('') + '</datalist>' +
      '    <label>Riiul<select name="riiul_id">' + LAO.riiuliValikud(t.riiul_id) + '</select></label>' +
      (varuosa ? '<label>Miinimumkogus<input name="miinimumkogus" inputmode="decimal" value="' + esc(LAO.arvTekst(t.miinimumkogus)) + '"></label>' : '') +
      '    <div class="nupurida"><button type="submit" class="nupp nupp-pohi">Salvesta</button></div>' +
      '    <p class="vormi-viga" id="tooteViga"></p>' +
      '  </form>' +
      '</section>' +

      '<section class="kaart">' +
      '  <h2>Koodid</h2>' +
      '  <p class="vaike">Kõik koodid töötavad skännimisel. Tootja kood (EAN jm) ja meie sisekood võivad olla korraga.</p>' +
      '  <table class="tabel"><tbody>' + t.koodid.map(function (k) {
        return '<tr><td data-silt="Kood"><code>' + esc(k.kood) + '</code></td><td data-silt="Tüüp">' + esc(k.tyyp) + '</td>' +
          '<td class="tegevused">' + (t.koodid.length > 1
            ? '<button class="nupp nupp-vaike nupp-oht" data-eemalda="' + esc(k.kood) + '">Eemalda</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '  <form id="koodiVorm" class="koodivorm">' +
      '    <label>Lisa kood<input name="kood" placeholder="Skänni või sisesta" autocapitalize="characters"></label>' +
      '    <label>Tüüp<select name="koodiTyyp"><option value="">Automaatne</option>' +
      LAO.KOODI_TYYBID.filter(function (x) { return x !== 'SISEKOOD'; }).map(function (x) { return '<option>' + x + '</option>'; }).join('') +
      '    </select></label>' +
      '    <div class="nupurida"><button type="button" id="genereeri" class="nupp">Genereeri sisekood</button>' +
      '      <button type="submit" class="nupp nupp-pohi">Lisa kood</button></div>' +
      '    <p class="vormi-viga" id="koodiViga"></p>' +
      '  </form>' +
      '</section>' +
      '</div>' +

      '<section class="kaart">' +
      '  <div class="nupurida nupurida-vasak">' +
      '    <button class="nupp" disabled title="Valmib etapis 5">Prindi silt</button>' +
      (t.arhiveeritud
        ? '<button id="arhiiviNupp" class="nupp">Taasta arhiivist</button>'
        : '<button id="arhiiviNupp" class="nupp nupp-oht">Arhiveeri</button>') +
      '  </div>' +
      '  <p class="vaike">Arhiveeritud toode kaob nimekirjadest ja skännimisel antakse hoiatus. Ajalugu jääb alles.</p>' +
      '</section>';

    // Andmete salvestamine
    var vorm = $('#tooteVorm');
    vorm.addEventListener('submit', function (e) {
      e.preventDefault();
      $('#tooteViga').textContent = '';
      LAO.hoivatud(vorm, true);
      var andmed = { id: t.id, nimetus: vorm.nimetus.value, kategooria: vorm.kategooria.value, riiul_id: vorm.riiul_id.value };
      if (varuosa) { andmed.yhik = vorm.yhik.value; andmed.miinimumkogus = vorm.miinimumkogus.value; }
      API.kutsu('tooted.muuda', andmed).then(function () {
        teade('Salvestatud.');
        return varskenda(t.id);
      }).catch(function (err) {
        LAO.hoivatud(vorm, false);
        $('#tooteViga').textContent = err.message;
      });
    });

    // Koodid
    var kv = $('#koodiVorm');
    kv.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!kv.kood.value.trim()) { $('#koodiViga').textContent = 'Sisesta kood või vajuta „Genereeri sisekood”.'; return; }
      lisaKood(t.id, kv.kood.value.trim(), kv.koodiTyyp.value);
    });
    $('#genereeri').addEventListener('click', function () { lisaKood(t.id, '', ''); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-eemalda]'), function (b) {
      b.addEventListener('click', function () {
        if (!confirm('Eemaldada kood ' + b.dataset.eemalda + '?\nSelle koodiga silte enam ei tunta ära.')) return;
        API.kutsu('koodid.eemalda', { kood: b.dataset.eemalda })
          .then(function () { teade('Kood eemaldatud.'); return varskenda(t.id); })
          .catch(function (err) { teade(err.message, 'viga'); });
      });
    });

    // Arhiveerimine
    $('#arhiiviNupp').addEventListener('click', function () {
      if (!t.arhiveeritud && !confirm('Arhiveerida „' + t.nimetus + '”?')) return;
      API.kutsu('tooted.arhiveeri', { id: t.id, arhiveeritud: !t.arhiveeritud })
        .then(function () { teade(t.arhiveeritud ? 'Taastatud.' : 'Arhiveeritud.'); return varskenda(t.id); })
        .catch(function (err) { teade(err.message, 'viga'); });
    });
  }

  function lisaKood(tooteId, kood, tyyp) {
    var kv = $('#koodiVorm');
    $('#koodiViga').textContent = '';
    LAO.hoivatud(kv, true);
    API.kutsu('koodid.lisa', { toote_id: tooteId, kood: kood, koodiTyyp: tyyp })
      .then(function (k) { teade('Lisatud kood ' + k.kood + ' (' + k.tyyp + ').'); return varskenda(tooteId); })
      .catch(function (err) { LAO.hoivatud(kv, false); $('#koodiViga').textContent = err.message; });
  }

  /** Laeb andmed uuesti ja joonistab tootekaardi. */
  function varskenda(id) {
    return LAO.laeAndmed().then(function () { if (location.hash.indexOf('#/toode/') === 0) vaadeToode(id); });
  }

  LAO.avaLisaToode = avaLisaToode;
  LAO.vaated['tooted'] = { fn: vaadeTooted, admin: true };
  LAO.vaated['toode'] = { fn: vaadeToode, admin: true };
})();
