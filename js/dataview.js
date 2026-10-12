/* =====================================================================
   MatCalc – okno DATA
   ---------------------------------------------------------------------
   Import .txt souborů, volby importu (oddělovač, desetinná čárka,
   přeskočené řádky, hlavička, transpozice), náhled prvních 50 řádků
   a pojmenování sloupců kliknutím na záhlaví. Každý import je dataset
   (záložka nahoře). Proměnné jsou globální napříč datasety.
   Parser a úložiště jsou v data.js, napojení na výpočet v app.js
   (host = toast, confirmBox, promptText, onChange…).
   ===================================================================== */
(function () {
  'use strict';

  const MC = window.MC;
  const D = MC.data;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtInt = D.fmtInt;

  let host = null;
  const st = { root: null, id: null, editCol: null, timer: null, fileInput: null };

  function init(h) {
    host = h;
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.txt,.csv,.dat,.tsv,.asc,.prn,text/plain';
    inp.multiple = true;
    inp.hidden = true;
    document.body.appendChild(inp);
    inp.addEventListener('change', () => { const files = Array.from(inp.files || []); inp.value = ''; importFiles(files); });
    st.fileInput = inp;
  }

  const isOpen = () => !!st.root;
  function pickFiles() { st.fileInput.click(); }

  /* ---------- import souborů ---------- */
  function readText(file) {
    const read = (enc) => new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error || new Error('Soubor nejde přečíst'));
      r.readAsText(file, enc);
    });
    // české soubory z Windows bývají ve windows-1250 – v UTF-8 by z nich byly otazníky
    return read('utf-8').then((t) => (t.indexOf('\uFFFD') < 0 ? t : read('windows-1250').then((t2) => (t2.indexOf('\uFFFD') < 0 ? t2 : t))));
  }

  async function importFiles(files) {
    let last = null;
    for (const file of files) {
      try {
        const text = await readText(file);
        last = await D.addDataset({ fileName: file.name, text });
        host.toast('Načteno: ' + file.name + ' – zkontroluj volby v náhledu');
      } catch (e) {
        host.toast('Soubor ' + file.name + ' se nepodařilo načíst: ' + (e && e.message ? e.message : e), true);
      }
    }
    if (last) open(last.id);
  }

  /* ---------- okno ---------- */
  function open(id) {
    if (!st.root) build();
    const list = D.list();
    st.id = id && D.get(id) ? id : st.id && D.get(st.id) ? st.id : list.length ? list[list.length - 1].id : null;
    st.editCol = null;
    renderTabs();
    renderPane();
  }

  function close() {
    if (!st.root) return;
    clearTimeout(st.timer);
    st.root.remove();
    st.root = null;
    document.removeEventListener('keydown', onKey, true);
    host.onClose();
  }

  function build() {
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap dv-wrap';
    wrap.innerHTML = '<div class="modal dv" role="dialog" aria-modal="true" aria-label="Data">' +
      '<div class="modal-head"><h3>Data</h3><span class="dv-store"></span><button class="modal-x" aria-label="Zavřít">×</button></div>' +
      '<div class="dv-tabs"></div><div class="dv-body"></div>' +
      '<div class="modal-foot"><span class="dv-foot"></span><button class="btn primary" data-act="close">Hotovo</button></div></div>';
    $('.dv-store', wrap).textContent = D.persistent ? 'ukládá se v prohlížeči i offline' : 'jen do zavření okna – prohlížeč neumožňuje trvalé uložení';
    $('.dv-store', wrap).classList.toggle('bad', !D.persistent);
    wrap.addEventListener('click', onClick);
    wrap.addEventListener('input', onInput);
    wrap.addEventListener('change', onChange);
    wrap.addEventListener('dragover', (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); wrap.classList.add('drop'); } });
    wrap.addEventListener('dragleave', (e) => { if (e.target === wrap) wrap.classList.remove('drop'); });
    wrap.addEventListener('drop', () => wrap.classList.remove('drop'));
    document.addEventListener('keydown', onKey, true);
    $('#modalRoot').appendChild(wrap);
    st.root = wrap;
  }

  function onKey(e) {
    if (!st.root || st.root.nextElementSibling) return;   // nad oknem je jiný dialog
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (st.editCol !== null) { st.cancelCol = st.editCol; st.editCol = null; renderTable(); return; }
      close();
    }
  }

  const ds = () => (st.id ? D.get(st.id) : null);

  function renderTabs() {
    const box = $('.dv-tabs', st.root);
    box.innerHTML = D.list().map((d) => {
      const n = D.vars(d.id).length;
      return '<button class="dv-tab' + (d.id === st.id ? ' active' : '') + '" data-tab="' + esc(d.id) + '" title="' + esc(d.fileName) + '">' +
        '<span class="t">' + esc(d.name) + '</span>' + (n ? '<span class="dv-tab-n" title="Pojmenované sloupce">' + n + '</span>' : '') + '</button>';
    }).join('') + '<button class="dv-tab-add" data-act="import" title="Importovat textový soubor (.txt, .csv, .dat)">+ Importovat .txt</button>';
  }

  function renderPane() {
    const body = $('.dv-body', st.root);
    const d = ds();
    if (!d) {
      body.innerHTML = '<div class="dv-empty"><div class="dv-empty-ic">📊</div><p><b>Zatím žádná data.</b></p>' +
        '<p>Importuj textový soubor s měřením (sloupce čísel oddělené mezerou, tabulátorem, středníkem…). Sloupce pak pojmenuješ a v kódu jsou to obyčejné vektory.</p>' +
        '<button class="btn primary" data-act="import">Vybrat soubor .txt</button><p class="muted">nebo soubor přetáhni do tohoto okna</p></div>';
      $('.dv-foot', st.root).innerHTML = '';
      return;
    }
    const o = d.opts;
    body.innerHTML = '<div class="dv-pane"><aside class="dv-opts">' +
      '<div class="dv-sec"><h4>Dataset</h4>' +
        '<label class="dv-field"><span>Název</span><input type="text" data-o="name" spellcheck="false"></label>' +
        '<div class="dv-file" title="Původní soubor – v kódu: load(&quot;' + esc(d.fileName) + '&quot;)">' + esc(d.fileName) + ' · ' + fmtSize(d.size) + '</div></div>' +
      '<div class="dv-sec"><h4>Import</h4>' +
        '<label class="dv-field"><span>Oddělovač</span><input type="text" data-o="sep" class="mono" spellcheck="false" title="Libovolný text: mezera, ; , --- … Tabulátor = \\t"></label>' +
        '<div class="dv-chips"><button data-sep=" ">mezera</button><button data-sep="\\t">tabulátor</button><button data-sep=";">;</button><button data-sep=",">,</button></div>' +
        '<div class="dv-seplabel"></div>' +
        '<label class="dv-check"><input type="checkbox" data-o="merge"> Sloučit opakované oddělovače</label>' +
        '<div class="dv-field"><span>Desetinný</span><div class="dv-seg"><button data-dec=".">tečka 1.5</button><button data-dec=",">čárka 1,5</button></div></div>' +
        '<label class="dv-field"><span>Přeskočit</span><span class="dv-skip"><input type="number" min="0" step="1" data-o="skip"> řádků</span></label>' +
        '<label class="dv-check"><input type="checkbox" data-o="header"> <span class="dv-hdr-label"></span></label>' +
        '<button class="btn dv-transpose" data-act="transpose" title="Pro data uložená po řádcích – řádky souboru se stanou sloupci">⇄ Transponovat</button>' +
      '</div>' +
      '<div class="dv-sec"><h4>Proměnné <span class="dv-cnt"></span></h4><ul class="dv-vars"></ul><div class="dv-var-btns"></div></div>' +
      '<div class="dv-sec dv-danger"><button class="link-btn" data-act="del-ds">Smazat dataset</button></div>' +
      '</aside><section class="dv-main"><div class="dv-info"></div><div class="dv-warn"></div><div class="dv-table-wrap"></div></section></div>';
    $('[data-o="name"]', body).value = d.name;
    $('[data-o="sep"]', body).value = o.sep === '\t' ? '\\t' : o.sep;
    renderOpts();
    renderMain();
  }

  function renderOpts() {
    const d = ds();
    const b = st.root;
    const o = d.opts;
    $('.dv-seplabel', b).textContent = '= ' + D.sepLabel(o.sep);
    const sep = D.sepOf(o.sep);
    b.querySelectorAll('[data-sep]').forEach((x) => x.classList.toggle('on', D.sepOf(x.dataset.sep) === sep));
    $('[data-o="merge"]', b).checked = !!o.merge;
    b.querySelectorAll('[data-dec]').forEach((x) => x.classList.toggle('on', x.dataset.dec === (o.dec === ',' ? ',' : '.')));
    $('[data-o="skip"]', b).value = o.skip || 0;
    $('[data-o="header"]', b).checked = !!o.header;
    $('.dv-hdr-label', b).textContent = o.transpose ? 'První sloupec jsou názvy (hlavička)' : 'První řádek je hlavička';
    $('.dv-transpose', b).classList.toggle('on', !!o.transpose);
  }

  const fmtSize = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' kB' : (n / 1048576).toFixed(1).replace('.', ',') + ' MB');
  const fmtNum = (v) => (v !== v ? 'NaN' : !Number.isFinite(v) ? (v > 0 ? 'Inf' : '-Inf') : String(+v.toPrecision(10)));
  const plural = (n, a, b, c) => fmtInt(n) + ' ' + (n === 1 ? a : n >= 2 && n <= 4 ? b : c);

  function renderMain() {
    const d = ds();
    const res = D.parsedOf(d.id);
    const b = st.root;
    let info = '<b>' + plural(res.nRows, 'řádek', 'řádky', 'řádků') + '</b> × <b>' + plural(res.nCols, 'sloupec', 'sloupce', 'sloupců') + '</b> · ' + fmtInt(res.total) + ' hodnot';
    if (res.nRows > D.PREVIEW_ROWS || res.nCols > D.PREVIEW_COLS) {
      info += ' · <span class="muted">náhled: prvních ' + Math.min(res.nRows, D.PREVIEW_ROWS) + ' řádků' + (res.nCols > D.PREVIEW_COLS ? ' a ' + D.PREVIEW_COLS + ' sloupců' : '') + '</span>';
    }
    if (res.nanTotal) info += ' · <span class="dv-nan-info" title="Nečíselné nebo prázdné hodnoty – řádek zůstává, hodnota je NaN">' + plural(res.nanTotal, 'hodnota není číslo', 'hodnoty nejsou čísla', 'hodnot není číslo') + ' → NaN</span>';
    if (res.emptyLines) info += ' · <span class="muted">' + plural(res.emptyLines, 'prázdný řádek přeskočen', 'prázdné řádky přeskočeny', 'prázdných řádků přeskočeno') + '</span>';
    $('.dv-info', b).innerHTML = info;
    const warns = res.warnings.slice();
    const missing = D.vars(d.id).filter((v) => v.missing);
    if (missing.length) warns.push('Sloupec pro ' + missing.map((v) => v.name).join(', ') + ' v souboru při těchto volbách není – proměnná drží poslední hodnoty.');
    $('.dv-warn', b).innerHTML = warns.map((w) => '<div class="' + (/^Velký/.test(w) ? 'big' : '') + '">⚠ ' + esc(w) + '</div>').join('');
    renderTable();
    renderVars();
    const sz = res.nRows + '×' + res.nCols;
    $('.dv-foot', b).innerHTML = 'V kódu: pojmenované sloupce jako vektory · <code>M = load("' + esc(d.fileName) + '")</code> vrátí celou matici ' + esc(sz);
  }

  function colVar(dsId, col) { return D.vars(dsId).find((v) => v.col === col) || null; }

  function renderTable() {
    const d = ds();
    if (!d) return;
    const res = D.parsedOf(d.id);
    const wrap = $('.dv-table-wrap', st.root);
    if (!res.nCols) { wrap.innerHTML = '<p class="dv-none">Žádné sloupce k zobrazení.</p>'; return; }
    const nc = Math.min(res.nCols, D.PREVIEW_COLS);
    let h = '<table class="dv-table"><thead><tr><th class="ix">#</th>';
    for (let c = 0; c < nc; c++) {
      const v = colVar(d.id, c);
      const orig = res.names && res.names[c] ? res.names[c] : '';
      let name;
      if (st.editCol === c) {
        name = '<input class="dv-name-in" spellcheck="false" autocomplete="off" value="' + esc(v ? v.name : D.toIdent(orig, 'sloupec' + (c + 1))) + '">';
      } else if (v) {
        name = '<span class="dv-var">📊 ' + esc(v.name) + '<span class="dv-unset" data-unset="' + c + '" title="Zrušit proměnnou (data v souboru zůstanou)">×</span></span>';
      } else name = '<span class="dv-var empty">+ pojmenovat</span>';
      h += '<th data-col="' + c + '" class="' + (v ? 'named' : '') + (st.editCol === c ? ' editing' : '') + '" title="' + (v ? 'Kliknutím přejmenuješ' : 'Kliknutím pojmenuješ – celý sloupec se stane vektorem') + '">' +
        '<div class="dv-cn">' + (c + 1) + (res.nan[c] ? '<span class="dv-nanc" title="' + res.nan[c] + ' hodnot NaN">NaN ' + fmtInt(res.nan[c]) + '</span>' : '') + '</div>' +
        name + (orig ? '<div class="dv-orig">' + esc(orig) + '</div>' : '') + '</th>';
    }
    h += '</tr></thead><tbody>';
    res.preview.forEach((row, r) => {
      h += '<tr><td class="ix">' + (r + 1) + '</td>';
      row.forEach((cell) => {
        if (cell.v === cell.v) h += '<td>' + esc(fmtNum(cell.v)) + '</td>';
        else if (cell.raw !== undefined && cell.raw.trim()) h += '<td class="nan" title="„' + esc(cell.raw.trim()) + '“ není číslo → NaN">' + esc(cell.raw.trim()) + '</td>';
        else h += '<td class="nan empty" title="prázdné → NaN">NaN</td>';
      });
      h += '</tr>';
    });
    h += '</tbody></table>';
    if (res.nRows > D.PREVIEW_ROWS) h += '<p class="dv-more">… a dalších ' + fmtInt(res.nRows - D.PREVIEW_ROWS) + ' řádků (náhled je zkrácený, proměnné obsahují všechny hodnoty)</p>';
    const scrollL = wrap.scrollLeft;
    const scrollT = wrap.scrollTop;
    wrap.innerHTML = h;
    wrap.scrollLeft = scrollL;
    wrap.scrollTop = scrollT;
    const inp = $('.dv-name-in', wrap);
    if (inp) {
      inp.focus();
      inp.select();
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commitName(st.editCol, inp.value.trim()); }
        else if (e.key === 'Tab') { e.preventDefault(); commitName(st.editCol, inp.value.trim(), e.shiftKey ? -1 : 1); }
      });
      const editing = st.editCol;
      inp.addEventListener('blur', () => {
        // klik jinam: platný nový název uložit, jinak jen zavřít
        setTimeout(() => {
          if (!st.root || document.activeElement === inp) return;
          if (st.cancelCol === editing) { st.cancelCol = null; return; }   // Esc = zrušit
          if (st.root.nextElementSibling) return;   // otevřel se dialog (potvrzení přepsání)
          const v = colVar(st.id, editing);
          const val = inp.value.trim();
          if (val && (!v || v.name !== val) && !D.checkName(val) && !D.has(val)) commitName(editing, val);
          else if (st.editCol === editing) { st.editCol = null; renderTable(); }
        }, 120);
      });
    }
  }

  function renderVars() {
    const d = ds();
    const b = st.root;
    const vs = D.vars(d.id);
    const res = D.parsedOf(d.id);
    $('.dv-cnt', b).textContent = vs.length ? '· ' + vs.length : '';
    $('.dv-vars', b).innerHTML = vs.length ? vs.map((v) => '<li data-var="' + esc(v.name) + '"><span class="nm">📊 ' + esc(v.name) + '</span>' +
      '<span class="dv-vmeta">sl. ' + (v.col + 1) + ' · ' + fmtInt(v.values.length) + '</span>' +
      '<button data-act="ren-var" title="Přejmenovat">✎</button><button data-act="del-var" title="Smazat proměnnou">×</button></li>').join('')
      : '<li class="dv-tip">Klikni na záhlaví sloupce v náhledu a napiš název. Celý sloupec se stane vektorem.</li>';
    const unnamed = res.names ? res.names.slice(0, res.nCols).filter((n, c) => n && !colVar(d.id, c)).length : 0;
    $('.dv-var-btns', b).innerHTML = unnamed ? '<button class="btn" data-act="name-all" title="Názvy z hlavičky převedené na platné identifikátory">Pojmenovat podle hlavičky (' + unnamed + ')</button>' : '';
    renderTabs();
  }

  /* ---------- pojmenování sloupců ---------- */
  async function commitName(col, name, move) {
    const d = ds();
    if (!d || col === null) return;
    const cur = colVar(d.id, col);
    const next = () => {
      if (!st.root) return;
      if (st.editCol === col) {
        const res = D.parsedOf(d.id);
        const n = col + (move || 0);
        st.editCol = move && n >= 0 && n < Math.min(res.nCols, D.PREVIEW_COLS) ? n : null;
      }
      renderTable();
    };
    if (!name || (cur && cur.name === name)) { next(); return; }
    const err = D.checkName(name);
    if (err) { host.toast(err, true); return; }
    const other = D.getVar(name);
    if (other && !(other.datasetId === d.id && other.col === col)) {
      const od = D.get(other.datasetId);
      const ok = await host.confirmBox('Proměnná už existuje', 'Datová proměnná „' + name + '“ už je (' + (od ? 'dataset „' + od.name + '“, ' : '') + 'sloupec ' + (other.col + 1) + '). Přepsat ji tímto sloupcem?', 'Přepsat');
      if (!ok) { const i = $('.dv-name-in', st.root); if (i) i.focus(); return; }
    }
    try {
      await D.setVar(name, d.id, col);
    } catch (e) { host.toast('Uložení se nepovedlo: ' + e.message, true); return; }
    host.onChange();
    renderVars();
    next();
  }

  async function nameAll() {
    const d = ds();
    const res = D.parsedOf(d.id);
    if (!res.names) return;
    let n = 0;
    for (let c = 0; c < res.nCols; c++) {
      if (!res.names[c] || colVar(d.id, c)) continue;
      let base = D.toIdent(res.names[c], 'sloupec' + (c + 1));
      if (D.checkName(base)) base = 'sloupec' + (c + 1);
      let name = base;
      let k = 2;
      while (D.has(name)) name = base + '_' + k++;
      await D.setVar(name, d.id, c);
      n++;
    }
    if (n) { host.onChange(); host.toast('Pojmenováno ' + plural(n, 'sloupec', 'sloupce', 'sloupců')); }
    renderMain();
  }

  async function renameVar(oldName) {
    const name = await host.promptText('Přejmenovat datovou proměnnou', 'Nový název (v kódu ho uprav sám):', oldName);
    if (!name || name.trim() === oldName) return;
    const nn = name.trim();
    const err = D.checkName(nn);
    if (err) { host.toast(err, true); return; }
    if (D.has(nn)) { host.toast('Datová proměnná „' + nn + '“ už existuje', true); return; }
    await D.renameVar(oldName, nn);
    host.onChange();
    if (st.root) renderMain();
  }

  /* ---------- události ---------- */
  function apply(patch) {
    const d = ds();
    if (!d) return;
    D.updateDataset(d.id, { opts: patch }).then(() => { if (D.vars(d.id).length) host.onChange(); })
      .catch((e) => host.toast('Uložení se nepovedlo: ' + e.message, true));
    st.editCol = null;
    renderOpts();
    renderMain();
  }

  const isWs = (s) => /^[ \t]+$/.test(D.sepOf(s));
  function setSep(sep, fromInput) {
    const d = ds();
    const patch = { sep };
    // u mezery (a tabulátoru) je sloučení opakovaných oddělovačů výchozí
    if (isWs(sep) !== isWs(d.opts.sep)) patch.merge = isWs(sep);
    if (!fromInput) $('[data-o="sep"]', st.root).value = sep;
    apply(patch);
  }

  function onClick(e) {
    const t = e.target;
    if (t.closest('.modal-x') || t.closest('[data-act="close"]')) { close(); return; }
    const tab = t.closest('[data-tab]');
    if (tab) { st.id = tab.dataset.tab; st.editCol = null; renderTabs(); renderPane(); return; }
    const un = t.closest('[data-unset]');
    if (un) {
      const v = colVar(st.id, +un.dataset.unset);
      if (v) D.deleteVar(v.name).then(() => { host.onChange(); renderVars(); renderTable(); });
      return;
    }
    const th = t.closest('th[data-col]');
    if (th && !t.closest('input')) {
      const c = +th.dataset.col;
      if (st.editCol !== c) { st.editCol = c; renderTable(); }
      return;
    }
    const sb = t.closest('[data-sep]');
    if (sb) { setSep(sb.dataset.sep); return; }
    const db = t.closest('[data-dec]');
    if (db) { apply({ dec: db.dataset.dec }); return; }
    const a = t.closest('[data-act]');
    if (!a) return;
    const act = a.dataset.act;
    const li = a.closest('[data-var]');
    if (act === 'import') pickFiles();
    else if (act === 'transpose') apply({ transpose: !ds().opts.transpose });
    else if (act === 'name-all') nameAll();
    else if (act === 'ren-var' && li) renameVar(li.dataset.var);
    else if (act === 'del-var' && li) D.deleteVar(li.dataset.var).then(() => { host.onChange(); renderVars(); renderTable(); });
    else if (act === 'del-ds') deleteDs();
  }

  async function deleteDs() {
    const d = ds();
    const vs = D.vars(d.id);
    const ok = await host.confirmBox('Smazat dataset', 'Smazat dataset „' + d.name + '“' + (vs.length ? ' i s proměnnými ' + vs.map((v) => v.name).join(', ') : '') + '? Tohle nejde vrátit (soubor můžeš importovat znovu).', 'Smazat');
    if (!ok) return;
    await D.deleteDataset(d.id);
    if (vs.length) host.onChange();
    st.id = null;
    open(null);
  }

  function onInput(e) {
    const k = e.target.dataset.o;
    if (k === 'sep') {
      clearTimeout(st.timer);
      const v = e.target.value;
      st.timer = setTimeout(() => setSep(v, true), 250);
    } else if (k === 'skip') {
      clearTimeout(st.timer);
      const v = Math.max(0, Math.floor(Number(e.target.value) || 0));
      st.timer = setTimeout(() => apply({ skip: v }), 250);
    }
  }

  function onChange(e) {
    const k = e.target.dataset.o;
    const d = ds();
    if (!k || !d) return;
    if (k === 'name') {
      const name = e.target.value.trim();
      if (!name) { e.target.value = d.name; return; }
      D.updateDataset(d.id, { name }).then(renderTabs);
    } else if (k === 'merge' || k === 'header') apply({ [k]: e.target.checked });
  }

  MC.dataView = { init, open, close, isOpen, pickFiles, importFiles, renameVar };
})();
