# Laosüsteem

Lihtne laosüsteem varuosadele ja tööriistadele: telefoniga skännimine, arvutis ülevaated ja sildiprint.
Esipaneel on staatiline veebileht (GitHub Pages), taustasüsteem on Google Apps Script ja andmed on Google Sheetsis.

- **Paigaldus:** [JUHEND.md](JUHEND.md)
- **Testimine:** [TESTIMINE.md](TESTIMINE.md)

## Failid

| Fail | Sisu |
|---|---|
| `index.html` | Rakenduse leht |
| `css/app.css` | Kujundus |
| `js/config.js` | **API aadress** (muuda paigaldamisel) |
| `js/api.js` | Suhtlus Apps Scriptiga, seansi hoidmine |
| `js/app.js` | Põhivaated (sisselogimine, avaleht, kasutajad, seaded) ja navigeerimine |
| `js/andmed.js` | Toodete ja riiulite nimekiri seadmes (koos saatmata liikumiste mõjuga), abifunktsioonid |
| `js/jarjekord.js` | Saatmata liikumiste järjekord (IndexedDB), taustal sünkroonimine, olekuriba |
| `js/tooted.js` | TOOTED: nimekiri, lisamine, tootekaart, koodid |
| `js/riiulid.js` | RIIULID: haldus ja hulgilisamine |
| `js/import.js` | CSV-import |
| `js/skanner.js` | Skänner: kaamera, USB-skänner, käsitsi sisestus, heli ja vibratsioon |
| `js/skannimine.js` | SISSE, VÄLJA, TÖÖRIIST, ÜMBERPAIGUTUS (telefoni vaated) |
| `js/sildid.js` | SILDID: sildipõhjad, vöötkoodid/QR ja printimine (rull ja A4) |
| `js/ulevaated.js` | LADU, VÄLJAS OLEVAD, AJALUGU ja CSV-eksport |
| `js/konfliktid.js` | KONFLIKTID: ülevaatamist vajavate liikumiste kinnitamine, parandamine ja tühistamine (admin) |
| `js/vendor/html5-qrcode.min.js` | Vöötkoodi/QR-lugeja teek (html5-qrcode 2.3.8, Apache 2.0) |
| `js/vendor/jsbarcode.all.min.js` | Vöötkoodide joonistamine (JsBarcode 3.11.6, MIT) |
| `js/vendor/qrcode.js` | QR-koodide joonistamine (qrcode-generator 1.4.4, MIT) |
| `sw.js`, `manifest.webmanifest`, `ikoonid/` | PWA: avakuvale lisamine ja avanemine ilma internetita |
| `apps-script/Code.gs` | Taustasüsteem, mis kleebitakse Apps Scripti |
| `tests/` | Arendaja testid (Apps Scripti simulatsioon Node.js-is). Neid Apps Scripti ei kleebita. |

## Arendajale

```
node tests/test-etapp1.js     # serveripoolsed testid (etapp 1)
node tests/test-etapp2.js     # serveripoolsed testid (etapp 2)
node tests/test-etapp3.js     # serveripoolsed testid (etapp 3)
node tests/test-etapp4.js     # serveripoolsed testid (etapp 4)
node tests/test-etapp56.js    # serveripoolsed testid (etapid 5–6)
node tests/test-etapp8.js     # Masinakulude sidumine (etapp 8)
node tests/test-kiirus.js     # Saldode leht, kitsad lugemised, soojendus
node tests/moot-kiirus.js     # serveri tabelilugemiste mõõtmine testandmetega
VIIVITUS_MS=3000 node tests/dev-server.js   # API vastab 3 s viivitusega (nagu Apps Script)
node tests/dev-server.js      # kohalik server http://localhost:8080, API on aadressil /api
```

## Etapid

1. ✅ Google Sheetsi struktuur, Apps Script API, sisselogimine ja kasutajad, paigaldusjuhend
2. ✅ Tooted, koodid, riiulid, CSV-import
3. ✅ Telefoni skännimine
4. ✅ Võrguühenduseta järjekord, sünkroonimine, konfliktid
5. ✅ Sildiprint ja sildipõhjad
6. ✅ Ülevaated, eksport, PWA
7. ✅ Kiirus: skännimine ilma serveri ootamiseta, Saldode leht
8. ✅ Sidumine Masinakuludega: masinate nimekiri (`masinad.salvesta`), VÄLJA masinale (`kellele_kuhu`), arvelt SISSE (JUHEND.md, samm 9)
