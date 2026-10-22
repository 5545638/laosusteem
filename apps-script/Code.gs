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
  VERSIOON: '1.0.0-etapp1',
  SEANSI_KEHTIVUS_PAEVI: 30,      // Mitu päeva telefon sisselogimist meeles peab
  MAX_VALE_PIN: 5,                // Mitu järjestikust vale PIN-i katset on lubatud
  PIN_LUKK_MINUTIT: 15,           // Kui kauaks kasutaja pärast liigseid katseid lukustatakse
  PIN_MIN_PIKKUS: 4,
  PIN_MAX_PIKKUS: 6,
  RASI_KORDUSI: 200,              // PIN-räsi arvutamise korduste arv (suurem = aeglasem murda)
  VAHEMALU_SEKUNDIT: 600,         // Kui kauaks seansi kontrolli tulemus vahemällu jääb
  LUKU_OOTEAEG_MS: 20000          // Kui kaua kirjutamisluku järel oodatakse
};

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
  'kasutajad.aktiveeri':  { fn: tKasutajadAktiveeri_, roll: ROLL.ADMIN, kirjutab: true }
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
  if (!/^[a-z0-9._-]{2,30}$/.test(kn)) {
    throw new ApiViga_('Kasutajanimi peab olema 2–30 märki: tähed a–z, numbrid, punkt, sidekriips või alakriips.', 'VALE_SISEND');
  }
  nimi = String(nimi || '').trim();
  if (!nimi) throw new ApiViga_('Nimi on kohustuslik.', 'VALE_SISEND');
  kontrolliRoll_(roll);
  kontrolliPinVorming_(pin);
  if (leiaRida_('Kasutajad', function (k) { return normKasutajanimi_(k.kasutajanimi) === kn; })) {
    throw new ApiViga_('Selline kasutajanimi on juba olemas.', 'DUPLIKAAT');
  }
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
