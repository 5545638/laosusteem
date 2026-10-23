/**
 * SILDID – sildiprint brauseri printimisdialoogiga (window.print).
 *
 * Sildi suurus määratakse CSS-i @page reegliga, nii et sildiprinteri draiver
 * saab täpselt õige suurusega lehe ja eraldi programmi pole vaja.
 * Vöötkoodid ja QR-koodid tehakse brauseris SVG-na (terav print):
 *   - js/vendor/jsbarcode.all.min.js (Code128, EAN-13, EAN-8, UPC, Code39)
 *   - js/vendor/qrcode.js (QR)
 *
 * Sildipõhjad: neli vaikimisi põhja (VAIKIMISI_POHJAD) + admini enda salvestatud
 * põhjad (tabeli leht Sildipõhjad). Paigutused:
 *   TOODE – QR vasakul, paremal nimetus, vöötkood, kood ja riiul
 *   RIIUL – suur riiulikood, QR, vöötkood, tsoon
 *   VAIKE – ainult QR ja kood tekstina (väikesed tööriistad)
 *   A4    – kleebiseleht (vaikimisi 3×8 kleebist 70×37 mm); toode nagu TOODE,
 *           riiul = suur kood + vöötkood ilma QR-ita (a4RiiuliHtml)
 */
(function () {
  'use strict';

  var esc = LAO.esc, $ = LAO.$, teade = LAO.teade;
  var sisu = document.getElementById('sisu');
  var POHI_VOTI = 'lao.sildipohi';
  var EELISTA_VOTI = 'lao.eelistaSisekoodi';

  var VAIKIMISI_POHJAD = [
    { id: 'V1', nimi: 'Tootesilt 62×29 mm (rull)', laius_mm: 62, korgus_mm: 29, paigutus: 'TOODE',
      seaded: { veeris_mm: 1.5, nimi_pt: 10, kood_pt: 7, riiul_pt: 6, ribakood_mm: 8 } },
    { id: 'V2', nimi: 'Riiulisilt 62×100 mm (rull)', laius_mm: 62, korgus_mm: 100, paigutus: 'RIIUL',
      seaded: { veeris_mm: 3, kood_pt: 34, nimi_pt: 10, riiul_pt: 9, ribakood_mm: 12 } },
    { id: 'V3', nimi: 'Väike tööriistasilt 29×29 mm (lint)', laius_mm: 29, korgus_mm: 29, paigutus: 'VAIKE',
      seaded: { veeris_mm: 1, kood_pt: 6 } },
    { id: 'V4', nimi: 'A4 kleebiseleht 3×8 (70×37 mm)', laius_mm: 70, korgus_mm: 37, paigutus: 'A4',
      seaded: { veeris_mm: 3, nimi_pt: 11, kood_pt: 7, riiul_pt: 7, ribakood_mm: 9,
        veerge: 3, ridu: 8, leht_ylal_mm: 0.5, leht_vasakul_mm: 0 } },
    { id: 'V5', nimi: 'A4 kleebiseleht 4×10 (48,5×25,4 mm)', laius_mm: 48.5, korgus_mm: 25.4, paigutus: 'A4',
      seaded: { veeris_mm: 2, nimi_pt: 8, kood_pt: 6, riiul_pt: 6, ribakood_mm: 7,
        veerge: 4, ridu: 10, leht_ylal_mm: 21.5, leht_vasakul_mm: 8 } }
  ];
  var PAIGUTUSE_NIMI = { TOODE: 'Tootesilt (QR + vöötkood + nimi)', RIIUL: 'Riiulisilt (suur kood)', VAIKE: 'Väike (QR + kood)', A4: 'A4 kleebiseleht' };

  var omadPohjad = [];      // serverist laetud
  var pohjadLaetud = null;  // Promise

  function laePohjad() {
    pohjadLaetud = API.kutsu('sildipohjad.nimekiri').then(function (l) { omadPohjad = l; return koikPohjad(); })
      .catch(function () { return koikPohjad(); });
    return pohjadLaetud;
  }
  function koikPohjad() { return VAIKIMISI_POHJAD.concat(omadPohjad); }
  function leiaPohi(id) { return koikPohjad().filter(function (p) { return p.id === id; })[0] || VAIKIMISI_POHJAD[0]; }
  function valitudPohiId() { try { return localStorage.getItem(POHI_VOTI) || 'V1'; } catch (e) { return 'V1'; } }
  function jataPohiMeelde(id) { try { localStorage.setItem(POHI_VOTI, id); } catch (e) { /* ignoreeri */ } }

  // -------------------------------------------------------------------------
  // SILDI ANDMED
  // -------------------------------------------------------------------------

  /**
   * Toode → sildi andmed. Mitme koodi korral kasutatakse tootja koodi
   * (EAN vms), kui "eelistaSisekoodi" pole valitud.
   */
  function tootest(t, eelistaSisekoodi) {
    var koodid = t.koodid || [];
    var sise = koodid.filter(function (k) { return k.tyyp === 'SISEKOOD'; })[0];
    var tootja = koodid.filter(function (k) { return k.tyyp !== 'SISEKOOD'; })[0];
    var k = (eelistaSisekoodi ? sise || tootja : tootja || sise) || { kood: '', tyyp: '' };
    var r = LAO.riiul(t.riiul_id);
    return { liik: 'toode', id: t.id, pealkiri: t.nimetus, kood: k.kood, koodiTyyp: k.tyyp,
      alam: r ? r.kood : '', tsoon: r ? r.tsoon : '' };
  }

  function riiulist(r) {
    return { liik: 'riiul', id: r.id, pealkiri: r.nimetus || '', kood: r.kood, koodiTyyp: 'CODE128',
      alam: r.nimetus || '', tsoon: r.tsoon || '' };
  }

  // -------------------------------------------------------------------------
  // VÖÖTKOOD JA QR (SVG)
  // -------------------------------------------------------------------------

  var JSB_FORMAAT = { EAN13: 'EAN13', EAN8: 'EAN8', UPC: 'UPC', CODE39: 'CODE39' };

  /**
   * Vöötkood SVG-na. Tootja koodiga tootel sama tüüp (EAN-13 jne), muidu Code128.
   * Vaikne tsoon = 10 moodulit mõlemal pool. Tagastab { svg, mooduleid }.
   */
  function vootkood(kood, tyyp) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    var valikud = { width: 1, height: 40, margin: 10, displayValue: false };
    try {
      JsBarcode(el, kood, Object.assign({ format: JSB_FORMAAT[tyyp] || 'CODE128' }, valikud));
    } catch (e) {
      JsBarcode(el, kood, Object.assign({ format: 'CODE128' }, valikud)); // vigane EAN vms
    }
    var w = parseFloat(el.getAttribute('width')) || 100, h = parseFloat(el.getAttribute('height')) || 60; // nt "143px"
    el.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    el.setAttribute('preserveAspectRatio', 'none');
    el.removeAttribute('width'); el.removeAttribute('height');
    el.removeAttribute('style');
    return { svg: el.outerHTML, mooduleid: w };
  }

  /** QR-kood SVG-na (vaikne tsoon 4 moodulit, veaparandus M). */
  function qr(kood) {
    var q = qrcode(0, 'M');
    q.addData(String(kood));
    q.make();
    return q.createSvgTag({ cellSize: 1, margin: 4, scalable: true });
  }

  // -------------------------------------------------------------------------
  // SILDI HTML (mõõdud millimeetrites)
  // -------------------------------------------------------------------------

  function pt(v, vaikimisi) { return (Number(v) || vaikimisi) + 'pt'; }

  /** Ühe sildi HTML. hoiatused: massiiv, kuhu lisatakse liiga tiheda vöötkoodi hoiatus. */
  function sildiHtml(s, pohi, hoiatused) {
    var p = pohi.seaded || {};
    var W = pohi.laius_mm, H = pohi.korgus_mm, v = Number(p.veeris_mm) || 0;
    var sisuW = W - 2 * v, sisuH = H - 2 * v;
    var paigutus = pohi.paigutus === 'A4' ? 'TOODE' : pohi.paigutus; // A4 kleebisel sama sisu nagu tootesildil
    var stiil = 'width:' + W + 'mm;height:' + H + 'mm;padding:' + v + 'mm;';
    if (!s.kood) return '<div class="silt" style="' + stiil + '"><div class="silt-tyhi">Koodita: ' + esc(s.pealkiri) + '</div></div>';
    var naidatavKood = s.liik === 'riiul' ? s.kood.replace(/^R-/, '') : s.kood;

    if (paigutus === 'VAIKE') {
      var q = Math.min(sisuW, sisuH - (Number(p.kood_pt) || 6) * 0.45);
      return '<div class="silt silt-vaike" style="' + stiil + '">' +
        '<div class="silt-qr" style="width:' + q + 'mm;height:' + q + 'mm">' + qr(s.kood) + '</div>' +
        '<div class="silt-kood" style="font-size:' + pt(p.kood_pt, 6) + '">' + esc(s.kood) + '</div></div>';
    }

    var ribaMm = Number(p.ribakood_mm) || 8;
    if (pohi.paigutus === 'A4' && s.liik === 'riiul') return a4RiiuliHtml(s, p, stiil, sisuW, sisuH, naidatavKood, hoiatused);
    if (paigutus === 'RIIUL') {
      var b = vootkood(s.kood, s.koodiTyyp);
      kontrolliTihedust(b, sisuW, s, hoiatused);
      var qrMm = Math.max(10, Math.min(sisuW * 0.75, sisuH - ribaMm - (Number(p.kood_pt) || 34) * 0.4 - 14));
      return '<div class="silt silt-riiul" style="' + stiil + '">' +
        '<div class="silt-suurkood" style="font-size:' + pt(p.kood_pt, 34) + '">' + esc(naidatavKood) + '</div>' +
        (s.alam && s.alam !== s.kood ? '<div class="silt-nimi" style="font-size:' + pt(p.nimi_pt, 10) + '">' + esc(s.alam) + '</div>' : '') +
        '<div class="silt-qr" style="width:' + qrMm + 'mm;height:' + qrMm + 'mm">' + qr(s.kood) + '</div>' +
        '<div class="silt-riba" style="height:' + ribaMm + 'mm">' + b.svg + '</div>' +
        '<div class="silt-kood" style="font-size:' + pt(p.riiul_pt, 9) + '">' + esc(s.kood) + (s.tsoon ? ' · ' + esc(s.tsoon) : '') + '</div></div>';
    }

    // TOODE (ja A4): QR vasakul, paremal nimetus, vöötkood, kood, riiul
    var qrMm2 = sisuH;
    var paremW = sisuW - qrMm2 - 1.5;
    var b2 = vootkood(s.kood, s.koodiTyyp);
    kontrolliTihedust(b2, paremW, s, hoiatused);
    var pealkiri = s.liik === 'riiul' ? 'Riiul ' + naidatavKood : s.pealkiri;
    var alam = s.liik === 'riiul' ? [s.alam, s.tsoon].filter(Boolean).join(' · ') : (s.alam ? 'Riiul ' + s.alam : '');
    return '<div class="silt silt-toode" style="' + stiil + '">' +
      '<div class="silt-qr" style="width:' + qrMm2 + 'mm;height:' + qrMm2 + 'mm">' + qr(s.kood) + '</div>' +
      '<div class="silt-parem" style="width:' + paremW + 'mm">' +
      '<div class="silt-nimi" style="font-size:' + pt(p.nimi_pt, 10) + '">' + esc(pealkiri) + '</div>' +
      '<div class="silt-riba" style="height:' + ribaMm + 'mm">' + b2.svg + '</div>' +
      '<div class="silt-kood" style="font-size:' + pt(p.kood_pt, 7) + '">' + esc(s.kood) + '</div>' +
      (alam ? '<div class="silt-riiulitekst" style="font-size:' + pt(p.riiul_pt, 6) + '">' + esc(alam) + '</div>' : '') +
      '</div></div>';
  }

  /**
   * Riiulisilt A4 kleebisel: üleval riiulikood suurelt (font sobitatakse laiusele),
   * all vöötkood (Code128, telefon ja USB-skänner loevad). QR-i pole – silt jääb väike.
   */
  function a4RiiuliHtml(s, p, stiil, sisuW, sisuH, naidatavKood, hoiatused) {
    var b = vootkood(s.kood, s.koodiTyyp);
    kontrolliTihedust(b, sisuW, s, hoiatused);
    var alam = [s.alam, s.tsoon].filter(Boolean).join(' · ');
    var alamMm = alam ? (Number(p.riiul_pt) || 6) * 0.42 : 0;
    // Paksu kirja märk on keskmiselt ~0,62 fondi kõrgusest; kõrgus kuni ~35% sildist
    var kirjaMm = Math.min(sisuH * 0.35, sisuW / (naidatavKood.length * 0.62));
    var ribaMm = Math.max(6, sisuH - kirjaMm - alamMm - 2);
    return '<div class="silt silt-a4riiul" style="' + stiil + '">' +
      '<div class="silt-suurkood" style="font-size:' + (kirjaMm * 2.835).toFixed(1) + 'pt">' + esc(naidatavKood) + '</div>' +
      '<div class="silt-riba" style="height:' + ribaMm.toFixed(1) + 'mm">' + b.svg + '</div>' +
      (alam ? '<div class="silt-riiulitekst" style="font-size:' + pt(p.riiul_pt, 6) + '">' + esc(alam) + '</div>' : '') +
      '</div>';
  }

  /** Telefoni kaamera loeb kindlalt, kui vöötkoodi kitsaim joon on vähemalt ~0,19 mm. */
  function kontrolliTihedust(b, laiusMm, s, hoiatused) {
    if (!hoiatused) return;
    var joon = laiusMm / b.mooduleid;
    if (joon < 0.19 && hoiatused.indexOf(s.kood) < 0) hoiatused.push(s.kood);
  }

  /** Sildid koguste järgi lahti: [{silt, kogus}] → [silt, silt, …] */
  function laiali(valik) {
    var list = [];
    valik.forEach(function (v) { for (var i = 0; i < (Number(v.kogus) || 0); i++) list.push(v.silt); });
    return list;
  }

  /** Kõigi siltide HTML koos lehekülgedega (A4 puhul ruudustik). algus: A4 esimene vaba kleebis (1…). */
  function lehtedeHtml(sildid, pohi, algus, hoiatused) {
    if (pohi.paigutus !== 'A4') {
      return sildid.map(function (s) { return '<div class="rull-leht">' + sildiHtml(s, pohi, hoiatused) + '</div>'; }).join('');
    }
    var p = pohi.seaded || {};
    var veerge = Number(p.veerge) || 3, ridu = Number(p.ridu) || 8, lehel = veerge * ridu;
    var lahtrid = [];
    for (var i = 1; i < (Number(algus) || 1); i++) lahtrid.push('<div class="a4-lahter"></div>');
    sildid.forEach(function (s) { lahtrid.push('<div class="a4-lahter">' + sildiHtml(s, pohi, hoiatused) + '</div>'); });
    var html = '';
    for (var j = 0; j < lahtrid.length; j += lehel) {
      html += '<div class="a4-leht" style="padding-top:' + (Number(p.leht_ylal_mm) || 0) + 'mm;padding-left:' + (Number(p.leht_vasakul_mm) || 0) + 'mm;' +
        'grid-template-columns:repeat(' + veerge + ',' + pohi.laius_mm + 'mm);grid-auto-rows:' + pohi.korgus_mm + 'mm">' +
        lahtrid.slice(j, j + lehel).join('') + '</div>';
    }
    return html;
  }

  // -------------------------------------------------------------------------
  // PRINTIMINE
  // -------------------------------------------------------------------------

  /** Prindib sildid brauseri printimisdialoogiga. */
  function prindi(sildid, pohi, algus) {
    if (!sildid.length) { teade('Vali vähemalt üks silt.', 'viga'); return; }
    var ala = document.getElementById('prindiala');
    if (!ala) { ala = document.createElement('div'); ala.id = 'prindiala'; document.body.appendChild(ala); }
    ala.innerHTML = lehtedeHtml(sildid, pohi, algus);
    var stiil = document.getElementById('prindiStiil');
    if (!stiil) { stiil = document.createElement('style'); stiil.id = 'prindiStiil'; document.head.appendChild(stiil); }
    // Täpne lehe suurus: rullil = üks silt, A4 = A4 leht. Veerised 0 – sildi veerised on sildi sees.
    stiil.textContent = pohi.paigutus === 'A4'
      ? '@page { size: 210mm 297mm; margin: 0; }'
      : '@page { size: ' + pohi.laius_mm + 'mm ' + pohi.korgus_mm + 'mm; margin: 0; }';
    document.body.classList.add('prindib');
    var lopeta = function () {
      document.body.classList.remove('prindib');
      ala.innerHTML = '';
      window.removeEventListener('afterprint', lopeta);
    };
    window.addEventListener('afterprint', lopeta);
    setTimeout(function () { window.print(); setTimeout(lopeta, 1000); }, 50);
  }

  /** Testprint: üks näidissilt valitud põhjaga (mõõtude kontrollimiseks). */
  function testSilt(pohi) {
    var riiul = pohi.paigutus === 'RIIUL';
    return riiul
      ? { liik: 'riiul', pealkiri: 'Testriiul', kood: 'R-A01-03', koodiTyyp: 'CODE128', alam: 'Testriiul', tsoon: 'Lao vasak sein' }
      : { liik: 'toode', pealkiri: 'TESTSILT ' + pohi.laius_mm + '×' + pohi.korgus_mm + ' mm – pikk nimetus kahel real', kood: 'V-00001', koodiTyyp: 'SISEKOOD', alam: 'R-A01-03' };
  }

  // -------------------------------------------------------------------------
  // VAADE: SILDID
  // -------------------------------------------------------------------------

  var valik = {};   // 'toode:<id>' / 'riiul:<id>' → kogus
  var allikas = 'tooted';

  function vaadeSildid() {
    sisu.innerHTML =
      '<section class="kaart sildid-vaade">' +
      '  <div class="pealkirjarida"><h1>Sildid</h1><span class="vaike" id="valitudArv"></span></div>' +
      '  <div class="sildid-paigutus">' +
      '    <div class="sildid-vasak">' +
      '      <div class="segment" id="allikas">' +
      '        <label><input type="radio" name="allikas" value="tooted"><span>Varuosad</span></label>' +
      '        <label><input type="radio" name="allikas" value="tooriistad"><span>Tööriistad</span></label>' +
      '        <label><input type="radio" name="allikas" value="riiulid"><span>Riiulid</span></label>' +
      '      </div>' +
      '      <div class="tooriba">' +
      '        <input id="sOtsing" type="search" placeholder="Otsi nime või koodi järgi">' +
      '        <select id="sKategooria"></select><select id="sRiiul"></select>' +
      '      </div>' +
      '      <div class="nupurida nupurida-vasak">' +
      '        <button class="nupp nupp-vaike" id="valiKoik" type="button">Vali kõik filtreeritud</button>' +
      '        <button class="nupp nupp-vaike" id="tyhjenda" type="button">Tühjenda valik</button>' +
      '      </div>' +
      '      <div id="sNimekiri" class="sildid-nimekiri"></div>' +
      '    </div>' +
      '    <div class="sildid-parem">' +
      '      <label>Sildipõhi<select id="sPohi"></select></label>' +
      '      <div class="nupurida nupurida-vasak">' +
      '        <button class="nupp nupp-vaike" id="muudaPohja" type="button">Muuda / salvesta oma põhjana</button>' +
      '        <button class="nupp nupp-vaike nupp-oht" id="kustutaPohi" type="button" hidden>Kustuta põhi</button>' +
      '      </div>' +
      '      <label id="algusRida" hidden>Alusta kleebisest nr <span class="vaike">(osaliselt kasutatud leht)</span>' +
      '        <input id="sAlgus" type="number" min="1" value="1"></label>' +
      '      <label class="linnuke"><input type="checkbox" id="sSise"> Eelista sisekoodi (kui tootel on ka tootja kood)</label>' +
      '      <div class="nupurida nupurida-vasak">' +
      '        <button class="nupp nupp-pohi nupp-suur" id="prindiNupp" type="button">🖨 Prindi</button>' +
      '        <button class="nupp" id="testNupp" type="button">Testprint</button>' +
      '      </div>' +
      '      <p id="sHoiatus" class="kaart-teade hoiatus" hidden></p>' +
      '      <h3>Eelvaade</h3>' +
      '      <div id="sEelvaade" class="sildid-eelvaade"></div>' +
      '    </div>' +
      '  </div>' +
      '</section>';

    var eelista = false;
    try { eelista = localStorage.getItem(EELISTA_VOTI) === '1'; } catch (e) { /* ignoreeri */ }
    $('#sSise').checked = eelista;
    document.querySelector('#allikas input[value="' + allikas + '"]').checked = true;

    $('#sKategooria').innerHTML = '<option value="">Kõik kategooriad</option>' +
      LAO.unikaalsed(LAO.andmed.tooted, 'kategooria').map(function (k) { return '<option>' + esc(k) + '</option>'; }).join('');
    $('#sRiiul').innerHTML = '<option value="">Kõik riiulid</option>' + LAO.riiuliValikud('').replace('<option value="">– pole määratud –</option>', '');

    function joonistaPohjad() {
      var id = valitudPohiId();
      $('#sPohi').innerHTML = koikPohjad().map(function (p) {
        return '<option value="' + esc(p.id) + '"' + (p.id === id ? ' selected' : '') + '>' + esc(p.nimi) + (p.id.charAt(0) === 'V' ? '' : ' (oma)') + '</option>';
      }).join('');
      uuendaPohjaValjad();
    }
    function uuendaPohjaValjad() {
      var p = leiaPohi($('#sPohi').value);
      $('#algusRida').hidden = p.paigutus !== 'A4';
      if (p.paigutus === 'A4') $('#sAlgus').max = (Number(p.seaded.veerge) || 3) * (Number(p.seaded.ridu) || 8);
      $('#kustutaPohi').hidden = p.id.charAt(0) === 'V';
    }

    function filtreeritud() {
      var otsing = $('#sOtsing').value.trim().toLowerCase();
      var kat = $('#sKategooria').value, riiul = $('#sRiiul').value;
      if (allikas === 'riiulid') {
        return LAO.andmed.riiulid.filter(function (r) {
          return !r.arhiveeritud && (!otsing || (r.kood + ' ' + (r.nimetus || '') + ' ' + (r.tsoon || '')).toLowerCase().indexOf(otsing) >= 0);
        }).sort(function (a, b) { return a.kood.localeCompare(b.kood, 'et', { numeric: true }); })
          .map(function (r) { return { voti: 'riiul:' + r.id, nimi: r.kood, info: [r.nimetus, r.tsoon].filter(Boolean).join(' · '), silt: riiulist(r) }; });
      }
      var tyyp = allikas === 'tooriistad' ? 'TÖÖRIIST' : 'VARUOSA';
      return LAO.andmed.tooted.filter(function (t) {
        if (t.arhiveeritud || t.ootel || t.tyyp !== tyyp) return false;
        if (kat && t.kategooria !== kat) return false;
        if (riiul && t.riiul_id !== riiul) return false;
        var tekst = (t.nimetus + ' ' + t.koodid.map(function (k) { return k.kood; }).join(' ')).toLowerCase();
        return !otsing || tekst.indexOf(otsing) >= 0;
      }).sort(function (a, b) { return a.nimetus.localeCompare(b.nimetus, 'et'); })
        .map(function (t) {
          var s = tootest(t, $('#sSise').checked);
          return { voti: 'toode:' + t.id, nimi: t.nimetus, info: s.kood + (s.alam ? ' · ' + s.alam : ''), silt: s };
        });
    }

    function joonistaNimekiri() {
      var tooriistaFiltrid = allikas !== 'riiulid';
      $('#sKategooria').hidden = !tooriistaFiltrid;
      $('#sRiiul').hidden = !tooriistaFiltrid;
      var list = filtreeritud();
      $('#sNimekiri').innerHTML = list.length ? '<table class="tabel"><tbody>' + list.map(function (x) {
        var k = valik[x.voti];
        return '<tr><td class="lk"><label class="linnuke"><input type="checkbox" data-voti="' + esc(x.voti) + '"' + (k ? ' checked' : '') + '>' +
          '<span><b>' + esc(x.nimi) + '</b><br><span class="vaike">' + esc(x.info) + '</span></span></label></td>' +
          '<td class="arv"><input type="number" min="0" max="999" value="' + (k || 1) + '" data-kogus="' + esc(x.voti) + '" aria-label="Siltide arv"></td></tr>';
      }).join('') + '</tbody></table>' : '<p class="vaike">Midagi ei leitud.</p>';
      Array.prototype.forEach.call(document.querySelectorAll('#sNimekiri [data-voti]'), function (c) {
        c.addEventListener('change', function () {
          var kogus = document.querySelector('[data-kogus="' + c.dataset.voti + '"]');
          if (c.checked) valik[c.dataset.voti] = Number(kogus.value) || 1; else delete valik[c.dataset.voti];
          eelvaade();
        });
      });
      Array.prototype.forEach.call(document.querySelectorAll('#sNimekiri [data-kogus]'), function (inp) {
        inp.addEventListener('input', function () {
          var n = Math.max(0, Math.min(999, Number(inp.value) || 0));
          var c = document.querySelector('[data-voti="' + inp.dataset.kogus + '"]');
          if (n > 0) { valik[inp.dataset.kogus] = n; c.checked = true; } else { delete valik[inp.dataset.kogus]; c.checked = false; }
          eelvaade();
        });
      });
    }

    /** Valitud sildid kõigist allikatest (ka praegu peidetud nimekirjast). */
    function valitudSildid() {
      var eel = $('#sSise').checked;
      return Object.keys(valik).map(function (voti) {
        var osad = voti.split(':'), s = null;
        if (osad[0] === 'riiul') { var r = LAO.riiul(osad[1]); s = r && riiulist(r); }
        else { var t = LAO.toode(osad[1]); s = t && tootest(t, eel); }
        return s ? { silt: s, kogus: valik[voti] } : null;
      }).filter(Boolean);
    }

    var MAX_EELVAADE = 24;
    function eelvaade() {
      var pohi = leiaPohi($('#sPohi').value);
      var sildid = laiali(valitudSildid());
      $('#valitudArv').textContent = sildid.length ? 'Valitud ' + sildid.length + ' silti' : '';
      $('#prindiNupp').textContent = '🖨 Prindi' + (sildid.length ? ' (' + sildid.length + ')' : '');
      var hoiatused = [];
      var naidis = sildid.length ? sildid.slice(0, MAX_EELVAADE) : [testSilt(pohi)];
      $('#sEelvaade').innerHTML = (sildid.length ? '' : '<p class="vaike">Näidis (vali vasakult sildid):</p>') +
        '<div class="eelvaade-sisu' + (pohi.paigutus === 'A4' ? ' eelvaade-a4' : '') + '">' +
        lehtedeHtml(naidis, pohi, $('#sAlgus').value, hoiatused) + '</div>' +
        (sildid.length > MAX_EELVAADE ? '<p class="vaike">… ja veel ' + (sildid.length - MAX_EELVAADE) + ' silti.</p>' : '');
      $('#sHoiatus').hidden = !hoiatused.length;
      $('#sHoiatus').textContent = hoiatused.length
        ? 'Vöötkood on selle sildi jaoks väga tihe (' + hoiatused.slice(0, 3).join(', ') + '). Telefon ei pruugi seda lugeda – vali suurem silt või loe QR-koodi.'
        : '';
    }

    Array.prototype.forEach.call(document.querySelectorAll('#allikas input'), function (r) {
      r.addEventListener('change', function () { allikas = r.value; joonistaNimekiri(); });
    });
    ['#sOtsing', '#sKategooria', '#sRiiul'].forEach(function (s) { $(s).addEventListener('input', joonistaNimekiri); });
    $('#sSise').addEventListener('change', function () {
      try { localStorage.setItem(EELISTA_VOTI, $('#sSise').checked ? '1' : '0'); } catch (e) { /* ignoreeri */ }
      joonistaNimekiri(); eelvaade();
    });
    $('#sPohi').addEventListener('change', function () { jataPohiMeelde($('#sPohi').value); uuendaPohjaValjad(); eelvaade(); });
    $('#sAlgus').addEventListener('input', eelvaade);
    $('#valiKoik').addEventListener('click', function () {
      filtreeritud().forEach(function (x) { if (!valik[x.voti]) valik[x.voti] = 1; });
      joonistaNimekiri(); eelvaade();
    });
    $('#tyhjenda').addEventListener('click', function () { valik = {}; joonistaNimekiri(); eelvaade(); });
    $('#prindiNupp').addEventListener('click', function () {
      prindi(laiali(valitudSildid()), leiaPohi($('#sPohi').value), $('#sAlgus').value);
    });
    $('#testNupp').addEventListener('click', function () {
      var p = leiaPohi($('#sPohi').value);
      prindi([testSilt(p)], p, $('#sAlgus').value);
    });
    $('#muudaPohja').addEventListener('click', function () {
      avaPohjaRedaktor(leiaPohi($('#sPohi').value), function (id) { jataPohiMeelde(id); laePohjad().then(function () { joonistaPohjad(); eelvaade(); }); });
    });
    $('#kustutaPohi').addEventListener('click', function () {
      var p = leiaPohi($('#sPohi').value);
      if (!confirm('Kustutada sildipõhi „' + p.nimi + '”?')) return;
      API.kutsu('sildipohjad.kustuta', { id: p.id }).then(function () {
        teade('Kustutatud.'); jataPohiMeelde('V1');
        return laePohjad();
      }).then(function () { joonistaPohjad(); eelvaade(); }).catch(function (err) { teade(err.message, 'viga'); });
    });

    joonistaNimekiri();
    joonistaPohjad();
    eelvaade();
    laePohjad().then(function () { joonistaPohjad(); eelvaade(); });
  }

  /** Sildipõhja mõõtude ja fontide muutmine; salvestab uue (või muudab oma) põhja. */
  function avaPohjaRedaktor(pohi, kuiSalvestatud) {
    var oma = pohi.id.charAt(0) !== 'V';
    var p = pohi.seaded || {};
    function vali(nimi, silt, v, abi) {
      return '<label>' + silt + (abi ? ' <span class="vaike">' + abi + '</span>' : '') +
        '<input name="' + nimi + '" inputmode="decimal" value="' + esc(v === undefined ? '' : v) + '"></label>';
    }
    var d = LAO.modaal(oma ? 'Muuda sildipõhja' : 'Uus sildipõhi (põhja „' + pohi.nimi + '” järgi)',
      '<form autocomplete="off">' +
      '<label>Nimi<input name="nimi" required value="' + esc(oma ? pohi.nimi : pohi.nimi + ' (muudetud)') + '"></label>' +
      '<label>Paigutus<select name="paigutus">' + Object.keys(PAIGUTUSE_NIMI).map(function (k) {
        return '<option value="' + k + '"' + (k === pohi.paigutus ? ' selected' : '') + '>' + esc(PAIGUTUSE_NIMI[k]) + '</option>';
      }).join('') + '</select></label>' +
      '<div class="valjarida2">' + vali('laius_mm', 'Laius (mm)', pohi.laius_mm) + vali('korgus_mm', 'Kõrgus (mm)', pohi.korgus_mm) + '</div>' +
      '<div class="valjarida2">' + vali('veeris_mm', 'Veeris (mm)', p.veeris_mm) + vali('ribakood_mm', 'Vöötkoodi kõrgus (mm)', p.ribakood_mm) + '</div>' +
      '<div class="valjarida2">' + vali('nimi_pt', 'Nimetuse font (pt)', p.nimi_pt) + vali('kood_pt', 'Koodi font (pt)', p.kood_pt) + '</div>' +
      vali('riiul_pt', 'Riiuli/tsooni font (pt)', p.riiul_pt) +
      '<fieldset class="ainult-a4"><legend>A4 leht</legend>' +
      '<div class="valjarida2">' + vali('veerge', 'Veerge', p.veerge || 3) + vali('ridu', 'Ridu', p.ridu || 8) + '</div>' +
      '<div class="valjarida2">' + vali('leht_ylal_mm', 'Lehe ülaveeris (mm)', p.leht_ylal_mm || 0) + vali('leht_vasakul_mm', 'Lehe vasakveeris (mm)', p.leht_vasakul_mm || 0) + '</div>' +
      '</fieldset>' +
      '<p class="vaike">' + (oma ? 'Muudatus salvestatakse sellesse põhja.' : 'Vaikimisi põhja ei muudeta – salvestatakse uus põhi.') + '</p>' +
      LAO.MODAALI_NUPUD + '</form>',
      function (v) {
        var arvud = {};
        ['veeris_mm', 'ribakood_mm', 'nimi_pt', 'kood_pt', 'riiul_pt', 'veerge', 'ridu', 'leht_ylal_mm', 'leht_vasakul_mm'].forEach(function (n) {
          var x = String(v[n].value).replace(',', '.').trim();
          if (x !== '') arvud[n] = Number(x);
        });
        return API.kutsu('sildipohjad.salvesta', {
          id: oma ? pohi.id : undefined,
          nimi: v.nimi.value, paigutus: v.paigutus.value,
          laius_mm: String(v.laius_mm.value).replace(',', '.'), korgus_mm: String(v.korgus_mm.value).replace(',', '.'),
          seaded: arvud
        }).then(function (r) { teade('Sildipõhi salvestatud.'); kuiSalvestatud(r.id); });
      });
    var vorm = d.querySelector('form');
    function a4() { d.querySelector('.ainult-a4').hidden = vorm.paigutus.value !== 'A4'; }
    vorm.paigutus.addEventListener('change', a4);
    a4();
  }

  // -------------------------------------------------------------------------
  // KIIRPRINT (tootekaart, riiulid, uue toote lisamine)
  // -------------------------------------------------------------------------

  /**
   * Avab akna ühe toote/riiuli sildi printimiseks.
   * mis: { toode: id } või { riiul: id }
   */
  function kiirprint(mis) {
    var t = mis.toode && LAO.toode(mis.toode), r = mis.riiul && LAO.riiul(mis.riiul);
    if (!t && !r) { teade('Ei leitud.', 'viga'); return; }
    var eelista = false;
    try { eelista = localStorage.getItem(EELISTA_VOTI) === '1'; } catch (e) { /* ignoreeri */ }
    var vaikePohi = r ? 'V2' : (t.tyyp === 'TÖÖRIIST' && valitudPohiId() === 'V1' ? 'V3' : valitudPohiId());
    var d = LAO.modaal('Prindi silt: ' + (t ? t.nimetus : r.kood),
      '<form>' +
      '<label>Sildipõhi<select name="pohi"></select></label>' +
      '<div class="valjarida2"><label>Siltide arv<input name="kogus" type="number" min="1" max="999" value="1"></label>' +
      '<label class="ainult-a4" hidden>Alusta kleebisest nr<input name="algus" type="number" min="1" value="1"></label></div>' +
      (t && t.koodid.length > 1 ? '<label class="linnuke"><input type="checkbox" name="sise"' + (eelista ? ' checked' : '') + '> Eelista sisekoodi</label>' : '') +
      '<div class="sildid-eelvaade kiir-eelvaade"></div>' +
      '<div class="nupurida"><button type="button" class="nupp" data-sulge>Sulge</button>' +
      '<button type="submit" class="nupp nupp-pohi">🖨 Prindi</button></div></form>',
      function (v) {
        prindi(laiali([{ silt: silt(), kogus: v.kogus.value }]), leiaPohi(v.pohi.value), v.algus.value);
        return Promise.resolve();
      });
    var vorm = d.querySelector('form');
    function silt() { return t ? tootest(t, vorm.sise ? vorm.sise.checked : eelista) : riiulist(r); }
    function joonista() {
      var p = leiaPohi(vorm.pohi.value);
      d.querySelector('.ainult-a4').hidden = p.paigutus !== 'A4';
      d.querySelector('.kiir-eelvaade').innerHTML = '<div class="eelvaade-sisu">' + sildiHtml(silt(), p, []) + '</div>';
    }
    function pohjad() {
      vorm.pohi.innerHTML = koikPohjad().map(function (p) {
        return '<option value="' + esc(p.id) + '"' + (p.id === vaikePohi ? ' selected' : '') + '>' + esc(p.nimi) + '</option>';
      }).join('');
      joonista();
    }
    vorm.pohi.addEventListener('change', function () { vaikePohi = vorm.pohi.value; joonista(); });
    if (vorm.sise) vorm.sise.addEventListener('change', joonista);
    pohjad();
    (pohjadLaetud || laePohjad()).then(pohjad);
  }

  LAO.kiirprint = kiirprint;
  LAO.vaated['sildid'] = { fn: vaadeSildid, admin: true };
})();
