/**
 * ANDMED – toodete ja riiulite nimekiri seadmes.
 *
 * Server saadab tegevusega "andmed" kõik tooted (koos koodide, saldo ja
 * olekuga) ning riiulid. Hoiame neid mälus ja seadme mälus (localStorage),
 * et vaated avaneksid kohe. Etapis 4 kolib see IndexedDB-sse ja töötab ka
 * ilma internetita.
 */
(function () {
  'use strict';

  var VOTI = 'lao.andmed';

  var andmed = { tooted: [], riiulid: [], kelleleSoovitused: [], laetud: null };
  try {
    var vana = JSON.parse(localStorage.getItem(VOTI) || 'null');
    if (vana && vana.tooted) andmed = vana;
  } catch (e) { /* ignoreeri */ }

  /** Laeb serverist värske nimekirja. Tagastab Promise'i andmetega. */
  function laeAndmed() {
    return API.kutsu('andmed').then(function (d) {
      andmed.tooted = d.tooted;
      andmed.riiulid = d.riiulid;
      andmed.kelleleSoovitused = d.kelleleSoovitused || [];
      andmed.laetud = d.serveriAeg;
      try { localStorage.setItem(VOTI, JSON.stringify(andmed)); } catch (e) { /* liiga suur – pole hullu */ }
      return andmed;
    });
  }

  /** Riiul id järgi (või null). */
  function riiul(id) {
    if (!id) return null;
    for (var i = 0; i < andmed.riiulid.length; i++) if (andmed.riiulid[i].id === id) return andmed.riiulid[i];
    return null;
  }

  function toode(id) {
    for (var i = 0; i < andmed.tooted.length; i++) if (andmed.tooted[i].id === id) return andmed.tooted[i];
    return null;
  }

  /**
   * Otsib koodi järgi (tähesuurus ei loe). Tagastab { toode } või { riiul } või null.
   * Kasutatakse skännimisel (etapp 3) ja dubleeritud koodide kontrollimisel.
   */
  function leiaKoodiga(kood) {
    var n = String(kood || '').trim().toUpperCase();
    if (!n) return null;
    var leitud = leiaTapne(n);
    if (leitud) return leitud;
    // UPC-A (12 numbrit) ja EAN-13 (sama kood alguses 0-ga) on sama vöötkood – proovi mõlemat
    if (/^\d{12}$/.test(n)) return leiaTapne('0' + n);
    if (/^0\d{12}$/.test(n)) return leiaTapne(n.slice(1));
    return null;
  }

  function leiaTapne(n) {
    for (var i = 0; i < andmed.tooted.length; i++) {
      var t = andmed.tooted[i];
      for (var j = 0; j < t.koodid.length; j++) if (t.koodid[j].kood.toUpperCase() === n) return { toode: t };
    }
    for (var k = 0; k < andmed.riiulid.length; k++) {
      if (andmed.riiulid[k].kood.toUpperCase() === n) return { riiul: andmed.riiulid[k] };
    }
    return null;
  }

  var TYYBI_NIMI = { 'VARUOSA': 'Varuosa', 'TÖÖRIIST': 'Tööriist' };
  var OLEKU_KLASS = { 'LAOS': 'silt-ok', 'VÄLJA ANTUD': 'silt-hoiatus', 'REMONDIS': 'silt-hoiatus', 'KADUNUD': 'silt-viga' };

  /** Kas varuosa saldo on alla miinimumi. */
  function allMiinimumi(t) {
    return t.tyyp === 'VARUOSA' && t.miinimumkogus !== null && t.miinimumkogus !== '' && t.saldo < t.miinimumkogus;
  }

  /** Saldo (varuosa) või olek (tööriist) HTML-ina. */
  function seisHtml(t) {
    var esc = LAO.esc;
    if (t.tyyp === 'VARUOSA') {
      return '<span><b' + (allMiinimumi(t) ? ' class="tekst-hoiatus"' : '') + '>' + esc(arvTekst(t.saldo)) + '</b> ' + esc(t.yhik) + '</span>';
    }
    return '<span><span class="silt ' + (OLEKU_KLASS[t.olek] || '') + '">' + esc(t.olek) + '</span>' +
      (t.kellele ? ' <span class="vaike">' + esc(t.kellele) + '</span>' : '') + '</span>';
  }

  /** Arv Eesti vormingus (koma, mitte punkt). */
  function arvTekst(n) {
    if (n === null || n === undefined || n === '') return '';
    return String(n).replace('.', ',');
  }

  /** Kategooriate ja tsoonide nimekiri (valikute ja soovituste jaoks). */
  function unikaalsed(list, vali) {
    var s = {};
    list.forEach(function (x) { if (x[vali]) s[x[vali]] = true; });
    return Object.keys(s).sort(function (a, b) { return a.localeCompare(b, 'et'); });
  }

  /** <option>-id aktiivsete riiulite jaoks. */
  function riiuliValikud(valitud) {
    var esc = LAO.esc;
    return '<option value="">– pole määratud –</option>' + andmed.riiulid
      .filter(function (r) { return !r.arhiveeritud || r.id === valitud; })
      .sort(function (a, b) { return a.kood.localeCompare(b.kood, 'et', { numeric: true }); })
      .map(function (r) {
        return '<option value="' + esc(r.id) + '"' + (r.id === valitud ? ' selected' : '') + '>' +
          esc(r.kood) + (r.nimetus ? ' – ' + esc(r.nimetus) : '') + '</option>';
      }).join('');
  }

  // -------------------------------------------------------------------------
  // LIIKUMISTE SALVESTAMINE
  // -------------------------------------------------------------------------

  /** Unikaalne id liikumisele (luuakse telefonis, et korduv saatmine ei tekitaks topeltkirjet). */
  function uusId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  /**
   * Saadab liikumised serverisse ja uuendab seadmes olevaid saldosid/olekuid.
   * Tagastab Promise'i serveri tulemustega [{ id, ok, konflikt, pohjus, viga }].
   * Etapis 4 asendub see järjekorraga, mis töötab ka ilma internetita.
   */
  function salvestaLiikumised(liikumised) {
    return API.kutsu('liikumised.lisa', { liikumised: liikumised }).then(function (vastus) {
      uuendaSeisud(vastus.tooted);
      return vastus.tulemused;
    });
  }

  /** Paneb serveri saadetud uued seisud seadme nimekirja. */
  function uuendaSeisud(seisud) {
    (seisud || []).forEach(function (s) {
      var t = toode(s.id);
      if (!t) return;
      t.saldo = s.saldo; t.olek = s.olek; t.kellele = s.kellele; t.alates = s.alates; t.riiul_id = s.riiul_id;
    });
    try { localStorage.setItem(VOTI, JSON.stringify(andmed)); } catch (e) { /* ignoreeri */ }
  }

  LAO.uusId = uusId;
  LAO.salvestaLiikumised = salvestaLiikumised;
  LAO.andmed = andmed;
  LAO.laeAndmed = laeAndmed;
  LAO.riiul = riiul;
  LAO.toode = toode;
  LAO.leiaKoodiga = leiaKoodiga;
  LAO.tyypNimi = function (t) { return TYYBI_NIMI[t] || t; };
  LAO.allMiinimumi = allMiinimumi;
  LAO.seisHtml = seisHtml;
  LAO.arvTekst = arvTekst;
  LAO.unikaalsed = unikaalsed;
  LAO.riiuliValikud = riiuliValikud;
  LAO.YHIKUD = ['tk', 'm', 'l', 'kg', 'pakk'];
  LAO.KOODI_TYYBID = ['EAN13', 'EAN8', 'UPC', 'CODE128', 'CODE39', 'QR', 'SISEKOOD'];
})();
