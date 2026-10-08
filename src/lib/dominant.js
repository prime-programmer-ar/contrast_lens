/*!
 * ContrastLens dominant-colour extraction (median cut on a 5-bit histogram).
 * Global `CLDominant` in browsers, module.exports in Node.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CLDominant = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const MERGE_DISTANCE = 22; // colours closer than this (RGB euclidean) are merged

  const hex2 = (n) => Math.round(n).toString(16).padStart(2, '0').toUpperCase();
  const toHex = (c) => '#' + hex2(c.r) + hex2(c.g) + hex2(c.b);

  function makeBox(list) {
    let n = 0;
    let r0 = 31, r1 = 0, g0 = 31, g1 = 0, b0 = 31, b1 = 0;
    for (const e of list) {
      n += e.n;
      if (e.kr < r0) r0 = e.kr; if (e.kr > r1) r1 = e.kr;
      if (e.kg < g0) g0 = e.kg; if (e.kg > g1) g1 = e.kg;
      if (e.kb < b0) b0 = e.kb; if (e.kb > b1) b1 = e.kb;
    }
    return { list, n, range: { kr: r1 - r0, kg: g1 - g0, kb: b1 - b0 } };
  }

  /**
   * @param {Uint8ClampedArray|number[]} data RGBA pixel data
   * @param {number} k maximum number of colours to return
   * @returns {{hex:string, rgb:{r:number,g:number,b:number}, share:number}[]} sorted by share, descending
   */
  function dominantColors(data, k = 6) {
    const bins = new Map();
    let total = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      let e = bins.get(key);
      if (!e) {
        e = { r: 0, g: 0, b: 0, n: 0, kr: r >> 3, kg: g >> 3, kb: b >> 3 };
        bins.set(key, e);
      }
      e.r += r; e.g += g; e.b += b; e.n++;
      total++;
    }
    if (!total) return [];

    let boxes = [makeBox([...bins.values()])];
    while (boxes.length < k) {
      let idx = -1;
      let best = 0;
      boxes.forEach((bx, i) => {
        const widest = Math.max(bx.range.kr, bx.range.kg, bx.range.kb);
        const score = widest * bx.n;
        if (bx.list.length > 1 && score > best) { best = score; idx = i; }
      });
      if (idx < 0) break;
      const bx = boxes[idx];
      const axis = ['kr', 'kg', 'kb'].reduce((a, b) => (bx.range[b] > bx.range[a] ? b : a), 'kr');
      bx.list.sort((p, q) => p[axis] - q[axis]);
      let acc = 0;
      let cut = 1;
      for (let i = 0; i < bx.list.length; i++) {
        acc += bx.list[i].n;
        if (acc >= bx.n / 2) { cut = i + 1; break; }
      }
      cut = Math.min(Math.max(cut, 1), bx.list.length - 1);
      boxes.splice(idx, 1, makeBox(bx.list.slice(0, cut)), makeBox(bx.list.slice(cut)));
    }

    const colours = boxes.map((bx) => {
      let r = 0, g = 0, b = 0, n = 0;
      for (const e of bx.list) { r += e.r; g += e.g; b += e.b; n += e.n; }
      return { r: r / n, g: g / n, b: b / n, n };
    }).sort((p, q) => q.n - p.n);

    const merged = [];
    for (const c of colours) {
      const near = merged.find((m) => Math.hypot(m.r - c.r, m.g - c.g, m.b - c.b) < MERGE_DISTANCE);
      if (near) {
        const n = near.n + c.n;
        near.r = (near.r * near.n + c.r * c.n) / n;
        near.g = (near.g * near.n + c.g * c.n) / n;
        near.b = (near.b * near.n + c.b * c.n) / n;
        near.n = n;
      } else merged.push({ ...c });
    }

    return merged
      .sort((p, q) => q.n - p.n)
      .map((c) => {
        const rgb = { r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b) };
        return { hex: toHex(rgb), rgb, share: c.n / total };
      });
  }

  return { dominantColors };
});
