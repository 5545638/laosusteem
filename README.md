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
| `js/andmed.js` | Toodete ja riiulite nimekiri seadmes, abifunktsioonid |
| `js/tooted.js` | TOOTED: nimekiri, lisamine, tootekaart, koodid |
| `js/riiulid.js` | RIIULID: haldus ja hulgilisamine |
| `js/import.js` | CSV-import |
| `apps-script/Code.gs` | Taustasüsteem, mis kleebitakse Apps Scripti |
| `tests/` | Arendaja testid (Apps Scripti simulatsioon Node.js-is). Neid Apps Scripti ei kleebita. |

## Arendajale

```
node tests/test-etapp1.js     # serveripoolsed testid (etapp 1)
node tests/test-etapp2.js     # serveripoolsed testid (etapp 2)
node tests/dev-server.js      # kohalik server http://localhost:8080, API on aadressil /api
```

## Etapid

1. ✅ Google Sheetsi struktuur, Apps Script API, sisselogimine ja kasutajad, paigaldusjuhend
2. ✅ Tooted, koodid, riiulid, CSV-import
3. Telefoni skännimine
4. Võrguühenduseta järjekord, sünkroonimine, konfliktid
5. Sildiprint ja sildipõhjad
6. Ülevaated, eksport, PWA
