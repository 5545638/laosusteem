/** Kiiruse muudatuste serveripoolsed testid (Saldode leht, kitsad lugemised, soojendus). Käivita: node tests/test-kiirus.js */
const assert = require('assert');
const crypto = require('crypto');
const { looKeskkond } = require('./gas-mock');

let ok = 0;
function test(nimi, fn) {
  try { fn(); ok++; console.log('  ✓ ' + nimi); }
  catch (e) { console.log('  ✗ ' + nimi + '\n    ' + e.message); process.exitCode = 1; }
}

const K = looKeskkond();
const { post, g, io } = K;
g.seadista();
const admin = post({ action: 'esimeneAdmin', data: { seadistuskood: K.props.get('SEADISTUSKOOD'), kasutajanimi: 'mari', nimi: 'Mari', pin: '1234' } }).data.token;
const A = (action, data, token) => post({ action, token: token || admin, data });
A('kasutajad.lisa', { kasutajanimi: 'mati', nimi: 'Mati', roll: 'LAOTÖÖTAJA', pin: '5555' });
const mati = post({ action: 'login', data: { kasutajanimi: 'mati', pin: '5555' } }).data.token;
const uid = () => crypto.randomUUID();
const L = (liikumised, token) => A('liikumised.lisa', { liikumised }, token || mati);
const toode = (nimi) => A('andmed').data.tooted.find(t => t.nimetus === nimi);

A('tooted.lisa', { nimetus: 'Kruvi', tyyp: 'VARUOSA', algsaldo: 10 });
A('tooted.lisa', { nimetus: 'Trell', tyyp: 'TÖÖRIIST' });
const kruvi = toode('Kruvi').id, trell = toode('Trell').id;

console.log('Soojendus ja aja mõõtmine');
test('„soe” töötab ilma sisselogimiseta ega loe tabelit; vastuses on serveri aeg (ms)', () => {
  const enne = io.lugemisi;
  const r = post({ action: 'soe' });
  assert(r.ok && r.data.versioon, JSON.stringify(r));
  assert.strictEqual(io.lugemisi, enne);
  assert.strictEqual(typeof r.ms, 'number');
  assert.strictEqual(typeof A('andmed').ms, 'number');
});
test('paigaldaSoojendus loob ühe 5-minutilise päästiku ka korduval käivitamisel', () => {
  g.paigaldaSoojendus();
  g.paigaldaSoojendus();
  const p = g.ScriptApp._paastikud;
  assert.strictEqual(p.length, 1);
  assert.strictEqual(p[0].getHandlerFunction(), 'soojenda');
  assert.strictEqual(p[0].minutid, 5);
  g.soojenda();
  assert.strictEqual(g.eemaldaSoojendus(), 1);
});

console.log('Saldode leht');
test('liikumine uuendab ainult oma toote rida; algsaldo on lehel', () => {
  const sh = K.ss.getSheetByName('Saldod');
  const rida = (tid) => sh._andmed.find(r => r[0] === tid);
  assert.strictEqual(rida(kruvi)[1], 10);
  L([{ id: uid(), toote_id: kruvi, tyyp: 'VÄLJA', kogus: 3 }]);
  assert.strictEqual(rida(kruvi)[1], 7);
  L([{ id: uid(), toote_id: trell, tyyp: 'VÄLJA_ANTUD', kellele_kuhu: 'Objekt Tartu' }]);
  assert.strictEqual(rida(trell)[2], 'VÄLJA ANTUD');
  assert.strictEqual(rida(trell)[3], 'Objekt Tartu');
  assert.strictEqual(toode('Kruvi').saldo, 7);
  assert.strictEqual(toode('Trell').kellele, 'Objekt Tartu');
});
test('tavaline liikumine ei loe kogu Liikumiste lehte (ainult id-veerg)', () => {
  L(Array.from({ length: 150 }, () => ({ id: uid(), toote_id: kruvi, tyyp: 'SISSE', kogus: 1 })));
  L(Array.from({ length: 150 }, () => ({ id: uid(), toote_id: kruvi, tyyp: 'VÄLJA', kogus: 1 })));
  const liikumisi = K.ss.getSheetByName('Liikumised')._andmed.length - 1;
  const enne = io.loetudRakke;
  L([{ id: uid(), toote_id: kruvi, tyyp: 'SISSE', kogus: 1 }]);
  const loetud = io.loetudRakke - enne;
  assert(loetud < liikumisi * 2, // kogu leht oleks 12 lahtrit rea kohta
    'loeti ' + loetud + ' lahtrit, liikumisi ' + liikumisi);
});
test('topeltsaatmine kiires kontekstis: duplikaat koos algse konfliktiinfoga', () => {
  const id = uid();
  const r1 = L([{ id, toote_id: kruvi, tyyp: 'VÄLJA', kogus: 1000 }]);
  assert.strictEqual(r1.data.tulemused[0].konflikt, true);
  const saldo = toode('Kruvi').saldo;
  const r2 = L([{ id, toote_id: kruvi, tyyp: 'VÄLJA', kogus: 1000 }]);
  assert(r2.data.tulemused[0].duplikaat);
  assert.strictEqual(r2.data.tulemused[0].konflikt, true);
  assert(r2.data.tulemused[0].pohjus.includes('negatiivseks'));
  assert.strictEqual(toode('Kruvi').saldo, saldo);
});
test('tühistus (kogu ajaloo kontekst) uuendab samuti Saldode lehte', () => {
  const id = uid();
  L([{ id, toote_id: kruvi, tyyp: 'VÄLJA', kogus: 2 }]);
  const enne = toode('Kruvi').saldo;
  assert(L([{ id: uid(), tyyp: 'TÜHISTUS', viide: id }]).data.tulemused[0].ok);
  assert.strictEqual(toode('Kruvi').saldo, enne + 2);
  assert.deepStrictEqual(A('saldod.kontrolli').data.erinevused, []);
});
test('vanem lahendamata konflikt jääb nähtavaks ka siis, kui sellest on palju uusi liikumisi', () => {
  g.SEADED.SOOVITUSTE_RIDU = 5;
  const arv = A('andmed').data.konfliktideArv;
  assert(arv >= 1);
  for (let i = 0; i < 10; i++) L([{ id: uid(), toote_id: kruvi, tyyp: 'SISSE', kogus: 1 }]);
  assert.strictEqual(A('andmed').data.konfliktideArv, arv);
  assert(A('andmed', {}, mati).data.minuKonfliktid.length >= 1);
  g.SEADED.SOOVITUSTE_RIDU = 1000;
});
test('vanas tabelis (Saldode lehte pole) luuakse leht esimesel päringul liikumiste põhjal', () => {
  const oige = toode('Kruvi').saldo;
  K.ss.deleteSheet(K.ss.getSheetByName('Saldod'));
  assert.strictEqual(toode('Kruvi').saldo, oige);
  assert(K.ss.getSheetByName('Saldod'));
  assert.strictEqual(toode('Trell').olek, 'VÄLJA ANTUD');
  assert.deepStrictEqual(A('saldod.kontrolli').data.erinevused, []);
});
test('seadista on korduvalt käivitatav ega riku Saldode lehte', () => {
  const enne = toode('Kruvi').saldo;
  g.seadista();
  assert.strictEqual(toode('Kruvi').saldo, enne);
  assert.deepStrictEqual(A('saldod.kontrolli').data.erinevused, []);
});

console.log('\n' + ok + ' testi õnnestus');
