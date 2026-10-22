# Laosüsteem – paigaldusjuhend

Juhend on kirjutatud nii, et selle järgi saab süsteemi üles seada ka ilma programmeerimiskogemuseta. Kogu paigaldus võtab umbes 20–30 minutit.

**Mis kuhu läheb:**

| Osa | Kus asub | Fail(id) |
|---|---|---|
| Andmebaas | Google Sheets (sinu Google'i kontol) | – |
| Taustasüsteem (API) | Google Apps Script, tabeli küljes | `apps-script/Code.gs` |
| Esipaneel (veebileht) | GitHub Pages | `index.html`, `css/`, `js/` |

Kui oled juhendi läbi teinud, on sul kaks aadressi:
- **API aadress** (`https://script.google.com/macros/s/…/exec`) – sellega räägib veebileht taustal. Kasutajad seda ei näe.
- **Rakenduse aadress** (`https://<kasutajanimi>.github.io/laosusteem/`) – selle avavad kõik telefonis ja arvutis.

> **Kui Google'i menüüd on inglise keeles:** Laiendused = *Extensions*, Käivita = *Run*, Juuruta → Uus juurutus = *Deploy → New deployment*, Veebirakendus = *Web app*, Käivita kasutajana: Mina = *Execute as: Me*, Kellel on juurdepääs: Kõik = *Who has access: Anyone*, Halda juurutusi = *Manage deployments*, Uus versioon = *New version*, Täitmislogi = *Execution log*.

---

## 1. Google Sheetsi loomine

1. Ava brauseris [sheets.new](https://sheets.new). Avaneb uus tühi tabel. Kasuta seda Google'i kontot, mille alla andmed peavad jääma.
2. Kliki vasakul üleval pealkirjale „Pealkirjata arvutustabel” ja anna nimeks **Laosüsteem**.

Lehti (Tooted, Kasutajad jne) ei pea käsitsi looma, sest skript loob need sammus 2.

> Tabelit ei pea kellegagi jagama. Laotöötajad kasutavad ainult rakendust, mitte tabelit.

## 2. Apps Scripti kleepimine ja seadistamine

1. Vali tabeli menüüst **Laiendused → Apps Script**. Avaneb uus vaheleht skriptiredaktoriga.
2. Pane projektile nimi: kliki vasakul üleval „Pealkirjata projekt” ja kirjuta **Laosüsteem API**.
3. Redaktoris on avatud fail `Code.gs`, milles on paar rida näidiskoodi. **Kustuta kogu see sisu.**
4. Ava failist `apps-script/Code.gs` kogu sisu, kopeeri see ja kleebi redaktorisse.
5. Salvesta: vajuta **Ctrl+S** (Macis **Cmd+S**) või kettaikooni.
6. Vali redaktori ülaribal funktsioonide rippmenüüst **seadista** ja vajuta **▶ Käivita**.
7. Esimesel korral küsib Google luba:
   - Vajuta **Vaata õigusi** ja vali oma Google'i konto.
   - Kuvatakse hoiatus „Google ei ole seda rakendust kinnitanud”. See on tavaline, sest skript on sinu enda oma. Vajuta **Täpsem** ja siis **Mine lehele Laosüsteem API (ebaturvaline)**.
   - Vajuta **Luba**.
8. Allosas avaneb **Täitmislogi**, kus on rida:
   `Seadistus tehtud. Esimese admini loomise SEADISTUSKOOD: 1A2B3C4D`
   **Kirjuta see 8-märgiline kood üles**, sest seda läheb vaja sammus 6.
9. Mine tagasi tabeli vahelehele. Tabelis on nüüd lehed Tooted, Koodid, Riiulid, Liikumised, Kasutajad, Seansid, Sildipõhjad ja Loendurid.

> Kui värskendad tabelit, tekib ülaribale menüü **Laosüsteem → Seadista / näita seadistuskoodi**. Sellega saad koodi hiljem uuesti vaadata. `seadista` võib käivitada mitu korda, sest olemasolevaid andmeid see ei muuda.

## 3. API juurutamine (avaldamine veebirakendusena)

1. Vajuta Apps Scripti redaktoris paremal üleval **Juuruta → Uus juurutus**.
2. Kliki ratta ikoonil (⚙) sõna „Valige tüüp” kõrval ja vali **Veebirakendus**.
3. Täida väljad:
   - **Kirjeldus:** `Laosüsteem`
   - **Käivita kasutajana:** **Mina** (sinu e-post)
   - **Kellel on juurdepääs:** **Kõik**
4. Vajuta **Juuruta**.
5. Kopeeri **Veebirakenduse URL**. See lõpeb `/exec`-iga. See ongi **API aadress**.
6. Kontroll: ava see aadress uues vahelehes. Peaksid nägema umbes sellist teksti:
   `{"ok":true,"data":{"versioon":"1.0.0-etapp1","nouabSeadistust":true,...}}`

> **Miks „Kõik”?** Telefonid ei ole sinu Google'i kontoga sisse logitud. Andmed on sellegipoolest kaitstud, sest iga päring kontrollib serveris rakenduse sisselogimist (kasutajanimi ja PIN). Ilma kehtiva seansita ei näita API andmeid ega luba neid muuta.

### Hiljem: koodi uuendamine (TÄHTIS)

Kui kleebid hiljem uue `Code.gs` versiooni (järgmised etapid), siis **ära tee uut juurutust**, sest see annaks uue aadressi. Tee nii:

1. Kleebi uus kood ja salvesta.
2. Vali **Juuruta → Halda juurutusi**.
3. Vali olemasolev juurutus ja vajuta pliiatsit (✎ Muuda).
4. Vali **Versioon:** **Uus versioon** ja vajuta **Juuruta**.

Aadress jääb samaks.

## 4. Esipaneeli üleslaadimine GitHub Pagesisse

### 4.1 API aadressi lisamine faili `js/config.js`

Ava fail `js/config.js` (nt Notepadiga) ja pane sammus 3 kopeeritud aadress jutumärkide vahele:

```js
window.LAO_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfy...../exec'
};
```

Salvesta fail. Seda saab teha ka hiljem otse GitHubis (vt 4.4).

### 4.2 Repo loomine

1. Logi sisse [github.com](https://github.com) kontole.
2. Vajuta paremal üleval **+ → New repository**.
3. **Repository name:** `laosusteem`
4. Vali **Public**. GitHub Pages on tasuta ainult avalikele repodele. Koodis ei ole paroole ega andmeid, need on ainult sinu Google'i tabelis.
5. Vajuta **Create repository**.

### 4.3 Failide üleslaadimine

1. Kliki uue repo lehel lingil **uploading an existing file**.
2. Lohista brauseriaknasse **kogu kausta sisu**: `index.html`, kaustad `css`, `js`, `apps-script` ning failid `JUHEND.md` ja `README.md`. Kaustad tuleb lohistada kaustadena, et struktuur säiliks.
3. Vajuta all **Commit changes**.

### 4.4 GitHub Pagesi sisselülitamine

1. Ava repos **Settings → Pages** (vasakus menüüs).
2. Vali **Source** alt **Deploy from a branch**.
3. Vali **Branch** alt `main` ja kaust `/ (root)`, siis vajuta **Save**.
4. Oota 1–2 minutit ja värskenda lehte. Üles ilmub teade „Your site is live at **https://<kasutajanimi>.github.io/laosusteem/**”.

Kui pead `config.js` faili hiljem muutma, ava GitHubis `js/config.js`, vajuta pliiatsit (✎), muuda ja vajuta **Commit changes**. Leht uueneb umbes minutiga.

> **Soovitus:** kui annad mulle repole ligipääsu, saan järgmiste etappide muudatused otse sinna panna ja sa ei pea faile käsitsi üles laadima.

## 5. API aadressi seadistamine

Kui panid aadressi faili `config.js` (samm 4.1), on see tehtud ja kehtib kõigis seadmetes.

Kontroll:

1. Ava rakenduse aadress.
2. Vajuta sisselogimislehel **Seaded** ja seejärel **Testi ühendust**.
3. Peaks tulema vastus „Ühendus töötab. Serveri versioon 1.0.0-etapp1.”

Aadressi saab muuta ka Seadete lehel, aga see kehtib ainult selles ühes seadmes. Sellest on abi testimisel.

## 6. Esimese admin-kasutaja loomine

1. Ava rakenduse aadress.
2. Sisselogimisvormi all on link **„Süsteem on seadistamata – loo esimene admin”**. Kliki sellel.
3. Täida väljad:
   - **Seadistuskood:** sammus 2 üles kirjutatud kood
   - **Kasutajanimi:** nt `mari` (väiketähed, ilma tühikuteta; sellega logid edaspidi sisse)
   - **Täisnimi:** nt `Mari Maasikas`
   - **PIN:** 4–6 numbrit, kaks korda
4. Vajuta **Loo admin ja logi sisse**.

Seadistuskood kehtib ühe korra. Kui esimene admin on loodud, saab uusi kasutajaid lisada ainult admin, vaates **KASUTAJAD**.

## 6b. Kaamera luba telefonis

Kui avad esimest korda SISSE, VÄLJA või TÖÖRIIST vaate, küsib brauser luba kaamerat kasutada. Vasta **Luba / Allow**.

- **Kui vajutasid kogemata „Keela”:**
  - **Android Chrome:** puuduta aadressiriba vasakus servas olevat ikooni → **Õigused** → **Kaamera** → **Luba**.
  - **iPhone Safari:** ava **Seaded → Safari → Kaamera** ja vali **Küsi** või **Luba**.
- Kaamera lülitatakse sisse ja välja nupuga 📷 skännimisvälja kõrval. Valik jääb seadmesse meelde: telefonis on kaamera vaikimisi sees, arvutis väljas.
- Arvutis töötab USB-vöötkoodiskänner ilma seadistamata. Ava SISSE või VÄLJA, vaata, et kursor oleks skännimisväljas, ja skänni. Skänner vajutab ise Enterit.

## 7. Telefoni avakuvale lisamine

*Valmib etapis 6 (PWA). Seni saab rakenduse avada brauseris tavalise lingina.*

## 8. Sildiprinteri seadistamine brauseris

*Valmib etapis 5 (sildiprint).*

---

## Turvalisus lühidalt

- PIN-e ei salvestata tabelisse avatekstina. Veerus `pin_räsi` on soolatud ja korduvalt arvutatud SHA-256 räsi. Lisaks kasutatakse salajast „pipart”, mis asub skripti atribuutides (Apps Script → Projekti seaded → Skripti atribuudid), mitte tabelis.
- Seansivõti jääb ainult telefoni. Lehel `Seansid` on ainult selle räsi, nii et tabelist võtit kätte ei saa.
- 5 järjestikust vale PIN-i lukustab kasutaja 15 minutiks. Admin saab luku kohe eemaldada nupuga **Lähtesta PIN** või **Aktiveeri**.
- **Lukusta** (nt kadunud telefoni korral) kustutab kasutaja kõik seansid kohe. Järgmine päring sellest telefonist suunatakse sisselogimisele.
- Süsteemi jääb alati vähemalt üks aktiivne admin. Viimast adminit ei saa lukustada ega tavakasutajaks muuta.
- Seadeid (lukustuse aeg, seansi kehtivus jms) saab muuta faili `Code.gs` alguses plokis `SEADED`.

**Kui seadistuskood on kadunud ja admini PIN ununenud:** kustuta tabeli lehel `Kasutajad` kõik andmeread (päis jääb alles), käivita uuesti `seadista` ja loo uus esimene admin.
