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
  VERSIOON: '1.1.0-etapp2',
  SEANSI_KEHTIVUS_PAEVI: 30,      // Mitu päeva telefon sisselogimist meeles peab
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
  MAX_IMPORDI_RIDU: 500           // Mitu rida ühes impordipäringus (esipaneel jagab suure faili osadeks)
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
  Sildipõhjad: [
    ['id', 's'], ['nimi', 's'], ['laius_mm', 'n'], ['kõrgus_mm', 'n'], ['paigutus', 's'],
    ['seaded', 's']
  ],
  Loendurid: [
    ['tüüp', 's'], ['järgmine', 'n']
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
  'tooted.lisa':          { fn: tTootedLisa_, kirjutab: true },   // ka laotöötaja (kiirlisamine)
  'tooted.muuda':         { fn: tTootedMuuda_, roll: ROLL.ADMIN, kirjutab: true },
  'tooted.arhiveeri':     { fn: tTootedArhiveeri_, roll: ROLL.ADMIN, kirjutab: true },
  'tooted.import':        { fn: tTootedImport_, roll: ROLL.ADMIN, kirjutab: true },
  'koodid.lisa':          { fn: tKoodidLisa_, roll: ROLL.ADMIN, kirjutab: true },
  'koodid.eemalda':       { fn: tKoodidEemalda_, roll: ROLL.ADMIN, kirjutab: true },
  'riiulid.lisa':         { fn: tRiiulidLisa_, roll: ROLL.ADMIN, kirjutab: true },
  'riiulid.hulgi':        { fn: tRiiulidHulgi_, roll: ROLL.ADMIN, kirjutab: true },
  'riiulid.muuda':        { fn: tRiiulidMuuda_, roll: ROLL.ADMIN, kirjutab: true },
  'riiulid.arhiveeri':    { fn: tRiiulidArhiveeri_, roll: ROLL.ADMIN, kirjutab: true }
};

/**
 * Keskne päringu käsitleja: leiab tegevuse, kontrollib seanssi ja rolli,
 * võtab vajadusel luku ning püüab vead kinni.
 */
function kasitle_(paring) {
  var lukk = null;
  try {
    var tegevus = TEGEVUSED[paring.action];
    if (!tegevus) throw new ApiViga_('Tundmatu tegevus: ' + paring.action, 'VALE_PARING');

    var kasutaja = null;
    if (!tegevus.avalik) {
      kasutaja = kontrolliSeanss_(paring.token);
      if (tegevus.roll && kasutaja.roll !== tegevus.roll) {
        throw new ApiViga_('Sul pole selleks õigust.', 'POLE_OIGUST');
      }
    }

    if (tegevus.kirjutab) {
      lukk = LockService.getScriptLock();
      if (!lukk.tryLock(SEADED.LUKU_OOTEAEG_MS)) {
        throw new ApiViga_('Server on hõivatud, proovi uuesti.', 'HOIVATUD');
      }
    }

    var tulemus = tegevus.fn(paring.data || {}, kasutaja, paring);
    return { ok: true, data: tulemus === undefined ? null : tulemus };
  } catch (err) {
    if (err instanceof ApiViga_) {
      return { ok: false, error: err.message, code: err.code };
    }
    console.error(err && err.stack ? err.stack : err);
    return { ok: false, error: 'Serveri viga: ' + (err && err.message ? err.message : err), code: 'SERVERI_VIGA' };
  } finally {
    if (lukk) {
      SpreadsheetApp.flush(); // kirjuta muudatused tabelisse enne luku vabastamist
      lukk.releaseLock();
    }
  }
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
 * kustutatakse kohe (nt kadunud telefoni puhul).
 */
function tKasutajadLukusta_(data, admin) {
  var rida = leiaKasutajaRida_(data.id);
  if (rida.obj.id === admin.id) throw new ApiViga_('Iseennast ei saa lukustada.', 'VALE_SISEND');
  if (rida.obj.roll === ROLL.ADMIN) kontrolliPoleViimaneAdmin_(rida.obj.id);
  uuendaRida_('Kasutajad', rida.rida, { aktiivne: false });
  tuhjendaKasutajaVahemalu_(rida.obj.id);
  kustutaRead_('Seansid', function (s) { return s.kasutaja_id === rida.obj.id; });
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

function kustutaAegunudSeansid_() {
  var nuud = new Date();
  kustutaRead_('Seansid', function (s) { return !(s.kehtib_kuni > nuud); });
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
function tAndmed_() {
  var koodid = {};
  loeLeht_('Koodid').forEach(function (k) {
    (koodid[k.toote_id] = koodid[k.toote_id] || []).push({ kood: k.kood, tyyp: k['koodi_tüüp'] });
  });
  var seis = arvutaSeis_();
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
  return { tooted: tooted, riiulid: riiulid, serveriAeg: new Date().toISOString() };
}

/**
 * Arvutab iga toote seisu liikumistest skännimise aja järjekorras.
 * Varuosa: saldo = SISSE − VÄLJA ± KORRIGEERIMINE (KORRIGEERIMISE kogus on vahe, võib olla negatiivne).
 * Tööriist: VÄLJA_ANTUD → "VÄLJA ANTUD", TAGASTATUD → "LAOS",
 *           OLEKU_MUUTUS → uus olek on veerus kellele_kuhu (LAOS / REMONDIS / KADUNUD).
 * Tühistatud liikumised (TÜHISTUS) jäetakse arvestusest välja – täpsem loogika etapis 3.
 * Tagastab { toote_id: { saldo, olek, kellele, alates } }.
 */
function arvutaSeis_() {
  var liikumised = loeLeht_('Liikumised');
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
      case 'OLEKU_MUUTUS': s.olek = l.kellele_kuhu || 'LAOS'; s.kellele = ''; s.alates = l['skännimise_aeg']; break;
    }
    s.saldo = Math.round(s.saldo * 1000) / 1000; // väldi ujukomavigu (0.1 + 0.2)
  });
  return seis;
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
 */
function tTootedLisa_(data, kasutaja) {
  var ctx = looKontekst_();
  var tulemus = lisaToode_(ctx, data, kasutaja);
  ctx.salvesta();
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

  Object.keys(SKEEM).forEach(function (nimi) {
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
  });

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

/** Lisab tabeli ülaribale menüü "Laosüsteem". */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Laosüsteem')
    .addItem('Seadista / näita seadistuskoodi', 'seadista')
    .addToUi();
}
