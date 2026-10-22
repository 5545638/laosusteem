/** Etappide 5–6 serveripoolsed testid (sildipõhjad, ajalugu). Käivita: node tests/test-etapp56.js */
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
const admin = post({ action: 'esimeneAdmin', data: { seadistuskood: K.props.get('SEADISTUSKOOD'), kasutajanimi: 'mari', nimi: 'Mari', pin: '1234' } }).data.token;
const A = (action, data, token) => post({ action, token: token || admin, data });
A('kasutajad.lisa', { kasutajanimi: 'mati', nimi: 'Mati', roll: 'LAOTÖÖTAJA', pin: '5555' });
const mati = post({ action: 'login', data: { kasutajanimi: 'mati', pin: '5555' } }).data.token;
const uid = () => crypto.randomUUID();

console.log('Sildipõhjad');
let pohiId;
test('admin salvestab ja muudab põhja, kõik näevad', () => {
  const r = A('sildipohjad.salvesta', { nimi: 'Väike 50×25', laius_mm: 50, korgus_mm: 25, paigutus: 'toode', seaded: { veeris_mm: 2, font_pt: 9 } });
  assert(r.ok, JSON.stringify(r));
  pohiId = r.data.id;
  assert(A('sildipohjad.salvesta', { id: pohiId, nimi: 'Väike 50×25 mm', laius_mm: 50, korgus_mm: 25, paigutus: 'TOODE', seaded: { veeris_mm: 3 } }).ok);
  const n = A('sildipohjad.nimekiri', {}, mati).data;
  assert.strictEqual(n.length, 1);
  assert.strictEqual(n[0].nimi, 'Väike 50×25 mm');
  assert.strictEqual(n[0].korgus_mm, 25);
  assert.strictEqual(n[0].seaded.veeris_mm, 3);
});
test('laotöötaja ei saa salvestada; vigased mõõdud ja paigutus keelatud', () => {
  assert.strictEqual(A('sildipohjad.salvesta', { nimi: 'x', laius_mm: 50, korgus_mm: 25, paigutus: 'TOODE' }, mati).code, 'POLE_OIGUST');
  assert.strictEqual(A('sildipohjad.salvesta', { nimi: 'x', laius_mm: 5, korgus_mm: 25, paigutus: 'TOODE' }).ok, false);
  assert.strictEqual(A('sildipohjad.salvesta', { nimi: 'x', laius_mm: 50, korgus_mm: 25, paigutus: 'MUU' }).ok, false);
});
test('kustutamine', () => {
  assert(A('sildipohjad.kustuta', { id: pohiId }).ok);
  assert.strictEqual(A('sildipohjad.nimekiri').data.length, 0);
});

console.log('Ajalugu');
A('riiulid.lisa', { kood: 'A01' }); const r2 = A('riiulid.lisa', { kood: 'A02' }).data;
A('tooted.lisa', { nimetus: 'Kruvi', algsaldo: 10 });
A('tooted.lisa', { nimetus: 'Trell', tyyp: 'TÖÖRIIST' });
const tooted = A('andmed').data.tooted;
const kruvi = tooted.find(t => t.nimetus === 'Kruvi').id, trell = tooted.find(t => t.nimetus === 'Trell').id;
const v1 = uid();
A('liikumised.lisa', { liikumised: [
  { id: uid(), toote_id: kruvi, tyyp: 'SISSE', kogus: 5, skannimise_aeg: '2026-10-01T09:00:00Z', markus: 'Arve 1' },
  { id: v1, toote_id: kruvi, tyyp: 'VÄLJA', kogus: 2, skannimise_aeg: '2026-10-05T21:30:00Z' },
  { id: uid(), toote_id: trell, tyyp: 'VÄLJA_ANTUD', kellele_kuhu: 'Jaan', skannimise_aeg: '2026-10-06T08:00:00Z' },
  { id: uid(), toote_id: kruvi, tyyp: 'ÜMBERPAIGUTUS', kellele_kuhu: r2.id, skannimise_aeg: '2026-10-07T08:00:00Z' }
] }, mati);
A('liikumised.lisa', { liikumised: [{ id: uid(), tyyp: 'TÜHISTUS', viide: v1 }] });

test('kõik liikumised, uuemad eespool; nimed ja kasutajad', () => {
  const d = A('liikumised.nimekiri', {}, mati).data;
  assert.strictEqual(d.kokku, 6); // algsaldo + 4 + tühistus
  assert.strictEqual(d.read[0].tyyp, 'TÜHISTUS');
  assert(d.read[0].kellele_kuhu.startsWith('Tühistab: VÄLJA'));
  const valja = d.read.find(r => r.id === v1);
  assert.strictEqual(valja.tyhistatud, true);
  assert.strictEqual(valja.kasutaja, 'Mati');
  assert.strictEqual(valja.nimetus, 'Kruvi');
  assert.strictEqual(d.read.find(r => r.tyyp === 'ÜMBERPAIGUTUS').kellele_kuhu, 'R-A02');
  assert.deepStrictEqual(d.kasutajad.map(k => k.nimi), ['Mari', 'Mati']);
});
test('filtrid: kuupäev (Eesti aja järgi), toode, tüüp, kasutaja', () => {
  // 2026-10-05T21:30Z on Eestis juba 6. oktoober
  let d = A('liikumised.nimekiri', { alates: '2026-10-06', kuni: '2026-10-06' }).data;
  assert.deepStrictEqual(d.read.map(r => r.tyyp).sort(), ['VÄLJA', 'VÄLJA_ANTUD']);
  d = A('liikumised.nimekiri', { toote_id: trell }).data;
  assert.strictEqual(d.kokku, 1);
  d = A('liikumised.nimekiri', { tyyp: 'SISSE' }).data;
  assert.strictEqual(d.read[0].markus, 'Arve 1');
  const matiId = d.kasutajad.find(k => k.nimi === 'Mati').id;
  d = A('liikumised.nimekiri', { kasutaja_id: matiId }).data;
  assert.strictEqual(d.kokku, 4);
  assert.strictEqual(A('liikumised.nimekiri', { alates: '6.10.2026' }).ok, false);
});
test('max piirab ridu, kokku näitab kõiki', () => {
  const d = A('liikumised.nimekiri', { max: 2 }).data;
  assert.strictEqual(d.read.length, 2);
  assert.strictEqual(d.kokku, 6);
});

console.log('\n' + ok + ' testi õnnestus');
