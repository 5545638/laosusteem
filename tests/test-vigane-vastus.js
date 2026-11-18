/** Vigane „andmed” vastus ei tohi seadme nimekirja rikkuda. Käivita: node tests/test-vigane-vastus.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let vastus = null;
const LAO = {};
const API = { kutsu() { return Promise.resolve(vastus); }, seanss() { return null; } };
const kast = { window: { LAO }, LAO, API, console, setTimeout, clearTimeout, setInterval() { return 0; },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  navigator: { onLine: true }, document: { addEventListener() {}, dispatchEvent() {} }, CustomEvent: function () {}, indexedDB: undefined };
kast.window.addEventListener = function () {};
vm.createContext(kast);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/andmed.js'), 'utf8'), kast);

(async () => {
  let ok = 0;
  async function test(nimi, fn) {
    try { await fn(); ok++; console.log('  ✓ ' + nimi); }
    catch (e) { console.log('  ✗ ' + nimi + '\n    ' + e.message); process.exitCode = 1; }
  }
  vastus = { tooted: [{ id: 't1', nimetus: 'Aku', tyyp: 'VARUOSA', koodid: [{ kood: 'A1' }], saldo: 2 }], riiulid: [], serveriAeg: 'x' };
  await test('korras vastus laetakse', async () => {
    await LAO.laeAndmed();
    assert.strictEqual(LAO.andmed.tooted.length, 1);
  });
  for (const vale of [{ ok: true }, { versioon: '1.0' }, null, 'tekst']) {
    vastus = vale;
    await test('vigane vastus ' + JSON.stringify(vale) + ' → selge viga, nimekiri jääb alles', async () => {
      await assert.rejects(LAO.laeAndmed(), /vales vormis/);
      assert.ok(Array.isArray(LAO.andmed.tooted));
      assert.strictEqual(LAO.andmed.tooted.length, 1);
    });
  }
  await test('rakendaOotel ei viska, kui nimekiri on rikutud', async () => {
    LAO.andmed.tooted = undefined;
    LAO.rakendaOotel();
    assert.ok(Array.isArray(LAO.andmed.tooted));
  });
  console.log(ok + ' testi korras');
})();
