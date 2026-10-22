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

---

## Etapp 3: telefoniga skännimine

### Enne testimist

1. Ühenda GitHubis pull request (**Merge pull request → Confirm merge**).
2. Kleebi uus `apps-script/Code.gs` Apps Scripti ja tee **Deploy → Manage deployments → ✎ → Version: New version → Deploy**.
3. **Seaded → Testi ühendust** peab näitama versiooni **1.2.0-etapp3**.
4. Kui avalehel pole paani ÜMBERPAIGUTUS, värskenda lehte (telefonis sulge vaheleht ja ava uuesti, arvutis Cmd+Shift+R).
5. Testimiseks on vaja mõnda toodet koos vöötkoodiga (nt tootja EAN karbil) ja mõnda tööriista. Sobivad ka etapis 2 lisatud tooted. Kui sildiprinterit veel pole, ava tootekaart arvutis ja skänni telefoniga koodi otse ekraanilt. Sisekoodi (nt T-00001) saab sisestada ka käsitsi.

### Testid telefonis

| # | Tegevus | Oodatav tulemus |
|---|---|---|
| 1 | Logi telefonis sisse laotöötajana → **SISSE** | Brauser küsib kaamera luba. Pärast lubamist on näha kaamerapilt |
| 2 | Suuna kaamera toote vöötkoodile | Piiks/vibratsioon, toote nimi, kood, riiul ja praegune saldo |
| 3 | Vajuta **+** kaks korda, kirjuta märkus „Arve 123”, vajuta **KINNITA SISSE** | Roheline teade „✓ SISSE 3 tk – … Saldo nüüd X”. Tabeli lehel `Liikumised` on uus rida sinu kasutaja-id, märkuse ja skännimise ajaga |
| 4 | Vajuta rohelises teates **Tühista** | Teade „Tühistatud”. Saldo on tagasi endine. Lehel `Liikumised` on lisarida tüübiga TÜHISTUS (ajalugu jääb alles) |
| 5 | **VÄLJA** → skänni sama toode → pane kogus suuremaks kui saldo | Punane hoiatus „Saldo läheks negatiivseks …” ja nupp „KINNITA IKKAGI”. Pärast kinnitamist on teade kollane: „Märgitud adminile ülevaatamiseks” |
| 6 | Skänni riiuli silt (või sisesta `R-A01`) | Näidatakse riiuli tooteid koos saldoga. Toote puudutamisel avaneb koguse vorm |
| 7 | **VÄLJA** vaates skänni tööriist | „See on tööriist” ja nupp „Ava TÖÖRIIST” |
| 8 | **TÖÖRIIST** → skänni laos olev tööriist → kirjuta „Kellele/kuhu” → **ANNA VÄLJA** | „✓ VÄLJA ANTUD: … → …”. Järgmisel korral pakutakse sama nime valikuna |
| 9 | Skänni sama tööriist uuesti | Näidatakse, kellel see on ja mitu päeva. Üks nupp: **TAGASTA LATTU** |
| 10 | Vajuta **TAGASTA LATTU** | „✓ TAGASTATUD … on laos.” |
| 11 | Anna sama tööriist välja kahest telefonist korraga (või teine kasutaja annab juba väljas oleva välja) | Teine väljaandmine salvestatakse, aga märgitakse konfliktiks (kollane teade) |
| 12 | **SISSE** → skänni kood, mida süsteemis pole | „Tundmatu kood” ja nupp **+ Lisa uus toode**. Vormis on kood eeltäidetud. Riiuli saab valida nimekirjast või nupuga **📷 Skänni riiuli silt** |
| 13 | Salvesta uus toode | Avaneb kohe sama toote koguse vorm. Kinnita SISSE |
| 14 | **ÜMBERPAIGUTUS** → skänni toode → skänni teise riiuli silt | „✓ …: R-A01 → R-A02”. Arvutis on TOOTED vaates riiul muutunud |
| 15 | Lülita kaamera nupuga 📷 välja ja sulge rakendus. Ava uuesti | Kaamera jääb välja lülitatuks, kuni lülitad selle ise sisse |
| 16 | Proovi töökinnastega | Kõik nupud peaksid olema piisavalt suured |

### Testid arvutis

| # | Tegevus | Oodatav tulemus |
|---|---|---|
| 17 | Ava **SISSE** ja skänni USB-skänneriga (või kirjuta kood ja vajuta Enter) | Toode avaneb ja fookus on nupul KINNITA, nii et teine Enter kinnitab koguse 1. Pärast seda on kursor jälle skännimisväljas |
| 18 | Adminina **TOOTED → toode → Inventuur**: sisesta tegelik kogus | Saldo muutub selleks koguseks. Lehel `Liikumised` on KORRIGEERIMINE vahega ja märkusega „Inventuur: tegelik X, oli Y” |
| 19 | Adminina **TÖÖRIIST** → skänni tööriist → **Märgi remonti** | Olek REMONDIS. Tagastamine viib selle uuesti LAOS-olekusse |

**Mis tuleb etapis 4:** praegu peab liikumise salvestamiseks olema internet. Ilma ühenduseta tuleb teade „Serveriga ei saa ühendust” ja liikumine jääb salvestamata. Etapis 4 salvestatakse liikumine kohe telefoni ja saadetakse serverisse, kui ühendus taastub. Siis tuleb ka KONFLIKTIDE vaade.

### Mida ma ise testisin

- 20 uut automaattesti (`node tests/test-etapp3.js`), mis katavad SISSE/VÄLJA, topeltsaatmise kaitset (sama id), konflikte (negatiivne saldo, topeltväljaandmine, tagastus laos olevale, arhiveeritud toode), õigusi (inventuur ja olekumuutus ainult adminil), ümberpaigutust, tühistamist (ainult oma viimane, admin mis tahes, kordustühistus keelatud) ja tulevikuaja kaitset. Lisaks läbivad endiselt 57 varasemat testi.
- Brauseritest: kogu ülaltoodud voog telefoni (puutetundlik) ja arvuti suuruses aknas.
- **Kaamera:** testisin simuleeritud kaamerapildiga. Lugeja tundis ära nii EAN-13 vöötkoodi kui ka QR-koodi ning kaamera lülitus vaatest lahkudes välja. Päris telefonis ma testida ei saanud, seega on testid 1–2 ja 15 olulised.
