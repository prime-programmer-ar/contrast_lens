/*!
 * ContrastLens colour maths — WCAG 2.x relative luminance and contrast ratio.
 * Loads as a classic <script> (global `CLColor`), as a content script, and in Node (require).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CLColor = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  // Rec. 709 / sRGB luminance coefficients used by WCAG.
  const LR = 0.2126;
  const LG = 0.7152;
  const LB = 0.0722;

  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const hex2 = (n) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0').toUpperCase();

  function toHex(c) {
    return '#' + hex2(c.r) + hex2(c.g) + hex2(c.b);
  }

  // ---------- conversions ----------
  function rgbToHsl({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h, s, l };
  }

  function hslToRgb(h, s, l) {
    h = (((h % 360) + 360) % 360) / 360;
    if (s === 0) {
      const v = Math.round(l * 255);
      return { r: v, g: v, b: v };
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = (t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return {
      r: Math.round(f(h + 1 / 3) * 255),
      g: Math.round(f(h) * 255),
      b: Math.round(f(h - 1 / 3) * 255),
    };
  }

  // ---------- parsing ----------
  function parseHex(str) {
    const m = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(str);
    if (!m) return null;
    let h = m[1];
    if (h.length <= 4) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a };
  }

  function parseFunctional(str) {
    const m = /^(rgba?|hsla?)\(\s*([^)]+)\)$/i.exec(str);
    if (!m) return null;
    const parts = m[2].replace(/[,/]/g, ' ').trim().split(/\s+/);
    if (parts.length < 3) return null;
    let a = 1;
    if (parts[3] !== undefined) {
      a = parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
      if (Number.isNaN(a)) return null;
    }
    a = clamp(a, 0, 1);
    if (m[1].toLowerCase().startsWith('rgb')) {
      const ch = parts.slice(0, 3).map((p) => (p.endsWith('%') ? parseFloat(p) * 2.55 : parseFloat(p)));
      if (ch.some(Number.isNaN)) return null;
      return { r: clamp(Math.round(ch[0]), 0, 255), g: clamp(Math.round(ch[1]), 0, 255), b: clamp(Math.round(ch[2]), 0, 255), a };
    }
    const h = parseFloat(parts[0]);
    const s = parseFloat(parts[1]) / 100;
    const l = parseFloat(parts[2]) / 100;
    if ([h, s, l].some(Number.isNaN)) return null;
    return { ...hslToRgb(h, clamp(s, 0, 1), clamp(l, 0, 1)), a };
  }

  // Fallback for named colours, oklch(), color(), lab() ... — let the browser resolve them.
  let canvasCtx = null;
  function parseViaCanvas(str) {
    if (typeof document === 'undefined') return null;
    try {
      if (!canvasCtx) {
        const c = document.createElement('canvas');
        c.width = c.height = 1;
        canvasCtx = c.getContext('2d', { willReadFrequently: true });
      }
      const ctx = canvasCtx;
      ctx.fillStyle = '#010203';
      ctx.fillStyle = str;
      if (ctx.fillStyle === '#010203' && str.trim().toLowerCase() !== '#010203') return null; // rejected
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
    } catch (e) {
      return null;
    }
  }

  /** Parse any CSS colour string to {r,g,b,a}; returns null if it cannot be understood. */
  function parseColor(input) {
    if (input == null) return null;
    const str = String(input).trim();
    if (!str) return null;
    if (str.toLowerCase() === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    return parseHex(str) || parseFunctional(str) || parseViaCanvas(str);
  }

  // ---------- WCAG maths ----------
  /** Steps 1+2 of the WCAG method: normalise to 0–1, then gamma-correct (sRGB → linear). */
  function toLinear(c8) {
    const c = c8 / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function fromLinear(v) {
    const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return clamp(c, 0, 1) * 255;
  }

  /** Step 3: relative luminance. */
  function relativeLuminance(c) {
    return LR * toLinear(c.r) + LG * toLinear(c.g) + LB * toLinear(c.b);
  }

  /** Step 4: (L1 + 0.05) / (L2 + 0.05) with L1 the lighter colour. Range 1 – 21. */
  function contrastRatio(c1, c2) {
    const a = relativeLuminance(c1);
    const b = relativeLuminance(c2);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }

  /** Floor (never round up) to 2 decimals so 4.499 is not shown as a passing 4.50. */
  function formatRatio(ratio) {
    return (Math.floor(ratio * 100 + 1e-9) / 100).toFixed(2);
  }

  function wcag(ratio) {
    const r = Math.floor(ratio * 100 + 1e-9) / 100;
    return {
      aaNormal: r >= 4.5,
      aaLarge: r >= 3,
      aaaNormal: r >= 7,
      aaaLarge: r >= 4.5,
      ui: r >= 3,
    };
  }

  function rate(ratio) {
    const r = Math.floor(ratio * 100 + 1e-9) / 100;
    if (r >= 7) return { tier: 'aaa', label: 'Excellent' };
    if (r >= 4.5) return { tier: 'aa', label: 'Good' };
    if (r >= 3) return { tier: 'large', label: 'Large text only' };
    return { tier: 'fail', label: 'Fails' };
  }

  /** Per-channel working, mirroring the worked example (normalise → gamma → luminance). */
  function explainColor(c) {
    const channels = ['r', 'g', 'b'].map((k) => {
      const value = c[k];
      const normalized = value / 255;
      const small = normalized <= 0.04045;
      return {
        key: k.toUpperCase(),
        value,
        normalized,
        branch: small ? 'linear' : 'power',
        linear: small ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4),
      };
    });
    const luminance = LR * channels[0].linear + LG * channels[1].linear + LB * channels[2].linear;
    return { hex: toHex(c), channels, luminance };
  }

  function explainPair(a, b) {
    const ea = explainColor(a);
    const eb = explainColor(b);
    const aLighter = ea.luminance >= eb.luminance;
    const lighter = aLighter ? ea.luminance : eb.luminance;
    const darker = aLighter ? eb.luminance : ea.luminance;
    return { a: ea, b: eb, lighter, darker, lighterIs: aLighter ? 'a' : 'b', ratio: (lighter + 0.05) / (darker + 0.05) };
  }

  /** Source-over alpha compositing. `bg` defaults to opaque white. */
  function composite(fg, bg) {
    bg = bg || { r: 255, g: 255, b: 255, a: 1 };
    const fa = fg.a == null ? 1 : fg.a;
    const ba = bg.a == null ? 1 : bg.a;
    const oa = fa + ba * (1 - fa);
    if (oa === 0) return { r: 0, g: 0, b: 0, a: 0 };
    const mix = (f, b) => Math.round((f * fa + b * ba * (1 - fa)) / oa);
    return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b), a: oa };
  }

  /**
   * Nudge `color` (keeping hue + saturation, changing HSL lightness) until it reaches
   * `target` contrast against `other`. Picks the smallest change in either direction.
   */
  function adjustToTarget(color, other, target) {
    if (contrastRatio(color, other) >= target) return { ...color, hex: toHex(color), ratio: contrastRatio(color, other) };
    const hsl = rgbToHsl(color);
    let best = null;
    for (const dir of [-1, 1]) {
      for (let step = 1; step <= 200; step++) {
        const l = hsl.l + (dir * step) / 200;
        if (l < -1e-9 || l > 1 + 1e-9) break;
        const cand = hslToRgb(hsl.h, hsl.s, clamp(l, 0, 1));
        if (contrastRatio(cand, other) >= target) {
          if (!best || step < best.step) best = { rgb: cand, step };
          break;
        }
      }
    }
    if (!best) {
      for (const cand of [{ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }]) {
        if (contrastRatio(cand, other) >= target) { best = { rgb: cand, step: 999 }; break; }
      }
    }
    return best ? { ...best.rgb, hex: toHex(best.rgb), ratio: contrastRatio(best.rgb, other) } : null;
  }

  function bestTextColor(bg) {
    const black = { r: 0, g: 0, b: 0 };
    const white = { r: 255, g: 255, b: 255 };
    return contrastRatio(black, bg) >= contrastRatio(white, bg) ? black : white;
  }

  // ---------- colour-vision-deficiency simulation (Machado et al. 2009, severity 1.0, linear RGB) ----------
  const CVD_MATRICES = {
    protanopia: [
      [0.152286, 1.052583, -0.204868],
      [0.114503, 0.786281, 0.099216],
      [-0.003882, -0.048116, 1.051998],
    ],
    deuteranopia: [
      [0.367322, 0.860646, -0.227968],
      [0.280085, 0.672501, 0.047413],
      [-0.01182, 0.04294, 0.968881],
    ],
    tritanopia: [
      [1.255528, -0.076749, -0.178779],
      [-0.078411, 0.930809, 0.147602],
      [0.004733, 0.691367, 0.3039],
    ],
    achromatopsia: [
      [LR, LG, LB],
      [LR, LG, LB],
      [LR, LG, LB],
    ],
  };
  const CVD_TYPES = Object.keys(CVD_MATRICES);

  function simulate(c, type) {
    const m = CVD_MATRICES[type];
    if (!m) return { r: c.r, g: c.g, b: c.b };
    const lin = [toLinear(c.r), toLinear(c.g), toLinear(c.b)];
    const out = m.map((row) => row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]);
    return { r: Math.round(fromLinear(out[0])), g: Math.round(fromLinear(out[1])), b: Math.round(fromLinear(out[2])) };
  }

  return {
    parseColor, toHex, rgbToHsl, hslToRgb, toLinear, fromLinear,
    relativeLuminance, contrastRatio, formatRatio, wcag, rate,
    explainColor, explainPair, composite, adjustToTarget, bestTextColor,
    simulate, CVD_MATRICES, CVD_TYPES,
  };
});
