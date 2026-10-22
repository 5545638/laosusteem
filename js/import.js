/**
 * IMPORT – olemasoleva tootenimekirja import CSV-failist (ainult admin).
 *
 * #/import
 * Veerud (päise järgi, järjekord ei loe): nimetus, kood, tüüp, ühik, kategooria, riiul, algsaldo
 * Eraldaja: semikoolon, koma või tabulaator (tuvastatakse automaatselt).
 * Kodeering: UTF-8 või Windows-1257 (Exceli eestikeelne "CSV" salvestus).
 */
(function () {
  'use strict';

  var esc = LAO.esc, $ = LAO.$, teade = LAO.teade;
  var sisu = document.getElementById('sisu');
  var PAKK = 200; // mitu rida ühe päringuga serverisse saadetakse

  // Päise nimede variandid → meie väljanimi. Võrdlus on väiketähtedega ja ilma täppideta.
  var PAISED = {
    nimetus: ['nimetus', 'nimi', 'toode', 'name'],
    kood: ['kood', 'vootkood', 'triipkood', 'ean', 'barcode', 'code'],
    tyyp: ['tuup', 'tyyp', 'type', 'liik'],
    yhik: ['uhik', 'yhik', 'unit'],
    kategooria: ['kategooria', 'category', 'grupp'],
    riiul: ['riiul', 'asukoht', 'location', 'koht'],
    algsaldo: ['algsaldo', 'saldo', 'kogus', 'qty', 'quantity']
  };

  var NAIDIS = '﻿nimetus;kood;tüüp;ühik;kategooria;riiul;algsaldo\r\n' +
    'Kruvi M6x20;;varuosa;pakk;Kinnitus;A01-02;10\r\n' +
    'Õlifilter;4006381333931;varuosa;tk;Filtrid;A01-03;4\r\n' +
    'Hüdraulikavoolik 1/2";;varuosa;m;Hüdraulika;B02;25,5\r\n' +
    'Akutrell Makita;;tööriist;tk;Elektritööriistad;C01;\r\n';

  var olek = null; // { read: [...], fail }

  function vaadeImport() {
    olek = null;
    sisu.innerHTML =
      '<p><a href="#/tooted">← Tooted</a></p>' +
      '<section class="kaart">' +
      '  <h1>Toodete import CSV-st</h1>' +
      '  <ol class="sammud">' +
      '    <li>Laadi alla <a href="#" id="naidis">näidisfail</a> ja ava see Excelis (või kasuta oma faili sama päisereaga).</li>' +
      '    <li>Veerud: <b>nimetus</b> (kohustuslik), <b>kood</b> (tühi = luuakse sisekood), <b>tüüp</b> (varuosa/tööriist), ' +
      '        <b>ühik</b> (tk/m/l/kg/pakk), <b>kategooria</b>, <b>riiul</b> (riiuli kood, nt A01-03), <b>algsaldo</b> (varuosadel).</li>' +
      '    <li>Salvesta Excelis: <i>Fail → Salvesta nimega → CSV UTF-8 (komaeraldusega)</i> või tavaline CSV.</li>' +
      '    <li>Vali fail siit, kontrolli eelvaadet ja vajuta „Impordi”.</li>' +
      '  </ol>' +
      '  <label>CSV-fail<input id="fail" type="file" accept=".csv,.txt,text/csv"></label>' +
      '  <label class="linnuke"><input id="looRiiulid" type="checkbox" checked> Loo puuduvad riiulid automaatselt</label>' +
      '  <div id="eelvaade"></div>' +
      '</section>';

    $('#naidis').addEventListener('click', function (e) {
      e.preventDefault();
      laadiAlla('tooted-naidis.csv', NAIDIS);
    });
    $('#fail').addEventListener('change', function (e) {
      var f = e.target.files[0];
      if (!f) return;
      loeFail(f).then(function (tekst) {
        olek = { read: parsiTooted(tekst), fail: f.name };
        joonistaEelvaade();
      }).catch(function (err) {
        $('#eelvaade').innerHTML = '<p class="vormi-viga">' + esc(err.message) + '</p>';
      });
    });
    $('#looRiiulid').addEventListener('change', function () { if (olek) joonistaEelvaade(); });
    // Värsked andmed koodide ja riiulite kontrolliks
    LAO.laeAndmed().catch(function (err) { teade(err.message, 'viga'); });
  }

  /** Loeb faili tekstiks: proovib UTF-8, vea korral Windows-1257 (Balti). */
  function loeFail(fail) {
    return fail.arrayBuffer().then(function (buf) {
      try {
        return new TextDecoder('utf-8', { fatal: true }).decode(buf);
      } catch (e) {
        return new TextDecoder('windows-1257').decode(buf);
      }
    });
  }

  /**
   * CSV parser: tuvastab eraldaja, toetab jutumärkides välju ("a;b", ""-paarid)
   * ja reavahetusi jutumärkide sees. Tagastab ridade massiivi (iga rida = väljade massiiv).
   */
  function parsiCsv(tekst) {
    tekst = tekst.replace(/^﻿/, '');
    var esimene = tekst.split(/\r?\n/)[0] || '';
    var eraldaja = [';', '\t', ','].map(function (e) { return { e: e, n: esimene.split(e).length }; })
      .sort(function (a, b) { return b.n - a.n; })[0].e;
    var read = [], rida = [], vali = '', jutumargis = false;
    for (var i = 0; i < tekst.length; i++) {
      var c = tekst[i];
      if (jutumargis) {
        if (c === '"' && tekst[i + 1] === '"') { vali += '"'; i++; }
        else if (c === '"') jutumargis = false;
        else vali += c;
      } else if (c === '"' && vali === '') jutumargis = true;
      else if (c === eraldaja) { rida.push(vali); vali = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && tekst[i + 1] === '\n') i++;
        rida.push(vali); read.push(rida); rida = []; vali = '';
      } else vali += c;
    }
    if (vali !== '' || rida.length) { rida.push(vali); read.push(rida); }
    return read.filter(function (r) { return r.join('').trim() !== ''; });
  }

  function normPais(s) {
    return String(s).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
  }

  /** CSV tekst → toodete read koos kontrolli tulemusega. */
  function parsiTooted(tekst) {
    var read = parsiCsv(tekst);
    if (read.length < 2) throw new Error('Failis pole andmeridu (vaja on päiserida ja vähemalt üht toodet).');
    var paise = read[0].map(normPais);
    var veerud = {};
    Object.keys(PAISED).forEach(function (v) {
      var i = paise.findIndex(function (p) { return PAISED[v].indexOf(p) >= 0; });
      if (i >= 0) veerud[v] = i;
    });
    if (veerud.nimetus === undefined) {
      throw new Error('Päisereas pole veergu „nimetus”. Leitud veerud: ' + read[0].join(', '));
    }
    return read.slice(1).map(function (r, i) {
      var o = { reaNr: i + 2 };
      Object.keys(veerud).forEach(function (v) { o[v] = String(r[veerud[v]] || '').trim(); });
      return o;
    });
  }

  /** Kontrollib read enne saatmist (sama loogika mis serveris, et vead näeks kohe). */
  function kontrolli(read, looRiiulid) {
    var koodidFailis = {};
    var uuedRiiulid = {};
    return read.map(function (r) {
      var vead = [], markused = [];
      if (!r.nimetus) vead.push('nimetus puudub');
      var t = (r.tyyp || '').toUpperCase();
      var tooriist = ['T', 'TÖÖRIIST', 'TOORIIST', 'TÖÖRIISTAD'].indexOf(t) >= 0;
      if (t && !tooriist && ['V', 'VARUOSA'].indexOf(t) < 0) vead.push('tundmatu tüüp „' + r.tyyp + '”');
      if (r.yhik && !tooriist && LAO.YHIKUD.indexOf(r.yhik.toLowerCase()) < 0) vead.push('tundmatu ühik „' + r.yhik + '”');
      if (r.algsaldo && !tooriist && !isFinite(Number(r.algsaldo.replace(',', '.')))) vead.push('algsaldo pole arv');
      if (r.algsaldo && tooriist) markused.push('tööriista algsaldo jäetakse arvestamata');
      if (r.kood) {
        var n = r.kood.toUpperCase();
        if (/\s/.test(r.kood)) vead.push('koodis on tühik');
        else if (koodidFailis[n]) vead.push('kood kordub failis (rida ' + koodidFailis[n] + ')');
        else if (LAO.leiaKoodiga(r.kood)) vead.push('kood on juba kasutusel');
        koodidFailis[n] = koodidFailis[n] || r.reaNr;
      }
      if (r.riiul) {
        var rk = r.riiul.toUpperCase().replace(/\s+/g, '');
        if (rk.indexOf('R-') !== 0) rk = 'R-' + rk;
        var leitud = LAO.leiaKoodiga(rk);
        if (!leitud || !leitud.riiul) {
          if (looRiiulid) { markused.push('luuakse uus riiul ' + rk); uuedRiiulid[rk] = true; }
          else vead.push('riiulit ' + rk + ' pole');
        }
      }
      return { r: r, vead: vead, markused: markused };
    });
  }

  function joonistaEelvaade() {
    var looRiiulid = $('#looRiiulid').checked;
    var tul = kontrolli(olek.read, looRiiulid);
    var head = tul.filter(function (x) { return !x.vead.length; });
    var vigased = tul.length - head.length;
    $('#eelvaade').innerHTML =
      '<h2>Eelvaade: ' + esc(olek.fail) + '</h2>' +
      '<p><b>' + head.length + '</b> rida korras' + (vigased ? ', <b class="tekst-viga">' + vigased + ' vigast</b> (need jäetakse vahele)' : '') + '.</p>' +
      '<div class="tabeli-kerimine"><table class="tabel"><thead><tr><th>Rida</th><th>Nimetus</th><th>Kood</th><th>Tüüp</th>' +
      '<th>Ühik</th><th>Kategooria</th><th>Riiul</th><th>Algsaldo</th><th>Kontroll</th></tr></thead><tbody>' +
      tul.slice(0, 300).map(function (x) {
        var r = x.r;
        return '<tr' + (x.vead.length ? ' class="rida-viga"' : '') + '>' +
          '<td data-silt="Rida">' + r.reaNr + '</td><td data-silt="Nimetus">' + esc(r.nimetus) + '</td>' +
          '<td data-silt="Kood">' + esc(r.kood || '(sisekood)') + '</td><td data-silt="Tüüp">' + esc(r.tyyp || 'varuosa') + '</td>' +
          '<td data-silt="Ühik">' + esc(r.yhik || 'tk') + '</td><td data-silt="Kategooria">' + esc(r.kategooria) + '</td>' +
          '<td data-silt="Riiul">' + esc(r.riiul) + '</td><td data-silt="Algsaldo">' + esc(r.algsaldo) + '</td>' +
          '<td data-silt="Kontroll">' + (x.vead.length ? '<span class="tekst-viga">' + esc(x.vead.join('; ')) + '</span>'
            : x.markused.length ? '<span class="vaike">' + esc(x.markused.join('; ')) + '</span>' : '✓') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      (tul.length > 300 ? '<p class="vaike">Eelvaates on esimesed 300 rida, imporditakse kõik.</p>' : '') +
      '<div class="nupurida nupurida-vasak"><button id="impordiNupp" class="nupp nupp-pohi nupp-suur"' + (head.length ? '' : ' disabled') + '>' +
      'Impordi ' + head.length + ' rida</button></div>' +
      '<p id="impordiOlek"></p>';
    $('#impordiNupp').addEventListener('click', function () {
      impordi(head.map(function (x) { return x.r; }), looRiiulid);
    });
  }

  /** Saadab read pakkide kaupa serverisse ja näitab tulemust. */
  function impordi(read, looRiiulid) {
    var nupp = $('#impordiNupp');
    nupp.disabled = true;
    $('#fail').disabled = true;
    var lisatud = 0, vead = [];
    var pakid = [];
    for (var i = 0; i < read.length; i += PAKK) pakid.push(read.slice(i, i + PAKK));

    var jada = Promise.resolve();
    pakid.forEach(function (pakk, i) {
      jada = jada.then(function () {
        $('#impordiOlek').textContent = 'Impordin… ' + Math.min((i + 1) * PAKK, read.length) + ' / ' + read.length;
        return API.kutsu('tooted.import', { read: pakk, looRiiulid: looRiiulid }).then(function (t) {
          lisatud += t.lisatud;
          t.tulemused.forEach(function (x) { if (!x.ok) vead.push(x); });
        });
      });
    });
    jada.then(function () {
      $('#impordiOlek').innerHTML = '<b class="tekst-ok">Imporditud ' + lisatud + ' toodet.</b>' +
        (vead.length ? '<br><span class="tekst-viga">Serveris jäeti vahele ' + vead.length + ' rida:</span><ul>' +
          vead.map(function (v) { return '<li>Rida ' + v.rida + ': ' + esc(v.viga) + '</li>'; }).join('') + '</ul>' : '') +
        '<br><a href="#/tooted">Ava tooted →</a>';
      nupp.hidden = true;
      return LAO.laeAndmed();
    }).catch(function (err) {
      // Osa pakke võis juba õnnestuda – näita, mitu
      $('#impordiOlek').innerHTML = '<span class="tekst-viga">Import katkes: ' + esc(err.message) + '</span><br>' +
        'Enne katkemist imporditi ' + lisatud + ' toodet. Kontrolli TOOTED-vaadet enne uuesti proovimist, et vältida topeltridu.';
    });
  }

  /** Laeb tekstifaili alla (Excel tunneb UTF-8 ära tänu BOM-ile). */
  function laadiAlla(nimi, tekst) {
    var url = URL.createObjectURL(new Blob([tekst], { type: 'text/csv;charset=utf-8' }));
    var a = document.createElement('a');
    a.href = url; a.download = nimi;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  LAO.parsiCsv = parsiCsv;      // testimiseks ja etapi 6 jaoks
  LAO.laadiAlla = laadiAlla;
  LAO.vaated['import'] = { fn: vaadeImport, admin: true };
})();
