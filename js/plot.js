/* =====================================================================
   MatCalc – vykreslení grafů (Plotly)
   ---------------------------------------------------------------------
   Kreslí stav, který vytvořily grafické příkazy ve skriptu
   (graphics.js). Tady se jen převádí MATLABovské vlastnosti os a čar
   na Plotly a TeX v popiscích (^{24}Na, P_z, \sigma) na HTML.
   ===================================================================== */
(function () {
  'use strict';
  const MC = (window.MC = window.MC || {});
  const G = MC.graphics;

  const FONT = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif';
  const INK = '#1d1d1f';
  const AXIS = '#3a3a3a';
  const PT = 1.25;   // body (MATLAB) -> px

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

  function trace(ln, k, interp) {
    const name = lineName(ln, k);
    const showLine = ln.ls !== 'none';
    const showMk = ln.marker !== 'none';
    const t = {
      type: 'scatter',
      mode: showLine && showMk ? 'lines+markers' : showLine ? 'lines' : showMk ? 'markers' : 'none',
      name: texToHtml(name, interp),
      x: ln.x,
      y: ln.y,
      showlegend: ln.inLegend !== false,
      line: { color: ln.color, width: lineW(ln.width), dash: DASH[ln.ls] || 'solid' },
      hovertemplate: escH(texPlain(name, interp)) + ': %{y:.5~g}' + (ln.yunit ? ' ' + escH(ln.yunit) : '') + '<extra></extra>',
    };
    if (showMk) {
      const edge = ln.mec && ln.mec !== 'auto' ? ln.mec : ln.color;
      const filled = ln.marker === '.' || (ln.mfc && ln.mfc !== 'none');
      const face = ln.mfc === 'auto' ? ln.color : ln.mfc;
      let sym = SYMBOL[ln.marker] || 'circle';
      if (!filled || THIN.has(ln.marker)) sym += '-open';
      t.marker = {
        symbol: sym,
        size: ln.marker === '.' ? Math.max(3, ln.markerSize * 0.75) : ln.markerSize * 1.2,
        color: filled && !THIN.has(ln.marker) ? (ln.marker === '.' ? ln.color : face) : edge,
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

  function build(fig) {
    const ax = fig.ax;
    const warnings = [];
    const fs = ax.fontSize ? ax.fontSize * PT : 12;
    const lfs = ax.fontSize ? ax.fontSize * 1.1 * PT : 13;
    const family = ax.fontName ? '"' + ax.fontName + '", ' + FONT : FONT;
    const traces = ax.lines.map((ln, k) => trace(ln, k, ax.legend && ax.legend.interp));

    ['x', 'y'].forEach((a) => {
      if (ax[a + 'scale'] === 'log' && ax.lines.some((ln) => ln[a].some((v) => !(v > 0)))) {
        warnings.push('Na logaritmické ose ' + a.toUpperCase() + ' se nulové a záporné hodnoty nezobrazí.');
      }
    });

    const txt = (t, size, bold) => {
      if (!t || t.text === '') return { text: '' };
      let h = texToHtml(t.text, t.interp);
      const b = t.bold === undefined ? bold : t.bold;
      if (b) h = '<b>' + h + '</b>';
      if (t.italic) h = '<i>' + h + '</i>';
      const font = { size: t.fontSize ? t.fontSize * PT : size, color: t.color || INK };
      return { text: h, font };
    };

    const axis = (a) => {
      const log = ax[a + 'scale'] === 'log';
      const lim = ax[a + 'lim'];
      const rev = ax[a + 'dir'] === 'reverse';
      const col = ax[a + 'color'] || AXIS;
      const o = {
        title: Object.assign(txt(ax[a + 'label'], lfs, false), { standoff: 10 }),
        type: log ? 'log' : 'linear',
        showline: true, linecolor: col, linewidth: ax.lineWidth ? Math.max(1, ax.lineWidth * PT) : 1,
        mirror: ax.box ? 'ticks' : false,
        ticks: 'inside', ticklen: 5, tickcolor: col,
        tickfont: { size: fs, color: ax[a + 'color'] || INK },
        showgrid: !!ax[a + 'grid'], gridcolor: '#e1e1e1', gridwidth: 1,
        zeroline: false,
        automargin: true,
        exponentformat: 'power',
        hoverformat: '.5~g',
        visible: !ax.axisOff,
      };
      if (ax[a + 'minor'] || ax[a + 'minortick'] || log) {
        o.minor = { ticks: ax[a + 'minortick'] || log ? 'inside' : '', ticklen: 3, tickcolor: col, showgrid: !!ax[a + 'minor'], gridcolor: '#f1f1f1' };
      }
      if (ax[a + 'tick']) { o.tickmode = 'array'; o.tickvals = ax[a + 'tick']; }
      const conv = (v) => (log ? (v > 0 ? Math.log10(v) : null) : v);
      let lo = lim && Number.isFinite(lim[0]) ? conv(lim[0]) : null;
      let hi = lim && Number.isFinite(lim[1]) ? conv(lim[1]) : null;
      // rozsah dat (v souřadnicích osy) – pro mez zadanou jen z jedné strany (xlim([0 Inf]))
      let dlo = Infinity;
      let dhi = -Infinity;
      ax.lines.forEach((ln) => ln[a].forEach((v) => { const c = conv(v); if (c !== null && Number.isFinite(c)) { if (c < dlo) dlo = c; if (c > dhi) dhi = c; } }));
      const pad = a === 'y' && dhi > dlo ? (dhi - dlo) * 0.05 : 0;
      if (lo !== null && hi === null) hi = dhi > lo ? dhi + pad : lo + 1;
      else if (hi !== null && lo === null) lo = dlo < hi ? dlo - pad : hi - 1;
      if (lo !== null && hi !== null) { o.range = rev ? [hi, lo] : [lo, hi]; o.autorange = false; }
      else if (rev) o.autorange = 'reversed';
      // logaritmická osa: popisky jen po dekádách (10^n) jako v MATLABu, když je rozsah dost velký
      if (log && !ax[a + 'tick']) {
        const span = (hi !== null && lo !== null ? Math.abs(hi - lo) : dhi - dlo);
        if (span >= 1.5) { o.dtick = 1; o.minor = Object.assign(o.minor || {}, { dtick: 'D1' }); }
      }
      return o;
    };

    const L = ax.legend;
    const showLegend = !!(L && L.visible && ax.lines.some((ln) => ln.inLegend !== false));
    const pos = Object.assign({}, LEG[(L && L.location) || 'northeast'] || LEG.northeast);
    if (L && L.location === 'southoutside' && ax.xlabel && ax.xlabel.text) pos.y = -0.24;
    if (L && L.orientation === 'horizontal') pos.orientation = 'h';
    if (L && L.orientation === 'vertical') delete pos.orientation;
    const legend = Object.assign({
      bgcolor: L && L.box === false ? 'rgba(255,255,255,0)' : (L && L.color) || 'rgba(255,255,255,0.92)',
      bordercolor: (L && L.edgeColor) || '#9a9a9a',
      borderwidth: L && L.box === false ? 0 : 1,
      font: { size: L && L.fontSize ? L.fontSize * PT : fs, color: (L && L.textColor) || INK },
    }, pos);
    if (L && L.title) legend.title = { text: texToHtml(L.title) };

    const title = txt(ax.title, ax.fontSize ? ax.fontSize * 1.1 * PT : 15, true);
    const layout = {
      title: Object.assign(title, { x: 0.5, xanchor: 'center' }),
      xaxis: axis('x'),
      yaxis: axis('y'),
      showlegend: showLegend,
      legend,
      margin: { l: 64, r: 22, t: title.text ? 48 : 20, b: 52 },
      paper_bgcolor: fig.color || '#ffffff',
      plot_bgcolor: '#ffffff',
      font: { family, size: fs, color: INK },
      colorway: G.PALETTE,
      hovermode: 'x unified',
      hoverlabel: { bgcolor: '#ffffff', bordercolor: '#c8c8c8', font: { family: FONT, size: 12, color: INK } },
      uirevision: [fig.num, ax.xscale, ax.yscale, String(ax.xlim), String(ax.ylim), ax.xdir, ax.ydir].join('|'),
    };
    if (ax.equal) { layout.yaxis.scaleanchor = 'x'; layout.yaxis.scaleratio = 1; }
    return { traces, layout, warnings };
  }

  const CONFIG = {
    responsive: true,
    displaylogo: false,
    displayModeBar: 'hover',
    modeBarButtonsToRemove: ['toImage', 'select2d', 'lasso2d', 'autoScale2d'],
    doubleClick: 'reset+autosize',
  };

  // Vykreslí graf; vrací { empty, warnings }
  function render(div, fig) {
    if (!window.Plotly) return { empty: false, warnings: ['Knihovna Plotly se nenačetla (chybí vendor/plotly-basic.min.js).'] };
    if (!fig || (!fig.ax.lines.length && !fig.ax.touched)) { window.Plotly.purge(div); return { empty: true, warnings: [] }; }
    const b = build(fig);
    window.Plotly.react(div, b.traces, b.layout, CONFIG);
    return { empty: false, warnings: b.warnings };
  }

  /* ---------- export ---------- */
  const imgOpts = (o, format) => ({
    format,
    width: Math.max(200, Number(o.exportW) || 900),
    height: Math.max(150, Number(o.exportH) || 560),
    scale: format === 'png' ? Math.max(1, Number(o.exportScale) || 2) : 1,
  });

  function exportImage(div, o, format, filename) {
    return window.Plotly.downloadImage(div, Object.assign(imgOpts(o, format), { filename }));
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
  function copyImage(div, o) {
    const blob = window.Plotly.toImage(div, imgOpts(o, 'png')).then(dataUrlToBlob);
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

  MC.plot = { PALETTE: G.PALETTE, build, render, exportImage, copyImage, tableText, texToHtml, texPlain, figLabel, lineName };
})();
