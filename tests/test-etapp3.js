/** Etapi 3 serveripoolsed testid (liikumised). Käivita: node tests/test-etapp3.js */
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
post({ action: 'kasutajad.lisa', token: admin, data: { kasutajanimi: 'mati', nimi: 'Mati', roll: 'LAOTÖÖTAJA', pin: '5555' } });
post({ action: 'kasutajad.lisa', token: admin, data: { kasutajanimi: 'kati', nimi: 'Kati', roll: 'LAOTÖÖTAJA', pin: '6666' } });
const mati = post({ action: 'login', data: { kasutajanimi: 'mati', pin: '5555' } }).data.token;
const kati = post({ action: 'login', data: { kasutajanimi: 'kati', pin: '6666' } }).data.token;
const A = (action, data, token) => post({ action, token: token || admin, data });
const uid = () => crypto.randomUUID();
const L = (liikumised, token) => A('liikumised.lisa', { liikumised }, token || mati);
const toode = (nimi) => A('andmed').data.tooted.find(t => t.nimetus === nimi);

const r1 = A('riiulid.lisa', { kood: 'A01' }).data, r2 = A('riiulid.lisa', { kood: 'A02' }).data;
A('tooted.lisa', { nimetus: 'Kruvi', tyyp: 'VARUOSA', riiul_id: r1.id, algsaldo: 10 });
A('tooted.lisa', { nimetus: 'Trell', tyyp: 'TÖÖRIIST' });
const kruvi = toode('Kruvi').id, trell = toode('Trell').id;

console.log('SISSE / VÄLJA');
test('SISSE ja VÄLJA muudavad saldot, vastuses uus seis', () => {
  let r = L([{ id: uid(), toote_id: kruvi, tyyp: 'SISSE', kogus: 5, markus: 'Arve 123' }]);
  assert(r.ok && r.data.tulemused[0].ok, JSON.stringify(r));
  assert.strictEqual(r.data.tooted[0].saldo, 15);
  r = L([{ id: uid(), toote_id: kruvi, tyyp: 'VÄLJA', kogus: '2,5' }]);
  assert.strictEqual(r.data.tooted[0].saldo, 12.5);
  assert.strictEqual(r.data.tulemused[0].konflikt, false);
});
test('kasutaja salvestub serveri seansist, märkus ja aeg telefonist', () => {
  const aeg = '2026-10-22T08:00:00.000Z';
  const id = uid();
  L([{ id, toote_id: kruvi, tyyp: 'SISSE', kogus: 1, skannimise_aeg: aeg, markus: 'tarnija X' }]);
  const rida = K.ss.getSheetByName('Liikumised')._andmed.find(r => r[0] === id);
  assert.strictEqual(rida[7].toISOString(), aeg);
  assert.strictEqual(rida[5], 'tarnija X');
  const matiId = A('kasutajad.nimekiri').data.find(k => k.kasutajanimi === 'mati').id;
  assert.strictEqual(rida[6], matiId);
});
test('sama id teist korda → duplikaat, saldo ei muutu', () => {
  const id = uid();
  L([{ id, toote_id: kruvi, tyyp: 'SISSE', kogus: 1 }]);
  const s1 = toode('Kruvi').saldo;
  const r = L([{ id, toote_id: kruvi, tyyp: 'SISSE', kogus: 1 }]);
  assert.strictEqual(r.data.tulemused[0].duplikaat, true);
  assert.strictEqual(toode('Kruvi').saldo, s1);
});
test('negatiivne saldo → salvestatakse konfliktiga', () => {
  const r = L([{ id: uid(), toote_id: kruvi, tyyp: 'VÄLJA', kogus: 100 }]);
  assert.strictEqual(r.data.tulemused[0].ok, true);
  assert.strictEqual(r.data.tulemused[0].konflikt, true);
  assert(r.data.tulemused[0].pohjus.includes('negatiivseks'));
  assert(toode('Kruvi').saldo < 0);
});
test('vigased liikumised: kogus 0, tööriista SISSE, varuosa väljaandmine, tundmatu toode, id puudu', () => {
  const r = L([
    { id: uid(), toote_id: kruvi, tyyp: 'SISSE', kogus: 0 },
    { id: uid(), toote_id: trell, tyyp: 'SISSE', kogus: 1 },
    { id: uid(), toote_id: kruvi, tyyp: 'VÄLJA_ANTUD', kellele_kuhu: 'x' },
    { id: uid(), toote_id: 'pole', tyyp: 'SISSE', kogus: 1 },
    { toote_id: kruvi, tyyp: 'SISSE', kogus: 1 }
  ]);
  assert.deepStrictEqual(r.data.tulemused.map(t => t.ok), [false, false, false, false, false]);
});

console.log('Tööriistad');
test('välja antud → olek, kellele; teine väljaandmine = konflikt', () => {
  let r = L([{ id: uid(), toote_id: trell, tyyp: 'VÄLJA_ANTUD', kellele_kuhu: 'Objekt Tartu' }]);
  assert.strictEqual(r.data.tooted[0].olek, 'VÄLJA ANTUD');
  assert.strictEqual(r.data.tooted[0].kellele, 'Objekt Tartu');
  r = L([{ id: uid(), toote_id: trell, tyyp: 'VÄLJA_ANTUD', kellele_kuhu: 'Jaan' }], kati);
  assert.strictEqual(r.data.tulemused[0].konflikt, true);
  assert(r.data.tulemused[0].pohjus.includes('Objekt Tartu'));
});
test('kellele/kuhu kohustuslik', () => {
  assert.strictEqual(L([{ id: uid(), toote_id: trell, tyyp: 'VÄLJA_ANTUD', kellele_kuhu: ' ' }]).data.tulemused[0].ok, false);
});
test('tagastamine → LAOS; teine tagastus = konflikt', () => {
  let r = L([{ id: uid(), toote_id: trell, tyyp: 'TAGASTATUD' }]);
  assert.strictEqual(r.data.tooted[0].olek, 'LAOS');
  r = L([{ id: uid(), toote_id: trell, tyyp: 'TAGASTATUD' }]);
  assert.strictEqual(r.data.tulemused[0].konflikt, true);
});
test('kellele soovitused andmetes', () => {
  assert.deepStrictEqual(A('andmed').data.kelleleSoovitused, ['Jaan', 'Objekt Tartu']);
});
test('olekumuutus ainult admin', () => {
  assert.strictEqual(L([{ id: uid(), toote_id: trell, tyyp: 'OLEKU_MUUTUS', kellele_kuhu: 'REMONDIS' }]).data.tulemused[0].ok, false);
  const r = L([{ id: uid(), toote_id: trell, tyyp: 'OLEKU_MUUTUS', kellele_kuhu: 'remondis' }], admin);
  assert.strictEqual(r.data.tooted[0].olek, 'REMONDIS');
  const v = L([{ id: uid(), toote_id: trell, tyyp: 'VÄLJA_ANTUD', kellele_kuhu: 'Jaan' }]);
  assert(v.data.tulemused[0].pohjus.includes('REMONDIS'));
  L([{ id: uid(), toote_id: trell, tyyp: 'TAGASTATUD' }]);
});

console.log('Ümberpaigutus, inventuur, arhiiv');
test('ümberpaigutus muudab toote riiulit (ka laotöötaja)', () => {
  const r = L([{ id: uid(), toote_id: kruvi, tyyp: 'ÜMBERPAIGUTUS', kellele_kuhu: r2.id }]);
  assert(r.data.tulemused[0].ok, JSON.stringify(r.data));
  assert.strictEqual(r.data.tooted[0].riiul_id, r2.id);
  assert.strictEqual(toode('Kruvi').riiul_id, r2.id);
  const rida = K.ss.getSheetByName('Liikumised')._andmed.slice(-1)[0];
  assert.strictEqual(rida[5], 'R-A01 → R-A02');
});
test('inventuur: tegelik kogus → vahe (ainult admin)', () => {
  assert.strictEqual(L([{ id: uid(), toote_id: kruvi, tyyp: 'KORRIGEERIMINE', tegelikKogus: 7 }]).data.tulemused[0].ok, false);
  const enne = toode('Kruvi').saldo;
  const r = L([{ id: uid(), toote_id: kruvi, tyyp: 'KORRIGEERIMINE', tegelikKogus: '7' }], admin);
  assert.strictEqual(r.data.tooted[0].saldo, 7);
  const rida = K.ss.getSheetByName('Liikumised')._andmed.slice(-1)[0];
  assert.strictEqual(rida[3], 7 - enne);
  assert(rida[5].startsWith('Inventuur: tegelik 7'));
});
test('arhiveeritud toode → konflikt', () => {
  A('tooted.arhiveeri', { id: kruvi });
  const r = L([{ id: uid(), toote_id: kruvi, tyyp: 'SISSE', kogus: 1 }]);
  assert(r.data.tulemused[0].pohjus.includes('arhiveeritud'));
  A('tooted.arhiveeri', { id: kruvi, arhiveeritud: false });
});

console.log('Tühistamine');
test('laotöötaja tühistab oma viimase liikumise', () => {
  const id = uid();
  L([{ id, toote_id: kruvi, tyyp: 'VÄLJA', kogus: 3 }]);
  const enne = toode('Kruvi').saldo;
  const r = L([{ id: uid(), tyyp: 'TÜHISTUS', viide: id }]);
  assert(r.data.tulemused[0].ok, JSON.stringify(r.data));
  assert.strictEqual(r.data.tooted[0].saldo, enne + 3);
  assert.strictEqual(toode('Kruvi').saldo, enne + 3);
});
test('teist korda tühistada ei saa; mitte-viimast ei saa; teise oma ei saa', () => {
  const a = uid(), b = uid();
  L([{ id: a, toote_id: kruvi, tyyp: 'SISSE', kogus: 1 }, { id: b, toote_id: kruvi, tyyp: 'SISSE', kogus: 1 }]);
  assert.strictEqual(L([{ id: uid(), tyyp: 'TÜHISTUS', viide: a }]).data.tulemused[0].ok, false);
  assert.strictEqual(L([{ id: uid(), tyyp: 'TÜHISTUS', viide: b }], kati).data.tulemused[0].ok, false);
  assert(L([{ id: uid(), tyyp: 'TÜHISTUS', viide: b }]).data.tulemused[0].ok);
  assert.strictEqual(L([{ id: uid(), tyyp: 'TÜHISTUS', viide: b }]).data.tulemused[0].ok, false);
  // pärast b tühistamist on a jälle viimane
  assert(L([{ id: uid(), tyyp: 'TÜHISTUS', viide: a }]).data.tulemused[0].ok);
});
test('admin tühistab mis tahes liikumise; tööriista väljaandmise tühistus taastab oleku', () => {
  const id = uid();
  L([{ id, toote_id: trell, tyyp: 'VÄLJA_ANTUD', kellele_kuhu: 'Peeter' }], kati);
  L([{ id: uid(), toote_id: kruvi, tyyp: 'SISSE', kogus: 1 }], kati);
  const r = L([{ id: uid(), tyyp: 'TÜHISTUS', viide: id }], admin);
  assert(r.data.tulemused[0].ok);
  assert.strictEqual(toode('Trell').olek, 'LAOS');
});
test('ümberpaigutust ei tühistata', () => {
  const id = uid();
  L([{ id, toote_id: kruvi, tyyp: 'ÜMBERPAIGUTUS', kellele_kuhu: r1.id }]);
  assert.strictEqual(L([{ id: uid(), tyyp: 'TÜHISTUS', viide: id }]).data.tulemused[0].ok, false);
});

console.log('Mitu liikumist korraga');
test('pakis töödeldakse järjest (teine väljaandmine samas pakis = konflikt)', () => {
  const r = L([
    { id: uid(), toote_id: trell, tyyp: 'VÄLJA_ANTUD', kellele_kuhu: 'A' },
    { id: uid(), toote_id: trell, tyyp: 'VÄLJA_ANTUD', kellele_kuhu: 'B' },
    { id: uid(), toote_id: trell, tyyp: 'TAGASTATUD' }
  ]);
  assert.deepStrictEqual(r.data.tulemused.map(t => t.konflikt), [false, true, false]);
  assert.strictEqual(r.data.tooted.find(t => t.id === trell).olek, 'LAOS');
});
test('tuleviku aeg asendatakse serveri ajaga', () => {
  const id = uid();
  L([{ id, toote_id: kruvi, tyyp: 'SISSE', kogus: 1, skannimise_aeg: '2099-01-01T00:00:00Z' }]);
  const rida = K.ss.getSheetByName('Liikumised')._andmed.find(r => r[0] === id);
  assert(rida[7].getFullYear() < 2099);
});
test('liiga suur pakk keelatud', () => {
  const r = L(Array.from({ length: 201 }, () => ({ id: uid(), toote_id: kruvi, tyyp: 'SISSE', kogus: 1 })));
  assert.strictEqual(r.code, 'VALE_SISEND');
});

console.log(`\n${ok} testi õnnestus` + (process.exitCode ? ', osa EBAÕNNESTUS' : ''));
