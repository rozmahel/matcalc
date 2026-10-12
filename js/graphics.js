/* =====================================================================
   MatCalc – grafické příkazy z MATLABu
   ---------------------------------------------------------------------
   figure, hold, plot / semilogx / semilogy / loglog, title, xlabel,
   ylabel, legend, grid, box, xlim, ylim, axis, set(gca|gcf, …),
   yyaxis left/right (vedlejší osa Y), close, clf, cla.

   S yyaxis mají vlastnosti osy Y dvě hodnoty (levá a pravá strana).
   Příkazy ylabel, ylim, semilogy, axis, set(gca, 'YScale', …) mění
   jen aktivní stranu – stejně jako v MATLABu.

   Příkazy jen mění stav grafů (gfx). Hodnoty se do grafu zkopírují
   ve chvíli volání plot – pozdější změna proměnné graf nezmění
   (stejně jako v MATLABu). Neznámé volby jen vypíšou varování,
   výpočet pokračuje dál.
   Soubor nesahá na DOM – vykreslení řeší plot.js.
   ===================================================================== */
(function () {
  'use strict';
  const MC = (window.MC = window.MC || {});

  // Barvy křivek – vychází z pořadí barev MATLABu, žlutá/zelená/azurová ztmavené
  // kvůli kontrastu na bílé; pořadí ověřené na rozlišitelnost i pro barvoslepé.
  const PALETTE = ['#0072BD', '#D95319', '#7E2F8E', '#B98500', '#2A9BD0', '#A2142F', '#5A9A1F'];

  // barvy z řetězce stylu ('r--o') – jako v MATLABu, zelená a žlutá trochu ztmavené kvůli čitelnosti
  const COLOR_LETTERS = { r: '#FF0000', g: '#00A000', b: '#0000FF', c: '#00BFBF', m: '#BF00BF', y: '#E6B800', k: '#000000', w: '#FFFFFF' };
  const COLOR_NAMES = { red: 'r', green: 'g', blue: 'b', cyan: 'c', magenta: 'm', yellow: 'y', black: 'k', white: 'w' };

  const FUNCS = new Set(['figure', 'hold', 'plot', 'semilogx', 'semilogy', 'loglog', 'title', 'xlabel', 'ylabel',
    'legend', 'grid', 'box', 'xlim', 'ylim', 'axis', 'set', 'close', 'clf', 'cla', 'subplot', 'yyaxis']);
  const PLOT_FNS = new Set(['plot', 'semilogx', 'semilogy', 'loglog']);

  const LEGEND_LOCATIONS = ['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest',
    'northoutside', 'southoutside', 'eastoutside', 'westoutside', 'northeastoutside', 'northwestoutside',
    'southeastoutside', 'southwestoutside', 'best', 'bestoutside', 'none'];

  const MARKERS = { o: 'o', '+': '+', '*': '*', '.': '.', x: 'x', s: 's', square: 's', d: 'd', diamond: 'd', '^': '^', v: 'v',
    '<': '<', '>': '>', p: 'p', pentagram: 'p', h: 'h', hexagram: 'h', _: '_', '|': '|', none: 'none' };
  const LINESTYLES = ['-', '--', ':', '-.', 'none'];

  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const lc = (s) => String(s).toLowerCase();

  function gerr(msg, hint) {
    const e = new Error(msg);
    if (hint) e.hint = hint;
    return e;
  }

  /* =====================================================================
     1) Rozbor příkazu (bez vyhodnocení) – používá ho i úprava kódu z panelu
     ===================================================================== */
  const OPERAND_END = /[A-Za-z0-9_)\]}.']/;

  // index párové závorky; respektuje texty '…' a "…" i vnořené závorky
  function matchParen(code, open) {
    let depth = 0;
    let inStr = null;
    for (let i = open; i < code.length; i++) {
      const c = code[i];
      if (inStr) {
        if (c === inStr) { if (code[i + 1] === inStr) { i++; continue; } inStr = null; }
        continue;
      }
      if (c === '"') { inStr = '"'; continue; }
      if (c === "'") { if (!OPERAND_END.test(code[i - 1] || '')) inStr = "'"; continue; }
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') { depth--; if (depth === 0) return i; }
    }
    return -1;
  }

  // rozdělení argumentů podle čárek na nejvyšší úrovni
  function splitArgs(s) {
    const out = [];
    let depth = 0;
    let inStr = null;
    let start = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inStr) {
        if (c === inStr) { if (s[i + 1] === inStr) { i++; continue; } inStr = null; }
        continue;
      }
      if (c === '"') { inStr = '"'; continue; }
      if (c === "'") { if (!OPERAND_END.test(s[i - 1] || '')) inStr = "'"; continue; }
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth--;
      else if (c === ',' && depth === 0) { out.push(s.slice(start, i)); start = i + 1; }
    }
    const last = s.slice(start);
    if (out.length || last.trim()) out.push(last);
    return out.map((x) => x.trim());
  }

  const NUM_RE = /^[-+]?(?:(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|Inf|inf)$/;
  const parseNum = (t) => (/inf/i.test(t) ? (t.trim()[0] === '-' ? -Infinity : Infinity) : Number(t));
  const STR_RE = /^'((?:[^']|'')*)'$|^"((?:[^"]|"")*)"$/;
  const STR_G = /'((?:[^']|'')*)'|"((?:[^"]|"")*)"/g;

  // {'a', 'b'} -> ['a', 'b'] (jen když obsahuje výhradně texty)
  function cellStrings(inner) {
    const rest = inner.replace(STR_G, '').replace(/[\s,;]/g, '');
    if (rest) return null;
    const out = [];
    let m;
    STR_G.lastIndex = 0;
    while ((m = STR_G.exec(inner))) out.push(m[1] !== undefined ? m[1].replace(/''/g, "'") : m[2].replace(/""/g, '"'));
    return out;
  }

  // Druh argumentu: str | num | vec | cellstr | ident | expr
  function classify(text) {
    const t = text.trim();
    let m;
    if ((m = t.match(STR_RE))) return { kind: 'str', text: t, value: m[1] !== undefined ? m[1].replace(/''/g, "'") : m[2].replace(/""/g, '"') };
    if (NUM_RE.test(t)) return { kind: 'num', text: t, value: parseNum(t) };
    if (/^[A-Za-z_]\w*$/.test(t)) return { kind: 'ident', text: t, value: t };
    if ((m = t.match(/^\[([^[\]'"]*)\]$/))) {
      const parts = m[1].trim().split(/[\s,]+/).filter(Boolean);
      if (parts.every((p) => NUM_RE.test(p))) return { kind: 'vec', text: t, value: parts.map(parseNum) };
    }
    if ((m = t.match(/^\{([\s\S]*)\}$/))) {
      const strs = cellStrings(m[1]);
      if (strs) return { kind: 'cellstr', text: t, value: strs };
    }
    return { kind: 'expr', text: t };
  }

  /**
   * Pozná grafický příkaz. Vrací { fn, cmd, args:[{kind,text,value}] } nebo null.
   * cmd = příkazová syntaxe (hold on, grid minor, axis tight).
   * Proměnná se stejným názvem (např. box = 3) má přednost.
   */
  function parseCall(code, scope) {
    const m = code.match(/^([A-Za-z_]\w*)(\s*)([\s\S]*)$/);
    if (!m || !FUNCS.has(m[1])) return null;
    const fn = m[1];
    if (scope && has(scope, fn)) return null;
    const rest = m[3];
    if (rest === '') return { fn, cmd: true, args: [] };
    if (rest[0] === '(') {
      const close = matchParen(rest, 0);
      if (close !== rest.length - 1) return null;
      return { fn, cmd: false, args: splitArgs(rest.slice(1, -1)).map(classify) };
    }
    if (m[2] && /^[A-Za-z0-9'"\-]/.test(rest) && !/^[A-Za-z_]\w*\s*[=(]/.test(rest) && !/^-?\d/.test(rest)) {
      const words = rest.match(/'(?:[^']|'')*'|"(?:[^"]|"")*"|\S+/g) || [];
      return {
        fn, cmd: true,
        args: words.map((w) => { const c = classify(w); return c.kind === 'str' ? c : { kind: 'str', text: w, value: w }; }),
      };
    }
    return null;
  }

  // Řetězec stylu jako 'r--o' -> { color, ls, marker } nebo null, když to styl není
  function parseSpec(s) {
    if (typeof s !== 'string' || !s || s.length > 6) return null;
    const out = {};
    let i = 0;
    while (i < s.length) {
      const two = s.slice(i, i + 2);
      const c = s[i];
      if (two === '--' || two === '-.') { if (out.ls) return null; out.ls = two; i += 2; continue; }
      if (c === '-' || c === ':') { if (out.ls) return null; out.ls = c; i++; continue; }
      if (has(COLOR_LETTERS, c)) { if (out.color) return null; out.color = c; i++; continue; }
      if ('o+*.xsd^v<>ph'.includes(c)) { if (out.marker) return null; out.marker = c; i++; continue; }
      return null;
    }
    return out;
  }

  function parseColor(v) {
    if (typeof v === 'string') {
      const t = v.trim().toLowerCase();
      if (has(COLOR_LETTERS, t)) return COLOR_LETTERS[t];
      if (has(COLOR_NAMES, t)) return COLOR_LETTERS[COLOR_NAMES[t]];
      if (/^#[0-9a-f]{6}$/.test(t)) return t.toUpperCase();
      if (/^#[0-9a-f]{3}$/.test(t)) return ('#' + t[1] + t[1] + t[2] + t[2] + t[3] + t[3]).toUpperCase();
      if (t === 'none') return 'none';
      return null;
    }
    const arr = numList(v);
    if (arr && arr.length === 3 && arr.every((x) => x >= 0 && x <= 1)) {
      return '#' + arr.map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
    }
    return null;
  }

  // číslo nebo vektor čísel z hodnoty argumentu
  function numList(v) {
    const E = MC.engine;
    if (typeof v === 'number') return [v];
    if (Array.isArray(v) && v.every((x) => typeof x === 'number')) return v;
    if (!E) return null;
    const math = E.math;
    if (math.isMatrix(v) || Array.isArray(v)) {
      const pd = E.plotData(v);
      return pd.ok ? pd.values : null;
    }
    if (math.isUnit(v)) { try { return [v.toNumber()]; } catch (e) { return null; } }
    if (math.isBigNumber(v) || math.isFraction(v)) return [math.number(v)];
    return null;
  }
  const num1 = (v) => { const a = numList(v); return a && a.length === 1 ? a[0] : null; };
  const onOff = (v) => { const t = lc(v); return t === 'on' ? true : t === 'off' ? false : null; };

  /* =====================================================================
     2) Stav grafů
     ===================================================================== */
  function newState() { return { figs: [], cur: null }; }

  // vlastnosti osy Y, které má každá strana zvlášť (yyaxis left / right)
  const Y_KEYS = ['ylabel', 'ylim', 'yscale', 'ydir', 'ycolor', 'ytick', 'yminor', 'yminortick'];
  function newSide() {
    return { ylabel: null, ylim: null, yscale: 'linear', ydir: 'normal', ycolor: null, ytick: null, yminor: false, yminortick: false };
  }

  function newAxes() {
    return {
      title: null, xlabel: null, ylabel: null,
      xscale: 'linear', yscale: 'linear',
      xlim: null, ylim: null,              // [a, b], ±Inf = automaticky z té strany
      xdir: 'normal', ydir: 'normal',
      xgrid: false, ygrid: false, xminor: false, yminor: false,
      box: false, equal: false, axisOff: false,
      legend: null,                        // { visible, location, orientation, box, fontSize, title, … }
      fontSize: null, fontName: null, lineWidth: null, xcolor: null, ycolor: null,
      xtick: null, ytick: null, xminortick: false, yminortick: false,
      lines: [],                           // křivky; ln.side = 'left' | 'right'
      touched: false,                      // osy existují (něco do nich zapsal příkaz)
      colorIdx: 0,
      yyaxis: false,                       // má vedlejší (pravou) osu Y
      side: 'left',                        // aktivní strana pro ylabel, ylim, YScale…
      right: null,                         // vlastnosti pravé osy (newSide())
    };
  }

  // objekt s vlastnostmi osy Y pro aktivní stranu (levá = přímo osy)
  const ySide = (ax) => (ax.yyaxis && ax.side === 'right' && ax.right ? ax.right : ax);

  function nextNum(gfx) {
    let n = 1;
    while (gfx.figs.some((f) => f.num === n)) n++;
    return n;
  }

  function addFig(gfx, num, line) {
    const f = { num, name: '', numberTitle: true, color: null, createLine: line, stmts: [], hold: false, ax: newAxes() };
    gfx.figs.push(f);
    gfx.figs.sort((a, b) => a.num - b.num);
    return f;
  }

  function resetFig(f, line) {
    f.hold = false;
    f.ax = newAxes();
    f.stmts = [];
    f.createLine = line;
  }

  function curFig(ctx) {
    const g = ctx.gfx;
    if (!g.cur || !g.figs.includes(g.cur)) {
      g.cur = addFig(g, nextNum(g), ctx.line);
      g.cur.implicit = true;
    }
    return g.cur;
  }

  /* =====================================================================
     3) Provedení příkazu
     ===================================================================== */
  function evalArgs(call, ctx) {
    return call.args.map((a) => {
      if (a.kind === 'str' || a.kind === 'num' || a.kind === 'vec' || a.kind === 'cellstr') return Object.assign({}, a, { v: a.value, cell: a.kind === 'cellstr' });
      if (a.kind === 'ident' && (a.text === 'gca' || a.text === 'gcf') && !has(ctx.scope, a.text)) return Object.assign({}, a, { v: { handle: a.text } });
      return Object.assign({}, a, { v: ctx.evalExpr(a.text) });
    });
  }
  const isStr = (a) => a && typeof a.v === 'string';
  const isHandle = (a) => a && a.v && typeof a.v === 'object' && a.v.handle;

  // dvojice 'Název', hodnota -> { název_malými: arg }; neznámé jen varování
  function parseNV(list, known, fn, ctx) {
    const out = {};
    for (let i = 0; i < list.length; i += 2) {
      const a = list[i];
      if (!isStr(a)) { ctx.warn(fn + ': očekávám název volby (text), dostal jsem „' + a.text + '“ – ignorováno'); continue; }
      const name = lc(a.v);
      if (i + 1 >= list.length) {
        if (fn !== 'set' && parseSpec(a.v) === null && /^[-:.ox+*sd^v<>phrgbcmykw]+$/.test(a.v)) ctx.warn(fn + ': neplatný styl čáry „' + a.v + '“ – ignorováno');
        else ctx.warn(fn + ': volba „' + a.v + '“ nemá hodnotu – ignorováno');
        continue;
      }
      if (known && !known.includes(name)) { ctx.warn(fn + ': neznámá volba „' + a.v + '“ – ignorováno'); continue; }
      out[name] = Object.assign({}, list[i + 1], { name: a.v });
    }
    return out;
  }

  // data pro plot -> { values, unit } nebo { cols:[{values,unit}], rows }
  function dataOf(a, fn) {
    const E = MC.engine;
    const math = E.math;
    let v = a.v;
    if (typeof v === 'string') throw gerr(fn + ': „' + a.text + '“ je text, ne čísla');
    if (typeof v === 'function') throw gerr(fn + ': „' + a.text + '“ je funkce, ne čísla', 'Funkci nejdřív vyhodnoť, např. plot(x, f(x)).');
    if (a.kind === 'vec' || a.kind === 'num') v = math.matrix([].concat(a.value));
    if (typeof v === 'number' || typeof v === 'boolean' || math.isUnit(v) || math.isBigNumber(v) || math.isFraction(v) || math.isComplex(v)) v = math.matrix([v]);
    if (Array.isArray(v)) v = math.matrix(v);
    if (!math.isMatrix(v)) throw gerr(fn + ': „' + a.text + '“ není číselný vektor');
    const sz = v.size();
    if (sz.reduce((p, x) => p * x, 1) === 0) return { values: [], unit: '' };
    if (sz.length === 2 && sz[0] > 1 && sz[1] > 1) {
      const arr = v.toArray();
      const cols = [];
      for (let j = 0; j < sz[1]; j++) {
        const pd = E.plotData(math.matrix(arr.map((r) => r[j])));
        if (!pd.ok) throw gerr(fn + ': „' + a.text + '“ – ' + pd.reason);
        cols.push(pd);
      }
      const rowsArr = [];
      for (let r = 0; r < sz[0]; r++) {
        const pd = E.plotData(math.matrix(arr[r]));
        if (!pd.ok) throw gerr(fn + ': „' + a.text + '“ – ' + pd.reason);
        rowsArr.push(pd);
      }
      return { cols, rowsArr, nrow: sz[0], ncol: sz[1] };
    }
    const pd = E.plotData(v);
    if (!pd.ok) throw gerr(fn + ': „' + a.text + '“ – ' + pd.reason);
    return { values: pd.values, unit: pd.unit };
  }

  const PLOT_OPTS = ['linewidth', 'color', 'linestyle', 'marker', 'markersize', 'markerfacecolor', 'markeredgecolor', 'displayname'];

  function doPlot(call, args, ctx) {
    const fn = call.fn;
    let i = 0;
    if (isHandle(args[0])) i = 1;
    const groups = [];
    while (i < args.length && !isStr(args[i])) {
      const a1 = args[i++];
      let a2 = null;
      if (i < args.length && !isStr(args[i])) a2 = args[i++];
      let spec = null;
      if (i < args.length && isStr(args[i]) && parseSpec(args[i].v)) { spec = parseSpec(args[i].v); i++; }
      groups.push({ xa: a2 ? a1 : null, ya: a2 || a1, spec });
    }
    if (!groups.length) throw gerr(fn + ': chybí data k vykreslení', 'Napiš např. ' + fn + '(x, y) nebo ' + fn + '(y).');
    const nv = parseNV(args.slice(i), PLOT_OPTS, fn, ctx);

    // nejdřív data (chyba nesmí nechat graf napůl smazaný)
    const series = [];
    groups.forEach((g) => {
      const yd = dataOf(g.ya, fn);
      const xd = g.xa ? dataOf(g.xa, fn) : null;
      const xname = g.xa && g.xa.kind === 'ident' ? g.xa.text : null;
      const yname = g.ya.kind === 'ident' ? g.ya.text : null;
      const lenErr = (nx, ny) => gerr(fn + ': vektory musí mít stejnou délku – „' + g.xa.text + '“ má ' + nx + ' hodnot, „' + g.ya.text + '“ má ' + ny,
        'Zkontroluj, že x a y vznikly ze stejného rozsahu (např. stejný linspace nebo t = 0:krok:konec).');
      if (xd && xd.cols) throw gerr(fn + ': na ose X může být jen vektor, „' + g.xa.text + '“ je matice');
      if (!yd.cols) {
        if (xd && xd.values.length !== yd.values.length) throw lenErr(xd.values.length, yd.values.length);
        series.push({ x: xd ? xd.values : yd.values.map((_, k) => k + 1), y: yd.values, xunit: xd ? xd.unit : '', yunit: yd.unit, xname, yname, xtext: g.xa ? g.xa.text : '', ytext: g.ya.text, spec: g.spec });
      } else {
        // matice: sloupce jako křivky (nebo řádky, když délkou sedí na x)
        let parts = yd.cols;
        let suffix = (j) => '(:,' + (j + 1) + ')';
        if (xd && xd.values.length !== yd.nrow) {
          if (xd.values.length === yd.ncol) { parts = yd.rowsArr; suffix = (j) => '(' + (j + 1) + ',:)'; } else throw lenErr(xd.values.length, yd.nrow + '×' + yd.ncol);
        }
        parts.forEach((pd, j) => {
          series.push({ x: xd ? xd.values : pd.values.map((_, k) => k + 1), y: pd.values, xunit: xd ? xd.unit : '', yunit: pd.unit, xname, yname: null, xtext: g.xa ? g.xa.text : '', ytext: g.ya.text + suffix(j), spec: g.spec });
        });
      }
    });

    // volby pro všechny křivky z tohoto volání
    const o = {};
    if (nv.linewidth) { const w = num1(nv.linewidth.v); if (w > 0) o.width = w; else ctx.warn(fn + ': LineWidth musí být kladné číslo – ignorováno'); }
    if (nv.markersize) { const w = num1(nv.markersize.v); if (w > 0) o.markerSize = w; else ctx.warn(fn + ': MarkerSize musí být kladné číslo – ignorováno'); }
    if (nv.color) { const c = parseColor(nv.color.v); if (c && c !== 'none') o.color = c; else ctx.warn(fn + ': neplatná barva „' + nv.color.text + '“ – ignorováno (např. \'r\', \'#D95319\' nebo [0 0.45 0.74])'); }
    if (nv.linestyle) { const s = String(nv.linestyle.v); if (LINESTYLES.includes(s)) o.ls = s; else ctx.warn(fn + ': neplatný LineStyle „' + s + '“ – ignorováno'); }
    if (nv.marker) { const s = lc(nv.marker.v); if (has(MARKERS, s)) o.marker = MARKERS[s]; else ctx.warn(fn + ': neplatný Marker „' + nv.marker.v + '“ – ignorováno'); }
    if (nv.markerfacecolor) { const s = lc(nv.markerfacecolor.v); const c = s === 'auto' ? 'auto' : parseColor(nv.markerfacecolor.v); if (c) o.mfc = c; else ctx.warn(fn + ': neplatná MarkerFaceColor – ignorováno'); }
    if (nv.markeredgecolor) { const s = lc(nv.markeredgecolor.v); const c = s === 'auto' ? 'auto' : parseColor(nv.markeredgecolor.v); if (c) o.mec = c; else ctx.warn(fn + ': neplatná MarkerEdgeColor – ignorováno'); }
    if (nv.displayname) o.displayName = String(nv.displayname.v);

    const fig = curFig(ctx);
    if (!fig.hold) {
      // s yyaxis nahradí plot jen křivky aktivní strany (jako v MATLABu)
      if (fig.ax.yyaxis) fig.ax.lines = fig.ax.lines.filter((ln) => (ln.side || 'left') !== fig.ax.side);
      else { fig.ax = newAxes(); fig.ax.box = true; }
    }
    const ax = fig.ax;
    ax.touched = true;
    if (fn === 'semilogx' || fn === 'loglog') ax.xscale = 'log';
    if (fn === 'semilogy' || fn === 'loglog') ySide(ax).yscale = 'log';
    const legendOn = ax.legend && ax.legend.visible;

    series.forEach((s) => {
      const sp = s.spec || {};
      let color = sp.color ? COLOR_LETTERS[sp.color] : o.color;
      const autoColor = !color;
      if (!color) color = PALETTE[ax.colorIdx++ % PALETTE.length];
      const marker = o.marker || (sp.marker ? MARKERS[sp.marker] : 'none');
      const ls = o.ls || sp.ls || (sp.marker && !o.ls ? 'none' : '-');
      ax.lines.push({
        x: s.x, y: s.y, xunit: s.xunit, yunit: s.yunit, xname: s.xname, yname: s.yname, xtext: s.xtext, ytext: s.ytext,
        color, autoColor, ls, marker,
        width: o.width || 0.5,
        markerSize: o.markerSize || 6,
        mfc: o.mfc || 'none', mec: o.mec || 'auto',
        displayName: o.displayName || '',
        inLegend: true,
        side: ax.yyaxis ? ax.side : 'left',
        fn, line: ctx.line,
      });
    });
    if (legendOn) ax.legend.visible = true;
    return fig;
  }

  const TEXT_OPTS = ['fontsize', 'fontweight', 'interpreter', 'color', 'fontangle'];

  function doText(call, args, ctx) {
    const fn = call.fn;
    let i = 0;
    if (isHandle(args[0])) i = 1;
    const fig = curFig(ctx);
    const ax = fig.ax;
    ax.touched = true;
    if (i >= args.length) { (fn === 'ylabel' ? ySide(ax) : ax)[fn] = null; return fig; }
    const a = args[i];
    let text;
    if (a.cell) text = a.v.join('\n');
    else if (typeof a.v === 'string') text = a.v;
    else {
      const E = MC.engine;
      const arr = numList(a.v);
      text = arr ? arr.map((x) => E.fmtScalar(x)).join(' ') : String(a.v);
    }
    const nv = parseNV(args.slice(i + 1), TEXT_OPTS, fn, ctx);
    const t = { text, interp: 'tex' };
    if (nv.fontsize) { const n = num1(nv.fontsize.v); if (n > 0) t.fontSize = n; else ctx.warn(fn + ': FontSize musí být kladné číslo – ignorováno'); }
    if (nv.fontweight) t.bold = lc(nv.fontweight.v) === 'bold';
    if (nv.fontangle) t.italic = lc(nv.fontangle.v) === 'italic';
    if (nv.color) { const c = parseColor(nv.color.v); if (c) t.color = c; else ctx.warn(fn + ': neplatná barva – ignorováno'); }
    if (nv.interpreter) {
      const it = lc(nv.interpreter.v);
      if (it === 'none' || it === 'tex') t.interp = it;
      else if (it === 'latex') { t.interp = 'tex'; ctx.warn(fn + ": Interpreter 'latex' zatím není – text se zobrazí jako TeX (^{…}, _{…}, \\alpha)"); } else ctx.warn(fn + ': neznámý Interpreter „' + nv.interpreter.v + '“ – ignorováno');
    }
    (fn === 'ylabel' ? ySide(ax) : ax)[fn] = t;
    return fig;
  }

  const LEGEND_OPTS = ['location', 'orientation', 'box', 'fontsize', 'numcolumns', 'autoupdate', 'textcolor', 'color', 'edgecolor', 'interpreter', 'title'];

  function doLegend(call, args, ctx) {
    let i = 0;
    if (isHandle(args[0])) i = 1;
    const fig = curFig(ctx);
    const ax = fig.ax;
    ax.touched = true;
    const rest = args.slice(i);
    const base = () => ax.legend || { visible: true, location: 'northeast', orientation: 'vertical', box: true };
    if (!rest.length) { ax.legend = Object.assign(base(), { visible: true }); return fig; }
    if (rest.length === 1 && isStr(rest[0])) {
      const k = lc(rest[0].v);
      if (k === 'off') { ax.legend = null; return fig; }
      if (k === 'hide') { if (ax.legend) ax.legend.visible = false; return fig; }
      if (k === 'show') { ax.legend = Object.assign(base(), { visible: true }); return fig; }
      if (k === 'toggle') { ax.legend = Object.assign(base(), { visible: !(ax.legend && ax.legend.visible) }); return fig; }
      if (k === 'boxoff' || k === 'boxon') { ax.legend = Object.assign(base(), { box: k === 'boxon' }); return fig; }
    }
    const labels = [];
    const opts = {};
    for (let k = 0; k < rest.length; k++) {
      const a = rest[k];
      if (isStr(a) && LEGEND_OPTS.includes(lc(a.v)) && k + 1 < rest.length) { opts[lc(a.v)] = rest[k + 1]; k++; continue; }
      if (a.cell) { a.v.forEach((s) => labels.push(String(s))); continue; }
      if (isStr(a)) { labels.push(a.v); continue; }
      const arr = numList(a.v);
      labels.push(arr ? arr.join(' ') : String(a.v));
    }
    const L = Object.assign(base(), { visible: true });
    if (opts.location) {
      const loc = lc(opts.location.v);
      if (LEGEND_LOCATIONS.includes(loc)) L.location = loc; else ctx.warn("legend: neznámá poloha „" + opts.location.v + "“ – ignorováno (např. 'northwest', 'southeast', 'best', 'eastoutside')");
    }
    if (opts.orientation) { const o = lc(opts.orientation.v); if (o === 'horizontal' || o === 'vertical') L.orientation = o; else ctx.warn('legend: Orientation je \'vertical\' nebo \'horizontal\' – ignorováno'); }
    if (opts.box) { const b = onOff(opts.box.v); if (b !== null) L.box = b; }
    if (opts.fontsize) { const n = num1(opts.fontsize.v); if (n > 0) L.fontSize = n; }
    if (opts.textcolor) L.textColor = parseColor(opts.textcolor.v);
    if (opts.color) L.color = parseColor(opts.color.v);
    if (opts.edgecolor) L.edgeColor = parseColor(opts.edgecolor.v);
    if (opts.title) L.title = String(opts.title.v);
    if (opts.numcolumns) { const n = num1(opts.numcolumns.v); if (n > 1) { L.orientation = 'horizontal'; ctx.warn('legend: NumColumns zatím není – legenda bude vodorovně'); } }
    if (opts.interpreter && lc(opts.interpreter.v) === 'none') L.interp = 'none';
    if (labels.length) {
      if (labels.length > ax.lines.length) ctx.warn('legend: popisků je víc (' + labels.length + ') než křivek (' + ax.lines.length + ') – přebývající jsou ignorované');
      ax.lines.forEach((ln, k) => {
        if (k < labels.length) { ln.displayName = labels[k]; ln.inLegend = true; } else ln.inLegend = false;
      });
    }
    ax.legend = L;
    return fig;
  }

  function doLim(call, args, ctx) {
    const fn = call.fn;
    let i = 0;
    if (isHandle(args[0])) i = 1;
    const fig = curFig(ctx);
    const ax = fig.ax;
    ax.touched = true;
    const key = fn === 'xlim' ? 'xlim' : 'ylim';
    const tgt = key === 'ylim' ? ySide(ax) : ax;
    const a = args[i];
    if (!a) return fig;
    if (isStr(a)) {
      const k = lc(a.v);
      if (k === 'auto') tgt[key] = null;
      else if (k === 'tight') { const b = bounds(ax); const r = key === 'xlim' ? b.x : b.y; if (r) tgt[key] = r; }
      else if (k !== 'manual' && k !== 'mode') ctx.warn(fn + ': neznámá volba „' + a.v + "“ – ignorováno (použij např. " + fn + '([0 10]) nebo ' + fn + " auto)");
      return fig;
    }
    const arr = numList(a.v);
    if (!arr || arr.length !== 2) throw gerr(fn + ': meze zadej jako dvojici [min max]', 'Např. ' + fn + '([0 10]). Pro automatickou mez použij -Inf nebo Inf.');
    if (!(arr[0] < arr[1])) throw gerr(fn + ': meze musí být rostoucí (min < max)', 'Např. ' + fn + '([0 10]).');
    tgt[key] = [arr[0], arr[1]];
    return fig;
  }

  // rozsah dat (pro axis tight): x ze všech křivek, y z křivek aktivní strany
  function bounds(ax) {
    const side = ax.yyaxis ? ax.side : 'left';
    const r = (k, log) => {
      let lo = Infinity;
      let hi = -Infinity;
      ax.lines.forEach((ln) => {
        if (k === 'y' && (ln.side || 'left') !== side) return;
        ln[k].forEach((v) => { if (Number.isFinite(v) && (!log || v > 0)) { if (v < lo) lo = v; if (v > hi) hi = v; } });
      });
      if (!(lo <= hi)) return null;
      if (lo === hi) { const d = lo === 0 ? 1 : Math.abs(lo) * 0.1; return [lo - d, hi + d]; }
      return [lo, hi];
    };
    return { x: r('x', ax.xscale === 'log'), y: r('y', ySide(ax).yscale === 'log') };
  }

  function doAxis(call, args, ctx) {
    let i = 0;
    if (isHandle(args[0])) i = 1;
    const fig = curFig(ctx);
    const ax = fig.ax;
    ax.touched = true;
    for (; i < args.length; i++) {
      const a = args[i];
      if (isStr(a)) {
        const k = lc(a.v);
        if (k === 'tight') { const b = bounds(ax); if (b.x) ax.xlim = b.x; if (b.y) ySide(ax).ylim = b.y; }
        else if (k === 'auto') { ax.xlim = null; ySide(ax).ylim = null; }
        else if (k === 'equal' || k === 'image') ax.equal = true;
        else if (k === 'normal') ax.equal = false;
        else if (k === 'ij') ySide(ax).ydir = 'reverse';
        else if (k === 'xy') ySide(ax).ydir = 'normal';
        else if (k === 'off') ax.axisOff = true;
        else if (k === 'on') ax.axisOff = false;
        else if (k === 'square' || k === 'fill' || k === 'vis3d' || k === 'manual') ctx.warn("axis: volba '" + a.v + "' zatím není podporovaná – ignorováno");
        else ctx.warn("axis: neznámá volba '" + a.v + "' – ignorováno");
        continue;
      }
      const arr = numList(a.v);
      if (!arr || (arr.length !== 4 && arr.length !== 6)) throw gerr('axis: zadej [xmin xmax ymin ymax]', 'Např. axis([0 10 -1 1]).');
      if (arr.length === 6) ctx.warn('axis: osa Z se ignoruje');
      if (!(arr[0] < arr[1]) || !(arr[2] < arr[3])) throw gerr('axis: meze musí být rostoucí (min < max)');
      ax.xlim = [arr[0], arr[1]];
      ySide(ax).ylim = [arr[2], arr[3]];
    }
    return fig;
  }

  const AX_IGNORE = ['units', 'position', 'outerposition', 'innerposition', 'activepositionproperty', 'positionconstraint'];
  const FIG_IGNORE = ['position', 'units', 'visible', 'windowstate', 'menubar', 'toolbar', 'renderer', 'paperpositionmode', 'paperunits', 'paperposition', 'papersize', 'inverthardcopy', 'windowstyle', 'resize'];

  function doSet(call, args, ctx) {
    const h = args[0];
    if (!isHandle(h)) {
      ctx.warn('set: zatím umím jen set(gca, …) a set(gcf, …) – řádek ignorován');
      return null;
    }
    const nv = parseNV(args.slice(1), null, 'set', ctx);
    const fig = curFig(ctx);
    if (h.v.handle === 'gcf') { applyFigProps(fig, nv, 'set', ctx); return fig; }
    const ax = fig.ax;
    ax.touched = true;
    const ys = ySide(ax);
    Object.keys(nv).forEach((k) => {
      const a = nv[k];
      const v = a.v;
      const bad = () => ctx.warn('set: neplatná hodnota pro ' + a.name + ' („' + a.text + '“) – ignorováno');
      // vlastnosti osy Y patří aktivní straně (yyaxis)
      const T = k[0] === 'y' && k !== 'ygrid' ? ys : ax;
      switch (k) {
        case 'xscale': case 'yscale': {
          const s = lc(v);
          if (s === 'log' || s === 'linear') T[k] = s; else bad();
          break;
        }
        case 'xlim': case 'ylim': {
          const arr = numList(v);
          if (arr && arr.length === 2 && arr[0] < arr[1]) T[k] = arr; else bad();
          break;
        }
        case 'xgrid': case 'ygrid': case 'box': { const b = onOff(v); if (b === null) bad(); else ax[k] = b; break; }
        case 'xminorgrid': case 'yminorgrid': { const b = onOff(v); if (b === null) bad(); else T[k === 'xminorgrid' ? 'xminor' : 'yminor'] = b; break; }
        case 'xminortick': case 'yminortick': { const b = onOff(v); if (b === null) bad(); else T[k] = b; break; }
        case 'fontsize': { const n = num1(v); if (n > 0) ax.fontSize = n; else bad(); break; }
        case 'fontname': if (typeof v === 'string') ax.fontName = v; else bad(); break;
        case 'linewidth': { const n = num1(v); if (n > 0) ax.lineWidth = n; else bad(); break; }
        case 'xdir': case 'ydir': { const s = lc(v); if (s === 'normal' || s === 'reverse') T[k] = s; else bad(); break; }
        case 'xtick': case 'ytick': { const arr = numList(v); if (arr) T[k] = arr.slice().sort((p, q) => p - q); else bad(); break; }
        case 'xcolor': case 'ycolor': { const c = parseColor(v); if (c) T[k] = c; else bad(); break; }
        default:
          if (!AX_IGNORE.includes(k)) ctx.warn('set: vlastnost os „' + a.name + '“ zatím není podporovaná – ignorováno');
      }
    });
    return fig;
  }

  function applyFigProps(fig, nv, fn, ctx) {
    Object.keys(nv).forEach((k) => {
      const a = nv[k];
      if (k === 'name') fig.name = String(a.v);
      else if (k === 'numbertitle') { const b = onOff(a.v); if (b !== null) fig.numberTitle = b; }
      else if (k === 'color') { const c = parseColor(a.v); if (c) fig.color = c; else ctx.warn(fn + ': neplatná barva – ignorováno'); }
      else if (!FIG_IGNORE.includes(k)) ctx.warn(fn + ': vlastnost okna „' + a.name + '“ zatím není podporovaná – ignorováno');
    });
  }

  function doFigure(call, args, ctx) {
    const g = ctx.gfx;
    let i = 0;
    let fig = null;
    if (args.length && !isStr(args[0])) {
      const n = num1(args[0].v);
      if (!(n >= 1) || Math.round(n) !== n) throw gerr('figure: číslo grafu musí být celé kladné číslo', 'Např. figure(2).');
      fig = g.figs.find((f) => f.num === n) || addFig(g, n, ctx.line);
      i = 1;
    } else {
      // stejný řádek kódu (např. při opakovaném Spustit sekci) graf obnoví místo vytváření dalšího
      fig = g.figs.find((f) => f.createLine === ctx.line && f.byFigure);
      if (fig) resetFig(fig, ctx.line); else fig = addFig(g, nextNum(g), ctx.line);
      fig.byFigure = true;
      fig.name = '';
      fig.numberTitle = true;
    }
    applyFigProps(fig, parseNV(args.slice(i), null, 'figure', ctx), 'figure', ctx);
    g.cur = fig;
    return fig;
  }

  function doHold(call, args, ctx) {
    let i = 0;
    if (isHandle(args[0])) i = 1;
    const fig = curFig(ctx);
    fig.ax.touched = true;
    const a = args[i];
    if (!a) fig.hold = !fig.hold;
    else {
      const k = lc(a.v);
      if (k === 'on' || k === 'all') fig.hold = true;
      else if (k === 'off') fig.hold = false;
      else ctx.warn("hold: neznámá volba '" + a.v + "' – použij hold on nebo hold off");
    }
    return fig;
  }

  function doOnOff(call, args, ctx) {
    let i = 0;
    if (isHandle(args[0])) i = 1;
    const fig = curFig(ctx);
    const ax = fig.ax;
    ax.touched = true;
    const a = args[i];
    const k = a ? lc(a.v) : 'toggle';
    if (call.fn === 'grid') {
      if (k === 'on') { ax.xgrid = true; ax.ygrid = true; }
      else if (k === 'off') { ax.xgrid = false; ax.ygrid = false; ax.xminor = false; ax.yminor = false; }
      else if (k === 'minor') { const m = !(ax.xminor && ax.yminor); ax.xminor = m; ax.yminor = m; }
      else if (k === 'toggle') { const v = !(ax.xgrid || ax.ygrid); ax.xgrid = v; ax.ygrid = v; }
      else ctx.warn("grid: neznámá volba '" + a.v + "' – použij grid on, grid off nebo grid minor");
    } else {
      if (k === 'on') ax.box = true;
      else if (k === 'off') ax.box = false;
      else if (k === 'toggle') ax.box = !ax.box;
      else ctx.warn("box: neznámá volba '" + a.v + "' – použij box on nebo box off");
    }
    return fig;
  }

  // yyaxis left / yyaxis right – vedlejší osa Y. První volání přidá pravou osu,
  // dosavadní křivky zůstanou vlevo (jako v MATLABu).
  function doYyaxis(call, args, ctx) {
    let i = 0;
    if (isHandle(args[0])) i = 1;
    const a = args[i];
    const k = a && isStr(a) ? lc(a.v) : '';
    if (k !== 'left' && k !== 'right') throw gerr('yyaxis: zadej stranu left nebo right', 'Např. yyaxis right – další plot, ylabel a ylim patří pravé ose.');
    const fig = curFig(ctx);
    const ax = fig.ax;
    ax.touched = true;
    if (!ax.yyaxis) {
      ax.yyaxis = true;
      ax.right = newSide();
      ax.lines.forEach((ln) => { ln.side = 'left'; });
    }
    ax.side = k;
    return fig;
  }

  function doClose(call, args, ctx) {
    const g = ctx.gfx;
    const a = args[0];
    let victims = [];
    if (!a) victims = g.cur ? [g.cur] : [];
    else if (isStr(a)) {
      const k = lc(a.v);
      if (k === 'all') victims = g.figs.slice();
      else victims = g.figs.filter((f) => lc(f.name) === k);
    } else {
      const arr = numList(a.v) || [];
      victims = g.figs.filter((f) => arr.includes(f.num));
    }
    g.figs = g.figs.filter((f) => !victims.includes(f));
    if (!g.figs.includes(g.cur)) g.cur = g.figs.length ? g.figs[g.figs.length - 1] : null;
    return null;
  }

  function exec(call, ctx) {
    const args = evalArgs(call, ctx);
    let fig = null;
    switch (call.fn) {
      case 'figure': fig = doFigure(call, args, ctx); break;
      case 'hold': fig = doHold(call, args, ctx); break;
      case 'plot': case 'semilogx': case 'semilogy': case 'loglog': fig = doPlot(call, args, ctx); break;
      case 'title': case 'xlabel': case 'ylabel': fig = doText(call, args, ctx); break;
      case 'legend': fig = doLegend(call, args, ctx); break;
      case 'grid': case 'box': fig = doOnOff(call, args, ctx); break;
      case 'xlim': case 'ylim': fig = doLim(call, args, ctx); break;
      case 'axis': fig = doAxis(call, args, ctx); break;
      case 'set': fig = doSet(call, args, ctx); break;
      case 'close': fig = doClose(call, args, ctx); break;
      case 'clf': fig = curFig(ctx); fig.ax = newAxes(); fig.hold = false; break;
      case 'cla':
        fig = curFig(ctx);
        if (fig.ax.yyaxis) fig.ax.lines = fig.ax.lines.filter((ln) => (ln.side || 'left') !== fig.ax.side);   // jen aktivní strana
        else { fig.ax.lines = []; fig.ax.colorIdx = 0; }
        break;
      case 'yyaxis': fig = doYyaxis(call, args, ctx); break;
      case 'subplot':
        fig = curFig(ctx);
        ctx.warn('subplot zatím není podporovaný – všechno se kreslí do jedné osy grafu');
        break;
      default: break;
    }
    if (fig) fig.stmts.push({ line: ctx.line, code: ctx.code, fn: call.fn });
  }

  MC.graphics = {
    PALETTE, COLOR_LETTERS, LEGEND_LOCATIONS, MARKERS, PLOT_FNS, FUNCS, Y_KEYS,
    parseCall, classify, splitArgs, parseSpec, parseColor,
    newState, exec,
  };
})();
