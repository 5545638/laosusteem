/** Etapi 4 serveripoolsed testid (järjekord, lukustatud kasutaja, konfliktid). Käivita: node tests/test-etapp4.js */
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
A('kasutajad.lisa', { kasutajanimi: 'kati', nimi: 'Kati', roll: 'LAOTÖÖTAJA', pin: '6666' });
const login = (kn, pin) => post({ action: 'login', data: { kasutajanimi: kn, pin } }).data.token;
let mati = login('mati', '5555');
const kati = login('kati', '6666');
const uid = () => crypto.randomUUID();
const L = (liikumised, token) => A('liikumised.lisa', { liikumised }, token || mati);
const toode = (nimi) => A('andmed').data.tooted.find(t => t.nimetus === nimi);
const ridu = () => K.ss.getSheetByName('Tooted')._andmed.length;

A('tooted.lisa', { nimetus: 'Kruvi', tyyp: 'VARUOSA', algsaldo: 10, kood: '4006381333931' });
A('tooted.lisa', { nimetus: 'Trell', tyyp: 'TÖÖRIIST' });
const kruvi = toode('Kruvi').id, trell = toode('Trell').id;

console.log('Ilma internetita lisatud toode');
test('telefoni id-ga toode; uuesti saatmine ei loo teist', () => {
  const id = uid();
  const r1 = A('tooted.lisa', { id, vorguta: true, nimetus: 'Mutter M8', kood: '12345670' }, mati);
  assert.strictEqual(r1.data[0].id, id);
  const n = ridu();
  const r2 = A('tooted.lisa', { id, vorguta: true, nimetus: 'Mutter M8', kood: '12345670' }, mati);
  assert(r2.ok && r2.data[0].duplikaat, JSON.stringify(r2));
  assert.strictEqual(r2.data[0].koodid[0].kood, '12345670');
  assert.strictEqual(ridu(), n);
});
test('sama kood kahest telefonist → seotakse olemasoleva tootega', () => {
  const r = A('tooted.lisa', { id: uid(), vorguta: true, nimetus: 'Mutrid', kood: '12345670' }, kati);
  assert(r.ok && r.data[0].yhendatud, JSON.stringify(r));
  assert.strictEqual(r.data[0].nimetus, 'Mutter M8');
  // võrguga lisamisel jääb tavaline viga
  assert.strictEqual(A('tooted.lisa', { nimetus: 'X', kood: '12345670' }, kati).code, 'DUPLIKAAT');
});
test('telefoni lisatud konfliktipõhjus salvestub (nurksulud eemaldatakse)', () => {
  const mutter = toode('Mutter M8').id;
  const r = L([{ id: uid(), toote_id: mutter, tyyp: 'SISSE', kogus: 2, lisaKonflikt: 'Toode lisati kahest telefonist [KINNITATUD' }], kati);
  assert.strictEqual(r.data.tulemused[0].konflikt, true);
  assert(r.data.tulemused[0].pohjus.includes('kahest telefonist'));
  assert(!r.data.tulemused[0].pohjus.includes('['));
});

console.log('Lukustatud kasutaja');
let lukusId;
test('lukustamise järel on seanss kehtetu, aga liikumised võetakse vastu konfliktidena', () => {
  const matiId = A('kasutajad.nimekiri').data.find(k => k.kasutajanimi === 'mati').id;
  assert(A('kasutajad.lukusta', { id: matiId }).ok);
  assert.strictEqual(A('andmed', {}, mati).code, 'SEANSS_KEHTETU');
  const enne = toode('Kruvi').saldo;
  lukusId = uid();
  const r = L([{ id: lukusId, toote_id: kruvi, tyyp: 'VÄLJA', kogus: 4 }, { id: uid(), toote_id: trell, tyyp: 'VÄLJA_ANTUD', kellele_kuhu: 'Peeter' }]);
  assert(r.ok, JSON.stringify(r));
  assert.strictEqual(r.data.kasutajaLukustatud, true);
  assert(r.data.tulemused.every(t => t.ok && t.konflikt && t.pohjus.startsWith('Kasutaja oli lukustatud')));
  assert.strictEqual(toode('Kruvi').saldo, enne, 'saldo ei tohi muutuda enne kinnitamist');
  assert.strictEqual(toode('Trell').olek, 'LAOS');
});
test('lukustatud kasutaja ei saa teha muid päringuid ega võrguga toodet lisada', () => {
  assert.strictEqual(A('tooted.lisa', { nimetus: 'Y' }, mati).code, 'SEANSS_KEHTETU');
  assert(A('tooted.lisa', { id: uid(), vorguta: true, nimetus: 'Võrguta lisatud' }, mati).ok);
});
test('tundmatu võti ei pääse läbi', () => {
  assert.strictEqual(L([{ id: uid(), toote_id: kruvi, tyyp: 'SISSE', kogus: 1 }], 'vale').code, 'SEANSS_KEHTETU');
});

console.log('Konfliktide vaade');
test('andmed: adminile konfliktide arv, kasutajale tema enda konfliktid', () => {
  const a = A('andmed').data;
  assert.strictEqual(a.konfliktideArv, 3);
  const k = A('andmed', {}, kati).data;
  assert.strictEqual(k.konfliktideArv, null);
  assert.strictEqual(k.minuKonfliktid.length, 1);
  assert.strictEqual(k.minuKonfliktid[0].nimetus, 'Mutter M8');
});
test('nimekiri ainult adminile; sisaldab nime, kasutajat ja lukustuse märget', () => {
  assert.strictEqual(A('konfliktid.nimekiri', {}, kati).code, 'POLE_OIGUST');
  const n = A('konfliktid.nimekiri').data;
  assert.strictEqual(n.lahtised.length, 3);
  const v = n.lahtised.find(x => x.id === lukusId);
  assert.strictEqual(v.nimetus, 'Kruvi');
  assert.strictEqual(v.kasutaja, 'Mati');
  assert.strictEqual(v.lukustatud, true);
  assert.strictEqual(v.voibParandada, true);
});
test('KINNITA: lukustatud kasutaja liikumine läheb nüüd saldosse', () => {
  const enne = toode('Kruvi').saldo;
  const r = A('konfliktid.lahenda', { id: lukusId, otsus: 'KINNITA' });
  assert(r.ok, JSON.stringify(r));
  assert.strictEqual(toode('Kruvi').saldo, enne - 4);
  const rida = K.ss.getSheetByName('Liikumised')._andmed.find(x => x[0] === lukusId);
  assert.strictEqual(rida[11], 'jah');
  assert(rida[10].includes('[KINNITATUD: Mari'));
  assert.strictEqual(A('konfliktid.lahenda', { id: lukusId, otsus: 'KINNITA' }).ok, false, 'teist korda ei saa');
});
test('TÜHISTA lukustatu liikumisel: tagasi lükatud, olek ei muutu', () => {
  const v = A('konfliktid.nimekiri').data.lahtised.find(x => x.tyyp === 'VÄLJA_ANTUD');
  assert(A('konfliktid.lahenda', { id: v.id, otsus: 'TÜHISTA' }).ok);
  assert.strictEqual(toode('Trell').olek, 'LAOS');
  assert(A('konfliktid.nimekiri').data.lahendatud.some(x => x.id === v.id && x.pohjus.includes('TAGASI LÜKATUD')));
});
test('TÜHISTA tavalisel konfliktil lisab TÜHISTUS-liikumise', () => {
  const v = A('konfliktid.nimekiri').data.lahtised[0];
  const enne = toode('Mutter M8').saldo;
  assert(A('konfliktid.lahenda', { id: v.id, otsus: 'TÜHISTA' }).ok);
  assert.strictEqual(toode('Mutter M8').saldo, enne - 2);
  assert.strictEqual(A('konfliktid.nimekiri').data.lahtised.length, 0);
});
test('PARANDA: negatiivne VÄLJA parandatakse väiksemaks koguseks', () => {
  const s = toode('Kruvi').saldo; // 6
  const id = uid();
  const r = L([{ id, toote_id: kruvi, tyyp: 'VÄLJA', kogus: s + 5 }], kati);
  assert.strictEqual(r.data.tulemused[0].konflikt, true);
  const p = A('konfliktid.lahenda', { id, otsus: 'PARANDA', kogus: 2 });
  assert(p.ok, JSON.stringify(p));
  assert.strictEqual(toode('Kruvi').saldo, s - 2);
  const read = K.ss.getSheetByName('Liikumised')._andmed;
  const uus = read[read.length - 1];
  assert.strictEqual(uus[3], 2);
  assert.strictEqual(uus[9], 'ei');
  const katiId = A('kasutajad.nimekiri').data.find(k => k.kasutajanimi === 'kati').id;
  assert.strictEqual(uus[6], katiId, 'parandus jääb algse tegija nimele');
  assert(uus[5].includes('parandas Mari'));
  assert.strictEqual(A('konfliktid.nimekiri').data.lahtised.length, 0);
});
test('PARANDA ei sobi tagastamisele; vale otsus keelatud', () => {
  L([{ id: uid(), toote_id: trell, tyyp: 'TAGASTATUD' }], kati); // oli laos → konflikt
  const v = A('konfliktid.nimekiri').data.lahtised[0];
  assert.strictEqual(v.voibParandada, false);
  assert.strictEqual(A('konfliktid.lahenda', { id: v.id, otsus: 'PARANDA' }).ok, false);
  assert.strictEqual(A('konfliktid.lahenda', { id: v.id, otsus: 'MIDAGI' }).ok, false);
  assert(A('konfliktid.lahenda', { ids: [v.id], otsus: 'KINNITA' }).ok);
});
test('vana seansirida jääb pärast lukustamist alles ka uue sisselogimise järel', () => {
  login('kati', '6666');
  const r = L([{ id: uid(), toote_id: kruvi, tyyp: 'SISSE', kogus: 1 }]);
  assert.strictEqual(r.data.kasutajaLukustatud, true);
});

console.log('\n' + ok + ' testi õnnestus');
