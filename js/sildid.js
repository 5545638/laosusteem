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
 *   TOODE – QR vasakul, paremal kood suurelt (seadega vootkood: vöötkood + kood)
 *   RIIUL – suur riiulikood ja QR (riiulisildil vöötkoodi pole – telefon loeb QR-i kindlamalt)
 *   VAIKE – ainult QR ja kood tekstina (väikesed tööriistad)
 *   A4    – kleebiseleht (vaikimisi 3×8 kleebist 70×37 mm); toode nagu TOODE,
 *           riiul = QR + suur riiulikood (riiuliQrHtml, ka lindil ja 62 mm rullil)
 *
 * P-touch TZe lint (V6–V8, Brother PT-P750W jt): paigutus TOODE, silt on lindi
 * peal pikuti (laius = sildi pikkus, kõrgus = lindi laius). Lisaseaded:
 *   veeris_y_mm – ülemine/alumine veeris; lindi servad jäävad printpeast välja
 *                 (24 mm lindil prinditav ~18 mm, 18 mm → ~14 mm, 12 mm → ~9 mm)
 *   moodul_mm   – vöötkoodi kitsaima joone laius; 0,282 mm = 2 punkti 180 dpi juures,
 *                 nii et jooned langevad täpselt printeri punktidele (terav kood)
 *   nimi_pt = 0 / riiul_pt = 0 – rida jäetakse välja; nimi_ridu – nimetuse ridu (1–2)
 *   auto_pikkus – sildi pikkus = sisu laius + 2 × veeris_mm (laius_mm on siis ainult varuväärtus)
 *   max_pikkus_mm – pikkuse ülempiir: otsad lühenevad (min 2 mm), seejärel kahaneb kiri/vöötkood
 *   vootkood    – tootesildile ka vöötkood (nt 1D-laserskanneri jaoks); vaikimisi ainult QR + kood
 *   poora       – prindi 90° pööratult (kui draiver ootab lehte, mille laius = lindi laius)
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
        veerge: 4, ridu: 10, leht_ylal_mm: 21.5, leht_vasakul_mm: 8 } },
    { id: 'V6', nimi: 'P-touch lint 12 mm (pikkus sisu järgi)', laius_mm: 56, korgus_mm: 12, paigutus: 'TOODE',
      seaded: { auto_pikkus: true, max_pikkus_mm: 50, veeris_mm: 10, veeris_y_mm: 1.5, nimi_pt: 0, kood_pt: 6, riiul_pt: 0, ribakood_mm: 5.5, moodul_mm: 0.282 } },
    { id: 'V7', nimi: 'P-touch lint 18 mm (pikkus sisu järgi)', laius_mm: 64, korgus_mm: 18, paigutus: 'TOODE',
      seaded: { auto_pikkus: true, max_pikkus_mm: 50, veeris_mm: 10, veeris_y_mm: 2, nimi_pt: 7, nimi_ridu: 1, kood_pt: 6, riiul_pt: 5, ribakood_mm: 6.5, moodul_mm: 0.282 } },
    { id: 'V8', nimi: 'P-touch lint 24 mm (pikkus sisu järgi)', laius_mm: 72, korgus_mm: 24, paigutus: 'TOODE',
      seaded: { auto_pikkus: true, max_pikkus_mm: 50, veeris_mm: 10, veeris_y_mm: 3, nimi_pt: 7.5, nimi_ridu: 2, kood_pt: 7, riiul_pt: 6, ribakood_mm: 6.5, moodul_mm: 0.282 } }
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
  function qr(kood, veeris) {
    var q = qrcode(0, 'M');
    q.addData(String(kood));
    q.make();
    return q.createSvgTag({ cellSize: 1, margin: veeris === undefined ? 4 : veeris, scalable: true });
  }

  /**
   * Lindil (automaatse pikkusega põhi) on QR ilma vaikse tsoonita, et see täidaks kogu
   * prinditava kõrguse: lindi prindimata servad ja otsad on niigi valged. Muidu 4 moodulit.
   */
  function qrVeeris(pohi) { return autoPikkus(pohi) ? 0 : 4; }
  function qrVahe(pohi) { return autoPikkus(pohi) ? 2.5 : 1.5; }
  /**
   * Riiulikoodi fondi suurus (em, mm). Lindil on suurtähtede kõrgus pool QR-i kõrgusest
   * (Arial: suurtäht ~0,716 em → em = 0,5 / 0,716 ≈ 0,7 × kõrgus); muidu 80%.
   */
  function riiuliKiri(pohi, sisuH, laiusMm, pikkus) {
    var max = autoPikkus(pohi) ? sisuH * 0.7 : sisuH * 0.8;
    return laiusMm === null ? max : Math.min(max, laiusMm / (pikkus * 0.62));
  }

  // -------------------------------------------------------------------------
  // SILDI HTML (mõõdud millimeetrites)
  // -------------------------------------------------------------------------

  function pt(v, vaikimisi) { return (Number(v) || vaikimisi) + 'pt'; }

  /** Ühe sildi HTML. hoiatused: massiiv, kuhu lisatakse liiga tiheda vöötkoodi hoiatus. */
  function sildiHtml(s, pohi, hoiatused) {
    pohi = pohiSildile(s, pohi);
    var p = pohi.seaded || {};
    var W = pohi.laius_mm, H = pohi.korgus_mm, v = Number(p.veeris_mm) || 0;
    var vy = p.veeris_y_mm === undefined || p.veeris_y_mm === '' ? v : Number(p.veeris_y_mm) || 0;
    var sisuW = W - 2 * v, sisuH = H - 2 * vy;
    var paigutus = pohi.paigutus === 'A4' ? 'TOODE' : pohi.paigutus; // A4 kleebisel sama sisu nagu tootesildil
    var stiil = 'width:' + W + 'mm;height:' + H + 'mm;padding:' + vy + 'mm ' + v + 'mm;';
    if (!s.kood) return '<div class="silt" style="' + stiil + '"><div class="silt-tyhi">Koodita: ' + esc(s.pealkiri) + '</div></div>';
    var naidatavKood = s.liik === 'riiul' ? s.kood.replace(/^R-/, '') : s.kood;

    if (paigutus === 'VAIKE') {
      var q = Math.min(sisuW, sisuH - (Number(p.kood_pt) || 6) * 0.45);
      return '<div class="silt silt-vaike" style="' + stiil + '">' +
        '<div class="silt-qr" style="width:' + q + 'mm;height:' + q + 'mm">' + qr(s.kood) + '</div>' +
        '<div class="silt-kood" style="font-size:' + pt(p.kood_pt, 6) + '">' + esc(s.kood) + '</div></div>';
    }

    var ribaMm = Number(p.ribakood_mm) || 8;
    // Ainult QR ja suur kood (telefon loeb QR-i kindlamalt kui vöötkoodi); riiulisildil alati
    if (ainultQr(s, pohi) && paigutus === 'TOODE') return riiuliQrHtml(s, pohi, stiil, sisuW, sisuH, naidatavKood);
    if (paigutus === 'RIIUL') {
      // Kood nii suurelt kui laiusele mahub (kuni 30% sildi kõrgusest)
      var kirjaPt = Math.min(sisuW / (naidatavKood.length * 0.62), sisuH * 0.3) * 2.835;
      var qrMm = Math.max(10, Math.min(sisuW, sisuH - kirjaPt * 0.42 - 4));
      return '<div class="silt silt-riiul" style="' + stiil + '">' +
        '<div class="silt-suurkood" style="font-size:' + kirjaPt.toFixed(1) + 'pt">' + esc(naidatavKood) + '</div>' +
        '<div class="silt-qr" style="width:' + qrMm + 'mm;height:' + qrMm + 'mm">' + qr(s.kood) + '</div></div>';
    }

    // TOODE (ja A4): QR vasakul, paremal vöötkood (~75% QR-i kõrgusest) ja kood tekstina
    var qrMm2 = sisuH;
    var paremW = sisuW - qrMm2 - qrVahe(pohi);
    var b2 = vootkood(s.kood, s.koodiTyyp);
    kontrolliTihedust(b2, paremW, s, hoiatused);
    var m = tooteMoodud(s.kood, sisuH, p, qrVeeris(pohi));
    return '<div class="silt silt-toode silt-toode2" style="' + stiil + 'gap:' + qrVahe(pohi) + 'mm">' +
      '<div class="silt-qr" style="width:' + qrMm2 + 'mm;height:' + qrMm2 + 'mm">' + qr(s.kood, qrVeeris(pohi)) + '</div>' +
      '<div class="silt-parem" style="width:' + paremW + 'mm">' +
      '<div class="silt-riba" style="height:' + m.ribaMm.toFixed(2) + 'mm' + ribaLaius(b2, paremW, p) + '">' + b2.svg + '</div>' +
      '<div class="silt-kood" style="font-size:' + Math.min(m.koodPt, (paremW - 1) / (String(s.kood).length * 0.6 * 0.3528)).toFixed(1) + 'pt">' + esc(s.kood) + '</div>' +
      '</div></div>';
  }

  function ainultQr(s, pohi) {
    var x = (pohi.seaded || {}).vootkood;
    return s.liik === 'riiul' || !(x === true || x === 1 || x === '1');
  }

  function autoPikkus(pohi) { var x = (pohi.seaded || {}).auto_pikkus; return x === true || x === 1 || x === '1'; }

  /**
   * Automaatse pikkusega põhja korral põhja koopia, mille laius_mm = sisu laius
   * + veerised mõlemas otsas (ümardatud 0,5 mm-ni). Muidu põhi ise.
   */
  function pohiSildile(s, pohi) {
    if (!autoPikkus(pohi) || !s || !s.kood || pohi.paigutus === 'A4') return pohi;
    var p = pohi.seaded || {}, v = Number(p.veeris_mm) || 0;
    var vy = p.veeris_y_mm === undefined || p.veeris_y_mm === '' ? v : Number(p.veeris_y_mm) || 0;
    var sisuH = pohi.korgus_mm - 2 * vy, sisu;
    if (pohi.paigutus === 'VAIKE') sisu = sisuH;
    else if (ainultQr(s, pohi)) {
      var kood = s.liik === 'riiul' ? s.kood.replace(/^R-/, '') : s.kood;
      sisu = sisuH + qrVahe(pohi) + kood.length * 0.62 * riiuliKiri(pohi, sisuH, null, kood.length);
    } else {
      var m = tooteMoodud(s.kood, sisuH, p, qrVeeris(pohi));
      var ribaW = vootkood(s.kood, s.koodiTyyp).mooduleid * (Number(p.moodul_mm) || 0.33);
      var koodW = String(s.kood).length * 0.6 * m.koodPt * 0.3528 + 1;
      sisu = sisuH + qrVahe(pohi) + Math.max(ribaW, koodW);
    }
    // Ülempiir (max_pikkus_mm): esmalt lühenevad otsad (kuni 2 mm), siis jääb sisule vähem
    // ruumi – riiulikood ja vöötkood kahanevad sildi joonistamisel ise laiusele.
    var L = Math.ceil(sisu + 2 * v), max = Number(p.max_pikkus_mm) || 0;
    if (max && L > max) { v = Math.max(2, Math.min(v, (max - sisu) / 2)); L = max; }
    var koopia = Object.assign({}, pohi, { seaded: Object.assign({}, p, { veeris_mm: v }) });
    koopia.laius_mm = L; // täis-mm, et Macis oleks lihtne paberisuurust teha
    return koopia;
  }

  /**
   * Tootesildi mõõdud: QR-i nähtav osa (ilma vaikse tsoonita) = n/(n+8) lahtri kõrgusest;
   * vöötkood on 75% sellest, kood tekstina mahub ülejäänud kõrgusele.
   */
  function tooteMoodud(kood, sisuH, p, veeris) {
    var q = qrcode(0, 'M'); q.addData(String(kood)); q.make();
    var n = q.getModuleCount(), vz = veeris === undefined ? 4 : veeris;
    var qrNahtav = sisuH * n / (n + 2 * vz);
    var ribaMm = qrNahtav * 0.75;
    var koodMm = Math.min((Number(p.kood_pt) || 7) * 0.3528 * 1.4, (sisuH - ribaMm) * 0.8);
    return { ribaMm: ribaMm, koodPt: koodMm / 0.3528 / 1.1 };
  }

  /**
   * Riiulisilt (lint, rull, A4 kleebis): QR vasakul, paremal riiulikood nii suurelt
   * kui mahub. Vöötkoodi pole – telefon loeb väikesel sildil QR-i kindlamalt.
   */
  function riiuliQrHtml(s, pohi, stiil, sisuW, sisuH, naidatavKood) {
    var qrMm = sisuH, paremW = sisuW - qrMm - qrVahe(pohi);
    // Paksu kirja märk on keskmiselt ~0,62 fondi suurusest
    var kirjaMm = riiuliKiri(pohi, sisuH, paremW, naidatavKood.length);
    return '<div class="silt silt-riiulqr" style="' + stiil + 'gap:' + qrVahe(pohi) + 'mm">' +
      '<div class="silt-qr" style="width:' + qrMm + 'mm;height:' + qrMm + 'mm">' + qr(s.kood, qrVeeris(pohi)) + '</div>' +
      '<div class="silt-suurkood" style="width:' + paremW + 'mm;height:' + sisuH + 'mm;line-height:' + sisuH + 'mm;font-size:' + (kirjaMm * 2.835).toFixed(1) + 'pt">' + esc(naidatavKood) + '</div>' +
      '</div>';
  }

  /**
   * Fikseeritud joonelaiusega (moodul_mm) põhjal tehakse vöötkood täpselt
   * mooduleid × moodul_mm laiune, kui see mahub; muidu venitatakse kogu laiusele.
   */
  function ribaLaius(b, laiusMm, p) {
    var m = Number(p.moodul_mm) || 0;
    if (!m) return '';
    var w = b.mooduleid * m;
    return w <= laiusMm ? ';width:' + w.toFixed(2) + 'mm' : '';
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
  function lehtedeHtml(sildid, pohi, algus, hoiatused, prindiks) {
    if (pohi.paigutus !== 'A4') {
      var poora = prindiks && poorata(pohi);
      // Printimisel on kõik sildid sama pikad (pikima järgi): printeri draiver kasutab ühte
      // paberisuurust. Lühem sisu jääb keskele.
      var L = prindiks && autoPikkus(pohi) ? paberiPikkus(sildid, pohi) : 0;
      return sildid.map(function (s) {
        var pp = L ? uhtlanePohi(s, pohi, L) : pohi;
        var ps = pohiSildile(s, pp);
        if (!poora) return '<div class="rull-leht">' + sildiHtml(s, pp, hoiatused) + '</div>';
        // Leht on lindi laiune (kõrgus × laius); silt pööratakse 90° päripäeva
        return '<div class="rull-leht" style="width:' + ps.korgus_mm + 'mm;height:' + ps.laius_mm + 'mm">' +
          '<div style="transform:translate(' + ps.korgus_mm + 'mm,0) rotate(90deg);transform-origin:0 0">' +
          sildiHtml(s, pp, hoiatused) + '</div></div>';
      }).join('');
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

  /** Pikima sildi pikkus (mm) – sellise paberisuurusega tuleb printida. */
  function paberiPikkus(sildid, pohi) {
    // Ülempiiriga lindipõhjal alati max pikkus – Macis piisab ühest paberisuurusest lindi kohta
    var max = Number((pohi.seaded || {}).max_pikkus_mm) || 0;
    if (autoPikkus(pohi) && max && pohi.paigutus !== 'A4') return max;
    return sildid.reduce(function (m, s) { return Math.max(m, pohiSildile(s, pohi).laius_mm); }, 0) || pohi.laius_mm;
  }

  /** Fikseeritud pikkusega (L) põhi ühele sildile: lisaruum jagatakse otste vahel võrdselt. */
  function uhtlanePohi(s, pohi, L) {
    var ps = pohiSildile(s, pohi), p = Object.assign({}, ps.seaded || {});
    p.auto_pikkus = false;
    p.veeris_mm = (Number(p.veeris_mm) || 0) + (L - ps.laius_mm) / 2;
    return Object.assign({}, pohi, { laius_mm: L, seaded: p });
  }

  /** Vihje: millise paberisuurusega printida (lindipõhjad, mille pikkus on sisu järgi). */
  function paberiVihje(sildid, pohi) {
    if (!autoPikkus(pohi) || pohi.paigutus === 'A4') return '';
    var L = paberiPikkus(sildid, pohi);
    return 'Paberi suurus printimisel: <b>' + pohi.korgus_mm + ' × ' + L + ' mm</b> (Macis: Prindi süsteemidialoogi abil → Paper Size → Manage Custom Sizes, Width ' +
      L + ' mm, Height ' + pohi.korgus_mm + ' mm, veerised 0). Lühemad sildid jäävad lehe keskele.';
  }

  /** @page reegel ühe sildi mõõtudele (pööratult vahetatakse küljed). */
  function lehereegel(ps) {
    var w = poorata(ps) ? ps.korgus_mm : ps.laius_mm, h = poorata(ps) ? ps.laius_mm : ps.korgus_mm;
    return '@page { size: ' + w + 'mm ' + h + 'mm; margin: 0; }';
  }

  function poorata(pohi) { var x = (pohi.seaded || {}).poora; return x === true || x === 1 || x === '1'; }

  /** Prindib sildid brauseri printimisdialoogiga. */
  /** iPhone'i avakuva-äpp: window.print() ei tee seal midagi (iOS piirang). */
  function avakuvaIphone() { return window.navigator.standalone === true; }

  function prindi(sildid, pohi, algus) {
    if (!sildid.length) { teade('Vali vähemalt üks silt.', 'viga'); return; }
    if (avakuvaIphone()) {
      if (pohi.paigutus === 'A4') { teade('Avakuva-äpist iPhone printida ei luba. A4 lehe jaoks ava laosüsteem Safaris või arvutis.', 'viga'); return; }
      teade('Avakuva-äpist iPhone printida ei luba – jagan sildi pildina (vali printeri äpp või „Salvesta pilt”).');
      jagaPildina(sildid, pohi);
      return;
    }
    var ala = document.getElementById('prindiala');
    if (!ala) { ala = document.createElement('div'); ala.id = 'prindiala'; document.body.appendChild(ala); }
    ala.innerHTML = lehtedeHtml(sildid, pohi, algus, null, true);
    var stiil = document.getElementById('prindiStiil');
    if (!stiil) { stiil = document.createElement('style'); stiil.id = 'prindiStiil'; document.head.appendChild(stiil); }
    // Täpne lehe suurus: rullil = üks silt, A4 = A4 leht. Veerised 0 – sildi veerised on sildi sees.
    if (pohi.paigutus === 'A4') stiil.textContent = '@page { size: 210mm 297mm; margin: 0; }';
    else if (!autoPikkus(pohi)) stiil.textContent = lehereegel(pohi);
    else stiil.textContent = lehereegel(Object.assign({}, pohi, { laius_mm: paberiPikkus(sildid, pohi) }));
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
  // SILT PILDINA (telefon → Brotheri äpp, nt iPrint&Label)
  // -------------------------------------------------------------------------

  /**
   * iPhone'i AirPrint ei oska lindi/rulli suurust valida, seega saab sildi
   * jagada PNG-pildina ja printida printeri äpist. Pilt joonistatakse otse
   * lõuendile (mitte HTML-ist), et Safari seda ei blokeeriks.
   * Pildil on ainult prinditav ala (ilma üla/alaveeriseta), sest äpp sobitab
   * pildi lindi prinditava kõrgusega. Eraldusvõime 360 dpi.
   */
  var PILDI_DPI = 360;

  function ribaBitid(kood, tyyp) {
    var d = {};
    try { JsBarcode(d, kood, { format: JSB_FORMAAT[tyyp] || 'CODE128' }); }
    catch (e) { d = {}; JsBarcode(d, kood, { format: 'CODE128' }); }
    return (d.encodings || []).map(function (e) { return e.data; }).join('');
  }

  /** Joonistab sildi (QR vasakul, paremal nimi/vöötkood/kood/riiul) lõuendile; Promise<Blob> (PNG). */
  function sildiPilt(s, pohi) {
    pohi = pohiSildile(s, pohi);
    var p = pohi.seaded || {};
    var mm = PILDI_DPI / 25.4;
    var v = Number(p.veeris_mm) || 0;
    var vy = p.veeris_y_mm === undefined || p.veeris_y_mm === '' ? v : Number(p.veeris_y_mm) || 0;
    var sisuW = pohi.laius_mm - 2 * v;
    var c = document.createElement('canvas');
    c.width = Math.round(pohi.laius_mm * mm); c.height = Math.round((pohi.korgus_mm - 2 * vy) * mm);
    var ctx = c.getContext('2d'), H = c.height;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, H);
    ctx.fillStyle = '#000'; ctx.textBaseline = 'top';
    var x0 = Math.round(v * mm);

    // QR vasakul, vaikne tsoon 4 moodulit; täisarvulised pikslid = terav
    var q = qrcode(0, 'M'); q.addData(String(s.kood)); q.make();
    var vz = qrVeeris(pohi), n = q.getModuleCount(), rakk = Math.max(1, Math.floor(H / (n + 2 * vz)));
    var qx = x0 + Math.floor((H - rakk * n) / 2), qy = Math.floor((H - rakk * n) / 2);
    for (var r = 0; r < n; r++) for (var k = 0; k < n; k++) if (q.isDark(r, k)) ctx.fillRect(qx + k * rakk, qy + r * rakk, rakk, rakk);

    var vahe = Math.round(qrVahe(pohi) * mm);
    var px = x0 + H + vahe, pw = Math.round(sisuW * mm) - H - vahe;
    var naidatavKood = s.liik === 'riiul' ? s.kood.replace(/^R-/, '') : s.kood;
    var SANS = 'Arial, Helvetica, sans-serif', MONO = 'Menlo, Consolas, "DejaVu Sans Mono", monospace';
    if (ainultQr(s, pohi)) {
      // Ainult QR ja suur kood (riiulisilt alati, tootesilt kui põhjas pole vöötkoodi)
      var suur = Math.round(riiuliKiri(pohi, H, null, 1));
      ctx.font = 'bold ' + suur + 'px ' + SANS;
      var lw = ctx.measureText(naidatavKood).width;
      if (lw > pw) { suur = Math.floor(suur * pw / lw); ctx.font = 'bold ' + suur + 'px ' + SANS; lw = ctx.measureText(naidatavKood).width; }
      // Suurtähed ja numbrid on ~0,716 fondi suurusest – paigutame need vertikaalselt keskele
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(naidatavKood, px + Math.max(0, (pw - lw) / 2), Math.round((H + suur * 0.716) / 2));
      return valmis(c);
    }
    // Tootesilt: vöötkood ~75% QR-i kõrgusest, all kood tekstina; plokk keskel
    var m = tooteMoodud(s.kood, H / mm, p, vz);
    var bitid = ribaBitid(s.kood, s.koodiTyyp);
    var moodul = Math.max(1, Math.floor(pw / (bitid.length + 20)));
    if (Number(p.moodul_mm)) moodul = Math.min(moodul, Math.max(1, Math.round(Number(p.moodul_mm) * mm)));
    var ribaH = Math.round(m.ribaMm * mm), kf = Math.round(Math.min(m.koodPt * 0.3528 * mm, pw / (String(s.kood).length * 0.6)));
    var y = Math.max(0, Math.round((H - ribaH - kf * 1.1) / 2));
    for (var i = 0; i < bitid.length; i++) if (bitid[i] === '1') ctx.fillRect(px + (10 + i) * moodul, y, moodul, ribaH);
    ctx.font = 'bold ' + kf + 'px ' + MONO; ctx.textBaseline = 'top';
    ctx.fillText(s.kood, px + 10 * moodul, y + ribaH + Math.round(kf * 0.1));
    return valmis(c);
  }

  function valmis(c) {
    return new Promise(function (ok, viga) {
      c.toBlob(function (b) { if (b) ok(b); else viga(new Error('Pildi tegemine ebaõnnestus.')); }, 'image/png');
    });
  }

  /** Uus vajutus jagamiseks (Safari lubab jagada ainult kohe pärast vajutust). */
  function jagaUuesti(failid) {
    LAO.modaal('Pildid on valmis', '<form><p>' + failid.length + ' silti pildina.</p>' +
      '<div class="nupurida"><button type="button" class="nupp" data-sulge>Sulge</button>' +
      '<button type="submit" class="nupp nupp-pohi">📤 Jaga</button></div></form>',
      function () { return navigator.share({ files: failid }).catch(function (e) { if (!e || e.name !== 'AbortError') throw e; }); });
  }

  function failinimi(s) { return 'silt-' + String(s.kood).replace(/[^A-Za-z0-9_-]+/g, '_') + '.png'; }

  /**
   * Jagab sildid PNG-piltidena (iPhone'is jagamismenüü → printeri äpp või
   * „Salvesta pilt“). Kui jagamist pole (arvuti), laaditakse pildid alla.
   */
  function jagaPildina(sildid, pohi) {
    var unik = [], nahtud = {};
    sildid.forEach(function (s) { if (s.kood && !nahtud[s.kood]) { nahtud[s.kood] = 1; unik.push(s); } });
    if (!unik.length) { teade('Vali vähemalt üks koodiga silt.', 'viga'); return Promise.resolve(); }
    if (pohi.paigutus === 'A4') { teade('A4 kleebiselehte ei saa pildina jagada – vali rulli või lindi põhi.', 'viga'); return Promise.resolve(); }
    return Promise.all(unik.map(function (s) { return sildiPilt(s, pohi); })).then(function (blobid) {
      var failid = blobid.map(function (b, i) { return new File([b], failinimi(unik[i]), { type: 'image/png' }); });
      if (navigator.canShare && navigator.canShare({ files: failid })) {
        return navigator.share({ files: failid }).catch(function (e) {
          if (e && e.name === 'AbortError') return;
          if (e && e.name === 'NotAllowedError') return jagaUuesti(failid); // Safari: vajutusest möödus liiga palju aega
          throw e;
        });
      }
      failid.forEach(function (f) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(f); a.download = f.name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
      });
    }).catch(function (e) { teade(e.message || 'Jagamine ebaõnnestus.', 'viga'); });
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
      '        <button class="nupp" id="jagaNupp" type="button">📤 Jaga pildina</button>' +
      '      </div>' +
      '      <p class="vaike">Telefonis: „Jaga pildina” → printeri äpp (nt Brother iPrint&amp;Label) või „Salvesta pilt”. Iga kood tuleb üks kord, arvu määrad äpis.</p>' +
      '      <p id="sHoiatus" class="kaart-teade hoiatus" hidden></p>' +
      '      <p id="sPaber" class="kaart-teade" hidden></p>' +
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
      var vihje = paberiVihje(sildid.length ? sildid : naidis, pohi);
      $('#sPaber').hidden = !vihje; $('#sPaber').innerHTML = vihje;
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
    $('#jagaNupp').addEventListener('click', function () {
      var sildid = valitudSildid().map(function (x) { return x.silt; });
      var p = leiaPohi($('#sPohi').value);
      jagaPildina(sildid.length ? sildid : [testSilt(p)], p);
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
      vali('max_pikkus_mm', 'Max pikkus (mm)', p.max_pikkus_mm, 'pikkus sisu järgi; tühi = piiranguta') +
      '<div class="valjarida2">' + vali('veeris_mm', 'Veeris (mm)', p.veeris_mm) + vali('veeris_y_mm', 'Üla/alaveeris (mm)', p.veeris_y_mm, 'tühi = sama') + '</div>' +
      '<div class="valjarida2">' + vali('ribakood_mm', 'Vöötkoodi kõrgus (mm)', p.ribakood_mm) + vali('moodul_mm', 'Vöötkoodi joon (mm)', p.moodul_mm, 'tühi = venita') + '</div>' +
      '<div class="valjarida2">' + vali('nimi_pt', 'Nimetuse font (pt)', p.nimi_pt, '0 = peida') + vali('nimi_ridu', 'Nimetuse ridu', p.nimi_ridu, '1–2') + '</div>' +
      '<div class="valjarida2">' + vali('kood_pt', 'Koodi font (pt)', p.kood_pt) + vali('riiul_pt', 'Riiuli/tsooni font (pt)', p.riiul_pt, '0 = peida') + '</div>' +
      '<label class="linnuke"><input type="checkbox" name="auto_pikkus"' + (autoPikkus(pohi) ? ' checked' : '') + '> Pikkus sisu järgi <span class="vaike">(lint: Laius on siis ainult varuväärtus, Veeris = tühi ots mõlemas otsas)</span></label>' +
      '<label class="linnuke"><input type="checkbox" name="vootkood"' + (p.vootkood ? ' checked' : '') + '> Tootesildil ka vöötkood <span class="vaike">(vaja ainult QR-i mittelugeva skanneri jaoks; muidu QR ja kood)</span></label>' +
      '<label class="linnuke"><input type="checkbox" name="poora"' + (poorata(pohi) ? ' checked' : '') + '> Prindi 90° pööratult <span class="vaike">(kui silt tuleb lindile risti või kärbitult)</span></label>' +
      '<fieldset class="ainult-a4"><legend>A4 leht</legend>' +
      '<div class="valjarida2">' + vali('veerge', 'Veerge', p.veerge || 3) + vali('ridu', 'Ridu', p.ridu || 8) + '</div>' +
      '<div class="valjarida2">' + vali('leht_ylal_mm', 'Lehe ülaveeris (mm)', p.leht_ylal_mm || 0) + vali('leht_vasakul_mm', 'Lehe vasakveeris (mm)', p.leht_vasakul_mm || 0) + '</div>' +
      '</fieldset>' +
      '<p class="vaike">' + (oma ? 'Muudatus salvestatakse sellesse põhja.' : 'Vaikimisi põhja ei muudeta – salvestatakse uus põhi.') + '</p>' +
      LAO.MODAALI_NUPUD + '</form>',
      function (v) {
        var arvud = {};
        ['max_pikkus_mm', 'veeris_mm', 'veeris_y_mm', 'ribakood_mm', 'moodul_mm', 'nimi_pt', 'nimi_ridu', 'kood_pt', 'riiul_pt', 'veerge', 'ridu', 'leht_ylal_mm', 'leht_vasakul_mm'].forEach(function (n) {
          var x = String(v[n].value).replace(',', '.').trim();
          if (x !== '') arvud[n] = Number(x);
        });
        if (v.poora.checked) arvud.poora = true;
        if (v.vootkood.checked) arvud.vootkood = true;
        if (v.auto_pikkus.checked) arvud.auto_pikkus = true;
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
      '<p class="vaike kiir-paber"></p>' +
      '<div class="nupurida"><button type="button" class="nupp" data-sulge>Sulge</button>' +
      '<button type="button" class="nupp" data-jaga>📤 Jaga pildina</button>' +
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
      d.querySelector('.kiir-paber').innerHTML = paberiVihje([silt()], p);
    }
    function pohjad() {
      vorm.pohi.innerHTML = koikPohjad().map(function (p) {
        return '<option value="' + esc(p.id) + '"' + (p.id === vaikePohi ? ' selected' : '') + '>' + esc(p.nimi) + '</option>';
      }).join('');
      joonista();
    }
    vorm.pohi.addEventListener('change', function () { vaikePohi = vorm.pohi.value; joonista(); });
    d.querySelector('[data-jaga]').addEventListener('click', function () { jagaPildina([silt()], leiaPohi(vorm.pohi.value)); });
    if (vorm.sise) vorm.sise.addEventListener('change', joonista);
    pohjad();
    (pohjadLaetud || laePohjad()).then(pohjad);
  }

  LAO.kiirprint = kiirprint;
  LAO.sildiPilt = sildiPilt; // testimiseks
  LAO.vaated['sildid'] = { fn: vaadeSildid, admin: true };
})();
