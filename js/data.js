/* =====================================================================
   MatCalc – import dat z textových souborů
   ---------------------------------------------------------------------
   Parser .txt (libovolný oddělovač, desetinná tečka/čárka, hlavička,
   přeskočené řádky, transpozice) a úložiště v IndexedDB:
     datasety  = importované soubory (text + volby importu)
     proměnné  = pojmenované sloupce (Float64Array), globální napříč datasety
   Datové proměnné se před každým během vloží do workspace jako vektory
   (vždy čerstvá kopie, takže kód uložená data nikdy nezmění).
   Soubor nesahá na DOM – okno DATA je v dataview.js.
   ===================================================================== */
(function () {
  'use strict';

  const MC = (window.MC = window.MC || {});

  const PREVIEW_ROWS = 50;
  const PREVIEW_COLS = 100;
  const BIG = 1e6;             // od kolika hodnot varovat

  /* =====================================================================
     1) Parser
     ===================================================================== */
  const DEFAULT_OPTS = { sep: ' ', merge: true, dec: '.', skip: 0, header: false, transpose: false };

  // text zadaný uživatelem -> skutečný oddělovač ("\t" = tabulátor, prázdné = mezera)
  function sepOf(s) {
    const t = String(s === undefined || s === null ? '' : s).replace(/\\t/g, '\t');
    return t === '' ? ' ' : t;
  }
  // čitelný popis oddělovače pro okno DATA
  function sepLabel(s) {
    const t = sepOf(s);
    if (t === ' ') return 'mezera';
    if (t === '\t') return 'tabulátor';
    if (/^ +$/.test(t)) return t.length + '× mezera';
    const names = { ';': 'středník', ',': 'čárka', '|': 'svislá čára', ':': 'dvojtečka' };
    return names[t] || '„' + t.replace(/\t/g, '⇥') + '“';
  }

  // rozdělení řádku na pole; uvozovky "…" chrání oddělovač uvnitř (CSV z Excelu)
  function splitLine(line, sep, merge) {
    if (merge && /^[ \t]+$/.test(sep)) {
      const t = line.trim();
      return t ? t.split(/[ \t]+/) : [];
    }
    let parts;
    if (line.indexOf('"') >= 0) {
      parts = [];
      let cur = '';
      let q = false;
      for (let i = 0; i < line.length;) {
        const c = line[i];
        if (q) {
          if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i += 2; continue; } q = false; i++; continue; }
          cur += c; i++; continue;
        }
        if (c === '"' && !cur.trim()) { q = true; cur = ''; i++; continue; }
        if (line.startsWith(sep, i)) { parts.push(cur); cur = ''; i += sep.length; continue; }
        cur += c; i++;
      }
      parts.push(cur);
    } else parts = line.split(sep);
    if (merge) parts = parts.filter((p) => p !== '');
    return parts;
  }

  const NUM_DOT = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
  const NUM_COMMA = /^[+-]?(?:\d+,?\d*|,\d+)(?:[eE][+-]?\d+)?$/;
  const INF_RE = /^([+-]?)inf(inity)?$/i;

  // text -> číslo; prázdné nebo nečíselné = NaN
  function toNum(raw, dec) {
    let t = raw.trim();
    if (!t) return NaN;
    if (t.length > 1 && t[0] === '"' && t[t.length - 1] === '"') t = t.slice(1, -1).trim();
    if (dec === ',') { if (NUM_COMMA.test(t)) return Number(t.replace(',', '.')); }
    else if (NUM_DOT.test(t)) return Number(t);
    const m = t.match(INF_RE);
    if (m) return m[1] === '-' ? -Infinity : Infinity;
    return NaN;
  }

  function splitText(text) {
    return String(text).replace(/^﻿/, '').split(/\r\n|\r|\n/);
  }

  /**
   * Rozbor textu podle voleb.
   * Vrací { nRows, nCols, cols:[Float64Array], names:[…]|null, preview:[[{v, raw}]], nan, emptyLines, total, warnings }
   * names = hlavička (první řádek), u transpozice první sloupec.
   */
  function parse(text, o) {
    o = Object.assign({}, DEFAULT_OPTS, o || {});
    const sep = sepOf(o.sep);
    const dec = o.dec === ',' ? ',' : '.';
    const lines = splitText(text);
    const skip = Math.max(0, Math.floor(Number(o.skip) || 0));
    const rows = [];          // řádky souboru jako pole čísel
    const raws = [];          // původní texty prvních řádků (pro náhled)
    let names = null;
    const tNames = [];        // názvy z prvního sloupce (transpozice)
    let emptyLines = 0;
    let headerDone = !o.header || o.transpose;
    let headerLine = '';
    let width = 0;
    for (let i = skip; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) { emptyLines++; continue; }
      let f = splitLine(line, sep, o.merge);
      if (!headerDone) { names = f.map((x) => x.trim().replace(/^"(.*)"$/, '$1')); headerLine = line; headerDone = true; continue; }
      if (o.transpose && o.header) { tNames.push((f[0] || '').trim().replace(/^"(.*)"$/, '$1')); f = f.slice(1); }
      const r = new Array(f.length);
      for (let j = 0; j < f.length; j++) r[j] = toNum(f[j], dec);
      if (f.length > width) width = f.length;
      rows.push(r);
      if (raws.length < Math.max(PREVIEW_ROWS, PREVIEW_COLS)) raws.push(f.slice(0, Math.max(PREVIEW_ROWS, PREVIEW_COLS)));
    }
    // hlavička oddělená mezerami, ve které jsou mezery i v názvech („Čas [s]   Průtok [l/s]“):
    // když se nevejde do počtu sloupců, zkusí se rozdělit podle 2+ mezer / tabulátoru
    if (names && headerLine && names.length > width && width > 0 && /^[ \t]+$/.test(sep)) {
      const alt = headerSplit(headerLine);
      if (alt.length === width) names = alt;
    }
    // koncové prázdné řádky nejsou „přeskočené“, jen konec souboru
    for (let i = lines.length - 1; i >= skip && !lines[i].trim(); i--) emptyLines--;

    let nRows;
    let nCols;
    const cols = [];
    let rawAt;
    if (!o.transpose) {
      nRows = rows.length;
      nCols = Math.max(width, names ? names.length : 0);
      for (let j = 0; j < nCols; j++) {
        const c = new Float64Array(nRows);
        for (let r = 0; r < nRows; r++) { const v = rows[r][j]; c[r] = v === undefined ? NaN : v; }
        cols.push(c);
      }
      rawAt = (r, c) => (raws[r] ? raws[r][c] : undefined);
    } else {
      nCols = rows.length;
      nRows = width;
      for (let j = 0; j < nCols; j++) {
        const c = new Float64Array(nRows);
        const src = rows[j];
        for (let r = 0; r < nRows; r++) { const v = src[r]; c[r] = v === undefined ? NaN : v; }
        cols.push(c);
      }
      names = o.header ? tNames : null;
      rawAt = (r, c) => (raws[c] ? raws[c][r] : undefined);
    }

    const nan = new Array(nCols).fill(0);
    cols.forEach((c, j) => { let k = 0; for (let r = 0; r < c.length; r++) if (c[r] !== c[r]) k++; nan[j] = k; });

    const preview = [];
    const pc = Math.min(nCols, PREVIEW_COLS);
    for (let r = 0; r < Math.min(nRows, PREVIEW_ROWS); r++) {
      const row = [];
      for (let c = 0; c < pc; c++) row.push({ v: cols[c][r], raw: rawAt(r, c) });
      preview.push(row);
    }

    const total = nRows * nCols;
    const warnings = [];
    if (sep === ',' && dec === ',') warnings.push('Oddělovač sloupců i desetinný oddělovač je čárka – čísla se rozpadnou do dvou sloupců. Zvol jiný oddělovač (např. ;) nebo desetinnou tečku.');
    if (total > BIG) warnings.push('Velký soubor: ' + fmtInt(total) + ' hodnot. Import funguje, ale výpočty a grafy můžou být pomalejší.');
    if (!nRows) warnings.push('Po přeskočení řádků a hlavičky nezbyla žádná data.');
    const nanTotal = nan.reduce((a, b) => a + b, 0);
    if (total && nanTotal === total) warnings.push('Žádná hodnota není číslo – zkontroluj oddělovač sloupců a desetinný oddělovač.');
    return { nRows, nCols, cols, names, preview, nan, nanTotal, emptyLines: Math.max(0, emptyLines), total, warnings, big: total > BIG };
  }

  const headerSplit = (line) => line.trim().split(/\t+| {2,}/).map((x) => x.trim()).filter(Boolean);

  const fmtInt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  // Odhad voleb ze začátku souboru (výchozí stav po importu, uživatel je může změnit)
  function detect(text) {
    const lines = splitText(text).filter((l) => l.trim()).slice(0, 40);
    const o = Object.assign({}, DEFAULT_OPTS);
    if (!lines.length) return o;
    const body = lines.length > 2 ? lines.slice(1) : lines;
    const cands = [['\t', false], [';', false], [',', false], ['|', false], [' ', true]];
    for (const [sep, merge] of cands) {
      const counts = body.map((l) => splitLine(l, sep, merge).length);
      const mode = counts.slice().sort((a, b) => counts.filter((x) => x === b).length - counts.filter((x) => x === a).length)[0];
      const okLines = counts.filter((x) => x === mode).length;
      if (mode >= 2 && okLines >= Math.ceil(body.length * 0.8)) { o.sep = sep === '\t' ? '\\t' : sep; o.merge = merge; break; }
    }
    const sep = sepOf(o.sep);
    // desetinná čárka: čísla jako 1,5 a žádná 1.5 (a čárka není oddělovač)
    if (sep !== ',') {
      const fields = body.flatMap((l) => splitLine(l, sep, o.merge)).map((x) => x.trim());
      const comma = fields.filter((x) => NUM_COMMA.test(x) && x.includes(',')).length;
      const dot = fields.filter((x) => NUM_DOT.test(x) && x.includes('.')).length;
      if (comma > dot) o.dec = ',';
    }
    // hlavička: první řádek má nečíselná pole, další řádky jsou čísla
    const first = splitLine(lines[0], sep, o.merge);
    const isNum = (x) => !Number.isNaN(toNum(x, o.dec)) || !x.trim();
    if (lines.length > 1 && first.some((x) => !isNum(x)) && splitLine(lines[1], sep, o.merge).every(isNum)) o.header = true;
    // úvodní řádky s textem (popis měření) přeskočit, pokud za nimi začínají data
    if (!o.header) {
      let k = 0;
      const all = splitText(text);
      while (k < Math.min(all.length, 30) && (!all[k].trim() || splitLine(all[k], sep, o.merge).some((x) => !isNum(x)))) k++;
      if (k > 0 && k < all.length) {
        // poslední textový řádek před daty je nejspíš hlavička
        let h = k - 1;
        while (h >= 0 && !all[h].trim()) h--;
        const hf = h >= 0 ? splitLine(all[h], sep, o.merge) : [];
        const df = splitLine(all[k] || '', sep, o.merge);
        const fits = hf.length === df.length || (/^[ \t]+$/.test(sep) && h >= 0 && headerSplit(all[h]).length === df.length);
        if (h >= 0 && fits && df.length > 1) { o.skip = h; o.header = true; } else o.skip = k;
      }
    }
    return o;
  }

  /* ---------- názvy proměnných ---------- */
  const KEYWORDS = new Set(['if', 'else', 'elseif', 'end', 'for', 'while', 'function', 'return', 'break', 'continue', 'switch', 'case',
    'otherwise', 'try', 'catch', 'global', 'persistent', 'ans', 'pi', 'e', 'i', 'j', 'Inf', 'inf', 'NaN', 'nan', 'true', 'false',
    'clc', 'clear', 'clearvars', 'format', 'load', 'gca', 'gcf', 'to', 'in', 'and', 'or', 'xor', 'not', 'mod']);

  // text z hlavičky -> platný identifikátor („Průtok [l/s]“ -> „Prutok_l_s“)
  function toIdent(s, fallback) {
    let t = String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!t) t = fallback || 'data';
    if (/^\d/.test(t)) t = 'x' + t;
    if (t.length > 40) t = t.slice(0, 40).replace(/_+$/, '');
    if (reservedWhy(t)) t += '_';
    return t;
  }

  function reservedWhy(name) {
    if (KEYWORDS.has(name)) return '„' + name + '“ je vyhrazené slovo';
    const G = MC.graphics;
    if (G && G.FUNCS && G.FUNCS.has(name)) return '„' + name + '“ je grafický příkaz';
    const math = MC.engine && MC.engine.math;
    if (math && typeof math[name] === 'function') return '„' + name + '“ je název funkce';
    return '';
  }

  // kontrola názvu; vrací chybový text nebo ''
  function checkName(name) {
    if (!name) return 'Zadej název proměnné';
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) return 'Název musí začínat písmenem a obsahovat jen písmena bez diakritiky, číslice a _ (např. ' + toIdent(name) + ')';
    if (name.length > 63) return 'Název je moc dlouhý (max. 63 znaků)';
    return reservedWhy(name);
  }

  /* =====================================================================
     2) Úložiště (IndexedDB, při nedostupnosti jen v paměti)
     ===================================================================== */
  const DB_NAME = 'matcalc-data';
  const datasets = new Map();   // id -> { id, name, fileName, size, text, opts, created, modified }
  const vars = new Map();       // name -> { name, datasetId, col, header, values: Float64Array, modified }
  const parsed = new Map();     // id -> { key, res, rows }
  let db = null;
  let persistent = false;
  let failReason = '';

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB není k dispozici')); return; }
      let rq;
      try { rq = indexedDB.open(DB_NAME, 1); } catch (e) { reject(e); return; }
      rq.onupgradeneeded = () => {
        const d = rq.result;
        if (!d.objectStoreNames.contains('datasets')) d.createObjectStore('datasets', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('vars')) d.createObjectStore('vars', { keyPath: 'name' });
      };
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error || new Error('IndexedDB se nepodařilo otevřít'));
      rq.onblocked = () => reject(new Error('IndexedDB je blokovaná jiným oknem'));
    });
  }

  const reqP = (rq) => new Promise((res, rej) => { rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });

  // zápis: fn(stores) v jedné transakci; bez databáze jen v paměti
  function write(fn) {
    if (!db) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let t;
      try { t = db.transaction(['datasets', 'vars'], 'readwrite'); } catch (e) { reject(e); return; }
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Zápis přerušen (plné úložiště?)'));
      fn({ ds: t.objectStore('datasets'), vars: t.objectStore('vars') });
    });
  }

  const ready = openDb().then(async (d) => {
    db = d;
    persistent = true;
    const t = db.transaction(['datasets', 'vars'], 'readonly');
    const [dl, vl] = await Promise.all([reqP(t.objectStore('datasets').getAll()), reqP(t.objectStore('vars').getAll())]);
    dl.forEach((x) => datasets.set(x.id, x));
    vl.forEach((x) => { if (x && x.name && x.values) vars.set(x.name, x); });
  }).catch((e) => { failReason = (e && e.message) || String(e); persistent = false; });

  const uid = () => 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const optsKey = (o) => JSON.stringify([o.sep, !!o.merge, o.dec, +o.skip || 0, !!o.header, !!o.transpose]);

  function parsedOf(id) {
    const ds = datasets.get(id);
    if (!ds) return null;
    const key = optsKey(ds.opts);
    let p = parsed.get(id);
    if (!p || p.key !== key) { p = { key, res: parse(ds.text, ds.opts), rows: null }; parsed.set(id, p); }
    return p.res;
  }

  function list() { return Array.from(datasets.values()).sort((a, b) => a.created - b.created); }
  function varList(dsId) {
    const a = Array.from(vars.values());
    return (dsId ? a.filter((v) => v.datasetId === dsId) : a).sort((x, y) => (x.datasetId === y.datasetId ? x.col - y.col : x.modified - y.modified));
  }

  function uniqueDsName(base) {
    const names = new Set(list().map((d) => d.name));
    if (!names.has(base)) return base;
    let i = 2;
    while (names.has(base + ' ' + i)) i++;
    return base + ' ' + i;
  }

  function askPersist() {
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* nevadí */ }
  }

  async function addDataset(o) {
    const ds = {
      id: uid(),
      name: uniqueDsName(o.name || String(o.fileName || 'data').replace(/\.[^.]+$/, '')),
      fileName: o.fileName || 'data.txt',
      size: o.text.length,
      text: o.text,
      opts: Object.assign({}, DEFAULT_OPTS, o.opts || detect(o.text)),
      created: Date.now(),
      modified: Date.now(),
    };
    datasets.set(ds.id, ds);
    await write((s) => s.ds.put(ds));
    askPersist();
    return ds;
  }

  // změna názvu nebo voleb; proměnné z datasetu se přepočítají podle nových voleb
  async function updateDataset(id, patch) {
    const ds = datasets.get(id);
    if (!ds) return null;
    if (patch.name !== undefined) ds.name = patch.name;
    if (patch.opts) ds.opts = Object.assign({}, ds.opts, patch.opts);
    ds.modified = Date.now();
    const changed = [];
    if (patch.opts) {
      const res = parsedOf(id);
      varList(id).forEach((v) => {
        if (v.col < res.nCols) {
          v.values = res.cols[v.col].slice();
          v.header = res.names ? res.names[v.col] || '' : '';
          v.missing = false;
        } else v.missing = true;
        v.arr = null;
        v.modified = Date.now();
        changed.push(v);
      });
    }
    await write((s) => { s.ds.put(ds); changed.forEach((v) => s.vars.put(stored(v))); });
    return ds;
  }

  async function deleteDataset(id) {
    const vs = varList(id);
    datasets.delete(id);
    parsed.delete(id);
    vs.forEach((v) => vars.delete(v.name));
    await write((s) => { s.ds.delete(id); vs.forEach((v) => s.vars.delete(v.name)); });
  }

  // jen trvalá pole (bez mezipaměti)
  const stored = (v) => ({ name: v.name, datasetId: v.datasetId, col: v.col, header: v.header || '', values: v.values, modified: v.modified, missing: !!v.missing });

  // pojmenuje sloupec (přepíše proměnnou stejného názvu)
  async function setVar(name, dsId, col) {
    const res = parsedOf(dsId);
    if (!res || col >= res.nCols) throw new Error('Sloupec neexistuje');
    const old = vars.get(name);
    // sloupec už měl jiný název -> přejmenování
    const prev = varList(dsId).find((v) => v.col === col && v.name !== name);
    const v = { name, datasetId: dsId, col, header: res.names ? res.names[col] || '' : '', values: res.cols[col].slice(), modified: Date.now() };
    vars.set(name, v);
    if (prev) vars.delete(prev.name);
    await write((s) => { s.vars.put(stored(v)); if (prev) s.vars.delete(prev.name); });
    return { replaced: old && !(old.datasetId === dsId && old.col === col) ? old : null, renamedFrom: prev ? prev.name : null };
  }

  async function renameVar(oldName, newName) {
    const v = vars.get(oldName);
    if (!v || oldName === newName) return;
    vars.delete(oldName);
    v.name = newName;
    v.modified = Date.now();
    vars.set(newName, v);
    await write((s) => { s.vars.delete(oldName); s.vars.put(stored(v)); });
  }

  async function deleteVar(name) {
    if (!vars.has(name)) return;
    vars.delete(name);
    await write((s) => s.vars.delete(name));
  }

  /* =====================================================================
     3) Napojení na výpočet
     ===================================================================== */
  // vloží datové proměnné do workspace (čerstvé kopie); onlyMissing = jen chybějící (po clear)
  // vrací Map název -> vložený objekt (podle něj se pozná zastínění)
  function inject(scope, onlyMissing) {
    const math = MC.engine.math;
    const out = new Map();
    vars.forEach((v) => {
      if (onlyMissing && Object.prototype.hasOwnProperty.call(scope, v.name)) return;
      if (!v.arr) v.arr = Array.from(v.values);
      const m = math.matrix(v.arr);   // math.matrix pole kopíruje
      scope[v.name] = m;
      out.set(v.name, m);
    });
    return out;
  }

  function findByFile(name) {
    const n = String(name).trim();
    const all = list();
    const base = (s) => String(s).replace(/^.*[\\/]/, '');
    return all.find((d) => d.fileName === n) ||
      all.find((d) => d.fileName.toLowerCase() === base(n).toLowerCase()) ||
      all.find((d) => d.name === n || d.name.toLowerCase() === base(n).replace(/\.[^.]+$/, '').toLowerCase()) || null;
  }

  // M = load("soubor.txt") – celá matice (řádky × sloupce) stejným parserem jako okno DATA
  function loadMatrix(name) {
    const ds = findByFile(name);
    if (!ds) {
      const e = new Error('load: soubor „' + name + '“ není nahraný');
      const names = list().map((d) => '"' + d.fileName + '"');
      e.hint = 'Nahraj ho v okně Data (tlačítko Importovat). ' + (names.length ? 'Nahrané soubory: ' + names.join(', ') + '.' : 'Zatím není nahraný žádný soubor.');
      throw e;
    }
    const res = parsedOf(ds.id);
    const p = parsed.get(ds.id);
    if (!p.rows) {
      p.rows = new Array(res.nRows);
      for (let r = 0; r < res.nRows; r++) {
        const row = new Array(res.nCols);
        for (let c = 0; c < res.nCols; c++) row[c] = res.cols[c][r];
        p.rows[r] = row;
      }
    }
    return MC.engine.math.matrix(p.rows.length ? p.rows : []);
  }

  MC.data = {
    ready,
    get persistent() { return persistent; },
    get failReason() { return failReason; },
    PREVIEW_ROWS, PREVIEW_COLS, BIG,
    parse, detect, sepOf, sepLabel, toIdent, checkName, fmtInt,
    list, get: (id) => datasets.get(id) || null, parsedOf,
    addDataset, updateDataset, deleteDataset,
    vars: varList, getVar: (n) => vars.get(n) || null, has: (n) => vars.has(n), names: () => new Set(vars.keys()),
    setVar, renameVar, deleteVar,
    inject, loadMatrix, findByFile,
  };
})();
