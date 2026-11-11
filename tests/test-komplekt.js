/** Tööriistakomplektide testid (põhitööriist + osad, nt akutrell ja akud). Käivita: node tests/test-komplekt.js */
const assert = require('assert');
const crypto = require('crypto');
const { looKeskkond } = require('./gas-mock');

let ok = 0;
function test(nimi, fn) {
  try { fn(); ok++; console.log('  ✓ ' + nimi); }
  catch (e) { console.log('  ✗ ' + nimi + '\n    ' + e.message); process.exitCode = 1; }
}

const K = looKeskkond();
const { post, g } = K;
g.seadista();
const admin = post({ action: 'esimeneAdmin', data: { seadistuskood: K.props.get('SEADISTUSKOOD'), kasutajanimi: 'admin', nimi: 'Admin', pin: '1234' } }).data.token;
post({ action: 'kasutajad.lisa', token: admin, data: { kasutajanimi: 'mati', nimi: 'Mati', roll: 'LAOTÖÖTAJA', pin: '5555' } });
const mati = post({ action: 'login', data: { kasutajanimi: 'mati', pin: '5555' } }).data.token;
const A = (action, data, token) => post({ action, token: token || admin, data });
const toode = id => A('andmed').data.tooted.find(t => t.id === id);
const lisa = (data, token) => A('tooted.lisa', data, token);

// Vana tabel: veergu komplekt_id pole (Code.gs uuendati, „seadista” uuesti ei käivitatud)
const sh = K.ss.getSheetByName('Tooted');
const paised = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
const veeruNr = paised.indexOf('komplekt_id') + 1;
assert(veeruNr > 0);
sh.getRange(1, veeruNr).setValue('');

const trell = lisa({ nimetus: 'Akutrell', tyyp: 'TÖÖRIIST' }).data[0].id;
const aku1 = lisa({ nimetus: 'Aku 1', tyyp: 'TÖÖRIIST' }).data[0].id;
const saag = lisa({ nimetus: 'Saag', tyyp: 'TÖÖRIIST' }).data[0].id;
const filter = lisa({ nimetus: 'Filter', tyyp: 'VARUOSA' }).data[0].id;

console.log('Komplektid');
test('ilma veeruta tabel: andmed annab tühja komplekt_id', () => {
  assert.strictEqual(toode(aku1).komplekt_id, '');
});
test('osa sidumine põhitööriistaga lisab veeru ise', () => {
  const r = A('tooted.muuda', { id: aku1, komplekt_id: trell });
  assert(r.ok, JSON.stringify(r));
  assert.strictEqual(toode(aku1).komplekt_id, trell);
  assert.strictEqual(toode(trell).komplekt_id, '');
});
test('uue osa lisamine otse komplekti (2 eksemplari)', () => {
  const r = lisa({ nimetus: 'Laadija', tyyp: 'TÖÖRIIST', eksemplare: 2, komplekt_id: trell });
  assert(r.ok, JSON.stringify(r));
  r.data.forEach(t => assert.strictEqual(toode(t.id).komplekt_id, trell));
  assert.strictEqual(A('andmed').data.tooted.filter(t => t.komplekt_id === trell).length, 3);
});
test('keelatud: iseenda osa, osa osa, osadega tööriist osaks, varuosa', () => {
  for (const d of [
    { id: trell, komplekt_id: trell },
    { id: saag, komplekt_id: aku1 },
    { id: trell, komplekt_id: saag },
    { id: filter, komplekt_id: trell },
    { id: saag, komplekt_id: filter },
    { id: saag, komplekt_id: 'POLE-OLEMAS' }
  ]) {
    const r = A('tooted.muuda', d);
    assert.strictEqual(r.ok, false, JSON.stringify(d)); assert.strictEqual(r.code, 'VALE_SISEND');
  }
  assert.strictEqual(lisa({ nimetus: 'X', tyyp: 'VARUOSA', komplekt_id: trell }).code, 'VALE_SISEND');
});
test('laotöötaja ei saa komplekti muuta', () => {
  assert.strictEqual(A('tooted.muuda', { id: saag, komplekt_id: trell }, mati).code, 'POLE_OIGUST');
  assert.strictEqual(lisa({ nimetus: 'Y', tyyp: 'TÖÖRIIST', komplekt_id: trell }, mati).code, 'POLE_OIGUST');
});
test('muu välja muutmine ei puuduta komplekti; tühi väärtus eemaldab', () => {
  A('tooted.muuda', { id: aku1, nimetus: 'Aku 5Ah' });
  assert.strictEqual(toode(aku1).komplekt_id, trell);
  assert(A('tooted.muuda', { id: aku1, komplekt_id: '' }).ok);
  assert.strictEqual(toode(aku1).komplekt_id, '');
});
test('osa liigub eraldi: aku välja, trell jääb lattu', () => {
  A('tooted.muuda', { id: aku1, komplekt_id: trell });
  const r = A('liikumised.lisa', { liikumised: [{ id: crypto.randomUUID(), toote_id: aku1, tyyp: 'VÄLJA_ANTUD', kellele_kuhu: 'Objekt' }] }, mati);
  assert(r.ok, JSON.stringify(r));
  assert.strictEqual(toode(aku1).olek, 'VÄLJA ANTUD');
  assert.strictEqual(toode(trell).olek, 'LAOS');
});

console.log(`\n${ok} testi korras`);
