/* =====================================================================
   MatCalc – vykreslení grafů (Plotly)
   ---------------------------------------------------------------------
   Kreslí stav, který vytvořily grafické příkazy ve skriptu
   (graphics.js). Tady se jen převádí MATLABovské vlastnosti os a čar
   na Plotly a TeX v popiscích (^{24}Na, P_z, \sigma) na HTML.

   Výchozí pohled („domov“) je vždy spočítaný z xlim/ylim grafu – reset
   os a dvojklik se vrací na něj, zoom myší je jen dočasný. Je-li zadaný
   jen xlim, osa Y se přizpůsobí datům uvnitř tohoto rozsahu.
   Barvy mají světlou a tmavou variantu; export obrázku je vždy světlý.
   ===================================================================== */
(function () {
  'use strict';
  const MC = (window.MC = window.MC || {});
  const G = MC.graphics;

  const FONT = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif';
  const PT = 1.25;   // body (MATLAB) -> px

  /* ---------- barevné motivy grafu ---------- */
  const THEMES = {
    light: {
      ink: '#1d1d1f', axis: '#3a3a3a', grid: '#e1e1e1', minorGrid: '#f1f1f1', paper: '#ffffff', plot: '#ffffff',
      legendBg: 'rgba(255,255,255,0.92)', legendBorder: '#9a9a9a', hoverBg: '#ffffff', hoverBorder: '#c8c8c8',
    },
    dark: {
      ink: '#e4e6e9', axis: '#a9b0b8', grid: '#353a41', minorGrid: '#2a2e34', paper: '#1c1f23', plot: '#1c1f23',
      legendBg: 'rgba(28,31,35,0.92)', legendBorder: '#59606a', hoverBg: '#25292e', hoverBorder: '#4a5058',
    },
  };
  // barvy křivek na tmavém pozadí: paleta MATLABu se stejnými odstíny, jen světlejší
  // (ověřeno na rozlišitelnost i pro barvoslepé a kontrast ≥ 3:1 proti #1c1f23)
  const DARK_PALETTE = {
    '#0072BD': '#2D8BD8', '#D95319': '#E65F29', '#7E2F8E': '#A454B4', '#B98500': '#BE890E',
    '#2A9BD0': '#309FD4', '#A2142F': '#C53C4B', '#5A9A1F': '#67A832',
  };

  // --- převod barev (sRGB <-> OKLCH) pro úpravu ručně zadaných barev v tmavém režimu
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const gam = (c) => { const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; return Math.round(Math.min(1, Math.max(0, v)) * 255); };
  const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lum = (rgb) => { const [r, g, b] = rgb.map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contrast = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  function toOklch(rgb) {
    const [r, g, b] = rgb.map(lin);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
    const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    return [L, Math.hypot(A, B), Math.atan2(B, A)];
  }
  function fromOklch(L, C, H) {
    const A = C * Math.cos(H);
    const B = C * Math.sin(H);
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
    const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
    const s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
  }
  const darkCache = {};
  // barva čitelná na tmavém pozadí: paleta -> tmavá paleta, černá/šedá -> světlý text,
  // ostatní tmavé barvy se zesvětlí (stejný odstín) na kontrast aspoň 3:1
  function forDark(c, th) {
    if (typeof c !== 'string' || !/^#[0-9a-f]{6}$/i.test(c)) return c;
    const key = c.toUpperCase();
    if (DARK_PALETTE[key]) return DARK_PALETTE[key];
    if (darkCache[key]) return darkCache[key];
    const bg = hexRgb(th.plot);
    const rgb = hexRgb(key);
    let out = key;
    if (contrast(rgb, bg) < 3) {
      const [L0, C0, H] = toOklch(rgb);
      if (C0 < 0.03) out = th.ink;
      else {
        for (let L = Math.max(L0, 0.45); L <= 0.95; L += 0.01) {
          let C = C0;
          let v = fromOklch(L, C, H);
          while (C > 0 && !v.every((x) => x >= -1e-4 && x <= 1 + 1e-4)) { C -= 0.004; v = fromOklch(L, C, H); }
          const cand = v.map(gam);
          if (contrast(cand, bg) >= 3) { out = '#' + cand.map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase(); break; }
        }
      }
    }
    darkCache[key] = out;
    return out;
  }

  /* ---------- TeX -> HTML pro Plotly ---------- */
  const SYMBOLS = {
    alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ',
    iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', varpi: 'ϖ', rho: 'ρ', sigma: 'σ', varsigma: 'ς',
    tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
    Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
    circ: '°', degree: '°', pm: '±', mp: '∓', times: '×', cdot: '·', div: '÷', infty: '∞', leq: '≤', le: '≤', geq: '≥', ge: '≥',
    neq: '≠', ne: '≠', approx: '≈', sim: '∼', equiv: '≡', propto: '∝', partial: '∂', nabla: '∇', surd: '√', int: '∫',
    sum: '∑', prod: '∏', rightarrow: '→', to: '→', leftarrow: '←', leftrightarrow: '↔', uparrow: '↑', downarrow: '↓',
    Rightarrow: '⇒', Leftarrow: '⇐', Leftrightarrow: '⇔', bullet: '•', ldots: '…', cdots: '⋯', prime: '′', hbar: 'ℏ', ell: 'ℓ',
    Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ', forall: '∀', exists: '∃', in: '∈', notin: '∉', subset: '⊂', supset: '⊃', cup: '∪', cap: '∩',
    angle: '∠', perp: '⊥', mid: '|', langle: '⟨', rangle: '⟩', neg: '¬', wedge: '∧', vee: '∨', oplus: '⊕', otimes: '⊗',
    copyright: '©', ll: '≪', gg: '≫', emptyset: '∅', diamond: '◇', star: '⋆', dagger: '†', ddagger: '‡',
  };
  const escH = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  function texToHtml(src, interp) {
    src = String(src == null ? '' : src);
    if (interp === 'none') return escH(src).replace(/\n/g, '<br>');
    let i = 0;
    const command = () => {           // za zpětným lomítkem
      const m = src.slice(i + 1).match(/^[A-Za-z]+/);
      if (!m) { const ch = src[i + 1]; i += ch === undefined ? 1 : 2; return { text: escH(ch === undefined ? '\\' : ch) }; }
      let w = m[0];
      // MATLAB pozná i '\\circC' (= \\circ + C): vezme nejdelší známý začátek slova
      if (!Object.prototype.hasOwnProperty.call(SYMBOLS, w) && !/^(bf|it|sl|rm|color|fontsize|fontname)$/.test(w)) {
        for (let k = w.length - 1; k > 1; k--) if (Object.prototype.hasOwnProperty.call(SYMBOLS, w.slice(0, k))) { w = w.slice(0, k); break; }
      }
      i += 1 + w.length;
      return { word: w };
    };
    const braceArg = () => {
      if (src[i] !== '{') return '';
      const end = src.indexOf('}', i);
      if (end < 0) return '';
      const a = src.slice(i + 1, end);
      i = end + 1;
      return a;
    };
    function group(endCh) {
      let out = '';
      while (i < src.length) {
        const c = src[i];
        if (endCh && c === endCh) { i++; return out; }
        if (c === '\\') {
          const t = command();
          if (t.text !== undefined) { out += t.text; continue; }
          const w = t.word;
          if (w === 'bf' || w === 'it' || w === 'sl' || w === 'rm') {
            if (src[i] === ' ') i++;
            const rest = group(endCh);
            return out + (w === 'bf' ? '<b>' + rest + '</b>' : w === 'rm' ? rest : '<i>' + rest + '</i>');
          }
          if (w === 'color') {
            const col = braceArg().replace(/[^#A-Za-z0-9]/g, '');
            const rest = group(endCh);
            return out + '<span style="color:' + col + '">' + rest + '</span>';
          }
          if (w === 'fontsize' || w === 'fontname') { braceArg(); continue; }
          out += Object.prototype.hasOwnProperty.call(SYMBOLS, w) ? SYMBOLS[w] : escH('\\' + w);
          continue;
        }
        if (c === '^' || c === '_') {
          i++;
          let inner;
          if (src[i] === '{') { i++; inner = group('}'); }
          else if (src[i] === '\\') { const t = command(); inner = t.text !== undefined ? t.text : (SYMBOLS[t.word] || escH('\\' + t.word)); }
          else if (i < src.length) { inner = escH(src[i]); i++; }
          else { out += c; continue; }
          if (c === '^' && inner === '°') { out += '°'; continue; }     // ^\circ = stupeň
          out += c === '^' ? '<sup>' + inner + '</sup>' : '<sub>' + inner + '</sub>';
          continue;
        }
        if (c === '{') { i++; out += group('}'); continue; }
        if (c === '\n') { out += '<br>'; i++; continue; }
        out += escH(c);
        i++;
      }
      return out;
    }
    return group(null);
  }
  const texPlain = (s, interp) => texToHtml(s, interp).replace(/<br>/g, ' ').replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

  /* ---------- styl čar ---------- */
  const DASH = { '-': 'solid', '--': 'dash', ':': 'dot', '-.': 'dashdot' };
  const SYMBOL = { o: 'circle', s: 'square', d: 'diamond', '^': 'triangle-up', v: 'triangle-down', '<': 'triangle-left', '>': 'triangle-right',
    p: 'star', h: 'hexagram', '+': 'cross-thin', x: 'x-thin', '*': 'asterisk', '.': 'circle', _: 'line-ew', '|': 'line-ns' };
  const THIN = new Set(['+', 'x', '*', '_', '|']);   // symboly, které jsou jen obrys
  const lineW = (w) => 1 + w;                         // LineWidth 0.5 (výchozí v MATLABu) -> 1.5 px

  function lineName(ln, k) { return ln.displayName || 'data' + (k + 1); }

  function trace(ln, k, interp, col) {
    const name = lineName(ln, k);
    const showLine = ln.ls !== 'none';
    const showMk = ln.marker !== 'none';
    const color = col(ln.color);
    const t = {
      type: 'scatter',
      mode: showLine && showMk ? 'lines+markers' : showLine ? 'lines' : showMk ? 'markers' : 'none',
      name: texToHtml(name, interp),
      x: ln.x,
      y: ln.y,
      showlegend: ln.inLegend !== false,
      line: { color, width: lineW(ln.width), dash: DASH[ln.ls] || 'solid' },
      hovertemplate: escH(texPlain(name, interp)) + ': %{y:.5~g}' + (ln.yunit ? ' ' + escH(ln.yunit) : '') + '<extra></extra>',
    };
    if (ln.side === 'right') t.yaxis = 'y2';
    if (showMk) {
      const edge = ln.mec && ln.mec !== 'auto' ? col(ln.mec) : color;
      const filled = ln.marker === '.' || (ln.mfc && ln.mfc !== 'none');
      const face = ln.mfc === 'auto' ? color : col(ln.mfc);
      let sym = SYMBOL[ln.marker] || 'circle';
      if (!filled || THIN.has(ln.marker)) sym += '-open';
      t.marker = {
        symbol: sym,
        size: ln.marker === '.' ? Math.max(3, ln.markerSize * 0.75) : ln.markerSize * 1.2,
        color: filled && !THIN.has(ln.marker) ? (ln.marker === '.' ? color : face) : edge,
        line: { color: edge, width: Math.max(1, lineW(ln.width) * 0.8) },
      };
    }
    return t;
  }

  /* ---------- osy ---------- */
  const LEG = {
    northeast: { x: 0.99, xanchor: 'right', y: 0.99, yanchor: 'top' },
    northwest: { x: 0.01, xanchor: 'left', y: 0.99, yanchor: 'top' },
    southeast: { x: 0.99, xanchor: 'right', y: 0.01, yanchor: 'bottom' },
    southwest: { x: 0.01, xanchor: 'left', y: 0.01, yanchor: 'bottom' },
    north: { x: 0.5, xanchor: 'center', y: 0.99, yanchor: 'top' },
    south: { x: 0.5, xanchor: 'center', y: 0.01, yanchor: 'bottom' },
    east: { x: 0.99, xanchor: 'right', y: 0.5, yanchor: 'middle' },
    west: { x: 0.01, xanchor: 'left', y: 0.5, yanchor: 'middle' },
    northeastoutside: { x: 1.02, xanchor: 'left', y: 1, yanchor: 'top' },
    eastoutside: { x: 1.02, xanchor: 'left', y: 0.5, yanchor: 'middle' },
    southeastoutside: { x: 1.02, xanchor: 'left', y: 0, yanchor: 'bottom' },
    northwestoutside: { x: -0.1, xanchor: 'right', y: 1, yanchor: 'top' },
    westoutside: { x: -0.1, xanchor: 'right', y: 0.5, yanchor: 'middle' },
    southwestoutside: { x: -0.1, xanchor: 'right', y: 0, yanchor: 'bottom' },
    northoutside: { x: 0.5, xanchor: 'center', y: 1.02, yanchor: 'bottom', orientation: 'h' },
    southoutside: { x: 0.5, xanchor: 'center', y: -0.16, yanchor: 'top', orientation: 'h' },
  };
  LEG.best = LEG.northeast;
  LEG.bestoutside = LEG.northeastoutside;
  LEG.none = LEG.northeast;

  function figLabel(fig) {
    if (fig.name) return fig.numberTitle ? 'Figure ' + fig.num + ': ' + fig.name : fig.name;
    return 'Figure ' + fig.num;
  }

  // rozsah hodnot key ('x' / 'y') v souřadnicích osy; xr = [od, do] – jen body s x v tomto rozsahu
  function dataRange(lines, key, conv, xr) {
    let lo = Infinity;
    let hi = -Infinity;
    lines.forEach((ln) => {
      const v = ln[key];
      for (let i = 0; i < v.length; i++) {
        if (xr) { const x = ln.x[i]; if (!(x >= xr[0] && x <= xr[1])) continue; }
        const c = conv(v[i]);
        if (c !== null && Number.isFinite(c)) { if (c < lo) lo = c; if (c > hi) hi = c; }
      }
    });
    return lo <= hi ? [lo, hi] : null;
  }

  /**
   * Výchozí rozsah osy (v souřadnicích osy, u log osy v dekádách) nebo null = automaticky.
   * lim – xlim/ylim z kódu (±Inf = automaticky z té strany); xr – rozsah x, ve kterém
   * se hledá rozsah y (zadaný xlim); padY – okraj 5 % u osy Y jako v MATLABu.
   */
  function homeRange(lim, log, lines, key, xr, padY) {
    const conv = (v) => (log ? (v > 0 ? Math.log10(v) : null) : v);
    let lo = lim && Number.isFinite(lim[0]) ? conv(lim[0]) : null;
    let hi = lim && Number.isFinite(lim[1]) ? conv(lim[1]) : null;
    if (lo !== null && hi !== null) return [lo, hi];
    if (lo === null && hi === null && !xr) return null;          // úplně automaticky
    const d = dataRange(lines, key, conv, xr);
    if (!d) return lo === null && hi === null ? null : lo !== null ? [lo, lo + 1] : [hi - 1, hi];
    let [dlo, dhi] = d;
    if (dlo === dhi) { const e = dlo === 0 ? 1 : Math.abs(dlo) * 0.1; dlo -= e; dhi += e; }
    const pad = padY ? (dhi - dlo) * 0.05 : 0;
    if (lo === null && hi === null) return [dlo - pad, dhi + pad];
    if (lo !== null) return [lo, dhi > lo ? dhi + pad : lo + 1];
    return [dlo < hi ? dlo - pad : hi - 1, hi];
  }

  // opts.theme = 'light' | 'dark'
  function build(fig, opts) {
    const th = THEMES[(opts && opts.theme) === 'dark' ? 'dark' : 'light'];
    const dark = th === THEMES.dark;
    const col = (c) => (dark ? forDark(c, th) : c);
    const ax = fig.ax;
    const R = ax.yyaxis && ax.right ? ax.right : null;
    const warnings = [];
    const fs = ax.fontSize ? ax.fontSize * PT : 12;
    const lfs = ax.fontSize ? ax.fontSize * 1.1 * PT : 13;
    const family = ax.fontName ? '"' + ax.fontName + '", ' + FONT : FONT;
    const traces = ax.lines.map((ln, k) => trace(ln, k, ax.legend && ax.legend.interp, col));
    const leftLines = ax.lines.filter((ln) => ln.side !== 'right');
    const rightLines = ax.lines.filter((ln) => ln.side === 'right');

    const logWarn = (log, lines, k, name) => {
      if (log && lines.some((ln) => ln[k].some((v) => !(v > 0)))) warnings.push('Na logaritmické ose ' + name + ' se nulové a záporné hodnoty nezobrazí.');
    };
    logWarn(ax.xscale === 'log', ax.lines, 'x', 'X');
    logWarn(ax.yscale === 'log', leftLines, 'y', R ? 'Y vlevo' : 'Y');
    if (R) logWarn(R.yscale === 'log', rightLines, 'y', 'Y vpravo');

    const txt = (t, size, bold, color) => {
      if (!t || t.text === '') return { text: '' };
      let h = texToHtml(t.text, t.interp);
      const b = t.bold === undefined ? bold : t.bold;
      if (b) h = '<b>' + h + '</b>';
      if (t.italic) h = '<i>' + h + '</i>';
      const font = { size: t.fontSize ? t.fontSize * PT : size, color: t.color ? col(t.color) : color || th.ink };
      return { text: h, font };
    };

    // výchozí pohled: x z xlim, y z ylim; bez ylim, ale se zadaným xlim se y přizpůsobí datům v rozsahu x
    const xlog = ax.xscale === 'log';
    const hx = homeRange(ax.xlim, xlog, ax.lines, 'x', null, false);
    const xr = ax.xlim && hx ? (xlog ? [Math.pow(10, hx[0]), Math.pow(10, hx[1])] : hx.slice()) : null;
    const home = {
      x: hx, xrev: ax.xdir === 'reverse',
      y: homeRange(ax.ylim, ax.yscale === 'log', leftLines, 'y', xr, true), yrev: ax.ydir === 'reverse',
      has2: !!R,
    };
    if (R) { home.y2 = homeRange(R.ylim, R.yscale === 'log', rightLines, 'y', xr, true); home.y2rev = R.ydir === 'reverse'; }

    // P = vlastnosti osy (ax pro x a levou y, R pro pravou y); lines = křivky na ose
    const axis = (a, P, lines, range, rev, mainColor) => {
      const log = P[a + 'scale'] === 'log';
      const colr = P[a + 'color'] ? col(P[a + 'color']) : mainColor || null;
      const lineCol = colr || th.axis;
      const o = {
        title: Object.assign(txt(P[a + 'label'], lfs, false, colr), { standoff: 10 }),
        type: log ? 'log' : 'linear',
        showline: true, linecolor: lineCol, linewidth: ax.lineWidth ? Math.max(1, ax.lineWidth * PT) : 1,
        mirror: ax.box && !(a === 'y' && R) ? 'ticks' : false,
        ticks: 'inside', ticklen: 5, tickcolor: lineCol,
        tickfont: { size: fs, color: colr || th.ink },
        showgrid: !!ax[a + 'grid'], gridcolor: th.grid, gridwidth: 1,
        zeroline: false,
        automargin: true,
        exponentformat: 'power',
        hoverformat: '.5~g',
        visible: !ax.axisOff,
      };
      if (P[a + 'minor'] || P[a + 'minortick'] || log) {
        o.minor = { ticks: P[a + 'minortick'] || log ? 'inside' : '', ticklen: 3, tickcolor: lineCol, showgrid: !!P[a + 'minor'], gridcolor: th.minorGrid };
      }
      if (P[a + 'tick']) { o.tickmode = 'array'; o.tickvals = P[a + 'tick']; }
      if (range) { o.range = rev ? [range[1], range[0]] : range.slice(); o.autorange = false; }
      else o.autorange = rev ? 'reversed' : true;
      // logaritmická osa: popisky jen po dekádách (10^n) jako v MATLABu, když je rozsah dost velký
      if (log && !P[a + 'tick']) {
        const conv = (v) => (v > 0 ? Math.log10(v) : null);
        const d = range || dataRange(lines, a, conv, null);
        if (d && Math.abs(d[1] - d[0]) >= 1.5) { o.dtick = 1; o.minor = Object.assign(o.minor || {}, { dtick: 'D1' }); }
      }
      return o;
    };

    const L = ax.legend;
    const showLegend = !!(L && L.visible && ax.lines.some((ln) => ln.inLegend !== false));
    const pos = Object.assign({}, LEG[(L && L.location) || 'northeast'] || LEG.northeast);
    if (L && L.location === 'southoutside' && ax.xlabel && ax.xlabel.text) pos.y = -0.24;
    if (R && pos.x > 1) pos.x = 1.12;                 // legenda vně vpravo až za pravou osou
    if (L && L.orientation === 'horizontal') pos.orientation = 'h';
    if (L && L.orientation === 'vertical') delete pos.orientation;
    const legend = Object.assign({
      bgcolor: L && L.box === false ? 'rgba(0,0,0,0)' : (L && L.color ? col(L.color) : th.legendBg),
      bordercolor: L && L.edgeColor ? col(L.edgeColor) : th.legendBorder,
      borderwidth: L && L.box === false ? 0 : 1,
      font: { size: L && L.fontSize ? L.fontSize * PT : fs, color: L && L.textColor ? col(L.textColor) : th.ink },
    }, pos);
    if (L && L.title) legend.title = { text: texToHtml(L.title) };

    const title = txt(ax.title, ax.fontSize ? ax.fontSize * 1.1 * PT : 15, true);
    const layout = {
      title: Object.assign(title, { x: 0.5, xanchor: 'center' }),
      xaxis: axis('x', ax, ax.lines, home.x, home.xrev),
      yaxis: axis('y', ax, leftLines, home.y, home.yrev),
      showlegend: showLegend,
      legend,
      margin: { l: 64, r: R ? 64 : 22, t: title.text ? 48 : 20, b: 52 },
      paper_bgcolor: !dark && fig.color ? fig.color : th.paper,
      plot_bgcolor: th.plot,
      font: { family, size: fs, color: th.ink },
      colorway: dark ? G.PALETTE.map((c) => DARK_PALETTE[c] || c) : G.PALETTE,
      hovermode: 'x unified',
      hoverlabel: { bgcolor: th.hoverBg, bordercolor: th.hoverBorder, font: { family: FONT, size: 12, color: th.ink } },
      // změna mezí nebo měřítka zahodí dočasný zoom; ostatní změny (titulek, barvy…) ho nechají
      uirevision: [fig.num, ax.xscale, ax.yscale, R ? R.yscale : '', JSON.stringify([home.x, home.y, home.y2]), ax.xdir, ax.ydir, R ? R.ydir : '', !!R].join('|'),
    };
    if (R) {
      // pravá osa: popisky a čísla v barvě její křivky, když je na ní jedna
      const one = rightLines.length === 1 ? col(rightLines[0].color) : null;
      // prázdná pravá osa (yyaxis bez křivky vpravo) se v Plotly ukáže jen s nějakou stopou
      if (!rightLines.length) traces.push({ type: 'scatter', mode: 'none', x: [], y: [], yaxis: 'y2', showlegend: false, hoverinfo: 'skip' });
      layout.yaxis2 = Object.assign(axis('y', R, rightLines, home.y2, home.y2rev, one), { overlaying: 'y', side: 'right', showgrid: false, mirror: false });
      if (layout.yaxis2.minor) layout.yaxis2.minor.showgrid = false;
    }
    if (ax.equal) { layout.yaxis.scaleanchor = 'x'; layout.yaxis.scaleratio = 1; }
    return { traces, layout, warnings, home };
  }

  /* ---------- reset os (dvojklik, tlačítko domečku) ---------- */
  // Vrátí pohled na výchozí rozsah grafu – xlim/ylim z kódu, jinak automaticky.
  function resetView(div) {
    const h = div && div._mcHome;
    if (!h || !div.data || !window.Plotly) return;
    const upd = {};
    const set = (name, r, rev) => {
      if (r) { upd[name + '.range'] = rev ? [r[1], r[0]] : r.slice(); upd[name + '.autorange'] = false; } else upd[name + '.autorange'] = rev ? 'reversed' : true;
    };
    set('xaxis', h.x, h.xrev);
    set('yaxis', h.y, h.yrev);
    if (h.has2) set('yaxis2', h.y2, h.y2rev);
    window.Plotly.relayout(div, upd);
  }

  function config() {
    const P = window.Plotly;
    return {
      responsive: true,
      displaylogo: false,
      displayModeBar: 'hover',
      modeBarButtonsToRemove: ['toImage', 'select2d', 'lasso2d', 'autoScale2d', 'resetScale2d'],
      modeBarButtonsToAdd: [{
        name: 'mcResetAxes',
        title: 'Reset os – zpět na rozsah z kódu (xlim / ylim), jinak automaticky. Totéž dělá dvojklik do grafu.',
        icon: P.Icons && P.Icons.home,
        click: (gd) => resetView(gd),
      }],
      doubleClick: false,      // dvojklik řeší resetView (Plotly by se vracel na svůj počáteční stav)
    };
  }

  /**
   * Vykreslí graf; vrací { empty, warnings }. Jediná funkce, která kreslí graf na obrazovku.
   * opts.theme = 'light' | 'dark'
   */
  function render(div, fig, opts) {
    if (!window.Plotly) return { empty: false, warnings: ['Knihovna Plotly se nenačetla (chybí vendor/plotly-basic.min.js).'] };
    if (!fig || (!fig.ax.lines.length && !fig.ax.touched)) { window.Plotly.purge(div); div._mcHome = null; div._mcDbl = false; return { empty: true, warnings: [] }; }
    const b = build(fig, opts);
    div._mcHome = b.home;
    window.Plotly.react(div, b.traces, b.layout, config());
    if (!div._mcDbl && div.on) { div.on('plotly_doubleclick', () => resetView(div)); div._mcDbl = true; }
    return { empty: false, warnings: b.warnings };
  }

  /* ---------- export (vždy ve světlé variantě, aktuální pohled) ---------- */
  const imgOpts = (o, format) => ({
    format,
    width: Math.max(200, Number(o.exportW) || 900),
    height: Math.max(150, Number(o.exportH) || 560),
    scale: format === 'png' ? Math.max(1, Number(o.exportScale) || 2) : 1,
  });

  // světlá verze grafu se stejným výřezem, jaký je na obrazovce (včetně zoomu)
  function lightFigure(div, fig) {
    const b = build(fig, { theme: 'light' });
    const fl = div && div._fullLayout;
    if (fl) {
      ['xaxis', 'yaxis', 'yaxis2'].forEach((k) => {
        if (fl[k] && b.layout[k] && Array.isArray(fl[k].range)) { b.layout[k].range = fl[k].range.slice(); b.layout[k].autorange = false; }
      });
    }
    return { data: b.traces, layout: b.layout, config: { displaylogo: false } };
  }

  function exportImage(div, fig, o, format, filename) {
    return window.Plotly.downloadImage(lightFigure(div, fig), Object.assign(imgOpts(o, format), { filename }));
  }

  function dataUrlToBlob(url) {
    const [head, b64] = url.split(',');
    const mime = (head.match(/data:([^;]+)/) || [])[1] || 'image/png';
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  // PNG do schránky (vložitelné do Wordu, PowerPointu, Affinity…)
  function copyImage(div, fig, o) {
    const blob = window.Plotly.toImage(lightFigure(div, fig), imgOpts(o, 'png')).then(dataUrlToBlob);
    return navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  }

  // Data grafu jako tabulka oddělená tabulátory – pro vložení do Excelu.
  // Mají-li všechny křivky stejné x, je jeden sloupec X; jinak dvojice sloupců x, y.
  function tableText(fig, dec) {
    const n2s = (x) => { if (x === undefined) return ''; const t = String(Number.isFinite(x) ? +x.toPrecision(15) : x); return dec && dec !== '.' ? t.replace('.', dec) : t; };
    const lines = fig ? fig.ax.lines : [];
    if (!lines.length) return '';
    const names = lines.map((ln, k) => texPlain(lineName(ln, k), 'tex'));
    const x0 = lines[0].x;
    const sameX = lines.every((ln) => ln.x.length === x0.length && ln.x.every((v, i) => v === x0[i]));
    const rows = [];
    if (sameX) {
      rows.push([lines[0].xname || 'x'].concat(names).join('\t'));
      for (let i = 0; i < x0.length; i++) rows.push([x0[i]].concat(lines.map((ln) => ln.y[i])).map(n2s).join('\t'));
    } else {
      rows.push(lines.map((ln, k) => (ln.xname || 'x') + '\t' + names[k]).join('\t'));
      const n = Math.max(...lines.map((ln) => ln.x.length));
      for (let i = 0; i < n; i++) rows.push(lines.map((ln) => n2s(ln.x[i]) + '\t' + n2s(ln.y[i])).join('\t'));
    }
    return rows.join('\n');
  }

  MC.plot = { PALETTE: G.PALETTE, build, render, resetView, exportImage, copyImage, tableText, texToHtml, texPlain, figLabel, lineName, forDark: (c) => forDark(c, THEMES.dark) };
})();
