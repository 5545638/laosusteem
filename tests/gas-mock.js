/**
 * Google Apps Scripti teenuste lihtne simulatsioon Node.js-is.
 * Võimaldab Code.gs-i testida ilma Google'i kontota.
 * (Ainult arendamiseks – seda faili Apps Scripti ei kleebita.)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

function looKeskkond() {
  const lehed = new Map();
  const io = { lugemisi: 0, loetudRakke: 0, kirjutusi: 0, kirjutatudRakke: 0 }; // tabeli päringute loendur (kiiruse mõõtmiseks)

  function looLeht(nimi) {
    const andmed = []; // read massiividena
    const leht = {
      getName: () => nimi,
      getLastRow: () => andmed.length,
      getLastColumn: () => andmed.reduce((m, r) => Math.max(m, r.length), 0),
      getMaxRows: () => Math.max(1000, andmed.length),
      setFrozenRows: () => {},
      appendRow: (rida) => { io.kirjutusi++; io.kirjutatudRakke += rida.length; andmed.push(rida.slice()); },
      deleteRow: (nr) => { andmed.splice(nr - 1, 1); },
      getRange: (r, c, nr = 1, nc = 1) => {
        if (nr < 1 || nc < 1) throw new Error('Vale vahemik');
        const range = {
          getValues: () => {
            io.lugemisi++; io.loetudRakke += nr * nc;
            const out = [];
            for (let i = 0; i < nr; i++) {
              const rida = andmed[r - 1 + i] || [];
              const o = [];
              for (let j = 0; j < nc; j++) { const v = rida[c - 1 + j]; o.push(v === undefined ? '' : v); }
              out.push(o);
            }
            return out;
          },
          setValues: (v) => {
            io.kirjutusi++; io.kirjutatudRakke += nr * nc;
            for (let i = 0; i < nr; i++) {
              while (andmed.length < r + i) andmed.push([]);
              for (let j = 0; j < nc; j++) andmed[r - 1 + i][c - 1 + j] = v[i][j];
            }
            return range;
          },
          setValue: (v) => range.setValues([[v]]),
          clearContent: () => {
            for (let i = 0; i < nr; i++) {
              const rida = andmed[r - 1 + i];
              if (rida) for (let j = 0; j < nc; j++) rida[c - 1 + j] = '';
            }
            // Tühjad read lõpust ära (nagu getLastRow päris tabelis)
            while (andmed.length && andmed[andmed.length - 1].join('') === '') andmed.pop();
            return range;
          },
          setNumberFormat: () => range,
          setFontWeight: () => range,
          setBackground: () => range
        };
        return range;
      },
      _andmed: andmed
    };
    return leht;
  }

  const ss = {
    getSheetByName: (n) => lehed.get(n) || null,
    insertSheet: (n) => { const l = looLeht(n); lehed.set(n, l); return l; },
    deleteSheet: (l) => lehed.delete(l.getName()),
    getSheets: () => [...lehed.values()],
    setSpreadsheetTimeZone: () => {}
  };

  const props = new Map();
  const cache = new Map();
  const logi = [];

  const keskkond = {
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      flush: () => {},
      getUi: () => { throw new Error('UI pole saadaval'); }
    },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      formatDate: (d, tz, f) => f === 'H'
        ? String(Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(d)))
        : d.toISOString().slice(0, 16).replace('T', ' '),
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, tekst) => [...crypto.createHash(alg).update(tekst, 'utf8').digest()].map(b => (b > 127 ? b - 256 : b))
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (props.has(k) ? props.get(k) : null),
        setProperty: (k, v) => props.set(k, String(v)),
        deleteProperty: (k) => props.delete(k)
      })
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (cache.has(k) ? cache.get(k) : null),
        put: (k, v) => cache.set(k, v),
        remove: (k) => cache.delete(k),
        removeAll: (ks) => ks.forEach(k => cache.delete(k))
      })
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (s) => ({ setMimeType: function () { return this; }, getContent: () => s })
    },
    Logger: { log: (s) => logi.push(s) },
    ScriptApp: (() => {
      const paastikud = [];
      return {
        _paastikud: paastikud,
        getProjectTriggers: () => paastikud.slice(),
        deleteTrigger: (t) => { const i = paastikud.indexOf(t); if (i >= 0) paastikud.splice(i, 1); },
        newTrigger: (fn) => ({ timeBased: () => ({ everyMinutes: (m) => ({ create: () => { const t = { getHandlerFunction: () => fn, minutid: m }; paastikud.push(t); return t; } }) }) })
      };
    })()
  };
  vm.createContext(keskkond);
  const kood = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
  vm.runInContext(kood, keskkond, { filename: 'Code.gs' });

  return {
    g: keskkond, ss, props, cache, logi, lehed, io,
    /** Saadab päringu nagu esipaneel. */
    post: (paring) => JSON.parse(keskkond.doPost({ postData: { contents: JSON.stringify(paring) } }).getContent()),
    get: (param) => JSON.parse(keskkond.doGet({ parameter: param || {} }).getContent())
  };
}

module.exports = { looKeskkond };
