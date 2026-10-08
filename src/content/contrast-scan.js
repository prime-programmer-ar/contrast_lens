/*
 * Page contrast scan: finds every visible piece of text, resolves its real foreground colour
 * (including opacity) and the colour it sits on (compositing translucent ancestors), then applies WCAG 1.4.3 / 1.4.6.
 */
(() => {
  const CL = window.__CL;
  const C = window.CLColor;
  if (!CL || CL.handlers.scan) return;

  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'OPTION', 'HEAD', 'TITLE', 'META', 'TEXTAREA']);
  const MAX_ELEMENTS = 4000;
  const MAX_ITEMS_RETURNED = 500;

  function canvasColor() {
    const scheme = getComputedStyle(document.documentElement).colorScheme || '';
    const dark = /\bdark\b/.test(scheme) && (!/\blight\b/.test(scheme) || matchMedia('(prefers-color-scheme: dark)').matches);
    return dark ? { r: 18, g: 18, b: 18, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };
  }

  function makeBackgroundResolver(base) {
    const cache = new Map();
    const resolve = (node) => {
      if (!node || node.nodeType !== 1) return { color: base, uncertain: false };
      if (cache.has(node)) return cache.get(node);
      const cs = getComputedStyle(node);
      const own = C.parseColor(cs.backgroundColor) || { r: 0, g: 0, b: 0, a: 0 };
      const hasImage = !!cs.backgroundImage && cs.backgroundImage !== 'none';
      let res;
      if (own.a >= 1) res = { color: { ...own, a: 1 }, uncertain: hasImage };
      else {
        const parent = resolve(node.parentElement);
        res = { color: own.a > 0 ? C.composite(own, parent.color) : parent.color, uncertain: parent.uncertain || hasImage };
      }
      cache.set(node, res);
      return res;
    };
    return resolve;
  }

  function ancestorOpacity(el) {
    let o = 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const v = parseFloat(getComputedStyle(n).opacity);
      if (!Number.isNaN(v)) o *= v;
    }
    return o;
  }

  function required(level, large) {
    if (level === 'AAA') return large ? 4.5 : 7;
    return large ? 3 : 4.5;
  }

  CL.handlers.scan = ({ level = 'AA' } = {}) => {
    CL.resetReg('scan');
    if (!document.body) throw new Error('This page has no body to scan.');

    // 1. group text nodes by their parent element
    const groups = new Map();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const text = node.nodeValue.trim();
      if (!text) continue;
      const el = node.parentElement;
      if (!el || SKIP_TAGS.has(el.tagName)) continue;
      const g = groups.get(el) || { chars: 0, text: '' };
      g.chars += text.length;
      if (g.text.length < 90) g.text += (g.text ? ' ' : '') + text;
      groups.set(el, g);
      if (groups.size >= MAX_ELEMENTS) break;
    }

    // 2. evaluate each element
    const bgOf = makeBackgroundResolver(canvasColor());
    const items = [];
    for (const [el, g] of groups) {
      if (!CL.util.isVisible(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) continue; // screen-reader-only text
      try { if (el.closest(':disabled')) continue; } catch (e) { /* ignore */ }

      const cs = getComputedStyle(el);
      const fill = C.parseColor(cs.webkitTextFillColor);
      const fg = { ...(fill || C.parseColor(cs.color) || { r: 0, g: 0, b: 0, a: 1 }) };
      fg.a = (fg.a == null ? 1 : fg.a) * ancestorOpacity(el);
      if (fg.a <= 0.01) continue;

      const bg = bgOf(el);
      const fgOpaque = C.composite(fg, bg.color);
      const ratio = C.contrastRatio(fgOpaque, bg.color);
      const size = parseFloat(cs.fontSize) || 16;
      const weight = parseInt(cs.fontWeight, 10) || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      const need = required(level, large);
      const pass = Math.floor(ratio * 100 + 1e-9) / 100 >= need;

      items.push({
        id: CL.reg('scan', el),
        selector: CL.util.cssPath(el),
        text: CL.util.snippet(g.text),
        chars: g.chars,
        fg: C.toHex(fgOpaque),
        bg: C.toHex(bg.color),
        ratio,
        required: need,
        large,
        size: Math.round(size * 10) / 10,
        weight,
        pass,
        uncertain: bg.uncertain,
      });
    }

    // 3. summarise
    const combos = new Map();
    for (const it of items) {
      const key = it.fg + '|' + it.bg;
      const c = combos.get(key) || { fg: it.fg, bg: it.bg, chars: 0, count: 0, ratio: it.ratio, uncertain: false };
      c.chars += it.chars;
      c.count++;
      c.uncertain = c.uncertain || it.uncertain;
      combos.set(key, c);
    }
    const topCombos = [...combos.values()].sort((a, b) => b.chars - a.chars).slice(0, 8);

    const rank = (it) => (!it.pass ? 0 : it.uncertain ? 1 : 2);
    const sorted = [...items].sort((a, b) => rank(a) - rank(b) || a.ratio - b.ratio);

    return {
      level,
      truncated: groups.size >= MAX_ELEMENTS,
      summary: {
        total: items.length,
        fail: items.filter((i) => !i.pass).length,
        uncertain: items.filter((i) => i.uncertain).length,
        pass: items.filter((i) => i.pass).length,
      },
      combos: topCombos,
      items: sorted.slice(0, MAX_ITEMS_RETURNED),
    };
  };
})();
