/** Etapi 1 serveripoolsed testid. Käivita: node tests/test-etapp1.js */
const assert = require('assert');
const { looKeskkond } = require('./gas-mock');

let ok = 0;
function test(nimi, fn) {
  try { fn(); ok++; console.log('  ✓ ' + nimi); }
  catch (e) { console.log('  ✗ ' + nimi + '\n    ' + e.message); process.exitCode = 1; }
}

const K = looKeskkond();
const { post, g } = K;

console.log('Seadistus');
let kood;
test('seadistamata API annab vea SEADISTAMATA', () => {
  const r = post({ action: 'olek' });
  assert.strictEqual(r.code, 'SEADISTAMATA');
});
test('seadista() loob kõik lehed ja seadistuskoodi', () => {
  const teade = g.seadista();
  ['Tooted','Koodid','Riiulid','Liikumised','Kasutajad','Seansid','Sildipõhjad','Loendurid'].forEach(n => assert(K.ss.getSheetByName(n), n));
  kood = K.props.get('SEADISTUSKOOD');
  assert(/^[0-9A-F]{8}$/.test(kood));
  assert(teade.includes(kood));
  assert.strictEqual(K.ss.getSheetByName('Loendurid').getLastRow(), 4);
});
test('seadista() teist korda ei dubleeri päiseid ega loendureid', () => {
  g.seadista();
  assert.strictEqual(K.ss.getSheetByName('Kasutajad').getLastColumn(), 9);
  assert.strictEqual(K.ss.getSheetByName('Loendurid').getLastRow(), 4);
  assert.strictEqual(K.props.get('SEADISTUSKOOD'), kood);
});
test('GET olek: nõuab seadistust', () => {
  const r = K.get({ action: 'olek' });
  assert(r.ok && r.data.nouabSeadistust === true);
});
test('GET muu tegevusega keelatud', () => {
  assert.strictEqual(K.get({ action: 'kasutajad.nimekiri' }).ok, false);
});

console.log('Esimene admin');
test('vale seadistuskoodiga ei saa', () => {
  const r = post({ action: 'esimeneAdmin', data: { seadistuskood: 'XXXX', kasutajanimi: 'henri', nimi: 'Henri', pin: '1234' } });
  assert.strictEqual(r.code, 'VALE_KOOD');
});
test('vale PIN-vorminguga ei saa', () => {
  const r = post({ action: 'esimeneAdmin', data: { seadistuskood: kood, kasutajanimi: 'henri', nimi: 'Henri', pin: '12' } });
  assert.strictEqual(r.code, 'VALE_SISEND');
});
let adminToken;
test('õige koodiga luuakse admin ja seanss', () => {
  const r = post({ action: 'esimeneAdmin', data: { seadistuskood: kood.toLowerCase(), kasutajanimi: ' Henri ', nimi: 'Henri K', pin: '1234' } });
  assert(r.ok, r.error);
  adminToken = r.data.token;
  assert.strictEqual(r.data.kasutaja.roll, 'ADMIN');
  assert.strictEqual(r.data.kasutaja.kasutajanimi, 'henri');
  assert(!K.props.has('SEADISTUSKOOD'));
});
test('PIN on tabelis räsitud, seansivõti räsitud', () => {
  const rida = K.ss.getSheetByName('Kasutajad')._andmed[1];
  assert(!rida.includes('1234'));
  assert(/^[0-9a-f]{32}\$200\$[0-9a-f]{64}$/.test(rida[3]));
  const ses = K.ss.getSheetByName('Seansid')._andmed[1];
  assert.notStrictEqual(ses[0], adminToken);
  assert.strictEqual(ses[0].length, 64);
});
test('teist esimest adminit ei saa luua', () => {
  const r = post({ action: 'esimeneAdmin', data: { seadistuskood: kood, kasutajanimi: 'x', nimi: 'x', pin: '1234' } });
  assert.strictEqual(r.ok, false);
});

console.log('Seansid ja õigused');
test('ilma võtmeta andmeid ei anta', () => {
  assert.strictEqual(post({ action: 'kasutajad.nimekiri' }).code, 'SEANSS_KEHTETU');
  assert.strictEqual(post({ action: 'mina', token: 'vale' }).code, 'SEANSS_KEHTETU');
});
test('kehtiva võtmega mina töötab', () => {
  const r = post({ action: 'mina', token: adminToken });
  assert(r.ok && r.data.kasutajanimi === 'henri');
});
test('tundmatu tegevus', () => {
  assert.strictEqual(post({ action: 'kustutaKõik', token: adminToken }).code, 'VALE_PARING');
});

console.log('Kasutajate haldus');
let mati;
test('admin lisab laotöötaja', () => {
  const r = post({ action: 'kasutajad.lisa', token: adminToken, data: { kasutajanimi: 'mati', nimi: 'Mati Maasikas', roll: 'LAOTÖÖTAJA', pin: '55555' } });
  assert(r.ok, r.error); mati = r.data;
});
test('sama kasutajanimi teist korda ei lähe (suurtähtedest sõltumata)', () => {
  const r = post({ action: 'kasutajad.lisa', token: adminToken, data: { kasutajanimi: 'MATI', nimi: 'x', roll: 'LAOTÖÖTAJA', pin: '1111' } });
  assert.strictEqual(r.code, 'DUPLIKAAT');
});
test('valemiga algav nimi salvestatakse tekstina', () => {
  const r = post({ action: 'kasutajad.lisa', token: adminToken, data: { kasutajanimi: 'test', nimi: '=SUM(1)', roll: 'LAOTÖÖTAJA', pin: '1111' } });
  assert(r.ok);
  const rida = K.ss.getSheetByName('Kasutajad')._andmed.find(x => x[1] === 'test');
  assert.strictEqual(rida[2], "'=SUM(1)");
});
let matiToken, matiToken2;
test('laotöötaja logib sisse (kaks seadet)', () => {
  let r = post({ action: 'login', data: { kasutajanimi: 'Mati', pin: '55555', seade: 'telefon' } });
  assert(r.ok, r.error); matiToken = r.data.token;
  r = post({ action: 'login', data: { kasutajanimi: 'mati', pin: '55555', seade: 'arvuti' } });
  matiToken2 = r.data.token;
  assert.notStrictEqual(matiToken, matiToken2);
});
test('laotöötaja ei pääse kasutajate haldusesse', () => {
  assert.strictEqual(post({ action: 'kasutajad.nimekiri', token: matiToken }).code, 'POLE_OIGUST');
  assert.strictEqual(post({ action: 'kasutajad.lisa', token: matiToken, data: {} }).code, 'POLE_OIGUST');
});
test('nimekiri näitab seansse, mitte PIN-räsi', () => {
  const r = post({ action: 'kasutajad.nimekiri', token: adminToken });
  const m = r.data.find(k => k.kasutajanimi === 'mati');
  assert.strictEqual(m.seansse, 2);
  assert(!JSON.stringify(r.data).includes('$200$'));
});
test('rolli muutmine jõuab kohe kohale (vahemälu tühjendatakse)', () => {
  post({ action: 'mina', token: matiToken }); // täidab vahemälu
  assert(post({ action: 'kasutajad.muuda', token: adminToken, data: { id: mati.id, roll: 'ADMIN' } }).ok);
  assert.strictEqual(post({ action: 'mina', token: matiToken }).data.roll, 'ADMIN');
  post({ action: 'kasutajad.muuda', token: adminToken, data: { id: mati.id, roll: 'LAOTÖÖTAJA' } });
});

console.log('Vale PIN ja ajutine lukk');
test('vale PIN: sama teade tundmatu kasutaja korral', () => {
  assert.strictEqual(post({ action: 'login', data: { kasutajanimi: 'pole', pin: '1234' } }).code, 'VALE_LOGIN');
  const r = post({ action: 'login', data: { kasutajanimi: 'mati', pin: '0000' } });
  assert.strictEqual(r.code, 'VALE_LOGIN');
  assert(r.error.includes('Katseid jäänud: 4'));
});
test('5. vale katse lukustab, õige PIN ka siis ei lähe', () => {
  for (let i = 0; i < 3; i++) post({ action: 'login', data: { kasutajanimi: 'mati', pin: '0000' } });
  const r = post({ action: 'login', data: { kasutajanimi: 'mati', pin: '0000' } });
  assert.strictEqual(r.code, 'AJUTINE_LUKK');
  assert.strictEqual(post({ action: 'login', data: { kasutajanimi: 'mati', pin: '55555' } }).code, 'AJUTINE_LUKK');
});
test('lukk aegub', () => {
  const sh = K.ss.getSheetByName('Kasutajad');
  const rida = sh._andmed.find(x => x[1] === 'mati');
  rida[8] = new Date(Date.now() - 1000);
  assert(post({ action: 'login', data: { kasutajanimi: 'mati', pin: '55555' } }).ok);
  assert.strictEqual(rida[7], 0);
});
test('PIN-i lähtestamine', () => {
  assert(post({ action: 'kasutajad.lahtestaPin', token: adminToken, data: { id: mati.id, pin: '9876' } }).ok);
  assert.strictEqual(post({ action: 'login', data: { kasutajanimi: 'mati', pin: '55555' } }).code, 'VALE_LOGIN');
  assert(post({ action: 'login', data: { kasutajanimi: 'mati', pin: '9876' } }).ok);
});

console.log('Lukustamine');
test('lukustamine tühistab kõik seansid kohe (ka vahemälus olevad)', () => {
  assert(post({ action: 'mina', token: matiToken }).ok);
  assert(post({ action: 'kasutajad.lukusta', token: adminToken, data: { id: mati.id } }).ok);
  assert.strictEqual(post({ action: 'mina', token: matiToken }).code, 'SEANSS_KEHTETU');
  assert.strictEqual(post({ action: 'mina', token: matiToken2 }).code, 'SEANSS_KEHTETU');
  assert.strictEqual(post({ action: 'login', data: { kasutajanimi: 'mati', pin: '9876' } }).code, 'LUKUSTATUD');
});
test('aktiveerimine', () => {
  assert(post({ action: 'kasutajad.aktiveeri', token: adminToken, data: { id: mati.id } }).ok);
  assert(post({ action: 'login', data: { kasutajanimi: 'mati', pin: '9876' } }).ok);
});
test('viimast adminit ei saa lukustada ega alandada, iseennast ei saa lukustada', () => {
  const minuId = post({ action: 'mina', token: adminToken }).data.id;
  assert.strictEqual(post({ action: 'kasutajad.lukusta', token: adminToken, data: { id: minuId } }).ok, false);
  assert.strictEqual(post({ action: 'kasutajad.muuda', token: adminToken, data: { id: minuId, roll: 'LAOTÖÖTAJA' } }).code, 'VIIMANE_ADMIN');
});
test('aegunud seanss ei kehti', () => {
  const r = post({ action: 'login', data: { kasutajanimi: 'mati', pin: '9876' } });
  K.cache.clear();
  const ses = K.ss.getSheetByName('Seansid')._andmed;
  ses[ses.length - 1][3] = new Date(Date.now() - 1000);
  assert.strictEqual(post({ action: 'mina', token: r.data.token }).code, 'SEANSS_KEHTETU');
});
test('väljalogimine', () => {
  const r = post({ action: 'login', data: { kasutajanimi: 'mati', pin: '9876' } });
  assert(post({ action: 'logout', token: r.data.token }).ok);
  assert.strictEqual(post({ action: 'mina', token: r.data.token }).code, 'SEANSS_KEHTETU');
});

console.log(`\n${ok} testi õnnestus` + (process.exitCode ? ', osa EBAÕNNESTUS' : ''));
