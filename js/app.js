/* =====================================================================
   MatCalc – uživatelské rozhraní
   ---------------------------------------------------------------------
   Skripty, editor (sekce %%), Command Window, Workspace, kontextové
   menu, grafy, ukládání do prohlížeče (localStorage), import/export.
   Grafy jsou jen v kódu skriptu – klikání zapisuje řádky do bloku
   „%% Grafy“ (plotcode.js) a skript se hned znovu spustí.
   Datové proměnné (data.js, okno DATA v dataview.js) se před každým
   během vloží do workspace; kód je může jen dočasně zastínit.
   ===================================================================== */
(function () {
  'use strict';

  const MC = window.MC;
  const E = MC.engine;
  const P = MC.plot;
  const G = MC.graphics;
  const PC = MC.plotcode;
  const DATA = MC.data;

  /* ---------- pomocníci ---------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const uid = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  const slug = (name) => (String(name || 'skript').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'skript').replace(/^(\d)/, 's_$1');

  /* ---------- ikony (jednoduché SVG) ---------- */
  const ICONS = {
    run: '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none"/>',
    runsec: '<path d="M4 5h16M4 19h16" /><path d="M8.5 8.5v7l6-3.5z" fill="currentColor" stroke="none"/>',
    runsel: '<path d="M4 6h7M4 10h5M4 14h7M4 18h5" /><path d="M13.5 8.5v9l7-4.5z" fill="currentColor" stroke="none"/>',
    newfile: '<path d="M13 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V9z"/><path d="M13 3v6h6M12 12v6M9 15h6"/>',
    open: '<path d="M3.5 7.5V18a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5V9A1.5 1.5 0 0 0 19 7.5h-7l-2-2.5H5A1.5 1.5 0 0 0 3.5 6.5z"/>',
    download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
    eraser: '<path d="m16.5 4.5 4 4L10 19H5.5l-2-2a1.5 1.5 0 0 1 0-2.1z"/><path d="m9.5 10 5 5M10 19h10"/>',
    chart: '<path d="M4 4v16h16"/><path d="m7 15 4-5 3.5 3L20 6.5"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2.1-2.4 3.6M12 17h.01"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="1.5"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
    table: '<rect x="4" y="5" width="16" height="14" rx="1.5"/><path d="M4 10h16M4 14.5h16M10 5v14"/>',
    import: '<path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3.5V8h4.5M8.5 12.5h7M8.5 15.5h7M12 10v8"/>',
    database: '<ellipse cx="12" cy="6" rx="7" ry="2.5"/><path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5"/>',
    moon: '<path d="M19.5 14.2A7.8 7.8 0 0 1 9.8 4.5a7.8 7.8 0 1 0 9.7 9.7z"/>',
  };
  const icon = (name) => '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  $$('[data-icon]').forEach((b) => { b.insertAdjacentHTML('afterbegin', icon(b.dataset.icon)); });

  /* =====================================================================
     Stav a ukládání
     ===================================================================== */
  const STORE_KEY = 'matcalc:v1';
  const DEFAULT_UI = {
    sidebarW: 190, leftFrac: 0.43, editorFrac: 0.6, wsFrac: 0.36, format: 'short', auto: false,
    exportW: 900, exportH: 560, exportScale: 2,
    livePreview: true,     // menu grafu: změny se hned ukážou v grafu
  };

  const S = {
    data: null,
    scope: {},
    meta: { funcs: {} },
    gfx: G.newState(),     // grafy z posledního běhu (figure, plot, …)
    runId: 0,              // číslo posledního celého běhu
    ranCode: null,         // kód, ze kterého vznikly grafy (kvůli úpravám z panelu)
    pendingX: {},          // osa X zvolená klikem do grafu, který ještě nemá křivku (jen v paměti)
    docs: {},              // CodeMirror dokumenty (každý skript má vlastní historii zpět/vpřed)
    sel: new Set(),
    anchor: null,
    wsSort: 'order',
    hist: [],
    histPos: 0,
    errLine: null,
    cm: null,
    applying: false,       // kód právě mění klikání (ne psaní)
    dataInj: new Map(),    // datové proměnné vložené do S.scope (název -> objekt), podle nich se pozná zastínění
    dataTouched: new Set(), // datové proměnné, do kterých kód přiřadil (zastíněné)
  };

  function makeScript(name, code, activeFigNum) {
    return { id: uid(), name, code: code || '', activeFigNum: activeFigNum || 1, modified: Date.now() };
  }

  // Starší verze ukládaly grafy jako skrytý JSON – převede je na kód v bloku %% Grafy
  function migrateFigures(code, figures) {
    if (!Array.isArray(figures) || !figures.some((f) => f && Array.isArray(f.series) && f.series.length)) return code;
    const scope = {};
    try { E.run(code, scope, { gfx: G.newState() }); } catch (e) { /* jednotky popisků nejsou nutné */ }
    return PC.migrate(code, figures, scope);
  }

  function loadData() {
    let d = null;
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) d = JSON.parse(raw);
    } catch (e) { d = null; }
    if (!d || !Array.isArray(d.scripts) || !d.scripts.length) {
      d = { version: 2, scripts: MC.examples.map((ex) => makeScript(ex.name, ex.code)), activeId: null, ui: {} };
    }
    d.ui = Object.assign({}, DEFAULT_UI, d.ui || {});
    d.scripts = d.scripts.filter((s) => s && typeof s.code === 'string').map((s) => ({
      id: s.id || uid(),
      name: s.name || 'Skript',
      code: s.figures ? migrateFigures(s.code, s.figures) : s.code,
      activeFigNum: s.activeFigNum || 1,
      modified: s.modified || Date.now(),
    }));
    d.version = 2;
    if (!d.scripts.length) d.scripts = [makeScript('Skript 1', MC.newScriptTemplate)];
    if (!d.scripts.some((s) => s.id === d.activeId)) d.activeId = d.scripts[0].id;
    return d;
  }

  let saveTimer = null;
  function save(now) {
    clearTimeout(saveTimer);
    const write = () => {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(S.data));
        setSaveState('Uloženo v prohlížeči');
      } catch (e) {
        setSaveState('Nelze uložit (prohlížeč blokuje úložiště) – použij Uložit .m');
      }
    };
    if (now) write();
    else { setSaveState('Ukládám…'); saveTimer = setTimeout(write, 350); }
  }
  const setSaveState = (t) => { $('#stSave').textContent = t; };

  const cur = () => S.data.scripts.find((s) => s.id === S.data.activeId);
  // aktivní graf (podle čísla Figure)
  // co se právě zobrazuje: neuložený návrh z panelu, nebo poslední běh
  const view = () => (S.draft ? { code: S.draft.code, gfx: S.draft.gfx } : { code: S.ranCode, gfx: S.gfx });
  const activeFig = () => view().gfx.figs.find((f) => f.num === cur().activeFigNum) || null;

  /* ---------- datové proměnné ve workspace ---------- */
  // nový workspace s datovými proměnnými (čerstvé kopie – kód uložená data nezmění)
  function freshScope() {
    const sc = {};
    S.dataInj = DATA.inject(sc);
    S.dataTouched = new Set();
    return sc;
  }
  // volby běhu: zastínění datových proměnných a návrat po clear
  function dataOpts(scope) {
    return {
      names: DATA.names(),
      restore: (sc) => {
        const m = DATA.inject(sc, true);
        if (sc === scope && scope === S.scope) m.forEach((v, k) => { S.dataInj.set(k, v); S.dataTouched.delete(k); });
      },
    };
  }
  const isDataVar = (n) => DATA.has(n) && has(S.scope, n) && S.dataInj.get(n) === S.scope[n] && !S.dataTouched.has(n);
  const isShadowed = (n) => DATA.has(n) && has(S.scope, n) && !isDataVar(n);
  // popis proměnné; u nezměněných datových proměnných z mezipaměti (velké vektory)
  const descCache = new WeakMap();
  function descOf(n) {
    const v = S.scope[n];
    if (isDataVar(n) && v && typeof v === 'object') {
      let d = descCache.get(v);
      if (!d) { d = E.describe(v); descCache.set(v, d); }
      return d;
    }
    return E.describe(v, S.meta.funcs[n]);
  }
  const varLabel = (n) => (DATA.has(n) ? '📊 ' : '') + n;
  function noteShadows(res) {
    res.outputs.forEach((o) => { if (o.type === 'shadow') S.dataTouched.add(o.name); });
  }

  /* =====================================================================
     Toast, modální okna, kontextové menu
     ===================================================================== */
  function toast(text, isErr) {
    $$('.toast').forEach((x) => x.remove());
    const t = el('div', 'toast' + (isErr ? ' err' : ''));
    t.textContent = text;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), isErr ? 4200 : 2400);
  }

  function modal(opts) {
    return new Promise((resolve) => {
      const wrap = el('div', 'modal-wrap');
      wrap.innerHTML = '<div class="modal' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' +
        '<div class="modal-head"><h3></h3><button class="modal-x" aria-label="Zavřít">×</button></div>' +
        '<div class="modal-body"></div><div class="modal-foot"></div></div>';
      $('h3', wrap).textContent = opts.title || '';
      const body = $('.modal-body', wrap);
      if (typeof opts.body === 'string') body.innerHTML = opts.body; else if (opts.body) body.appendChild(opts.body);
      const foot = $('.modal-foot', wrap);
      let primaryBtn = null;
      const close = (val) => { wrap.remove(); document.removeEventListener('keydown', onKey, true); resolve(val); };
      (opts.buttons || [{ label: 'Zavřít', primary: true, value: true }]).forEach((b) => {
        const btn = el('button', 'btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : '') + (b.left ? ' left' : ''));
        btn.textContent = b.label;
        btn.addEventListener('click', () => {
          const v = b.value === 'input' ? ($('input', body) || {}).value : b.value;
          if (b.action) b.action(wrap);
          if (!b.keepOpen) close(v);
        });
        if (b.primary) primaryBtn = btn;
        foot.appendChild(btn);
      });
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); }
        if (e.key === 'Enter' && e.target.tagName === 'INPUT' && primaryBtn) { e.preventDefault(); primaryBtn.click(); }
      };
      document.addEventListener('keydown', onKey, true);
      $('.modal-x', wrap).addEventListener('click', () => close(null));
      wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(null); });
      $('#modalRoot').appendChild(wrap);
      const inp = $('input', body);
      if (inp) { inp.focus(); inp.select(); } else if (primaryBtn) primaryBtn.focus();
    });
  }

  function promptText(title, label, value) {
    const body = el('div');
    body.innerHTML = '<p>' + esc(label) + '</p><input type="text">';
    $('input', body).value = value || '';
    return modal({ title, body, buttons: [{ label: 'Zrušit', value: null }, { label: 'OK', primary: true, value: 'input' }] });
  }
  function confirmBox(title, text, okLabel) {
    return modal({ title, body: '<p>' + esc(text) + '</p>', buttons: [{ label: 'Zrušit', value: false }, { label: okLabel || 'OK', primary: true, danger: true, value: true }] });
  }

  const ctx = $('#ctxMenu');
  function showMenu(x, y, title, items) {
    ctx.innerHTML = '';
    if (title) { const t = el('div', 'ctx-title'); t.textContent = title; ctx.appendChild(t); }
    items.forEach((it) => {
      if (it.sep) { ctx.appendChild(el('hr')); return; }
      if (it.note) { const n = el('div', 'ctx-note'); n.textContent = it.note; ctx.appendChild(n); return; }
      const b = el('button', it.danger ? 'danger' : '');
      b.setAttribute('role', 'menuitem');
      b.disabled = !!it.disabled;
      b.innerHTML = (it.badge !== undefined ? '<span class="badge ' + (it.badgeCls || '') + '">' + esc(it.badge) + '</span>' : '') +
        '<span>' + esc(it.label) + '</span>' + (it.key ? '<span class="k">' + esc(it.key) + '</span>' : '');
      if (it.title) b.title = it.title;
      b.addEventListener('click', () => { hideMenu(); it.action(); });
      ctx.appendChild(b);
    });
    ctx.hidden = false;
    const r = ctx.getBoundingClientRect();
    ctx.style.left = clamp(x, 4, window.innerWidth - r.width - 4) + 'px';
    ctx.style.top = (y + r.height > window.innerHeight - 4 ? Math.max(4, y - r.height) : y) + 'px';
  }
  function hideMenu() { ctx.hidden = true; }
  document.addEventListener('mousedown', (e) => { if (!ctx.hidden && !ctx.contains(e.target)) hideMenu(); }, true);
  window.addEventListener('blur', hideMenu);
  window.addEventListener('resize', hideMenu);
  document.addEventListener('keydown', (e) => {
    if (ctx.hidden) return;
    const btns = $$('button:not(:disabled)', ctx);
    const i = btns.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); (btns[i + 1] || btns[0]).focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); (btns[i - 1] || btns[btns.length - 1]).focus(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hideMenu(); }
  }, true);

  /* =====================================================================
     Rozložení (posuvné příčky mezi panely)
     ===================================================================== */
  function applyLayout() {
    const ui = S.data.ui;
    const m = $('#main').style;
    m.setProperty('--sidebar-w', ui.sidebarW + 'px');
    m.setProperty('--left-frac', ui.leftFrac);
    m.setProperty('--editor-frac', ui.editorFrac);
    m.setProperty('--ws-frac', ui.wsFrac);
    // menu nastavení grafu je ve výchozím stavu skryté, otevře se tlačítkem Nastavení
    $('#figPanel').classList.toggle('settings-open', M.open);
    $('#btnFigSettings2').classList.toggle('on', M.open);
    $('#btnFigSettings').classList.toggle('on', M.open);
  }

  function initGutters() {
    $$('.gutter').forEach((g) => {
      g.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        g.setPointerCapture(e.pointerId);
        g.classList.add('drag');
        document.body.classList.add('resizing', g.classList.contains('gv') ? 'col' : 'row');
        const kind = g.dataset.gutter;
        const ui = S.data.ui;
        const move = (ev) => {
          if (kind === 'sidebar' || kind === 'left') {
            const r = $('#main').getBoundingClientRect();
            if (kind === 'sidebar') ui.sidebarW = Math.round(clamp(ev.clientX - r.left - 6, 130, 360));
            else ui.leftFrac = clamp((ev.clientX - r.left - 6 - ui.sidebarW - 5) / (r.width - 12 - ui.sidebarW - 10), 0.22, 0.75);
          } else {
            const col = kind === 'editor' ? $('#colLeft') : $('#colRight');
            const r = col.getBoundingClientRect();
            const f = clamp((ev.clientY - r.top) / r.height, 0.12, 0.85);
            if (kind === 'editor') ui.editorFrac = f; else ui.wsFrac = f;
          }
          applyLayout();
        };
        const up = () => {
          g.removeEventListener('pointermove', move);
          g.classList.remove('drag');
          document.body.classList.remove('resizing', 'col', 'row');
          save();
          S.cm.refresh();
        };
        g.addEventListener('pointermove', move);
        g.addEventListener('pointerup', up, { once: true });
        g.addEventListener('pointercancel', up, { once: true });
      });
    });
  }

  /* =====================================================================
     Editor
     ===================================================================== */
  const SECTION_RE = PC.SECTION_RE;

  // Řádek „%% Název“ je nadpis sekce (tučně). Uvnitř blokového komentáře %{ … %} ne.
  CodeMirror.defineMode('matcalc', (config) => {
    const base = CodeMirror.getMode(config, 'octave');
    return {
      startState: () => base.startState(),
      token(stream, state) {
        const inBlock = state.tokenize && state.tokenize.name === 'tokenComment';
        if (stream.sol() && !inBlock && stream.match(/^\s*%%(?=\s|$).*/)) return 'comment section-head';
        return base.token(stream, state);
      },
      lineComment: '%',
    };
  });

  function docFor(script) {
    if (!S.docs[script.id]) S.docs[script.id] = CodeMirror.Doc(script.code, 'matcalc');
    return S.docs[script.id];
  }

  let autoTimer = null;
  function initEditor() {
    const run = () => { if (!commitDraft()) runScript(); };
    const runSel = () => runSelection();
    const runSec = () => runSection();
    S.cm = CodeMirror($('#editorHost'), {
      value: '',
      mode: 'matcalc',
      theme: 'matlab',
      lineNumbers: true,
      matchBrackets: true,
      autoCloseBrackets: '()[]{}""\'\'',
      styleActiveLine: true,
      indentUnit: 4,
      tabSize: 4,
      indentWithTabs: false,
      extraKeys: {
        'Cmd-Enter': run, 'Ctrl-Enter': run, F5: run,
        F9: runSel, 'Shift-Cmd-Enter': runSel, 'Shift-Ctrl-Enter': runSel,
        'Alt-Enter': runSec, 'Ctrl-Alt-Enter': runSec, 'Cmd-Alt-Enter': runSec,
        'Cmd-/': 'toggleComment', 'Ctrl-/': 'toggleComment',
        'Ctrl-Space': (cm) => showHints(cm, true),
        Tab: (cm) => { if (snippetJump(cm, 1)) return; if (cm.somethingSelected()) cm.indentSelection('add'); else cm.replaceSelection('    ', 'end'); },
        'Shift-Tab': (cm) => { if (snippetJump(cm, -1)) return; cm.indentSelection('subtract'); },
        Esc: (cm) => { if (!clearSnippet(cm)) return CodeMirror.Pass; },
      },
    });
    S.cm.swapDoc(docFor(cur()));
    S.cm.on('changes', () => {
      // ruční úprava kódu při otevřeném menu grafu – návrh by se rozešel s kódem
      if (M.open && !S.applying) {
        const dirty = menuDirty();
        discardDraft();
        closeMenu();
        if (dirty) toast('Neuložené změny grafu jsem zahodil – kód se mezitím změnil', true);
      }
      const s = cur();
      s.code = S.cm.getValue();
      s.modified = Date.now();
      clearErrMark();
      decorateSections();
      save();
      if (S.data.ui.auto && !S.applying) {
        clearTimeout(autoTimer);
        autoTimer = setTimeout(() => runScript({ auto: true }), 650);
      }
    });
    S.cm.on('inputRead', (cm, ch) => autoHint(cm, ch));
    S.cm.on('cursorActivity', () => {
      checkSnippet(S.cm);
      const c = S.cm.getCursor();
      $('#stCursor').textContent = 'Ř ' + (c.line + 1) + ', Sl ' + (c.ch + 1);
      markCurrentSection();
    });
    new ResizeObserver(() => S.cm.refresh()).observe($('#editorHost'));
    decorateSections();
  }

  /* ---------- našeptávač ---------- */
  // [název, šablona (${…} = místo k vyplnění, Tab skočí na další), popis]
  const HINTS = [
    ['linspace', 'linspace(${od}, ${do}, ${n})', 'n bodů rovnoměrně od–do (včetně konců)'],
    ['logspace', 'logspace(${a}, ${b}, ${n})', 'n bodů od 10^a do 10^b'],
    ['zeros', 'zeros(${m}, ${n})', 'matice nul m×n'],
    ['ones', 'ones(${m}, ${n})', 'matice jedniček m×n'],
    ['eye', 'eye(${n})', 'jednotková matice n×n'],
    ['length', 'length(${v})', 'délka vektoru'],
    ['numel', 'numel(${v})', 'počet prvků'],
    ['size', 'size(${A})', 'rozměr'],
    ['sin', 'sin(${x})', 'sinus (radiány)'], ['cos', 'cos(${x})', 'kosinus (radiány)'], ['tan', 'tan(${x})', 'tangens (radiány)'],
    ['asin', 'asin(${x})', 'arkussinus'], ['acos', 'acos(${x})', 'arkuskosinus'], ['atan', 'atan(${x})', 'arkustangens'],
    ['atan2', 'atan2(${y}, ${x})', 'úhel bodu (y, x) v radiánech'],
    ['sind', 'sind(${x})', 'sinus ve stupních'], ['cosd', 'cosd(${x})', 'kosinus ve stupních'], ['tand', 'tand(${x})', 'tangens ve stupních'],
    ['asind', 'asind(${x})', 'arkussinus ve stupních'], ['acosd', 'acosd(${x})', 'arkuskosinus ve stupních'], ['atand', 'atand(${x})', 'arkustangens ve stupních'],
    ['sinh', 'sinh(${x})', 'hyperbolický sinus'], ['cosh', 'cosh(${x})', 'hyperbolický kosinus'], ['tanh', 'tanh(${x})', 'hyperbolický tangens'],
    ['exp', 'exp(${x})', 'e^x'], ['log', 'log(${x})', 'přirozený logaritmus'], ['log10', 'log10(${x})', 'dekadický logaritmus'], ['log2', 'log2(${x})', 'logaritmus o základu 2'],
    ['sqrt', 'sqrt(${x})', 'odmocnina'], ['abs', 'abs(${x})', 'absolutní hodnota / modul'], ['sign', 'sign(${x})', 'znaménko'],
    ['round', 'round(${x}, ${n})', 'zaokrouhlení na n desetinných míst'], ['floor', 'floor(${x})', 'zaokrouhlení dolů'], ['ceil', 'ceil(${x})', 'zaokrouhlení nahoru'], ['fix', 'fix(${x})', 'zaokrouhlení k nule'],
    ['mod', 'mod(${a}, ${b})', 'zbytek po dělení'], ['hypot', 'hypot(${a}, ${b})', 'sqrt(a² + b²)'], ['factorial', 'factorial(${n})', 'faktoriál'],
    ['sum', 'sum(${v})', 'součet'], ['prod', 'prod(${v})', 'součin'], ['cumsum', 'cumsum(${v})', 'průběžný součet'], ['diff', 'diff(${v})', 'rozdíly sousedních prvků'],
    ['mean', 'mean(${v})', 'průměr'], ['median', 'median(${v})', 'medián'], ['std', 'std(${v})', 'směrodatná odchylka'], ['variance', 'variance(${v})', 'rozptyl'],
    ['min', 'min(${v})', 'minimum'], ['max', 'max(${v})', 'maximum'], ['sort', 'sort(${v})', 'seřadit'], ['rms', 'rms(${v})', 'efektivní hodnota'],
    ['trapz', 'trapz(${x}, ${y})', 'integrál lichoběžníkovou metodou'],
    ['interp1', 'interp1(${x}, ${y}, ${xi})', 'lineární interpolace'],
    ['polyfit', 'polyfit(${x}, ${y}, ${n})', 'proložení polynomem n-tého stupně'],
    ['polyval', 'polyval(${p}, ${x})', 'hodnota polynomu'],
    ['dot', 'dot(${a}, ${b})', 'skalární součin'], ['cross', 'cross(${a}, ${b})', 'vektorový součin'],
    ['det', 'det(${A})', 'determinant'], ['inv', 'inv(${A})', 'inverzní matice'],
    ['real', 'real(${z})', 'reálná část'], ['imag', 'imag(${z})', 'imaginární část'], ['angle', 'angle(${z})', 'úhel komplexního čísla'], ['conj', 'conj(${z})', 'komplexně sdružené'],
    ['deg2rad', 'deg2rad(${x})', 'stupně → radiány'], ['rad2deg', 'rad2deg(${x})', 'radiány → stupně'],
    ['load', 'load("${soubor.txt}")', 'matice ze souboru nahraného v okně Data'],
    ['isnan', 'isnan(${x})', '1 tam, kde chybí hodnota (NaN)'], ['rmmissing', 'rmmissing(${v})', 'vektor bez hodnot NaN'],
    ['disp', 'disp(${x})', 'vypíše hodnotu'],
    ['fprintf', "fprintf('${text} %g\\n', ${x})", 'formátovaný výpis (%d %f %e %g %s)'],
    ['sprintf', "sprintf('${text} %g', ${x})", 'formátovaný text'],
    ['num2str', 'num2str(${x})', 'číslo na text'],
    ['format', 'format long', '15 platných číslic'], ['format', 'format short', '5 platných číslic'],
    ['clc', 'clc', 'vyčistit Command Window'], ['clear', 'clear', 'smazat všechny proměnné'],
    ['figure', 'figure', 'nový graf'],
    ['plot', 'plot(${x}, ${y})', 'křivka y(x)'],
    ['plot', "plot(${x}, ${y}, '${r--o}', 'LineWidth', ${1.5})", 'křivka se stylem a tloušťkou'],
    ['semilogx', 'semilogx(${x}, ${y})', 'logaritmická osa X'], ['semilogy', 'semilogy(${x}, ${y})', 'logaritmická osa Y'], ['loglog', 'loglog(${x}, ${y})', 'obě osy logaritmické'],
    ['hold', 'hold on', 'další plot přidá křivku'], ['hold', 'hold off', 'další plot nahradí graf'],
    ['title', "title('${text}')", 'titulek (TeX: ^{24}Na, P_z, \\sigma)'],
    ['xlabel', "xlabel('${text}')", 'popisek osy X'], ['ylabel', "ylabel('${text}')", 'popisek osy Y'],
    ['legend', "legend('${A}', '${B}')", 'legenda'], ['legend', "legend('Location', '${northwest}')", 'poloha legendy'], ['legend', 'legend show', 'legenda z DisplayName'],
    ['grid', 'grid on', 'mřížka'], ['grid', 'grid minor', 'jemná mřížka'], ['box', 'box off', 'bez rámečku'],
    ['xlim', 'xlim([${min} ${max}])', 'rozsah osy X'], ['ylim', 'ylim([${min} ${max}])', 'rozsah osy Y'],
    ['axis', 'axis tight', 'těsný rozsah os'], ['axis', 'axis([${xmin} ${xmax} ${ymin} ${ymax}])', 'rozsah obou os'],
    ['yyaxis', 'yyaxis right', 'vedlejší osa Y vpravo – další plot, ylabel, ylim patří jí'], ['yyaxis', 'yyaxis left', 'zpět na levou osu Y'],
    ['set', "set(gca, '${XScale}', '${log}')", 'vlastnost os'],
    ['close', 'close all', 'zavřít všechny grafy'], ['clf', 'clf', 'vyčistit graf'],
    ['pi', 'pi', '3.14159…'], ['Inf', 'Inf', 'nekonečno'], ['NaN', 'NaN', 'není číslo'],
  ];

  // názvy přiřazené v kódu (i před spuštěním)
  function codeNames(cm) {
    const out = new Set();
    const re = /^\s*([A-Za-z_]\w*)\s*(?:\([^)]*\))?\s*=(?!=)/;
    cm.eachLine((h) => { const m = h.text.match(re); if (m) out.add(m[1]); });
    return out;
  }

  function matHint(cm) {
    const c = cm.getCursor();
    const line = cm.getLine(c.line);
    let st = c.ch;
    while (st > 0 && /\w/.test(line[st - 1])) st--;
    const word = line.slice(st, c.ch);
    if (!word || /^\d/.test(word)) return null;
    const tok = cm.getTokenAt(c);
    if (/comment|string/.test(tok.type || '')) return null;
    if (st > 0 && line[st - 1] === '.') return null;
    const lw = word.toLowerCase();
    const list = [];
    const seen = new Set();
    // proměnné: workspace + přiřazení v kódu
    const vars = new Set(Object.keys(S.scope));
    codeNames(cm).forEach((n) => vars.add(n));
    [...vars].filter((n) => n.toLowerCase().startsWith(lw) && n !== word).sort((a, b) => a.length - b.length || a.localeCompare(b))
      .forEach((n) => {
        seen.add(n);
        let info = 'proměnná';
        if (has(S.scope, n)) { const d = descOf(n); info = (DATA.has(n) ? '📊 ' : '') + (d.kind === 'fn' ? 'funkce' : d.size + '  ' + d.preview); }
        list.push({ text: n, kind: 'var', sig: '', desc: info, tpl: n });
      });
    HINTS.filter((h) => h[0].toLowerCase().startsWith(lw) && h[1] !== word).forEach((h) => {
      const disp = h[1].replace(/\$\{([^}]*)\}/g, '$1');
      list.push({ text: disp, kind: 'fn', name: h[0], sig: disp.slice(h[0].length), desc: h[2], tpl: h[1] });
    });
    if (!list.length) return null;
    list.forEach((it) => {
      it.render = (elx) => {
        elx.innerHTML = '<span class="h-ic h-' + it.kind + '">' + (it.kind === 'var' ? 'x' : 'f') + '</span>' +
          '<span class="h-name">' + esc(it.kind === 'var' ? it.text : it.name) + '</span><span class="h-sig">' + esc(it.sig) + '</span>' +
          '<span class="h-desc">' + esc(it.desc) + '</span>';
      };
      it.hint = (cmx, data) => insertSnippet(cmx, data.from, data.to, it.tpl);
    });
    return { list: list.slice(0, 40), from: { line: c.line, ch: st }, to: { line: c.line, ch: c.ch } };
  }

  function showHints(cm, manual) {
    cm.showHint({ hint: matHint, completeSingle: false, closeCharacters: /[\s()[\]{};:>,=+\-*/^'"%]/, alignWithWord: true });
    if (manual && !cm.state.completionActive) toast('Žádný návrh');
  }
  function autoHint(cm, ch) {
    if (cm.state.completionActive) return;
    const c = cm.getCursor();
    const before = cm.getLine(c.line).slice(0, c.ch);
    const m = before.match(/[A-Za-z_]\w*$/);
    if (m && m[0].length >= 2 && /\w/.test(ch.text.join(''))) showHints(cm, false);
  }

  // šablona s místy k vyplnění: první se označí, Tab přeskočí na další
  let snip = null;
  function insertSnippet(cm, from, to, tpl) {
    let text = '';
    const ph = [];
    const re = /\$\{([^}]*)\}/g;
    let last = 0;
    let m;
    while ((m = re.exec(tpl))) {
      text += tpl.slice(last, m.index);
      ph.push([text.length, text.length + m[1].length]);
      text += m[1];
      last = m.index + m[0].length;
    }
    text += tpl.slice(last);
    clearSnippet(cm);
    cm.replaceRange(text, from, to, 'complete');
    const at = (o) => ({ line: from.line, ch: from.ch + o });
    if (!ph.length) { cm.setCursor(at(text.length)); return; }
    snip = {
      marks: ph.map(([a, b]) => cm.markText(at(a), at(b), { className: 'cm-ph', inclusiveLeft: true, inclusiveRight: true, clearWhenEmpty: false })),
      end: cm.setBookmark(at(text.length)),
      all: cm.markText(from, at(text.length), { inclusiveLeft: false, inclusiveRight: true }),
      i: 0,
    };
    const r = snip.marks[0].find();
    cm.setSelection(r.from, r.to);
  }
  function snippetJump(cm, dir) {
    if (!snip) return false;
    snip.i += dir;
    if (snip.i < 0) snip.i = 0;
    if (snip.i >= snip.marks.length) {
      const e = snip.end.find();
      clearSnippet(cm);
      if (e) cm.setCursor(e);
      return true;
    }
    const r = snip.marks[snip.i].find();
    if (!r) { clearSnippet(cm); return false; }
    cm.setSelection(r.from, r.to);
    return true;
  }
  function clearSnippet() {
    if (!snip) return false;
    snip.marks.forEach((mk) => mk.clear());
    snip.end.clear();
    snip.all.clear();
    snip = null;
    return true;
  }
  function checkSnippet(cm) {
    if (!snip) return;
    const r = snip.all.find();
    const c = cm.getCursor();
    if (!r || c.line !== r.from.line || c.ch < r.from.ch || c.ch > r.to.ch) clearSnippet(cm);
  }

  /* ---------- sekce %% ---------- */
  let secHeads = [];       // řádky s nadpisem sekce (handle)
  let secCur = [];         // řádky aktuální sekce (handle)
  function sectionRange(line) {
    const cm = S.cm;
    const n = cm.lineCount();
    let s = 0;
    for (let i = line; i >= 0; i--) if (SECTION_RE.test(cm.getLine(i))) { s = i; break; }
    let e = n - 1;
    for (let i = line + 1; i < n; i++) if (SECTION_RE.test(cm.getLine(i))) { e = i - 1; break; }
    return { s, e, title: SECTION_RE.test(cm.getLine(s)) ? cm.getLine(s).replace(/^\s*%%\s*/, '').trim() : '' };
  }
  function decorateSections() {
    const cm = S.cm;
    if (!cm) return;
    cm.operation(() => {
      secHeads.forEach((h) => cm.removeLineClass(h, 'wrap', 'cm-sec-head'));
      secHeads = [];
      cm.eachLine((h) => {
        if (SECTION_RE.test(h.text) && cm.getLineNumber(h) > 0) { cm.addLineClass(h, 'wrap', 'cm-sec-head'); secHeads.push(h); }
      });
    });
    markCurrentSection();
  }
  // podbarvení sekce s kurzorem (jako v MATLABu) – jen když skript sekce má
  function markCurrentSection() {
    const cm = S.cm;
    cm.operation(() => {
      secCur.forEach((h) => cm.removeLineClass(h, 'background', 'cm-sec-cur'));
      secCur = [];
      let any = false;
      cm.eachLine((h) => { if (!any && SECTION_RE.test(h.text)) any = true; });
      if (!any) return;
      const r = sectionRange(cm.getCursor().line);
      for (let i = r.s; i <= r.e; i++) { const h = cm.getLineHandle(i); cm.addLineClass(h, 'background', 'cm-sec-cur'); secCur.push(h); }
    });
  }

  function markErr(line) {
    clearErrMark();
    const ln = line - 1;
    if (ln < 0 || ln >= S.cm.lineCount()) return;
    S.errLine = S.cm.getLineHandle(ln);
    S.cm.addLineClass(S.errLine, 'background', 'cm-error-line');
    S.cm.addLineClass(S.errLine, 'gutter', 'cm-err-gutter');
    S.cm.scrollIntoView({ line: ln, ch: 0 }, 60);
  }
  function clearErrMark() {
    if (S.errLine) {
      S.cm.removeLineClass(S.errLine, 'background', 'cm-error-line');
      S.cm.removeLineClass(S.errLine, 'gutter', 'cm-err-gutter');
      S.errLine = null;
    }
  }
  function gotoLine(line) {
    const ln = clamp(line - 1, 0, S.cm.lineCount() - 1);
    if (!M.open) S.cm.focus();           // s otevřeným menu grafu jen posun (psaní nesmí jít do kódu)
    S.cm.setCursor({ line: ln, ch: S.cm.getLine(ln).length });
    S.cm.scrollIntoView({ line: ln, ch: 0 }, 60);
  }

  /* ---------- zápis do kódu z klikání ---------- */
  // Nahradí jen změněné řádky (jeden krok zpět ⌘Z) a krátce je zvýrazní.
  function applyLines(oldL, newL) {
    const doc = S.cm.getDoc();
    let p = 0;
    while (p < oldL.length && p < newL.length && oldL[p] === newL[p]) p++;
    let s = 0;
    while (s < oldL.length - p && s < newL.length - p && oldL[oldL.length - 1 - s] === newL[newL.length - 1 - s]) s++;
    const mid = newL.slice(p, newL.length - s);
    const oEnd = oldL.length - s;
    if (p === oldL.length && p === newL.length) return null;
    S.applying = true;
    try {
      if (s > 0) doc.replaceRange(mid.map((l) => l + '\n').join(''), { line: p, ch: 0 }, { line: oEnd, ch: 0 }, 'matcalc');
      else if (p < oldL.length) {
        const last = oldL.length - 1;
        if (mid.length) doc.replaceRange(mid.join('\n'), { line: p, ch: 0 }, { line: last, ch: oldL[last].length }, 'matcalc');
        else doc.replaceRange('', p > 0 ? { line: p - 1, ch: oldL[p - 1].length } : { line: 0, ch: 0 }, { line: last, ch: oldL[last].length }, 'matcalc');
      } else {
        const last = oldL.length - 1;
        doc.replaceRange('\n' + mid.join('\n'), { line: last, ch: oldL[last].length }, null, 'matcalc');
      }
    } finally { S.applying = false; }
    // zvýraznění změny
    const hs = [];
    for (let i = p; i < p + mid.length && i < S.cm.lineCount(); i++) { const h = S.cm.getLineHandle(i); S.cm.addLineClass(h, 'background', 'cm-flash'); hs.push(h); }
    setTimeout(() => hs.forEach((h) => S.cm.removeLineClass(h, 'background', 'cm-flash')), 1100);
    const at = Math.min(p, S.cm.lineCount() - 1);
    const vis = S.cm.getScrollInfo();
    const top = S.cm.heightAtLine(at, 'local');
    if (top < vis.top || top > vis.top + vis.clientHeight - 30) S.cm.scrollIntoView({ line: at, ch: 0 }, 60);
    return p + 1;
  }

  /* =====================================================================
     Menu nastavení grafu – návrh (draft) a jeho vykreslení
     ---------------------------------------------------------------------
     Při otevření menu se vezme kopie kódu grafu (M.base). Menu mění jen
     návrh M.code (kód s upravenými řádky v bloku %% Grafy). Graf se vždy
     vykreslí celý znovu z návrhu jedinou funkcí renderDraft() – při živém
     náhledu hned po každé změně, jinak po kliknutí na Překreslit.
     Textová pole se do návrhu promítnou až po Enteru / opuštění pole,
     neplatné hodnoty se do návrhu nedostanou (pole je červené).
     „Zrušit“ vrátí graf do stavu před otevřením, „Zapsat do kódu“ zapíše
     návrh do editoru (jeden krok zpět ⌘Z).
     ===================================================================== */
  const M = {
    open: false,
    figNum: null,       // graf, který menu upravuje
    base: null,         // { code, gfx } – stav při otevření (po zápisu do kódu nový)
    code: null,         // návrh kódu – jediný zdroj pravdy, dokud je menu otevřené
    run: null,          // { code, gfx, error } – výsledek běhu návrhu (pro panel)
    shown: null,        // kód, který je právě vykreslený v grafu (poslední platný návrh)
    raw: {},            // klíč pole -> rozepsaný neplatný text (zůstává v poli červeně)
    fieldBad: {},       // klíč pole -> důvod (neplatná hodnota v poli)
    state: {},          // klíč pole -> důvod (neplatná kombinace v návrhu, např. log osa a mez ≤ 0)
    view: null,         // výřez grafu (zoom) při otevření – Zrušit ho vrátí
    swallow: false,     // klik, který menu zavřel, nesmí nic dalšího udělat
    asking: false,      // je otevřený dotaz na neuložené změny
  };
  S.draft = null;       // { code, gfx, error } – vykreslený návrh; null = graf podle kódu

  const menuFig = () => (M.run ? M.run.gfx.figs.find((f) => f.num === M.figNum) || null : null);
  const baseFig = () => (M.base ? M.base.gfx.figs.find((f) => f.num === M.figNum) || null : null);
  const baseRun = () => ({ code: M.base.code, gfx: M.base.gfx, error: null });
  const menuDirty = () => M.open && (M.code !== M.base.code || Object.keys(M.raw).length > 0);
  const hasFieldErr = () => Object.keys(M.fieldBad).length > 0;
  const hasStateErr = () => Object.keys(M.state).length > 0;
  const isTextInput = (t) => t && t.tagName === 'INPUT' && (t.type === 'text' || t.type === 'number');

  // běh návrhu v čistém workspace (skutečný workspace se nemění)
  function runDraftCode(code) {
    const gfx = G.newState();
    E.setPrecision(S.data.ui.format);
    const sc = {};
    DATA.inject(sc);
    const res = E.run(code, sc, { meta: { funcs: {} }, gfx, data: dataOpts(sc) });
    gfx.figs.forEach((f) => { f.runId = S.runId; });
    return { code, gfx, error: res.error };
  }

  // Neplatný stav návrhu, který se nesmí vykreslit: logaritmická osa s mezí ≤ 0
  // (jen když se osa v menu měnila – ručně psaný kód se nehlídá) a nová chyba při běhu.
  function stateErrors() {
    const errs = {};
    const f = menuFig();
    const b = baseFig();
    if (f) {
      // key = pole v menu, P / PB = vlastnosti osy v návrhu / při otevření, a = 'x' | 'y'
      const chk = (key, P, PB, a) => {
        const scale = P[a + 'scale'];
        const lim = P[a + 'lim'];
        if (scale !== 'log' || !lim) return;
        if (PB && PB[a + 'scale'] === scale && String(PB[a + 'lim']) === String(lim)) return;
        [0, 1].forEach((i) => { if (Number.isFinite(lim[i]) && lim[i] <= 0) errs[key + ':' + i] = 'Na logaritmické ose musí být mez kladná (> 0)'; });
      };
      chk('xlim', f.ax, b && b.ax, 'x');
      chk('ylim', f.ax, b && b.ax, 'y');
      if (f.ax.right) chk('y2lim', f.ax.right, b && b.ax.right, 'y');
    }
    const er = M.run && M.run.error;
    const be = M.base && M.base.error;
    if (er && !(be && be.line === er.line && be.message === er.message)) errs['@run'] = 'Chyba na ř. ' + er.line + ': ' + er.message;
    return errs;
  }

  // Jediná funkce, která kreslí návrh do grafu – živý náhled i tlačítko Překreslit.
  function renderDraft() {
    if (!M.open) return;
    if (hasStateErr()) { renderBar(); return; }          // graf zůstane na poslední platné verzi
    S.draft = M.code === M.base.code ? null : { code: M.code, gfx: M.run.gfx, error: M.run.error };
    M.shown = M.code;
    markDiff();
    renderWorkspace();
    renderTabs();
    renderFigure();
    renderBar();
  }

  /**
   * Úprava návrhu z menu. mutate(lines, fig) mění pole řádků; fig je graf z návrhu.
   * Graf se překreslí (renderDraft) jen při živém náhledu.
   */
  function editDraft(mutate) {
    if (!M.open) return null;
    const fig = menuFig();
    const lines = String(M.code).split('\n');
    let res;
    try { res = mutate(lines, fig); } catch (e) { toast(e.message, true); renderMenu(); return null; }
    if (res && res.skipped) toast(plural(res.skipped, 'ručně psaný řádek zůstal', 'ručně psané řádky zůstaly', 'ručně psaných řádků zůstalo') + ' beze změny – uprav je v editoru');
    const code = lines.join('\n');
    if (code !== M.code) {
      // rozepsané hodnoty u křivek patří k číslům řádků – po přidání / smazání řádku neplatí
      if (code.split('\n').length !== M.code.split('\n').length) {
        Object.keys(M.raw).filter((k) => /^s\d+:/.test(k)).forEach((k) => { delete M.raw[k]; delete M.fieldBad[k]; });
      }
      M.code = code;
      M.run = code === M.base.code ? baseRun() : runDraftCode(code);
    }
    draftChanged();
    return res;
  }

  function draftChanged() {
    M.state = stateErrors();
    renderMenu();
    if (S.data.ui.livePreview) renderDraft(); else renderBar();
  }

  /**
   * Okamžitý zápis do kódu (menu Workspace, záložky grafů, Nový graf) – jeden krok zpět ⌘Z.
   * opts.figNum – graf, ke kterému se úprava vztahuje (výchozí aktivní)
   */
  function writeCode(mutate, opts) {
    opts = opts || {};
    if (S.cm.getValue() !== S.ranCode) runScript({ auto: true });   // grafy musí odpovídat kódu
    const fig = opts.figNum !== undefined ? S.gfx.figs.find((f) => f.num === opts.figNum) || null : activeFig();
    const lines = String(S.ranCode).split('\n');
    let res;
    try { res = mutate(lines, fig); } catch (e) { toast(e.message, true); return null; }
    if (res && res.skipped) toast(plural(res.skipped, 'ručně psaný řádek zůstal', 'ručně psané řádky zůstaly', 'ručně psaných řádků zůstalo') + ' beze změny – uprav je v editoru');
    const code = lines.join('\n');
    if (code === S.ranCode) { renderAll(); return res; }
    if (res && res.selectLine) S.selectLine = res.selectLine; else if (fig) cur().activeFigNum = fig.num;
    applyLines(S.cm.getValue().split('\n'), code.split('\n'));
    runScript({ auto: true, edit: true });
    return res;
  }

  /* ---------- otevření, uložení, zrušení, zavření ---------- */
  function openMenu() {
    if (M.open) return;
    hideMenu();
    if (S.cm.getValue() !== S.ranCode) runScript({ auto: true });   // návrh musí vycházet z aktuálního kódu
    M.open = true;
    M.figNum = cur().activeFigNum;
    M.base = { code: S.ranCode, gfx: S.gfx, error: S.lastError || null };
    M.code = M.base.code;
    M.run = baseRun();
    M.shown = M.code;
    M.raw = {};
    M.fieldBad = {};
    M.state = {};
    M.view = captureView();
    S.draft = null;
    S.cm.getInputField().blur();          // psaní nesmí jít do editoru, dokud je menu otevřené
    applyLayout();
    renderMenu();
    renderBar();
    focusMenu();
  }

  function focusMenu() {
    const box = $('#figSettings');
    if (box && M.open && !box.contains(document.activeElement)) box.focus({ preventScroll: true });
  }

  function closeMenu() {
    if (!M.open) return;
    const had = !!S.draft;
    M.open = false;
    S.draft = null;
    M.raw = {};
    M.fieldBad = {};
    M.state = {};
    clearDiff();
    applyLayout();
    if (had) { renderWorkspace(); renderTabs(); renderFigure(); }
  }

  // po spuštění skriptu (i po Zapsat do kódu) menu vychází z nového kódu
  function rebaseMenu() {
    if (!M.open) return;
    M.figNum = cur().activeFigNum;
    M.base = { code: S.ranCode, gfx: S.gfx, error: S.lastError || null };
    M.code = M.base.code;
    M.run = baseRun();
    M.shown = M.code;
    M.raw = {};
    M.fieldBad = {};
    M.state = {};
    M.view = null;
    S.draft = null;
    clearDiff();
    renderBar();
  }

  // Zapsat do kódu. Vrací true, když je návrh v kódu (nebo nebylo co zapsat).
  function saveMenu() {
    if (!M.open) return true;
    flushField();
    if (hasFieldErr() || hasStateErr()) {
      toast(M.state['@run'] ? 'Návrh hlásí chybu (' + M.state['@run'] + ') – do kódu ho nezapíšu' : 'Nejdřív oprav červeně označená pole – neplatné hodnoty se do kódu nezapíšou', true);
      const bad = $('#figSettings input.bad');
      if (bad) bad.focus();
      return false;
    }
    if (M.code === M.base.code) return true;
    const code = M.code;
    S.draft = null;
    clearDiff();
    applyLines(S.cm.getValue().split('\n'), code.split('\n'));
    runScript({ auto: true, edit: true });
    setStatus('Změny grafu zapsány do kódu', 'ok');
    return true;
  }

  // ⌘S, ⌘↵, Spustit…: zapíše neuložený návrh. Vrací true, když bylo co zapisovat.
  function commitDraft() {
    if (!M.open) return false;
    flushField();
    if (!menuDirty()) return false;
    saveMenu();
    return true;
  }

  // Zrušit: návrh = kód při otevření, graf přesně jako předtím (i se zoomem)
  function discardDraft() {
    if (!M.open) return;
    M.code = M.base.code;
    M.run = baseRun();
    M.raw = {};
    M.fieldBad = {};
    M.state = {};
    M.shown = M.code;
    S.draft = null;
    clearDiff();
    renderWorkspace();
    renderTabs();
    renderFigure();
    restoreView();
    renderMenu();
    renderBar();
  }

  // Zavření klikem mimo menu nebo Esc. S neuloženými změnami se zeptá.
  async function attemptClose() {
    if (!M.open || M.asking) return;
    flushField();
    if (!menuDirty()) { closeMenu(); return; }
    M.asking = true;
    const d = lineDiff(M.base.code.split('\n'), M.code.split('\n'));
    const n = d.mod.length + d.ins.reduce((a, x) => a + x.texts.length, 0) + d.del.length;
    const what = n ? plural(n, 'řádek', 'řádky', 'řádků') + ' v bloku <code>%% Grafy</code>' : 'rozepsané hodnoty v polích';
    const bad = hasFieldErr() || hasStateErr() ? '<p class="muted">Některá pole mají neplatnou hodnotu (červeně) – ta se nezapíšou, dokud je neopravíš.</p>' : '';
    const v = await modal({
      title: 'Neuložené změny grafu',
      body: '<p>V nastavení grafu jsou změny, které ještě nejsou v kódu (' + what + ').</p>' + bad,
      buttons: [
        { label: 'Pokračovat v úpravách', left: true, value: 'keep' },
        { label: 'Zahodit', value: 'discard' },
        { label: 'Uložit', primary: true, value: 'save' },
      ],
    });
    M.asking = false;
    if (v === 'save') { if (saveMenu()) closeMenu(); }
    else if (v === 'discard') { discardDraft(); closeMenu(); }
    else focusMenu();
  }

  /* ---------- výřez grafu (zoom) – Zrušit vrátí stav před otevřením menu ---------- */
  function captureView() {
    const div = $('#figPlot');
    const fl = div && div._fullLayout;
    if (!div.data || !fl) return null;
    const v = {};
    ['xaxis', 'yaxis', 'yaxis2'].forEach((k) => { if (fl[k] && Array.isArray(fl[k].range)) v[k] = fl[k].range.slice(); });
    return v;
  }
  function restoreView() {
    const div = $('#figPlot');
    const fl = div && div._fullLayout;
    if (!M.view || !div.data || !fl || !window.Plotly) return;
    const upd = {};
    Object.keys(M.view).forEach((k) => {
      const now = fl[k] && fl[k].range;
      const was = M.view[k];
      if (now && (Math.abs(now[0] - was[0]) > 1e-12 || Math.abs(now[1] - was[1]) > 1e-12)) { upd[k + '.range'] = was.slice(); upd[k + '.autorange'] = false; }
    });
    if (Object.keys(upd).length) window.Plotly.relayout(div, upd);
  }

  /* ---------- zavírání kliknutím mimo menu a klávesou Esc ---------- */
  function initMenuDismiss() {
    const panel = $('#figSettings');
    const inside = (t) => t instanceof Element && (panel.contains(t) || !!t.closest('#modalRoot, #ctxMenu, .CodeMirror-hints, .toast'));
    document.addEventListener('pointerdown', (e) => {
      M.swallow = false;
      if (!M.open || inside(e.target) || $('#modalRoot').children.length) return;
      // klik mimo menu jen zavírá – do grafu, editoru ani jinam nepropadne (zoom, výběr, kontextové menu…)
      M.swallow = true;
      e.stopPropagation();          // mousedown (a s ním fokus, výběr, zoom) zastaví „eat“ níže
      e.stopImmediatePropagation();
      attemptClose();
    }, true);
    const eat = (e) => {
      if (!M.swallow) return;
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };
    ['mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'auxclick', 'touchstart', 'touchend'].forEach((type) => {
      document.addEventListener(type, eat, { capture: true, passive: false });
    });
    // konec gesta (po click) – další kliky už normálně
    document.addEventListener('pointerup', () => { if (M.swallow) setTimeout(() => { M.swallow = false; }, 0); }, true);
    window.addEventListener('blur', () => { M.swallow = false; });
    document.addEventListener('keydown', (e) => {
      if (!M.open || e.key !== 'Escape' || e.defaultPrevented) return;
      if ($('#modalRoot').children.length || !ctx.hidden || document.querySelector('.CodeMirror-hints')) return;
      e.preventDefault();
      e.stopPropagation();
      attemptClose();
    }, true);
  }

  // stavový řádek menu (nahoře v panelu)
  function renderBar() {
    const bar = $('#fsBar');
    if (!M.open) return;
    const dirty = menuDirty();
    const live = !!S.data.ui.livePreview;
    const stale = M.shown !== M.code;
    const stErr = hasStateErr();
    const fErr = hasFieldErr();
    bar.classList.toggle('dirty', dirty);
    bar.classList.toggle('invalid', stErr || fErr);
    $('#fsSave').disabled = !dirty;
    $('#fsCancel').disabled = !dirty;
    $('#fsLive').checked = live;
    $('#fsRedraw').hidden = live;
    $('#fsRedraw').disabled = !stale || stErr;
    $('#fsRedraw').classList.toggle('go', stale && !stErr);
    let t;
    if (!dirty) t = 'Bez neuložených změn';
    else {
      const d = lineDiff(M.base.code.split('\n'), M.code.split('\n'));
      const n = d.mod.length + d.ins.reduce((a, x) => a + x.texts.length, 0) + d.del.length;
      t = 'Neuloženo' + (n ? ' · ' + plural(n, 'řádek', 'řádky', 'řádků') : '');
    }
    if (M.state['@run']) t += ' · ' + M.state['@run'];
    if (stErr) t += ' · graf ukazuje poslední platnou verzi';
    else if (fErr) t += ' · oprav červená pole';
    else if (!live && stale) t += ' · náhled čeká na Překreslit';
    const tx = $('.fsb-text', bar);
    tx.textContent = t;
    tx.title = t;
  }

  /* ---------- zelený náhled změn v editoru ---------- */
  // rozdíl řádků: { mod:[{line, text}], ins:[{after, texts}], del:[line] } (řádky od 0)
  function lineDiff(a, b) {
    let p = 0;
    while (p < a.length && p < b.length && a[p] === b[p]) p++;
    let q = 0;
    while (q < a.length - p && q < b.length - p && a[a.length - 1 - q] === b[b.length - 1 - q]) q++;
    const A = a.slice(p, a.length - q);
    const B = b.slice(p, b.length - q);
    const n = A.length;
    const m = B.length;
    const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const out = { mod: [], ins: [], del: [] };
    let i = 0;
    let j = 0;
    let dels = [];
    let ins = [];
    const flush = () => {
      const k = Math.min(dels.length, ins.length);
      for (let t = 0; t < k; t++) {
        if (a[dels[t]] === '') out.ins.push({ after: dels[t], texts: [ins[t]], blank: true });
        else out.mod.push({ line: dels[t], text: ins[t] });
      }
      dels.slice(k).forEach((l) => out.del.push(l));
      if (ins.length > k) out.ins.push({ after: (k ? dels[k - 1] : p + i - dels.length - 1), texts: ins.slice(k) });
      dels = [];
      ins = [];
    };
    while (i < n || j < m) {
      if (i < n && j < m && A[i] === B[j]) { flush(); i++; j++; }
      else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) { ins.push(B[j]); j++; }
      else { dels.push(p + i); i++; }
    }
    flush();
    return out;
  }

  let diffMarks = [];
  function clearDiff() {
    const cm = S.cm;
    cm.operation(() => {
      diffMarks.forEach((d) => {
        if (d.mark) d.mark.clear();
        if (d.widget) d.widget.clear();
        if (d.line) cm.removeLineClass(d.line, 'background', d.cls);
      });
    });
    diffMarks = [];
  }
  function markDiff() {
    const cm = S.cm;
    clearDiff();
    if (!S.draft) return;
    const d = lineDiff(cm.getValue().split('\n'), S.draft.code.split('\n'));
    let first = null;
    const seen = (l) => { if (first === null || l < first) first = l; };
    cm.operation(() => {
      d.mod.forEach((x) => {
        const h = cm.getLineHandle(x.line);
        const span = el('span', 'cm-draft-new');
        span.textContent = x.text;
        diffMarks.push({ mark: cm.markText({ line: x.line, ch: 0 }, { line: x.line, ch: h.text.length }, { replacedWith: span, atomic: false }) });
        cm.addLineClass(h, 'background', 'cm-draft-line');
        diffMarks.push({ line: h, cls: 'cm-draft-line' });
        seen(x.line);
      });
      d.del.forEach((l) => {
        const h = cm.getLineHandle(l);
        cm.addLineClass(h, 'background', 'cm-draft-del');
        diffMarks.push({ line: h, cls: 'cm-draft-del' });
        if (h.text.length) diffMarks.push({ mark: cm.markText({ line: l, ch: 0 }, { line: l, ch: h.text.length }, { className: 'cm-draft-strike' }) });
        seen(l);
      });
      d.ins.forEach((x) => {
        const node = el('div', 'cm-draft-ins');
        x.texts.forEach((t) => { const r = el('div', 'cm-draft-insline'); r.textContent = t || ' '; node.appendChild(r); });
        const at = x.after < 0 ? 0 : Math.min(x.after, cm.lineCount() - 1);
        diffMarks.push({ widget: cm.addLineWidget(at, node, { above: x.after < 0 }) });
        seen(at);
      });
    });
    // změněné místo ukázat, ale bez fokusu (ten by návrh uložil)
    if (first !== null) {
      const vis = cm.getScrollInfo();
      const top = cm.heightAtLine(first, 'local');
      if (top < vis.top || top > vis.top + vis.clientHeight - 40) cm.scrollTo(null, Math.max(0, top - vis.clientHeight / 3));
    }
  }

  /* =====================================================================
     Běh skriptu
     ===================================================================== */
  function setStatus(text, kind) {
    const st = $('#stStatus');
    st.textContent = text;
    st.className = kind || '';
  }
  const fmtMs = (ms) => (ms < 10 ? ms.toFixed(1) : Math.round(ms)) + ' ms';
  const plural = (n, a, b, c) => n + ' ' + (n === 1 ? a : n >= 2 && n <= 4 ? b : c);

  function runScript(opts) {
    opts = opts || {};
    const s = cur();
    if (S.draft) { S.draft = null; clearDiff(); }
    clearErrMark();
    S.scope = freshScope();
    S.meta = { funcs: {} };
    const before = S.gfx.figs.map((f) => f.num).join(',');
    S.gfx = G.newState();
    S.runId++;
    S.ranCode = S.cm ? S.cm.getValue() : s.code;
    E.setPrecision(S.data.ui.format);
    const res = E.run(S.ranCode, S.scope, { meta: S.meta, gfx: S.gfx, data: dataOpts(S.scope) });
    noteShadows(res);
    S.lastError = res.error;
    S.gfx.figs.forEach((f) => { f.runId = S.runId; });
    appendRun(res, s.name, !!opts.auto);
    // nový graf ze skriptu se ukáže; jinak zůstane vybraná záložka
    pickFigure(!opts.edit && S.gfx.figs.map((f) => f.num).join(',') !== before);
    rebaseMenu();
    afterEval(res, true);
  }

  // Vybere aktivní graf po běhu. preferCurrent = ukázat graf, do kterého se kreslilo naposledy (gcf)
  function pickFigure(preferCurrent) {
    const s = cur();
    const g = S.gfx;
    let f = null;
    if (S.selectLine) { f = g.figs.find((x) => x.createLine === S.selectLine) || null; S.selectLine = null; }
    if (!f && preferCurrent && g.cur) f = g.cur;
    if (!f) f = g.figs.find((x) => x.num === s.activeFigNum) || g.cur || g.figs[0] || null;
    if (f) { s.activeFigNum = f.num; g.cur = f; }
  }

  function runPart(text, startLine, title) {
    clearErrMark();
    E.setPrecision(S.data.ui.format);
    const res = E.run(text, S.scope, { meta: S.meta, gfx: S.gfx, lineOffset: startLine, data: dataOpts(S.scope) });
    noteShadows(res);
    appendRun(res, title, false, true);
    pickFigure(true);
    rebaseMenu();
    afterEval(res, true);
  }

  // Spustit sekci (⌥↵): řádky od nadpisu %% po další nadpis, ve stávajícím workspace
  function runSection() {
    if (commitDraft()) return;
    const r = sectionRange(S.cm.getCursor().line);
    const text = S.cm.getRange({ line: r.s, ch: 0 }, { line: r.e, ch: S.cm.getLine(r.e).length });
    if (!text.trim()) return;
    runPart(text, r.s, 'sekce ' + (r.title ? '„' + r.title + '“ ' : '') + '(ř. ' + (r.s + 1) + '–' + (r.e + 1) + ')');
  }

  function runSelection() {
    if (commitDraft()) return;
    const cm = S.cm;
    let text;
    let startLine;
    if (cm.somethingSelected()) {
      text = cm.getSelection();
      startLine = Math.min(cm.getCursor('from').line, cm.getCursor('to').line);
    } else {
      startLine = cm.getCursor().line;
      text = cm.getLine(startLine);
    }
    if (!text.trim()) return;
    runPart(text, startLine, 'výběr (ř. ' + (startLine + 1) + ')');
  }

  function runCommand(cmd) {
    E.setPrecision(S.data.ui.format);
    const res = E.run(cmd, S.scope, { meta: S.meta, gfx: S.gfx, data: dataOpts(S.scope) });
    noteShadows(res);
    pickFigure(true);
    rebaseMenu();
    const out = $('#cmdOut');
    const block = el('div', 'run-block cmd');
    const echo = el('div', 'out-echo');
    echo.innerHTML = '<span class="ps">&gt;&gt;</span>';
    echo.appendChild(document.createTextNode(cmd));
    block.appendChild(echo);
    out.appendChild(block);
    renderOutputs(block, res, false);
    trimCmd();
    out.scrollTop = out.scrollHeight;
    afterEval(res, false);
  }

  function afterEval(res, fromEditor) {
    if (res.error) {
      if (fromEditor) markErr(res.error.line);
      setStatus(fromEditor ? 'Chyba na řádku ' + res.error.line + ': ' + res.error.message : 'Chyba: ' + res.error.message, 'err');
    } else {
      setStatus('Hotovo – ' + plural(res.count, 'příkaz', 'příkazy', 'příkazů') + ' za ' + fmtMs(res.ms), 'ok');
    }
    S.sel.forEach((n) => { if (!has(S.scope, n)) S.sel.delete(n); });
    renderWorkspace();
    renderTabs();
    renderFigure();
    renderMenu();
  }

  /* ---------- Command Window ---------- */
  function appendRun(res, title, auto, keepOld) {
    const out = $('#cmdOut');
    if (auto) {
      const last = out.lastElementChild;
      if (last && last.classList.contains('auto')) last.remove();
    }
    if (!keepOld) $$('.run-block', out).forEach((b) => b.classList.add('old'));
    const block = el('div', 'run-block' + (auto ? ' auto' : ''));
    const now = new Date();
    const time = now.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const head = el('div', 'run-head');
    head.innerHTML = '<span><b></b> · ' + time + ' · ' + fmtMs(res.ms) + (auto ? ' · automaticky' : '') + '</span>';
    $('b', head).textContent = '▶ ' + title;
    block.appendChild(head);
    out.appendChild(block);
    renderOutputs(block, res, true);
    if (!res.outputs.length && !res.error) block.appendChild(el('div', 'out-info', 'Bez výpisu – všechny řádky končí středníkem. Výsledky jsou ve Workspace.'));
    trimCmd();
    out.scrollTop = out.scrollHeight;
  }

  function trimCmd() {
    const out = $('#cmdOut');
    while (out.children.length > 80) out.firstElementChild.remove();
  }

  function lineBtn(line) {
    const b = el('button', 'ln');
    b.textContent = 'ř. ' + line;
    b.title = 'Přejít na řádek ' + line;
    b.addEventListener('click', () => gotoLine(line));
    return b;
  }

  function renderOutputs(block, res, withLines) {
    res.outputs.forEach((o) => {
      if (o.type === 'clc') {
        const out = $('#cmdOut');
        Array.from(out.children).forEach((c) => { if (c !== block) c.remove(); });
        Array.from(block.children).forEach((c) => { if (!c.classList.contains('run-head') && !c.classList.contains('out-echo')) c.remove(); });
        return;
      }
      if (o.type === 'format') { S.data.ui.format = o.mode; $('#selFormat').value = o.mode; save(); return; }
      if (o.type === 'clear') return;
      const row = el('div', 'out-row');
      const main = el('div', 'out-main');
      row.appendChild(main);
      if (o.type === 'warn') {
        main.classList.add('out-warn');
        main.textContent = 'Varování: ' + o.text;
      } else if (o.type === 'shadow') {
        main.classList.add('out-shadow');
        main.textContent = '📊 „' + o.name + '“ je datová proměnná – přiřazení ji zastíní jen pro tento běh, uložená data zůstávají beze změny.';
      } else if (o.type === 'disp') {
        main.classList.add('out-disp');
        main.textContent = o.text;
      } else if (o.type === 'fn') {
        main.innerHTML = '<span class="out-name"></span>';
        $('.out-name', main).textContent = o.text;
      } else if (o.type === 'value') {
        const f = E.formatValue(o.value, o.p);
        main.innerHTML = '<span class="out-name"></span><span class="out-eq"> = </span>';
        $('.out-name', main).textContent = o.name;
        if (f.multiline) {
          const sz = el('span', 'out-size');
          sz.textContent = f.size;
          main.appendChild(sz);
          const pre = el('pre', 'out-mat');
          pre.textContent = f.text;
          main.appendChild(pre);
        } else {
          const v = el('span', 'out-v');
          v.textContent = f.text;
          main.appendChild(v);
          if (f.size !== '1×1' && f.size !== '–') {
            const sz = el('span', 'out-size');
            sz.textContent = f.size;
            main.appendChild(sz);
          }
        }
        if (f.big) {
          const more = el('button', 'out-more');
          more.textContent = 'zobrazit vše';
          const val = o.value;
          more.addEventListener('click', () => openViewer(o.name, val));
          main.appendChild(more);
        }
      }
      if (withLines && o.line) row.appendChild(lineBtn(o.line));
      block.appendChild(row);
    });
    if (res.error) {
      const row = el('div', 'out-row');
      const main = el('div', 'out-main out-err');
      main.textContent = (withLines ? 'Chyba na řádku ' + res.error.line + ': ' : 'Chyba: ') + res.error.message;
      if (res.error.hint) {
        const h = el('span', 'hint');
        h.textContent = res.error.hint;
        main.appendChild(h);
      }
      row.appendChild(main);
      if (withLines) row.appendChild(lineBtn(res.error.line));
      block.appendChild(row);
    }
  }

  function initCommandWindow() {
    const inp = $('#cmdInput');
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const cmd = inp.value;
        if (!cmd.trim()) return;
        S.hist.push(cmd);
        if (S.hist.length > 200) S.hist.shift();
        S.histPos = S.hist.length;
        inp.value = '';
        runCommand(cmd);
      } else if (e.key === 'ArrowUp') {
        if (S.histPos > 0) { S.histPos--; inp.value = S.hist[S.histPos]; e.preventDefault(); }
      } else if (e.key === 'ArrowDown') {
        if (S.histPos < S.hist.length) { S.histPos++; inp.value = S.hist[S.histPos] || ''; e.preventDefault(); }
      } else if (e.key === 'Escape') { inp.value = ''; }
    });
    // klik do prázdného místa okna = psaní do příkazového řádku (jako v MATLABu)
    $('#cmdOut').addEventListener('mouseup', (e) => {
      if (e.target.closest('button')) return;
      if (String(window.getSelection())) return;
      inp.focus();
    });
    $('#btnClc').addEventListener('click', () => { $('#cmdOut').innerHTML = ''; inp.focus(); });
  }

  /* =====================================================================
     Workspace
     ===================================================================== */
  function wsNames() {
    const names = Object.keys(S.scope);
    if (S.wsSort === 'name') names.sort((a, b) => a.localeCompare(b, 'cs', { sensitivity: 'base' }));
    return names;
  }

  function renderWorkspace() {
    const tbody = $('#wsTable tbody');
    const c = figCtx();
    const names = wsNames();
    const lines = c.fig ? c.fig.ax.lines : [];
    const yMap = new Map();
    lines.forEach((ln) => { if (ln.yname && !yMap.has(ln.yname)) yMap.set(ln.yname, ln.color); });
    const xSet = new Set(lines.map((ln) => ln.xname).filter(Boolean));
    if (c.pendingX) xSet.add(c.pendingX);
    tbody.innerHTML = names.map((n) => {
      const d = descOf(n);
      const dv = isDataVar(n);
      const shadow = !dv && isShadowed(n);
      const dvar = DATA.has(n) ? DATA.getVar(n) : null;
      const dset = dvar ? DATA.get(dvar.datasetId) : null;
      let roles = '';
      if (xSet.has(n)) roles += '<span class="role rx" title="Osa X v aktivním grafu">X</span>';
      if (yMap.has(n)) roles += '<span class="role ry" style="--c:' + esc(yMap.get(n)) + '" title="Osa Y v aktivním grafu">Y</span>';
      const cls = (S.sel.has(n) ? 'sel ' : '') + (d.plottable ? 'pl' : 'np');
      let tip = d.plottable ? n + ' – vektor ' + d.size + ' (pravý klik: do grafu)' : n + ' – ' + d.reason;
      if (dv) tip = n + ' – datová proměnná' + (dset ? ' (dataset „' + dset.name + '“, sloupec ' + (dvar.col + 1) + ')' : '') + ', ' + d.size + ' · pravý klik: do grafu, přejmenovat, smazat';
      if (shadow) tip = n + ' – kód přiřadil do datové proměnné; v tomto běhu ji zastiňuje, uložená data se nezměnila';
      const icon = dv ? '<span class="ic-data" aria-label="datová proměnná">📊</span>'
        : '<span class="ic-t ic-' + d.kind + '">' + (d.kind === 'fn' ? 'f' : d.kind === 'str' ? 'ab' : '') + '</span>';
      return '<tr data-name="' + esc(n) + '" class="' + cls + (dv ? ' data' : '') + '" title="' + esc(tip) + '">' +
        '<td class="c-name">' + icon + '<span class="nm">' + esc(n) + '</span>' + (shadow ? '<span class="shadow-tag">📊 zastíněno</span>' : '') + roles + '</td>' +
        '<td class="c-val">' + esc(d.preview) + '</td>' +
        '<td class="c-size">' + esc(d.size) + '</td></tr>';
    }).join('');
    $('#wsEmpty').hidden = names.length > 0;
    $('#wsCount').textContent = names.length ? '· ' + names.length : '';
    $('#wsSortInd').textContent = S.wsSort === 'name' ? 'A–Z' : '↓';
  }

  function updateSelClasses() {
    $$('#wsTable tbody tr').forEach((tr) => tr.classList.toggle('sel', S.sel.has(tr.dataset.name)));
  }

  function initWorkspace() {
    const tbody = $('#wsTable tbody');
    tbody.addEventListener('mousedown', (e) => {
      const tr = e.target.closest('tr');
      if (!tr || e.button !== 0) return;
      const name = tr.dataset.name;
      if (e.shiftKey && S.anchor && has(S.scope, S.anchor)) {
        const names = wsNames();
        const a = names.indexOf(S.anchor);
        const b = names.indexOf(name);
        S.sel = new Set(names.slice(Math.min(a, b), Math.max(a, b) + 1));
      } else if (e.metaKey || e.ctrlKey) {
        if (S.sel.has(name)) S.sel.delete(name); else S.sel.add(name);
        S.anchor = name;
      } else {
        S.sel = new Set([name]);
        S.anchor = name;
      }
      updateSelClasses();
    });
    tbody.addEventListener('dblclick', (e) => {
      const tr = e.target.closest('tr');
      if (tr) openViewer(tr.dataset.name, S.scope[tr.dataset.name]);
    });
    tbody.addEventListener('contextmenu', (e) => {
      const tr = e.target.closest('tr');
      if (!tr) return;
      e.preventDefault();
      const name = tr.dataset.name;
      if (!S.sel.has(name)) { S.sel = new Set([name]); S.anchor = name; updateSelClasses(); }
      wsMenu(e.clientX, e.clientY);
    });
    $('#wsTable thead th[data-sort]').addEventListener('click', () => {
      S.wsSort = S.wsSort === 'order' ? 'name' : 'order';
      renderWorkspace();
    });
    // Delete / Backspace smaže označené proměnné (jen když se naposledy klikalo do Workspace)
    document.addEventListener('mousedown', (e) => { S.wsFocus = !!e.target.closest('#wsTable'); }, true);
    document.addEventListener('keydown', (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && S.wsFocus && S.sel.size && document.activeElement === document.body) {
        e.preventDefault();
        deleteVars(Array.from(S.sel));
      }
    });
  }
  /* ---------- kontext aktivního grafu ---------- */
  // { fig, g (skupina řádků v bloku %% Grafy nebo null), editable, xName, pendingX, outside }
  // src = { code, gfx } – výchozí je to, co se zobrazuje; menu nastavení bere svůj návrh (menuCtx)
  function figCtx(src) {
    src = src || view();
    const f = src.gfx.figs.find((x) => x.num === cur().activeFigNum) || null;
    if (!f) return { fig: null, editable: false };
    const an = PC.analyze(String(src.code || '').split('\n'));
    const g = f.runId === S.runId ? PC.groupOf(an, f) : null;
    const key = cur().id + ':' + f.num;
    const hasPlots = g ? g.stmts.some((st) => st.call && G.PLOT_FNS.has(st.call.fn)) : f.ax.lines.length > 0;
    const editPlots = g ? g.stmts.filter((st) => { const m = PC.plotModel(st); return m && m.editable; }).length : 0;
    const pendingX = !hasPlots && S.pendingX[key] ? S.pendingX[key] : null;
    const xName = g ? (PC.commonX(g) !== null ? PC.commonX(g) : pendingX || '') : null;
    // řádky mimo skupinu, které graf taky mění
    const outside = g ? f.stmts.filter((st) => st.line < g.start || st.line > g.end) : f.stmts;
    return { fig: f, an, g, editable: !!g, xName, pendingX, key, outside, hasPlots, editPlots };
  }
  const menuCtx = () => figCtx(M.run || view());

  function wsMenu(x, y) {
    const names = wsNames().filter((n) => S.sel.has(n));
    if (!names.length) return;
    const c = figCtx();
    const descs = names.map((n) => ({ n, d: descOf(n) }));
    const plottable = descs.filter((o) => o.d.plottable).map((o) => o.n);
    const single = names.length === 1 ? names[0] : null;
    const items = [];
    const canEdit = !c.fig || c.editable;   // bez grafu se vytvoří nový v bloku %% Grafy
    const xName = c.editable ? c.xName : null;
    if (!plottable.length) items.push({ note: descs[0].d.reason || 'Vybrané proměnné nejde vykreslit.' });
    else if (!canEdit) items.push({ note: 'Aktivní graf vzniká v kódu na ř. ' + c.fig.createLine + ' (mimo blok %% Grafy). Klikáním ho neměním – použij „Vykreslit v novém grafu“.' });
    else if (xName && xName !== single && has(S.scope, xName)) {
      const xd = E.describe(S.scope[xName]);
      const bad = plottable.filter((n) => n !== xName && E.describe(S.scope[n]).length !== xd.length);
      if (bad.length) items.push({ note: 'Pozor: ' + bad.join(', ') + ' má jinou délku než osa X „' + xName + '“ (' + xd.length + ').' });
    }
    const inFig = c.fig ? names.filter((n) => c.fig.ax.lines.some((ln) => ln.xname === n || ln.yname === n) || c.pendingX === n) : [];
    items.push({
      badge: 'X', label: 'Nastavit jako osu X',
      disabled: !canEdit || !(single && plottable.includes(single)) || xName === single,
      title: names.length > 1 ? 'Na osu X jde jen jedna proměnná' : '',
      action: () => setX(single),
    });
    const already = new Set(c.fig ? c.fig.ax.lines.map((ln) => ln.yname).filter(Boolean) : []);
    const ny = plottable.filter((n) => n !== xName && !already.has(n));
    items.push({
      badge: 'Y', badgeCls: 'y', label: ny.length > 1 ? 'Přidat na osu Y (' + ny.length + ')' : 'Přidat na osu Y',
      disabled: !canEdit || !ny.length, action: () => addY(ny),
    });
    items.push({ badge: '+', badgeCls: 'ghost', label: 'Vykreslit v novém grafu', disabled: !plottable.length, action: () => newFigWith(plottable) });
    if (inFig.length && c.editable) items.push({ badge: '−', badgeCls: 'ghost', label: 'Odebrat z grafu', action: () => removeFromFig(inFig) });
    items.push({ sep: true });
    items.push({ label: 'Zobrazit hodnoty', key: 'dvojklik', disabled: !single, action: () => openViewer(single, S.scope[single]) });
    items.push({ label: 'Kopírovat hodnoty', key: 'pro Excel', disabled: !single, action: () => copyText(E.toClipboardText(S.scope[single], DEC), 'Hodnoty zkopírovány (jeden sloupec)') });
    const dataNames = names.filter((n) => DATA.has(n));
    if (single && DATA.has(single)) {
      const dv = DATA.getVar(single);
      items.push({ sep: true });
      items.push({ label: '📊 Přejmenovat data…', action: () => MC.dataView.renameVar(single) });
      items.push({ label: '📊 Otevřít v okně Data', key: 'sloupec ' + (dv.col + 1), action: () => MC.dataView.open(dv.datasetId) });
    }
    items.push({ sep: true });
    if (dataNames.length === names.length) {
      items.push({ label: names.length > 1 ? 'Smazat data trvale (' + names.length + ')…' : 'Smazat data trvale…', danger: true, action: () => deleteVars(names) });
    } else {
      items.push({ label: (names.length > 1 ? 'Smazat z workspace (' + names.length + ')' : 'Smazat z workspace') + (dataNames.length ? ' + data' : ''), danger: true, action: () => deleteVars(names) });
    }
    showMenu(x, y, names.length === 1 ? names[0] + '  ' + descs[0].d.size : names.length + ' vybrané proměnné', items);
  }

  // desetinný oddělovač podle jazyka systému (česky čárka) – aby Excel bral hodnoty jako čísla
  const DEC = (1.5).toLocaleString().indexOf(',') >= 0 ? ',' : '.';

  function copyText(text, msg) {
    if (!navigator.clipboard) { toast('Schránka není v tomto prohlížeči dostupná', true); return; }
    navigator.clipboard.writeText(text).then(() => toast(msg || 'Zkopírováno'), () => toast('Kopírování se nepovedlo', true));
  }

  async function deleteVars(names) {
    // datové proměnné se mažou trvale (i z úložiště) – jen po potvrzení
    const dataNames = names.filter((n) => DATA.has(n));
    if (dataNames.length) {
      const ok = await confirmBox('Smazat data', 'Trvale smazat ' + (dataNames.length === 1 ? 'datovou proměnnou „' + dataNames[0] + '“' : 'datové proměnné ' + dataNames.join(', ')) +
        '? Soubor v okně Data zůstane, sloupec můžeš pojmenovat znovu.', 'Smazat');
      if (!ok) return;
      for (const n of dataNames) await DATA.deleteVar(n);
    }
    names.forEach((n) => { delete S.scope[n]; delete S.meta.funcs[n]; S.sel.delete(n); S.dataInj.delete(n); });
    renderWorkspace();
    renderMenu();
    if (dataNames.length) toast(plural(dataNames.length, 'datová proměnná smazána', 'datové proměnné smazány', 'datových proměnných smazáno'));
  }

  /* ---------- akce s grafem (zapisují kód do bloku %% Grafy) ---------- */
  // Z menu Workspace a záložek se zapisuje hned (writeCode), z menu nastavení do návrhu (editDraft).
  const applyFor = (panel) => (panel ? (fn) => editDraft(fn) : (fn) => writeCode(fn));
  const ctxFor = (panel) => (panel ? menuCtx() : figCtx());

  // kontrola stejné délky X a Y; vrací text chyby nebo ''
  function lenProblem(xName, ys) {
    if (!xName || !has(S.scope, xName)) return '';
    const xd = descOf(xName);
    if (!xd.plottable) return '';
    const bad = ys.filter((y) => y.name !== xName && y.len !== xd.length);
    if (!bad.length) return '';
    const n = (k) => k.toLocaleString('cs-CZ');
    return 'Vektory X a Y musí mít stejnou délku: osa X „' + xName + '“ má ' + n(xd.length) + ' hodnot, ale ' +
      bad.map((b) => '„' + b.name + '“ má ' + n(b.len)).join(', ') + '.';
  }
  const yLens = (names) => names.filter((n) => has(S.scope, n)).map((n) => ({ name: n, len: descOf(n).length }));

  function setX(name, panel) {
    const c = ctxFor(panel);
    if (!c.fig) {
      // ještě žádný graf: prázdný figure + zapamatovaná osa X
      writeCode((lines) => ({ selectLine: PC.newFigure(lines, [], null) }));
      const f = activeFig();
      if (f) S.pendingX[cur().id + ':' + f.num] = name;
      renderWorkspace(); renderMenu();
      return;
    }
    if (!c.hasPlots) {
      if (name) S.pendingX[c.key] = name; else delete S.pendingX[c.key];
      renderWorkspace(); renderMenu();
      toast('Osa X: ' + (name || 'index') + ' – teď přidej proměnnou na osu Y');
      return;
    }
    const prob = lenProblem(name, c.fig.ax.lines.map((ln) => ({ name: ln.yname || ln.ytext, len: ln.y.length })));
    if (prob) { toast(prob, true); if (panel) renderMenu(); return; }
    applyFor(panel)((lines, fig) => PC.setX(lines, fig, name));
  }

  // osa X = čas z periody vzorkování (t = (0:n-1)*dt zapsané do bloku %% Grafy) – z menu nastavení
  async function chooseTime() {
    const c = menuCtx();
    if (!c.fig || !c.editable) return;
    if (!c.editPlots) { toast('Nejdřív přidej křivku na osu Y – délka časového vektoru se odvodí z ní', true); renderMenu(); return; }
    const v = await promptText('Čas z periody vzorkování', 'Perioda vzorkování v sekundách (např. 0,01). Na osu X se dá vektor t = (0 : n−1) · perioda.', S.data.ui.lastDt || '0.01');
    focusMenu();
    if (v === null || v === undefined) { renderMenu(); return; }
    const dt = Number(String(v).trim().replace(',', '.'));
    if (!(dt > 0) || !Number.isFinite(dt)) { toast('Perioda musí být kladné číslo, např. 0.01', true); renderMenu(); return; }
    S.data.ui.lastDt = String(v).trim();
    save();
    const taken = new Set(Object.keys(S.scope));
    editDraft((lines, fig) => PC.setTimeX(lines, fig, String(+dt.toPrecision(12)), taken));
  }

  function addY(names, panel) {
    const c = ctxFor(panel);
    if (!c.fig) { newFigWith(names); return; }
    const legend = c.fig.ax.legend && c.fig.ax.legend.visible;
    const xName = c.xName || null;
    const prob = lenProblem(xName, yLens(names));
    if (prob) { toast(prob, true); if (panel) renderMenu(); return; }
    applyFor(panel)((lines, fig) => { PC.addY(lines, fig, names, xName && !names.includes(xName) ? xName : null, legend); });
    if (c.pendingX) delete S.pendingX[c.key];
  }

  function removeFromFig(names) {
    const c = figCtx();
    if (c.pendingX && names.includes(c.pendingX)) { delete S.pendingX[c.key]; renderWorkspace(); renderMenu(); }
    if (!c.hasPlots) return;
    writeCode((lines, fig) => PC.removeVars(lines, fig, names));
  }

  function newFigWith(names) {
    const c = figCtx();
    let xName = c.editable && c.xName && has(S.scope, c.xName) && !names.includes(c.xName) ? c.xName : null;
    // časová osa patří ke svému grafu; jiná délka -> nový graf proti indexu
    if (xName && (lenProblem(xName, yLens(names)) || (c.g && PC.timeOf(c.g) && PC.timeOf(c.g).name === xName))) xName = null;
    writeCode((lines) => ({ selectLine: PC.newFigure(lines, names, xName) }));
  }

  function addFigure() {
    writeCode((lines) => ({ selectLine: PC.newFigure(lines, [], null) }));
  }

  /* =====================================================================
     Graf – záložky, vykreslení, panel nastavení
     ===================================================================== */
  function tabLabel(f) {
    if (f.name) return P.figLabel(f);
    const t = f.ax.title && f.ax.title.text ? P.texPlain(f.ax.title.text, f.ax.title.interp).trim() : '';
    return t || 'Figure ' + f.num;
  }

  function renderTabs() {
    const s = cur();
    const box = $('#figTabs');
    box.innerHTML = view().gfx.figs.map((f) => '<button class="ftab' + (f.num === s.activeFigNum ? ' active' : '') + '" data-n="' + f.num + '" title="Figure ' + f.num + (f.name ? ': ' + esc(f.name) : '') + ' – ř. ' + f.createLine + '">' +
      '<span class="t">' + esc(tabLabel(f)) + '</span><span class="x" data-close="' + f.num + '" title="Smazat graf z kódu">×</span></button>').join('') +
      '<button class="ftab-add" title="Nový graf (přidá figure do bloku %% Grafy)">+</button>';
  }

  function initTabs() {
    $('#figTabs').addEventListener('click', (e) => {
      const s = cur();
      if (e.target.closest('.ftab-add')) { addFigure(); return; }
      const x = e.target.closest('[data-close]');
      if (x) {
        const n = +x.dataset.close;
        s.activeFigNum = n;
        const c = figCtx();
        if (!c.editable) {
          toast('Graf vzniká v kódu na ř. ' + c.fig.createLine + ' – smaž ho tam', true);
          gotoLine(c.fig.createLine);
          renderAll();
          return;
        }
        delete S.pendingX[c.key];
        writeCode((lines, fig) => PC.removeFigure(lines, fig), { figNum: n });
        return;
      }
      const t = e.target.closest('.ftab');
      if (t) {
        s.activeFigNum = +t.dataset.n;
        view().gfx.cur = activeFig();
        save();
        renderAll();
      }
    });
  }

  function renderAll() {
    renderWorkspace();
    renderTabs();
    renderFigure();
    renderMenu();
  }

  function renderFigure() {
    const f = activeFig();
    const div = $('#figPlot');
    let r = { empty: true, warnings: [] };
    if (f) r = P.render(div, f, { theme: S.theme }); else if (window.Plotly) { window.Plotly.purge(div); div._mcHome = null; div._mcDbl = false; }
    const empty = $('#figEmpty');
    empty.hidden = !r.empty;
    if (r.empty) {
      $('.fe-msg', empty).innerHTML = f
        ? '<p><b>Figure ' + f.num + ' je prázdný.</b></p><p>Ve Workspace klikni <b>pravým</b> na vektor a zvol <b>Přidat na osu Y</b>, nebo napiš <code>plot(x, y)</code>.</p>'
        : '<p><b>Zatím žádný graf.</b></p><p>Ve Workspace klikni <b>pravým</b> na vektor a zvol <b>Nastavit jako osu X</b> nebo <b>Přidat na osu Y</b>. Do skriptu se zapíše blok <code>%% Grafy</code>.</p><p class="muted">Nebo graf napiš sám: <code>figure</code>, <code>plot(t, A)</code>, <code>title(…)</code>.</p>';
    }
    const nt = $('#figNotice');
    nt.innerHTML = r.warnings.map((w) => '<div>⚠ ' + esc(w) + '</div>').join('');
    nt.hidden = !r.warnings.length;
  }
  new ResizeObserver(() => {
    const div = $('#figPlot');
    if (div && div.data && window.Plotly) window.Plotly.Plots.resize(div);
  }).observe($('#figPlot'));

  function plottableVars() {
    return wsNames().filter((n) => descOf(n).plottable);
  }

  /* ---------- panel nastavení ---------- */
  const LOC_OPTS = [['northeast', 'Vpravo nahoře'], ['northwest', 'Vlevo nahoře'], ['southeast', 'Vpravo dole'], ['southwest', 'Vlevo dole'],
    ['north', 'Nahoře uprostřed'], ['south', 'Dole uprostřed'], ['best', 'Nejlepší (best)'], ['northeastoutside', 'Mimo graf vpravo'], ['southoutside', 'Pod grafem']];
  const LS_OPTS = [['-', '—— plná'], ['--', '– – čárkovaná'], [':', '······ tečkovaná'], ['-.', '–·–· čerchovaná'], ['none', 'bez čáry']];
  const MK_OPTS = [['none', 'bez bodů'], ['o', '○ kroužek'], ['s', '□ čtverec'], ['d', '◇ kosočtverec'], ['^', '△ trojúhelník'], ['v', '▽ trojúhelník'], ['x', '× křížek'], ['+', '+ plus'], ['*', '✱ hvězdička'], ['.', '• tečka']];
  const SIDE_OPTS = [['left', 'levá'], ['right', 'pravá (vedlejší)']];

  function lineLink(line) { return '<button class="ln" data-goto="' + line + '" title="Přejít na řádek ' + line + '">ř. ' + line + '</button>'; }
  function roCode(st) { return '<div class="fs-ro"><code>' + esc(st.code) + '</code>' + lineLink(st.line) + '</div>'; }

  // poslední řádek dané funkce ve skupině (u ylabel / ylim jen na dané straně) – null, nebo { st, ro }
  function lastOf(g, fns, side) {
    let list = PC.byFn(g, fns);
    if (side) { const sm = PC.sideMap(g); list = list.filter((st) => sm.get(st) === side); }
    if (!list.length) return null;
    const st = list[list.length - 1];
    return { st, ro: !PC.represented(st) };
  }

  // klíč pole v menu (u křivek s číslem řádku) – podle něj se pamatuje neplatná hodnota
  const fieldKey = (k, s) => (s ? 's' + s + ':' : '') + k;

  // ovládací prvky; u textových polí neplatná rozepsaná hodnota (M.raw) zůstává červeně
  function controls(sKey) {
    const opt = (v, curV, label, dis) => '<option value="' + esc(v) + '"' + (v === curV ? ' selected' : '') + (dis ? ' disabled' : '') + '>' + esc(label === undefined ? v : label) + '</option>';
    const sel = (k, options, value, extra) => '<select data-k="' + k + '"' + (extra || '') + '>' + options.map((o) => opt(o[0], value, o[1], o[2])).join('') + '</select>';
    const input = (k, value, ph, type, extra) => {
      const key = fieldKey(k, sKey);
      const bad = M.fieldBad[key] || M.state[key];
      const v = has(M.raw, key) ? M.raw[key] : value === undefined || value === null ? '' : value;
      return '<input data-k="' + k + '" type="' + (type || 'text') + '" value="' + esc(v) + '" placeholder="' + esc(ph || '') + '"' +
        (bad ? ' class="bad" title="' + esc(bad) + '"' : '') + (extra || '') + '>';
    };
    const chk = (k, label, on, dis) => '<label class="fs-check' + (dis ? ' dis' : '') + '"><input type="checkbox" data-k="' + k + '"' + (on ? ' checked' : '') + (dis ? ' disabled' : '') + '> ' + label + '</label>';
    return { opt, sel, input, chk };
  }

  function settingsHTML(c) {
    const f = c.fig;
    const ax = f.ax;
    const R = ax.yyaxis ? ax.right : null;
    const vars = plottableVars();
    const { opt, sel, input, chk } = controls();
    const g = c.g;
    const ed = c.editable;
    const lim = (l, i) => (l && l[i] !== undefined && l[i] !== null ? (Number.isFinite(l[i]) ? +l[i].toPrecision(10) : l[i] > 0 ? 'Inf' : '-Inf') : '');
    const limTxt = (l, i) => { const v = lim(l, i); return v === 'Inf' || v === '-Inf' ? '' : v; };
    const sm = ed ? PC.sideMap(g) : null;
    const rightUsed = ed ? PC.hasRight(g) || ax.lines.some((ln) => ln.side === 'right') : !!R;

    // pole, které je buď editovatelné, nebo ukáže ručně psaný řádek. key = klíč pole, P = osa (ax / R)
    const textField = (fn, label, key, P, side) => {
      const lo = ed ? lastOf(g, fn, side) : null;
      const t = P ? P[fn] : null;
      if (!ed || (lo && lo.ro)) {
        return '<div class="fs-field"><span>' + label + '</span>' + (lo ? roCode(lo.st) : '<div class="fs-val">' + esc(t ? t.text : '–') + '</div>') + '</div>';
      }
      return '<label class="fs-field"><span>' + label + '</span>' + input(key, t ? t.text : '', 'bez popisku') + '</label>';
    };
    const rangeField = (fn, key, P, side) => {
      const lo = ed ? lastOf(g, fn, side) : null;
      const l = P ? P[fn] : null;
      const show = (i) => { const v = limTxt(l, i); return v === '' ? 'auto' : v; };
      if (!ed || (lo && lo.ro)) return '<div class="fs-field"><span>Rozsah</span>' + (lo ? roCode(lo.st) : '<div class="fs-val">' + (l ? esc(show(0) + ' – ' + show(1)) : 'auto') + '</div>') + '</div>';
      return '<div class="fs-range" data-range="' + key + '"><span>Rozsah</span>' + input(key + ':0', limTxt(l, 0), 'auto') + '<span>–</span>' + input(key + ':1', limTxt(l, 1), 'auto') + '</div>';
    };

    let h = '';
    if (!ed) {
      h += '<div class="fs-note">' + (f.runId !== S.runId
        ? 'Graf vznikl z Command Window nebo spuštěním výběru. Panel je jen pro čtení.'
        : 'Graf vzniká v kódu na ' + lineLink(f.createLine) + ' mimo blok <code>%% Grafy</code>. Panel je jen pro čtení – uprav kód v editoru.') + '</div>';
    }

    h += '<div class="fs-sec"><h4>Graf <span class="fs-fig">Figure ' + f.num + '</span></h4>' + textField('title', 'Titulek', 'title', ax) + '</div>';

    // osa X
    const xVars = vars.slice();
    const xv = c.xName;
    const tm = ed ? PC.timeOf(g) : null;
    const isTime = !!(tm && xv === tm.name);
    if (xv && !xVars.includes(xv) && !isTime) xVars.push(xv);
    let xSel;
    if (ed && (c.editPlots || !c.hasPlots)) {
      const mixed = c.hasPlots && PC.commonX(g) === null;
      const xOpts = (mixed ? [['*', '(různé – viz kód)', true]] : [])
        .concat([['', '(index vzorku 1…n)'], ['@time', isTime ? 'čas z periody' : 'čas z periody…']])
        .concat(xVars.filter((v) => !(tm && v === tm.name)).map((v) => [v, varLabel(v) + (vars.includes(v) ? '' : ' (chybí)')]));
      xSel = '<label class="fs-field"><span>Proměnná</span>' + sel('x', xOpts, mixed ? '*' : isTime ? '@time' : xv || '') + '</label>';
      if (isTime) {
        xSel += '<div class="fs-field"><span>Perioda</span><span class="fs-dt">' + input('dt', tm.dt, '0.01') + '<span>s</span>' + lineLink(tm.st.line) + '</span></div>' +
          '<p class="fs-tip" style="margin:0 0 6px"><code>' + esc(tm.name) + '</code> = (0 : n−1) · perioda, n = délka <code>' + esc(tm.ref) + '</code></p>';
      }
    } else {
      const xs = [...new Set(ax.lines.map((ln) => ln.xtext || 'index'))];
      xSel = '<div class="fs-field"><span>Data</span><div class="fs-val mono">' + esc(xs.join(', ') || '–') + '</div></div>';
    }
    h += '<div class="fs-sec"><h4>Osa X</h4>' + xSel + textField('xlabel', 'Popisek', 'xlabel', ax) + rangeField('xlim', 'xlim', ax) +
      '<div class="fs-row" style="margin-top:6px">' + chk('xlog', 'Logaritmická', ax.xscale === 'log', !ed) + '</div></div>';
    h += '<div class="fs-sec"><h4>' + (rightUsed ? 'Osa Y vlevo' : 'Osa Y') + '</h4>' + textField('ylabel', 'Popisek', 'ylabel', ax, 'left') + rangeField('ylim', 'ylim', ax, 'left') +
      '<div class="fs-row" style="margin-top:6px">' + chk('ylog', 'Logaritmická', ax.yscale === 'log', !ed) + '</div></div>';
    if (rightUsed && R) {
      const one = ax.lines.filter((ln) => ln.side === 'right');
      const sw = one.length === 1 ? '<span class="fs-swatch" style="--c:' + esc(one[0].color) + '" title="Popisky a čísla pravé osy mají barvu její křivky"></span>' : '';
      h += '<div class="fs-sec fs-right"><h4>Osa Y vpravo (vedlejší) ' + sw + '</h4>' + textField('ylabel', 'Popisek', 'y2label', R, 'right') + rangeField('ylim', 'y2lim', R, 'right') +
        '<div class="fs-row" style="margin-top:6px">' + chk('y2log', 'Logaritmická', R.yscale === 'log', !ed) + '</div></div>';
    }

    // křivky – jedna karta na řádek plot
    h += '<div class="fs-sec"><h4>Křivky</h4>';
    if (ed) {
      const plotStmts = g.stmts.filter((st) => st.call && G.PLOT_FNS.has(st.call.fn));
      plotStmts.forEach((st) => {
        const m = PC.plotModel(st);
        const rl = ax.lines.filter((ln) => ln.line === st.line);
        const ln = rl[0];
        const color = ln ? ln.color : '#888888';
        if (!m || !m.editable || rl.length !== 1) {
          h += '<div class="fs-series ro" style="--c:' + esc(color) + '"><div class="full">' + roCode(st) + '</div></div>';
          return;
        }
        const k = ax.lines.indexOf(ln);
        const sv = vars.slice();
        if (!sv.includes(m.y.text)) sv.push(m.y.text);
        const sc = controls(st.line);
        h += '<div class="fs-series" data-s="' + st.line + '" data-li="' + k + '" style="--c:' + esc(color) + '">' +
          '<input type="color" data-k="color" value="' + esc(color.length === 7 ? color.toLowerCase() : '#888888') + '" title="Barva křivky">' +
          sc.sel('y', sv.map((v) => [v, varLabel(v) + (vars.includes(v) ? '' : ' (chybí)')]), m.y.text) +
          '<button class="fs-del" data-act="del-series" title="Smazat řádek ' + st.line + '">×</button>' +
          '<div class="full">' + sc.input('label', ln.displayName, P.lineName(ln, k) + ' (text v legendě)') + '</div>' +
          '<div class="pair">' + sc.sel('ls', LS_OPTS, ln.ls) + sc.sel('marker', MK_OPTS, ln.marker) + '</div>' +
          '<div class="fs-width"><span>Osa Y</span>' + sc.sel('side', SIDE_OPTS, sm.get(st) || 'left') + '</div>' +
          '<div class="fs-width"><span>Tloušťka</span>' + sc.input('width', ln.width, '0.5', 'number', ' min="0.1" step="0.5"') + lineLink(st.line) + '</div>' +
          '</div>';
      });
      const used = new Set(ax.lines.map((l) => l.yname));
      const addable = vars.filter((v) => v !== c.xName && !used.has(v));
      if (addable.length) h += '<select data-act="add-series"><option value="">+ Přidat křivku…</option>' + addable.map((v) => opt(v, '', varLabel(v))).join('') + '</select>';
      else if (!plotStmts.length) h += '<p class="fs-tip" style="margin-top:0">Zatím žádné vektory k vykreslení. Spusť skript.</p>';
    } else {
      ax.lines.forEach((ln, k) => {
        h += '<div class="fs-series ro" style="--c:' + esc(ln.color) + '"><div class="full"><div class="fs-ro"><code>' + esc(P.lineName(ln, k) + ': ' + (ln.xtext ? ln.xtext + ', ' : '') + ln.ytext) + (ln.side === 'right' ? '  (pravá osa)' : '') + '</code>' + lineLink(ln.line) + '</div></div></div>';
      });
      if (!ax.lines.length) h += '<p class="fs-tip" style="margin-top:0">Bez křivek.</p>';
    }
    h += '</div>';

    // zobrazení
    const L = ax.legend;
    const legLo = ed ? lastOf(g, 'legend') : null;
    const legRo = !ed || (legLo && legLo.ro);
    const loc = L ? L.location : 'northeast';
    const locOpts = LOC_OPTS.some((o) => o[0] === loc) ? LOC_OPTS : LOC_OPTS.concat([[loc, loc]]);
    const flagRo = (fn) => !ed || ((lastOf(g, fn) || {}).ro);
    h += '<div class="fs-sec"><h4>Zobrazení</h4>' +
      '<div class="fs-row">' + chk('legend', 'Legenda', !!(L && L.visible), legRo) + '</div>' +
      '<label class="fs-field"><span>Pozice</span>' + sel('legendLoc', locOpts, loc, legRo || !(L && L.visible) ? ' disabled' : '') + '</label>' +
      (legLo && legLo.ro ? roCode(legLo.st) : '') +
      '<div class="fs-row">' + chk('grid', 'Mřížka', ax.xgrid || ax.ygrid, flagRo('grid')) + chk('box', 'Rámeček', ax.box, flagRo('box')) + '</div>' +
      '<div class="fs-row">' + chk('tight', 'Těsný rozsah (axis tight)', ed ? g.stmts.some(PC.isTight) : false, !ed) + '</div></div>';

    // ostatní řádky, které panel neumí – jen pro čtení
    const others = ed ? g.stmts.filter((st) => !PC.represented(st) && !(st.call && G.PLOT_FNS.has(st.call.fn))) : [];
    const outside = c.outside || [];
    if (ed && (others.length || outside.length)) {
      h += '<div class="fs-sec"><h4>Další řádky v kódu</h4>' + others.concat(outside).map(roCode).join('') +
        '<p class="fs-tip" style="margin-top:4px">Ručně psané řádky panel jen ukazuje. Uprav je v editoru.</p></div>';
    } else if (!ed && f.stmts.length) {
      h += '<div class="fs-sec"><h4>Řádky v kódu</h4>' + f.stmts.map(roCode).join('') + '</div>';
    }

    h += exportHTML();
    return h;
  }

  function exportHTML() {
    const ui = S.data.ui;
    const { sel, input } = controls();
    return '<div class="fs-sec"><h4>Export</h4>' +
      '<div class="fs-size"><span>Rozměr</span>' + input('exportW', ui.exportW, '900', 'number', ' min="200" step="10"') + '<span>×</span>' + input('exportH', ui.exportH, '560', 'number', ' min="150" step="10"') + '<span>px</span></div>' +
      '<label class="fs-field"><span>PNG</span>' + sel('exportScale', [['1', '1× rozlišení'], ['2', '2× (ostré, doporučeno)'], ['3', '3× (pro tisk)']], String(ui.exportScale)) + '</label>' +
      '<div class="fs-btns"><button class="btn" data-act="png">Stáhnout PNG</button><button class="btn" data-act="svg">Stáhnout SVG</button></div>' +
      '<p class="fs-tip">Obrázek je vždy ve světlé variantě (i v tmavém režimu). Popisky jsou v TeXu jako v MATLABu: <code>^{24}Na</code>, <code>P_z</code>, <code>\\sigma</code>, <code>20 ^\\circC</code>. Podtržítko jako znak: <code>\\_</code>.</p></div>';
  }

  /* ---------- vykreslení panelu bez ztráty fokusu ---------- */
  // Když se struktura panelu nezměnila, jen se přepíšou hodnoty a atributy existujících prvků –
  // pole s kurzorem, rozbalený výběr ani klik do zaškrtávátka se tím nepřeruší.
  function sameShape(a, b) {
    if (a.nodeType !== b.nodeType) return false;
    if (a.nodeType !== 1) return true;
    if (a.tagName !== b.tagName || a.getAttribute('data-k') !== b.getAttribute('data-k') || a.getAttribute('data-s') !== b.getAttribute('data-s') ||
      a.getAttribute('type') !== b.getAttribute('type') || a.childNodes.length !== b.childNodes.length) return false;
    for (let i = 0; i < a.childNodes.length; i++) if (!sameShape(a.childNodes[i], b.childNodes[i])) return false;
    return true;
  }
  function patch(a, b) {
    if (a.nodeType === 3 || a.nodeType === 8) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
    if (a.nodeType !== 1) return;
    Array.from(a.attributes).forEach((at) => { if (!b.hasAttribute(at.name)) a.removeAttribute(at.name); });
    Array.from(b.attributes).forEach((at) => { if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value); });
    for (let i = 0; i < a.childNodes.length; i++) patch(a.childNodes[i], b.childNodes[i]);
    if (a.tagName === 'INPUT') {
      if (a.type === 'checkbox') a.checked = b.hasAttribute('checked');
      else if (a !== document.activeElement) a.value = b.getAttribute('value') || '';
      a.disabled = b.hasAttribute('disabled');
    } else if (a.tagName === 'SELECT') {
      const o = Array.from(b.options).find((x) => x.hasAttribute('selected')) || b.options[0];
      if (o && a.value !== o.value) a.value = o.value;
      a.disabled = b.hasAttribute('disabled');
    } else if (a.tagName === 'OPTION') a.selected = b.hasAttribute('selected');
  }

  function renderMenu() {
    if (!M.open) return;
    const box = $('#fsBody');
    const scroller = $('#figSettings');
    const c = menuCtx();
    const html = c.fig ? settingsHTML(c)
      : '<div class="fs-sec"><h4>Graf</h4><p class="fs-tip" style="margin-top:0">Žádný graf. Pravým klikem na proměnnou ve Workspace ho vytvoříš – do skriptu se zapíše blok <code>%% Grafy</code>.</p>' +
        '<div class="fs-btns"><button class="btn" data-act="new-fig">Nový graf</button></div></div>' + exportHTML();
    const tpl = document.createElement('div');
    tpl.innerHTML = html;
    if (box.childNodes.length && box.childNodes.length === tpl.childNodes.length && Array.from(box.childNodes).every((n, i) => sameShape(n, tpl.childNodes[i]))) {
      box.childNodes.forEach((n, i) => patch(n, tpl.childNodes[i]));
      return;
    }
    // jiná struktura (přibyla křivka, pravá osa…) – nový obsah, fokus zůstane na stejném poli
    const active = document.activeElement;
    let focus = null;
    if (active && box.contains(active) && active.dataset.k) {
      const sEl = active.closest('[data-s]');
      focus = { k: active.dataset.k, s: sEl ? sEl.dataset.s : null, a: active.selectionStart, b: active.selectionEnd, v: isTextInput(active) ? active.value : null };
    }
    const scroll = scroller.scrollTop;
    box.innerHTML = html;
    scroller.scrollTop = scroll;
    if (focus) {
      const q = (focus.s ? '[data-s="' + focus.s + '"] ' : '') + '[data-k="' + focus.k + '"]';
      const elx = $(q, box);
      if (elx && !elx.disabled) {
        if (focus.v !== null && isTextInput(elx)) elx.value = focus.v;
        elx.focus();
        try { if (focus.a !== null && focus.a !== undefined) elx.setSelectionRange(focus.a, focus.b); } catch (e) { /* select, number */ }
      } else focusMenu();
    }
  }

  /* ---------- změny v menu ---------- */
  const numTxt = (v) => String(v).trim().replace(',', '.');
  const NUM_OK = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;
  // mez rozsahu: prázdné = automaticky, Inf / -Inf = automaticky z té strany
  function parseLim(v) {
    const t = numTxt(v);
    if (t === '') return { auto: true };
    if (/^[-+]?inf$/i.test(t)) return { inf: t[0] === '-' ? -1 : 1 };
    return NUM_OK.test(t) ? { n: Number(t) } : { bad: true };
  }
  function setFieldError(key, msg) {
    if (msg) M.fieldBad[key] = msg; else delete M.fieldBad[key];
  }

  // Textové pole se promítne do návrhu (Enter, opuštění pole). Neplatná hodnota jen zčervená.
  function applyField(t) {
    if (!M.open || !t || !t.dataset.k || !$('#figSettings').contains(t)) return;
    const k = t.dataset.k;
    const sEl = t.closest('[data-s]');
    const sLine = sEl ? +sEl.dataset.s : null;
    // export – nastavení aplikace, ne graf
    if (k === 'exportW' || k === 'exportH') {
      const n = Number(numTxt(t.value));
      const min = k === 'exportW' ? 200 : 150;
      const bad = !(Number.isFinite(n) && n >= min && n <= 10000) ? 'Rozměr v pixelech, ' + min + ' až 10000' : '';
      setFieldError(k, bad);
      if (bad) M.raw[k] = t.value; else { delete M.raw[k]; S.data.ui[k] = Math.round(n); save(); }
      renderMenu();
      renderBar();
      return;
    }
    const c = menuCtx();
    if (!c.fig || !c.editable) return;
    const fig = c.fig;
    const box = t.closest('[data-range]');
    if (box) {
      // rozsah: obě meze najednou
      const key = box.dataset.range;
      const side = key === 'y2lim' ? 'right' : key === 'ylim' ? 'left' : null;
      const fn = key === 'xlim' ? 'xlim' : 'ylim';
      const P = key === 'y2lim' ? fig.ax.right : fig.ax;
      const log = (fn === 'xlim' ? P.xscale : P.yscale) === 'log';
      const ins = [0, 1].map((i) => $('[data-k="' + key + ':' + i + '"]', box));
      const vals = ins.map((x) => x.value);
      const p = vals.map(parseLim);
      const err = ['', ''];
      p.forEach((x, i) => {
        if (x.bad) err[i] = 'Rozsah musí být číslo (prázdné = automaticky)';
        else if (x.inf && (i === 0 ? x.inf > 0 : x.inf < 0)) err[i] = i === 0 ? 'Dolní mez nemůže být +Inf' : 'Horní mez nemůže být -Inf';
        else if (log && x.n !== undefined && !(x.n > 0)) err[i] = 'Na logaritmické ose musí být mez kladná (> 0)';
      });
      if (!err[0] && !err[1] && p[0].n !== undefined && p[1].n !== undefined && !(p[0].n < p[1].n)) err[0] = err[1] = 'Dolní mez musí být menší než horní';
      const changed = ins.some((x) => x.value !== x.defaultValue);
      ins.forEach((x, i) => {
        const fk = key + ':' + i;
        setFieldError(fk, err[i]);
        if (err[i]) M.raw[fk] = x.value; else delete M.raw[fk];
      });
      if (err[0] || err[1] || !changed) { renderMenu(); renderBar(); return; }
      editDraft((lines, f) => PC.setLim(lines, f, fn, vals[0], vals[1], side));
      return;
    }
    const key = fieldKey(k, sLine);
    const val = t.value;
    let bad = '';
    if (k === 'dt') { const dt = Number(numTxt(val)); if (!NUM_OK.test(numTxt(val)) || !(dt > 0)) bad = 'Perioda musí být kladné číslo, např. 0.01'; }
    if (k === 'width') { const w = Number(numTxt(val)); if (!NUM_OK.test(numTxt(val)) || !(w > 0)) bad = 'Tloušťka čáry musí být kladné číslo (např. 0.5, 1.5)'; }
    setFieldError(key, bad);
    if (bad) { M.raw[key] = val; renderMenu(); renderBar(); return; }
    delete M.raw[key];
    if (val === t.defaultValue) { renderMenu(); renderBar(); return; }   // beze změny
    if (sEl) {
      const li = +sEl.dataset.li;
      const ch = k === 'width' ? { width: numTxt(val) } : { label: val, labelIndex: li };
      editDraft((lines, f) => PC.setSeries(lines, f, sLine, ch));
      return;
    }
    if (k === 'dt') { const dt = Number(numTxt(val)); editDraft((lines, f) => PC.setTimeDt(lines, f, String(+dt.toPrecision(12)))); return; }
    if (k === 'title' || k === 'xlabel' || k === 'ylabel') { editDraft((lines, f) => PC.setText(lines, f, k, val, 'left')); return; }
    if (k === 'y2label') { editDraft((lines, f) => PC.setText(lines, f, 'ylabel', val, 'right')); return; }
  }

  // rozepsané pole s fokusem do návrhu (před zavřením, uložením…)
  function flushField() {
    const a = document.activeElement;
    if (M.open && isTextInput(a) && $('#figSettings').contains(a)) applyField(a);
  }

  // přepínače a výběry se projeví hned
  function applyControl(t) {
    const k = t.dataset.k;
    const val = t.type === 'checkbox' ? t.checked : t.value;
    if (k === 'exportScale') { S.data.ui.exportScale = Number(val) || DEFAULT_UI.exportScale; save(); return; }
    const c = menuCtx();
    if (!c.fig || !c.editable) return;
    const sEl = t.closest('[data-s]');
    if (sEl) {
      const line = +sEl.dataset.s;
      if (k === 'y') {
        const prob = lenProblem(c.xName, yLens([val]));
        if (prob) { toast(prob, true); renderMenu(); return; }
        editDraft((lines, f) => PC.setSeries(lines, f, line, { y: val }));
      } else if (k === 'color') editDraft((lines, f) => PC.setSeries(lines, f, line, { color: val }));
      else if (k === 'ls') editDraft((lines, f) => PC.setSeries(lines, f, line, { ls: val }));
      else if (k === 'marker') editDraft((lines, f) => PC.setSeries(lines, f, line, { marker: val }));
      else if (k === 'side') editDraft((lines, f) => PC.setSide(lines, f, line, val));
      return;
    }
    if (k === 'x') { if (val === '@time') chooseTime(); else if (val !== '*') setX(val || null, true); return; }
    if (k === 'xlog') { editDraft((lines, f) => PC.setScale(lines, f, 'x', val)); return; }
    if (k === 'ylog') { editDraft((lines, f) => PC.setScale(lines, f, 'y', val, 'left')); return; }
    if (k === 'y2log') { editDraft((lines, f) => PC.setScale(lines, f, 'y', val, 'right')); return; }
    if (k === 'grid' || k === 'box') { editDraft((lines, f) => PC.setFlag(lines, f, k, val)); return; }
    if (k === 'tight') { editDraft((lines, f) => PC.setTight(lines, f, val)); return; }
    if (k === 'legend') { editDraft((lines, f) => PC.setLegend(lines, f, val, null)); return; }
    if (k === 'legendLoc') { editDraft((lines, f) => PC.setLegend(lines, f, true, val)); }
  }

  // barva z výběru barev: při tažení v paletě nejvýš jedna změna na snímek
  let colorPending = null;
  function onColorInput(t) {
    const first = !colorPending;
    colorPending = t;
    if (first) requestAnimationFrame(() => { const x = colorPending; colorPending = null; if (x && x.isConnected) applyControl(x); });
  }

  function initSettings() {
    const box = $('#figSettings');
    box.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.act === 'add-series') { if (t.value) addY([t.value], true); return; }
      if (!t.dataset.k) return;
      if (isTextInput(t)) applyField(t);        // opuštění pole, šipky u čísla
      else if (t.type === 'color') onColorInput(t);
      else applyControl(t);
    });
    box.addEventListener('input', (e) => {
      const t = e.target;
      if (t.type === 'color' && t.dataset.k) onColorInput(t);
    });
    // Enter v poli = promítnout hodnotu do návrhu (do kódu zapíše až „Zapsat do kódu“ nebo ⌘S)
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && isTextInput(e.target) && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); applyField(e.target); }
    });
    box.addEventListener('click', (e) => {
      const go = e.target.closest('[data-goto]');
      if (go) { gotoLine(+go.dataset.goto); return; }
      const b = e.target.closest('[data-act]');
      if (!b || b.tagName === 'SELECT') return;
      const act = b.dataset.act;
      if (act === 'del-series') {
        const line = +b.closest('[data-s]').dataset.s;
        editDraft((lines, f) => PC.deleteStmt(lines, line, f));
      } else if (act === 'png' || act === 'svg') exportFig(act);
      else if (act === 'new-fig') { closeMenu(); addFigure(); }
    });
    $('#fsSave').addEventListener('click', () => saveMenu());
    $('#fsCancel').addEventListener('click', () => discardDraft());
    $('#fsRedraw').addEventListener('click', () => renderDraft());
    $('#fsClose').addEventListener('click', () => attemptClose());
    $('#fsLive').addEventListener('change', (e) => {
      S.data.ui.livePreview = e.target.checked;
      save();
      if (e.target.checked) renderDraft(); else renderBar();
    });
    // tlačítka Nastavení: otevřít; když je menu otevřené, zavřít (stejně jako klik mimo)
    const toggle = () => { if (M.open) attemptClose(); else openMenu(); };
    $('#btnFigSettings').addEventListener('click', toggle);
    $('#btnFigSettings2').addEventListener('click', toggle);
  }

  function figReady() {
    const div = $('#figPlot');
    if (!window.Plotly || !div.data || !activeFig()) { toast('Graf je prázdný – nejdřív přidej křivku', true); return null; }
    return div;
  }
  // export je vždy ve světlé variantě (pro protokoly), se stejným výřezem jako na obrazovce
  function exportFig(format) {
    const div = figReady();
    if (!div) return;
    const f = activeFig();
    const t = f.name || (f.ax.title ? P.texPlain(f.ax.title.text) : '');
    const name = slug(cur().name) + (t.trim() ? '_' + slug(t) : '_figure' + f.num);
    P.exportImage(div, f, S.data.ui, format, name).then(() => toast('Staženo: ' + name + '.' + format), (err) => toast('Export se nepovedl: ' + err, true));
  }

  /* =====================================================================
     Prohlížeč hodnot (dvojklik na proměnnou)
     ===================================================================== */
  function openViewer(name, v) {
    if (v === undefined) return;
    const d = E.describe(v, S.meta.funcs[name]);
    const body = el('div');
    const LIMIT = 5000;
    const math = E.math;
    if (math.isMatrix(v) || Array.isArray(v)) {
      const arr = math.isMatrix(v) ? v.toArray() : v;
      const sz = math.size(v).valueOf();
      let html = '<div class="viewer-wrap"><table class="viewer">';
      let note = '';
      if (sz.length === 1 || sz[0] === 1 || sz[1] === 1) {
        const a = math.flatten(arr);
        html += '<thead><tr><th class="ix">#</th><th>' + esc(name) + '</th></tr></thead><tbody>';
        a.slice(0, LIMIT).forEach((x, i) => { html += '<tr><td class="ix">' + (i + 1) + '</td><td>' + esc(E.fmtScalar(x, 10)) + '</td></tr>'; });
        if (a.length > LIMIT) note = 'Zobrazeno prvních ' + LIMIT + ' z ' + a.length + ' hodnot. Kopírování vezme všechny.';
      } else {
        const cols = arr[0].length;
        html += '<thead><tr><th class="ix"></th>';
        for (let j = 0; j < cols; j++) html += '<th>' + (j + 1) + '</th>';
        html += '</tr></thead><tbody>';
        arr.slice(0, Math.floor(LIMIT / Math.max(1, cols))).forEach((row, i) => {
          html += '<tr><td class="ix">' + (i + 1) + '</td>' + row.map((x) => '<td>' + esc(E.fmtScalar(x, 10)) + '</td>').join('') + '</tr>';
        });
      }
      html += '</tbody></table></div>' + (note ? '<p class="viewer-note">' + note + '</p>' : '');
      body.innerHTML = html;
    } else {
      body.innerHTML = '<pre style="margin:0;font:13px var(--code-font);white-space:pre-wrap"></pre>';
      $('pre', body).textContent = name + ' = ' + (d.kind === 'fn' ? d.preview : E.fmtScalar(v, 15));
    }
    modal({
      title: name + ' · ' + d.size,
      body,
      wide: d.kind === 'mat',
      buttons: [
        { label: 'Kopírovat pro Excel', left: true, keepOpen: true, action: () => copyText(E.toClipboardText(v, DEC), 'Hodnoty zkopírovány') },
        { label: 'Zavřít', primary: true, value: true },
      ],
    });
  }

  /* =====================================================================
     Skripty (seznam vlevo), import / export
     ===================================================================== */
  function renderScripts() {
    $('#scriptList').innerHTML = S.data.scripts.map((s) => '<li data-id="' + s.id + '" class="' + (s.id === S.data.activeId ? 'active' : '') + '" title="' + esc(s.name) + ' (dvojklik = přejmenovat)">' +
      '<span class="sc-ic">M</span><span class="sc-name">' + esc(s.name) + '</span><button class="sc-more" title="Možnosti">⋯</button></li>').join('');
    $('#editorTitle').textContent = cur().name;
    document.title = cur().name + ' – MatCalc';
  }

  function openScript(id) {
    if (id === S.data.activeId) return;
    if (M.open) { if (menuDirty()) saveMenu(); closeMenu(); }
    S.data.activeId = id;
    S.cm.swapDoc(docFor(cur()));
    decorateSections();
    S.sel.clear();
    renderScripts();
    renderTabs();
    save();
    runScript();
  }

  function uniqueName(base) {
    const names = new Set(S.data.scripts.map((s) => s.name));
    if (!names.has(base)) return base;
    let i = 2;
    while (names.has(base + ' ' + i)) i++;
    return base + ' ' + i;
  }

  function addScript(script, open) {
    script.name = uniqueName(script.name);
    S.data.scripts.push(script);
    if (open !== false) openScript(script.id); else renderScripts();
    save();
  }

  async function renameScript(s) {
    const name = await promptText('Přejmenovat skript', 'Nový název:', s.name);
    if (name && name.trim()) { s.name = name.trim(); renderScripts(); save(); }
  }

  async function deleteScript(s) {
    if (S.data.scripts.length === 1) { toast('Poslední skript nejde smazat', true); return; }
    const ok = await confirmBox('Smazat skript', 'Opravdu smazat „' + s.name + '“? Tohle nejde vrátit (pokud nemáš zálohu nebo .m soubor).', 'Smazat');
    if (!ok) return;
    const i = S.data.scripts.indexOf(s);
    S.data.scripts.splice(i, 1);
    delete S.docs[s.id];
    if (S.data.activeId === s.id) {
      S.data.activeId = null;
      openScript(S.data.scripts[Math.max(0, i - 1)].id);
    } else renderScripts();
    save();
  }

  function scriptMenu(s, x, y) {
    showMenu(x, y, s.name, [
      { label: 'Přejmenovat', action: () => renameScript(s) },
      { label: 'Duplikovat', action: () => addScript(makeScript(s.name + ' (kopie)', s.code)) },
      { label: 'Stáhnout jako .m', action: () => exportM(s) },
      { sep: true },
      { label: 'Smazat', danger: true, disabled: S.data.scripts.length === 1, action: () => deleteScript(s) },
    ]);
  }

  function initScripts() {
    const list = $('#scriptList');
    list.addEventListener('click', (e) => {
      const li = e.target.closest('li');
      if (!li) return;
      const s = S.data.scripts.find((x) => x.id === li.dataset.id);
      if (e.target.closest('.sc-more')) {
        const r = e.target.getBoundingClientRect();
        scriptMenu(s, r.left, r.bottom + 2);
        return;
      }
      openScript(s.id);
    });
    list.addEventListener('dblclick', (e) => {
      const li = e.target.closest('li');
      if (li && !e.target.closest('.sc-more')) renameScript(S.data.scripts.find((x) => x.id === li.dataset.id));
    });
    list.addEventListener('contextmenu', (e) => {
      const li = e.target.closest('li');
      if (!li) return;
      e.preventDefault();
      scriptMenu(S.data.scripts.find((x) => x.id === li.dataset.id), e.clientX, e.clientY);
    });
    const newScript = () => {
      addScript(makeScript(uniqueName('Skript ' + (S.data.scripts.length + 1)), MC.newScriptTemplate));
      S.cm.focus();
      S.cm.setCursor(S.cm.lineCount(), 0);
    };
    $('#btnNew').addEventListener('click', newScript);
    $('#btnNew2').addEventListener('click', newScript);
  }

  /* ---------- soubory ---------- */
  const FIG_MARK = '% MATCALC-FIGURES ';   // starý formát (grafy jako JSON) – jen pro načtení
  function download(filename, text, type) {
    const blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  function exportM(s) {
    const text = s.code.replace(/\s+$/, '') + '\n';
    download(slug(s.name) + '.m', text);
    toast('Staženo: ' + slug(s.name) + '.m');
  }

  function parseMFile(name, text) {
    let figures = null;
    let activeIdx = 0;
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const idx = lines.findIndex((l) => l.startsWith(FIG_MARK));
    if (idx >= 0) {
      try {
        const o = JSON.parse(lines[idx].slice(FIG_MARK.length));
        if (o && Array.isArray(o.figures)) { figures = o.figures; activeIdx = o.activeFig || 0; }
      } catch (e) { /* poškozený blok – ignorovat */ }
      lines.splice(idx, 1);
      if (idx > 0 && /^% ---- MatCalc/.test(lines[idx - 1])) lines.splice(idx - 1, 1);
    }
    let code = lines.join('\n').replace(/\s+$/, '') + '\n';
    if (figures) code = migrateFigures(code, figures);
    return makeScript(name.replace(/\.(m|txt)$/i, '').replace(/_/g, ' '), code, activeIdx + 1);
  }

  function importBackup(text) {
    const o = JSON.parse(text);
    const list = Array.isArray(o) ? o : o && Array.isArray(o.scripts) ? o.scripts : null;
    if (!list) throw new Error('Soubor neobsahuje skripty MatCalc');
    let n = 0;
    let firstId = null;
    list.forEach((s) => {
      if (!s || typeof s.code !== 'string') return;
      const sc = makeScript(s.name || 'Skript', s.figures ? migrateFigures(s.code, s.figures) : s.code, s.activeFigNum);
      sc.name = uniqueName(sc.name);
      S.data.scripts.push(sc);
      if (!firstId) firstId = sc.id;
      n++;
    });
    if (firstId) openScript(firstId);
    renderScripts();
    save();
    toast('Načteno ' + plural(n, 'skript', 'skripty', 'skriptů'));
  }

  function initFiles() {
    const input = $('#fileInput');
    const openPicker = () => { input.value = ''; input.click(); };
    $('#btnOpen').addEventListener('click', openPicker);
    $('#btnRestore').addEventListener('click', openPicker);
    input.addEventListener('change', () => {
      Array.from(input.files || []).forEach((file) => {
        const r = new FileReader();
        r.onload = () => {
          try {
            const text = String(r.result);
            if (/\.json$/i.test(file.name)) importBackup(text);
            else { addScript(parseMFile(file.name, text)); toast('Otevřeno: ' + file.name); }
          } catch (e) { toast('Soubor se nepodařilo načíst: ' + e.message, true); }
        };
        r.readAsText(file);
      });
    });
    $('#btnSaveM').addEventListener('click', () => exportM(cur()));
    $('#btnBackup').addEventListener('click', () => {
      const d = new Date().toISOString().slice(0, 10);
      download('matcalc-zaloha-' + d + '.json', JSON.stringify({ app: 'MatCalc', version: 2, saved: new Date().toISOString(), scripts: S.data.scripts }, null, 1), 'application/json');
      toast('Záloha stažena');
    });
    // přetažení souboru do okna
    document.addEventListener('dragover', (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault(); });
    document.addEventListener('drop', (e) => {
      if (!e.dataTransfer || !e.dataTransfer.files.length) return;
      e.preventDefault();
      // do otevřeného okna Data jde soubor jako data, jinak jako skript
      if (MC.dataView.isOpen()) { MC.dataView.importFiles(Array.from(e.dataTransfer.files)); return; }
      const dt = new DataTransfer();
      Array.from(e.dataTransfer.files).forEach((f) => dt.items.add(f));
      input.files = dt.files;
      input.dispatchEvent(new Event('change'));
    });
  }

  /* =====================================================================
     Data (import .txt) – okno je v dataview.js, tady napojení na běh
     ===================================================================== */
  let dataTimer = null;
  function initData() {
    MC.dataView.init({
      toast, confirmBox, promptText,
      // změna datových proměnných: znovu spustit skript, ať je Workspace aktuální
      onChange: () => {
        clearTimeout(dataTimer);
        dataTimer = setTimeout(() => { if (!menuDirty()) runScript({ auto: true }); else { renderWorkspace(); renderMenu(); } }, 120);
      },
      onClose: () => { S.cm.refresh(); },
    });
    $('#btnDataImport').addEventListener('click', () => MC.dataView.pickFiles());
    $('#btnData').addEventListener('click', () => MC.dataView.open());
  }

  /* =====================================================================
     Nápověda
     ===================================================================== */
  function showHelp() {
    const c = (s) => '<code>' + esc(s) + '</code>';
    const row = (a, b) => '<tr><td>' + a + '</td><td>' + b + '</td></tr>';
    const fns = ['sin cos tan', 'asin acos atan atan2', 'sind cosd tand', 'asind acosd atand', 'exp log log10 log2', 'sqrt abs sign', 'round(x, n) floor ceil fix', 'mod(a, b)', 'sum prod cumsum diff', 'mean median std variance', 'min max sort', 'rms trapz interp1', 'polyfit polyval', 'linspace logspace', 'zeros ones eye', 'length numel size', 'dot cross det inv', 'real imag angle conj', 'deg2rad rad2deg', 'hypot factorial', 'isnan rmmissing', 'load'];
    const html = '<div class="help">' +
      '<h4>Základy</h4><table>' +
      row(c('a = 5'), 'definice proměnné, bez středníku se vypíše výsledek') +
      row(c('b = a * 2;'), 'středník na konci výpis potlačí') +
      row(c('% komentář'), 'komentář (funguje i ' + c('#') + '), blokový ' + c('%{ … %}')) +
      row(c('%% Název sekce'), 'začátek sekce – tučný nadpis s čarou. ' + '<kbd>⌥</kbd> <kbd>↵</kbd> spustí jen sekci s kurzorem') +
      row(c('x = 1 + ...'), 'pokračování na dalším řádku') +
      row(c('a = 1; b = 2'), 'víc příkazů na jednom řádku') +
      row(c('A_sat / 1e6'), 'výraz bez přiřazení se uloží do ' + c('ans')) +
      row(c("'text'") + ' / ' + c('"text"'), 'text; ' + c("'it''s'") + ' = apostrof uvnitř. Zpětné lomítko se nepřekládá (jako v MATLABu)') +
      row(c('pi  e  i  Inf  NaN'), 'konstanty') +
      '</table>' +
      '<h4>Vektory a matice</h4><table>' +
      row(c('t = 0:0.5:10'), 'rozsah od:krok:do (včetně konce)') +
      row(c('x = linspace(0, 10, 50)'), '50 rovnoměrných bodů') +
      row(c('v = [1 2 3]'), 'řádkový vektor (mezery nebo čárky)') +
      row(c('A = [1 2; 3 4]'), 'matice, středník odděluje řádky') +
      row(c('v(2)   v(end)   v(2:end)'), 'indexování od 1, jako v MATLABu') +
      row(c('.*   ./   .^'), 'prvkové operace. ' + c('x.^2') + ' umocní každý prvek, ' + c('x^2') + ' u vektoru hodí chybu') +
      row(c('sin(x)  exp(-x)'), 'funkce na vektoru fungují prvek po prvku') +
      '</table>' +
      '<h4>Vlastní funkce</h4><table>' +
      row(c('f(x) = x.^2 + 1'), 'definice funkce, pak ' + c('f(3)') + ' nebo ' + c('f(t)')) +
      row(c('g(a, b) = sqrt(a^2 + b^2)'), 'víc parametrů') +
      '</table>' +
      '<h4>Jednotky</h4><table>' +
      row(c('U = 22 kV'), 'číslo s jednotkou. Jednotky se násobí a krátí samy') +
      row(c('P = sqrt(3)*U*I to MW'), 'převod do jiné jednotky') +
      row(c('I = linspace(0 A, 300 A, 31)'), 'vektor s jednotkou. Do grafu jdou čísla v jednotce největší hodnoty – jednotku napiš do popisku osy') +
      row('Pozor', 'když máš proměnnou se stejným názvem jako jednotka (' + c('A') + ', ' + c('m') + ', ' + c('s') + ', ' + c('N') + '…), má přednost proměnná') +
      '</table>' +
      '<h4>Výpis a příkazy</h4><table>' +
      row(c('disp(x)'), 'vypíše hodnotu bez názvu') +
      row(c('fprintf("P = %.2f kW\\n", P)'), 'formátovaný výpis (%d %f %e %g %s)') +
      row(c('format long') + ' / ' + c('format short'), '15 / 5 platných číslic') +
      row(c('clc') + ' / ' + c('clear') + ' / ' + c('clear a b'), 'vyčistit okno / smazat proměnné') +
      '</table>' +
      '<h4>Funkce</h4><p class="fnlist">' + fns.map((f) => c(f)).join(' ') + '</p>' +
      '<p class="muted">Výpočty počítá knihovna math.js, takže fungují i další její funkce. Cykly for/if zatím nejsou.</p>' +
      '<h4>Grafy</h4><p>Grafy se píšou příkazy z MATLABu. Hodnoty se do grafu vezmou ve chvíli volání ' + c('plot') + ', stejně jako v MATLABu.</p><table>' +
      row(c('figure') + ' / ' + c('figure(2)'), 'nový graf (záložka) / přepnout na graf 2. ' + c("figure('Name', 'Ztráty')") + ' pojmenuje záložku') +
      row(c('plot(t, A)') + '  ' + c('plot(A)'), 'křivka; bez x se kreslí proti indexu 1…n') +
      row(c("plot(t, A, 'r--o', 'LineWidth', 2)"), 'styl: barva ' + c('r g b c m y k') + ', čára ' + c('- -- : -.') + ', body ' + c('o s d ^ v x + * .')) +
      row(c("'Color', '#D95319'") + '  ' + c("'DisplayName', 'A(t)'"), 'další volby: ' + c('MarkerSize') + ', ' + c('MarkerFaceColor') + ', ' + c('LineStyle') + ', ' + c('Marker')) +
      row(c('hold on') + ' / ' + c('hold off'), 'další ' + c('plot') + ' přidá křivku / nahradí graf') +
      row(c('semilogx  semilogy  loglog'), 'logaritmické osy') +
      row(c("title('Aktivita ^{24}Na')"), 'titulek; ' + c('xlabel') + ', ' + c('ylabel') + ' stejně. TeX: ' + c('^{…}') + ' ' + c('_{…}') + ' ' + c('\\sigma') + ' ' + c('^\\circC') + ' ' + c('\\bf')) +
      row(c("legend('A', 'B', 'Location', 'northwest')"), 'legenda; ' + c('legend show') + ', ' + c('legend off') + ', ' + c('legend boxoff')) +
      row(c('grid on') + '  ' + c('grid minor') + '  ' + c('box off'), 'mřížka, rámeček') +
      row(c('xlim([0 10])') + '  ' + c('ylim([0 Inf])'), 'rozsah os (Inf = automaticky)') +
      row(c('axis tight') + '  ' + c('axis([0 10 0 1])'), 'těsný / zadaný rozsah') +
      row(c("set(gca, 'XScale', 'log', 'FontSize', 12)"), 'vlastnosti os: ' + c('XScale YScale XLim YLim XGrid YGrid Box FontSize XDir XTick') + '…') +
      row(c('yyaxis right') + ' / ' + c('yyaxis left'), 'vedlejší osa Y vpravo. Další ' + c('plot') + ', ' + c('ylabel') + ', ' + c('ylim') + ' a ' + c("set(gca, 'YScale', …)") + ' patří aktivní straně, jako v MATLABu') +
      row(c('close all') + '  ' + c('clf'), 'zavřít grafy / vyčistit graf') +
      '</table><p>Neznámé volby jen vypíšou varování, výpočet pokračuje.</p>' +
      '<p><b>Klikání píše kód.</b> Pravý klik na proměnnou ve Workspace (<b>Nastavit jako osu X</b> / <b>Přidat na osu Y</b>) zapíše řádky do bloku <code>%% Grafy</code> na konci skriptu hned. ' +
      'Menu <b>Nastavení</b> grafu (tlačítko v liště nebo vpravo nad grafem) pracuje s kopií: změny se nejdřív jen ukážou – graf se překreslí a v editoru jsou budoucí řádky zeleně. ' +
      'Text v poli (popisky, rozsahy, perioda…) se projeví po <kbd>Enter</kbd> nebo opuštění pole, přepínače a výběry hned. Neplatná hodnota zčervená a graf zůstane na poslední platné verzi. ' +
      'S vypnutým <b>Živým náhledem</b> se graf překreslí až zeleným tlačítkem <b>Překreslit</b>. Do kódu změny zapíše <b>Zapsat do kódu</b> nebo <kbd>⌘</kbd> <kbd>S</kbd>; <b>Zrušit</b> vrátí graf do stavu před otevřením menu. ' +
      'Menu zavřeš klikem kamkoliv mimo něj nebo <kbd>Esc</kbd>; s neuloženými změnami se zeptá (Uložit / Zahodit / Pokračovat v úpravách). Ten klik nic jiného neudělá. ' +
      'U každé křivky jde zvolit levou nebo pravou (vedlejší) osu Y – v kódu je to ' + c('yyaxis right') + '. ' +
      'Ručně psané složitější řádky (výrazy, ' + c('sprintf') + ', víc příkazů na řádku) panel jen ukáže – ty uprav v editoru. Grafy mimo blok %% Grafy jsou v panelu jen pro čtení. ' +
      'Export: PNG, SVG, nebo obrázek či data do schránky – obrázek je vždy světlý, i v tmavém režimu. ' +
      'Zoom: táhni myší (jen dočasný pohled, do kódu se nezapisuje). Dvojklik nebo domeček v liště grafu vrátí rozsah z kódu (' + c('xlim') + ' / ' + c('ylim') + '); se samotným ' + c('xlim') + ' se osa Y přizpůsobí datům v tomto rozsahu.</p>' +
      '<h4>Data ze souborů</h4><table>' +
      row('<b>Importovat</b> / <b>Data</b>', 'textový soubor s čísly (.txt, .csv, .dat). V okně Data nastavíš oddělovač (mezera, ' + c(';') + ', ' + c(',') + ', ' + c('---') + ', ' + c('\\t') + ' = tabulátor…), desetinnou tečku/čárku, přeskočené řádky, hlavičku a transpozici') +
      row('klik na záhlaví sloupce', 'pojmenuje sloupec – celý sloupec je pak v kódu vektor (ve Workspace s 📊). Nečíselné a prázdné hodnoty jsou NaN') +
      row(c('M = load("mereni.txt")'), 'celá matice ze souboru nahraného v okně Data (stejné volby jako v okně)') +
      row(c('prutok = prutok * 2'), 'přiřazení do datové proměnné ji zastíní jen pro daný běh – uložená data zůstanou. ' + c('clear') + ' datové proměnné nesmaže') +
      row('graf', 'datové proměnné jdou na osy jako jiné vektory. Osa X může být i <b>čas z periody vzorkování</b> (Nastavení → Osa X), zapíše se ' + c('t = (0:numel(y)-1)*0.01;')) +
      '</table><p class="muted">Data se ukládají v prohlížeči (IndexedDB) a fungují i offline. Přejmenovat a smazat je jde v okně Data nebo pravým klikem ve Workspace.</p>' +
      '<h4>Klávesy</h4><table>' +
      row('<kbd>⌘</kbd> <kbd>↵</kbd> / <kbd>Ctrl</kbd> <kbd>↵</kbd> / <kbd>F5</kbd>', 'spustit celý skript') +
      row('<kbd>⌥</kbd> <kbd>↵</kbd>', 'spustit sekci s kurzorem (od %% po další %%, ve stávajícím workspace)') +
      row('<kbd>F9</kbd> / <kbd>⇧</kbd> <kbd>⌘</kbd> <kbd>↵</kbd>', 'spustit označený text nebo aktuální řádek (ve stávajícím workspace)') +
      row('<kbd>⌘</kbd> <kbd>/</kbd>', 'zakomentovat / odkomentovat řádky') +
      row('našeptávač', 'nabízí se sám po 2 písmenech (proměnné i funkce), <kbd>Ctrl</kbd> <kbd>Space</kbd> ručně. <kbd>↵</kbd> / <kbd>Tab</kbd> vybere, u šablony jako ' + c('linspace(od, do, n)') + ' skáče <kbd>Tab</kbd> na další místo k vyplnění') +
      row('<kbd>↑</kbd> <kbd>↓</kbd> v Command Window', 'historie příkazů (tlačítko Vyčistit ji nechá, smaže proměnné a výpis)') +
      row('<kbd>Esc</kbd>', 'zavře menu nastavení grafu') +
      '</table>' +
      '<h4>Ukládání</h4><p>Skripty se ukládají <b>automaticky v tomto prohlížeči</b>. Grafy jsou součástí kódu, takže soubor .m jde rovnou spustit v MATLABu. ' +
      'Do souboru: <b>Uložit .m</b> nebo <b>Záloha všeho</b> (.json). ' +
      'Soubory .m a .json otevřeš tlačítkem Otevřít nebo přetažením do okna.</p>' +
      '</div>';
    modal({ title: 'Nápověda – MatCalc', body: html, wide: true });
  }

  /* =====================================================================
     Start
     ===================================================================== */
  /* =====================================================================
     Světlý / tmavý režim
     ---------------------------------------------------------------------
     Volba se pamatuje (localStorage 'matcalc:theme'); bez volby se řídí
     nastavením systému a mění se s ním. data-theme na <html> nastaví
     už skript v hlavičce index.html, aby stránka při načtení neblikla.
     ===================================================================== */
  const THEME_KEY = 'matcalc:theme';
  const sysDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  let themeMem = null;     // volba, když prohlížeč nepovolí úložiště
  function storedTheme() {
    try { const t = localStorage.getItem(THEME_KEY); if (t === 'dark' || t === 'light') return t; } catch (e) { /* úložiště blokované */ }
    return themeMem;
  }
  function applyTheme() {
    const t = storedTheme() || (sysDark && sysDark.matches ? 'dark' : 'light');
    S.theme = t;
    document.documentElement.dataset.theme = t;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#16181b' : '#eef1f4');
    const b = $('#btnTheme');
    if (b) {
      b.classList.toggle('on', t === 'dark');
      b.setAttribute('aria-pressed', String(t === 'dark'));
      b.title = (t === 'dark' ? 'Tmavý režim je zapnutý – kliknutím přepneš na světlý' : 'Světlý režim – kliknutím přepneš na tmavý') +
        (storedTheme() ? '' : ' (teď podle nastavení systému)');
    }
  }
  function toggleTheme() {
    const next = S.theme === 'dark' ? 'light' : 'dark';
    themeMem = next;
    try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* bez úložiště jen pro tuto relaci */ }
    applyTheme();
    renderFigure();
  }
  if (sysDark) {
    const onSys = () => { if (!storedTheme()) { applyTheme(); renderFigure(); } };
    if (sysDark.addEventListener) sysDark.addEventListener('change', onSys); else if (sysDark.addListener) sysDark.addListener(onSys);
  }

  /* ---------- kontrola verze souborů ----------
     Prohlížeč (nebo neúplné nahrání na GitHub) může vzít některý soubor ze starší verze –
     pak třeba js/graphics.js nezná yyaxis. Radši to říct hned než divnou chybou při kreslení. */
  function staleFiles() {
    const bad = [];
    if (!G.FUNCS || !G.FUNCS.has('yyaxis')) bad.push('js/graphics.js');
    if (!P.resetView) bad.push('js/plot.js');
    if (!PC.setSide || !PC.sideMap) bad.push('js/plotcode.js');
    if (!$('#fsLive') || !$('#btnTheme')) bad.push('index.html');
    if (!getComputedStyle(document.documentElement).getPropertyValue('--accent-fill').trim()) bad.push('css/style.css');
    return bad;
  }
  function checkVersion() {
    const bad = staleFiles();
    if (!bad.length) { try { sessionStorage.removeItem('matcalc:reloaded'); } catch (e) { /* bez úložiště */ } return true; }
    // nainstalovaná aplikace: jednou sama smaže mezipaměť a načte se znovu
    let tried = false;
    try { tried = sessionStorage.getItem('matcalc:reloaded') === '1'; } catch (e) { tried = true; }
    if (!tried && window.caches && navigator.serviceWorker && navigator.serviceWorker.controller) {
      try { sessionStorage.setItem('matcalc:reloaded', '1'); } catch (e) { /* bez úložiště */ }
      caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('matcalc-')).map((k) => caches.delete(k))))
        .then(() => navigator.serviceWorker.getRegistration()).then((r) => (r ? r.update() : null))
        .catch(() => null).then(() => location.reload());
      return false;
    }
    const msg = 'Prohlížeč načetl starou verzi souboru ' + bad.join(', ') + ' (z mezipaměti). Některé funkce (vedlejší osa, reset os…) proto nebudou fungovat. ' +
      'Obnov stránku bez mezipaměti: Safari ⌥⌘R, Chrome ⇧⌘R. Na GitHubu zkontroluj, že jsou nahrané všechny soubory.';
    const d = el('div', 'out-row');
    d.innerHTML = '<div class="out-main out-err"></div>';
    $('.out-main', d).textContent = msg;
    $('#cmdOut').appendChild(d);
    toast('Načetla se stará verze ' + bad.join(', ') + ' – obnov stránku (⌥⌘R / ⇧⌘R)', true);
    return true;
  }

  function init() {
    S.data = loadData();
    save();
    applyTheme();
    E.setPrecision(S.data.ui.format);
    applyLayout();
    initMenuDismiss();      // jako první: klik mimo menu grafu nesmí dojít k ostatním posluchačům
    initGutters();
    initEditor();
    initCommandWindow();
    initWorkspace();
    initTabs();
    initSettings();
    initScripts();
    initFiles();
    initData();

    $('#selFormat').value = S.data.ui.format;
    $('#selFormat').addEventListener('change', (e) => { S.data.ui.format = e.target.value; save(); E.setPrecision(e.target.value); renderWorkspace(); });
    $('#chkAuto').checked = !!S.data.ui.auto;
    $('#chkAuto').addEventListener('change', (e) => { S.data.ui.auto = e.target.checked; save(); if (e.target.checked) runScript({ auto: true }); });
    $('#btnRun').addEventListener('click', () => { if (!commitDraft()) runScript(); });
    $('#btnRunSel').addEventListener('click', () => runSelection());
    $('#btnRunSec').addEventListener('click', () => runSection());
    const clearWs = () => { S.scope = freshScope(); S.meta = { funcs: {} }; S.sel.clear(); renderWorkspace(); renderMenu(); setStatus('Workspace vyčištěn'); };
    // Vyčistit nahoře = clear + clc (historie příkazů ↑ ↓ zůstává); guma ve Workspace = jen clear
    $('#btnClear').addEventListener('click', () => { clearWs(); $('#cmdOut').innerHTML = ''; setStatus('Workspace i Command Window vyčištěny'); });
    $('#btnClear2').addEventListener('click', clearWs);
    $('#btnTheme').addEventListener('click', toggleTheme);
    $('#btnNewFig').addEventListener('click', addFigure);
    $('#btnHelp').addEventListener('click', showHelp);
    $('#btnPng').addEventListener('click', () => exportFig('png'));
    $('#btnSvg').addEventListener('click', () => exportFig('svg'));
    $('#btnCopyImg').addEventListener('click', () => {
      const div = figReady();
      if (!div) return;
      if (!navigator.clipboard || !window.ClipboardItem) { toast('Kopírování obrázků tento prohlížeč neumí – použij PNG', true); return; }
      P.copyImage(div, activeFig(), S.data.ui).then(() => toast('Graf zkopírován jako obrázek'), (e) => toast('Kopírování se nepovedlo: ' + (e && e.message ? e.message : e), true));
    });
    $('#btnCopyData').addEventListener('click', () => {
      const t = P.tableText(activeFig(), DEC);
      if (!t) { toast('Graf je prázdný', true); return; }
      copyText(t, 'Data grafu zkopírována (sloupce X, Y…)');
    });

    document.addEventListener('keydown', (e) => {
      if (e.defaultPrevented) return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === 'F5' || (mod && e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); if (!commitDraft()) runScript(); }
      else if (e.key === 'F9' || (mod && e.shiftKey && e.key === 'Enter')) { e.preventDefault(); runSelection(); }
      else if (e.altKey && e.key === 'Enter') { e.preventDefault(); runSection(); }
      else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (M.open && menuDirty()) { if (saveMenu()) toast('Změny grafu zapsány do kódu'); return; }
        save(true);
        toast('Uloženo v prohlížeči. Do souboru: Uložit .m');
      }
    });

    renderScripts();
    renderTabs();
    const out = $('#cmdOut');
    out.appendChild(el('div', 'out-info', 'MatCalc – lehké výpočty ve stylu MATLABu. Nápověda je vpravo nahoře.'));
    if (!checkVersion()) return;
    // první běh až po načtení datových proměnných (IndexedDB je asynchronní)
    DATA.ready.then(() => {
      if (!DATA.persistent) out.appendChild(el('div', 'out-info', 'Data z okna Data se v tomto prohlížeči neukládají trvale (' + esc(DATA.failReason || 'IndexedDB nedostupná') + ').'));
      runScript();
      S.cm.focus();
    });
  }

  init();
})();
