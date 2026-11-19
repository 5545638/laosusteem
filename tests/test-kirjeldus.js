/** Toote kirjeldus (Code.gs 1.8.0). Käivita: node tests/test-kirjeldus.js */
const assert = require('assert');
const { looKeskkond } = require('./gas-mock');

let ok = 0;
function test(nimi, fn) {
  try { fn(); ok++; console.log('  ✓ ' + nimi); }
  catch (e) { console.log('  ✗ ' + nimi + '\n    ' + e.message); process.exitCode = 1; }
}

const K = looKeskkond();
const { post, g } = K;
g.seadista();
const admin = post({ action: 'esimeneAdmin', data: { seadistuskood: K.props.get('SEADISTUSKOOD'), kasutajanimi: 'mari', nimi: 'Mari', pin: '1234' } }).data.token;
post({ action: 'kasutajad.lisa', token: admin, data: { kasutajanimi: 'mati', nimi: 'Mati', roll: 'LAOTÖÖTAJA', pin: '5555' } });
const mati = post({ action: 'login', data: { kasutajanimi: 'mati', pin: '5555' } }).data.token;
const A = (action, data, token) => post({ action, token: token || admin, data });
const toode = id => A('andmed', {}).data.tooted.find(t => t.id === id);

const uus = A('tooted.lisa', { kood: 'KIRJ1', nimetus: 'Filter', tyyp: 'VARUOSA', kirjeldus: '  Sobib pumbale X\nTellida: tarnija A  ' }).data[0];
test('lisamisel kirjeldus salvestub (trimmitud)', () => assert.strictEqual(toode(uus.id).kirjeldus, 'Sobib pumbale X\nTellida: tarnija A'));
const ilma = A('tooted.lisa', { kood: 'KIRJ2', nimetus: 'Mutter', tyyp: 'VARUOSA' }).data[0];
test('kirjelduseta toode → tühi tekst', () => assert.strictEqual(toode(ilma.id).kirjeldus, ''));
test('laotöötaja saab kirjeldust muuta', () => {
  const r = A('tooted.kirjeldus', { id: ilma.id, kirjeldus: 'M8, roostevaba' }, mati);
  assert.ok(r.ok, r.error);
  assert.strictEqual(toode(ilma.id).kirjeldus, 'M8, roostevaba');
});
test('admin muudab tootekaardilt (tooted.muuda)', () => {
  assert.ok(A('tooted.muuda', { id: uus.id, kirjeldus: '' }).ok);
  assert.strictEqual(toode(uus.id).kirjeldus, '');
});
test('laotöötaja ei saa tooted.muuda kaudu', () => assert.strictEqual(A('tooted.muuda', { id: uus.id, kirjeldus: 'x' }, mati).ok, false));
test('pikkus piiratud 1000 märgiga', () => {
  A('tooted.kirjeldus', { id: ilma.id, kirjeldus: 'a'.repeat(1500) }, mati);
  assert.strictEqual(toode(ilma.id).kirjeldus.length, 1000);
});
test('tundmatu toode → viga', () => assert.strictEqual(A('tooted.kirjeldus', { id: 'P-POLE', kirjeldus: 'x' }).ok, false));
console.log(ok + ' testi läbis');
