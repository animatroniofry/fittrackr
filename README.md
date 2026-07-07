# Fitness Tracker v3 — mobilná appka napojená na tvoj Google Sheet

Čo je nové oproti pôvodnej appke:

- **Zápis a Miery sú v jednom tabe** — hore je prepínač "Denný záznam / Miery", prekliká sa medzi nimi bez zbytočného tabu navyše.
- **Vlastný profil s fotkou** — každý si vie nahrať profilovku. Fotku vidia aj ostatní (v rebríčku aj v profile).
- **Nový tab "Profil"** — tvoja história po týždňoch (váha, tréningy, kalórie) + porovnanie so všetkými ostatnými. Klepnutím na niekoho v rebríčku alebo v porovnaní sa dá pozrieť aj jeho profil.
- **Prihlásenie cez meno + PIN** — už nie je výber z 2 pevných "slotov". Na úvodnej obrazovke sú len dve tlačidlá: **Prihlásiť sa** (zadáš meno a PIN) a **Vytvoriť nový profil** (meno, farba, PIN, voliteľne rovno aj fotka). Appka podporuje až **6 profilov** naraz (dá sa v `Code.gs` zvýšiť cez `MAX_PROFILES`, ale treba tomu prispôsobiť aj Sheet — použi priložený `Fitness_Tracker_2026_v3.xlsx`, ktorý je na 6 miest už pripravený).

### Nové v tejto verzii

- **Dashboard rozdelený na dva pohľady** — prepínač hore: **Porovnanie** (rebríček + graf váhy všetkých ľudí naraz) a **Len ja** (tvoja váha, tréningy, makrá — bez ostatných).
- **Prognóza a trend** — v pohľade "Len ja" appka z tvojich zapísaných váh spočíta jednoduchý trend (kg/týždeň) a predpovie, koľko budeš vážiť o pár týždňov. V grafe je to bodkovaná čiara naviac k reálnym dátam. Pribudol aj graf "Tréningy podľa týždňov", nech vidíš, ako ti to ide v čase.
- **Zápis sa po uložení vyčistí** — keď potvrdíš uloženie denného záznamu alebo mier, polia sa vyprázdnia, aby nemiatli a bolo jasné, že appka to zobrala.
- **Rebríček má dva pohľady** — prepínač **Tento mesiac / Celkovo** hore v tabe Rebríček. Nikde v appke sa už neukazuje číslo týždňa (nie je žiadny "štart" sezóny) — grafy a "aktuálny týždeň" v Miery zobrazujú namiesto toho dátumy.
- **Vymazanie profilu** — dvomi spôsobmi:
  - **Sám sebe** — v Nastaveniach je tlačidlo "Vymazať môj profil" (treba zadať svoj PIN).
  - **Niekomu inému** (napr. keď niekto z rodiny prestane byť aktívny) — priamo v Google Sheete pribudlo menu **🏋️ Fitness Tracker → Spravovať profily**, kde ho vieš vymazať jedným klikom, bez PINu. Historické dáta v hárkoch ostanú zachované, vymaže sa len prihlasovací profil a uvoľní sa miesto pre nového človeka.

Súbory:
- `Code.gs` — backend (Google Apps Script), ide **do tvojho Google Sheetu**
- `index.html`, `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png` — appka, ide **na GitHub Pages**
- (mimo tejto zložky) `Fitness_Tracker_2026_v3.xlsx` — nová predloha Sheetu, nahraj ju na Google Disk a otvor ako Google Sheet

Nasadenie má tri kroky. Trvá to cca 10 minút a robí sa to len raz.

---

## Krok 0 — Nový Sheet

1. Nahraj `Fitness_Tracker_2026_v3.xlsx` na Google Disk.
2. Klikni naň pravým tlačidlom → **Otvoriť pomocou → Google Sheety** (alebo ho rovno takto vytvorí, keď naň dvojklikneš). Tým vznikne plnohodnotný Google Sheet.
3. Hárky `Miery`, `Strava`, `Cvičenie` majú teraz miesto pre 6 ľudí (predtým 2) — nepoužité riadky sú jednoducho prázdne, kým si niekto nevytvorí profil v appke.

## Krok 1 — Backend v Google Sheete (Apps Script)

1. Otvor svoj nový Fitness Tracker Google Sheet.
2. Hore v menu klikni **Rozšírenia (Extensions) → Apps Script**.
3. Zmaž predvyplnený obsah v `Code.gs` a vlož tam **celý obsah** súboru `Code.gs` z tejto zložky.
4. Klikni na disketu (Uložiť projekt).
5. Hore vpravo klikni **Nasadiť (Deploy) → Nové nasadenie (New deployment)**.
6. Pri "Vybrať typ" (ozubené koliesko) zvoľ **Webová aplikácia (Web app)**.
7. Nastav:
   - **Spustiť ako (Execute as):** Ja (tvoj účet)
   - **Kto má prístup (Who has access):** Ktokoľvek (Anyone)

   ⚠️ Toto je nutné, inak appka na mobile nebude vedieť čítať/zapisovať dáta.
8. Klikni **Nasadiť (Deploy)**. Google ťa teraz upozorní na **dve povolenia**, ktoré treba schváliť (nové oproti predošlej verzii):
   - prístup k tomuto Sheetu (ako doteraz),
   - **prístup k Google Disku** — potrebné len na ukladanie profilových fotiek appka si vytvorí vlastný priečinok `FitnessTracker Fotky` a nič iné na disku sa jej netýka.

   Klikni "Rozšírené" → "Prejsť na projekt (nebezpečné)" — je to tvoj vlastný skript, takže je to v poriadku.
9. Skopíruj **Web app URL** (vyzerá takto: `https://script.google.com/macros/s/AKfycb.../exec`). Túto URL budeš potrebovať v appke.

**Dôležité:** Ak neskôr zmeníš čokoľvek v `Code.gs`, musíš spraviť **Nasadiť → Spravovať nasadenia → ✏️ upraviť → Nová verzia**, inak appka uvidí starý kód.

**Menu na mazanie profilov:** po vložení tohto `Code.gs` a uložení stačí obnoviť (refresh) stránku so Sheetom v prehliadači — hore v menu pribudne **🏋️ Fitness Tracker → Spravovať profily**. Toto menu funguje len v samotnom Google Sheete (nie v mobilnej appke) a slúži presne na to, aby si vedel/a jednoducho vymazať profil niekoho, kto prestal byť aktívny — bez PINu, netreba nové nasadenie.

---

## Krok 2 — Appka na GitHub Pages

1. Na [github.com](https://github.com) si vytvor nový **public** repozitár (napr. `fitness-tracker`).
2. Nahraj doň všetkých 5 súborov z tejto zložky (`index.html`, `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png`) — cez "Add file → Upload files" priamo v prehliadači.
3. V repozitári choď do **Settings → Pages**.
4. Pri "Source" vyber **Deploy from a branch**, branch `main`, priečinok `/ (root)`. Ulož.
5. Po minúte ti GitHub ukáže URL appky, niečo ako `https://tvoje-meno.github.io/fitness-tracker/`.

Ak už appku na GitHub Pages máš z predtým, stačí tam len **prepísať `index.html`** novým súborom (ostatné súbory sú nezmenené).

---

## Krok 3 — Prvé spustenie na mobile

1. Otvor tú URL v Safari (iPhone) alebo Chrome.
2. Appka sa opýta na **Web app URL** zo Sheetu (Krok 1, bod 9) — vlož ju.
3. Klikni **Vytvoriť nový profil** — zadaj meno, vyber farbu, zvoľ PIN, voliteľne rovno nahraj fotku.
4. V Safari klikni ikonu zdieľania → **Pridať na plochu (Add to Home Screen)**. Appka sa odteraz otvára ako normálna appka, na celú obrazovku.
5. To isté spravte na telefónoch ostatných členov rodiny — každý si vytvorí svoj vlastný profil (meno + PIN), dáta idú do rovnakého Sheetu. Pri ďalšom prihlásení už len zvolia "Prihlásiť sa" a zadajú svoje meno + PIN.

---

## Ako to funguje

- Appka pri každom uložení robí `fetch()` priamo na Web App URL zo Sheetu — žiadny extra server, žiadna databáza.
- Profily (meno, farba, PIN, fotka) sú uložené v Script Properties skriptu, nie v bunkách Sheetu — Sheet obsahuje len denné/týždenné dáta pre max. 6 ľudí (podľa `MAX_PROFILES` v `Code.gs`).
- Profilové fotky sa ukladajú do priečinka `FitnessTracker Fotky` na tvojom Google Disku (v tom istom účte, kde beží Apps Script) a appka ich zobrazuje cez verejný odkaz na zdieľanie (viditeľné pre kohokoľvek s odkazom — to je to isté nastavenie, aké appka aj tak vyžaduje pre samotný Web App).
- Ak si niekedy chceš zvýšiť kapacitu nad 6 ľudí, zmeň `MAX_PROFILES` v `Code.gs` **a** si necháš vygenerovať zodpovedajúci nový xlsx (blokový rozostup riadkov sa mení podľa tejto konštanty).

## Testovanie na počítači pred nahraním na GitHub

```
cd fitness-tracker
python3 -m http.server 8000
```
a potom otvor `http://localhost:8000` v prehliadači.
