# MatCalc

Lehká webová kalkulačka ve stylu MATLABu na rychlé, opakované výpočty.
Nadefinuješ proměnné, spustíš skript a dostaneš výsledky. Grafy se píšou příkazy z MATLABu
(`figure`, `plot`, `title`…) a klikání je do kódu zapisuje za tebe.

## Spuštění

Otevři `index.html` dvojklikem (Safari, Chrome i Firefox). Server ani internet nejsou potřeba,
všechny knihovny jsou ve složce `vendor/`.

Skripty se ukládají automaticky v prohlížeči (localStorage), importovaná data v IndexedDB.
Data jsou svázaná s konkrétním prohlížečem, takže si občas udělej **Záloha všeho** (.json),
nebo ukládej jednotlivé skripty přes **Uložit .m**.

## Na GitHubu jako aplikace (PWA)

1. Nahraj obsah složky do repozitáře (soubory přímo v kořeni, `index.html` nahoře).
2. Na GitHubu: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   větev `main`, složka `/ (root)` → **Save**. Za chvíli běží na `https://<uživatel>.github.io/<repo>/`.
3. Otevři adresu a nainstaluj:
   - **Chrome / Edge (Mac i Windows)**: ikona instalace vpravo v adresním řádku.
   - **Safari na Macu**: Soubor → Přidat do Docku.
   - **iPhone / iPad**: Sdílet → Přidat na plochu.

Po prvním otevření funguje i bez internetu (service worker `sw.js` si uloží všechny soubory).
Nová verze nahraná na GitHub se projeví při **druhém** otevření aplikace (první načtení ji stáhne na pozadí).
Při nahrání nové verze zvyš v `sw.js` hodnotu `VERSION` (teď `'4'`) a stejné číslo dej v `index.html` do adres
`css/style.css?v=4` a `js/….js?v=4`. Díky tomu se nikdy nesmíchají staré a nové soubory. Kdyby se přesto
načetl některý soubor ze starší verze, aplikace to po spuštění napíše do Command Window.

Skripty v nainstalované aplikaci mají vlastní úložiště (localStorage podle adresy webu),
nesdílí se s verzí otevřenou ze souboru. Přenes je přes **Záloha všeho** → **Obnovit**.

Soubory PWA: `manifest.webmanifest`, `sw.js`, `js/pwa.js`, `icons/`, `.nojekyll`.
Zdroj ikony je `icons/icon.svg`.

## Co umí

- **Editor** se zvýrazněním syntaxe MATLABu, číslováním řádků a zkratkami
  (⌘↵ spustit, ⌥↵ spustit sekci, F9 spustit výběr, ⌘/ zakomentovat).
- **Sekce `%%`**: nadpis za `%%` je tučně a nad ním je dělicí čára, sekce s kurzorem je podbarvená.
  Tlačítko **Sekce** (⌥↵) spustí jen ji ve stávajícím workspace (jako Run Section v MATLABu).
- **Našeptávač**: po dvou písmenech nabídne proměnné a funkce s popisem (Ctrl+Space ručně).
  Šablony jako `linspace(od, do, n)` mají místa k vyplnění, Tab skáče na další.
- **Command Window**: výsledky s odkazem na řádek a příkazový řádek `>>` s historií (↑ ↓).
  Starší běhy se ztlumí, takže je vidět, co se změnilo.
- **Workspace**: tabulka proměnných (název, hodnota, velikost). Dvojklik ukáže všechny hodnoty,
  pravý klik otevře menu pro graf. Víc proměnných vybereš s ⌘/Ctrl nebo Shift.
- **Grafy příkazy z MATLABu**: `figure`, `hold on/off`, `plot` (i styl `'r--o'`, `'LineWidth'`,
  `'DisplayName'`, `'Color'`…), `semilogx/semilogy/loglog`, `title`, `xlabel`, `ylabel` s TeXem
  (`^{24}Na`, `P_z`, `\sigma`, `^\circC`), `legend`, `grid`, `box`, `xlim/ylim`, `axis tight`,
  základní `set(gca, …)`, `yyaxis left/right`, `close all`, `clf`. Každý `figure` je jedna záložka.
- **Vedlejší osa Y** (`yyaxis right`): jako v MATLABu – `plot`, `ylabel`, `ylim`, `semilogy`
  a `set(gca, 'YScale', …)` za `yyaxis right` patří pravé ose, `title`, `xlabel`, `legend`, `grid`
  celému grafu. Popisky a čísla pravé osy mají barvu její křivky, když je na ní jedna.
  Hodnoty se do grafu vezmou ve chvíli volání `plot`, stejně jako v MATLABu.
  Neznámé volby jen vypíšou varování, výpočet pokračuje.
- **Klikání píše kód**: pravý klik ve Workspace (osa X, osa Y, nový graf) zapíše řádky do bloku
  `%% Grafy` na konci skriptu hned. Složitější ručně psané řádky (výrazy, `sprintf`, víc příkazů
  na řádku) ukáže menu nastavení jen pro čtení, stejně jako grafy vytvořené mimo blok `%% Grafy`.
- **Menu nastavení grafu** (tlačítko **Nastavení** v liště nebo posuvníky vpravo nad grafem) je ve výchozím
  stavu skryté. Při otevření si vezme kopii kódu grafu (návrh) a mění jen ji; graf se vždy vykreslí
  celý znovu z návrhu jednou funkcí, budoucí řádky jsou v editoru zeleně.
  - Textová pole (popisky, rozsahy, perioda, tloušťka) se projeví po **Enteru** nebo opuštění pole,
    přepínače a výběry (proměnná, log osa, strana osy Y…) hned.
  - Neplatná hodnota (nečíselná, min ≥ max, mez ≤ 0 na logaritmické ose, prázdná perioda nebo tloušťka)
    se do grafu nepošle – pole zčervená a graf zůstane na poslední platné verzi. Prázdný rozsah = automaticky.
  - **Živý náhled** (výchozí zapnutý, volba se pamatuje): vypnutý = graf se překreslí až zeleným tlačítkem
    **Překreslit**.
  - **Zrušit** vrátí graf přesně do stavu před otevřením menu (i se zoomem), **Zapsat do kódu** (⌘S) zapíše
    změny do editoru – jde to vrátit jedním ⌘Z.
  - Menu se zavře klikem kamkoliv mimo něj nebo **Esc**. S neuloženými změnami se zeptá: **Uložit**,
    **Zahodit**, nebo **Pokračovat v úpravách**. Klik, který menu zavírá, nic jiného neudělá (nezoomuje,
    nevybere řádek, neotevře kontextové menu).
  - U každé křivky je volba **Osa Y: levá / pravá (vedlejší)**; pravá osa má vlastní popisek, rozsah
    a logaritmické měřítko. Do kódu se zapíše jako `yyaxis right` a stejný kód se zpětně načte do menu.
- **Zoom a reset os**: tažení myší je jen dočasný pohled, do `xlim`/`ylim` se nezapisuje. Dvojklik do grafu
  nebo domeček v liště grafu vrátí pohled na rozsah z kódu (nebo z menu); automaticky jen tam, kde limit
  zadaný není. Se samotným `xlim` se osa Y přizpůsobí datům uvnitř tohoto rozsahu x. Platí i pro pravou osu.
- **Export**: PNG (1×/2×/3×), SVG, obrázek do schránky, data grafu do schránky jako tabulka pro Excel
  (s desetinnou čárkou podle jazyka systému). Obrázek je vždy ve světlé variantě (pro protokoly).
- **Tmavý režim**: tlačítko **Tmavý** vedle Dat. Bez volby se řídí nastavením systému, volba se pamatuje.
  Tmavé je celé rozhraní včetně editoru, Command Window, tabulek a grafu; barvy křivek jsou v tmavém režimu
  světlejší (stejné odstíny), černé čáry světlé.
- **Vyčistit** v liště smaže proměnné i výpis Command Window, historie příkazů (↑ ↓) zůstane.
  Guma ve Workspace maže jen proměnné.
- **Přepočítávat při psaní**: volitelně se skript přepočítá sám chvíli po úpravě.
- **Data ze souborů** (tlačítka **Importovat** a **Data** v liště): textový soubor s čísly (.txt, .csv, .dat).
  V okně Data se nastaví oddělovač sloupců (libovolný text: mezera, `;`, `,`, `---`, `\t` = tabulátor),
  sloučení opakovaných oddělovačů, desetinná tečka/čárka, počet přeskočených řádků, hlavička a transpozice
  (pro data uložená po řádcích). Volby se při importu odhadnou samy. Náhled ukazuje jen prvních 50 řádků
  a počet řádků × sloupců; nad ~1 milion hodnot se zobrazí varování. Soubory ve windows-1250 se rozpoznají.
  - Kliknutím na záhlaví sloupce ho pojmenuješ (z hlavičky se nabídne platný název, `Průtok [l/s]` → `Prutok_l_s`)
    a celý sloupec je pak v kódu obyčejný vektor. Nečíselné a prázdné hodnoty jsou `NaN`, řádek zůstává
    (`isnan`, `rmmissing`).
  - Každý import je dataset (záložka v okně Data), proměnné jsou společné pro všechny datasety a skripty.
    Ve Workspace mají ikonku 📊; přejmenovat a smazat je jde v okně Data nebo pravým klikem ve Workspace.
  - Ukládají se do IndexedDB jako `Float64Array`, takže přežijí zavření prohlížeče a fungují offline.
  - Přiřazení do datové proměnné v kódu ji zastíní jen pro daný běh (v Command Window je nenápadné upozornění),
    uložená data se nemění. `clear` datové proměnné nesmaže.
  - `M = load("mereni.txt")` vrátí celou matici souboru nahraného v okně Data (stejný parser a volby).
  - V grafu fungují jako ostatní vektory (pravý klik, výběr v nastavení). Délky X a Y se kontrolují.
    Osa X může být **index vzorku** nebo **čas z periody vzorkování**: zadáš periodu (např. 0,01 s) a do bloku
    `%% Grafy` se zapíše `t = (0:numel(y)-1)*0.01;`, perioda jde pak měnit v nastavení.
- **Soubory**: `.m` je čistý kód včetně grafů, žádná skrytá data na konci.
  Soubory `.m` a `.json` jde otevřít tlačítkem nebo přetažením do okna. Starší skripty a soubory,
  kde byly grafy uložené jako skrytý JSON, se při načtení samy převedou na blok `%% Grafy`.

## Syntaxe (MATLAB → MatCalc)

| Funguje stejně jako v MATLABu | Poznámka |
|---|---|
| `a = 5;` `% komentář` `...` | středník potlačí výpis |
| `0:0.5:10`, `linspace`, `[1 2 3]`, `[1 2; 3 4]` | |
| `v(2)`, `v(end)`, `v(2:end)` | indexuje se od 1 |
| `.*` `./` `.^`, `sin(x)` na vektoru | prvkově |
| `f(x) = x.^2 + 1` | anonymní funkce bez `@` |
| `disp`, `fprintf`, `sprintf`, `num2str` | |
| `'text'`, `"text"`, `'it''s'` | zpětné lomítko se nepřekládá, jako v MATLABu |
| `figure`, `plot`, `hold on`, `title`, `legend`, `grid on`, `xlim`, `set(gca, …)` | grafy, viz výše |
| `format long`, `clc`, `clear` | |
| `trapz`, `interp1`, `polyfit`, `polyval`, `rms`, `sind`/`cosd` | doplněné funkce |

Navíc oproti MATLABu fungují **jednotky**: `U = 22 kV`, `P = sqrt(3)*U*I to MW`.

Zatím nejsou cykly `for` a `while` ani podmínky `if`. Násobení dvou vektorů přes `*` hlásí chybu
stejně jako MATLAB (pro prvkové násobení je `.*`).

## Struktura

```
index.html          rozložení stránky
css/style.css       vzhled
js/engine.js        výpočetní jádro (math.js + převod syntaxe MATLABu, formátování)
js/graphics.js      grafické příkazy z MATLABu (figure, plot, title, legend, set…)
js/plot.js          vykreslení grafů (Plotly), TeX v popiscích, export
js/plotcode.js      úpravy bloku %% Grafy z klikání (i časová osa), převod starých grafů na kód
js/data.js          import dat: parser .txt, úložiště datasetů a proměnných (IndexedDB), load()
js/dataview.js      okno Data: volby importu, náhled, pojmenování sloupců
js/app.js           rozhraní: editor, Command Window, Workspace, menu, ukládání
js/examples.js      ukázkové skripty pro první spuštění
icons/             ikony aplikace (PWA, favicon), zdroj icon.svg
manifest.webmanifest, sw.js, js/pwa.js   instalace jako aplikace a offline režim
vendor/             math.js 14.9, Plotly.js basic 2.35, CodeMirror 5.65 (+ show-hint)
```

## Nápady na další verze

- jednoduché `for` / `if`
- víc typů grafů (sloupcový, bodový s chybovými úsečkami), `subplot`, `text`, `errorbar`
- vložení sloupce z Excelu (schránka) jako datové proměnné
- importovaná data i v **Záloze všeho** (.json)
- `mean(x, 'omitnan')` a podobné volby pro data s chybějícími hodnotami
