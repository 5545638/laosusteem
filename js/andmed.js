/**
 * ANDMED – toodete ja riiulite nimekiri seadmes.
 *
 * Server saadab tegevusega "andmed" kõik tooted (koos koodide, saldo ja
 * olekuga) ning riiulid. Hoiame neid mälus ja seadme mälus (localStorage),
 * et vaated avaneksid kohe ja skännimine töötaks ka ilma internetita.
 *
 * Saatmata liikumised (js/jarjekord.js) arvestatakse seadmes kohe saldo ja
 * oleku sisse: iga toote juures on t._server = serveri viimati teatatud seis
 * ning nähtav seis = _server + järjekorras ootel liikumised (rakendaOotel).
 */
(function () {
  'use strict';

  var VOTI = 'lao.andmed';

  var andmed = { tooted: [], riiulid: [], kelleleSoovitused: [], minuKonfliktid: [], konfliktideArv: null, laetud: null };
  try {
    var vana = JSON.parse(localStorage.getItem(VOTI) || 'null');
    if (vana && vana.tooted) andmed = vana;
  } catch (e) { /* ignoreeri */ }

  /** Laeb serverist värske nimekirja. Tagastab Promise'i andmetega. */
  function laeAndmed() {
    return API.kutsu('andmed').then(function (d) {
      andmed.tooted = d.tooted;
      andmed.tooted.forEach(function (t) { t._server = seis(t); });
      andmed.riiulid = d.riiulid;
      andmed.kelleleSoovitused = d.kelleleSoovitused || [];
      andmed.minuKonfliktid = d.minuKonfliktid || [];
      andmed.konfliktideArv = d.konfliktideArv;
      andmed.laetud = d.serveriAeg;
      rakendaOotel();
      if (LAO.uuendaOlekuriba) LAO.uuendaOlekuriba();
      return andmed;
    });
  }

  function salvesta() {
    try { localStorage.setItem(VOTI, JSON.stringify(andmed)); } catch (e) { /* liiga suur – pole hullu */ }
  }

  /** Toote seisu väljad eraldi objektina. */
  function seis(t) {
    return { saldo: t.saldo, olek: t.olek, kellele: t.kellele, alates: t.alates, riiul_id: t.riiul_id };
  }

  // -------------------------------------------------------------------------
  // SAATMATA LIIKUMISTE ARVESTAMINE SEADMES
  // -------------------------------------------------------------------------

  /**
   * Arvutab nähtava seisu uuesti: serveri seis + järjekorras ootel liikumised.
   * Lisab nimekirja ka ilma internetita lisatud (veel saatmata) tooted.
   * Kutsutakse andmete laadimisel ja iga järjekorra muutuse järel.
   */
  function rakendaOotel() {
    var ootel = LAO.jarjekord ? LAO.jarjekord.kirjed().filter(function (k) { return k.olek !== 'viga'; }) : [];
    var ootelTooted = {};
    ootel.forEach(function (k) { if (k.liik === 'toode') ootelTooted[k.andmed.id] = k.andmed; });
    // Saadetud või kustutatud ajutised tooted välja, puuduvad ootel tooted sisse
    andmed.tooted = andmed.tooted.filter(function (t) { return !t.ootel || ootelTooted[t.id]; });
    Object.keys(ootelTooted).forEach(function (id) { if (!toode(id)) andmed.tooted.push(ajutineToode(ootelTooted[id])); });

    andmed.tooted.forEach(function (t) {
      if (!t._server) t._server = seis(t);
      for (var v in t._server) t[v] = t._server[v];
    });
    ootel.forEach(function (k) { if (k.liik === 'liikumine') rakenda(k.andmed); });
    salvesta();
  }

  /** Ilma internetita lisatud toode (kuni serverisse jõudmiseni). */
  function ajutineToode(d) {
    var varuosa = (d.tyyp || 'VARUOSA') === 'VARUOSA';
    var t = {
      id: d.id, nimetus: d.nimetus, tyyp: d.tyyp || 'VARUOSA', yhik: varuosa ? (d.yhik || 'tk') : 'tk',
      kategooria: d.kategooria || '', riiul_id: d.riiul_id || '',
      miinimumkogus: varuosa && d.miinimumkogus !== '' && d.miinimumkogus !== undefined ? Number(String(d.miinimumkogus).replace(',', '.')) : null,
      arhiveeritud: false, loodud: new Date().toISOString(),
      koodid: d.kood ? [{ kood: d.kood, tyyp: '' }] : [],
      ootel: true
    };
    t._server = {
      saldo: varuosa ? (Number(String(d.algsaldo || 0).replace(',', '.')) || 0) : null,
      olek: varuosa ? null : 'LAOS', kellele: '', alates: '', riiul_id: t.riiul_id
    };
    return t;
  }

  /** Ühe ootel liikumise mõju seadme nimekirjale (sama loogika nagu serveris). */
  function rakenda(l) {
    var t = toode(l.toote_id);
    var kogus = Number(String(l.kogus === undefined ? 1 : l.kogus).replace(',', '.')) || 0;
    if (l.tyyp === 'TÜHISTUS') {
      // Tühistatava liikumise mõju pööratakse ümber, kui see on seadmes teada
      var v = LAO.jarjekord && LAO.jarjekord.saadetud(l.viide);
      t = v && toode(v.toote_id);
      if (!t) return;
      var vk = Number(String(v.kogus === undefined ? 1 : v.kogus).replace(',', '.')) || 0;
      if (v.tyyp === 'SISSE') t.saldo -= vk;
      else if (v.tyyp === 'VÄLJA') t.saldo += vk;
      else if (v.tyyp === 'KORRIGEERIMINE' && v.tegelikKogus === undefined) t.saldo -= vk;
      else if (v.tyyp === 'VÄLJA_ANTUD') { t.olek = 'LAOS'; t.kellele = ''; t.alates = ''; }
      else if (v.tyyp === 'TAGASTATUD') { t.olek = 'VÄLJA ANTUD'; }
      if (t.saldo !== null) t.saldo = Math.round(t.saldo * 1000) / 1000;
      return;
    }
    if (!t) return;
    switch (l.tyyp) {
      case 'SISSE': t.saldo += kogus; break;
      case 'VÄLJA': t.saldo -= kogus; break;
      case 'KORRIGEERIMINE':
        if (l.tegelikKogus !== undefined && l.tegelikKogus !== '') t.saldo = Number(String(l.tegelikKogus).replace(',', '.'));
        else t.saldo += kogus;
        break;
      case 'VÄLJA_ANTUD': t.olek = 'VÄLJA ANTUD'; t.kellele = l.kellele_kuhu; t.alates = l.skannimise_aeg; break;
      case 'TAGASTATUD': t.olek = 'LAOS'; t.kellele = ''; t.alates = ''; break;
      case 'OLEKU_MUUTUS': t.olek = String(l.kellele_kuhu).toUpperCase(); t.kellele = ''; t.alates = t.olek === 'LAOS' ? '' : l.skannimise_aeg; break;
      case 'ÜMBERPAIGUTUS': t.riiul_id = l.kellele_kuhu; break;
    }
    if (t.saldo !== null && t.saldo !== undefined) t.saldo = Math.round(t.saldo * 1000) / 1000;
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
  // LIIKUMISTE SALVESTAMINE (vt ka js/jarjekord.js)
  // -------------------------------------------------------------------------

  /** Unikaalne id liikumisele (luuakse telefonis, et korduv saatmine ei tekitaks topeltkirjet). */
  function uusId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  /** Paneb serveri saadetud uued seisud seadme nimekirja (ootel liikumised arvestatakse peale). */
  function uuendaSeisud(seisud) {
    (seisud || []).forEach(function (s) {
      var t = toode(s.id);
      if (t) t._server = { saldo: s.saldo, olek: s.olek, kellele: s.kellele, alates: s.alates, riiul_id: s.riiul_id };
    });
    rakendaOotel();
  }

  LAO.uusId = uusId;
  LAO.uuendaSeisud = uuendaSeisud;
  LAO.rakendaOotel = rakendaOotel;
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
