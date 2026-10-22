/** Etapi 2 serveripoolsed testid (tooted, koodid, riiulid, import). Käivita: node tests/test-etapp2.js */
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
const kood = K.props.get('SEADISTUSKOOD');
const admin = post({ action: 'esimeneAdmin', data: { seadistuskood: kood, kasutajanimi: 'mari', nimi: 'Mari', pin: '1234' } }).data.token;
post({ action: 'kasutajad.lisa', token: admin, data: { kasutajanimi: 'mati', nimi: 'Mati', roll: 'LAOTÖÖTAJA', pin: '5555' } });
const mati = post({ action: 'login', data: { kasutajanimi: 'mati', pin: '5555' } }).data.token;
const A = (action, data, token) => post({ action, token: token || admin, data });
const andmed = () => A('andmed').data;
const toode = (nimi) => andmed().tooted.find(t => t.nimetus === nimi);

console.log('Koodi tüübi tuvastus');
test('EAN-13, EAN-8, UPC kontrollnumbriga; vale kontrollnumber → CODE128', () => {
  assert.strictEqual(g.tuvastaKoodiTyyp_('4006381333931'), 'EAN13');
  assert.strictEqual(g.tuvastaKoodiTyyp_('4006381333932'), 'CODE128');
  assert.strictEqual(g.tuvastaKoodiTyyp_('96385074'), 'EAN8');
  assert.strictEqual(g.tuvastaKoodiTyyp_('036000291452'), 'UPC');
  assert.strictEqual(g.tuvastaKoodiTyyp_('V-00012'), 'SISEKOOD');
  assert.strictEqual(g.tuvastaKoodiTyyp_('ABC-123'), 'CODE128');
});

console.log('Riiulid');
let riiulA;
test('üksik riiul: R- lisatakse ette, suurtähed', () => {
  const r = A('riiulid.lisa', { kood: 'a01-01', nimetus: 'Esimene', tsoon: 'Vasak sein' });
  assert(r.ok, r.error); riiulA = r.data;
  assert.strictEqual(r.data.kood, 'R-A01-01');
});
test('topeltkood keelatud', () => {
  assert.strictEqual(A('riiulid.lisa', { kood: 'R-A01-01' }).code, 'DUPLIKAAT');
});
test('hulgilisamine A01–A03 × korrused 1–5, olemasolev jäetakse vahele', () => {
  const r = A('riiulid.hulgi', { eesliide: 'A', alates: 1, kuni: 3, kohti: 2, korrusAlates: 1, korrusKuni: 5, tsoon: 'Lao vasak sein' });
  assert(r.ok, r.error);
  assert.strictEqual(r.data.loodud.length, 14);
  assert.deepStrictEqual(r.data.vahele, ['R-A01-01']);
  assert(r.data.loodud.includes('R-A03-05'));
  assert.strictEqual(andmed().riiulid.length, 15);
  assert.strictEqual(andmed().riiulid.find(x => x.kood === 'R-A02-03').nimetus, 'Riiul A02, korrus 03');
});
test('hulgilisamine ilma korrusteta', () => {
  const r = A('riiulid.hulgi', { eesliide: 'B', alates: 1, kuni: 2, korrusAlates: '' });
  assert.deepStrictEqual(r.data.loodud, ['R-B01', 'R-B02']);
});
test('liiga palju riiuleid korraga keelatud', () => {
  assert.strictEqual(A('riiulid.hulgi', { eesliide: 'C', alates: 1, kuni: 500, korrusAlates: 1, korrusKuni: 5 }).code, 'VALE_SISEND');
});
test('laotöötaja ei saa riiuleid lisada', () => {
  assert.strictEqual(A('riiulid.lisa', { kood: 'X1' }, mati).code, 'POLE_OIGUST');
});
test('riiuli muutmine ja arhiveerimine', () => {
  assert(A('riiulid.muuda', { id: riiulA.id, nimetus: 'Uus nimi', kood: 'A01-01' }).ok); // sama kood – lubatud
  assert.strictEqual(A('riiulid.muuda', { id: riiulA.id, kood: 'A02-01' }).code, 'DUPLIKAAT');
  assert(A('riiulid.arhiveeri', { id: riiulA.id }).ok);
  assert.strictEqual(andmed().riiulid.find(x => x.id === riiulA.id).arhiveeritud, true);
  A('riiulid.arhiveeri', { id: riiulA.id, arhiveeritud: false });
});

console.log('Tooted ja koodid');
test('varuosa ilma koodita saab V-00001, algsaldo', () => {
  const r = A('tooted.lisa', { nimetus: 'Kruvi M6', tyyp: 'VARUOSA', yhik: 'pakk', kategooria: 'Kinnitus', riiul_id: riiulA.id, miinimumkogus: 5, algsaldo: '12,5' });
  assert(r.ok, r.error);
  assert.deepStrictEqual(r.data[0].koodid, [{ kood: 'V-00001', tyyp: 'SISEKOOD' }]);
  const t = toode('Kruvi M6');
  assert.strictEqual(t.saldo, 12.5); assert.strictEqual(t.yhik, 'pakk'); assert.strictEqual(t.miinimumkogus, 5);
});
test('EAN-koodiga varuosa + lisasisekood', () => {
  const r = A('tooted.lisa', { nimetus: 'Õlifilter', tyyp: 'VARUOSA', kood: '4006381333931', lisaSisekood: true });
  assert(r.ok, r.error);
  assert.deepStrictEqual(r.data[0].koodid.map(k => k.tyyp), ['EAN13', 'SISEKOOD']);
  assert.strictEqual(r.data[0].koodid[1].kood, 'V-00002');
});
test('EAN algusnulliga jääb tekstiks', () => {
  const r = A('tooted.lisa', { nimetus: 'Nullikood', tyyp: 'VARUOSA', kood: '0012345678905' });
  assert(r.ok, r.error);
  assert.strictEqual(toode('Nullikood').koodid[0].kood, '0012345678905');
});
test('sama kood teist korda (ka väiketähtedega) keelatud; riiulikood samuti', () => {
  assert.strictEqual(A('tooted.lisa', { nimetus: 'X', kood: 'v-00001' }).code, 'DUPLIKAAT');
  assert.strictEqual(A('tooted.lisa', { nimetus: 'X', kood: 'R-A01-01' }).code, 'DUPLIKAAT');
});
test('tööriist 3 eksemplari → 3 toodet T-00001..3, olek LAOS', () => {
  const r = A('tooted.lisa', { nimetus: 'Akutrell Makita', tyyp: 'TÖÖRIIST', eksemplare: 3 });
  assert(r.ok, r.error);
  assert.deepStrictEqual(r.data.map(x => x.nimetus), ['Akutrell Makita #1', 'Akutrell Makita #2', 'Akutrell Makita #3']);
  assert.deepStrictEqual(r.data.map(x => x.koodid[0].kood), ['T-00001', 'T-00002', 'T-00003']);
  const t = toode('Akutrell Makita #2');
  assert.strictEqual(t.olek, 'LAOS'); assert.strictEqual(t.saldo, null); assert.strictEqual(t.yhik, 'tk');
});
test('mitu eksemplari + tootja kood keelatud', () => {
  assert.strictEqual(A('tooted.lisa', { nimetus: 'X', tyyp: 'TÖÖRIIST', eksemplare: 2, kood: '123ABC' }).code, 'VALE_SISEND');
});
test('vigane sisend', () => {
  assert.strictEqual(A('tooted.lisa', { nimetus: '  ' }).code, 'VALE_SISEND');
  assert.strictEqual(A('tooted.lisa', { nimetus: 'X', yhik: 'tonn' }).code, 'VALE_SISEND');
  assert.strictEqual(A('tooted.lisa', { nimetus: 'X', miinimumkogus: -1 }).code, 'VALE_SISEND');
  assert.strictEqual(A('tooted.lisa', { nimetus: 'X', riiul_id: 'pole' }).code, 'VALE_SISEND');
  assert.strictEqual(A('tooted.lisa', { nimetus: 'X', kood: 'A B' }).code, 'VALE_SISEND');
});
test('laotöötaja saab kiirlisada, aga mitte algsaldot ega muuta', () => {
  assert(A('tooted.lisa', { nimetus: 'Kiirlisatud', tyyp: 'VARUOSA', kood: 'TOOTJA-XYZ' }, mati).ok);
  assert.strictEqual(A('tooted.lisa', { nimetus: 'X', algsaldo: 5 }, mati).code, 'POLE_OIGUST');
  assert.strictEqual(A('tooted.muuda', { id: toode('Kiirlisatud').id, nimetus: 'Y' }, mati).code, 'POLE_OIGUST');
  assert(A('andmed', {}, mati).ok);
});
test('kliendi antud id võetakse kasutusele (etapp 4 jaoks)', () => {
  const r = A('tooted.lisa', { id: 'abcdef12-3456', nimetus: 'Võrguta lisatud' });
  assert.strictEqual(r.data[0].id, 'abcdef12-3456');
});
test('toote muutmine', () => {
  const t = toode('Kruvi M6');
  assert(A('tooted.muuda', { id: t.id, nimetus: 'Kruvi M6x20', yhik: 'tk', kategooria: 'Kruvid', miinimumkogus: '' }).ok);
  const u = toode('Kruvi M6x20');
  assert.strictEqual(u.yhik, 'tk'); assert.strictEqual(u.miinimumkogus, null);
});
test('liikumistega toote tüüpi ei saa muuta, liikumisteta saab', () => {
  assert.strictEqual(A('tooted.muuda', { id: toode('Kruvi M6x20').id, tyyp: 'TÖÖRIIST' }).code, 'VALE_SISEND');
  assert(A('tooted.muuda', { id: toode('Nullikood').id, tyyp: 'TÖÖRIIST' }).ok);
});
test('koodi lisamine: tühi → sisekood; eemaldamine; viimast ei saa', () => {
  const t = toode('Kiirlisatud');
  const r = A('koodid.lisa', { toote_id: t.id });
  assert(r.ok, r.error); assert.strictEqual(r.data.kood, 'V-00004');
  assert(A('koodid.lisa', { toote_id: t.id, kood: '96385074' }).ok);
  assert.strictEqual(toode('Kiirlisatud').koodid.length, 3);
  assert(A('koodid.eemalda', { kood: 'tootja-xyz' }).ok);
  assert(A('koodid.eemalda', { kood: '96385074' }).ok);
  assert.strictEqual(A('koodid.eemalda', { kood: 'V-00004' }).code, 'VALE_SISEND');
});
test('arhiveerimine ja taastamine', () => {
  const t = toode('Õlifilter');
  assert(A('tooted.arhiveeri', { id: t.id }).ok);
  assert.strictEqual(toode('Õlifilter').arhiveeritud, true);
  assert(A('tooted.arhiveeri', { id: t.id, arhiveeritud: false }).ok);
  assert.strictEqual(toode('Õlifilter').arhiveeritud, false);
});
test('loendur salvestub tabelisse', () => {
  const l = K.ss.getSheetByName('Loendurid')._andmed;
  assert.strictEqual(l.find(r => r[0] === 'VARUOSA')[1], 5);
  assert.strictEqual(l.find(r => r[0] === 'TÖÖRIIST')[1], 4);
});

console.log('Saldo arvutus');
test('SISSE/VÄLJA/KORRIGEERIMINE/TÜHISTUS ja tööriista olek', () => {
  const sh = K.ss.getSheetByName('Liikumised');
  const kruvi = toode('Kruvi M6x20').id, trell = toode('Akutrell Makita #1').id;
  const d = (min) => new Date(Date.UTC(2026, 9, 22, 8, min));
  const rida = (id, tid, tyyp, kogus, kuhu, aeg) => [id, tid, tyyp, kogus, kuhu, '', 'x', aeg, aeg, 'ei', '', 'ei'];
  sh.appendRow(rida('l1', kruvi, 'SISSE', 10, '', d(1)));
  sh.appendRow(rida('l2', kruvi, 'VÄLJA', 3, '', d(5)));
  sh.appendRow(rida('l3', kruvi, 'VÄLJA', 100, '', d(6)));
  sh.appendRow(rida('l4', kruvi, 'TÜHISTUS', 0, 'l3', d(7)));
  sh.appendRow(rida('l5', trell, 'VÄLJA_ANTUD', 1, 'Objekt Tartu', d(3)));
  const s = g.arvutaSeis_();
  assert.strictEqual(s[kruvi].saldo, 12.5 + 10 - 3);
  assert.strictEqual(s[trell].olek, 'VÄLJA ANTUD');
  assert.strictEqual(s[trell].kellele, 'Objekt Tartu');
  sh.appendRow(rida('l6', trell, 'TAGASTATUD', 1, '', d(2))); // varasem aeg → ei muuda seisu
  assert.strictEqual(g.arvutaSeis_()[trell].olek, 'VÄLJA ANTUD');
  sh.appendRow(rida('l7', trell, 'TAGASTATUD', 1, '', d(9)));
  assert.strictEqual(g.arvutaSeis_()[trell].olek, 'LAOS');
});

console.log('CSV-import');
test('import: korrektsed read lisatakse, vigased jäetakse vahele, riiulid luuakse', () => {
  const r = A('tooted.import', { looRiiulid: true, read: [
    { reaNr: 2, nimetus: 'Laager 6204', kood: '4006381333948', tyyp: 'varuosa', yhik: 'tk', kategooria: 'Laagrid', riiul: 'A01-02', algsaldo: '8' },
    { reaNr: 3, nimetus: 'Nurklihvija', kood: '', tyyp: 'tööriist', yhik: '', kategooria: 'Elektritööriistad', riiul: 'C05', algsaldo: '1' },
    { reaNr: 4, nimetus: '', kood: '', tyyp: 'varuosa' },
    { reaNr: 5, nimetus: 'Dubleeritud', kood: 'V-00001', tyyp: 'varuosa' },
    { reaNr: 6, nimetus: 'Vale tüüp', tyyp: 'masin' },
    { reaNr: 7, nimetus: 'Vale ühik', tyyp: 'V', yhik: 'tonn' }
  ] });
  assert(r.ok, r.error);
  assert.strictEqual(r.data.lisatud, 2); assert.strictEqual(r.data.vigu, 4);
  assert.deepStrictEqual(r.data.tulemused.filter(t => !t.ok).map(t => t.rida), [4, 5, 6, 7]);
  const laager = toode('Laager 6204');
  assert.strictEqual(laager.saldo, 8);
  assert.strictEqual(andmed().riiulid.find(x => x.id === laager.riiul_id).kood, 'R-A01-02'); // olemasolev
  assert(andmed().riiulid.find(x => x.kood === 'R-C05')); // uus
  assert.strictEqual(toode('Nurklihvija').olek, 'LAOS');
  assert.strictEqual(toode('Nurklihvija').koodid[0].kood, 'T-00004');
});
test('import ilma riiulite loomiseta annab puuduva riiuli kohta vea', () => {
  const r = A('tooted.import', { looRiiulid: false, read: [{ nimetus: 'Z', riiul: 'Q99' }] });
  assert.strictEqual(r.data.vigu, 1);
  assert(r.data.tulemused[0].viga.includes('R-Q99'));
});
test('sama kood kaks korda ühes impordis', () => {
  const r = A('tooted.import', { read: [{ nimetus: 'A1', kood: 'DUP1' }, { nimetus: 'A2', kood: 'dup1' }] });
  assert.strictEqual(r.data.lisatud, 1);
});
test('500 rea import', () => {
  const read = Array.from({ length: 500 }, (_, i) => ({ nimetus: 'Detail ' + i, tyyp: 'varuosa', algsaldo: i % 3 }));
  const t0 = Date.now();
  const r = A('tooted.import', { read });
  assert.strictEqual(r.data.lisatud, 500);
  assert(Date.now() - t0 < 5000);
  assert.strictEqual(A('tooted.import', { read: read.concat([{ nimetus: 'x' }]) }).code, 'VALE_SISEND');
});

console.log('Saldode leht');
test('käsitsi tabelisse lisatud liikumised: kontroll leiab erinevuse, parandus kirjutab saldod uuesti', () => {
  // „Saldo arvutus” lisas liikumised otse lehele (nagu käsitsi muutmine) – Saldode leht ei tea neist
  const r = A('saldod.kontrolli', {});
  assert(r.ok, JSON.stringify(r));
  assert.deepStrictEqual(r.data.erinevused.map(e => [e.nimetus, e.lehel, e.arvutatud]), [['Kruvi M6x20', '12.5', '19.5']]);
  assert.strictEqual(A('saldod.kontrolli', {}, mati).code, 'POLE_OIGUST');
  assert(A('saldod.paranda', {}).ok);
  assert.deepStrictEqual(A('saldod.kontrolli', {}).data.erinevused, []);
  assert.strictEqual(toode('Kruvi M6x20').saldo, 19.5);
});

console.log(`\n${ok} testi õnnestus` + (process.exitCode ? ', osa EBAÕNNESTUS' : ''));
