/** Tehase QR-kood (tühikud ja püstkriipsud) toote koodina. Käivita: node tests/test-tehasekood.js */
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { looKeskkond } = require('./gas-mock');

let ok = 0;
function test(nimi, fn) {
  try { fn(); ok++; console.log('  ✓ ' + nimi); }
  catch (e) { console.log('  ✗ ' + nimi + '\n    ' + e.message); process.exitCode = 1; }
}

const TOORES = '| 4523 85 0C 00000589 K2025 | M12-18FC';
const PUHAS = '4523-85-0C-00000589-K2025-M12-18FC';

// Esipaneeli funktsioonid (js/andmed.js) – laeme minimaalse brauserikeskkonnaga
const LAO = {};
const kast = { window: { LAO }, LAO, console, setTimeout, clearTimeout, setInterval() { return 0; }, localStorage: { getItem() { return null; }, setItem() {} },
  navigator: { onLine: true }, document: { addEventListener() {} }, indexedDB: undefined };
kast.window.addEventListener = function () {};
vm.createContext(kast);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/andmed.js'), 'utf8'), kast);

console.log('Esipaneel');
test('puhastaKood: tehase QR → sidekriipsudega kood', () => {
  assert.strictEqual(LAO.puhastaKood(TOORES), PUHAS);
  assert.strictEqual(LAO.puhastaKood('  L-ABC123 \n'), 'L-ABC123');
  assert.strictEqual(LAO.puhastaKood('4006381333931'), '4006381333931');
  assert.strictEqual(LAO.puhastaKood('A\u001dB'), 'A-B'); // GS1 eraldaja
});
test('tehaseMudel leiab mudeli', () => {
  assert.strictEqual(LAO.tehaseMudel(TOORES), 'M12-18FC');
  assert.strictEqual(LAO.tehaseMudel('4006381333931'), '');
  assert.strictEqual(LAO.tehaseMudel('L-ABC123'), '');
});

const K = looKeskkond();
const { post, g } = K;
g.seadista();
const admin = post({ action: 'esimeneAdmin', data: { seadistuskood: K.props.get('SEADISTUSKOOD'), kasutajanimi: 'admin', nimi: 'Admin', pin: '1234' } }).data.token;
const A = (action, data) => post({ action, token: admin, data });

console.log('Server');
let id;
test('toores tehasekood salvestatakse puhastatuna (vana telefoni järjekord)', () => {
  id = 'P-' + crypto.randomUUID().slice(0, 8);
  const r = A('tooted.lisa', { id, vorguta: true, nimetus: 'Laadija M12-18FC', tyyp: 'TÖÖRIIST', kood: TOORES });
  assert(r.ok, JSON.stringify(r));
  assert.strictEqual(r.data[0].koodid[0].kood, PUHAS);
});
test('sama tehasekood uuesti → sama toode (ei teki duplikaati)', () => {
  const r = A('tooted.lisa', { id: 'P-' + crypto.randomUUID().slice(0, 8), vorguta: true, nimetus: 'X', tyyp: 'TÖÖRIIST', kood: PUHAS });
  assert(r.ok, JSON.stringify(r));
  assert.strictEqual(r.data[0].id, id);
  const r2 = A('tooted.lisa', { nimetus: 'Y', tyyp: 'TÖÖRIIST', kood: TOORES });
  assert.strictEqual(r2.code, 'DUPLIKAAT');
});
test('teise eksemplari (teine seerianumber) kood on erinev', () => {
  const r = A('tooted.lisa', { nimetus: 'Laadija M12-18FC', tyyp: 'TÖÖRIIST', kood: '| 4523 85 0C 00000590 K2025 | M12-18FC' });
  assert(r.ok, JSON.stringify(r));
  assert.strictEqual(r.data[0].koodid[0].kood, '4523-85-0C-00000590-K2025-M12-18FC');
});
test('vana L- kood töötab edasi', () => {
  const r = A('tooted.lisa', { nimetus: 'Aku', tyyp: 'TÖÖRIIST', kood: 'L-ABC123' });
  assert(r.ok, JSON.stringify(r));
  assert.strictEqual(r.data[0].koodid[0].kood, 'L-ABC123');
});

console.log('\n' + ok + ' testi' + (process.exitCode ? ', osa EBAÕNNESTUS' : ' korras'));
