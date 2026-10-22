# Testimine

## Etapp 1: sisselogimine ja kasutajad

Eeldus: JUHEND.md sammud 1–6 on tehtud ja esimene admin on loodud. Telefonitestideks sobib iga nutitelefon. Telefonis kasuta tavalist brauserit (Chrome või Safari), mitte privaatrežiimi.

| # | Tegevus | Oodatav tulemus |
|---|---|---|
| 1 | Ava API aadress brauseris | JSON tekst, milles on `"ok":true` |
| 2 | Ava rakendus arvutis, vali **Seaded → Testi ühendust** | „Ühendus töötab. Serveri versioon 1.0.0-etapp1.” |
| 3 | Logi adminina sisse | Avaleht menüüga. Valmis on KASUTAJAD ja SEADED, ülejäänud paanid on hallid („Tuleb etapis N”) |
| 4 | **KASUTAJAD → + Lisa kasutaja**: `test`, „Test Töötaja”, Laotöötaja, PIN `1111` | Kasutaja ilmub tabelisse ja tabeli lehele `Kasutajad`. Veerus `pin_räsi` on pikk räsi, mitte `1111` |
| 5 | Ava rakendus **telefonis**, logi sisse kasutajaga `test` / `1111` | Avaleht. KASUTAJATE paani pole näha |
| 6 | Sulge telefonis brauser ja ava rakendus uuesti | Oled endiselt sisse logitud (seanss kehtib 30 päeva) |
| 7 | Kirjuta telefonis aadressiribale `…/#/kasutajad` | Suunatakse avalehele, sest laotöötajal pole õigust |
| 8 | Arvutis: kasutaja `test` real peaks „Seansse” olema 1 | Lehel `Seansid` on rida, mille „võti” on räsi |
| 9 | Logi telefonis välja ja proovi 5 korda vale PIN-iga | Iga kord näidatakse, mitu katset on jäänud. 5. korra järel tuleb teade „Kasutaja on 15 minutiks lukus”. Ka õige PIN ei lähe läbi |
| 10 | Arvutis: värskenda KASUTAJAD (F5) | `test` olek on „Ajutiselt lukus (PIN)” |
| 11 | **Lähtesta PIN** → `2222` | Telefonis saab kohe sisse PIN-iga `2222`, vana `1111` enam ei tööta |
| 12 | Kui telefon on sisse logitud, vajuta arvutis `test` real **Lukusta** | Järgmisel tegevusel (nt lehe värskendamine) logitakse telefon välja teatega „Kasutaja on lukustatud”. Sisselogimine ei õnnestu |
| 13 | **Aktiveeri** | Sisselogimine töötab jälle |
| 14 | **Muuda**: roll Admin, salvesta, värskenda telefonis lehte | Telefonis ilmub KASUTAJATE paan |
| 15 | Proovi iseennast lukustada või ainsat adminit laotöötajaks muuta | Oma real Lukusta-nuppu pole. Rolli muutmisel tuleb viga „See on viimane aktiivne admin…” |
| 16 | Lülita telefonis lennurežiim sisse | Olekuribal on „Võrguühendus puudub” (täielik ilma võrguta töö tuleb etapis 4) |
| 17 | Proovi lisada kasutaja nimega, mis juba on olemas | Viga „Selline kasutajanimi on juba olemas.” |

Lisakontroll tabelis: lehtedel `Kasutajad` ja `Seansid` ei tohi kuskil olla PIN-i ega seansivõtit avatekstina.

### Mida ma ise testisin (enne üleandmist)

- 29 automaattesti serveri loogikale (`node tests/test-etapp1.js`). Need jooksevad Apps Scripti simulatsioonis: seadistus, esimene admin ja seadistuskood, räsid, õigused, vale PIN-i lukk ja selle aegumine, PIN-i lähtestamine, lukustamine koos seansside tühistamisega (ka vahemälus), viimase admini kaitse, aegunud seanss, väljalogimine ja valemisüstide kaitse.
- Brauseritest (Chromium, telefoni ja arvuti suurusega aken): kogu ülaltoodud voog seadistusest kuni laotöötaja õiguste piiranguni. Konsoolis vigu ei olnud. Kontrollisin ka, et kasutaja sisestatud HTML-i ei käivitata.
- Päris Google'i keskkonnas ma testida ei saanud, sest mul pole ligipääsu sinu Google'i kontole. Seepärast on ülaltoodud käsitsi testid olulised.

---

## Etapp 2: tooted, koodid, riiulid ja CSV-import

### Enne testimist: serveri koodi uuendamine (tähtis)

1. Ühenda GitHubis pull request (vajuta **Merge pull request**). Veebileht uueneb umbes minutiga.
2. Ava Apps Scriptis `Code.gs`, kustuta kogu sisu ja kleebi asemele uus [apps-script/Code.gs](apps-script/Code.gs). Salvesta (Ctrl+S / Cmd+S).
3. Vali **Deploy → Manage deployments**, vajuta pliiatsit ✎, vali **Version: New version** ja vajuta **Deploy**. **Ära tee uut juurutust**, siis jääb aadress samaks.
4. Kontroll: rakenduses **Seaded → Testi ühendust** peab näitama versiooni **1.1.0-etapp2**.
5. Kui brauser näitab veel vana lehte (avalehel on TOOTED ja RIIULID hallid), värskenda lehte: Ctrl+Shift+R või Macis Cmd+Shift+R.

### Testid

| # | Tegevus | Oodatav tulemus |
|---|---|---|
| 1 | Avaleht adminina | TOOTED ja RIIULID on aktiivsed |
| 2 | **RIIULID → Hulgilisamine**: A, 1–3, korrused 1–4, tsoon „Lao vasak sein” | Eelvaade näitab „Luuakse 12 riiulit: R-A01-01 … R-A03-04”. Pärast loomist on tabelis 12 riiulit ja need on ka tabeli lehel `Riiulid` |
| 3 | Korda sama hulgilisamist | „Loodud 0 riiulit, 12 oli juba olemas”, duplikaate ei teki |
| 4 | **+ Lisa riiul**, kood `b01` | Luuakse riiul **R-B01** (suurtähed, R- lisatakse ette) |
| 5 | **TOOTED → + Lisa toode**: skänni USB-skänneriga (või sisesta käsitsi ja vajuta Enter) tootja vöötkood, nt filtri karbilt | Pärast Enterit liigub kursor nimetuse väljale, salvestamist veel ei toimu |
| 6 | Täida nimetus, kategooria, riiul, miinimum 5, algsaldo 3 → Salvesta | Teade „Lisatud: <kood>”. Rida on tabelis kollase taustaga, sest saldo 3 on alla miinimumi 5 |
| 7 | **+ Lisa toode** koodi väljata, tüüp **Tööriist**, eksemplaride arv 2 | Luuakse „… #1” ja „… #2” koodidega T-00001 ja T-00002, olek LAOS |
| 8 | Lisa varuosa koodi väljata | Saab sisekoodi V-00001 (või järgmise vaba) |
| 9 | Proovi lisada toode koodiga, mis on juba olemas | Viga „Kood … on juba kasutusel.” |
| 10 | Otsing: sisesta osa koodist (nt `t-000`) või nimetusest | Nimekiri kitseneb kohe. Proovi ka filtreid ja linnukest „Alla miinimumi” |
| 11 | Ava toode (klõps real) → muuda miinimumi, salvesta | Andmed salvestuvad. Kontrolli tabeli lehte `Tooted` |
| 12 | Tootekaardil **Genereeri sisekood** | Tootele lisandub V-kood. Mõlemad koodid on lehel `Koodid` |
| 13 | **Eemalda** üks kood | Kood kaob. Kui jääb alles ainult üks kood, pole selle juures Eemalda-nuppu |
| 14 | **Arhiveeri** → tagasi nimekirja | Toode kaob nimekirjast ja ilmub tagasi linnukesega „Näita arhiveerituid”. **Taasta arhiivist** toob selle tagasi |
| 15 | **RIIULID → Tooted** (riiuli real) | Näitab sellel riiulil olevaid tooteid koos saldoga |
| 16 | **TOOTED → Impordi CSV → näidisfail**: laadi alla ja ava Excelis | Eesti tähed on õiged, veerud on eraldi lahtrites |
| 17 | Lisa Excelis paar rida (üks ilma nimetuseta, üks olemasoleva koodiga, üks uue riiuliga nt `Z09`), salvesta CSV-na ja impordi | Eelvaade näitab vigaseid ridu punasena koos põhjusega ja uue riiuli kohta märget „luuakse uus riiul R-Z09”. Import lisab ainult korras read |
| 18 | Importi oma päris tootenimekiri (kui on olemas) | Suur fail imporditakse 200 rea kaupa, edenemist näidatakse ekraanil |
| 19 | Logi sisse **laotöötajana** | TOOTED, RIIULID ja KASUTAJAD pole nähtavad. Laotöötaja saab uut toodet lisada etapis 3, kui skannib tundmatu koodi |
| 20 | **KASUTAJAD → Muuda**: muuda kasutajanime | Uue nimega saab sisse logida, vanaga enam mitte |

Tabelis peaks olema nii: lehel `Koodid` on veerus `kood` EAN-koodid koos algusnullidega, lehel `Loendurid` on järgmised vabad numbrid ja lehel `Liikumised` on algsaldode jaoks KORRIGEERIMINE-read.

### Mida ma ise testisin

- 27 uut automaattesti (`node tests/test-etapp2.js`) ja 30 etapi 1 testi. Need katavad EAN-13, EAN-8 ja UPC kontrollnumbriga tuvastamist, sisekoodide loendureid, eksemplare, duplikaatkoode (ka väiketähtedega ja riiulikoodidega), algsaldot ja õigusi (laotöötaja võib kiirlisada, aga ei saa muuta ega algsaldot panna), tüübi muutmise keeldu liikumistega tootel, hulgilisamist, saldo arvutust liikumistest ning importi vigaste ridade, korduskoodide ja 500 rea pakiga.
- Brauseritest arvuti ja telefoni suurusega aknas: kogu ülaltoodud voog, sh USB-skänneri Enter. CSV-import Windows-1257 kodeeringus failiga (vanem Excel) ja jutumärkidega väljadega. Konsoolis vigu ei olnud.
