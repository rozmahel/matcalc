# MatCalc

Lehká webová kalkulačka ve stylu MATLABu na rychlé, opakované výpočty.
Nadefinuješ proměnné, spustíš skript a dostaneš výsledky. Grafy se píšou příkazy z MATLABu
(`figure`, `plot`, `title`…) a klikání je do kódu zapisuje za tebe.

## Spuštění

Otevři `index.html` dvojklikem (Safari, Chrome i Firefox). Server ani internet nejsou potřeba,
všechny knihovny jsou ve složce `vendor/`.

Skripty se ukládají automaticky v prohlížeči (localStorage).
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
Kdyby se něco zaseklo ve staré verzi, zvyš v `sw.js` hodnotu `VERSION` (např. `'v2'`).

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
  základní `set(gca, …)`, `close all`, `clf`. Každý `figure` je jedna záložka.
  Hodnoty se do grafu vezmou ve chvíli volání `plot`, stejně jako v MATLABu.
  Neznámé volby jen vypíšou varování, výpočet pokračuje.
- **Klikání píše kód**: pravý klik ve Workspace (osa X, osa Y, nový graf) zapíše řádky do bloku
  `%% Grafy` na konci skriptu hned. Změny v panelu nastavení se nejdřív jen ukážou (graf se
  překreslí, budoucí řádky jsou v editoru zeleně) a do kódu je zapíše **Zapsat do kódu** nahoře v nastavení,
  Enter v poli, ⌘S nebo klik do editoru. Zapsané změny jdou vrátit ⌘Z. Složitější ručně psané řádky (výrazy, `sprintf`, víc příkazů
  na řádku) ukáže panel jen pro čtení, stejně jako grafy vytvořené mimo blok `%% Grafy`.
- **Export**: PNG (1×/2×/3×), SVG, obrázek do schránky, data grafu do schránky jako tabulka pro Excel
  (s desetinnou čárkou podle jazyka systému).
- **Přepočítávat při psaní**: volitelně se skript přepočítá sám chvíli po úpravě.
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
js/plotcode.js      úpravy bloku %% Grafy z klikání, převod starých grafů na kód
js/app.js           rozhraní: editor, Command Window, Workspace, menu, ukládání
js/examples.js      ukázkové skripty pro první spuštění
icons/             ikony aplikace (PWA, favicon), zdroj icon.svg
manifest.webmanifest, sw.js, js/pwa.js   instalace jako aplikace a offline režim
vendor/             math.js 14.9, Plotly.js basic 2.35, CodeMirror 5.65 (+ show-hint)
```

## Nápady na další verze

- jednoduché `for` / `if`
- víc typů grafů (sloupcový, bodový s chybovými úsečkami), `subplot`, `text`, `errorbar`
- tmavý režim
- načtení dat z CSV / vložení sloupce z Excelu jako proměnné
