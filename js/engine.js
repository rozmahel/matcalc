/* =====================================================================
   MatCalc – výpočetní jádro
   ---------------------------------------------------------------------
   Stojí na knihovně math.js. Tady se řeší všechno, co dělá syntaxi
   "matlabovskou": komentáře %, středník potlačí výpis, [1 2 3],
   indexování a(2), prvkové funkce na vektorech, ans, format, clc, clear…
   Soubor nesahá na DOM – jen počítá a vrací seznam výstupů.
   ===================================================================== */
(function () {
  'use strict';

  const MC = (window.MC = window.MC || {});
  const math = window.math.create(window.math.all, {});

  /* ---------- stav běhu ---------- */
  let precision = 5;          // 5 = format short g, 15 = format long g
  let currentOut = null;      // kam zapisuje disp/fprintf během běhu
  let currentLine = 0;

  /* =====================================================================
     1) Úpravy math.js – prvkové funkce a funkce známé z MATLABu
     ===================================================================== */
  const imp = {};

  // Funkce, které math.js na maticích odmítá – v MATLABu fungují prvkově.
  const ELEMENTWISE = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh',
    'asinh', 'acosh', 'atanh', 'sec', 'csc', 'cot', 'exp', 'expm1', 'sqrt', 'cbrt',
    'square', 'cube', 'gamma', 'log10', 'log2', 'log1p'];
  ELEMENTWISE.forEach((name) => {
    const f = math[name];
    if (!f) return;
    imp[name] = math.typed(name, {
      'Array | Matrix': (x) => math.map(x, (v) => f(v)),
      any: (x) => f(x),
    });
  });
  {
    const log = math.log;
    imp.log = math.typed('log', {
      'Array | Matrix': (x) => math.map(x, (v) => log(v)),
      'Array | Matrix, any': (x, b) => math.map(x, (v) => log(v, b)),
      any: (x) => log(x),
      'any, any': (x, b) => log(x, b),
    });
  }

  const isMat = (x) => math.isMatrix(x) || Array.isArray(x);
  const toArr = (x) => (math.isMatrix(x) ? x.toArray() : x);
  const flat = (x) => (isMat(x) ? math.flatten(toArr(x)) : [x]);
  const num = (x) => (typeof x === 'number' ? x : math.number(x));
  const mapAny = (x, fn) => (isMat(x) ? math.map(x, (v) => fn(v)) : fn(x));

  const DEG = Math.PI / 180;

  Object.assign(imp, {
    // linspace(a, b, n) – n rovnoměrně rozložených bodů včetně krajních (funguje i s jednotkami)
    linspace(a, b, n) {
      n = n === undefined ? 100 : Math.floor(num(n));
      if (n < 1) return math.matrix([]);
      if (n === 1) return math.matrix([b]);
      const d = math.subtract(b, a);
      const out = new Array(n);
      for (let i = 0; i < n; i++) out[i] = i === n - 1 ? b : math.add(a, math.multiply(d, i / (n - 1)));
      return math.matrix(out);
    },
    // logspace(a, b, n) – body 10^a … 10^b
    logspace(a, b, n) {
      n = n === undefined ? 50 : Math.floor(num(n));
      a = num(a); b = num(b);
      const out = [];
      for (let i = 0; i < n; i++) out.push(Math.pow(10, n === 1 ? b : a + ((b - a) * i) / (n - 1)));
      return math.matrix(out);
    },
    length(x) {
      if (typeof x === 'string') return x.length;
      if (!isMat(x)) return 1;
      const s = math.size(x);
      const sz = toArr(s);
      return sz.length ? Math.max(...sz) : 0;
    },
    numel(x) {
      if (typeof x === 'string') return x.length;
      if (!isMat(x)) return 1;
      return toArr(math.size(x)).reduce((p, v) => p * v, 1);
    },
    // goniometrie ve stupních
    sind: (x) => mapAny(x, (v) => math.sin(math.multiply(v, DEG))),
    cosd: (x) => mapAny(x, (v) => math.cos(math.multiply(v, DEG))),
    tand: (x) => mapAny(x, (v) => math.tan(math.multiply(v, DEG))),
    asind: (x) => mapAny(x, (v) => math.divide(math.asin(v), DEG)),
    acosd: (x) => mapAny(x, (v) => math.divide(math.acos(v), DEG)),
    atand: (x) => mapAny(x, (v) => math.divide(math.atan(v), DEG)),
    deg2rad: (x) => mapAny(x, (v) => math.multiply(v, DEG)),
    rad2deg: (x) => mapAny(x, (v) => math.divide(v, DEG)),
    eye: (n, m2) => (m2 === undefined ? math.identity(num(n)) : math.identity(num(n), num(m2))),
    // názvy z MATLABu pro komplexní čísla
    real: (x) => math.re(x),
    imag: (x) => math.im(x),
    angle: (x) => math.arg(x),
    // efektivní hodnota
    rms(x) {
      const a = flat(x);
      let s = 0;
      a.forEach((v) => { s = math.add(s, math.multiply(v, v)); });
      return math.sqrt(math.divide(s, a.length));
    },
    // lichoběžníková integrace: trapz(y) nebo trapz(x, y)
    trapz(a, b) {
      let x, y;
      if (b === undefined) { y = flat(a); x = y.map((_, i) => i + 1); } else { x = flat(a); y = flat(b); }
      if (x.length !== y.length) throw new Error('trapz: x a y musí mít stejnou délku');
      let s = 0;
      for (let i = 0; i < y.length - 1; i++) {
        s = math.add(s, math.multiply(math.subtract(x[i + 1], x[i]), math.divide(math.add(y[i], y[i + 1]), 2)));
      }
      return s;
    },
    // lineární interpolace interp1(x, y, xi); mimo rozsah vrací NaN (jako MATLAB)
    interp1(xs, ys, xi) {
      const x = flat(xs).map(num);
      const y = flat(ys).map(num);
      if (x.length !== y.length) throw new Error('interp1: x a y musí mít stejnou délku');
      const one = (q) => {
        q = num(q);
        if (q < x[0] || q > x[x.length - 1] || Number.isNaN(q)) return NaN;
        let k = 0;
        while (k < x.length - 2 && q > x[k + 1]) k++;
        const t = (q - x[k]) / (x[k + 1] - x[k]);
        return y[k] + t * (y[k + 1] - y[k]);
      };
      return isMat(xi) ? math.map(xi, (v) => one(v)) : one(xi);
    },
    // polynom: koeficienty od nejvyšší mocniny (jako v MATLABu)
    polyval(p, xv) {
      const c = flat(p);
      return mapAny(xv, (x) => c.reduce((acc, ci) => math.add(math.multiply(acc, x), ci), 0));
    },
    // polyfit(x, y, n) – metoda nejmenších čtverců
    polyfit(xs, ys, n) {
      const x = flat(xs).map(num);
      const y = flat(ys).map(num);
      n = Math.floor(num(n));
      if (x.length !== y.length) throw new Error('polyfit: x a y musí mít stejnou délku');
      if (x.length <= n) throw new Error('polyfit: málo bodů pro polynom ' + n + '. stupně');
      const V = x.map((xi) => { const r = []; for (let k = n; k >= 0; k--) r.push(Math.pow(xi, k)); return r; });
      const Vt = math.transpose(V);
      const sol = math.lusolve(math.multiply(Vt, V), math.multiply(Vt, y));
      return math.matrix(math.flatten(sol));
    },
    // výpis
    disp(x) {
      if (currentOut) currentOut.push({ type: 'disp', text: typeof x === 'string' ? x : formatValue(x).text, line: currentLine });
    },
    num2str(x, p) {
      if (typeof x === 'string') return x;
      return formatPlain(x, p === undefined ? Math.max(precision, 5) : Math.floor(num(p)));
    },
    sprintf(fmt, ...args) { return sprintf(String(fmt), args); },
    fprintf(fmt, ...args) {
      const s = sprintf(String(fmt), args).replace(/\n$/, '');
      if (currentOut) currentOut.push({ type: 'disp', text: s, line: currentLine });
    },
    // násobení: dva vektory přes * jsou v MATLABu chyba, math.js by tiše spočítal skalární součin
    mtimes(a, b) {
      if (math.isMatrix(a) && math.isMatrix(b) && a.size().length === 1 && b.size().length === 1) {
        throw new Error('VEC_TIMES_VEC');
      }
      return math.multiply(a, b);
    },
  });

  math.import(imp, { override: true });

  /* ---------- sprintf (podmnožina z MATLABu: %d %i %f %e %g %s %%) ---------- */
  function sprintf(fmt, args) {
    fmt = fmt.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
    const vals = [];
    // MATLAB prochází matice po sloupcích
    args.forEach((a) => {
      let list = [a];
      if (isMat(a)) { const sz = sizeOf(a); list = sz.length === 2 && sz[0] > 1 && sz[1] > 1 ? math.flatten(math.transpose(toArr(a))) : flat(a); }
      list.forEach((v) => vals.push(v));
    });
    const re = /%([-+ 0#]*)(\d+)?(?:\.(\d+))?([diufeEgGs%])/g;
    const specs = (fmt.match(re) || []).filter((s) => !s.endsWith('%%'));
    const one = (startIdx) => {
      let idx = startIdx;
      const str = fmt.replace(re, (m, flags, width, prec, conv) => {
        if (conv === '%') return '%';
        const v = vals[idx++];
        if (v === undefined) return '';
        let s;
        if (conv === 's') s = typeof v === 'string' ? v : formatPlain(v, prec !== undefined ? +prec : precision);
        else if (math.isUnit(v)) s = formatPlain(v, prec !== undefined ? +prec + 1 : precision);
        else {
          const x = typeof v === 'string' ? NaN : num(v);
          const p = prec !== undefined ? +prec : 6;
          if (conv === 'd' || conv === 'i' || conv === 'u') s = Number.isInteger(x) ? String(x) : x.toExponential(4);
          else if (conv === 'f') s = x.toFixed(p);
          else if (conv === 'e' || conv === 'E') { s = x.toExponential(p); if (conv === 'E') s = s.toUpperCase(); }
          else { s = String(+x.toPrecision(p || 1)); if (conv === 'G') s = s.toUpperCase(); }
          if (flags.includes('+') && x >= 0) s = '+' + s;
        }
        if (width && s.length < +width) s = flags.includes('-') ? s.padEnd(+width) : s.padStart(+width, flags.includes('0') && conv !== 's' ? '0' : ' ');
        return s;
      });
      return { str, used: idx - startIdx };
    };
    if (!specs.length || !vals.length) return one(0).str;
    let out = '';
    let i = 0;
    do { const r = one(i); out += r.str; i += r.used || vals.length; } while (i < vals.length);
    return out;
  }

  /* =====================================================================
     2) Formátování výstupu
     ===================================================================== */
  function fmtScalar(v, p) {
    p = p || precision;
    if (typeof v === 'number') {
      if (Number.isNaN(v)) return 'NaN';
      if (!Number.isFinite(v)) return v > 0 ? 'Inf' : '-Inf';
      if (Number.isInteger(v) && Math.abs(v) < 1e9) return String(v);
      return math.format(v, { precision: p, lowerExp: -4, upperExp: p });
    }
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'string') return '"' + v + '"';
    if (typeof v === 'function') return v.syntax ? v.syntax : 'funkce';
    if (v === null || v === undefined) return '[]';
    try { return math.format(v, { precision: p, lowerExp: -4, upperExp: p }); } catch (e) { return String(v); }
  }
  function formatPlain(v, p) {
    if (isMat(v)) return flat(v).map((x) => fmtScalar(x, p)).join(', ');
    return typeof v === 'string' ? v : fmtScalar(v, p);
  }

  function sizeOf(v) {
    if (isMat(v)) {
      const s = toArr(math.size(v));
      if (s.length === 1) return s[0] === 0 ? [0, 0] : [1, s[0]];
      return s;
    }
    if (typeof v === 'string') return [1, v.length];
    if (typeof v === 'function') return null;
    return [1, 1];
  }
  const sizeText = (s) => (s ? s.join('×') : '–');

  // Krátký náhled vektoru: první prvky … poslední prvky
  function vectorPreview(arr, head, tail, p) {
    if (arr.length <= head + tail + 1) return '[' + arr.map((x) => fmtScalar(x, p)).join(', ') + ']';
    return '[' + arr.slice(0, head).map((x) => fmtScalar(x, p)).join(', ') + ', …, ' +
      arr.slice(-tail).map((x) => fmtScalar(x, p)).join(', ') + ']';
  }

  // Formátování pro Command Window: { text, multiline, size, big }
  function formatValue(v, p) {
    p = p || precision;
    const size = sizeOf(v);
    if (isMat(v)) {
      const arr = toArr(v);
      const isVec = size[0] === 1 || size[1] === 1;
      if (size[0] === 0) return { text: '[]', size: '0×0', multiline: false };
      if (isVec) {
        const a = math.flatten(arr);
        return { text: vectorPreview(a, 8, 3, p), size: sizeText(size), multiline: false, big: a.length > 12 };
      }
      if (size.length === 2 && size[0] <= 12 && size[1] <= 8) {
        const cells = arr.map((row) => row.map((x) => fmtScalar(x, p)));
        const w = [];
        cells.forEach((row) => row.forEach((c, j) => { w[j] = Math.max(w[j] || 0, c.length); }));
        const text = cells.map((row) => '    ' + row.map((c, j) => c.padStart(w[j])).join('   ')).join('\n');
        return { text, size: sizeText(size), multiline: true };
      }
      return { text: 'matice ' + sizeText(size), size: sizeText(size), multiline: false, big: true };
    }
    return { text: fmtScalar(v, p), size: sizeText(size), multiline: false };
  }

  /* =====================================================================
     3) Popis proměnné pro Workspace a pro grafy
     ===================================================================== */
  function describe(v, fnSrc) {
    const size = sizeOf(v);
    const d = { size: sizeText(size), kind: 'num', preview: '', plottable: false, reason: '', length: 1, unit: '' };
    if (typeof v === 'function') {
      d.kind = 'fn';
      d.preview = fnSrc || fmtScalar(v);
      d.reason = 'Funkce – nejde vykreslit jako řada hodnot';
      return d;
    }
    if (typeof v === 'string') { d.kind = 'str'; d.preview = '"' + v + '"'; d.reason = 'Text – nejde vykreslit'; return d; }
    if (isMat(v)) {
      const isVec = size[0] === 1 || size[1] === 1;
      d.kind = isVec ? 'vec' : 'mat';
      d.preview = isVec ? vectorPreview(math.flatten(toArr(v)), 6, 2) : 'matice ' + d.size;
      d.length = isVec ? Math.max(size[0], size[1]) : size[0] * size[1];
      const pd = plotData(v);
      d.plottable = pd.ok;
      d.reason = pd.reason;
      d.unit = pd.unit;
      return d;
    }
    d.preview = fmtScalar(v);
    if (math.isUnit(v)) d.unit = bestUnit(v);
    d.reason = 'Skalár 1×1 – na osu patří vektor (např. x = linspace(0, 10, 50))';
    return d;
  }

  // Nejvhodnější zápis jednotky (např. "kW") – z prvku s největší hodnotou
  function bestUnit(u) {
    try {
      const s = u.simplify ? u.simplify() : u;
      const str = s.toString();
      const i = str.indexOf(' ');
      return i > 0 ? str.slice(i + 1) : s.formatUnits();
    } catch (e) {
      try { return u.formatUnits(); } catch (e2) { return ''; }
    }
  }

  // Převod proměnné na pole čísel pro graf: { ok, values, unit, reason }
  function plotData(v) {
    if (v === undefined) return { ok: false, reason: 'Proměnná neexistuje' };
    if (!isMat(v)) {
      if (typeof v === 'function') return { ok: false, reason: 'Funkce – nejde vykreslit' };
      if (typeof v === 'string') return { ok: false, reason: 'Text – nejde vykreslit' };
      return { ok: false, reason: 'Skalár 1×1 – na osu patří vektor' };
    }
    const size = sizeOf(v);
    if (!(size[0] === 1 || size[1] === 1)) {
      return { ok: false, reason: 'Matice ' + size.join('×') + ' – zatím lze vykreslit jen vektory' };
    }
    const arr = math.flatten(toArr(v));
    if (!arr.length) return { ok: false, reason: 'Prázdný vektor' };
    let unit = '';
    const units = arr.filter((x) => math.isUnit(x));
    if (units.length) {
      let maxU = units[0];
      let maxV = -1;
      units.forEach((u) => { try { const a = Math.abs(u.value === null ? 0 : u.value); if (a > maxV) { maxV = a; maxU = u; } } catch (e) { /* nic */ } });
      unit = bestUnit(maxU);
    }
    const values = new Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      const x = arr[i];
      if (typeof x === 'number') values[i] = x;
      else if (typeof x === 'boolean') values[i] = x ? 1 : 0;
      else if (math.isUnit(x)) {
        try { values[i] = x.toNumber(unit); } catch (e) { return { ok: false, reason: 'Prvky mají různé jednotky' }; }
      } else if (math.isComplex(x)) {
        if (Math.abs(x.im) > 1e-12 * Math.max(1, Math.abs(x.re))) return { ok: false, reason: 'Komplexní hodnoty – vykresli abs(), real(), imag() nebo angle()' };
        values[i] = x.re;
      } else if (math.isBigNumber(x) || math.isFraction(x)) values[i] = math.number(x);
      else return { ok: false, reason: 'Obsahuje nečíselné prvky' };
    }
    return { ok: true, values, unit, reason: '' };
  }

  // Text pro schránku (sloupec čísel, vložitelný do Excelu). dec = desetinný oddělovač
  function toClipboardText(v, dec) {
    dec = dec || '.';
    const n2s = (x) => { const t = String(Number.isFinite(x) ? +x.toPrecision(15) : x); return dec === '.' ? t : t.replace('.', dec); };
    const cell = (x) => (typeof x === 'number' ? n2s(x) : formatPlain(x, 15));
    if (isMat(v)) {
      const size = sizeOf(v);
      if (size[0] === 1 || size[1] === 1) {
        const pd = plotData(v);
        if (pd.ok) return pd.values.map(n2s).join('\n');
        return math.flatten(toArr(v)).map(cell).join('\n');
      }
      return toArr(v).map((row) => row.map(cell).join('\t')).join('\n');
    }
    return cell(v);
  }

  /* =====================================================================
     4) Rozdělení skriptu na příkazy (komentáře, pokračování ..., závorky)
     ===================================================================== */
  const OPERAND_END = /[A-Za-z0-9_)\]}.']/;

  function scanLine(line, depth) {
    let code = '';
    let i = 0;
    let cont = false;
    let inStr = null;
    while (i < line.length) {
      const c = line[i];
      if (inStr) {
        code += c;
        if (c === inStr) {
          if (line[i + 1] === inStr) { code += c; i += 2; continue; }   // '' uvnitř textu = apostrof
          inStr = null;
        }
        i++;
        continue;
      }
      if (c === '%' || c === '#') break;
      if (c === '.' && line.startsWith('...', i)) { cont = true; break; }
      if (c === '"') { inStr = '"'; code += c; i++; continue; }
      if (c === "'") {
        const prev = code.length ? code[code.length - 1] : '';
        if (!OPERAND_END.test(prev)) inStr = "'";
        code += c; i++;
        continue;
      }
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth--;
      code += c;
      i++;
    }
    return { code, depth, cont };
  }

  function pushStatements(buf, startLine, out, endLine) {
    let depth = 0;
    let inStr = null;
    let segStart = 0;
    const emit = (end, sep) => {
      const text = buf.slice(segStart, end);
      if (text.trim()) {
        const before = buf.slice(0, segStart) + (text.match(/^\s*/)[0]);
        const nl = (before.match(/\n/g) || []).length;
        out.push({ code: text.trim(), line: startLine + nl, endLine: endLine || startLine + nl, visible: sep !== ';' });
      }
      segStart = end + 1;
    };
    for (let i = 0; i < buf.length; i++) {
      const c = buf[i];
      if (inStr) {
        if (c === inStr) { if (buf[i + 1] === inStr) { i++; continue; } inStr = null; }
        continue;
      }
      if (c === '"') { inStr = '"'; continue; }
      if (c === "'") { if (!OPERAND_END.test(buf[i - 1] || '')) inStr = "'"; continue; }
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth--;
      else if (depth === 0 && (c === ';' || c === ',')) emit(i, c);
    }
    emit(buf.length, '');
  }

  function splitStatements(src) {
    const lines = src.replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let buf = '';
    let startLine = 1;
    let depth = 0;
    let joiner = '\n';
    let inBlock = false;
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (inBlock) { if (trimmed === '%}') inBlock = false; continue; }
      if (trimmed === '%{' && !buf.trim()) { inBlock = true; continue; }
      const r = scanLine(lines[i], depth);
      if (!buf.trim()) { buf = r.code; startLine = i + 1; } else buf += joiner + r.code;
      depth = r.depth;
      if (r.cont) { joiner = ' '; continue; }
      if (depth > 0) { joiner = '\n'; continue; }
      joiner = '\n';
      if (buf.trim()) pushStatements(buf, startLine, out, i + 1);
      buf = '';
      depth = 0;
    }
    if (buf.trim()) pushStatements(buf, startLine, out, lines.length);
    return out;
  }

  /* =====================================================================
     5) Překlad matlabovské syntaxe do math.js
     ===================================================================== */
  const WORD_OPS = new Set(['to', 'in', 'and', 'or', 'xor', 'not', 'mod']);

  function stringMask(code) {
    const mask = new Uint8Array(code.length);
    let inStr = null;
    for (let i = 0; i < code.length; i++) {
      const c = code[i];
      if (inStr) {
        mask[i] = 1;
        if (c === inStr) {
          if (code[i + 1] === inStr) { mask[i + 1] = 1; i++; continue; }
          inStr = null;
        }
        continue;
      }
      if (c === '"') { inStr = '"'; mask[i] = 1; continue; }
      if (c === "'" && !OPERAND_END.test(code[i - 1] || '')) { inStr = "'"; mask[i] = 1; }
    }
    return mask;
  }

  const wordBefore = (s) => { const m = s.match(/([A-Za-z_][A-Za-z0-9_]*)\s*$/); return m ? m[1] : ''; };
  const wordAfter = (s, j) => { const m = s.slice(j).match(/^[A-Za-z_][A-Za-z0-9_]*/); return m ? m[0] : ''; };

  // [1 2 3] -> [1, 2, 3] ; řádky uvnitř [] -> středníky
  function transformMatrix(code) {
    if (code.indexOf('[') < 0) return code;
    const n = code.length;
    const mask = stringMask(code);
    const info = {};
    const stack = [];
    for (let i = 0; i < n; i++) {
      if (mask[i]) continue;
      const c = code[i];
      if (c === '[' || c === '(' || c === '{') {
        stack.push({ open: i, ch: c, hasComma: false, isIndex: c === '[' && /[A-Za-z0-9_)\]']/.test(code[i - 1] || '') });
      } else if (c === ']' || c === ')' || c === '}') {
        const t = stack.pop();
        if (t) info[t.open] = t;
      } else if (c === ',' && stack.length) stack[stack.length - 1].hasComma = true;
    }
    let out = '';
    const ctx = [];
    for (let i = 0; i < n; i++) {
      const c = code[i];
      if (mask[i]) { out += c; continue; }
      if (c === '[' || c === '(' || c === '{') { ctx.push(info[i] || { ch: c }); out += c; continue; }
      if (c === ']' || c === ')' || c === '}') { ctx.pop(); out += c; continue; }
      const top = ctx[ctx.length - 1];
      const inMat = top && top.ch === '[' && !top.isIndex;
      if (/\s/.test(c) && inMat) {
        let j = i;
        let hasNl = false;
        while (j < n && /\s/.test(code[j]) && !mask[j]) { if (code[j] === '\n') hasNl = true; j++; }
        const trimmedOut = out.replace(/\s+$/, '');
        const prev = trimmedOut.slice(-1);
        const next = code[j] || '';
        const next2 = code[j + 1] || '';
        if (hasNl) {
          out += prev && !/[;,[]/.test(prev) && next !== ']' && next !== ';' && next !== ',' ? '; ' : ' ';
        } else if (!top.hasComma && prev && OPERAND_END.test(prev) && !WORD_OPS.has(wordBefore(trimmedOut)) &&
          !WORD_OPS.has(wordAfter(code, j)) &&
          (/[A-Za-z0-9_(["]/.test(next) || (next === '.' && /[0-9]/.test(next2)) ||
            ((next === '+' || next === '-') && next2 && !/\s/.test(next2) && next2 !== '='))) {
          out += ', ';
        } else {
          out += code.slice(i, j);
        }
        i = j - 1;
        continue;
      }
      out += c === '\n' ? ' ' : c;
    }
    return out;
  }

  // a(2) -> a[2], pokud je "a" ve workspace vektor/matice/text (v MATLABu se indexuje kulatými závorkami)
  function transformIndex(code, scope) {
    if (code.indexOf('(') < 0) return code;
    const mask = stringMask(code);
    const chars = code.split('');
    const re = /[A-Za-z_][A-Za-z0-9_]*/g;
    let m;
    while ((m = re.exec(code))) {
      const k = m.index;
      const open = k + m[0].length;
      if (mask[k] || code[open] !== '(') continue;
      if (k > 0 && /[A-Za-z0-9_.]/.test(code[k - 1])) continue;
      const v = Object.prototype.hasOwnProperty.call(scope, m[0]) ? scope[m[0]] : undefined;
      if (v === undefined || typeof v === 'function' || !(isMat(v) || typeof v === 'string')) continue;
      let depth = 0;
      for (let j = open; j < code.length; j++) {
        if (mask[j]) continue;
        if (code[j] === '(' || code[j] === '[' || code[j] === '{') depth++;
        else if (code[j] === ')' || code[j] === ']' || code[j] === '}') {
          depth--;
          if (depth === 0) {
            if (code[j] === ')') { chars[open] = '['; chars[j] = ']'; }
            break;
          }
        }
      }
    }
    return chars.join('');
  }

  // Texty z MATLABu ('…' i "…") -> řetězce math.js. Zpětné lomítko se nebere jako escape
  // (jako v MATLABu), takže '\sigma' nebo 'C:\data' zůstanou beze změny; '' uvnitř = apostrof.
  function transformStrings(code) {
    if (code.indexOf("'") < 0 && code.indexOf('"') < 0) return code;
    let out = '';
    let i = 0;
    while (i < code.length) {
      const c = code[i];
      if (c === '"' || (c === "'" && !OPERAND_END.test(code[i - 1] || ''))) {
        let j = i + 1;
        let txt = '';
        while (j < code.length) {
          if (code[j] === c) {
            if (code[j + 1] === c) { txt += c; j += 2; continue; }
            break;
          }
          txt += code[j++];
        }
        out += JSON.stringify(txt);
        i = j + 1;
        continue;
      }
      out += c;
      i++;
    }
    return out;
  }

  // Vyhodnocení jednoho výrazu ve workspace (používají i grafické příkazy pro své argumenty)
  function prepare(code, scope) {
    return patchNode(math.parse(transformStrings(transformIndex(transformMatrix(code), scope))));
  }
  function evalExpr(code, scope) {
    return prepare(code, scope).compile().evaluate(scope);
  }

  // Operátor * -> mtimes (kontrola vektor * vektor)
  function patchNode(node) {
    return node.transform((n) => {
      if (n.isOperatorNode && n.fn === 'multiply' && n.args.length === 2) {
        return new math.FunctionNode(new math.SymbolNode('mtimes'), n.args.map(patchNode));
      }
      return n;
    });
  }

  /* =====================================================================
     6) Chybové hlášky česky
     ===================================================================== */
  function czError(e) {
    let msg = String((e && e.message) || e).replace(/\s*\(char \d+\)/g, '');
    let hint = (e && e.hint) || '';
    let m;
    if ((m = msg.match(/^GFX_HANDLE:(\w+)/))) {
      msg = 'Výsledek funkce ' + m[1] + ' (handle) zatím nejde uložit do proměnné';
      hint = 'Napiš jen ' + m[1] + '(…) bez přiřazení. Vlastnosti nastavíš přes set(gca, …).';
    } else if (msg === 'VEC_TIMES_VEC') {
      msg = 'Násobení dvou vektorů operátorem *';
      hint = 'Pro prvkové násobení použij .* (např. U .* I). Skalární součin je dot(a, b).';
    } else if ((m = msg.match(/^Undefined symbol (\S+)/))) {
      msg = 'Neznámý symbol „' + m[1] + '“';
      hint = 'Proměnná ještě není definovaná, nebo je v názvu překlep (záleží na velikosti písmen).';
    } else if ((m = msg.match(/^Undefined function (\S+)/))) {
      msg = 'Neznámá funkce „' + m[1] + '“';
      hint = 'Seznam podporovaných funkcí najdeš v nápovědě (?).';
    } else if (/must be 2 dimensional|must be a square matrix/.test(msg)) {
      hint = 'Pro prvkovou mocninu vektoru použij .^ (např. x.^2).';
    } else if (/Dimension mismatch/.test(msg)) {
      hint = 'Nesouhlasí rozměry – vektory musí mít stejnou délku. Prvkové operace: .* ./ .^';
    } else if (/Units do not match|do not have the same base|not a unit|Unit .* not found/i.test(msg)) {
      hint = 'Nesouhlasí jednotky (např. sčítáš kW a A).';
    } else if (/Unexpected end of expression/.test(msg)) {
      hint = 'Neúplný výraz – chybí operand nebo závorka?';
    } else if (/Parenthesis \) expected|End of matrix \] expected|Unexpected end/.test(msg)) {
      hint = 'Chybí uzavírací závorka.';
    } else if (/Unexpected type of argument/.test(msg)) {
      hint = 'Funkce dostala jiný typ hodnoty, než čeká (např. vektor místo čísla).';
    } else if (/Index out of range/.test(msg)) {
      hint = 'Index je mimo rozsah – indexuje se od 1 do délky vektoru.';
    }
    return { message: msg, hint };
  }

  /* =====================================================================
     7) Běh skriptu
     ===================================================================== */
  function setPrecision(mode) { precision = mode === 'long' ? 15 : 5; }
  function getPrecisionMode() { return precision > 5 ? 'long' : 'short'; }

  /**
   * Spustí zdrojový kód v daném workspace (scope se mění na místě).
   * opts.lineOffset – posun čísel řádků (pro „spustit výběr“)
   * opts.meta – { funcs: {} } zdrojové texty uživatelských funkcí
   * opts.gfx – stav grafů (MC.graphics.newState()), do kterého kreslí plot, title…
   * Vrací { outputs, error, count, ms }
   */
  function run(src, scope, opts) {
    opts = opts || {};
    const meta = opts.meta || { funcs: {} };
    const lineOffset = opts.lineOffset || 0;
    const gfx = opts.gfx || (MC.graphics ? MC.graphics.newState() : null);
    const outputs = [];
    const t0 = performance.now();
    let count = 0;
    let error = null;
    let statements;
    currentOut = outputs;
    try {
      statements = splitStatements(src);
    } catch (e) {
      statements = [];
      error = Object.assign({ line: 1 + lineOffset }, czError(e));
    }
    for (const st of statements) {
      const line = st.line + lineOffset;
      currentLine = line;
      const code = st.code;
      let m;
      try {
        // --- speciální příkazy ---
        if (/^clc$/.test(code)) { outputs.push({ type: 'clc', line }); count++; continue; }
        if ((m = code.match(/^(?:clear|clearvars)(?:\s+(.*))?$/))) {
          const names = (m[1] || 'all').trim().split(/\s+/);
          if (names.includes('all') || names.includes('-all')) { Object.keys(scope).forEach((k) => delete scope[k]); meta.funcs = {}; } else names.forEach((nm) => { delete scope[nm]; delete meta.funcs[nm]; });
          outputs.push({ type: 'clear', line });
          count++;
          continue;
        }
        if ((m = code.match(/^format(?:\s+(short|long))?(?:\s*g)?(?:\s+(short|long))?$/))) {
          setPrecision(m[1] || m[2] || 'short');
          outputs.push({ type: 'format', mode: getPrecisionMode(), line });
          count++;
          continue;
        }
        // --- grafické příkazy (figure, plot, title, legend, …) ---
        const gcall = MC.graphics ? MC.graphics.parseCall(code, scope) : null;
        if (gcall) {
          MC.graphics.exec(gcall, {
            gfx, line, scope, code,
            evalExpr: (c) => evalExpr(c, scope),
            warn: (text) => outputs.push({ type: 'warn', text, line }),
          });
          count++;
          continue;
        }
        if ((m = code.match(/^[A-Za-z_]\w*\s*=\s*(figure|plot|semilogx|semilogy|loglog|title|xlabel|ylabel|legend|gca|gcf)\b/)) &&
          MC.graphics && !Object.prototype.hasOwnProperty.call(scope, m[1])) {
          throw new Error('GFX_HANDLE:' + m[1]);
        }

        // --- běžný výraz ---
        const node = prepare(code, scope);
        const value = node.compile().evaluate(scope);
        count++;

        if (node.type === 'FunctionAssignmentNode') {
          meta.funcs[node.name] = code;
          if (st.visible) outputs.push({ type: 'fn', name: node.name, text: code, line });
        } else if (node.type === 'AssignmentNode') {
          const name = node.object && node.object.name ? node.object.name : null;
          if (name && meta.funcs[name]) delete meta.funcs[name];
          if (st.visible && name) outputs.push({ type: 'value', name, value: scope[name], line, p: precision });
        } else if (node.type === 'SymbolNode' && Object.prototype.hasOwnProperty.call(scope, node.name)) {
          // samotný název proměnné jen vypíše její hodnotu (ans se nemění)
          if (st.visible) outputs.push({ type: 'value', name: node.name, value, line, p: precision });
        } else if (value !== undefined) {
          if (typeof value === 'function') {
            if (st.visible) outputs.push({ type: 'value', name: 'ans', value, line, p: precision });
          } else {
            scope.ans = value;
            if (st.visible) outputs.push({ type: 'value', name: 'ans', value, line, p: precision });
          }
        }
      } catch (e) {
        error = Object.assign({ line }, czError(e));
        break;
      }
    }
    currentOut = null;
    return { outputs, error, count, ms: performance.now() - t0 };
  }

  MC.engine = {
    math,
    run,
    describe,
    plotData,
    formatValue,
    fmtScalar,
    toClipboardText,
    setPrecision,
    getPrecisionMode,
    splitStatements,
    evalExpr,
    czError,
    transformMatrix,
    transformIndex,
  };
})();
