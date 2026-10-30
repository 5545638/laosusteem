/**
 * LAOSÜSTEEM – Google Apps Scripti taustasüsteem (JSON-API)
 * ==========================================================
 *
 * See fail kleebitakse Google Sheetsi juurde kuuluvasse Apps Scripti projekti
 * (Laiendused → Apps Script). Täpne juhend on failis JUHEND.md.
 *
 * Kuidas see töötab:
 *  - Esipaneel (veebileht GitHub Pagesis) saadab POST-päringu kujul
 *      { "action": "login", "token": "...", "data": { ... } }
 *    ja saab vastuseks JSON-i:
 *      { "ok": true,  "data": { ... } }      – õnnestus
 *      { "ok": false, "error": "Tekst", "code": "KOOD" } – viga
 *  - Iga päring (v.a sisselogimine ja olek) kontrollib seansivõtit serveri poolel.
 *  - Andmed on sama tabeli eraldi lehtedel (Kasutajad, Seansid, Tooted jne).
 *  - Kirjutamised käivad LockService'i luku all, et kaks samaaegset päringut
 *    ei kirjutaks teineteise andmeid üle.
 *
 * Esmane seadistus: käivita Apps Scripti redaktoris funktsioon `seadista`
 * (vt JUHEND.md). See loob kõik lehed ja näitab esimese admini loomise koodi.
 */

// ---------------------------------------------------------------------------
// SEADED – neid võib vajadusel muuta
// ---------------------------------------------------------------------------

var SEADED = {
  VERSIOON: '1.6.0-kiirus',
  SEANSI_KEHTIVUS_PAEVI: 30,      // Mitu päeva telefon sisselogimist meeles peab
  // Aegunud/lukustatud seansi rida hoitakse veel nii mitu päeva alles, et lukustatud
  // kasutaja telefonist hiljem saabuvad liikumised saaks tema nimel KONFLIKTIDE alla panna.
  SEANSI_SAILITAMINE_PAEVI: 90,
  MAX_VALE_PIN: 5,                // Mitu järjestikust vale PIN-i katset on lubatud
  PIN_LUKK_MINUTIT: 15,           // Kui kauaks kasutaja pärast liigseid katseid lukustatakse
  PIN_MIN_PIKKUS: 4,
  PIN_MAX_PIKKUS: 6,
  RASI_KORDUSI: 200,              // PIN-räsi arvutamise korduste arv (suurem = aeglasem murda)
  VAHEMALU_SEKUNDIT: 600,         // Kui kauaks seansi kontrolli tulemus vahemällu jääb
  LUKU_OOTEAEG_MS: 20000,         // Kui kaua kirjutamisluku järel oodatakse

  // Sisekoodid (vt jaotis KOODID). Number täidetakse nullidega: V-00001
  SISEKOODI_NUMBRI_KOHTI: 5,
  // Riiulikoodi vorming hulgilisamisel. {riiul} = nt A01, {korrus} = nt 03
  RIIULI_VORMING: 'R-{riiul}-{korrus}',
  RIIULI_VORMING_ILMA_KORRUSETA: 'R-{riiul}',
  KORRUSE_NUMBRI_KOHTI: 2,
  MAX_HULGI_RIIULEID: 1000,       // Mitu riiulit korraga võib hulgilisamisega luua
  MAX_IMPORDI_RIDU: 500,          // Mitu rida ühes impordipäringus (esipaneel jagab suure faili osadeks)
  MAX_LIIKUMISI_PARINGUS: 200,    // Mitu liikumist korraga (telefoni järjekord saadab pakkidena)
  MAX_MINU_KONFLIKTE: 20,         // Mitu lahendamata konflikti näidatakse kasutajale telefonis
  MAX_AJALOO_RIDU: 5000,          // Mitu liikumist korraga AJALOO vaatesse/eksporti
  SOOVITUSTE_RIDU: 1000           // Mitmest viimasest liikumisest „kellele/kuhu” soovitused tehakse
};

/** Toote tüübid */
var TYYP = { VARUOSA: 'VARUOSA', TOORIIST: 'TÖÖRIIST' };
/** Lubatud ühikud */
var YHIKUD = ['tk', 'm', 'l', 'kg', 'pakk'];
/** Koodi tüübid (Koodid-lehe veerg koodi_tüüp) */
var KOODI_TYYBID = ['EAN13', 'EAN8', 'UPC', 'CODE128', 'CODE39', 'QR', 'SISEKOOD'];

/** Rollid */
var ROLL = { ADMIN: 'ADMIN', LAOTOOTAJA: 'LAOTÖÖTAJA' };

/**
 * Lehtede struktuur. Iga veeru juures on tüüp:
 *   s = tekst, n = number, d = kuupäev/kellaaeg, b = jah/ei
 * Tekstiveerud vormindatakse tabelis "lihttekstiks", et nt vöötkoodi alguses
 * olevad nullid ära ei kaoks.
 * NB! Veergude järjekorda tabelis võib muuta – kood otsib veerge päise järgi.
 * Veergude nimesid ära muuda.
 */
var SKEEM = {
  Tooted: [
    ['id', 's'], ['nimetus', 's'], ['tüüp', 's'], ['ühik', 's'], ['kategooria', 's'],
    ['riiul_id', 's'], ['miinimumkogus', 'n'], ['arhiveeritud', 'b'], ['loodud', 'd']
  ],
  Koodid: [
    ['kood', 's'], ['toote_id', 's'], ['koodi_tüüp', 's']
  ],
  Riiulid: [
    ['id', 's'], ['kood', 's'], ['nimetus', 's'], ['tsoon', 's'], ['arhiveeritud', 'b']
  ],
  Liikumised: [
    ['id', 's'], ['toote_id', 's'], ['tüüp', 's'], ['kogus', 'n'], ['kellele_kuhu', 's'],
    ['märkus', 's'], ['kasutaja_id', 's'], ['skännimise_aeg', 'd'],
    ['serverisse_jõudmise_aeg', 'd'], ['konflikt', 'b'], ['konflikti_põhjus', 's'],
    ['lahendatud', 'b']
  ],
  Kasutajad: [
    ['id', 's'], ['kasutajanimi', 's'], ['nimi', 's'], ['pin_räsi', 's'], ['roll', 's'],
    ['aktiivne', 'b'], ['loodud', 'd'], ['vale_katseid', 'n'], ['lukus_kuni', 'd']
  ],
  Seansid: [
    // "võti" on seansivõtme räsi – võtit ennast tabelis ei hoita.
    ['võti', 's'], ['kasutaja_id', 's'], ['loodud', 'd'], ['kehtib_kuni', 'd'], ['seade', 's']
  ],
  // Iga toote praegune seis (arvutatakse liikumistest ja uuendatakse iga liikumisega),
  // et saldo saamiseks ei peaks iga päringu ajal kogu Liikumiste lehte läbi lugema.
  Saldod: [
    ['toote_id', 's'], ['saldo', 'n'], ['olek', 's'], ['kellele', 's'], ['alates', 'd'],
    ['viimati_muudetud', 'd']
  ],
  Sildipõhjad: [
    ['id', 's'], ['nimi', 's'], ['laius_mm', 'n'], ['kõrgus_mm', 'n'], ['paigutus', 's'],
    ['seaded', 's']
  ],
  Loendurid: [
    ['tüüp', 's'], ['järgmine', 'n']
  ],
  // Masinad, millele varuosi väljastatakse (nimekirja saadab Masinakulude rakendus).
  // VÄLJA-liikumise kellele_kuhu = masina nimi; Masinakulud arvestab väljastuse masina kuluks.
  Masinad: [
    ['id', 's'], ['nimi', 's'], ['kood', 's'], ['aktiivne', 'b']
  ]
};

/** Sisekoodide loendurite algväärtused (kasutatakse etapis 2). */
var LOENDURID_ALGUS = [['VARUOSA', 1], ['TÖÖRIIST', 1], ['RIIUL', 1]];

// ---------------------------------------------------------------------------
// SISENDPUNKTID: doGet ja doPost
// ---------------------------------------------------------------------------

/**
 * GET-päring. Lubatud ainult "olek" – sellega saab brauseris kontrollida,
 * kas API töötab: avage API aadress ja lisage lõppu ?action=olek
 * Seansivõtmeid GET-iga ei saadeta (need jääksid brauseri ajalukku).
 */
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'olek';
  if (action !== 'olek') {
    return vastus_({ ok: false, error: 'GET toetab ainult tegevust "olek".', code: 'VALE_PARING' });
  }
  return vastus_(kasitle_({ action: 'olek' }));
}

/**
 * POST-päring. Esipaneel saadab keha tekstina (Content-Type: text/plain),
 * et brauser ei teeks CORS-eelpäringut, mida Apps Script ei toeta.
 */
function doPost(e) {
  var paring;
  try {
    paring = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return vastus_({ ok: false, error: 'Päring ei ole korrektne JSON.', code: 'VALE_PARING' });
  }
  return vastus_(kasitle_(paring));
}

/** Teeb objektist JSON-vastuse. */
function vastus_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Tegevuste tabel. Võti = tegevuse nimi, väärtus:
 *   fn     – funktsioon (data, kasutaja) => tulemus
 *   avalik – true, kui seansivõtit pole vaja
 *   roll   – kui määratud, peab kasutajal olema see roll
 *   kirjutab – true, kui tegevus muudab andmeid (siis võetakse lukk)
 */
var TEGEVUSED = {
  'olek':                 { fn: tOlek_, avalik: true },
  'soe':                  { fn: tSoe_, avalik: true },   // „äratus” – ei loe tabelit
  'esimeneAdmin':         { fn: tEsimeneAdmin_, avalik: true, kirjutab: true },
  'login':                { fn: tLogin_, avalik: true, kirjutab: true },
  'logout':               { fn: tLogout_, kirjutab: true },
  'mina':                 { fn: tMina_ },
  'kasutajad.nimekiri':   { fn: tKasutajadNimekiri_, roll: ROLL.ADMIN },
  'kasutajad.lisa':       { fn: tKasutajadLisa_, roll: ROLL.ADMIN, kirjutab: true },
  'kasutajad.muuda':      { fn: tKasutajadMuuda_, roll: ROLL.ADMIN, kirjutab: true },
  'kasutajad.lahtestaPin':{ fn: tKasutajadLahtestaPin_, roll: ROLL.ADMIN, kirjutab: true },
  'kasutajad.lukusta':    { fn: tKasutajadLukusta_, roll: ROLL.ADMIN, kirjutab: true },
  'kasutajad.aktiveeri':  { fn: tKasutajadAktiveeri_, roll: ROLL.ADMIN, kirjutab: true },

  // Etapp 2: tooted, koodid, riiulid, import
  'andmed':               { fn: tAndmed_ },
  'tooted.lisa':          { fn: tTootedLisa_, kirjutab: true, lukustatuleLubatud: true },   // ka laotöötaja (kiirlisamine)
  'tooted.muuda':         { fn: tTootedMuuda_, roll: ROLL.ADMIN, kirjutab: true },
  'tooted.arhiveeri':     { fn: tTootedArhiveeri_, roll: ROLL.ADMIN, kirjutab: true },
  'tooted.import':        { fn: tTootedImport_, roll: ROLL.ADMIN, kirjutab: true },
  'koodid.lisa':          { fn: tKoodidLisa_, roll: ROLL.ADMIN, kirjutab: true },
  'koodid.eemalda':       { fn: tKoodidEemalda_, roll: ROLL.ADMIN, kirjutab: true },
  'riiulid.lisa':         { fn: tRiiulidLisa_, roll: ROLL.ADMIN, kirjutab: true },
  'riiulid.hulgi':        { fn: tRiiulidHulgi_, roll: ROLL.ADMIN, kirjutab: true },
  'riiulid.muuda':        { fn: tRiiulidMuuda_, roll: ROLL.ADMIN, kirjutab: true },
  'riiulid.arhiveeri':    { fn: tRiiulidArhiveeri_, roll: ROLL.ADMIN, kirjutab: true },

  // Etapp 3: liikumised (skännimine)
  'liikumised.lisa':      { fn: tLiikumisedLisa_, kirjutab: true, lukustatuleLubatud: true },

  // Etapp 4: konfliktid (ainult ADMIN)
  'konfliktid.nimekiri':  { fn: tKonfliktidNimekiri_, roll: ROLL.ADMIN },
  'konfliktid.lahenda':   { fn: tKonfliktidLahenda_, roll: ROLL.ADMIN, kirjutab: true },

  // Etapp 5: sildipõhjad (vaikimisi põhjad on esipaneelis, siin hoitakse enda tehtuid)
  'sildipohjad.nimekiri': { fn: tSildipohjadNimekiri_ },
  'sildipohjad.salvesta': { fn: tSildipohjadSalvesta_, roll: ROLL.ADMIN, kirjutab: true },
  'sildipohjad.kustuta':  { fn: tSildipohjadKustuta_, roll: ROLL.ADMIN, kirjutab: true },

  // Etapp 6: ajalugu
  'liikumised.nimekiri':  { fn: tLiikumisedNimekiri_ },

  // Etapp 8: Masinakulude sidumine (masinate nimekiri; väljastused loetakse liikumised.nimekiri kaudu)
  'masinad.salvesta':     { fn: tMasinadSalvesta_, roll: ROLL.ADMIN, kirjutab: true },

  // Saldode kontroll: Saldode leht vs liikumistest arvutatud seis
  'saldod.kontrolli':     { fn: tSaldodKontrolli_, roll: ROLL.ADMIN },
  'saldod.paranda':       { fn: tSaldodParanda_, roll: ROLL.ADMIN, kirjutab: true }
};

/**
 * Keskne päringu käsitleja: leiab tegevuse, kontrollib seanssi ja rolli,
 * võtab vajadusel luku ning püüab vead kinni.
 */
function kasitle_(paring) {
  var algus = Date.now();
  var lukk = null;
  try {
    var tegevus = TEGEVUSED[paring.action];
    if (!tegevus) throw new ApiViga_('Tundmatu tegevus: ' + paring.action, 'VALE_PARING');

    var kasutaja = null;
    if (!tegevus.avalik) {
      try {
        kasutaja = kontrolliSeanss_(paring.token);
      } catch (e) {
        // Lukustatud kasutaja telefon saadab ilma internetita tehtud liikumisi:
        // need võetakse vastu ainult konfliktidena (vt lukustatudKasutaja_).
        kasutaja = e.code === 'SEANSS_KEHTETU' && tegevus.lukustatuleLubatud ? lukustatudKasutaja_(paring.token) : null;
        if (!kasutaja) throw e;
      }
      if (tegevus.roll && kasutaja.roll !== tegevus.roll) {
        throw new ApiViga_('Sul pole selleks õigust.', 'POLE_OIGUST');
      }
    }

    // Lukk võetakse alles pärast seansi kontrolli ja ainult andmeid muutvatele tegevustele.
    // Luku all peab olema ka lugemine (nt saldo enne VÄLJA), muidu võiks kaks samaaegset
    // päringut lugeda sama vana saldo ja üks muudatus läheks kaotsi.
    if (tegevus.kirjutab) {
      lukk = LockService.getScriptLock();
      if (!lukk.tryLock(SEADED.LUKU_OOTEAEG_MS)) {
        throw new ApiViga_('Server on hõivatud, proovi uuesti.', 'HOIVATUD');
      }
    }

    var tulemus = tegevus.fn(paring.data || {}, kasutaja, paring);
    return { ok: true, data: tulemus === undefined ? null : tulemus, ms: Date.now() - algus };
  } catch (err) {
    if (err instanceof ApiViga_) {
      return { ok: false, error: err.message, code: err.code, ms: Date.now() - algus };
    }
    console.error(err && err.stack ? err.stack : err);
    return { ok: false, error: 'Serveri viga: ' + (err && err.message ? err.message : err), code: 'SERVERI_VIGA', ms: Date.now() - algus };
  } finally {
    if (lukk) {
      SpreadsheetApp.flush(); // kirjuta muudatused tabelisse enne luku vabastamist
      lukk.releaseLock();
    }
  }
}

/**
 * „Äratus”: esipaneel kutsub seda rakenduse avamisel taustal, et Apps Script oleks
 * skännimise ajaks juba käivitunud. Tabelit ei loeta, et vastus oleks võimalikult kiire.
 */
function tSoe_() {
  return { versioon: SEADED.VERSIOON };
}

/** Viga, mille tekst näidatakse kasutajale. */
function ApiViga_(teade, kood) {
  this.message = teade;
  this.code = kood || 'VIGA';
}

// ---------------------------------------------------------------------------
// TEGEVUSED: olek ja esmane seadistus
// ---------------------------------------------------------------------------

/** Tagastab API oleku: kas esimene admin on veel loomata. */
function tOlek_() {
  return {
    versioon: SEADED.VERSIOON,
    nouabSeadistust: loeLeht_('Kasutajad').length === 0,
    serveriAeg: new Date().toISOString()
  };
}

/**
 * Esimese admin-kasutaja loomine. Töötab ainult siis, kui ühtegi kasutajat
 * pole ja kaasa on antud õige seadistuskood (näidatakse funktsiooni
 * `seadista` käivitamisel). Nii ei saa keegi võõras API aadressi teades
 * endale admini teha.
 */
function tEsimeneAdmin_(data) {
  if (loeLeht_('Kasutajad').length > 0) {
    throw new ApiViga_('Esimene admin on juba loodud. Logi sisse.', 'JUBA_SEADISTATUD');
  }
  var props = PropertiesService.getScriptProperties();
  var oige = props.getProperty('SEADISTUSKOOD');
  if (!oige || String(data.seadistuskood || '').trim().toUpperCase() !== oige) {
    throw new ApiViga_('Vale seadistuskood. Käivita Apps Scriptis uuesti funktsioon "seadista".', 'VALE_KOOD');
  }
  var uus = looKasutaja_(data.kasutajanimi, data.nimi, ROLL.ADMIN, data.pin);
  props.deleteProperty('SEADISTUSKOOD');
  return looSeanss_(uus, data.seade);
}

// ---------------------------------------------------------------------------
// TEGEVUSED: sisse- ja väljalogimine
// ---------------------------------------------------------------------------

/**
 * Sisselogimine kasutajanime ja PIN-iga.
 * Vale PIN suurendab loendurit; MAX_VALE_PIN järjestikuse vea järel
 * lukustatakse kasutaja PIN_LUKK_MINUTIT minutiks.
 */
function tLogin_(data) {
  var nimi = normKasutajanimi_(data.kasutajanimi);
  var pin = String(data.pin || '');
  var rida = leiaRida_('Kasutajad', function (k) { return normKasutajanimi_(k.kasutajanimi) === nimi; });

  // Sama veateade tundmatu kasutaja ja vale PIN-i korral, et ei saaks kasutajanimesid ära arvata.
  var VALE = 'Vale kasutajanimi või PIN.';
  if (!rida) throw new ApiViga_(VALE, 'VALE_LOGIN');
  var k = rida.obj;

  if (!k.aktiivne) throw new ApiViga_('Kasutaja on lukustatud. Pöördu admini poole.', 'LUKUSTATUD');

  var nuud = new Date();
  if (k.lukus_kuni && k.lukus_kuni > nuud) {
    var min = Math.ceil((k.lukus_kuni - nuud) / 60000);
    throw new ApiViga_('Liiga palju valesid katseid. Proovi uuesti ' + min + ' min pärast.', 'AJUTINE_LUKK');
  }

  if (!kontrolliPin_(pin, k.pin_rasi_)) {
    var katseid = (Number(k.vale_katseid) || 0) + 1;
    var muutus = { vale_katseid: katseid };
    if (katseid >= SEADED.MAX_VALE_PIN) {
      muutus.vale_katseid = 0;
      muutus.lukus_kuni = new Date(nuud.getTime() + SEADED.PIN_LUKK_MINUTIT * 60000);
    }
    uuendaRida_('Kasutajad', rida.rida, muutus);
    if (muutus.lukus_kuni) {
      throw new ApiViga_('Liiga palju valesid katseid. Kasutaja on ' + SEADED.PIN_LUKK_MINUTIT + ' minutiks lukus.', 'AJUTINE_LUKK');
    }
    throw new ApiViga_(VALE + ' Katseid jäänud: ' + (SEADED.MAX_VALE_PIN - katseid) + '.', 'VALE_LOGIN');
  }

  // Õnnestus: nulli loendur ja kustuta aegunud seansid.
  if (k.vale_katseid || k.lukus_kuni) uuendaRida_('Kasutajad', rida.rida, { vale_katseid: 0, lukus_kuni: '' });
  kustutaAegunudSeansid_();
  return looSeanss_(k, data.seade);
}

/** Väljalogimine: kustutab selle seansi. */
function tLogout_(data, kasutaja, paring) {
  var rasi = rasiHex_(String(paring.token || ''));
  kustutaRead_('Seansid', function (s) { return s['võti'] === rasi; });
  CacheService.getScriptCache().remove('ses_' + rasi);
  return true;
}

/** Tagastab sisseloginud kasutaja andmed. */
function tMina_(data, kasutaja) {
  return kasutaja;
}

// ---------------------------------------------------------------------------
// TEGEVUSED: kasutajate haldus (ainult ADMIN)
// ---------------------------------------------------------------------------

function tKasutajadNimekiri_() {
  var nuud = new Date();
  return loeLeht_('Kasutajad').map(function (k) {
    return {
      id: k.id,
      kasutajanimi: k.kasutajanimi,
      nimi: k.nimi,
      roll: k.roll,
      aktiivne: k.aktiivne,
      loodud: isoAeg_(k.loodud),
      ajutiseltLukus: !!(k.lukus_kuni && k.lukus_kuni > nuud),
      seansse: loeLeht_('Seansid').filter(function (s) {
        return s.kasutaja_id === k.id && s.kehtib_kuni > nuud;
      }).length
    };
  });
}

function tKasutajadLisa_(data) {
  var k = looKasutaja_(data.kasutajanimi, data.nimi, data.roll, data.pin);
  return avalikKasutaja_(k);
}

/** Muudab nime ja/või rolli. Viimast aktiivset adminit ei saa tavakasutajaks teha. */
function tKasutajadMuuda_(data, admin) {
  var rida = leiaKasutajaRida_(data.id);
  var muutus = {};
  if (data.nimi !== undefined) {
    var nimi = String(data.nimi).trim();
    if (!nimi) throw new ApiViga_('Nimi on kohustuslik.', 'VALE_SISEND');
    muutus.nimi = nimi;
  }
  if (data.kasutajanimi !== undefined) {
    var kn = normKasutajanimi_(data.kasutajanimi);
    if (kn !== normKasutajanimi_(rida.obj.kasutajanimi)) {
      kontrolliKasutajanimi_(kn);
      muutus.kasutajanimi = kn;
    }
  }
  if (data.roll !== undefined) {
    kontrolliRoll_(data.roll);
    if (rida.obj.roll === ROLL.ADMIN && data.roll !== ROLL.ADMIN) kontrolliPoleViimaneAdmin_(rida.obj.id);
    muutus.roll = data.roll;
  }
  uuendaRida_('Kasutajad', rida.rida, muutus);
  tuhjendaKasutajaVahemalu_(rida.obj.id);
  return true;
}

/** Määrab kasutajale uue PIN-i ja eemaldab ajutise lukustuse. */
function tKasutajadLahtestaPin_(data) {
  var rida = leiaKasutajaRida_(data.id);
  kontrolliPinVorming_(data.pin);
  uuendaRida_('Kasutajad', rida.rida, { pin_räsi: looPinRasi_(String(data.pin)), vale_katseid: 0, lukus_kuni: '' });
  return true;
}

/**
 * Lukustab kasutaja: ta ei saa enam sisse logida ja KÕIK tema seansid
 * muutuvad kohe kehtetuks (nt kadunud telefoni puhul). Seansiread jäetakse
 * aegununa alles, et selle telefoni saatmata liikumised jõuaksid KONFLIKTIDE alla.
 */
function tKasutajadLukusta_(data, admin) {
  var rida = leiaKasutajaRida_(data.id);
  if (rida.obj.id === admin.id) throw new ApiViga_('Iseennast ei saa lukustada.', 'VALE_SISEND');
  if (rida.obj.roll === ROLL.ADMIN) kontrolliPoleViimaneAdmin_(rida.obj.id);
  uuendaRida_('Kasutajad', rida.rida, { aktiivne: false });
  tuhjendaKasutajaVahemalu_(rida.obj.id);
  var nuud = new Date();
  loeLehtRidadega_('Seansid').forEach(function (s) {
    if (s.obj.kasutaja_id === rida.obj.id && s.obj.kehtib_kuni > nuud) uuendaRida_('Seansid', s.rida, { kehtib_kuni: nuud });
  });
  return true;
}

/** Aktiveerib lukustatud kasutaja uuesti (ja eemaldab ajutise PIN-luku). */
function tKasutajadAktiveeri_(data) {
  var rida = leiaKasutajaRida_(data.id);
  uuendaRida_('Kasutajad', rida.rida, { aktiivne: true, vale_katseid: 0, lukus_kuni: '' });
  return true;
}

// ---------------------------------------------------------------------------
// KASUTAJATE ABIFUNKTSIOONID
// ---------------------------------------------------------------------------

/** Loob uue kasutaja (kontrollib sisendit ja kasutajanime unikaalsust). */
function looKasutaja_(kasutajanimi, nimi, roll, pin) {
  var kn = normKasutajanimi_(kasutajanimi);
  nimi = String(nimi || '').trim();
  kontrolliKasutajanimi_(kn);
  if (!nimi) throw new ApiViga_('Nimi on kohustuslik.', 'VALE_SISEND');
  kontrolliRoll_(roll);
  kontrolliPinVorming_(pin);
  var k = {
    id: 'K-' + Utilities.getUuid().slice(0, 8).toUpperCase(),
    kasutajanimi: kn,
    nimi: nimi,
    'pin_räsi': looPinRasi_(String(pin)),
    roll: roll,
    aktiivne: true,
    loodud: new Date(),
    vale_katseid: 0,
    lukus_kuni: ''
  };
  lisaRida_('Kasutajad', k);
  return k;
}

/** Kasutajanime vorming ja unikaalsus. */
function kontrolliKasutajanimi_(kn) {
  if (!/^[a-z0-9._-]{2,30}$/.test(kn)) {
    throw new ApiViga_('Kasutajanimi peab olema 2–30 märki: tähed a–z, numbrid, punkt, sidekriips või alakriips.', 'VALE_SISEND');
  }
  if (leiaRida_('Kasutajad', function (k) { return normKasutajanimi_(k.kasutajanimi) === kn; })) {
    throw new ApiViga_('Selline kasutajanimi on juba olemas.', 'DUPLIKAAT');
  }
}

function leiaKasutajaRida_(id) {
  var rida = leiaRida_('Kasutajad', function (k) { return k.id === id; });
  if (!rida) throw new ApiViga_('Kasutajat ei leitud.', 'EI_LEITUD');
  return rida;
}

function kontrolliRoll_(roll) {
  if (roll !== ROLL.ADMIN && roll !== ROLL.LAOTOOTAJA) throw new ApiViga_('Tundmatu roll.', 'VALE_SISEND');
}

function kontrolliPinVorming_(pin) {
  var re = new RegExp('^\\d{' + SEADED.PIN_MIN_PIKKUS + ',' + SEADED.PIN_MAX_PIKKUS + '}$');
  if (!re.test(String(pin || ''))) {
    throw new ApiViga_('PIN peab olema ' + SEADED.PIN_MIN_PIKKUS + '–' + SEADED.PIN_MAX_PIKKUS + ' numbrit.', 'VALE_SISEND');
  }
}

/** Kaitse: süsteemi peab alati jääma vähemalt üks aktiivne admin. */
function kontrolliPoleViimaneAdmin_(id) {
  var teisi = loeLeht_('Kasutajad').filter(function (k) {
    return k.roll === ROLL.ADMIN && k.aktiivne && k.id !== id;
  }).length;
  if (teisi === 0) throw new ApiViga_('See on viimane aktiivne admin – seda ei saa muuta ega lukustada.', 'VIIMANE_ADMIN');
}

function normKasutajanimi_(s) {
  return String(s || '').trim().toLowerCase();
}

/** Kasutaja andmed ilma PIN-räsita. */
function avalikKasutaja_(k) {
  return { id: k.id, kasutajanimi: k.kasutajanimi, nimi: k.nimi, roll: k.roll };
}

// ---------------------------------------------------------------------------
// PIN-ID JA RÄSID
// ---------------------------------------------------------------------------
// PIN-i ei salvestata kunagi avatekstina. Salvestatakse:
//   sool$kordusi$räsi
// kus räsi = SHA-256 korduvalt üle (pipar + sool + PIN).
// "Pipar" on salajane juhuslik väärtus skripti atribuutides (Script Properties),
// mitte tabelis – seega ainult tabeli lekkimisest PIN-ide murdmiseks ei piisa.

function looPinRasi_(pin) {
  var sool = Utilities.getUuid().replace(/-/g, '');
  return sool + '$' + SEADED.RASI_KORDUSI + '$' + arvutaPinRasi_(pin, sool, SEADED.RASI_KORDUSI);
}

function kontrolliPin_(pin, salvestatud) {
  var osad = String(salvestatud || '').split('$');
  if (osad.length !== 3) return false;
  return arvutaPinRasi_(pin, osad[0], Number(osad[1])) === osad[2];
}

function arvutaPinRasi_(pin, sool, kordusi) {
  var vaartus = piparTera_() + ':' + sool + ':' + pin;
  for (var i = 0; i < kordusi; i++) vaartus = rasiHex_(vaartus);
  return vaartus;
}

/** Skripti salajane "pipar" (luuakse esimesel kasutamisel). */
function piparTera_() {
  var props = PropertiesService.getScriptProperties();
  var p = props.getProperty('PIPAR');
  if (!p) {
    p = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('PIPAR', p);
  }
  return p;
}

/** SHA-256 räsi kuueteistkümnendsüsteemis. */
function rasiHex_(tekst) {
  var baidid = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, tekst, Utilities.Charset.UTF_8);
  return baidid.map(function (b) { return ((b + 256) % 256).toString(16).replace(/^(.)$/, '0$1'); }).join('');
}

// ---------------------------------------------------------------------------
// SEANSID
// ---------------------------------------------------------------------------
// Seansivõti on pikk juhuslik tekst, mis jääb telefoni. Tabelisse salvestatakse
// ainult võtme räsi. Kiiruse huvides hoitakse kontrollitud seanssi 10 min
// vahemälus (CacheService); kasutaja lukustamisel vahemälu tühjendatakse.

function looSeanss_(k, seade) {
  var token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  var nuud = new Date();
  var kuni = new Date(nuud.getTime() + SEADED.SEANSI_KEHTIVUS_PAEVI * 86400000);
  lisaRida_('Seansid', {
    'võti': rasiHex_(token),
    kasutaja_id: k.id,
    loodud: nuud,
    kehtib_kuni: kuni,
    seade: String(seade || '').slice(0, 200)
  });
  return { token: token, kehtibKuni: kuni.toISOString(), kasutaja: avalikKasutaja_(k) };
}

/**
 * Kontrollib seansivõtit. Tagastab kasutaja { id, kasutajanimi, nimi, roll }
 * või viskab vea SEANSS_KEHTETU (siis peab esipaneel uuesti sisse logima).
 */
function kontrolliSeanss_(token) {
  if (!token) throw new ApiViga_('Logi sisse.', 'SEANSS_KEHTETU');
  var rasi = rasiHex_(String(token));
  var cache = CacheService.getScriptCache();
  var vahemalus = cache.get('ses_' + rasi);
  if (vahemalus) {
    var v = JSON.parse(vahemalus);
    if (new Date(v.kehtibKuni) > new Date()) return v.kasutaja;
  }

  var ses = leiaRida_('Seansid', function (s) { return s['võti'] === rasi; });
  if (!ses || !(ses.obj.kehtib_kuni > new Date())) {
    throw new ApiViga_('Seanss on aegunud. Logi uuesti sisse.', 'SEANSS_KEHTETU');
  }
  var k = leiaRida_('Kasutajad', function (x) { return x.id === ses.obj.kasutaja_id; });
  if (!k || !k.obj.aktiivne) {
    throw new ApiViga_('Kasutaja on lukustatud. Pöördu admini poole.', 'SEANSS_KEHTETU');
  }
  var kasutaja = avalikKasutaja_(k.obj);
  cache.put('ses_' + rasi, JSON.stringify({ kasutaja: kasutaja, kehtibKuni: isoAeg_(ses.obj.kehtib_kuni) }),
    SEADED.VAHEMALU_SEKUNDIT);
  return kasutaja;
}

/** Eemaldab vahemälust kõik selle kasutaja seansid (nt rolli muutmisel või lukustamisel). */
function tuhjendaKasutajaVahemalu_(kasutajaId) {
  var votmed = loeLeht_('Seansid')
    .filter(function (s) { return s.kasutaja_id === kasutajaId; })
    .map(function (s) { return 'ses_' + s['võti']; });
  if (votmed.length) CacheService.getScriptCache().removeAll(votmed);
}

/** Kustutab seansiread, mis aegusid üle SEANSI_SAILITAMINE_PAEVI päeva tagasi. */
function kustutaAegunudSeansid_() {
  var piir = new Date(Date.now() - SEADED.SEANSI_SAILITAMINE_PAEVI * 86400000);
  kustutaRead_('Seansid', function (s) { return !(s.kehtib_kuni > piir); });
}

/**
 * Kui seansivõti kuulub LUKUSTATUD kasutajale, tagastab kasutaja märgisega
 * lukustatud: true (muidu null). Nii saab telefon ilma internetita tehtud
 * liikumised siiski ära saata – need salvestatakse konfliktidena ega lähe
 * saldosse enne, kui admin need kinnitab.
 */
function lukustatudKasutaja_(token) {
  if (!token) return null;
  var rasi = rasiHex_(String(token));
  var ses = leiaRida_('Seansid', function (s) { return s['võti'] === rasi; });
  if (!ses) return null;
  var k = leiaRida_('Kasutajad', function (x) { return x.id === ses.obj.kasutaja_id; });
  if (!k || k.obj.aktiivne) return null;
  var kasutaja = avalikKasutaja_(k.obj);
  kasutaja.lukustatud = true;
  return kasutaja;
}

// ---------------------------------------------------------------------------
// TABELI ABIFUNKTSIOONID
// ---------------------------------------------------------------------------
// Kõik lehe lugemised/kirjutamised käivad nende kaudu. Read loetakse objektideks,
// mille võtmed on päise nimed (nt k.kasutajanimi). Veergu "pin_räsi" on mugavam
// koodis kasutada kujul k.pin_rasi_ – see lisatakse automaatselt.

function leht_(nimi) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nimi);
  if (!sh) throw new ApiViga_('Leht "' + nimi + '" puudub. Käivita Apps Scriptis funktsioon "seadista".', 'SEADISTAMATA');
  return sh;
}

/** Päise veerunimi → veeru indeks (0-põhine). */
function paiseKaart_(sh) {
  var paise = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var kaart = {};
  paise.forEach(function (n, i) { if (n !== '') kaart[String(n).trim()] = i; });
  return kaart;
}

/** Loeb lehe kõik read objektide massiivina. */
function loeLeht_(nimi) {
  return loeLehtRidadega_(nimi).map(function (r) { return r.obj; });
}

/** Nagu loeLeht_, aga iga kirje juures on ka rea number tabelis ({rida, obj}). */
function loeLehtRidadega_(nimi) {
  var sh = leht_(nimi);
  var viimane = sh.getLastRow();
  if (viimane < 2) return [];
  var kaart = paiseKaart_(sh);
  var tyybid = veeruTyybid_(nimi);
  var vaartused = sh.getRange(2, 1, viimane - 1, sh.getLastColumn()).getValues();
  var tulemus = [];
  for (var i = 0; i < vaartused.length; i++) {
    var rida = vaartused[i];
    if (rida.join('') === '') continue; // tühi rida
    var obj = {};
    for (var veerg in kaart) obj[veerg] = teisendaLoetud_(rida[kaart[veerg]], tyybid[veerg]);
    if ('pin_räsi' in obj) obj.pin_rasi_ = obj['pin_räsi'];
    tulemus.push({ rida: i + 2, obj: obj });
  }
  return tulemus;
}

/** Leiab esimese tingimusele vastava rea ({rida, obj}) või null. */
function leiaRida_(nimi, tingimus) {
  var read = loeLehtRidadega_(nimi);
  for (var i = 0; i < read.length; i++) if (tingimus(read[i].obj)) return read[i];
  return null;
}

/** Lisab lehe lõppu uue rea. */
function lisaRida_(nimi, obj) {
  var sh = leht_(nimi);
  var kaart = paiseKaart_(sh);
  var tyybid = veeruTyybid_(nimi);
  var rida = [];
  for (var i = 0; i < sh.getLastColumn(); i++) rida.push('');
  for (var veerg in kaart) {
    if (veerg in obj) rida[kaart[veerg]] = teisendaKirjutatav_(obj[veerg], tyybid[veerg]);
  }
  sh.appendRow(rida);
}

/** Lisab lehe lõppu korraga mitu rida (palju kiirem kui ükshaaval). */
function lisaRead_(nimi, objektid) {
  if (!objektid.length) return;
  var sh = leht_(nimi);
  var kaart = paiseKaart_(sh);
  var tyybid = veeruTyybid_(nimi);
  var veerge = sh.getLastColumn();
  var read = objektid.map(function (obj) {
    var rida = [];
    for (var i = 0; i < veerge; i++) rida.push('');
    for (var veerg in kaart) {
      if (veerg in obj) rida[kaart[veerg]] = teisendaKirjutatav_(obj[veerg], tyybid[veerg]);
    }
    return rida;
  });
  sh.getRange(sh.getLastRow() + 1, 1, read.length, veerge).setValues(read);
}

/** Muudab olemasoleva rea etteantud veerge. */
function uuendaRida_(nimi, reaNr, muutus) {
  var sh = leht_(nimi);
  var kaart = paiseKaart_(sh);
  var tyybid = veeruTyybid_(nimi);
  for (var veerg in muutus) {
    if (!(veerg in kaart)) continue;
    sh.getRange(reaNr, kaart[veerg] + 1).setValue(teisendaKirjutatav_(muutus[veerg], tyybid[veerg]));
  }
}

/** Kirjutab terve rea ühe päringuga (kõik lehe veerud; puuduvad väljad jäävad tühjaks). */
function kirjutaRida_(nimi, reaNr, obj) {
  var sh = leht_(nimi);
  var kaart = paiseKaart_(sh);
  var tyybid = veeruTyybid_(nimi);
  var rida = [];
  for (var i = 0; i < sh.getLastColumn(); i++) rida.push('');
  for (var veerg in kaart) {
    if (veerg in obj) rida[kaart[veerg]] = teisendaKirjutatav_(obj[veerg], tyybid[veerg]);
  }
  sh.getRange(reaNr, 1, 1, rida.length).setValues([rida]);
}

/** Ühe veeru väärtused (ilma päiseta). Indeks i vastab tabeli reale i + 2. */
function loeVeerg_(nimi, veerg) {
  var sh = leht_(nimi);
  var viimane = sh.getLastRow();
  if (viimane < 2) return [];
  var kaart = paiseKaart_(sh);
  if (!(veerg in kaart)) throw new ApiViga_('Lehel "' + nimi + '" puudub veerg "' + veerg + '".', 'SEADISTAMATA');
  var tyyp = veeruTyybid_(nimi)[veerg];
  return sh.getRange(2, kaart[veerg] + 1, viimane - 1, 1).getValues().map(function (r) { return teisendaLoetud_(r[0], tyyp); });
}

/** Loeb read alates reast „algus” (kuni lehe lõpuni või „arv” rida) objektidena (obj._rida = rea number). */
function loeReadAlates_(nimi, algus, arv) {
  var sh = leht_(nimi);
  var viimane = sh.getLastRow();
  algus = Math.max(2, algus);
  if (arv) viimane = Math.min(viimane, algus + arv - 1);
  if (viimane < algus) return [];
  var kaart = paiseKaart_(sh);
  var tyybid = veeruTyybid_(nimi);
  var vaartused = sh.getRange(algus, 1, viimane - algus + 1, sh.getLastColumn()).getValues();
  var tulemus = [];
  for (var i = 0; i < vaartused.length; i++) {
    if (vaartused[i].join('') === '') continue;
    var obj = { _rida: algus + i };
    for (var veerg in kaart) obj[veerg] = teisendaLoetud_(vaartused[i][kaart[veerg]], tyybid[veerg]);
    tulemus.push(obj);
  }
  return tulemus;
}

/** Kustutab kõik tingimusele vastavad read (alt üles, et reanumbrid ei nihkuks). */
function kustutaRead_(nimi, tingimus) {
  var sh = leht_(nimi);
  var read = loeLehtRidadega_(nimi).filter(function (r) { return tingimus(r.obj); });
  for (var i = read.length - 1; i >= 0; i--) sh.deleteRow(read[i].rida);
  return read.length;
}

function veeruTyybid_(nimi) {
  var t = {};
  (SKEEM[nimi] || []).forEach(function (v) { t[v[0]] = v[1]; });
  return t;
}

/** Tabelist loetud väärtus → JavaScripti väärtus vastavalt veeru tüübile. */
function teisendaLoetud_(v, tyyp) {
  if (tyyp === 'b') return v === true || String(v).toLowerCase() === 'jah' || String(v).toUpperCase() === 'TRUE';
  if (tyyp === 'n') return v === '' ? '' : Number(v);
  if (tyyp === 'd') {
    if (v instanceof Date) return v;
    if (v === '' || v === null) return '';
    var d = new Date(v);
    return isNaN(d.getTime()) ? '' : d;
  }
  return v === null || v === undefined ? '' : String(v);
}

/** JavaScripti väärtus → tabelisse kirjutatav väärtus. */
function teisendaKirjutatav_(v, tyyp) {
  if (tyyp === 'b') return v ? 'jah' : 'ei';
  if (tyyp === 'd') return v ? (v instanceof Date ? v : new Date(v)) : '';
  if (tyyp === 'n') return v === '' || v === null || v === undefined ? '' : Number(v);
  var s = v === null || v === undefined ? '' : String(v);
  // Kaitse valemite eest: "=..." vms tekst salvestatakse tekstina, mitte valemina.
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function isoAeg_(d) {
  return d instanceof Date ? d.toISOString() : (d || '');
}

// ---------------------------------------------------------------------------
// TEGEVUS: ANDMED (toodete, riiulite, saldode ja olekute nimekiri)
// ---------------------------------------------------------------------------

/**
 * Tagastab kõik tooted (koos koodide, saldo ja olekuga) ning riiulid.
 * Esipaneel hoiab seda vahemälus, et skännimisel oleks nimetus ja saldo
 * kohe näha. Arhiveeritud tooted ja riiulid on samuti kaasas (märgisega).
 */
function tAndmed_(data, kasutaja) {
  var koodid = {};
  loeLeht_('Koodid').forEach(function (k) {
    (koodid[k.toote_id] = koodid[k.toote_id] || []).push({ kood: k.kood, tyyp: k['koodi_tüüp'] });
  });
  var seis = loeSaldod_().seis; // kogu Liikumiste lehte ei loeta
  var tooted = loeLeht_('Tooted').map(function (t) {
    var s = seis[t.id] || {};
    return {
      id: t.id,
      nimetus: t.nimetus,
      tyyp: t['tüüp'],
      yhik: t['ühik'],
      kategooria: t.kategooria,
      riiul_id: t.riiul_id,
      miinimumkogus: t.miinimumkogus === '' ? null : t.miinimumkogus,
      arhiveeritud: t.arhiveeritud,
      loodud: isoAeg_(t.loodud),
      koodid: koodid[t.id] || [],
      saldo: t['tüüp'] === TYYP.VARUOSA ? (s.saldo || 0) : null,
      olek: t['tüüp'] === TYYP.TOORIIST ? (s.olek || 'LAOS') : null,
      kellele: s.kellele || '',
      alates: s.alates ? isoAeg_(s.alates) : ''
    };
  });
  var riiulid = loeLeht_('Riiulid').map(function (r) {
    return { id: r.id, kood: r.kood, nimetus: r.nimetus, tsoon: r.tsoon, arhiveeritud: r.arhiveeritud };
  });
  // Lahendamata konfliktid: adminile arv, kasutajale tema enda omad (telefonis teateks)
  var nimed = {};
  tooted.forEach(function (t) { nimed[t.id] = t.nimetus; });
  var viimased = viimasedLiikumised_();
  var lahtised = lahendamataKonfliktid_(viimased.read);
  var minu = lahtised.filter(function (l) { return l.kasutaja_id === kasutaja.id; })
    .slice(-SEADED.MAX_MINU_KONFLIKTE).reverse()
    .map(function (l) {
      return { id: l.id, tyyp: l['tüüp'], nimetus: nimed[l.toote_id] || '', kogus: l.kogus,
        pohjus: l['konflikti_põhjus'], aeg: isoAeg_(l['skännimise_aeg']) };
    });
  return {
    tooted: tooted,
    riiulid: riiulid,
    masinad: aktiivsedMasinad_(),
    kelleleSoovitused: kelleleSoovitused_(viimased.read.slice(-SEADED.SOOVITUSTE_RIDU)),
    minuKonfliktid: minu,
    konfliktideArv: kasutaja.roll === ROLL.ADMIN ? lahtised.length : null,
    serveriAeg: new Date().toISOString()
  };
}

/**
 * Liikumiste lehe lõpp: viimased SOOVITUSTE_RIDU rida ning kõik read alates vanimast
 * lahendamata konfliktist (et konflikti hilisem TÜHISTUS oleks kindlasti kaasas).
 * Konfliktid leitakse kahe kitsa veeru (konflikt, lahendatud) järgi – kogu lehte ei loeta.
 */
function viimasedLiikumised_() {
  var konflikt = loeVeerg_('Liikumised', 'konflikt');
  var lahendatud = loeVeerg_('Liikumised', 'lahendatud');
  var algus = Math.max(2, konflikt.length + 2 - SEADED.SOOVITUSTE_RIDU);
  for (var i = 0; i < konflikt.length; i++) {
    if (konflikt[i] && !lahendatud[i]) { algus = Math.min(algus, i + 2); break; }
  }
  return { read: loeReadAlates_('Liikumised', algus) };
}

/** Viimati kasutatud „kellele/kuhu” väärtused (uuemad eespool), väljaandmise vormi soovitusteks. */
function kelleleSoovitused_(liikumised) {
  var nahtud = {}, tulemus = [];
  for (var i = liikumised.length - 1; i >= 0 && tulemus.length < 100; i--) {
    var l = liikumised[i];
    if (l['tüüp'] !== 'VÄLJA_ANTUD' || !l.kellele_kuhu) continue;
    var v = String(l.kellele_kuhu).trim();
    if (!nahtud[v.toLowerCase()]) { nahtud[v.toLowerCase()] = true; tulemus.push(v); }
  }
  return tulemus;
}

/**
 * Arvutab iga toote seisu liikumistest skännimise aja järjekorras.
 * Varuosa: saldo = SISSE − VÄLJA ± KORRIGEERIMINE (KORRIGEERIMISE kogus on vahe, võib olla negatiivne).
 * Tööriist: VÄLJA_ANTUD → "VÄLJA ANTUD", TAGASTATUD → "LAOS",
 *           OLEKU_MUUTUS → uus olek on veerus kellele_kuhu (LAOS / REMONDIS / KADUNUD).
 * Tühistatud liikumised jäetakse arvestusest välja (TÜHISTUS-liikumise kellele_kuhu = tühistatava id).
 * Konfliktiks märgitud liikumised LÄHEVAD arvesse (need juhtusid päriselt) – admin saab need tühistada.
 * Erand: lukustatud kasutaja liikumised lähevad arvesse alles siis, kui admin need kinnitab.
 * Tagastab { toote_id: { saldo, olek, kellele, alates } }.
 */
function arvutaSeis_() {
  return arvutaSeisListist_(loeLeht_('Liikumised'));
}

/** Nagu arvutaSeis_, aga etteantud liikumiste nimekirjast (et lehte ei peaks mitu korda lugema). */
function arvutaSeisListist_(koikLiikumised) {
  var liikumised = koikLiikumised.filter(lahebArvesse_); // uus massiiv – algse järjekord ei muutu
  var tyhistatud = {};
  liikumised.forEach(function (l) {
    // TÜHISTUS-liikumise "kellele_kuhu" veerus on tühistatava liikumise id
    if (l['tüüp'] === 'TÜHISTUS') tyhistatud[l.kellele_kuhu] = true;
  });
  liikumised.sort(function (a, b) { return (a['skännimise_aeg'] || 0) - (b['skännimise_aeg'] || 0); });
  var seis = {};
  liikumised.forEach(function (l) {
    if (tyhistatud[l.id] || l['tüüp'] === 'TÜHISTUS') return;
    var s = seis[l.toote_id] = seis[l.toote_id] || { saldo: 0, olek: 'LAOS', kellele: '', alates: '' };
    var kogus = Number(l.kogus) || 0;
    switch (l['tüüp']) {
      case 'SISSE': s.saldo += kogus; break;
      case 'VÄLJA': s.saldo -= kogus; break;
      case 'KORRIGEERIMINE': s.saldo += kogus; break;
      case 'VÄLJA_ANTUD': s.olek = 'VÄLJA ANTUD'; s.kellele = l.kellele_kuhu; s.alates = l['skännimise_aeg']; break;
      case 'TAGASTATUD': s.olek = 'LAOS'; s.kellele = ''; s.alates = ''; break;
      case 'OLEKU_MUUTUS':
        s.olek = l.kellele_kuhu || 'LAOS'; s.kellele = ''; s.alates = s.olek === 'LAOS' ? '' : l['skännimise_aeg']; break;
    }
    s.saldo = Math.round(s.saldo * 1000) / 1000; // väldi ujukomavigu (0.1 + 0.2)
  });
  return seis;
}

// ---------------------------------------------------------------------------
// SALDOD-LEHT
// ---------------------------------------------------------------------------
// Leht Saldod hoiab iga toote praegust seisu (saldo / olek / kellel / alates).
// Liikumise salvestamisel uuendatakse ainult puudutatud toodete ridu. Harvad
// toimingud (tühistamine, konflikti lahendamine, lukustatud kasutaja liikumised)
// arvutavad seisu kõigist liikumistest ja kirjutavad tulemuse samuti siia.
// Kui lehte pole (vana tabel), luuakse see automaatselt ja täidetakse liikumiste põhjal.
// Admin saab lehte kontrollida ja parandada (tegevused saldod.kontrolli / saldod.paranda).

/** Saldode leht; puudumisel luuakse ja täidetakse. */
function saldodLeht_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Saldod');
  if (!sh) {
    seadistaLeht_(ss, 'Saldod');
    ehitaSaldod_();
    sh = ss.getSheetByName('Saldod');
  }
  return sh;
}

/** Loeb Saldode lehe: { seis: { toote_id: {saldo, olek, kellele, alates} }, read: { toote_id: rea nr } } */
function loeSaldod_() {
  saldodLeht_();
  var seis = {}, read = {};
  loeLehtRidadega_('Saldod').forEach(function (r) {
    var o = r.obj;
    if (!o.toote_id) return;
    seis[o.toote_id] = { saldo: Number(o.saldo) || 0, olek: o.olek || 'LAOS', kellele: o.kellele || '', alates: o.alates || '' };
    read[o.toote_id] = r.rida;
  });
  return { seis: seis, read: read };
}

/**
 * Kirjutab etteantud toodete seisu Saldode lehele: olemasolev rida kirjutatakse
 * üle (üks päring rea kohta), uued read lisatakse lõppu ühe päringuga.
 * read = loeSaldod_().read (kui juba loetud), muidu loetakse.
 */
function kirjutaSaldod_(seis, tooteIdd, read) {
  if (!tooteIdd.length) return;
  read = read || loeSaldod_().read;
  var sh = leht_('Saldod');
  var kaart = paiseKaart_(sh), tyybid = veeruTyybid_('Saldod'), veerge = sh.getLastColumn();
  var nuud = new Date(), olemas = {}, uued = [];
  function massiiviks(tid) {
    var s = seis[tid] || { saldo: 0, olek: 'LAOS', kellele: '', alates: '' };
    var obj = { toote_id: tid, saldo: ymarda_(s.saldo || 0), olek: s.olek || 'LAOS', kellele: s.kellele || '',
      alates: s.alates || '', viimati_muudetud: nuud };
    var rida = [];
    for (var i = 0; i < veerge; i++) rida.push('');
    for (var v in kaart) if (v in obj) rida[kaart[v]] = teisendaKirjutatav_(obj[v], tyybid[v]);
    return rida;
  }
  tooteIdd.forEach(function (tid) {
    if (read[tid]) olemas[read[tid]] = massiiviks(tid);
    else uued.push(massiiviks(tid));
  });
  var reaNrid = Object.keys(olemas).map(Number).sort(function (a, b) { return a - b; });
  if (reaNrid.length <= 3) {
    // Üks-kaks toodet (tavaline skännimine): iga rida eraldi
    reaNrid.forEach(function (nr) { sh.getRange(nr, 1, 1, veerge).setValues([olemas[nr]]); });
  } else if (reaNrid.length) {
    // Palju tooteid: loe vahemik, asenda muutunud read ja kirjuta ühe päringuga tagasi
    var algus = reaNrid[0], arv = reaNrid[reaNrid.length - 1] - algus + 1;
    var plokk = sh.getRange(algus, 1, arv, veerge).getValues();
    reaNrid.forEach(function (nr) { plokk[nr - algus] = olemas[nr]; });
    sh.getRange(algus, 1, arv, veerge).setValues(plokk);
  }
  if (uued.length) {
    var esimene = sh.getLastRow() + 1;
    sh.getRange(esimene, 1, uued.length, veerge).setValues(uued);
    uued.forEach(function (r, i) { read[r[kaart.toote_id]] = esimene + i; }); // järgmine kirjutus samas päringus leiab rea
  }
}

/** Arvutab kõigi toodete seisu liikumistest ja kirjutab Saldode lehe üle. Tagastab ridade arvu. */
function ehitaSaldod_() {
  var seis = arvutaSeis_();
  var sh = leht_('Saldod');
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  var nuud = new Date();
  var read = loeLeht_('Tooted').map(function (t) {
    var s = seis[t.id] || { saldo: 0, olek: 'LAOS', kellele: '', alates: '' };
    return { toote_id: t.id, saldo: s.saldo, olek: s.olek, kellele: s.kellele, alates: s.alates, viimati_muudetud: nuud };
  });
  if (read.length) {
    var kaart = paiseKaart_(sh), tyybid = veeruTyybid_('Saldod'), veerge = sh.getLastColumn();
    sh.getRange(2, 1, read.length, veerge).setValues(read.map(function (obj) {
      var rida = [];
      for (var i = 0; i < veerge; i++) rida.push('');
      for (var v in kaart) if (v in obj) rida[kaart[v]] = teisendaKirjutatav_(obj[v], tyybid[v]);
      return rida;
    }));
  }
  return read.length;
}

/** Võrdleb Saldode lehte liikumistest arvutatud seisuga (ainult loeb). */
function tSaldodKontrolli_() {
  var arvutatud = arvutaSeis_();
  var leht = loeSaldod_().seis;
  var erinevused = [];
  var tooted = loeLeht_('Tooted');
  tooted.forEach(function (t) {
    var a = arvutatud[t.id] || { saldo: 0, olek: 'LAOS', kellele: '' };
    var l = leht[t.id] || { saldo: 0, olek: 'LAOS', kellele: '' }; // rida puudub = liikumisteta toode
    var tooriist = t['tüüp'] === TYYP.TOORIIST;
    var sama = (tooriist ? (a.olek === l.olek && String(a.kellele || '') === String(l.kellele || ''))
                              : ymarda_(a.saldo) === ymarda_(l.saldo));
    if (!sama) {
      erinevused.push({
        id: t.id, nimetus: t.nimetus, tyyp: t['tüüp'],
        lehel: tooriist ? l.olek + (l.kellele ? ' (' + l.kellele + ')' : '') : String(ymarda_(l.saldo)),
        arvutatud: tooriist ? a.olek + (a.kellele ? ' (' + a.kellele + ')' : '') : String(ymarda_(a.saldo))
      });
    }
  });
  return { kontrollitud: tooted.length, erinevused: erinevused };
}

/** Kirjutab Saldode lehe liikumiste põhjal uuesti. */
function tSaldodParanda_() {
  saldodLeht_();
  return { ridu: ehitaSaldod_() };
}

// ---------------------------------------------------------------------------
// TEGEVUSED: TOOTED
// ---------------------------------------------------------------------------

/**
 * Uue toote lisamine (admin või laotöötaja kiirlisamisel).
 * data: { nimetus, tyyp, yhik, kategooria, riiul_id, miinimumkogus,
 *         kood, koodiTyyp, lisaSisekood, eksemplare, algsaldo, id }
 *  - kood tühi → genereeritakse sisekood (V-00001 / T-00001)
 *  - kood olemas ja lisaSisekood → lisatakse ka sisekood
 *  - tööriista eksemplare > 1 → luuakse mitu toodet, igaühel oma T-kood
 *  - algsaldo (ainult admin, varuosa) → lisatakse KORRIGEERIMINE-liikumine
 * Tagastab loodud toodete massiivi.
 *
 * Ilma internetita lisatud toode (data.vorguta = true, id loodud telefonis):
 *  - sama id juba olemas (telefon saatis uuesti) → tagastatakse olemasolev, duplikaat: true
 *  - kood on vahepeal teisel tootel (kaks telefoni lisasid sama asja) → uut toodet
 *    ei looda, tagastatakse olemasolev toode märgisega yhendatud: true. Telefon seob
 *    oma liikumised selle tootega ja need märgitakse adminile konfliktiks.
 */
function tTootedLisa_(data, kasutaja) {
  if (kasutaja.lukustatud && !data.vorguta) throw new ApiViga_('Kasutaja on lukustatud. Pöördu admini poole.', 'SEANSS_KEHTETU');
  var ctx = looKontekst_();
  if (data.id && ctx.tooted[data.id]) return [tooteKokkuvote_(ctx, data.id, { duplikaat: true })];
  var kood = String(data.kood || '').trim();
  var omanik = data.vorguta && kood ? ctx.koodiOmanik(kood) : null;
  if (omanik && omanik.toode) return [tooteKokkuvote_(ctx, omanik.toode, { yhendatud: true })];
  var tulemus = lisaToode_(ctx, data, kasutaja);
  ctx.salvesta();
  return tulemus;
}

/** Olemasoleva toote andmed samas kujus nagu lisaToode_ tagastab (+ lisaväljad). */
function tooteKokkuvote_(ctx, id, lisa) {
  var t = ctx.tooted[id];
  var tulemus = {
    id: id, nimetus: t.nimetus, tyyp: t['tüüp'],
    koodid: loeLeht_('Koodid').filter(function (k) { return k.toote_id === id; })
      .map(function (k) { return { kood: k.kood, tyyp: k['koodi_tüüp'] }; })
  };
  for (var v in lisa) tulemus[v] = lisa[v];
  return tulemus;
}

/** Muudab toote andmeid. Tüüpi saab muuta ainult siis, kui tootel pole liikumisi. */
function tTootedMuuda_(data) {
  var rida = leiaTooteRida_(data.id);
  var muutus = {};
  if (data.nimetus !== undefined) muutus.nimetus = kohustuslik_(data.nimetus, 'Nimetus');
  if (data.tyyp !== undefined && data.tyyp !== rida.obj['tüüp']) {
    kontrolliTyyp_(data.tyyp);
    var onLiikumisi = loeLeht_('Liikumised').some(function (l) { return l.toote_id === data.id; });
    if (onLiikumisi) throw new ApiViga_('Tootel on juba liikumisi – tüüpi ei saa muuta.', 'VALE_SISEND');
    muutus['tüüp'] = data.tyyp;
  }
  if (data.yhik !== undefined) muutus['ühik'] = kontrolliYhik_(data.yhik);
  if (data.kategooria !== undefined) muutus.kategooria = String(data.kategooria || '').trim();
  if (data.riiul_id !== undefined) muutus.riiul_id = kontrolliRiiulId_(data.riiul_id);
  if (data.miinimumkogus !== undefined) muutus.miinimumkogus = kontrolliMiinimum_(data.miinimumkogus);
  uuendaRida_('Tooted', rida.rida, muutus);
  return true;
}

/** Arhiveerib toote (või taastab arhiivist). Kustutamist pole – ajalugu jääb alles. */
function tTootedArhiveeri_(data) {
  var rida = leiaTooteRida_(data.id);
  uuendaRida_('Tooted', rida.rida, { arhiveeritud: data.arhiveeritud !== false });
  return true;
}

/**
 * CSV-import. data.read = [{ nimetus, kood, tyyp, yhik, kategooria, riiul, algsaldo }]
 * data.looRiiulid = true → puuduvad riiulid luuakse automaatselt.
 * Iga rida kontrollitakse eraldi; vigased read jäetakse vahele ja nende viga
 * tagastatakse. Tagastab { lisatud, vigu, tulemused: [{ rida, ok, viga, koodid }] }.
 */
function tTootedImport_(data, kasutaja) {
  var read = data.read || [];
  if (read.length > SEADED.MAX_IMPORDI_RIDU) {
    throw new ApiViga_('Korraga saab importida kuni ' + SEADED.MAX_IMPORDI_RIDU + ' rida.', 'VALE_SISEND');
  }
  var ctx = looKontekst_();
  var tulemused = [];
  read.forEach(function (r, i) {
    var reaNr = r.reaNr || i + 1;
    try {
      var tyyp = tuvastaTyypTekstist_(r.tyyp);
      var riiulId = '';
      if (String(r.riiul || '').trim()) riiulId = leiaVoiLooRiiul_(ctx, r.riiul, data.looRiiulid);
      var loodud = lisaToode_(ctx, {
        nimetus: r.nimetus,
        tyyp: tyyp,
        yhik: r.yhik || 'tk',
        kategooria: r.kategooria,
        riiul_id: riiulId,
        kood: r.kood,
        algsaldo: tyyp === TYYP.VARUOSA ? r.algsaldo : '',
        algsaldoMarkus: 'Algsaldo (import)'
      }, kasutaja);
      tulemused.push({ rida: reaNr, ok: true, koodid: loodud[0].koodid.map(function (k) { return k.kood; }) });
    } catch (err) {
      if (!(err instanceof ApiViga_)) throw err;
      tulemused.push({ rida: reaNr, ok: false, viga: err.message });
    }
  });
  ctx.salvesta();
  var lisatud = tulemused.filter(function (t) { return t.ok; }).length;
  return { lisatud: lisatud, vigu: tulemused.length - lisatud, tulemused: tulemused };
}

// ---------------------------------------------------------------------------
// TEGEVUSED: KOODID
// ---------------------------------------------------------------------------

/**
 * Lisab tootele koodi. Kui kood on tühi, genereeritakse sisekood
 * (nt kui tootja kood on halvasti loetav ja soovid oma sildi).
 */
function tKoodidLisa_(data) {
  var ctx = looKontekst_();
  var toode = ctx.tooted[data.toote_id];
  if (!toode) throw new ApiViga_('Toodet ei leitud.', 'EI_LEITUD');
  var uus = lisaKood_(ctx, toode.id, toode['tüüp'], data.kood, data.koodiTyyp);
  ctx.salvesta();
  return uus;
}

/** Eemaldab koodi. Toote viimast koodi eemaldada ei saa. */
function tKoodidEemalda_(data) {
  var n = normKood_(data.kood);
  var rida = leiaRida_('Koodid', function (k) { return normKood_(k.kood) === n; });
  if (!rida) throw new ApiViga_('Koodi ei leitud.', 'EI_LEITUD');
  var sama = loeLeht_('Koodid').filter(function (k) { return k.toote_id === rida.obj.toote_id; }).length;
  if (sama <= 1) throw new ApiViga_('See on toote ainus kood – seda ei saa eemaldada.', 'VALE_SISEND');
  leht_('Koodid').deleteRow(rida.rida);
  return true;
}

// ---------------------------------------------------------------------------
// TEGEVUSED: RIIULID
// ---------------------------------------------------------------------------

/** Ühe riiuli lisamine. Kood on kohustuslik; "R-" lisatakse ette, kui see puudub. */
function tRiiulidLisa_(data) {
  var ctx = looKontekst_();
  var r = lisaRiiul_(ctx, data.kood, data.nimetus, data.tsoon);
  ctx.salvesta();
  return r;
}

/**
 * Riiulite hulgilisamine. Näide: eesliide "A", alates 1, kuni 10, kohti 2,
 * korrusAlates 1, korrusKuni 5 → R-A01-01 … R-A10-05 (50 riiulit).
 * Korrused võib tühjaks jätta → R-A01 … R-A10.
 * Juba olemasolevad koodid jäetakse vahele.
 */
function tRiiulidHulgi_(data) {
  var eesliide = String(data.eesliide || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{0,5}$/.test(eesliide)) throw new ApiViga_('Eesliide võib olla kuni 5 tähte/numbrit (nt A).', 'VALE_SISEND');
  var alates = taisarv_(data.alates, 'Riiuli algusnumber');
  var kuni = taisarv_(data.kuni, 'Riiuli lõpunumber');
  var kohti = data.kohti ? taisarv_(data.kohti, 'Numbri pikkus') : 2;
  var onKorrused = data.korrusAlates !== '' && data.korrusAlates !== undefined && data.korrusAlates !== null;
  var kA = onKorrused ? taisarv_(data.korrusAlates, 'Korruse algus') : 0;
  var kK = onKorrused ? taisarv_(data.korrusKuni, 'Korruse lõpp') : 0;
  if (kuni < alates || kK < kA) throw new ApiViga_('Lõpp peab olema suurem kui algus.', 'VALE_SISEND');
  var kokku = (kuni - alates + 1) * (onKorrused ? kK - kA + 1 : 1);
  if (kokku > SEADED.MAX_HULGI_RIIULEID) {
    throw new ApiViga_('Korraga saab luua kuni ' + SEADED.MAX_HULGI_RIIULEID + ' riiulit (praegu ' + kokku + ').', 'VALE_SISEND');
  }

  var ctx = looKontekst_();
  var loodud = [], vahele = [];
  for (var n = alates; n <= kuni; n++) {
    var riiul = eesliide + taida_(n, kohti);
    for (var k = kA; k <= (onKorrused ? kK : kA); k++) {
      var korrus = taida_(k, SEADED.KORRUSE_NUMBRI_KOHTI);
      var kood = (onKorrused ? SEADED.RIIULI_VORMING : SEADED.RIIULI_VORMING_ILMA_KORRUSETA)
        .replace('{riiul}', riiul).replace('{korrus}', korrus);
      if (ctx.koodiOmanik(kood)) { vahele.push(kood); continue; }
      var nimetus = 'Riiul ' + riiul + (onKorrused ? ', korrus ' + korrus : '');
      loodud.push(lisaRiiul_(ctx, kood, nimetus, data.tsoon).kood);
    }
  }
  ctx.salvesta();
  return { loodud: loodud, vahele: vahele };
}

function tRiiulidMuuda_(data) {
  var rida = leiaRida_('Riiulid', function (r) { return r.id === data.id; });
  if (!rida) throw new ApiViga_('Riiulit ei leitud.', 'EI_LEITUD');
  var muutus = {};
  if (data.kood !== undefined) {
    var kood = normRiiuliKood_(data.kood);
    if (normKood_(kood) !== normKood_(rida.obj.kood)) {
      var ctx = looKontekst_();
      if (ctx.koodiOmanik(kood)) throw new ApiViga_('Kood ' + kood + ' on juba kasutusel.', 'DUPLIKAAT');
      muutus.kood = kood;
    }
  }
  if (data.nimetus !== undefined) muutus.nimetus = String(data.nimetus || '').trim();
  if (data.tsoon !== undefined) muutus.tsoon = String(data.tsoon || '').trim();
  uuendaRida_('Riiulid', rida.rida, muutus);
  return true;
}

function tRiiulidArhiveeri_(data) {
  var rida = leiaRida_('Riiulid', function (r) { return r.id === data.id; });
  if (!rida) throw new ApiViga_('Riiulit ei leitud.', 'EI_LEITUD');
  uuendaRida_('Riiulid', rida.rida, { arhiveeritud: data.arhiveeritud !== false });
  return true;
}

// ---------------------------------------------------------------------------
// TOODETE, KOODIDE JA RIIULITE ABIFUNKTSIOONID
// ---------------------------------------------------------------------------

/**
 * "Kontekst" loeb tooted, koodid, riiulid ja loendurid ühe korra mällu,
 * kogub uued read kokku ja kirjutab need lõpus (salvesta) korraga tabelisse.
 * Nii on ka suur import kiire (Apps Scriptis on iga tabelipöördumine aeglane).
 */
function looKontekst_() {
  var ctx = {
    tooted: {}, koodid: {}, riiulid: {}, riiulidKoodiJargi: {},
    uuedTooted: [], uuedKoodid: [], uuedRiiulid: [], uuedLiikumised: [],
    loendurid: {}, loenduriRead: {}
  };
  loeLeht_('Tooted').forEach(function (t) { ctx.tooted[t.id] = t; });
  loeLeht_('Koodid').forEach(function (k) { ctx.koodid[normKood_(k.kood)] = k.toote_id; });
  loeLeht_('Riiulid').forEach(function (r) { ctx.riiulid[r.id] = r; ctx.riiulidKoodiJargi[normKood_(r.kood)] = r.id; });
  loeLehtRidadega_('Loendurid').forEach(function (l) {
    ctx.loendurid[l.obj['tüüp']] = Number(l.obj['järgmine']) || 1;
    ctx.loenduriRead[l.obj['tüüp']] = l.rida;
  });

  /** Kellele kood kuulub: { toode: id } / { riiul: id } / null */
  ctx.koodiOmanik = function (kood) {
    var n = normKood_(kood);
    if (ctx.koodid[n]) return { toode: ctx.koodid[n] };
    if (ctx.riiulidKoodiJargi[n]) return { riiul: ctx.riiulidKoodiJargi[n] };
    return null;
  };

  /** Järgmine vaba number loendurist (nt VARUOSA → 1, 2, 3 …) */
  ctx.jargmine = function (tyyp) {
    var n = ctx.loendurid[tyyp] || 1;
    ctx.loendurid[tyyp] = n + 1;
    ctx.loenduridMuutunud = true;
    return n;
  };

  /** Kirjutab kõik kogutud muudatused tabelisse. */
  ctx.salvesta = function () {
    lisaRead_('Riiulid', ctx.uuedRiiulid);
    lisaRead_('Tooted', ctx.uuedTooted);
    lisaRead_('Koodid', ctx.uuedKoodid);
    lisaRead_('Liikumised', ctx.uuedLiikumised);
    // Algsaldo: uue toote seis tuleb ainult tema enda (just lisatud) liikumistest
    if (ctx.uuedLiikumised.length) {
      var uusSeis = arvutaSeisListist_(ctx.uuedLiikumised);
      kirjutaSaldod_(uusSeis, Object.keys(uusSeis));
    }
    if (ctx.loenduridMuutunud) {
      Object.keys(ctx.loendurid).forEach(function (t) {
        if (ctx.loenduriRead[t]) uuendaRida_('Loendurid', ctx.loenduriRead[t], { 'järgmine': ctx.loendurid[t] });
        else lisaRida_('Loendurid', { 'tüüp': t, 'järgmine': ctx.loendurid[t] });
      });
    }
    ctx.uuedRiiulid = []; ctx.uuedTooted = []; ctx.uuedKoodid = []; ctx.uuedLiikumised = [];
  };
  return ctx;
}

/** Toote lisamise sisu (kasutavad tooted.lisa ja import). Tagastab loodud toodete massiivi. */
function lisaToode_(ctx, data, kasutaja) {
  var nimetus = kohustuslik_(data.nimetus, 'Nimetus');
  var tyyp = data.tyyp || TYYP.VARUOSA;
  kontrolliTyyp_(tyyp);
  var yhik = tyyp === TYYP.TOORIIST ? 'tk' : kontrolliYhik_(data.yhik || 'tk');
  var riiulId = data.riiul_id ? String(data.riiul_id) : '';
  if (riiulId && !ctx.riiulid[riiulId]) throw new ApiViga_('Valitud riiulit ei leitud.', 'VALE_SISEND');
  var miinimum = tyyp === TYYP.VARUOSA ? kontrolliMiinimum_(data.miinimumkogus) : '';
  var eksemplare = tyyp === TYYP.TOORIIST && data.eksemplare ? taisarv_(data.eksemplare, 'Eksemplaride arv') : 1;
  if (eksemplare < 1 || eksemplare > 100) throw new ApiViga_('Eksemplaride arv peab olema 1–100.', 'VALE_SISEND');
  var kood = String(data.kood || '').trim();
  if (kood && eksemplare > 1) {
    throw new ApiViga_('Mitme eksemplari korral saab iga eksemplar oma T-koodi. Tootja koodi saab lisada ühe eksemplari kaardil.', 'VALE_SISEND');
  }
  if (kood && ctx.koodiOmanik(kood)) throw new ApiViga_('Kood ' + kood + ' on juba kasutusel.', 'DUPLIKAAT');

  var algsaldo = '';
  if (data.algsaldo !== undefined && data.algsaldo !== null && String(data.algsaldo).trim() !== '') {
    if (kasutaja && kasutaja.roll !== ROLL.ADMIN) throw new ApiViga_('Algsaldot saab määrata ainult admin.', 'POLE_OIGUST');
    algsaldo = arv_(data.algsaldo, 'Algsaldo');
  }

  var loodud = [];
  for (var i = 1; i <= eksemplare; i++) {
    var id = (i === 1 && data.id && /^[A-Za-z0-9-]{8,40}$/.test(data.id) && !ctx.tooted[data.id])
      ? data.id : 'P-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase();
    var toode = {
      id: id,
      nimetus: eksemplare > 1 ? nimetus + ' #' + i : nimetus,
      'tüüp': tyyp,
      'ühik': yhik,
      kategooria: String(data.kategooria || '').trim(),
      riiul_id: riiulId,
      miinimumkogus: miinimum,
      arhiveeritud: false,
      loodud: new Date()
    };
    ctx.tooted[id] = toode;
    ctx.uuedTooted.push(toode);

    var koodid = [];
    if (kood) koodid.push(lisaKood_(ctx, id, tyyp, kood, data.koodiTyyp));
    if (!kood || data.lisaSisekood) koodid.push(lisaKood_(ctx, id, tyyp, '', 'SISEKOOD'));

    if (algsaldo !== '' && algsaldo !== 0) {
      var nuud = new Date();
      ctx.uuedLiikumised.push({
        id: Utilities.getUuid(), toote_id: id, 'tüüp': 'KORRIGEERIMINE', kogus: algsaldo,
        kellele_kuhu: '', 'märkus': data.algsaldoMarkus || 'Algsaldo', kasutaja_id: kasutaja ? kasutaja.id : '',
        'skännimise_aeg': nuud, 'serverisse_jõudmise_aeg': nuud, konflikt: false, konflikti_põhjus: '', lahendatud: false
      });
    }
    loodud.push({ id: id, nimetus: toode.nimetus, tyyp: tyyp, koodid: koodid });
  }
  return loodud;
}

/**
 * Lisab koodi tootele (kontekstis). Tühi kood → genereeritakse sisekood
 * vastavalt toote tüübile (V-00001 varuosale, T-00001 tööriistale).
 */
function lisaKood_(ctx, tooteId, tooteTyyp, kood, koodiTyyp) {
  kood = String(kood || '').trim();
  if (!kood) {
    var loendur = tooteTyyp === TYYP.TOORIIST ? 'TÖÖRIIST' : 'VARUOSA';
    var eesliide = tooteTyyp === TYYP.TOORIIST ? 'T-' : 'V-';
    do { kood = eesliide + taida_(ctx.jargmine(loendur), SEADED.SISEKOODI_NUMBRI_KOHTI); } while (ctx.koodiOmanik(kood));
    koodiTyyp = 'SISEKOOD';
  } else {
    if (/\s/.test(kood)) throw new ApiViga_('Kood ei tohi sisaldada tühikuid.', 'VALE_SISEND');
    if (ctx.koodiOmanik(kood)) throw new ApiViga_('Kood ' + kood + ' on juba kasutusel.', 'DUPLIKAAT');
    if (!koodiTyyp) koodiTyyp = tuvastaKoodiTyyp_(kood);
    if (KOODI_TYYBID.indexOf(koodiTyyp) < 0) throw new ApiViga_('Tundmatu koodi tüüp: ' + koodiTyyp, 'VALE_SISEND');
  }
  ctx.koodid[normKood_(kood)] = tooteId;
  ctx.uuedKoodid.push({ kood: kood, toote_id: tooteId, 'koodi_tüüp': koodiTyyp });
  return { kood: kood, tyyp: koodiTyyp };
}

/** Lisab riiuli (kontekstis). */
function lisaRiiul_(ctx, kood, nimetus, tsoon) {
  kood = normRiiuliKood_(kood);
  if (ctx.koodiOmanik(kood)) throw new ApiViga_('Kood ' + kood + ' on juba kasutusel.', 'DUPLIKAAT');
  var r = {
    id: 'R' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase(),
    kood: kood,
    nimetus: String(nimetus || '').trim(),
    tsoon: String(tsoon || '').trim(),
    arhiveeritud: false
  };
  ctx.riiulid[r.id] = r;
  ctx.riiulidKoodiJargi[normKood_(kood)] = r.id;
  ctx.uuedRiiulid.push(r);
  return r;
}

/** Impordi jaoks: leiab riiuli koodi järgi (R- eesliitega või ilma) või loob uue. */
function leiaVoiLooRiiul_(ctx, tekst, looPuuduv) {
  var kood = normRiiuliKood_(tekst);
  var id = ctx.riiulidKoodiJargi[normKood_(kood)];
  if (id) return id;
  if (!looPuuduv) throw new ApiViga_('Riiulit ' + kood + ' ei leitud.', 'VALE_SISEND');
  return lisaRiiul_(ctx, kood, '', '').id;
}

/** Riiulikood suurtähtedega ja "R-" eesliitega (A01-03 → R-A01-03). */
function normRiiuliKood_(kood) {
  var k = String(kood || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!k) throw new ApiViga_('Riiuli kood on kohustuslik.', 'VALE_SISEND');
  if (!/^[A-Z0-9-]+$/.test(k)) throw new ApiViga_('Riiuli koodis tohib olla ainult tähti A–Z, numbreid ja sidekriipse.', 'VALE_SISEND');
  return k.indexOf('R-') === 0 ? k : 'R-' + k;
}

/** Koodide võrdlemiseks: tühikud eemaldatud, suurtähed. */
function normKood_(kood) {
  return String(kood || '').trim().toUpperCase();
}

/**
 * Tuvastab koodi tüübi: kontrollnumbriga EAN-13 / EAN-8 / UPC-A,
 * meie sisekoodid (V-, T-, R-), muu → CODE128.
 */
function tuvastaKoodiTyyp_(kood) {
  var k = String(kood).trim();
  if (/^[VTR]-[A-Z0-9-]+$/i.test(k)) return 'SISEKOOD';
  if (/^\d{13}$/.test(k) && eanKontrollOk_(k)) return 'EAN13';
  if (/^\d{12}$/.test(k) && eanKontrollOk_(k)) return 'UPC';
  if (/^\d{8}$/.test(k) && eanKontrollOk_(k)) return 'EAN8';
  return 'CODE128';
}

/** EAN/UPC kontrollnumbri kontroll (viimane number). */
function eanKontrollOk_(numbrid) {
  var summa = 0;
  var andmed = numbrid.slice(0, -1);
  for (var i = 0; i < andmed.length; i++) {
    var kaal = (andmed.length - i) % 2 === 1 ? 3 : 1; // paremalt esimene kaaluga 3
    summa += Number(andmed[i]) * kaal;
  }
  return (10 - (summa % 10)) % 10 === Number(numbrid.slice(-1));
}

/** "varuosa" / "V" / "tööriist" / "T" / "TOORIIST" → TYYP väärtus (impordi jaoks). */
function tuvastaTyypTekstist_(tekst) {
  var t = String(tekst || '').trim().toUpperCase();
  if (!t || t === 'V' || t === 'VARUOSA') return TYYP.VARUOSA;
  if (t === 'T' || t === 'TÖÖRIIST' || t === 'TOORIIST' || t === 'TÖÖRIISTAD') return TYYP.TOORIIST;
  throw new ApiViga_('Tundmatu tüüp "' + tekst + '" (lubatud: varuosa, tööriist).', 'VALE_SISEND');
}

function leiaTooteRida_(id) {
  var rida = leiaRida_('Tooted', function (t) { return t.id === id; });
  if (!rida) throw new ApiViga_('Toodet ei leitud.', 'EI_LEITUD');
  return rida;
}

function kontrolliTyyp_(t) {
  if (t !== TYYP.VARUOSA && t !== TYYP.TOORIIST) throw new ApiViga_('Tüüp peab olema VARUOSA või TÖÖRIIST.', 'VALE_SISEND');
}

function kontrolliYhik_(y) {
  var v = String(y || '').trim().toLowerCase();
  if (YHIKUD.indexOf(v) < 0) throw new ApiViga_('Ühik peab olema üks järgmistest: ' + YHIKUD.join(', ') + '.', 'VALE_SISEND');
  return v;
}

function kontrolliRiiulId_(id) {
  if (!id) return '';
  if (!leiaRida_('Riiulid', function (r) { return r.id === id; })) throw new ApiViga_('Riiulit ei leitud.', 'VALE_SISEND');
  return id;
}

function kontrolliMiinimum_(v) {
  if (v === undefined || v === null || String(v).trim() === '') return '';
  var n = arv_(v, 'Miinimumkogus');
  if (n < 0) throw new ApiViga_('Miinimumkogus ei saa olla negatiivne.', 'VALE_SISEND');
  return n;
}

function kohustuslik_(v, nimi) {
  var s = String(v === undefined || v === null ? '' : v).trim();
  if (!s) throw new ApiViga_(nimi + ' on kohustuslik.', 'VALE_SISEND');
  return s;
}

/** Arv tekstist (lubab ka koma: "2,5"). */
function arv_(v, nimi) {
  var n = Number(String(v).trim().replace(',', '.'));
  if (!isFinite(n)) throw new ApiViga_(nimi + ' peab olema arv.', 'VALE_SISEND');
  return n;
}

function taisarv_(v, nimi) {
  var n = arv_(v, nimi);
  if (Math.floor(n) !== n || n < 0) throw new ApiViga_(nimi + ' peab olema positiivne täisarv.', 'VALE_SISEND');
  return n;
}

/** Täidab numbri eest nullidega: taida_(7, 3) → "007" */
function taida_(n, kohti) {
  var s = String(n);
  while (s.length < kohti) s = '0' + s;
  return s;
}

// ---------------------------------------------------------------------------
// TEGEVUS: LIIKUMISED (skännimine telefonis või arvutis)
// ---------------------------------------------------------------------------
// Iga liikumine tuleb esipaneelilt oma unikaalse id-ga (UUID, loodud telefonis).
// Kui sama id-ga liikumine on juba salvestatud, seda teist korda ei lisata –
// nii ei teki topeltkirjeid, kui telefon saadab sama liikumise uuesti.
//
// Liikumise tüübid:
//   SISSE, VÄLJA          – varuosa kogus (positiivne arv)
//   KORRIGEERIMINE        – inventuur (ainult admin): tegelikKogus → server arvutab vahe
//   VÄLJA_ANTUD           – tööriist välja; kellele_kuhu kohustuslik
//   TAGASTATUD            – tööriist tagasi lattu
//   OLEKU_MUUTUS          – tööriist REMONDIS / KADUNUD / LAOS (ainult admin)
//   ÜMBERPAIGUTUS         – toode uuele riiulile; kellele_kuhu = riiuli id
//   TÜHISTUS              – tühistab liikumise "viide" (oma viimase; admin mis tahes)
//
// Konflikt: liikumine salvestatakse, aga märgitakse adminile ülevaatamiseks, kui
//   - varuosa saldo läheks negatiivseks
//   - välja antakse tööriist, mis on juba välja antud (või remondis/kadunud)
//   - tagastatakse tööriist, mis on juba laos
//   - toode on arhiveeritud

var LIIKUMISE_TYYBID = ['SISSE', 'VÄLJA', 'KORRIGEERIMINE', 'VÄLJA_ANTUD', 'TAGASTATUD', 'OLEKU_MUUTUS', 'ÜMBERPAIGUTUS', 'TÜHISTUS'];
var AINULT_ADMIN_TYYBID = ['KORRIGEERIMINE', 'OLEKU_MUUTUS'];
var TOORIISTA_OLEKUD = ['LAOS', 'REMONDIS', 'KADUNUD'];

/**
 * data.liikumised = [{ id, toote_id, tyyp, kogus, kellele_kuhu, markus, skannimise_aeg, viide,
 *                      tegelikKogus, lisaKonflikt }]
 * lisaKonflikt: telefoni lisatud konflikti põhjus (nt toode lisati kahest telefonist).
 * Tagastab { tulemused: [{ id, ok, konflikt, pohjus, viga, duplikaat }], tooted: [uuendatud seisud],
 *            kasutajaLukustatud }
 */
function tLiikumisedLisa_(data, kasutaja) {
  var sisend = data.liikumised || [];
  if (!sisend.length) return { tulemused: [], tooted: [] };
  if (sisend.length > SEADED.MAX_LIIKUMISI_PARINGUS) {
    throw new ApiViga_('Korraga kuni ' + SEADED.MAX_LIIKUMISI_PARINGUS + ' liikumist.', 'VALE_SISEND');
  }
  // Tavaline liikumine: kiire kontekst (saldod Saldode lehelt, liikumistest ainult id-veerg).
  // Tühistamine ja lukustatud kasutaja vajavad kogu ajalugu – siis loetakse kõik liikumised.
  var koguAjalugu = kasutaja.lukustatud || sisend.some(function (l) { return l && l.tyyp === 'TÜHISTUS'; });
  var ctx = koguAjalugu ? looLiikumisteKontekst_(kasutaja) : looKiireKontekst_(kasutaja);
  var tulemused = sisend.map(function (l) {
    try {
      return tootleLiikumine_(ctx, l || {});
    } catch (err) {
      if (!(err instanceof ApiViga_)) throw err;
      return { id: l && l.id, ok: false, viga: err.message };
    }
  });
  salvestaLiikumisteKontekst_(ctx);
  return { tulemused: tulemused, tooted: seisudVastuseks_(ctx), kasutajaLukustatud: !!kasutaja.lukustatud };
}

/** Loeb liikumised, tooted ja riiulid mällu liikumiste töötlemiseks. */
function looLiikumisteKontekst_(kasutaja) {
  var ctx = {
    kasutaja: kasutaja,
    koik: loeLehtRidadega_('Liikumised').map(function (r) { r.obj._rida = r.rida; return r.obj; }),
    ids: {},
    tooted: {},
    riiulid: {},
    uued: [],
    riiuliMuutused: {},   // toote_id → uus riiul_id
    puudutatud: {}        // toote_id → true
  };
  ctx.koik.forEach(function (l) { ctx.ids[l.id] = l; });
  loeLehtRidadega_('Tooted').forEach(function (r) { ctx.tooted[r.obj.id] = r; });
  loeLeht_('Riiulid').forEach(function (r) { ctx.riiulid[r.id] = r; });
  ctx.seis = arvutaSeisListist_(ctx.koik);
  return ctx;
}

/**
 * Kiire kontekst tavaliste liikumiste jaoks: seis tuleb Saldode lehelt ja liikumistest
 * loetakse ainult id-veerg (topeltsaatmise kontroll). Kogu Liikumiste lehte ei loeta.
 */
function looKiireKontekst_(kasutaja) {
  var saldod = loeSaldod_();
  var ctx = {
    kasutaja: kasutaja,
    koik: [],             // kiires kontekstis ainult selle päringu uued liikumised
    ids: {},
    idRida: {},           // olemasoleva liikumise id → rea number
    tooted: {},
    riiulid: {},
    uued: [],
    riiuliMuutused: {},
    puudutatud: {},
    seis: saldod.seis,
    saldoRead: saldod.read
  };
  loeVeerg_('Liikumised', 'id').forEach(function (id, i) { if (id) ctx.idRida[id] = i + 2; });
  loeLehtRidadega_('Tooted').forEach(function (r) { ctx.tooted[r.obj.id] = r; });
  loeLeht_('Riiulid').forEach(function (r) { ctx.riiulid[r.id] = r; });
  /** Varem salvestatud liikumine (topeltsaatmisel) – loetakse ainult see üks rida. */
  ctx.loeVana = function (id) {
    var rida = ctx.idRida[id];
    return rida ? loeReadAlates_('Liikumised', rida, 1)[0] || null : null;
  };
  return ctx;
}

/** Kirjutab kontekstis kogutud uued liikumised, riiulimuutused ja puudutatud toodete saldod tabelisse. */
function salvestaLiikumisteKontekst_(ctx) {
  lisaRead_('Liikumised', ctx.uued); // kõik uued liikumised ühe setValues-päringuga
  Object.keys(ctx.riiuliMuutused).forEach(function (tid) {
    uuendaRida_('Tooted', ctx.tooted[tid].rida, { riiul_id: ctx.riiuliMuutused[tid] });
  });
  kirjutaSaldod_(ctx.seis, Object.keys(ctx.puudutatud), ctx.saldoRead);
  ctx.uued = [];
}

/** Puudutatud toodete uued seisud vastuseks (telefon uuendab nendega oma nimekirja). */
function seisudVastuseks_(ctx) {
  return Object.keys(ctx.puudutatud).map(function (tid) {
    var s = ctx.seis[tid] || { saldo: 0, olek: 'LAOS', kellele: '', alates: '' };
    var t = ctx.tooted[tid].obj;
    return {
      id: tid,
      saldo: t['tüüp'] === TYYP.VARUOSA ? s.saldo : null,
      olek: t['tüüp'] === TYYP.TOORIIST ? s.olek : null,
      kellele: s.kellele || '',
      alates: s.alates ? isoAeg_(s.alates) : '',
      riiul_id: ctx.riiuliMuutused[tid] !== undefined ? ctx.riiuliMuutused[tid] : t.riiul_id
    };
  });
}

/** Kontrollib ja salvestab (kontekstis) ühe liikumise. */
function tootleLiikumine_(ctx, l) {
  var id = String(l.id || '');
  if (!/^[A-Za-z0-9-]{8,60}$/.test(id)) throw new ApiViga_('Liikumisel puudub korrektne id.', 'VALE_SISEND');

  // Juba salvestatud (nt telefon saatis uuesti) → ei lisa teist korda
  var vana = ctx.ids[id] || (ctx.loeVana ? ctx.loeVana(id) : null);
  if (vana) {
    return { id: id, ok: true, duplikaat: true, konflikt: !!vana.konflikt, pohjus: vana.konflikti_põhjus || '' };
  }

  var tyyp = String(l.tyyp || '');
  if (LIIKUMISE_TYYBID.indexOf(tyyp) < 0) throw new ApiViga_('Tundmatu liikumise tüüp: ' + tyyp, 'VALE_SISEND');
  if (AINULT_ADMIN_TYYBID.indexOf(tyyp) >= 0 && ctx.kasutaja.roll !== ROLL.ADMIN) {
    throw new ApiViga_('Selle toimingu saab teha ainult admin.', 'POLE_OIGUST');
  }

  // Aeg = skännimise hetk telefonis. Vigase või tulevikus oleva aja korral serveri aeg.
  var nuud = new Date();
  var aeg = l.skannimise_aeg ? new Date(l.skannimise_aeg) : nuud;
  if (isNaN(aeg.getTime()) || aeg.getTime() > nuud.getTime() + 10 * 60000) aeg = nuud;

  var kirje = {
    id: id, toote_id: '', 'tüüp': tyyp, kogus: 0, kellele_kuhu: '',
    'märkus': String(l.markus || '').trim().slice(0, 500),
    kasutaja_id: ctx.kasutaja.id,
    'skännimise_aeg': aeg, 'serverisse_jõudmise_aeg': nuud,
    konflikt: false, 'konflikti_põhjus': '', lahendatud: false
  };
  var konfliktid = [];
  // Lukustatud kasutaja liikumine: salvestatakse, kuid läheb arvesse alles admini kinnitusel
  if (ctx.kasutaja.lukustatud) konfliktid.push(LUKUSTATUD_POHJUS);
  if (l.lisaKonflikt) konfliktid.push(String(l.lisaKonflikt).replace(/[\[\]]/g, '').slice(0, 300));

  if (tyyp === 'TÜHISTUS') {
    tootleTyhistus_(ctx, l, kirje);
  } else {
    var tRida = ctx.tooted[l.toote_id];
    if (!tRida) throw new ApiViga_('Toodet ei leitud.', 'EI_LEITUD');
    var toode = tRida.obj;
    kirje.toote_id = toode.id;
    var tooriist = toode['tüüp'] === TYYP.TOORIIST;
    var s = ctx.seis[toode.id] = ctx.seis[toode.id] || { saldo: 0, olek: 'LAOS', kellele: '', alates: '' };
    if (toode.arhiveeritud) konfliktid.push('Toode on arhiveeritud');

    if (['SISSE', 'VÄLJA', 'KORRIGEERIMINE'].indexOf(tyyp) >= 0 && tooriist) {
      throw new ApiViga_('See on tööriist – kasuta tööriista väljaandmist/tagastamist.', 'VALE_SISEND');
    }
    if (['VÄLJA_ANTUD', 'TAGASTATUD', 'OLEKU_MUUTUS'].indexOf(tyyp) >= 0 && !tooriist) {
      throw new ApiViga_('See on varuosa, mitte tööriist.', 'VALE_SISEND');
    }

    switch (tyyp) {
      case 'SISSE':
        kirje.kogus = positiivneKogus_(l.kogus);
        s.saldo += kirje.kogus;
        break;
      case 'VÄLJA':
        kirje.kogus = positiivneKogus_(l.kogus);
        kirje.kellele_kuhu = String(l.kellele_kuhu || '').trim().slice(0, 200); // masin (Masinakulude jaoks)
        if (s.saldo - kirje.kogus < 0) konfliktid.push('Saldo läheks negatiivseks (' + ymarda_(s.saldo - kirje.kogus) + ')');
        s.saldo -= kirje.kogus;
        break;
      case 'KORRIGEERIMINE':
        // Inventuur: tegelik kogus → liikumiseks salvestatakse vahe
        if (l.tegelikKogus !== undefined && l.tegelikKogus !== null && l.tegelikKogus !== '') {
          var tegelik = arv_(l.tegelikKogus, 'Tegelik kogus');
          if (tegelik < 0) throw new ApiViga_('Tegelik kogus ei saa olla negatiivne.', 'VALE_SISEND');
          kirje.kogus = ymarda_(tegelik - s.saldo);
          kirje['märkus'] = ('Inventuur: tegelik ' + tegelik + ', oli ' + s.saldo + '. ' + kirje['märkus']).trim();
        } else {
          kirje.kogus = arv_(l.kogus, 'Kogus');
        }
        s.saldo += kirje.kogus;
        break;
      case 'VÄLJA_ANTUD':
        kirje.kogus = 1;
        kirje.kellele_kuhu = kohustuslik_(l.kellele_kuhu, 'Kellele/kuhu').slice(0, 200);
        if (s.olek === 'VÄLJA ANTUD') konfliktid.push('Tööriist oli juba välja antud: ' + s.kellele);
        else if (s.olek !== 'LAOS') konfliktid.push('Tööriist oli olekus ' + s.olek);
        s.olek = 'VÄLJA ANTUD'; s.kellele = kirje.kellele_kuhu; s.alates = aeg;
        break;
      case 'TAGASTATUD':
        kirje.kogus = 1;
        if (s.olek === 'LAOS') konfliktid.push('Tööriist oli juba laos');
        s.olek = 'LAOS'; s.kellele = ''; s.alates = '';
        break;
      case 'OLEKU_MUUTUS':
        var uus = String(l.kellele_kuhu || '').toUpperCase();
        if (TOORIISTA_OLEKUD.indexOf(uus) < 0) throw new ApiViga_('Olek peab olema LAOS, REMONDIS või KADUNUD.', 'VALE_SISEND');
        kirje.kellele_kuhu = uus;
        s.olek = uus; s.kellele = ''; s.alates = uus === 'LAOS' ? '' : aeg;
        break;
      case 'ÜMBERPAIGUTUS':
        var riiul = ctx.riiulid[l.kellele_kuhu];
        if (!riiul) throw new ApiViga_('Riiulit ei leitud.', 'EI_LEITUD');
        if (riiul.arhiveeritud) throw new ApiViga_('Riiul ' + riiul.kood + ' on arhiveeritud.', 'VALE_SISEND');
        var vanaRiiul = ctx.riiulid[ctx.riiuliMuutused[toode.id] || toode.riiul_id];
        kirje.kellele_kuhu = riiul.id;
        if (!kirje['märkus']) kirje['märkus'] = (vanaRiiul ? vanaRiiul.kood : '(riiulita)') + ' → ' + riiul.kood;
        if (!ctx.kasutaja.lukustatud) ctx.riiuliMuutused[toode.id] = riiul.id; // lukustatul alles kinnitamisel
        break;
    }
    s.saldo = ymarda_(s.saldo);
    ctx.puudutatud[toode.id] = true;
  }

  if (konfliktid.length) {
    kirje.konflikt = true;
    kirje['konflikti_põhjus'] = konfliktid.join('; ');
  }
  ctx.ids[id] = kirje;
  ctx.koik.push(kirje);
  ctx.uued.push(kirje);
  // Lukustatud kasutaja liikumine seisu ei muuda – arvuta seis uuesti ilma selleta
  if (ctx.kasutaja.lukustatud) ctx.seis = arvutaSeisListist_(ctx.koik);
  return { id: id, ok: true, konflikt: kirje.konflikt, pohjus: kirje['konflikti_põhjus'] };
}

/**
 * Tühistamine: lisab TÜHISTUS-liikumise (ajalugu ei kustutata).
 * Laotöötaja saab tühistada ainult oma viimase liikumise, admin mis tahes liikumise.
 */
function tootleTyhistus_(ctx, l, kirje) {
  var viide = ctx.ids[l.viide];
  if (!viide) throw new ApiViga_('Tühistatavat liikumist ei leitud.', 'EI_LEITUD');
  if (viide['tüüp'] === 'TÜHISTUS') throw new ApiViga_('Tühistust ei saa tühistada.', 'VALE_SISEND');
  if (viide['tüüp'] === 'ÜMBERPAIGUTUS') throw new ApiViga_('Ümberpaigutust ei saa tühistada – paiguta toode uuesti õigele riiulile.', 'VALE_SISEND');
  var tyhistatud = {};
  ctx.koik.forEach(function (x) { if (x['tüüp'] === 'TÜHISTUS' && lahebArvesse_(x)) tyhistatud[x.kellele_kuhu] = true; });
  if (tyhistatud[viide.id]) throw new ApiViga_('See liikumine on juba tühistatud.', 'VALE_SISEND');

  if (ctx.kasutaja.roll !== ROLL.ADMIN) {
    if (viide.kasutaja_id !== ctx.kasutaja.id) throw new ApiViga_('Saad tühistada ainult oma liikumisi.', 'POLE_OIGUST');
    var viimane = null;
    for (var i = ctx.koik.length - 1; i >= 0; i--) {
      var x = ctx.koik[i];
      if (x.kasutaja_id === ctx.kasutaja.id && x['tüüp'] !== 'TÜHISTUS' && !tyhistatud[x.id]) { viimane = x; break; }
    }
    if (!viimane || viimane.id !== viide.id) throw new ApiViga_('Saad tühistada ainult oma viimase liikumise.', 'POLE_OIGUST');
  }

  kirje.toote_id = viide.toote_id;
  kirje.kellele_kuhu = viide.id;
  kirje.kogus = viide.kogus;
  if (!kirje['märkus']) kirje['märkus'] = 'Tühistatud: ' + viide['tüüp'];
  // Seisu arvutame tühistuse järel uuesti kõigist liikumistest
  ctx.koik.push(kirje);
  ctx.seis = arvutaSeisListist_(ctx.koik);
  ctx.koik.pop();
  if (ctx.tooted[viide.toote_id]) ctx.puudutatud[viide.toote_id] = true;
}

// ---------------------------------------------------------------------------
// KONFLIKTID (etapp 4)
// ---------------------------------------------------------------------------
// Konflikt = liikumine, mille veerus "konflikt" on jah. Admin vaatab need üle:
//   KINNITA  – liikumine jääb nii, nagu on (lukustatud kasutaja oma läheb nüüd arvesse)
//   TÜHISTA  – lisatakse TÜHISTUS-liikumine (lukustatud kasutaja oma lükatakse tagasi)
//   PARANDA  – algne tühistatakse ja lisatakse parandatud koguse/saaja/tootega uus liikumine
// Lahendatud konfliktil on lahendatud = jah ja põhjuse lõpus märge, nt
// "[KINNITATUD: Mari, 22.10.2026 14:05]". Lukustatud kasutaja liikumise põhjus algab
// tekstiga LUKUSTATUD_POHJUS ja see läheb saldosse ainult märke [KINNITATUD korral.

var LUKUSTATUD_POHJUS = 'Kasutaja oli lukustatud';
var PARANDATAVAD_TYYBID = ['SISSE', 'VÄLJA', 'KORRIGEERIMINE', 'VÄLJA_ANTUD'];

/** Kas liikumine läheb saldo/oleku arvestusse (lukustatud kasutaja oma ainult kinnitatuna). */
function lahebArvesse_(l) {
  var pohjus = String(l['konflikti_põhjus'] || '');
  if (pohjus.indexOf(LUKUSTATUD_POHJUS) !== 0) return true;
  return pohjus.indexOf('[KINNITATUD') >= 0;
}

function onLukustatuLiikumine_(l) {
  return String(l['konflikti_põhjus'] || '').indexOf(LUKUSTATUD_POHJUS) === 0;
}

/** Tühistatud liikumiste id-d { id: true } (arvesse minevate TÜHISTUSTE järgi). */
function tyhistatudIdd_(liikumised) {
  var t = {};
  liikumised.forEach(function (l) { if (l['tüüp'] === 'TÜHISTUS' && lahebArvesse_(l)) t[l.kellele_kuhu] = true; });
  return t;
}

/** Lahendamata konfliktid (vanemad eespool). Tühistatud liikumised ei vaja enam lahendamist. */
function lahendamataKonfliktid_(liikumised) {
  var tyhistatud = tyhistatudIdd_(liikumised);
  return liikumised.filter(function (l) { return l.konflikt && !l.lahendatud && !tyhistatud[l.id]; });
}

/** KONFLIKTIDE vaate andmed: lahendamata (uuemad eespool) + viimati lahendatud. */
function tKonfliktidNimekiri_() {
  var liikumised = loeLeht_('Liikumised');
  var tooted = {}, kasutajad = {}, riiulid = {}, ids = {};
  loeLeht_('Tooted').forEach(function (t) { tooted[t.id] = t; });
  loeLeht_('Kasutajad').forEach(function (k) { kasutajad[k.id] = k; });
  loeLeht_('Riiulid').forEach(function (r) { riiulid[r.id] = r; });
  liikumised.forEach(function (l) { ids[l.id] = l; });
  var seis = arvutaSeisListist_(liikumised);

  function kirjelda(l) {
    var t = tooted[l.toote_id] || {};
    var s = seis[l.toote_id] || { saldo: 0, olek: 'LAOS' };
    var kuhu = l.kellele_kuhu;
    if (l['tüüp'] === 'ÜMBERPAIGUTUS') kuhu = riiulid[kuhu] ? riiulid[kuhu].kood : kuhu;
    if (l['tüüp'] === 'TÜHISTUS') {
      var v = ids[kuhu];
      kuhu = v ? 'Tühistab: ' + v['tüüp'] + (v.kogus ? ' ' + v.kogus : '') + ' (' + isoAeg_(v['skännimise_aeg']) + ')' : kuhu;
    }
    return {
      id: l.id, tyyp: l['tüüp'], toote_id: l.toote_id,
      nimetus: t.nimetus || '(tundmatu toode)', toote_tyyp: t['tüüp'] || '', yhik: t['ühik'] || '',
      kogus: l.kogus, kellele_kuhu: l.kellele_kuhu, kuhuTekst: kuhu, markus: l['märkus'],
      kasutaja: kasutajad[l.kasutaja_id] ? kasutajad[l.kasutaja_id].nimi : '',
      aeg: isoAeg_(l['skännimise_aeg']), serveriAeg: isoAeg_(l['serverisse_jõudmise_aeg']),
      pohjus: l['konflikti_põhjus'], lukustatud: onLukustatuLiikumine_(l),
      saldo: t['tüüp'] === TYYP.VARUOSA ? s.saldo : null,
      olek: t['tüüp'] === TYYP.TOORIIST ? s.olek : null,
      voibParandada: PARANDATAVAD_TYYBID.indexOf(l['tüüp']) >= 0
    };
  }
  return {
    lahtised: lahendamataKonfliktid_(liikumised).reverse().map(kirjelda),
    lahendatud: liikumised.filter(function (l) { return l.konflikt && l.lahendatud; }).slice(-20).reverse().map(kirjelda)
  };
}

/**
 * Konflikti lahendamine.
 * data: { id | ids: [...], otsus: 'KINNITA' | 'TÜHISTA' | 'PARANDA',
 *         (PARANDA:) kogus, kellele_kuhu, toote_id, markus }
 * Kõik muudatused kirjutatakse alles lõpus – vea korral ei muudeta midagi.
 */
function tKonfliktidLahenda_(data, admin) {
  var otsus = String(data.otsus || '').toUpperCase();
  if (['KINNITA', 'TÜHISTA', 'PARANDA'].indexOf(otsus) < 0) throw new ApiViga_('Tundmatu otsus: ' + otsus, 'VALE_SISEND');
  var idd = data.ids || [data.id];
  if (!idd.length || !idd[0]) throw new ApiViga_('Vali konflikt.', 'VALE_SISEND');
  if (otsus === 'PARANDA' && idd.length > 1) throw new ApiViga_('Parandada saab korraga ühte liikumist.', 'VALE_SISEND');

  var ctx = looLiikumisteKontekst_(admin);
  var tyhistatud = tyhistatudIdd_(ctx.koik);
  var aeg = Utilities.formatDate(new Date(), 'Europe/Tallinn', 'dd.MM.yyyy HH:mm');
  var margitud = [];
  function margi(l, tekst) {
    l['konflikti_põhjus'] = String(l['konflikti_põhjus'] || '') + ' [' + tekst + ': ' + admin.nimi + ', ' + aeg + ']';
    l.lahendatud = true;
    margitud.push(l);
  }

  idd.forEach(function (id) {
    var l = ctx.ids[id];
    if (!l || !l._rida) throw new ApiViga_('Liikumist ei leitud.', 'EI_LEITUD');
    if (!l.konflikt || l.lahendatud || tyhistatud[id]) throw new ApiViga_('See konflikt on juba lahendatud.', 'VALE_SISEND');
    var lukus = onLukustatuLiikumine_(l);

    if (otsus === 'KINNITA') {
      margi(l, 'KINNITATUD');
      // Lukustatud kasutaja ümberpaigutus jõustub alles nüüd
      if (lukus && l['tüüp'] === 'ÜMBERPAIGUTUS' && ctx.riiulid[l.kellele_kuhu] && ctx.tooted[l.toote_id]) {
        ctx.riiuliMuutused[l.toote_id] = l.kellele_kuhu;
        ctx.puudutatud[l.toote_id] = true;
      }
      return;
    }

    if (otsus === 'PARANDA' && PARANDATAVAD_TYYBID.indexOf(l['tüüp']) < 0) {
      throw new ApiViga_('Seda liikumist ei saa parandada – kinnita või tühista see.', 'VALE_SISEND');
    }
    // Arvesse läinud liikumine tühistatakse TÜHISTUS-liikumisega (ajalugu jääb alles)
    if (!lukus) {
      if (l['tüüp'] === 'ÜMBERPAIGUTUS') throw new ApiViga_('Ümberpaigutust ei saa tühistada – kinnita see ja paiguta toode uuesti.', 'VALE_SISEND');
      tootleLiikumine_(ctx, { id: Utilities.getUuid(), tyyp: 'TÜHISTUS', viide: l.id,
        markus: otsus === 'PARANDA' ? 'Parandatud konflikt' : 'Konflikt tühistatud' });
    }
    margi(l, otsus === 'PARANDA' ? 'PARANDATUD' : (lukus ? 'TAGASI LÜKATUD' : 'TÜHISTATUD'));

    if (otsus === 'PARANDA') {
      var uusId = Utilities.getUuid();
      var r = tootleLiikumine_(ctx, {
        id: uusId,
        toote_id: data.toote_id || l.toote_id,
        tyyp: l['tüüp'],
        kogus: data.kogus !== undefined && data.kogus !== '' ? data.kogus : l.kogus,
        kellele_kuhu: data.kellele_kuhu !== undefined && data.kellele_kuhu !== '' ? data.kellele_kuhu : l.kellele_kuhu,
        markus: data.markus !== undefined ? data.markus : l['märkus'],
        skannimise_aeg: l['skännimise_aeg']
      });
      // Parandatud liikumine jääb algse tegija nimele; admin otsustas, seega konflikt on lahendatud
      var uus = ctx.ids[uusId];
      uus.kasutaja_id = l.kasutaja_id;
      uus['märkus'] = (uus['märkus'] + ' (parandas ' + admin.nimi + ')').trim();
      if (r.konflikt) {
        uus.lahendatud = true;
        uus['konflikti_põhjus'] += ' [KINNITATUD parandusel: ' + admin.nimi + ', ' + aeg + ']';
      }
    }
  });

  // Kinnitamine/tagasilükkamine muudab, mis arvesse läheb – arvuta seis uuesti
  ctx.seis = arvutaSeisListist_(ctx.koik);
  margitud.forEach(function (l) { if (ctx.tooted[l.toote_id]) ctx.puudutatud[l.toote_id] = true; });
  salvestaLiikumisteKontekst_(ctx);
  margitud.forEach(function (l) {
    uuendaRida_('Liikumised', l._rida, { lahendatud: true, 'konflikti_põhjus': l['konflikti_põhjus'] });
  });
  return { lahendatud: margitud.length };
}

// ---------------------------------------------------------------------------
// SILDIPÕHJAD (etapp 5)
// ---------------------------------------------------------------------------
// Neli vaikimisi põhja on kirjas esipaneelis (js/sildid.js). Lehel Sildipõhjad
// hoitakse admini enda tehtud põhju. "seaded" on JSON-tekst (veerised, fondid jms).

var SILDI_PAIGUTUSED = ['TOODE', 'RIIUL', 'VAIKE', 'A4'];

function tSildipohjadNimekiri_() {
  return loeLeht_('Sildipõhjad').map(function (p) {
    var seaded = {};
    try { seaded = JSON.parse(p.seaded || '{}'); } catch (e) { /* vigane JSON – vaikimisi seaded */ }
    return { id: p.id, nimi: p.nimi, laius_mm: p.laius_mm, korgus_mm: p['kõrgus_mm'], paigutus: p.paigutus, seaded: seaded };
  });
}

/** Lisab uue põhja või muudab olemasolevat (data.id). */
function tSildipohjadSalvesta_(data) {
  var nimi = kohustuslik_(data.nimi, 'Nimi').slice(0, 100);
  var laius = arv_(data.laius_mm, 'Laius'), korgus = arv_(data.korgus_mm, 'Kõrgus');
  if (!(laius >= 10 && laius <= 300 && korgus >= 10 && korgus <= 400)) {
    throw new ApiViga_('Sildi mõõdud peavad olema 10–300 mm (laius) ja 10–400 mm (kõrgus).', 'VALE_SISEND');
  }
  var paigutus = String(data.paigutus || '').toUpperCase();
  if (SILDI_PAIGUTUSED.indexOf(paigutus) < 0) throw new ApiViga_('Tundmatu paigutus: ' + paigutus, 'VALE_SISEND');
  var seaded = JSON.stringify(data.seaded || {});
  if (seaded.length > 5000) throw new ApiViga_('Seaded on liiga pikad.', 'VALE_SISEND');
  var rida = { nimi: nimi, laius_mm: laius, 'kõrgus_mm': korgus, paigutus: paigutus, seaded: seaded };
  if (data.id) {
    var olemas = leiaRida_('Sildipõhjad', function (p) { return p.id === data.id; });
    if (!olemas) throw new ApiViga_('Sildipõhja ei leitud.', 'EI_LEITUD');
    uuendaRida_('Sildipõhjad', olemas.rida, rida);
    rida.id = data.id;
  } else {
    rida.id = 'S-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
    lisaRida_('Sildipõhjad', rida);
  }
  return { id: rida.id };
}

function tSildipohjadKustuta_(data) {
  var n = kustutaRead_('Sildipõhjad', function (p) { return p.id === data.id; });
  if (!n) throw new ApiViga_('Sildipõhja ei leitud.', 'EI_LEITUD');
  return true;
}

// ---------------------------------------------------------------------------
// AJALUGU (etapp 6)
// ---------------------------------------------------------------------------

/**
 * Liikumiste ajalugu, uuemad eespool.
 * data: { alates, kuni (kuupäev AAAA-KK-PP, kaasa arvatud), toote_id, tyyp, kasutaja_id, max }
 * Tagastab { read, kokku, kasutajad: [{ id, nimi }] }.
 */
function tLiikumisedNimekiri_(data) {
  var liikumised = loeLeht_('Liikumised');
  var tooted = {}, kasutajad = {}, riiulid = {}, ids = {};
  loeLeht_('Tooted').forEach(function (t) { tooted[t.id] = t; });
  loeLeht_('Kasutajad').forEach(function (k) { kasutajad[k.id] = k; });
  loeLeht_('Riiulid').forEach(function (r) { riiulid[r.id] = r; });
  liikumised.forEach(function (l) { ids[l.id] = l; });
  var tyhistatud = tyhistatudIdd_(liikumised);

  var alates = data.alates ? paevaAlgus_(data.alates) : null;
  var kuni = data.kuni ? new Date(paevaAlgus_(data.kuni).getTime() + 86400000) : null;
  var max = Math.min(Number(data.max) || 500, SEADED.MAX_AJALOO_RIDU);

  var sobivad = liikumised.filter(function (l) {
    var aeg = l['skännimise_aeg'];
    if (alates && !(aeg >= alates)) return false;
    if (kuni && !(aeg < kuni)) return false;
    if (data.toote_id && l.toote_id !== data.toote_id) return false;
    if (data.tyyp && l['tüüp'] !== data.tyyp) return false;
    if (data.kasutaja_id && l.kasutaja_id !== data.kasutaja_id) return false;
    return true;
  });
  sobivad.sort(function (a, b) { return (b['skännimise_aeg'] || 0) - (a['skännimise_aeg'] || 0); });

  var read = sobivad.slice(0, max).map(function (l) {
    var t = tooted[l.toote_id] || {};
    var kuhu = l.kellele_kuhu;
    if (l['tüüp'] === 'ÜMBERPAIGUTUS') kuhu = riiulid[kuhu] ? riiulid[kuhu].kood : kuhu;
    if (l['tüüp'] === 'TÜHISTUS') {
      var v = ids[kuhu];
      kuhu = v ? 'Tühistab: ' + v['tüüp'] + (v.kogus ? ' ' + v.kogus : '') : '';
    }
    return {
      id: l.id, aeg: isoAeg_(l['skännimise_aeg']), serveriAeg: isoAeg_(l['serverisse_jõudmise_aeg']),
      tyyp: l['tüüp'], toote_id: l.toote_id, nimetus: t.nimetus || '', yhik: t['ühik'] || '',
      kogus: l.kogus, kellele_kuhu: kuhu, markus: l['märkus'],
      kasutaja: kasutajad[l.kasutaja_id] ? kasutajad[l.kasutaja_id].nimi : '',
      konflikt: l.konflikt, pohjus: l['konflikti_põhjus'], lahendatud: l.lahendatud,
      tyhistatud: !!tyhistatud[l.id], arvesse: lahebArvesse_(l)
    };
  });
  return {
    read: read,
    kokku: sobivad.length,
    kasutajad: Object.keys(kasutajad).map(function (id) { return { id: id, nimi: kasutajad[id].nimi }; })
      .sort(function (a, b) { return a.nimi.localeCompare(b.nimi); })
  };
}

// ---------------------------------------------------------------------------
// MASINAD (Masinakulude sidumine)
// ---------------------------------------------------------------------------

/** Aktiivsed masinad telefoni VÄLJA-vormi jaoks. Kui Masinad leht puudub (vana tabel), tühi nimekiri. */
function aktiivsedMasinad_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Masinad');
  if (!sh) return [];
  return loeLeht_('Masinad').filter(function (m) { return m.aktiivne !== false && m.nimi; })
    .map(function (m) { return { id: m.id, nimi: m.nimi, kood: m.kood || '' }; })
    .sort(function (a, b) { return String(a.nimi).localeCompare(String(b.nimi)); });
}

/**
 * Masinate nimekiri Masinakuludest: data.masinad = [{id, nimi, kood}]. Uued lisatakse, olemasolevad
 * uuendatakse, nimekirjast puuduvad märgitakse mitteaktiivseks (ajalugu jääb alles).
 */
function tMasinadSalvesta_(data) {
  var sisend = data.masinad || [];
  if (!Array.isArray(sisend) || sisend.length > 500) throw new ApiViga_('Masinate nimekiri on vigane.', 'VALE_SISEND');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName('Masinad')) seadistaLeht_(ss, 'Masinad');
  var olemas = {};
  loeLehtRidadega_('Masinad').forEach(function (r) { olemas[r.obj.id] = r; });
  var nahtud = {}, lisatud = 0, muudetud = 0;
  sisend.forEach(function (m) {
    var id = String(m.id || '').trim(), nimi = String(m.nimi || '').trim().slice(0, 120);
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id) || !nimi) return;
    nahtud[id] = true;
    var obj = { id: id, nimi: nimi, kood: String(m.kood || '').trim().slice(0, 60), aktiivne: true };
    var r = olemas[id];
    if (!r) { lisaRida_('Masinad', obj); lisatud++; }
    else if (r.obj.nimi !== obj.nimi || r.obj.kood !== obj.kood || r.obj.aktiivne === false) { uuendaRida_('Masinad', r.rida, obj); muudetud++; }
  });
  var peidetud = 0;
  Object.keys(olemas).forEach(function (id) {
    if (!nahtud[id] && olemas[id].obj.aktiivne !== false) { uuendaRida_('Masinad', olemas[id].rida, { aktiivne: false }); peidetud++; }
  });
  return { lisatud: lisatud, muudetud: muudetud, peidetud: peidetud, masinad: aktiivsedMasinad_() };
}

/** "2026-10-22" → selle päeva algus Eesti aja järgi. */
function paevaAlgus_(tekst) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(tekst));
  if (!m) throw new ApiViga_('Kuupäev peab olema kujul AAAA-KK-PP.', 'VALE_SISEND');
  var keskpaev = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
  // Tallinna nihe sel päeval (+2 või +3 tundi)
  var nihe = Number(Utilities.formatDate(keskpaev, 'Europe/Tallinn', 'H')) - 12;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]) - nihe * 3600000);
}

function positiivneKogus_(v) {
  var n = arv_(v === undefined || v === '' ? 1 : v, 'Kogus');
  if (!(n > 0)) throw new ApiViga_('Kogus peab olema suurem kui 0.', 'VALE_SISEND');
  return n;
}

function ymarda_(n) {
  return Math.round(n * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// SEADISTAMINE (käivitatakse käsitsi Apps Scripti redaktorist või menüüst)
// ---------------------------------------------------------------------------

/**
 * Loob puuduvad lehed koos päistega, vormindab veerud ja (kui kasutajaid
 * veel pole) genereerib esimese admini loomise seadistuskoodi.
 * Võib turvaliselt mitu korda käivitada – olemasolevaid andmeid ei muudeta.
 */
function seadista() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone('Europe/Tallinn');

  var saldodPuudus = !ss.getSheetByName('Saldod');
  Object.keys(SKEEM).forEach(function (nimi) { seadistaLeht_(ss, nimi); });
  if (saldodPuudus) ehitaSaldod_(); // olemasolevas tabelis: saldod liikumiste põhjal

  // Loendurid algväärtustega
  var loendurid = loeLeht_('Loendurid').map(function (l) { return l['tüüp']; });
  LOENDURID_ALGUS.forEach(function (l) {
    if (loendurid.indexOf(l[0]) < 0) lisaRida_('Loendurid', { 'tüüp': l[0], 'järgmine': l[1] });
  });

  // Eemalda uue tabeli vaikimisi tühi "Leht1"/"Sheet1"
  ['Leht1', 'Sheet1'].forEach(function (n) {
    var sh = ss.getSheetByName(n);
    if (sh && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });

  piparTera_(); // loo salajane pipar, kui seda veel pole

  var teade;
  if (loeLeht_('Kasutajad').length === 0) {
    var props = PropertiesService.getScriptProperties();
    var kood = props.getProperty('SEADISTUSKOOD');
    if (!kood) {
      kood = Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
      props.setProperty('SEADISTUSKOOD', kood);
    }
    teade = 'Seadistus tehtud. Esimese admini loomise SEADISTUSKOOD: ' + kood;
  } else {
    teade = 'Seadistus tehtud. Kasutajad on juba olemas – seadistuskoodi pole vaja.';
  }
  Logger.log(teade);
  try { SpreadsheetApp.getUi().alert(teade); } catch (e) { /* redaktorist käivitades UI-d pole */ }
  return teade;
}

/** Loob lehe (kui puudub) ja lisab puuduvad veerud; vormindab päise ja veerud. */
function seadistaLeht_(ss, nimi) {
  var sh = ss.getSheetByName(nimi) || ss.insertSheet(nimi);
  var veerud = SKEEM[nimi];
  // Kui lehel juba on päis, lisatakse ainult puuduvad veerud lõppu.
  var olemas = sh.getLastColumn() > 0 ? paiseKaart_(sh) : {};
  var lisada = veerud.filter(function (v) { return !(v[0] in olemas); });
  if (lisada.length) {
    var algus = sh.getLastColumn() + 1;
    sh.getRange(1, algus, 1, lisada.length).setValues([lisada.map(function (v) { return v[0]; })]);
  }
  // Vormindus: päis paksult ja külmutatud, veergude andmetüübid.
  var kaart = paiseKaart_(sh);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setBackground('#e8eef7');
  veerud.forEach(function (v) {
    var r = sh.getRange(2, kaart[v[0]] + 1, sh.getMaxRows() - 1, 1);
    if (v[1] === 'd') r.setNumberFormat('dd.mm.yyyy hh:mm:ss');
    else if (v[1] === 'n') r.setNumberFormat('0.###');
    else r.setNumberFormat('@'); // lihttekst
  });
  return sh;
}

// ---------------------------------------------------------------------------
// SOOJENDUS: hoiab skripti „soojana”, et esimene päring pärast pausi oleks kiirem
// ---------------------------------------------------------------------------
// Käivita Apps Scripti redaktoris üks kord funktsioon paigaldaSoojendus. See loob
// ajapõhise päästiku, mis kutsub iga 5 minuti järel funktsiooni soojenda.
// Google ei garanteeri, et veebirakendus selle tõttu kiirem on – mõõda arendusrežiimis.

function soojenda() {
  CacheService.getScriptCache().get('soe');
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Tooted');
}

function paigaldaSoojendus() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'soojenda') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('soojenda').timeBased().everyMinutes(5).create();
  var teade = 'Soojendus paigaldatud: funktsioon soojenda käivitub iga 5 minuti järel.';
  Logger.log(teade);
  return teade;
}

function eemaldaSoojendus() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'soojenda') { ScriptApp.deleteTrigger(t); n++; }
  });
  Logger.log('Eemaldatud päästikuid: ' + n);
  return n;
}

/** Lisab tabeli ülaribale menüü "Laosüsteem". */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Laosüsteem')
    .addItem('Seadista / näita seadistuskoodi', 'seadista')
    .addToUi();
}
