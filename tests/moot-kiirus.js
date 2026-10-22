/**
 * Serveri kiiruse mõõtmine testandmetega: mitu tabelipäringut ja lahtrit loeb/kirjutab
 * iga tegevus. (Apps Scriptis on iga tabelipäring ~50–300 ms, loetud lahtrid lisavad aega.)
 * Käivita: node tests/moot-kiirus.js [toodete arv] [liikumiste arv]
 */
const crypto = require('crypto');
const { looKeskkond } = require('./gas-mock');

const TOOTEID = Number(process.argv[2]) || 500;
const LIIKUMISI = Number(process.argv[3]) || 20000;

const K = looKeskkond();
const { post, g, io } = K;
g.seadista();
const admin = post({ action: 'esimeneAdmin', data: { seadistuskood: K.props.get('SEADISTUSKOOD'), kasutajanimi: 'mari', nimi: 'Mari', pin: '1234' } }).data.token;
const A = (action, data) => post({ action, token: admin, data });

// Testandmed: tooted CSV-impordiga, liikumised otse lehele (kiirem kui API kaudu)
const read = [];
for (let i = 0; i < TOOTEID; i++) read.push({ nimetus: 'Toode ' + i, tyyp: i % 5 ? 'VARUOSA' : 'TÖÖRIIST', kood: String(4000000000000 + i) });
const imp = A('tooted.import', { read, kinnita: true });
if (!imp.ok) throw new Error(JSON.stringify(imp));
const tooted = A('andmed', {}).data.tooted;
const varuosad = tooted.filter(t => t.tyyp === 'VARUOSA');
const kasutajaId = A('mina', {}).data.id;
const algus = Date.now() - LIIKUMISI * 60000;
const liikumised = [];
for (let i = 0; i < LIIKUMISI; i++) {
  const t = varuosad[i % varuosad.length];
  liikumised.push({ id: crypto.randomUUID(), toote_id: t.id, 'tüüp': i % 3 ? 'VÄLJA' : 'SISSE', kogus: 1, kellele_kuhu: '', 'märkus': '',
    kasutaja_id: kasutajaId, 'skännimise_aeg': new Date(algus + i * 60000), 'serverisse_jõudmise_aeg': new Date(), konflikt: false, 'konflikti_põhjus': '', lahendatud: false });
}
g.lisaRead_('Liikumised', liikumised);
if (g.ehitaSaldod_) g.ehitaSaldod_(); // uues versioonis: Saldod-leht testandmete järgi

function mooda(nimi, fn) {
  const enne = Object.assign({}, io);
  const t0 = process.hrtime.bigint();
  const r = fn();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  if (r && r.ok === false) throw new Error(nimi + ': ' + JSON.stringify(r));
  console.log(nimi.padEnd(34) + ' lugemisi ' + String(io.lugemisi - enne.lugemisi).padStart(3) +
    ', loetud lahtreid ' + String(io.loetudRakke - enne.loetudRakke).padStart(7) +
    ', kirjutusi ' + String(io.kirjutusi - enne.kirjutusi).padStart(3) +
    ', protsessor ' + ms.toFixed(0).padStart(4) + ' ms');
}

console.log('Testandmed: ' + TOOTEID + ' toodet, ' + LIIKUMISI + ' liikumist (versioon ' + g.SEADED.VERSIOON + ')');
mooda('andmed (nimekiri telefoni)', () => A('andmed', {}));
mooda('liikumised.lisa (1 liikumine)', () => A('liikumised.lisa', { liikumised: [{ id: crypto.randomUUID(), toote_id: varuosad[1].id, tyyp: 'SISSE', kogus: 2 }] }));
mooda('liikumised.lisa (20 liikumist)', () => A('liikumised.lisa', { liikumised: varuosad.slice(0, 20).map(t => ({ id: crypto.randomUUID(), toote_id: t.id, tyyp: 'VÄLJA', kogus: 1 })) }));
