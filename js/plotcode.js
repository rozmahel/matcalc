/* =====================================================================
   MatCalc – úpravy kódu grafů z klikání
   ---------------------------------------------------------------------
   Graf je jen v kódu. Pravý klik ve Workspace a panel nastavení
   upravují nebo doplňují řádky v bloku „%% Grafy“ na konci skriptu.

   Blok se dělí na skupiny podle příkazu figure. Skupina patří ke grafu,
   který vytvořil její první řádek (fig.createLine). Upravovat jde jen
   „jednoduché“ řádky – samostatný příkaz na řádku a argumenty jsou
   texty, čísla, [čísla] nebo názvy proměnných. Ostatní (výrazy,
   víc příkazů na řádku, pokračování ...) panel jen ukáže.

   Všechny operace mění pole řádků (lines, číslováno od 0) na místě;
   čísla řádků v příkazech jsou od 1 jako v editoru.

   Křivky: každá dvojice X–Y v řádku plot je jedna křivka s vlastní X
   (proměnná, index vzorku nebo čas z periody). Jeden řádek může mít víc
   dvojic – plot(t, y, 'o', tHladka, yfit, '-'). Volby pro celý řádek
   ('Color', 'LineWidth', 'DisplayName'…) platí v MATLABu pro všechny
   dvojice, proto křivka s takovou volbou dostane vlastní řádek.
   Jména křivek z řádku s víc dvojicemi jsou v legend('a', 'b', …).

   Vedlejší osa Y: skupina se dělí příkazy „yyaxis left / right“ na úseky.
   Řádky před prvním yyaxis patří levé straně. ylabel, ylim a YScale se
   píšou do úseku své strany, ostatní (title, xlabel, legend…) platí pro
   celý graf a přidávají se na konec skupiny.
   ===================================================================== */
(function () {
  'use strict';
  const MC = (window.MC = window.MC || {});
  const E = MC.engine;
  const G = MC.graphics;

  const HEADER = '%% Grafy';
  const HEADER_RE = /^\s*%%\s*Grafy\s*$/i;
  const SECTION_RE = /^\s*%%(\s|$)/;
  const OPERAND_END = /[A-Za-z0-9_)\]}.']/;

  const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
  const lc = (s) => String(s).toLowerCase();
  const fmtNum = (v) => (v === Infinity ? 'Inf' : v === -Infinity ? '-Inf' : String(+Number(v).toPrecision(12)));

  /* ---------- rozbor bloku ---------- */
  function analyze(lines) {
    const hdr = lines.findIndex((l) => HEADER_RE.test(l));
    if (hdr < 0) return { block: null, groups: [], stmts: [] };
    let end = lines.length - 1;
    for (let k = hdr + 1; k < lines.length; k++) if (SECTION_RE.test(lines[k])) { end = k - 1; break; }
    const text = lines.slice(hdr + 1, end + 1).join('\n');
    const stmts = E.splitStatements(text).map((st) => Object.assign({}, st, { line: st.line + hdr + 1, endLine: st.endLine + hdr + 1 }));
    const perLine = {};
    stmts.forEach((st) => { perLine[st.line] = (perLine[st.line] || 0) + 1; });
    stmts.forEach((st) => {
      st.call = G.parseCall(st.code, null);
      st.single = perLine[st.line] === 1 && st.endLine === st.line;
      st.simple = !!st.call && st.single && st.call.args.every((a) => a.kind !== 'expr');
    });
    const groups = [];
    let g = null;
    stmts.forEach((st) => {
      if (!g || (st.call && st.call.fn === 'figure')) { g = { start: st.line, stmts: [] }; groups.push(g); }
      g.stmts.push(st);
    });
    groups.forEach((gr, k) => {
      gr.end = k + 1 < groups.length ? groups[k + 1].start - 1 : end + 1;
      gr.last = Math.max(...gr.stmts.map((s) => s.endLine));
    });
    return { block: { header: hdr + 1, end: end + 1 }, groups, stmts };
  }

  const groupOf = (an, fig) => (fig ? an.groups.find((g) => g.start === fig.createLine) || null : null);
  const byFn = (g, fns) => g.stmts.filter((s) => s.call && [].concat(fns).includes(s.call.fn));

  /* ---------- modely jednoduchých řádků ---------- */
  const isData = (x) => x.kind !== 'str' && x.kind !== 'cellstr';
  const ident = (name) => ({ kind: 'ident', text: name, value: name });
  /**
   * plot(x1, y1, 'o', x2, y2, '-', 'Volba', hodnota…) -> { fn, pairs: [{ x, y, spec }], opts }
   * Každá dvojice je jedna křivka (x = null -> index vzorku). Dělí se stejně jako v graphics.js
   * (doPlot): dva datové argumenty za sebou jsou x a y, za nimi může být styl.
   */
  function plotModel(st) {
    if (!st || !st.simple || !G.PLOT_FNS.has(st.call.fn)) return null;
    const a = st.call.args;
    if (a.length && a[0].kind === 'ident' && a[0].text === 'gca') return null;
    let i = 0;
    const pairs = [];
    while (i < a.length && isData(a[i])) {
      const a1 = a[i++];
      let a2 = null;
      if (i < a.length && isData(a[i])) a2 = a[i++];
      let spec = {};
      if (i < a.length && a[i].kind === 'str' && G.parseSpec(a[i].value)) { spec = G.parseSpec(a[i].value); i++; }
      pairs.push({ x: a2 ? a1 : null, y: a2 || a1, spec });
    }
    if (!pairs.length) return null;
    const opts = [];
    for (; i < a.length; i += 2) {
      if (a[i].kind !== 'str' || !a[i + 1]) return null;
      opts.push([a[i].value, a[i + 1]]);
    }
    const m = { fn: st.call.fn, pairs, opts };
    m.editable = pairs.every((p) => p.y.kind === 'ident' && (!p.x || p.x.kind === 'ident'));
    return m;
  }
  const getOpt = (m, name) => { const o = m.opts.find((p) => lc(p[0]) === lc(name)); return o ? o[1] : null; };
  function setOpt(m, name, text) {
    const k = m.opts.findIndex((p) => lc(p[0]) === lc(name));
    if (text === null || text === undefined) { if (k >= 0) m.opts.splice(k, 1); return; }
    const arg = { kind: 'expr', text };
    if (k >= 0) m.opts[k] = [m.opts[k][0], arg]; else m.opts.push([name, arg]);
  }
  // styl jako v MATLABu: barva, značka, čára – 'ro-', 'o', '-'
  const specText = (sp) => (sp.color || '') + (sp.marker || '') + (sp.ls || '');
  // řádek, ve kterém zbyla jedna dvojice: styl '-' doplněný kvůli dvojicím je výchozí, nemusí tam být
  function tidy(m) {
    if (m.pairs.length === 1 && specText(m.pairs[0].spec) === '-') m.pairs[0].spec = {};
    return m;
  }
  // víc dvojic v řádku: každá má styl (aspoň '-'), aby bylo vidět, kde dvojice končí (i u indexu vzorku)
  function serializePlot(m) {
    const args = [];
    const multi = m.pairs.length > 1;
    m.pairs.forEach((p) => {
      if (p.x) args.push(p.x.text);
      args.push(p.y.text);
      const sp = specText(p.spec) || (multi ? '-' : '');
      if (sp) args.push(q(sp));
    });
    m.opts.forEach(([n, v]) => { args.push(q(n)); args.push(v.text); });
    return m.fn + '(' + args.join(', ') + ')';
  }

  function legendModel(st) {
    if (!st || !st.simple || st.call.fn !== 'legend') return null;
    const a = st.call.args.slice();
    if (a.length && a[0].kind === 'ident' && a[0].text === 'gca') a.shift();
    const m = { labels: [], opts: [], keyword: null, cell: false };
    if (a.length === 1 && a[0].kind === 'str' && ['show', 'hide', 'off', 'toggle', 'boxoff', 'boxon'].includes(lc(a[0].value))) { m.keyword = lc(a[0].value); return m; }
    const OPTS = ['location', 'orientation', 'box', 'fontsize', 'numcolumns', 'autoupdate', 'textcolor', 'color', 'edgecolor', 'interpreter', 'title'];
    for (let i = 0; i < a.length; i++) {
      if (a[i].kind === 'str' && OPTS.includes(lc(a[i].value)) && a[i + 1]) { m.opts.push([a[i].value, a[i + 1]]); i++; continue; }
      if (a[i].kind === 'cellstr') { m.cell = true; a[i].value.forEach((s) => m.labels.push(s)); continue; }
      if (a[i].kind === 'str') { m.labels.push(a[i].value); continue; }
      return null;
    }
    return m;
  }
  function serializeLegend(m) {
    if (m.keyword) return 'legend ' + m.keyword;
    if (!m.labels.length && !m.opts.length) return 'legend show';
    const args = [];
    if (m.labels.length) {
      if (m.cell) args.push('{' + m.labels.map(q).join(', ') + '}');
      else m.labels.forEach((s) => args.push(q(s)));
    }
    m.opts.forEach(([n, v]) => { args.push(q(n)); args.push(v.text); });
    return 'legend(' + args.join(', ') + ')';
  }

  // set(gca, …) -> dvojice; null když to není jednoduchý set(gca, …)
  function setModel(st) {
    if (!st || !st.simple || st.call.fn !== 'set') return null;
    const a = st.call.args;
    if (!a.length || a[0].kind !== 'ident' || a[0].text !== 'gca' || (a.length - 1) % 2) return null;
    const pairs = [];
    for (let i = 1; i < a.length; i += 2) { if (a[i].kind !== 'str') return null; pairs.push([a[i].value, a[i + 1]]); }
    return { pairs };
  }
  const serializeSet = (m) => 'set(gca, ' + m.pairs.map(([n, v]) => q(n) + ', ' + v.text).join(', ') + ')';

  // časová osa z periody vzorkování: t = (0:numel(y)-1)*0.01
  const TIME_RE = /^([A-Za-z_]\w*)\s*=\s*\(\s*0\s*:\s*(?:numel|length)\s*\(\s*([A-Za-z_]\w*)\s*\)\s*-\s*1\s*\)\s*\*\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)$/;
  function timeModel(st) {
    if (!st || st.call || !st.single) return null;
    const m = String(st.code).match(TIME_RE);
    return m ? { st, name: m[1], ref: m[2], dt: m[3] } : null;
  }
  function timeOf(g) {
    for (const st of g.stmts) { const t = timeModel(st); if (t) return t; }
    return null;
  }

  const word = (st) => (st.call.args[0] ? lc(st.call.args[0].value) : '');
  const isHoldOn = (st) => st.call && st.call.fn === 'hold' && st.simple && ['on', 'all'].includes(word(st));
  const isTight = (st) => st.call && st.call.fn === 'axis' && st.simple && st.call.args.length === 1 && word(st) === 'tight';
  const isPlot = (st) => !!(st.call && G.PLOT_FNS.has(st.call.fn));

  /* ---------- strany osy Y (yyaxis) ---------- */
  // jednoduché „yyaxis left|right“ -> 'left' | 'right', jinak null
  function yyWord(st) {
    if (!st || !st.call || st.call.fn !== 'yyaxis' || !st.simple) return null;
    const a = st.call.args.filter((x) => !(x.kind === 'ident' && x.text === 'gca'));
    if (a.length !== 1 || a[0].kind !== 'str') return null;
    const w = lc(a[0].value);
    return w === 'left' || w === 'right' ? w : null;
  }
  const isYy = (st) => !!(st.call && st.call.fn === 'yyaxis');
  // strana každého příkazu skupiny (Map st -> 'left' | 'right'); příkaz yyaxis patří už nové straně
  function sideMap(g) {
    const m = new Map();
    let side = 'left';
    g.stmts.forEach((st) => {
      if (isYy(st)) side = yyWord(st) || side;
      m.set(st, side);
    });
    return m;
  }
  const hasYy = (g) => g.stmts.some(isYy);
  const sideOf = (g, st) => sideMap(g).get(st) || 'left';
  // má skupina pravou osu (příkaz yyaxis)? – v MATLABu ji přidá i yyaxis left
  const hasRight = (g) => hasYy(g);

  // vloží řádek(y) na konec úseku dané strany; když úsek není, přidá „yyaxis …“ na konec skupiny
  function insertSide(lines, g, side, texts) {
    texts = [].concat(texts);
    const ind = indentOf(lines, g);
    if (!hasYy(g)) { appendToGroup(lines, g, texts); return; }
    const sm = sideMap(g);
    const mine = g.stmts.filter((st) => sm.get(st) === side);
    if (mine.length) { insertAfter(lines, Math.max(...mine.map((st) => st.endLine)), texts, ind); return; }
    insertAfter(lines, g.last, ['yyaxis ' + side].concat(texts), ind);
  }
  // je před řádkem pos (od 1) ve skupině „hold on“?
  const holdBefore = (g, pos) => g.stmts.some((st) => isHoldOn(st) && st.endLine < pos);

  // Řádky, které panel umí zobrazit a měnit (ostatní ukáže jen pro čtení)
  function represented(st) {
    if (timeModel(st)) return true;
    if (!st.call || !st.simple) return false;
    const fn = st.call.fn;
    const n = st.call.args.length;
    if (fn === 'figure') return true;
    if (fn === 'hold') return n <= 1;
    if (G.PLOT_FNS.has(fn)) { const m = plotModel(st); return !!(m && m.editable); }
    if (fn === 'title' || fn === 'xlabel' || fn === 'ylabel') return n >= 1 && st.call.args[0].kind === 'str';
    if (fn === 'legend') return !!legendModel(st);
    if (fn === 'grid') return n === 1 && ['on', 'off'].includes(word(st));
    if (fn === 'box') return n === 1 && ['on', 'off'].includes(word(st));
    if (fn === 'xlim' || fn === 'ylim') return n === 1 && ((st.call.args[0].kind === 'vec' && st.call.args[0].value.length === 2) || word(st) === 'auto');
    if (fn === 'axis') return isTight(st);
    if (fn === 'set') { const m = setModel(st); return !!(m && m.pairs.every(([k]) => ['xscale', 'yscale'].includes(lc(k)))); }
    if (fn === 'yyaxis') return !!yyWord(st);
    return false;
  }

  /* ---------- úpravy řádků ---------- */
  function splitComment(line) {
    let inStr = null;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inStr) { if (c === inStr) { if (line[i + 1] === inStr) { i++; continue; } inStr = null; } continue; }
      if (c === '"') { inStr = '"'; continue; }
      if (c === "'") { if (!OPERAND_END.test(line[i - 1] || '')) inStr = "'"; continue; }
      if (c === '%' || c === '#') return { code: line.slice(0, i), comment: line.slice(i) };
    }
    return { code: line, comment: '' };
  }
  function replaceStmt(lines, st, newCode) {
    const L = st.line - 1;
    const { code, comment } = splitComment(lines[L]);
    const m = code.match(/^(\s*)([\s\S]*?)(\s*;?\s*)$/);
    lines[L] = m[1] + newCode + m[3] + comment;
  }
  const indentOf = (lines, g) => (g ? (lines[g.start - 1].match(/^\s*/) || [''])[0] : '');
  function insertAfter(lines, lineNo, texts, indent) {
    lines.splice(lineNo, 0, ...[].concat(texts).map((t) => (indent || '') + t));
  }
  const deleteLine = (lines, lineNo) => lines.splice(lineNo - 1, 1);

  // vloží řádek na konec skupiny (za poslední příkaz – pozdější příkaz v MATLABu vyhrává)
  function appendToGroup(lines, g, text) { insertAfter(lines, g.last, text, indentOf(lines, g)); }

  /* ---------- operace pro panel a menu ---------- */
  function ctxFor(lines, fig) {
    const an = analyze(lines);
    const g = groupOf(an, fig);
    if (!g) throw new Error('Graf není v bloku %% Grafy');
    return { an, g };
  }

  // řádky dané funkce na dané straně (pro ylabel / ylim; x a title side nemají)
  const onSide = (g, list, side) => { if (!side) return list; const sm = sideMap(g); return list.filter((s) => sm.get(s) === side); };
  // příkaz osy Y se přidá do úseku své strany, ostatní na konec skupiny
  const addFor = (lines, g, side, text) => (side ? insertSide(lines, g, side, text) : appendToGroup(lines, g, text));

  // title / xlabel / ylabel; side = 'left' | 'right' jen u ylabel
  function setText(lines, fig, fn, value, side) {
    const { g } = ctxFor(lines, fig);
    side = fn === 'ylabel' ? side || 'left' : null;
    const st = onSide(g, byFn(g, fn), side).filter((s) => represented(s)).pop();
    if (st) {
      if (value === '' && st.call.args.length === 1) { deleteLine(lines, st.line); return; }
      const args = st.call.args.map((a) => a.text);
      args[0] = q(value);
      replaceStmt(lines, st, fn + '(' + args.join(', ') + ')');
      return;
    }
    if (value !== '') addFor(lines, g, side, fn + '(' + q(value) + ')');
  }

  // xlim / ylim; lo, hi jako text ('' = automaticky); side jen u ylim
  function setLim(lines, fig, fn, lo, hi, side) {
    const { g } = ctxFor(lines, fig);
    side = fn === 'ylim' ? side || 'left' : null;
    const st = onSide(g, byFn(g, fn), side).filter((s) => represented(s)).pop();
    const p = (s, inf) => { const t = String(s).trim().replace(',', '.'); return t === '' ? inf : t; };
    const empty = String(lo).trim() === '' && String(hi).trim() === '';
    const code = fn + '([' + p(lo, '-Inf') + ' ' + p(hi, 'Inf') + '])';
    if (st) { if (empty) deleteLine(lines, st.line); else replaceStmt(lines, st, code); return; }
    if (!empty) addFor(lines, g, side, code);
  }

  // logaritmická osa: set(gca, 'XScale', …) nebo přepnutí semilogx/semilogy/loglog; side jen u osy y
  function setScale(lines, fig, axis, log, side) {
    const { g } = ctxFor(lines, fig);
    side = axis === 'y' ? side || 'left' : null;
    const key = axis.toUpperCase() + 'Scale';
    const want = log ? 'log' : 'linear';
    const sets = onSide(g, g.stmts.filter((s) => setModel(s) && setModel(s).pairs.some(([k]) => lc(k) === lc(key))), side);
    const plots = onSide(g, g.stmts.filter((s) => plotModel(s)), side);
    const logFns = axis === 'x' ? ['semilogx', 'loglog'] : ['semilogy', 'loglog'];
    if (sets.length) {
      const st = sets[sets.length - 1];
      const m = setModel(st);
      const k = m.pairs.findIndex(([n]) => lc(n) === lc(key));
      if (!log && m.pairs.length === 1 && !plots.some((s) => logFns.includes(s.call.fn))) { deleteLine(lines, st.line); return; }
      m.pairs[k] = [m.pairs[k][0], { text: q(want) }];
      replaceStmt(lines, st, serializeSet(m));
      return;
    }
    if (!log) {
      const swap = axis === 'x' ? { semilogx: 'plot', loglog: 'semilogy' } : { semilogy: 'plot', loglog: 'semilogx' };
      const hits = plots.filter((s) => swap[s.call.fn]);
      if (hits.length) {
        hits.forEach((s) => { const m = plotModel(s); m.fn = swap[m.fn]; replaceStmt(lines, s, serializePlot(m)); });
        return;
      }
    }
    addFor(lines, g, side, 'set(gca, ' + q(key) + ', ' + q(want) + ')');
  }

  // grid / box: on/off. Výchozí stav (grid off, box on) řádek smaže.
  function setFlag(lines, fig, fn, on) {
    const { g } = ctxFor(lines, fig);
    const st = byFn(g, fn).filter((s) => represented(s)).pop();
    const dflt = fn === 'box';
    if (st) {
      if (on === dflt) deleteLine(lines, st.line); else replaceStmt(lines, st, fn + ' ' + (on ? 'on' : 'off'));
      return;
    }
    appendToGroup(lines, g, fn + ' ' + (on ? 'on' : 'off'));
  }

  // axis tight; s vedlejší osou platí jen pro aktivní stranu, proto se zapíše do úseku každé strany
  function setTight(lines, fig, on) {
    let { g } = ctxFor(lines, fig);
    if (!on) { g.stmts.filter(isTight).reverse().forEach((s) => deleteLine(lines, s.line)); return; }
    if (!hasYy(g)) { if (!g.stmts.some(isTight)) appendToGroup(lines, g, 'axis tight'); return; }
    ['right', 'left'].forEach((side) => {
      ({ g } = ctxFor(lines, fig));
      if (!onSide(g, g.stmts.filter(isTight), side).length) insertSide(lines, g, side, 'axis tight');
    });
  }

  // legenda: viditelnost a poloha. Při zapnutí doplní jména podle názvu proměnné
  // (DisplayName, nebo legend('a', 'b', …), když je v některém řádku víc dvojic). names = jména čar grafu.
  function setLegend(lines, fig, visible, location, names) {
    let { g } = ctxFor(lines, fig);
    const legs = byFn(g, 'legend').filter((s) => legendModel(s));
    if (!visible) {
      if (legs.length) legs.slice().reverse().forEach((s) => deleteLine(lines, s.line));
      else appendToGroup(lines, g, 'legend off');
      return;
    }
    const st = legs[legs.length - 1];
    const m = st ? legendModel(st) : { labels: [], opts: [], keyword: null, cell: false };
    if (m.keyword) m.keyword = null;
    const k = m.opts.findIndex(([n]) => lc(n) === 'location');
    const loc = location || (k >= 0 ? m.opts[k][1].text.replace(/'/g, '') : 'northeast');
    if (k >= 0) m.opts.splice(k, 1);
    if (loc && lc(loc) !== 'northeast') m.opts.push(['Location', { text: q(loc) }]);
    if (st) replaceStmt(lines, st, serializeLegend(m)); else appendToGroup(lines, g, serializeLegend(m));
    if (!m.labels.length) {
      // popisky z názvů proměnných, ať legenda neukazuje data1, data2
      ({ g } = ctxFor(lines, fig));
      const multi = g.stmts.some((s) => { const pm = plotModel(s); return pm && pm.editable && pm.pairs.length > 1; });
      if (multi && names && names.length) { writeLabels(lines, fig, names); return; }
      g.stmts.forEach((s) => {
        const pm = plotModel(s);
        if (pm && pm.editable && pm.pairs.length === 1 && !getOpt(pm, 'DisplayName')) { setOpt(pm, 'DisplayName', q(pm.pairs[0].y.text)); replaceStmt(lines, s, serializePlot(pm)); }
      });
    }
  }

  /* ---------- křivky (dvojice X–Y) ---------- */
  const refRe = (n) => new RegExp('(^|[^A-Za-z0-9_])' + n + '([^A-Za-z0-9_]|$)');
  const timeDefs = (g) => g.stmts.map(timeModel).filter(Boolean);
  const timeCode = (name, ref, dt) => name + ' = (0:numel(' + ref + ')-1)*' + dt;
  const letterOf = (hex) => Object.keys(G.COLOR_LETTERS).find((k) => G.COLOR_LETTERS[k].toLowerCase() === String(hex).toLowerCase()) || null;
  // index čáry v grafu (fig.ax.lines) pro j-tou dvojici řádku – podle něj se páruje s popisky legendy
  const lineIndex = (fig, stLine, j) => { const ls = fig.ax.lines.filter((ln) => ln.line === stLine); return ls[j] ? fig.ax.lines.indexOf(ls[j]) : -1; };

  /**
   * Křivky skupiny v pořadí kódu: { ord, st, j, m, p, ro }. ord = pořadí křivky ve skupině
   * (nezmění se rozdělením řádku ani vložením časového vektoru), j = index dvojice v řádku.
   * Řádek plot, který panel neumí (výrazy, matice…), je jedna položka s ro = true.
   */
  function curvesOf(g) {
    const out = [];
    g.stmts.forEach((st) => {
      if (!isPlot(st)) return;
      const m = plotModel(st);
      if (!m || !m.editable) { out.push({ ord: out.length, st, j: 0, m, p: null, ro: true }); return; }
      m.pairs.forEach((p, j) => out.push({ ord: out.length, st, j, m, p, ro: false }));
    });
    return out;
  }
  function curveAt(g, ord) {
    const c = curvesOf(g)[ord];
    if (!c || c.ro) throw new Error('Křivka je ručně psaná – uprav ji v editoru');
    return c;
  }

  // X jedné křivky: { kind: 'index' } | { kind: 'var', name } | { kind: 'time', name, dt, ref, st }
  function xOf(g, p) {
    if (!p.x) return { kind: 'index' };
    const tm = timeDefs(g).find((t) => t.name === p.x.text);
    if (tm) return { kind: 'time', name: tm.name, dt: tm.dt, ref: tm.ref, st: tm.st };
    return { kind: 'var', name: p.x.text };
  }
  // X poslední upravitelné křivky (nová křivka ho převezme); null = graf bez křivek
  function lastX(g) {
    const cs = curvesOf(g).filter((c) => !c.ro);
    return cs.length ? xOf(g, cs[cs.length - 1].p) : null;
  }
  // společná X všech křivek ('' = index, null = různé / žádné) – pro menu Workspace
  function commonX(g) {
    const cs = curvesOf(g).filter((c) => !c.ro);
    if (!cs.length) return null;
    const xs = new Set(cs.map((c) => (c.p.x ? c.p.x.text : '')));
    return xs.size === 1 ? [...xs][0] : null;
  }

  // je název použitý ve skupině i jinde než v dané křivce? (vlastní definice se nepočítá)
  function usedElsewhere(g, name, stLine, j) {
    const re = refRe(name);
    return g.stmts.some((s) => {
      const tm = timeModel(s);
      if (tm && tm.name === name) return false;
      if (s.line === stLine) {
        const m = plotModel(s);
        if (m) return m.pairs.some((p, k) => k !== j && ((p.x && p.x.text === name) || p.y.text === name)) || m.opts.some((o) => re.test(o[1].text));
      }
      return re.test(s.code);
    });
  }

  // volný název pro časový vektor: t, t_<y>, t2, t3… (ne ve workspace ani přiřazený v kódu)
  function freeTimeName(lines, y, taken) {
    const used = new Set(taken || []);
    lines.forEach((l) => { const m = l.match(/^\s*([A-Za-z_]\w*)\s*=(?!=)/); if (m) used.add(m[1]); });
    const cands = ['t', 't_' + y];
    for (let k = 2; k < 100; k++) cands.push('t' + k);
    return cands.find((c) => !used.has(c) && c !== y);
  }

  /**
   * X a/nebo Y jedné křivky. xs = { kind: 'index' } | { kind: 'var', name } | { kind: 'time', dt }
   * (undefined = beze změny), y = název proměnné (undefined = beze změny).
   * Čas z periody je vlastní vektor křivky t = (0:numel(y)-1)*dt na řádku před jejím plot.
   * Vektor sdílený víc křivkami (starší grafy) se při změně nepřepíše – křivka dostane nový,
   * aby perioda jedné křivky neměnila ostatní. Se změnou Y jde časový vektor s ní (délka podle Y).
   * taken = názvy ve workspace (aby nový vektor nepřepsal jinou proměnnou).
   */
  function setCurveData(lines, fig, ord, xs, y, taken) {
    const { g } = ctxFor(lines, fig);
    const c = curveAt(g, ord);
    const p = c.m.pairs[c.j];
    const cur = xOf(g, p);
    if (y !== undefined) p.y = ident(y);
    const yName = p.y.text;
    if (xs === undefined && cur.kind === 'time' && y !== undefined) xs = { kind: 'time', dt: cur.dt };
    let rewrite = null;
    let add = null;
    if (xs) {
      if (xs.kind === 'index') p.x = null;
      else if (xs.kind === 'var') p.x = ident(xs.name);
      else if (cur.kind === 'time' && !usedElsewhere(g, cur.name, c.st.line, c.j)) rewrite = { st: cur.st, name: cur.name, dt: xs.dt };
      else { const name = freeTimeName(lines, yName, taken); p.x = ident(name); add = { name, dt: xs.dt }; }
    }
    if (p.x && p.x.text === yName) throw new Error('„' + yName + '“ nemůže být na ose X i Y stejné křivky');
    replaceStmt(lines, c.st, serializePlot(c.m));
    if (rewrite) replaceStmt(lines, rewrite.st, timeCode(rewrite.name, yName, rewrite.dt));
    if (add) insertAfter(lines, c.st.line - 1, timeCode(add.name, yName, add.dt) + ';', indentOf(lines, g));
    try { dropUnusedTime(lines, fig); } catch (e) { /* skupina se posunula – časový vektor zůstane */ }
  }

  /**
   * Křivku z řádku s víc dvojicemi dá na vlastní řádek plot – kvůli volbám, které v MATLABu
   * platí pro celý řádek ('Color', 'LineWidth', 'DisplayName'…). Řádek se rozdělí na části
   * před, křivku a za, takže pořadí křivek (barvy, legenda) zůstane; volby řádku dostane každá část.
   */
  function isolate(lines, fig, ord) {
    const { g } = ctxFor(lines, fig);
    const c = curveAt(g, ord);
    const m = c.m;
    if (m.pairs.length < 2) return;
    const parts = [m.pairs.slice(0, c.j), [m.pairs[c.j]], m.pairs.slice(c.j + 1)]
      .filter((ps) => ps.length).map((ps) => tidy({ fn: m.fn, pairs: ps.map((p) => Object.assign({}, p, { spec: Object.assign({}, p.spec) })), opts: m.opts.slice() }));
    const ind = (lines[c.st.line - 1].match(/^\s*/) || [''])[0];
    replaceStmt(lines, c.st, serializePlot(parts[0]));
    const add = [];
    if (!holdBefore(g, c.st.line + 1)) add.push(ind + 'hold on');
    parts.slice(1).forEach((pm) => add.push(ind + serializePlot(pm)));
    lines.splice(c.st.line, 0, ...add);
  }

  // poslední legenda s popisky ({ s, m }) nebo null
  function labelsLegend(g) {
    const l = byFn(g, 'legend').map((s) => ({ s, m: legendModel(s) })).filter((o) => o.m && o.m.labels.length).pop();
    return l || null;
  }
  /**
   * Jména křivek do legend('a', 'b', …) – když je v řádku plot víc dvojic, DisplayName nejde
   * (platil by pro všechny). DisplayName u upravitelných řádků se smaže, jména jsou teď v legendě.
   */
  function writeLabels(lines, fig, labels) {
    const { g } = ctxFor(lines, fig);
    g.stmts.forEach((s) => {
      const pm = plotModel(s);
      if (pm && pm.editable && getOpt(pm, 'DisplayName')) { setOpt(pm, 'DisplayName', null); replaceStmt(lines, s, serializePlot(pm)); }
    });
    const legs = byFn(g, 'legend').filter((s) => { const lm = legendModel(s); return lm && (!lm.keyword || lm.keyword === 'show'); });
    const st = legs[legs.length - 1];
    const m = st ? legendModel(st) : { labels: [], opts: [], keyword: null, cell: false };
    m.keyword = null;
    m.labels = labels.slice();
    // popisky platí pro křivky nakreslené před legend – za ní nesmí být další plot (např. vpravo)
    if (st && g.stmts.some((s) => isPlot(s) && s.line > st.line) && st.single) {
      deleteLine(lines, st.line);
      appendToGroup(lines, ctxFor(lines, fig).g, serializeLegend(m));
    } else if (st) replaceStmt(lines, st, serializeLegend(m));
    else appendToGroup(lines, g, serializeLegend(m));
  }
  // popisky doplněné do délky n jmény křivek (names = jména čar grafu v pořadí)
  function padLabels(labels, n, names) {
    while (labels.length < n) labels.push((names && names[labels.length]) || 'data' + (labels.length + 1));
    return labels;
  }

  /**
   * Vzhled a název jedné křivky. ch = { color, ls, marker, width, label, labelIndex, defName, names, legendOn }
   * color: '#RRGGBB' (písmeno r/g/b… se použije, když barva přesně odpovídá), '' = automaticky.
   * label: s popisky v legend(…) se mění popisek, u samostatného řádku DisplayName, u řádku
   * s víc dvojicemi a zapnutou legendou se jména přesunou do legend(…).
   */
  function setSeries(lines, fig, ord, ch) {
    let { g } = ctxFor(lines, fig);
    let c = curveAt(g, ord);
    const leg = labelsLegend(g);
    const lettered = ch.color !== undefined && (!ch.color || letterOf(ch.color));
    const needOwn = c.m.pairs.length > 1 && (
      (ch.color !== undefined && (!lettered || getOpt(c.m, 'Color'))) ||
      ((ch.ls !== undefined || ch.marker !== undefined) && (getOpt(c.m, 'LineStyle') || getOpt(c.m, 'Marker'))) ||
      ch.width !== undefined ||
      (ch.label !== undefined && !leg && !ch.legendOn));
    if (needOwn) { isolate(lines, fig, ord); ({ g } = ctxFor(lines, fig)); c = curveAt(g, ord); }
    const m = c.m;
    const p = m.pairs[c.j];
    if (ch.color !== undefined) {
      const letter = ch.color ? letterOf(ch.color) : null;
      if (letter) { p.spec.color = letter; setOpt(m, 'Color', null); } else { delete p.spec.color; setOpt(m, 'Color', ch.color ? q(ch.color.toUpperCase()) : null); }
    }
    if (ch.ls !== undefined || ch.marker !== undefined) {
      const lsOpt = getOpt(m, 'LineStyle');
      const ls = ch.ls !== undefined ? ch.ls : (lsOpt ? lsOpt.text.replace(/'/g, '') : p.spec.ls || (p.spec.marker ? 'none' : '-'));
      let mk = ch.marker !== undefined ? ch.marker : (p.spec.marker || 'none');
      if (ls === 'none' && mk === 'none') mk = 'o';
      setOpt(m, 'LineStyle', null);
      setOpt(m, 'Marker', null);
      delete p.spec.ls;
      delete p.spec.marker;
      if (mk !== 'none') { p.spec.marker = mk; if (ls !== 'none') p.spec.ls = ls; } else if (ls !== '-') p.spec.ls = ls;
    }
    if (ch.width !== undefined) {
      const w = Number(String(ch.width).replace(',', '.'));
      setOpt(m, 'LineWidth', Number.isFinite(w) && w > 0 && w !== 0.5 ? fmtNum(w) : null);
    }
    let legendEdit = null;
    let newLabels = null;
    if (ch.label !== undefined) {
      const k = ch.labelIndex;
      const text = ch.label === '' ? ch.defName || '' : ch.label;
      if (leg && k !== undefined && k >= 0) {
        padLabels(leg.m.labels, k, ch.names);
        leg.m.labels[k] = text;
        legendEdit = leg;
      } else if (m.pairs.length > 1 && k !== undefined && k >= 0) {
        newLabels = padLabels((ch.names || []).slice(), k + 1, ch.names);
        newLabels[k] = text;
      } else setOpt(m, 'DisplayName', ch.label === '' ? null : q(ch.label));
    }
    replaceStmt(lines, c.st, serializePlot(m));
    if (legendEdit) replaceStmt(lines, legendEdit.s, serializeLegend(legendEdit.m));
    if (newLabels) writeLabels(lines, fig, newLabels);
  }

  function deleteStmt(lines, lineNo, fig) {
    deleteLine(lines, lineNo);
    if (fig) cleanupRight(lines, fig);
  }

  // odebere křivku: dvojici z řádku (řádek zmizí s poslední dvojicí) a její popisek v legendě
  function deleteCurve(lines, fig, ord) {
    const { g } = ctxFor(lines, fig);
    const c = curvesOf(g)[ord];
    if (!c) return;
    const leg = labelsLegend(g);
    const idx = lineIndex(fig, c.st.line, c.j);
    if (!c.ro && leg && idx >= 0 && idx < leg.m.labels.length) { leg.m.labels.splice(idx, 1); replaceStmt(lines, leg.s, serializeLegend(leg.m)); }
    if (c.ro || c.m.pairs.length === 1) deleteLine(lines, c.st.line);
    else { c.m.pairs.splice(c.j, 1); replaceStmt(lines, c.st, serializePlot(tidy(c.m))); }
    cleanupRight(lines, fig);
    try { dropUnusedTime(lines, fig); } catch (e) { /* graf zmizel */ }
  }

  /**
   * Přesune řádek plot na levou / pravou osu Y (yyaxis). Na pravou ho dá za poslední
   * křivku vpravo (nebo za „yyaxis right“, případně ho na konec skupiny přidá),
   * na levou za poslední křivku vlevo. Vrací nové číslo řádku.
   */
  function moveSide(lines, fig, stmtLine, side) {
    let { g } = ctxFor(lines, fig);
    const st = g.stmts.find((s) => s.line === stmtLine);
    if (!st || !plotModel(st) || !st.single) throw new Error('Řádek ' + stmtLine + ' je ručně psaný – uprav ho v editoru');
    const sm = sideMap(g);
    if (sm.get(st) === side) return stmtLine;
    if (g.stmts.some((s) => isYy(s) && !yyWord(s))) throw new Error('Ve skupině je ručně psaný příkaz yyaxis – stranu změň v editoru');
    if (st.line === g.start) throw new Error('Graf začíná tímto řádkem – přidej nad něj „figure“, pak jde křivka přesunout');
    const text = lines[st.line - 1];
    const plain = text.replace(/^\s*/, '');
    deleteLine(lines, st.line);
    ({ g } = ctxFor(lines, fig));
    const ind = indentOf(lines, g);
    const sm2 = sideMap(g);
    const plots = g.stmts.filter((s) => isPlot(s) && sm2.get(s) === side);
    let at;
    if (plots.length) at = plots[plots.length - 1].endLine;
    else if (side === 'right') {
      const yy = g.stmts.filter((s) => yyWord(s) === 'right');
      if (!yy.length) { insertAfter(lines, g.last, ['yyaxis right', plain], ind); return g.last + 2; }
      at = yy[yy.length - 1].endLine;
    } else {
      // za úvodní figure / hold / yyaxis left na začátku skupiny
      let k = 0;
      while (k + 1 < g.stmts.length && g.stmts[k + 1].call && ['figure', 'hold'].includes(g.stmts[k + 1].call.fn)) k++;
      at = g.stmts[k].endLine;
      if (sm2.get(g.stmts[k]) !== 'left') {
        const yl = g.stmts.filter((s) => yyWord(s) === 'left');
        if (!yl.length) { insertAfter(lines, g.last, ['yyaxis left', plain], ind); return g.last + 2; }
        at = yl[yl.length - 1].endLine;
      }
    }
    // druhá křivka na stejné straně potřebuje hold on (jinak by první nahradila)
    const add = [];
    if (plots.length && !holdBefore(g, at + 1)) add.push(ind + 'hold on');
    add.push(text);
    lines.splice(at, 0, ...add);
    return at + add.length;
  }

  /**
   * Křivka na levou / pravou osu Y. Z řádku s víc dvojicemi se nejdřív oddělí na vlastní řádek.
   * Popisek v legend(…) se přesune s ní. Když vpravo nic nezůstane, pravá osa zmizí.
   */
  function setSide(lines, fig, ord, side) {
    let { g } = ctxFor(lines, fig);
    let c = curveAt(g, ord);
    if (sideOf(g, c.st) === side) return;
    const idx = lineIndex(fig, c.st.line, c.j);
    const leg0 = labelsLegend(g);
    const label = leg0 && idx >= 0 && idx < leg0.m.labels.length ? leg0.m.labels[idx] : null;
    let from = c.st.line;
    if (c.m.pairs.length > 1) {
      // dvojice ven z řádku na vlastní řádek hned pod ním, odtud se přesune (bez zbytečného hold on)
      const own = tidy({ fn: c.m.fn, pairs: c.m.pairs.splice(c.j, 1), opts: c.m.opts.slice() });
      replaceStmt(lines, c.st, serializePlot(tidy(c.m)));
      insertAfter(lines, c.st.line, serializePlot(own), (lines[c.st.line - 1].match(/^\s*/) || [''])[0]);
      from = c.st.line + 1;
    }
    const at = moveSide(lines, fig, from, side);
    if (label !== null) {
      ({ g } = ctxFor(lines, fig));
      const lg = labelsLegend(g);
      if (lg) {
        const before = fig.ax.lines.filter((ln) => ln.line < g.start).length + curvesOf(g).filter((x) => x.st.line < at).length;
        const labels = lg.m.labels.slice();
        labels.splice(idx, 1);
        labels.splice(Math.min(before, labels.length), 0, label);
        writeLabels(lines, fig, labels);
      }
    }
    if (side === 'left') cleanupRight(lines, fig);
  }

  /**
   * Když na pravé ose nezůstala žádná křivka, smaže „yyaxis“ a nastavení pravé osy
   * (ylabel, ylim, YScale, axis tight vpravo). Ručně psané řádky vpravo – nic nemaže.
   */
  function cleanupRight(lines, fig) {
    let g;
    try { ({ g } = ctxFor(lines, fig)); } catch (e) { return; }
    if (!hasYy(g) || g.stmts.some((s) => isYy(s) && !yyWord(s))) return;
    const sm = sideMap(g);
    if (g.stmts.some((s) => isPlot(s) && sm.get(s) === 'right')) return;
    const right = g.stmts.filter((s) => sm.get(s) === 'right' && !isYy(s));
    const yOnly = (s) => s.call && (['ylabel', 'ylim'].includes(s.call.fn) || isTight(s) ||
      (s.call.fn === 'set' && setModel(s) && setModel(s).pairs.every(([k]) => lc(k) === 'yscale')));
    if (right.some((s) => !represented(s) || (s.call && ['set', 'axis'].includes(s.call.fn) && !yOnly(s)))) return;
    const del = g.stmts.filter((s) => (isYy(s) && s.line !== g.start) || (sm.get(s) === 'right' && yOnly(s) && s.single));
    del.map((s) => s.line).sort((a, b) => b - a).forEach((l) => deleteLine(lines, l));
  }

  /**
   * Proměnná na ose X u všech jednoduchých křivek grafu (pravý klik ve Workspace).
   * ok(y) – smí křivka s tímto Y dostat tuto X (stejná délka)? Jinak jí zůstane původní X.
   * Křivka, která má na Y právě tuto proměnnou, zmizí (nemůže být sama proti sobě).
   * Vrací { skipped (ručně psané řádky), kept (Y, kterým zůstala původní X) }.
   */
  function setX(lines, fig, name, ok) {
    const { g } = ctxFor(lines, fig);
    let skipped = 0;
    const kept = [];
    const edits = [];
    g.stmts.forEach((s) => {
      if (!isPlot(s)) return;
      const m = plotModel(s);
      if (!m || !m.editable) { skipped++; return; }
      const n0 = m.pairs.length;
      m.pairs = m.pairs.filter((p) => !(name && p.y.text === name));
      if (m.pairs.length < n0) tidy(m);
      m.pairs.forEach((p) => { if (!name || !ok || ok(p.y.text)) p.x = name ? ident(name) : null; else kept.push(p.y.text); });
      edits.push({ s, code: m.pairs.length ? serializePlot(m) : null });
    });
    edits.reverse().forEach((e) => { if (e.code === null) deleteLine(lines, e.s.line); else replaceStmt(lines, e.s, e.code); });
    try { dropUnusedTime(lines, fig); } catch (e) { /* graf zmizel */ }
    cleanupRight(lines, fig);
    return { skipped, kept };
  }

  // řádek s časovým vektorem, který už nic ve skupině nepoužívá, zmizí
  function dropUnusedTime(lines, fig) {
    const { g } = ctxFor(lines, fig);
    const times = timeDefs(g);
    const dead = times.filter((t) => !g.stmts.some((s) => s !== t.st && refRe(t.name).test(s.code)));
    dead.reverse().forEach((t) => deleteLine(lines, t.st.line));
  }

  /**
   * Přidá křivku y (na levou osu) s X podle xs (tvary jako u setCurveData – z menu převezme
   * X předchozí křivky). Když poslední řádek plot vlevo nemá volby platné pro celý řádek,
   * přidá se do něj další dvojice: plot(t, y, 'o', tHladka, yfit, '-'); jinak nový řádek
   * (s hold on). o = { taken, legendOn, names }. Vrací pořadí (ord) nové křivky.
   */
  function addCurve(lines, fig, y, xs, o) {
    o = o || {};
    const { g } = ctxFor(lines, fig);
    const sm = sideMap(g);
    const yy = hasYy(g);
    const lefts = g.stmts.filter((s) => isPlot(s) && (!yy || sm.get(s) === 'left'));
    const last = lefts[lefts.length - 1];
    const lm = last ? plotModel(last) : null;
    const leg = labelsLegend(g);
    const pair = { x: null, y: ident(y), spec: {} };
    const appendable = !!(lm && lm.editable && lm.opts.every(([n]) => lc(n) === 'displayname') && (!lm.opts.length || o.legendOn));
    const countTo = (line) => fig.ax.lines.filter((ln) => ln.line <= line).length;
    let at;
    let j = 0;
    let before;     // počet čar grafu před novou křivkou (kvůli popiskům legendy)
    if (appendable) {
      before = countTo(last.line);
      lm.pairs.push(pair);
      j = lm.pairs.length - 1;
      replaceStmt(lines, last, serializePlot(lm));
      at = last.line;
    } else {
      const m = { fn: 'plot', pairs: [pair], opts: [] };
      if (o.legendOn && !leg) setOpt(m, 'DisplayName', q(y));
      const ind = indentOf(lines, g);
      let after = last ? last.endLine : null;
      if (after !== null) {
        before = countTo(after);
        if (!holdBefore(g, after + 1)) { insertAfter(lines, after, 'hold on', ind); after++; }
      } else {
        // za figure / hold on na začátku skupiny
        let k = 0;
        while (k + 1 < g.stmts.length && g.stmts[k + 1].call && ['figure', 'hold'].includes(g.stmts[k + 1].call.fn)) k++;
        after = g.stmts[k].endLine;
        // v grafu s yyaxis ještě před první křivku vpravo (aby nová křivka byla vlevo)
        if (sm.get(g.stmts[k]) === 'right') {
          const yl = g.stmts.filter((s) => yyWord(s) === 'left');
          if (yl.length) after = yl[yl.length - 1].endLine;
          else after = null;
        }
        if (after === null) {
          before = fig.ax.lines.length;
          insertAfter(lines, g.last, ['yyaxis left', serializePlot(m)], ind);
          at = g.last + 2;
        } else {
          before = countTo(after);
          if (g.stmts.some((s) => isPlot(s) && s.endLine <= after) && !holdBefore(g, after + 1)) { insertAfter(lines, after, 'hold on', ind); after++; }
        }
      }
      if (at === undefined) { insertAfter(lines, after, serializePlot(m), ind); at = after + 1; }
    }
    // popisky v legend(…): nová křivka dostane svůj na správném místě
    if (leg || (appendable && o.legendOn)) {
      const labels = padLabels(leg ? leg.m.labels.slice() : (o.names || []).slice(), before, o.names);
      labels.splice(before, 0, y);
      writeLabels(lines, fig, labels);
    }
    const g2 = ctxFor(lines, fig).g;
    const nc = curvesOf(g2).find((c) => c.st.line === at && c.j === j);
    const ord = nc ? nc.ord : curvesOf(g2).length - 1;
    if (nc && xs && xs.kind !== 'index') setCurveData(lines, fig, ord, xs, undefined, o.taken);
    return ord;
  }

  // odebere proměnné z grafu (křivky s nimi na ose Y i s popiskem; z osy X je jen sundá -> index)
  function removeVars(lines, fig, names) {
    const { g } = ctxFor(lines, fig);
    let skipped = 0;
    const edits = [];
    const dropIdx = [];
    g.stmts.forEach((s) => {
      if (!isPlot(s)) return;
      const m = plotModel(s);
      if (!m || !m.editable) { skipped++; return; }
      let changed = false;
      const keep = [];
      m.pairs.forEach((p, j) => {
        if (names.includes(p.y.text)) { changed = true; const k = lineIndex(fig, s.line, j); if (k >= 0) dropIdx.push(k); return; }
        if (p.x && names.includes(p.x.text)) { p.x = null; changed = true; }
        keep.push(p);
      });
      if (!changed) return;
      m.pairs = keep;
      edits.push({ s, code: keep.length ? serializePlot(tidy(m)) : null });
    });
    const leg = labelsLegend(g);
    if (leg && dropIdx.length) {
      dropIdx.sort((a, b) => b - a).forEach((k) => { if (k < leg.m.labels.length) leg.m.labels.splice(k, 1); });
      replaceStmt(lines, leg.s, serializeLegend(leg.m));
    }
    edits.reverse().forEach((e) => { if (e.code === null) deleteLine(lines, e.s.line); else replaceStmt(lines, e.s, e.code); });
    cleanupRight(lines, fig);
    try { dropUnusedTime(lines, fig); } catch (e) { /* graf zmizel */ }
    return { skipped };
  }

  // zajistí blok %% Grafy na konci skriptu
  function ensureBlock(lines) {
    let an = analyze(lines);
    if (an.block) return an;
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    if (lines.length) lines.push('');
    lines.push(HEADER);
    an = analyze(lines);
    return an;
  }

  // nový graf na konci bloku; vrací číslo řádku s příkazem figure.
  // names = názvy Y (všechny proti xname) nebo [{ y, x }]; víc křivek = jeden plot s dvojicemi
  function newFigure(lines, names, xname, extra) {
    const an = ensureBlock(lines);
    const b = an.block;
    let at = b.end;                                         // poslední řádek bloku
    while (at > b.header && lines[at - 1].trim() === '') at--;  // bez prázdných řádků na konci
    const add = [];
    if (an.stmts.length) add.push('');
    const figLine = at + add.length + 1;
    add.push('figure');
    const items = (names || []).map((n) => (typeof n === 'string' ? { y: n, x: xname || null } : n));
    if (items.length) add.push(serializePlot({ fn: 'plot', pairs: items.map((it) => ({ x: it.x ? ident(it.x) : null, y: ident(it.y), spec: {} })), opts: [] }));
    (extra || []).forEach((t) => add.push(t));
    lines.splice(at, 0, ...add);
    return figLine;
  }

  // smaže celou skupinu grafu (a prázdný blok)
  function removeFigure(lines, fig) {
    const { g } = ctxFor(lines, fig);
    let from = g.start;
    const to = g.end;
    if (from > 1 && lines[from - 2].trim() === '' && to >= lines.length) from--;
    lines.splice(from - 1, to - from + 1);
    const an = analyze(lines);
    if (an.block && !an.stmts.length) {
      let s = an.block.header;
      const e = an.block.end;
      if (s > 1 && lines[s - 2].trim() === '' && e >= lines.length) s--;
      lines.splice(s - 1, e - s + 1);
    }
  }

  /* ---------- převod starých grafů (skrytý JSON) na kód ---------- */
  function htmlToTex(s) {
    s = String(s || '');
    const parts = s.split(/(<sup>|<\/sup>|<sub>|<\/sub>|<[^>]*>)/i);
    let out = '';
    parts.forEach((p) => {
      const t = lc(p);
      if (t === '<sup>') out += '^{';
      else if (t === '<sub>') out += '_{';
      else if (t === '</sup>' || t === '</sub>') out += '}';
      else if (/^<[^>]*>$/.test(p)) out += '';
      else out += p.replace(/\\/g, '\\\\').replace(/([_^{}])/g, '\\$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    });
    return out;
  }

  const OLD_DASH = { solid: '-', dash: '--', dot: ':', dashdot: '-.' };
  const OLD_LEG = { ne: 'northeast', nw: 'northwest', se: 'southeast', sw: 'southwest', out: 'northeastoutside', below: 'southoutside' };

  // f = starý objekt grafu { title, x, series, xlabel, …}; scope pro jednotky automatických popisků
  function fromOldFigure(f, scope) {
    const out = ['figure'];
    const unitOf = (n) => { try { return scope && Object.prototype.hasOwnProperty.call(scope, n) ? E.describe(scope[n]).unit : ''; } catch (e) { return ''; } };
    const series = (f.series || []).filter((s) => s && s.var);
    const legendOn = f.legend === 'show' || ((f.legend || 'auto') === 'auto' && series.length >= 2);
    series.forEach((s, i) => {
      // osa X starého grafu (společná) se zkopíruje do každé křivky
      const sp = {};
      const m = { fn: 'plot', pairs: [{ x: f.x ? ident(f.x) : null, y: ident(s.var), spec: sp }], opts: [] };
      const mode = s.mode || 'lines';
      const ls = OLD_DASH[s.dash] || '-';
      if (mode !== 'lines') sp.marker = 'o';
      if (mode === 'markers') { /* jen body */ } else if (ls !== '-' || mode !== 'lines') sp.ls = ls;
      if (s.color && lc(s.color) !== lc(G.PALETTE[i % G.PALETTE.length])) setOpt(m, 'Color', q(String(s.color).toUpperCase()));
      if (s.label || legendOn) setOpt(m, 'DisplayName', q(htmlToTex(s.label || s.var)));
      out.push(serializePlot(m));
      if (i === 0 && series.length > 1) out.push('hold on');
    });
    if (f.title) out.push('title(' + q(htmlToTex(f.title)) + ')');
    const xu = f.x ? unitOf(f.x) : '';
    const xl = f.xlabel || (f.x ? f.x + (xu ? ' [' + xu + ']' : '') : '');
    if (xl) out.push('xlabel(' + q(f.xlabel ? htmlToTex(xl) : htmlToTex(xl)) + ')');
    let yl = f.ylabel;
    if (!yl) {
      const us = series.map((s) => unitOf(s.var));
      if (series.length === 1) yl = series[0].var + (us[0] ? ' [' + us[0] + ']' : '');
      else if (us.length && us.every((u) => u && u === us[0])) yl = '[' + us[0] + ']';
    }
    if (yl) out.push('ylabel(' + q(htmlToTex(yl)) + ')');
    if (f.xlog) out.push("set(gca, 'XScale', 'log')");
    if (f.ylog) out.push("set(gca, 'YScale', 'log')");
    const lim = (a, b) => { const p = (v, inf) => { const t = String(v == null ? '' : v).trim().replace(',', '.'); return t === '' || !Number.isFinite(Number(t)) ? inf : t; }; return '([' + p(a, '-Inf') + ' ' + p(b, 'Inf') + '])'; };
    if (String(f.xmin || '').trim() || String(f.xmax || '').trim()) out.push('xlim' + lim(f.xmin, f.xmax));
    if (String(f.ymin || '').trim() || String(f.ymax || '').trim()) out.push('ylim' + lim(f.ymin, f.ymax));
    if (legendOn) {
      const loc = OLD_LEG[f.legendPos] || 'northeast';
      out.push(loc === 'northeast' ? 'legend show' : "legend('Location', " + q(loc) + ')');
    }
    if (f.grid !== false) out.push('grid on');
    if (f.box === false) out.push('box off');
    return out;
  }

  // připojí staré grafy ke kódu jako blok %% Grafy; vrací nový kód
  function migrate(code, figures, scope) {
    const figs = (figures || []).filter((f) => f && Array.isArray(f.series) && f.series.some((s) => s && s.var));
    if (!figs.length) return code;
    const lines = String(code).replace(/\s+$/, '').split('\n');
    ensureBlock(lines);
    figs.forEach((f) => {
      const an = analyze(lines);
      let at = an.block.end;
      while (at > an.block.header && lines[at - 1].trim() === '') at--;
      const add = (an.stmts.length ? [''] : []).concat(fromOldFigure(f, scope));
      lines.splice(at, 0, ...add);
    });
    return lines.join('\n') + '\n';
  }

  MC.plotcode = {
    HEADER, HEADER_RE, SECTION_RE,
    analyze, groupOf, byFn, plotModel, serializePlot, legendModel, setModel, represented, commonX, isTight,
    sideMap, sideOf, hasRight, yyWord,
    curvesOf, xOf, lastX, setCurveData, addCurve, deleteCurve, isolate,
    setText, setLim, setScale, setFlag, setTight, setLegend, setSeries, setSide, deleteStmt, cleanupRight,
    setX, removeVars, newFigure, removeFigure, ensureBlock,
    timeModel, timeOf, timeDefs,
    migrate, fromOldFigure, htmlToTex, q,
  };
})();
