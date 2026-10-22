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

### Mida ma ise testisin

- 20 uut automaattesti (`node tests/test-etapp3.js`), mis katavad SISSE/VÄLJA, topeltsaatmise kaitset (sama id), konflikte (negatiivne saldo, topeltväljaandmine, tagastus laos olevale, arhiveeritud toode), õigusi (inventuur ja olekumuutus ainult adminil), ümberpaigutust, tühistamist (ainult oma viimane, admin mis tahes, kordustühistus keelatud) ja tulevikuaja kaitset. Lisaks läbivad endiselt 57 varasemat testi.
- Brauseritest: kogu ülaltoodud voog telefoni (puutetundlik) ja arvuti suuruses aknas.
- **Kaamera:** testisin simuleeritud kaamerapildiga. Lugeja tundis ära nii EAN-13 vöötkoodi kui ka QR-koodi ning kaamera lülitus vaatest lahkudes välja. Päris telefonis ma testida ei saanud, seega on testid 1–2 ja 15 olulised.

## Etapp 4: töö ilma internetita, sünkroonimine ja konfliktid

### Enne testimist

1. Ühenda GitHubis pull request (**Merge pull request → Confirm merge**).
2. Kleebi uus `apps-script/Code.gs` Apps Scripti ja tee **Deploy → Manage deployments → ✎ → Version: New version → Deploy**. Funktsiooni `seadista` uuesti käivitama ei pea, sest tabeli veerud ei muutunud.
3. **Seaded → Testi ühendust** peab näitama versiooni **1.3.0-etapp4**.
4. Värskenda rakendust: telefonis sulge vaheleht ja ava uuesti, arvutis vajuta Cmd+Shift+R. Kui kõik on korras, on ülaosas roheline riba **✓ Sünkroonitud** ja admini avalehel on paan **KONFLIKTID**.
5. Testimiseks on vaja kahte kasutajat, nt admin ja üks laotöötaja, ning soovitavalt kahte telefoni.

> **NB! Rakendus peab olema avatud enne, kui internet kaob.** Seni (kuni etapini 6) ei saa rakendust ilma internetita esimest korda avada ega lehte värskendada. Ava rakendus, lülita siis telefonis **lennukirežiim** sisse ja tööta edasi. Etapis 6 hakkab rakendus avanema ka ilma internetita.

### Testid telefonis

| # | Tegevus | Oodatav tulemus |
|---|---|---|
| 1 | Internetiga: **SISSE** → skänni toode → **KINNITA** | Roheline teade tuleb kohe. Selle all on kõigepealt „Salvestatud, saadan serverisse…” ja sekundi pärast „✓ Serveris”. Ülal on **✓ Sünkroonitud** |
| 2 | Lülita sisse **lennukirežiim**. Tee **VÄLJA** 2 tk | Kinnitus tuleb kohe ja saldo väheneb kohe. Teates on „Salvestatud seadmesse – saadetakse, kui internet tagasi tuleb”. Ülariba: **⚠ Võrguühendus puudub · Ootel: 1** |
| 3 | Ikka ilma internetita: skänni tundmatu kood → **+ Lisa uus toode** → salvesta → **KINNITA SISSE** | Toode lisatakse ja koguse vorm avaneb. Ülariba: **Ootel: 3** (uus toode ja 2 liikumist) |
| 4 | Vajuta ülaribale | Avaneb nimekiri ootel liikumistest: aeg, tüüp, kogus ja toode |
| 5 | Lülita lennukirežiim välja | Mõne sekundi jooksul läheb riba roheliseks: **✓ Sünkroonitud**. Tabelis on uus toode ja liikumised. Veerus `skännimise_aeg` on aeg, mil skännisid, mitte saatmise aeg |
| 6 | Tee ilma internetita liikumine, sulge rakendus täiesti ja oota veidi. Lülita internet sisse ja ava rakendus | Liikumine on alles ja saadetakse automaatselt |
| 7 | **Kaks telefoni**, mõlemad lennukirežiimis: anna sama tööriist mõlemast välja (eri inimestele). Lülita internet sisse kõigepealt esimeses, siis teises | Teine telefon näitab kollast teadet „…märgiti adminile ülevaatamiseks: Tööriist oli juba välja antud: …”. Ülaribal on „Sinu konflikte: 1” ja avalehel on hoiatus |
| 8 | **Kaks telefoni** lennukirežiimis: skänni mõlemas sama tundmatu kood, lisa toode (eri nimedega) ja tee SISSE. Lülita internet sisse kordamööda | Tabelis on ainult üks toode. Teise telefoni liikumine seotakse selle tootega ja märgitakse konfliktiks „Toode lisati kahest seadmest…” |
| 9 | Lennukirežiimis tee liikumine ja vajuta **Logi välja** | Hoiatus „Seadmes on 1 saatmata liikumist… Neid ei kustutata”. Vasta OK, logi sisse teise kasutajana ja lülita internet sisse. Liikumine saadetakse esimese kasutaja nimel |
| 10 | Telefonis lennukirežiimis: tee liikumine. Arvutis: **KASUTAJAD → Lukusta** see kasutaja. Telefonis lülita internet sisse | Telefon suunatakse sisselogimisele ja näitab teadet „Kasutaja on lukustatud. Saatmata liikumised edastati adminile”. Saldo **ei muutu** enne, kui admin selle liikumise kinnitab |
| 11 | Ilma internetita tee liikumine ja vajuta rohelises teates **Tühista** | Liikumine eemaldatakse järjekorrast ja serverisse seda üldse ei saadeta |

### Testid arvutis (admin)

| # | Tegevus | Oodatav tulemus |
|---|---|---|
| 12 | Ava avaleht | Paanil **KONFLIKTID** on punane arv, ülaribal „KONFLIKTE: N” |
| 13 | Ava **KONFLIKTID** | Iga konflikti juures on aeg, kasutaja, toiming, toode koos praeguse saldo/olekuga ja põhjus. Lukustatud kasutaja liikumisel on punane märge „lukustatud” |
| 14 | Lukustatud kasutaja liikumisel vajuta **Kinnita** | Liikumine läheb alles nüüd saldosse. Rida liigub alla „Viimati lahendatud” alla. Tabelis on veerus `lahendatud` „jah” ja põhjuse lõpus „[KINNITATUD: sinu nimi, aeg]” |
| 15 | Topeltväljaandmisel vajuta **Paranda** ja muuda „Kellele/kuhu” (või varuosal kogust) | Algne liikumine tühistatakse ja lisatakse parandatud liikumine sama aja ja sama kasutajaga. Märkuses on „(parandas …)” |
| 16 | Mõnel konfliktil vajuta **Tühista** | Lisatakse TÜHISTUS-liikumine ja saldo/olek taastub. Lukustatud kasutaja liikumine lükatakse lihtsalt tagasi |
| 17 | Telefonis, mille kasutaja konflikt lahendati, ava avaleht | Hoiatus „sinu liikumist ootab ülevaatust” kaob |

### Mida ma ise testisin

- 14 uut automaattesti (`node tests/test-etapp4.js`). Need katavad ilma internetita lisatud toote uuesti saatmist, sama koodiga toodet kahest seadmest, lukustatud kasutaja liikumisi (salvestuvad konfliktina ega muuda saldot), konfliktide nimekirja ja õigusi ning kinnitamist, parandamist ja tühistamist. Lisaks läbivad endiselt 77 varasemat testi.
- Brauseritest kahe „telefoniga”, kus võrk lülitati välja ja sisse. Kontrollisin testid 1–5 ja 7–11 ning konfliktide vaadet arvutis (kinnitamine ja parandamine). Kontrollisin ka, et järjekord jääb alles, kui leht laaditakse uuesti ajal, mil server ei vasta.
- Päris telefoni lennukirežiimiga ma testida ei saanud.

## Etapid 5 ja 6: sildiprint, ülevaated, eksport ja PWA

### Enne testimist

1. Ühenda GitHubis pull request (**Merge pull request → Confirm merge**).
2. Kleebi uus `apps-script/Code.gs` Apps Scripti ja tee **Deploy → Manage deployments → ✎ → Version: New version → Deploy**. Funktsiooni `seadista` uuesti käivitama ei pea, sest tabeli veerud ei muutunud.
3. **Seaded → Testi ühendust** peab näitama versiooni **1.5.0-etapp6**.
4. Värskenda rakendust: telefonis sulge vaheleht ja ava uuesti, arvutis vajuta Cmd+Shift+R. Avalehel peavad nüüd olema aktiivsed ka **LADU**, **VÄLJAS OLEVAD**, **AJALUGU** ja (adminil) **SILDID**.

### Sildiprint (arvutis, admin)

Sildiprinterit veel pole, seega prindi testid **„Salvesta PDF-ina”** (Save as PDF) või tavalisele printerile. PDF-is on näha, kas lehe suurus ja sisu on õiged.

| # | Tegevus | Oodatav tulemus |
|---|---|---|
| 1 | **SILDID** → Varuosad → **Vali kõik filtreeritud** | Paremal on eelvaade valitud siltidest ja „Valitud N silti” |
| 2 | Põhi **Tootesilt 62×29 mm** → **🖨 Prindi** → printer „Salvesta PDF-ina” | Printimisaknas on paberi suurus 62 × 29 mm. PDF-is on iga silt oma lehel: QR vasakul, paremal nimetus, vöötkood, kood ja riiul |
| 3 | Sama põhjaga tootel, millel on tootja kood (EAN) | Sildil on tootja vöötkood. Kui märgid **Eelista sisekoodi**, on sildil sisekood |
| 4 | Telefonis **SISSE** → skänni prinditud (või ekraanil olevat) silti, nii QR-i kui vöötkoodi | Mõlemad leiavad õige toote |
| 5 | Allikas **Riiulid**, põhi **Riiulisilt 62×100 mm** → Prindi | Suur riiulikood, nimetus, QR, vöötkood ja all kood koos tsooniga |
| 6 | Allikas **Tööriistad**, põhi **Väike tööriistasilt 29×29 mm** | Ainult QR ja kood |
| 7 | Põhi **A4 kleebiseleht 3×8**, **Alusta kleebisest nr** 5 → Prindi | A4 leht, esimesed 4 kohta on tühjad ja sildid algavad 5. kohast |
| 8 | Põhi Tootesilt → **Muuda / salvesta oma põhjana** → nimi „Proov 50×30”, laius 50, kõrgus 30 → Salvesta | Uus põhi on valikus (ka teises arvutis). **Kustuta põhi** eemaldab selle |
| 9 | **Testprint** | Prinditakse üks näidissilt, millel on põhja mõõdud |
| 10 | **TOOTED** → ava toode → **🖨 Prindi silt** | Avaneb aken põhja ja koguse valikuga. Prindi toimib nagu SILDID vaates |
| 11 | **RIIULID** → riiuli real **Prindi silt** | Prinditakse selle riiuli silt |
| 12 | **TOOTED → + Lisa toode** arvutis ja salvesta | Küsitakse „Prindi silt kohe?” |

### Ülevaated ja eksport

| # | Tegevus | Oodatav tulemus |
|---|---|---|
| 13 | **LADU** | Kõik tooted koos saldo, riiuli ja olekuga. Miinimumist allpool olevad read on esile tõstetud. Otsing ja filtrid (tüüp, kategooria, riiul, „Alla miinimumi”) töötavad |
| 14 | LADU → **⬇ CSV (Excel)** ja ava fail Excelis | Täpitähed on õiged, veerud on eraldi (semikoolon) ja kogused on komaga |
| 15 | **VÄLJAS OLEVAD** | Välja antud tööriistad: kellele, millal ja mitu päeva tagasi. 30+ päeva tagasi välja antud on esile tõstetud. Linnuke **Näita ka remondis ja kadunud** lisab REMONDIS ja KADUNUD tööriistad |
| 16 | **AJALUGU** → vali kuupäevad, tüüp ja kasutaja | Liikumised vastavad filtritele. Tühistatud ja konfliktiga read on märgitud |
| 17 | Tootekaardil **Ajalugu** | Avaneb ainult selle toote ajalugu |
| 18 | AJALUGU → **⬇ CSV (Excel)** | Fail sisaldab filtrile vastavaid ridu (kuni 5000) |

### Telefon (PWA)

| # | Tegevus | Oodatav tulemus |
|---|---|---|
| 19 | Lisa rakendus avakuvale (JUHEND, punkt 7) | Avakuval on sinine ikoon „Ladu”. See avaneb täisekraanil ilma aadressiribata |
| 20 | Lülita **lennukirežiim** sisse ja ava rakendus avakuvalt | Rakendus avaneb, ülaribal on „⚠ Võrguühendus puudub”. LADU näitab viimati laaditud saldosid. SISSE/VÄLJA salvestavad järjekorda nagu etapis 4 |
| 21 | Lülita internet sisse | Ootel liikumised saadetakse ja riba läheb roheliseks |

### Mida ma ise testisin

- 6 uut automaattesti (`node tests/test-etapp56.js`). Need katavad sildipõhjade salvestamist ja kustutamist (ainult admin, mõõtude kontroll), ajaloo filtreid (kuupäev Tallinna aja järgi, toode, tüüp, kasutaja) ja tühistatud liikumiste märkimist. Lisaks läbivad endiselt 91 varasemat testi.
- Brauseritest (Chromium): kõik neli põhja prinditi PDF-iks ja kontrollisin, et lehe suurus on täpne (nt 62 × 29 mm) ning et ükski tekst ega vöötkood ei lõigu. Kontrollisin ka oma põhja salvestamist, LADU / VÄLJAS / AJALUGU filtreid ja CSV-faile ning seda, et rakendus avaneb pärast esimest laadimist ka ilma võrguta.
- Päris sildiprinteriga ja päris telefoni avakuvalt ma testida ei saanud.

## Kiirus: skännimine ilma serveri ootamiseta

### Mis muutus

- **Telefon:** toodete, koodide, riiulite ja saldode nimekiri on telefonis (IndexedDB). See uueneb taustal rakenduse avamisel, esiplaanile tulekul, pärast saadetud liikumisi ja iga 3 minuti järel. Skännimisel otsitakse ainult telefonist.
- **Tundmatu kood:** lisamise vorm avaneb kohe. Taustal kontrollitakse serverist, kas keegi on selle koodi vahepeal lisanud. Kui on, suletakse vorm ja jätkatakse olemasoleva tootega.
- **Uus toode skännimisel** salvestatakse kohe telefoni ja saadetakse serverisse taustal (varem ootas see kaks serveri vastust).
- **Server:** uus leht **Saldod**. Saldo saamiseks ei loeta enam kogu Liikumiste lehte. Liikumise salvestamisel loetakse liikumistest ainult id-veerg (topeltkirjete kontroll) ja uuendatakse ainult puudutatud toodete saldoridu.
- **Äratus:** rakenduse avamisel saadetakse taustal kerge päring (`soe`). Soovi korral saab lisada 5-minutilise soojenduse (JUHEND, „Soojendus”).
- **SEADED → Kontrolli saldosid** (admin) ja **SEADED → Näita aegu** (arendusrežiim).

### Paigaldus koos enne/pärast mõõtmisega

1. Ühenda pull request. Oota 2–3 minutit, kuni GitHub Pages uueneb.
2. **Code.gs-i veel ära uuenda.** Telefonis ava rakendus uuesti (sulge vaheleht või äpp täiesti). Mine **SEADED** ja märgi **Näita aegu**.
3. **Mõõtmine ENNE (vana server):** tee 3–4 korda SISSE, et saata liikumisi serverisse. Mine tagasi **SEADED** ja vaata tabelit. Huvitavad on read **Serverisse saatmine** ja **Nimekirja laadimine**. Vajuta **Kopeeri tabel** ja saada mulle (või tee ekraanipilt).
4. Kleebi uus `Code.gs` ja salvesta.
5. **Enne juurutamist** vali ülal funktsioonide valikust **paigaldaSoojendus** ja vajuta **Käivita**. Uus kood kasutab käivitajaid, seega küsib Google ühe korra uut luba. Anna see (nagu esimesel paigaldusel). Ilma loata ei pruugi API pärast juurutamist töötada.
6. Tee **Deploy → Manage deployments → ✎ → New version → Deploy**. **Seaded → Testi ühendust** peab näitama versiooni **1.6.0-kiirus**. Leht **Saldod** luuakse ise esimese päringuga.
7. **Mõõtmine PÄRAST:** tee samad toimingud uuesti ja kopeeri tabel.
8. Admin: **SEADED → Kontrolli saldosid** peab näitama „kõik saldod klapivad”.

### Testid telefonis

| # | Tegevus | Oodatav tulemus |
|---|---|---|
| 1 | SISSE → skänni tuttav toode | Koguse vorm avaneb kohe, ilma „Otsin…” tekstita |
| 2 | **KINNITA** | Kohe on näha „✓ … Saldo nüüd N” ja saab skännida järgmist. Arendusrežiimis on all rida „⏱ otsing … · salvestus seadmesse … · server …”. Serveri aeg ilmub, kui vastus tuleb |
| 3 | Skänni kood, mida pole | Lisamise vorm avaneb kohe |
| 4 | Täida nimetus → **Salvesta** | Koguse vorm avaneb kohe. Teade „Toode lisatud … (saadan serverisse…)” |
| 5 | Arvutis lisa uus toode. Kohe pärast seda skänni telefonis selle kood | Telefon avab lisamise vormi, aga sulgeb selle mõne sekundi pärast ise: „See kood on juba olemas: …”. Jätkub olemasoleva tootega |
| 6 | Lisamise vormis vajuta **Loobu** | Tagasi skännimise juurde |
| 7 | Lennukirežiim → tee liikumisi → internet tagasi | Nagu varem: järjekord saadetakse ja riba läheb roheliseks |
| 8 | Arvutis tee telefoni tootele liikumine. Telefonis oota kuni 3 minutit või too rakendus esiplaanile | Telefoni saldo uueneb ise |

### Mida ma ise testisin

- Serveri testid: 9 uut (`node tests/test-kiirus.js`). Need katavad Saldode lehe uuendamist, vana tabeli automaatset üleminekut, topeltsaatmist, tühistamist, vanade konfliktide nähtavust, soojenduse päästikut ja `soe` päringut. Lisaks kontrollivad etappide 2–4 testid nüüd lõpus, et Saldode leht klapib liikumistega. Kokku läbib 109 testi.
- Serveri tabelilugemised testandmetega (500 toodet, 20 000 liikumist, `node tests/moot-kiirus.js`):

| Tegevus | Enne (loetud lahtreid) | Pärast |
|---|---|---|
| Nimekiri telefoni (`andmed`) | 246 024 | 61 054 |
| 1 liikumise salvestus | 244 533 | 27 545 |
| 20 liikumise salvestus | 244 545 | 27 690 |

- Brauseris telefonivaates, kus API vastas 3 s viivitusega (nagu Apps Script):

| Samm | Enne | Pärast |
|---|---|---|
| Tuttav kood → koguse vorm | 0,1 s | 0,1 s |
| KINNITA → „Salvestatud” | 0,1 s | 0,1 s |
| Tundmatu kood → lisamise vorm | 3,4 s | 0,1 s |
| Uus toode salvesta → koguse vorm | 6,4 s | 0,1 s |

- Lisaks läksid uuesti läbi etappide 4–6 brauseritestid (töö ilma võrguta, kaks telefoni, lukustatud kasutaja, konfliktid, sildid, PWA).
- Leidsin ja parandasin veel ühe vea: roheline teade kattis 3 sekundiks ekraani alaosas olevaid nuppe (nt KINNITA), nii et vajutus ei läinud läbi. Nüüd läheb vajutus teatest läbi.
- Päris Apps Scripti aegu ma mõõta ei saanud. Need näed arendusrežiimis.
