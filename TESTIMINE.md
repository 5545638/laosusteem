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
