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
  function plotModel(st) {
    if (!st || !st.simple || !G.PLOT_FNS.has(st.call.fn)) return null;
    const a = st.call.args;
    let i = 0;
    const data = [];
    while (i < a.length && a[i].kind !== 'str' && a[i].kind !== 'cellstr') data.push(a[i++]);
    if (data.length < 1 || data.length > 2) return null;
    let spec = {};
    if (i < a.length && a[i].kind === 'str' && G.parseSpec(a[i].value)) { spec = G.parseSpec(a[i].value); i++; }
    const opts = [];
    for (; i < a.length; i += 2) {
      if (a[i].kind !== 'str' || !a[i + 1]) return null;
      opts.push([a[i].value, a[i + 1]]);
    }
    const m = { fn: st.call.fn, x: data.length === 2 ? data[0] : null, y: data[data.length - 1], spec, opts };
    m.editable = m.y.kind === 'ident' && (!m.x || m.x.kind === 'ident');
    return m;
  }
  const getOpt = (m, name) => { const o = m.opts.find((p) => lc(p[0]) === lc(name)); return o ? o[1] : null; };
  function setOpt(m, name, text) {
    const k = m.opts.findIndex((p) => lc(p[0]) === lc(name));
    if (text === null || text === undefined) { if (k >= 0) m.opts.splice(k, 1); return; }
    const arg = { kind: 'expr', text };
    if (k >= 0) m.opts[k] = [m.opts[k][0], arg]; else m.opts.push([name, arg]);
  }
  function serializePlot(m) {
    const args = [];
    if (m.x) args.push(m.x.text);
    args.push(m.y.text);
    const sp = (m.spec.color || '') + (m.spec.ls || '') + (m.spec.marker || '');
    if (sp) args.push(q(sp));
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

  function lastPlotLine(g) {
    const p = byFn(g, ['plot', 'semilogx', 'semilogy', 'loglog']);
    return p.length ? p[p.length - 1].endLine : null;
  }

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

  // legenda: viditelnost a poloha. Při zapnutí doplní DisplayName podle názvu proměnné.
  function setLegend(lines, fig, visible, location) {
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
      g.stmts.forEach((s) => {
        const pm = plotModel(s);
        if (pm && pm.editable && !getOpt(pm, 'DisplayName')) { setOpt(pm, 'DisplayName', q(pm.y.text)); replaceStmt(lines, s, serializePlot(pm)); }
      });
    }
  }

  /**
   * Změna jedné křivky (řádek plot). ch = { y, x, color, ls, marker, width, label, labelIndex }
   * color: '#RRGGBB' (písmeno r/g/b… se použije, když barva přesně odpovídá)
   */
  function setSeries(lines, fig, stmtLine, ch) {
    const { g } = ctxFor(lines, fig);
    const st = g.stmts.find((s) => s.line === stmtLine);
    const m = plotModel(st);
    if (!m || !m.editable) throw new Error('Řádek ' + stmtLine + ' je ručně psaný – uprav ho v editoru');
    if (ch.y !== undefined) m.y = { kind: 'ident', text: ch.y };
    if (ch.x !== undefined) m.x = ch.x ? { kind: 'ident', text: ch.x } : null;
    if (ch.color !== undefined) {
      const letter = Object.keys(G.COLOR_LETTERS).find((k) => G.COLOR_LETTERS[k].toLowerCase() === String(ch.color).toLowerCase());
      if (letter) { m.spec.color = letter; setOpt(m, 'Color', null); } else { delete m.spec.color; setOpt(m, 'Color', ch.color ? q(ch.color.toUpperCase()) : null); }
    }
    if (ch.ls !== undefined || ch.marker !== undefined) {
      let ls = ch.ls !== undefined ? ch.ls : (getOpt(m, 'LineStyle') ? getOpt(m, 'LineStyle').text.replace(/'/g, '') : m.spec.ls || (m.spec.marker ? 'none' : '-'));
      let mk = ch.marker !== undefined ? ch.marker : (m.spec.marker || 'none');
      if (ls === 'none' && mk === 'none') mk = 'o';
      setOpt(m, 'LineStyle', null);
      setOpt(m, 'Marker', null);
      delete m.spec.ls;
      delete m.spec.marker;
      if (mk !== 'none') { m.spec.marker = mk; if (ls !== 'none') m.spec.ls = ls; } else if (ls !== '-') m.spec.ls = ls;
    }
    if (ch.width !== undefined) {
      const w = Number(String(ch.width).replace(',', '.'));
      setOpt(m, 'LineWidth', Number.isFinite(w) && w > 0 && w !== 0.5 ? fmtNum(w) : null);
    }
    let legendEdit = null;
    if (ch.label !== undefined) {
      const leg = byFn(g, 'legend').map((s) => ({ s, m: legendModel(s) })).filter((o) => o.m && o.m.labels.length).pop();
      if (leg && ch.labelIndex !== undefined && ch.labelIndex < leg.m.labels.length) {
        leg.m.labels[ch.labelIndex] = ch.label;
        legendEdit = leg;
      } else setOpt(m, 'DisplayName', ch.label === '' ? null : q(ch.label));
    }
    replaceStmt(lines, st, serializePlot(m));
    if (legendEdit) replaceStmt(lines, legendEdit.s, serializeLegend(legendEdit.m));
  }

  function deleteStmt(lines, lineNo, fig) {
    deleteLine(lines, lineNo);
    if (fig) cleanupRight(lines, fig);
  }

  /**
   * Přesune řádek plot na levou / pravou osu Y (yyaxis). Na pravou ho dá za poslední
   * křivku vpravo (nebo za „yyaxis right“, případně ho na konec skupiny přidá),
   * na levou za poslední křivku vlevo. Když vpravo nic nezbude, pravá osa zmizí.
   */
  function setSide(lines, fig, stmtLine, side) {
    let { g } = ctxFor(lines, fig);
    const st = g.stmts.find((s) => s.line === stmtLine);
    if (!st || !plotModel(st) || !st.single) throw new Error('Řádek ' + stmtLine + ' je ručně psaný – uprav ho v editoru');
    const sm = sideMap(g);
    if (sm.get(st) === side) return;
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
      if (!yy.length) { insertAfter(lines, g.last, ['yyaxis right', plain], ind); return; }
      at = yy[yy.length - 1].endLine;
    } else {
      // za úvodní figure / hold / yyaxis left na začátku skupiny
      let k = 0;
      while (k + 1 < g.stmts.length && g.stmts[k + 1].call && ['figure', 'hold'].includes(g.stmts[k + 1].call.fn)) k++;
      at = g.stmts[k].endLine;
      if (sm2.get(g.stmts[k]) !== 'left') {
        const yl = g.stmts.filter((s) => yyWord(s) === 'left');
        if (!yl.length) { insertAfter(lines, g.last, ['yyaxis left', plain], ind); return; }
        at = yl[yl.length - 1].endLine;
      }
    }
    // druhá křivka na stejné straně potřebuje hold on (jinak by první nahradila)
    const add = [];
    if (plots.length && !holdBefore(g, at + 1)) add.push(ind + 'hold on');
    add.push(text);
    lines.splice(at, 0, ...add);
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

  // společná osa X jednoduchých řádků plot ('' = index, null = různé / žádné)
  function commonX(g) {
    const ms = g.stmts.map(plotModel).filter((m) => m && m.editable);
    if (!ms.length) return null;
    const xs = new Set(ms.map((m) => (m.x ? m.x.text : '')));
    return xs.size === 1 ? [...xs][0] : null;
  }

  // nastaví proměnnou na ose X ve všech jednoduchých řádcích plot; vrací počet přeskočených
  function setX(lines, fig, name) {
    const { g } = ctxFor(lines, fig);
    let changed = 0;
    let skipped = 0;
    const dels = [];
    g.stmts.forEach((s) => {
      if (!s.call || !G.PLOT_FNS.has(s.call.fn)) return;
      const m = plotModel(s);
      if (!m || !m.editable) { skipped++; return; }
      if (name && m.y.text === name) { dels.push(s.line); return; }   // proměnná nemůže být sama proti sobě
      m.x = name ? { kind: 'ident', text: name } : null;
      replaceStmt(lines, s, serializePlot(m));
      changed++;
    });
    dels.reverse().forEach((l) => deleteLine(lines, l));
    dropUnusedTime(lines, fig);
    return { changed, skipped };
  }

  // řádek s časovou osou, kterou už nic ve skupině nepoužívá, zmizí
  function dropUnusedTime(lines, fig) {
    const { g } = ctxFor(lines, fig);
    const times = g.stmts.map(timeModel).filter(Boolean);
    const dead = times.filter((t) => !g.stmts.some((s) => s !== t.st && new RegExp('(^|[^A-Za-z0-9_])' + t.name + '([^A-Za-z0-9_]|$)').test(s.code)));
    dead.reverse().forEach((t) => deleteLine(lines, t.st.line));
  }

  /**
   * Osa X jako čas z periody vzorkování: vloží (nebo upraví) řádek
   * t = (0:numel(y)-1)*dt před první plot a nastaví t na osu X.
   * taken = názvy, které už ve workspace jsou (aby se nepřepsala jiná proměnná t)
   */
  function setTimeX(lines, fig, dt, taken) {
    const { g } = ctxFor(lines, fig);
    const plots = g.stmts.filter((s) => s.call && G.PLOT_FNS.has(s.call.fn));
    const models = plots.map(plotModel).filter((m) => m && m.editable);
    if (!models.length) throw new Error('Nejdřív přidej křivku na osu Y – délka časového vektoru se odvodí z ní');
    const tm = timeOf(g);
    let name;
    if (tm) {
      name = tm.name;
      replaceStmt(lines, tm.st, name + ' = (0:numel(' + tm.ref + ')-1)*' + dt);
    } else {
      const ref = models[0].y.text;
      const used = new Set(taken || []);
      const cands = ['t', 't_' + ref];
      for (let k = 2; k < 50; k++) cands.push('t' + k);
      name = cands.find((c) => !used.has(c) && c !== ref);
      insertAfter(lines, plots[0].line - 1, name + ' = (0:numel(' + ref + ')-1)*' + dt + ';', indentOf(lines, g));
    }
    return setX(lines, fig, name);
  }

  // změna periody u existující časové osy
  function setTimeDt(lines, fig, dt) {
    const { g } = ctxFor(lines, fig);
    const tm = timeOf(g);
    if (!tm) throw new Error('Graf nemá časovou osu');
    replaceStmt(lines, tm.st, tm.name + ' = (0:numel(' + tm.ref + ')-1)*' + dt);
  }

  // přidá křivky plot(x, název) – za poslední plot na levé ose, případně doplní hold on
  function addY(lines, fig, names, xname, withNames) {
    names.forEach((n) => {
      const { g } = ctxFor(lines, fig);
      const m = { fn: 'plot', x: xname ? { kind: 'ident', text: xname } : null, y: { kind: 'ident', text: n }, spec: {}, opts: [] };
      if (withNames) setOpt(m, 'DisplayName', q(n));
      const ind = indentOf(lines, g);
      const sm = sideMap(g);
      const lefts = g.stmts.filter((s) => isPlot(s) && sm.get(s) === 'left');
      let after = hasYy(g) ? (lefts.length ? lefts[lefts.length - 1].endLine : null) : lastPlotLine(g);
      if (after !== null) {
        if (!holdBefore(g, after + 1)) { insertAfter(lines, after, 'hold on', ind); after++; }
      } else {
        // za figure / hold on na začátku skupiny
        let k = 0;
        while (k + 1 < g.stmts.length && g.stmts[k + 1].call && ['figure', 'hold'].includes(g.stmts[k + 1].call.fn)) k++;
        after = g.stmts[k].endLine;
        // v grafu s yyaxis ještě před první křivku vpravo (aby nová křivka byla vlevo)
        if (sm.get(g.stmts[k]) === 'right') {
          const yl = g.stmts.filter((s) => yyWord(s) === 'left');
          if (yl.length) after = yl[yl.length - 1].endLine; else { insertAfter(lines, g.last, ['yyaxis left', serializePlot(m)], ind); return; }
        }
        if (g.stmts.some((s) => isPlot(s) && s.endLine <= after) && !holdBefore(g, after + 1)) { insertAfter(lines, after, 'hold on', ind); after++; }
      }
      insertAfter(lines, after, serializePlot(m), ind);
    });
  }

  // odebere proměnné z grafu (řádky plot s nimi na ose Y; z osy X je jen sundá)
  function removeVars(lines, fig, names) {
    const { g } = ctxFor(lines, fig);
    let skipped = 0;
    const edits = [];
    g.stmts.forEach((s) => {
      if (!s.call || !G.PLOT_FNS.has(s.call.fn)) return;
      const m = plotModel(s);
      if (!m || !m.editable) { skipped++; return; }
      if (names.includes(m.y.text)) edits.push({ line: s.line, del: true });
      else if (m.x && names.includes(m.x.text)) { m.x = null; edits.push({ line: s.line, st: s, code: serializePlot(m) }); }
    });
    edits.sort((a, b) => b.line - a.line).forEach((e) => { if (e.del) deleteLine(lines, e.line); else replaceStmt(lines, e.st, e.code); });
    cleanupRight(lines, fig);
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

  // nový graf na konci bloku; vrací číslo řádku s příkazem figure
  function newFigure(lines, names, xname, extra) {
    const an = ensureBlock(lines);
    const b = an.block;
    let at = b.end;                                         // poslední řádek bloku
    while (at > b.header && lines[at - 1].trim() === '') at--;  // bez prázdných řádků na konci
    const add = [];
    if (an.stmts.length) add.push('');
    const figLine = at + add.length + 1;
    add.push('figure');
    (names || []).forEach((n, k) => {
      add.push(serializePlot({ fn: 'plot', x: xname ? { text: xname } : null, y: { text: n }, spec: {}, opts: [] }));
      if (k === 0 && names.length > 1) add.push('hold on');
    });
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
      const m = { fn: 'plot', x: f.x ? { text: f.x } : null, y: { text: s.var }, spec: {}, opts: [] };
      const mode = s.mode || 'lines';
      const ls = OLD_DASH[s.dash] || '-';
      if (mode !== 'lines') m.spec.marker = 'o';
      if (mode === 'markers') { /* jen body */ } else if (ls !== '-' || mode !== 'lines') m.spec.ls = ls;
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
    analyze, groupOf, byFn, plotModel, legendModel, setModel, represented, commonX, isTight,
    sideMap, sideOf, hasRight, yyWord,
    setText, setLim, setScale, setFlag, setTight, setLegend, setSeries, setSide, deleteStmt, cleanupRight,
    setX, addY, removeVars, newFigure, removeFigure, ensureBlock,
    timeModel, timeOf, setTimeX, setTimeDt,
    migrate, fromOldFigure, htmlToTex, q,
  };
})();
