/** Etapi 8 testid: Masinakulude sidumine (masinad, VÄLJA masinale, SISSE arvelt). Käivita: node tests/test-etapp8.js */
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
const admin = post({ action: 'esimeneAdmin', data: { seadistuskood: K.props.get('SEADISTUSKOOD'), kasutajanimi: 'henri', nimi: 'Henri', pin: '1234' } }).data.token;
post({ action: 'kasutajad.lisa', token: admin, data: { kasutajanimi: 'mati', nimi: 'Mati', roll: 'LAOTÖÖTAJA', pin: '5555' } });
const mati = post({ action: 'login', data: { kasutajanimi: 'mati', pin: '5555' } }).data.token;
const A = (action, data, token) => post({ action, token: token || admin, data });
const uid = () => crypto.randomUUID();

console.log('Masinad');
test('masinad.salvesta lisab, uuendab ja peidab; andmed annab aktiivsed', () => {
  let r = A('masinad.salvesta', { masinad: [{ id: '1', nimi: 'JD 1270G-5750', kood: '5750' }, { id: '2', nimi: 'Ponsse 1010G' }] });
  assert(r.ok, JSON.stringify(r)); assert.strictEqual(r.data.lisatud, 2);
  assert.deepStrictEqual(A('andmed', {}, mati).data.masinad.map(m => m.nimi), ['JD 1270G-5750', 'Ponsse 1010G']);
  r = A('masinad.salvesta', { masinad: [{ id: '1', nimi: 'JD 1270G-5750 (uus)', kood: '5750' }] });
  assert.strictEqual(r.data.muudetud, 1); assert.strictEqual(r.data.peidetud, 1);
  assert.deepStrictEqual(A('andmed', {}, mati).data.masinad.map(m => m.nimi), ['JD 1270G-5750 (uus)']);
});
test('masinad.salvesta ainult adminile', () => {
  const r = A('masinad.salvesta', { masinad: [] }, mati);
  assert.strictEqual(r.ok, false); assert.strictEqual(r.code, 'POLE_OIGUST');
});
test('Masinad leht luuakse vajadusel ise (vana tabel ilma lehteta)', () => {
  K.ss.deleteSheet(K.ss.getSheetByName('Masinad'));
  assert.deepStrictEqual(A('andmed').data.masinad, []);
  assert.ok(A('masinad.salvesta', { masinad: [{ id: '9', nimi: 'Testmasin' }] }).ok);
});

console.log('SISSE arvelt ja VÄLJA masinale');
test('Masinakulud loob toote oma id-ga ja teeb SISSE; korduv saatmine on duplikaat', () => {
  const r = A('tooted.lisa', { id: 'MK-T-0001', nimetus: 'Hüdroõli filter', tyyp: 'VARUOSA', kood: 'HF6177' });
  assert(r.ok, JSON.stringify(r));
  const id = 'MK-886-1';
  let l = A('liikumised.lisa', { liikumised: [{ id, toote_id: 'MK-T-0001', tyyp: 'SISSE', kogus: 4, markus: 'E-Varula 266418' }] });
  assert.strictEqual(l.data.tooted[0].saldo, 4);
  l = A('liikumised.lisa', { liikumised: [{ id, toote_id: 'MK-T-0001', tyyp: 'SISSE', kogus: 4 }] });
  assert.strictEqual(l.data.tulemused[0].duplikaat, true);
  assert.strictEqual(A('andmed').data.tooted.find(t => t.id === 'MK-T-0001').saldo, 4);
});
test('VÄLJA salvestab masina (kellele_kuhu) ja see on liikumiste nimekirjas', () => {
  const id = uid();
  A('liikumised.lisa', { liikumised: [{ id, toote_id: 'MK-T-0001', tyyp: 'VÄLJA', kogus: 1, kellele_kuhu: 'JD 1270G-5750 (uus)' }] }, mati);
  const n = A('liikumised.nimekiri', { tyyp: 'VÄLJA' }).data.read.find(x => x.id === id);
  assert.strictEqual(n.kellele_kuhu, 'JD 1270G-5750 (uus)'); assert.strictEqual(n.kogus, 1); assert.strictEqual(n.arvesse, true);
});
test('VÄLJA ilma masinata töötab nagu enne', () => {
  const r = A('liikumised.lisa', { liikumised: [{ id: uid(), toote_id: 'MK-T-0001', tyyp: 'VÄLJA', kogus: 1 }] }, mati);
  assert.strictEqual(r.data.tulemused[0].ok, true); assert.strictEqual(r.data.tooted[0].saldo, 2);
});

console.log(`\n${ok} testi korras`);
