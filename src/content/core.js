/*
 * ContrastLens content-script core: message router, overlay layer and shared DOM helpers.
 * Injected on demand by the side panel (never runs on pages you don't inspect).
 */
(() => {
  if (window.__CL) return;
  const C = window.CLColor;
  const CL = (window.__CL = { version: '1.0.0', handlers: {}, registry: {}, util: {}, ui: {} });

  // Clean up leftovers from a previous (now orphaned) injection, e.g. after reloading the extension.
  for (const id of ['__contrast_lens_overlay__', '__contrast_lens_picker__', '__cl_cvd_svg__']) {
    document.getElementById(id)?.remove();
  }

  // ---------------------------------------------------------------- registry
  // Elements found by scans are kept here so the panel can ask us to highlight them by id.
  CL.reg = (ns, el) => {
    const list = (CL.registry[ns] = CL.registry[ns] || []);
    list.push(el);
    return list.length - 1;
  };
  CL.resetReg = (ns) => { CL.registry[ns] = []; };

  // ---------------------------------------------------------------- util
  const u = CL.util;

  u.cssPath = (el) => {
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.body && node !== document.documentElement && parts.length < 4) {
      let part = node.localName;
      if (node.id && /^[A-Za-z][\w-]*$/.test(node.id)) {
        parts.unshift(part + '#' + node.id);
        break;
      }
      const cls = [...node.classList].filter((c) => /^[A-Za-z_][\w-]*$/.test(c)).slice(0, 2);
      if (cls.length) part += '.' + cls.join('.');
      else {
        const sibs = [...(node.parentElement ? node.parentElement.children : [])].filter((s) => s.localName === node.localName);
        if (sibs.length > 1) part += `:nth-of-type(${sibs.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(' > ') || (el && el.localName) || '';
  };

  u.isVisible = (el) => {
    if (typeof el.checkVisibility === 'function') {
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    } else {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  u.textOf = (node) => (node.textContent || '').replace(/\s+/g, ' ').trim();
  u.snippet = (s, n = 70) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  const NAME_FROM_CONTENT_TAGS = new Set(['a', 'button', 'summary', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'label', 'legend', 'option', 'caption', 'figcaption', 'th', 'td', 'li']);
  const NAME_FROM_CONTENT_ROLES = /^(button|link|tab|menuitem|menuitemcheckbox|menuitemradio|option|checkbox|radio|switch|heading|treeitem|cell|columnheader|rowheader)$/;

  function contentName(node, depth = 0) {
    if (depth > 6) return '';
    let out = '';
    for (const ch of node.childNodes) {
      if (ch.nodeType === 3) out += ch.nodeValue;
      else if (ch.nodeType === 1) {
        if (ch.getAttribute('aria-hidden') === 'true' || ch.hidden) continue;
        const tag = ch.localName;
        if (tag === 'script' || tag === 'style') continue;
        const al = ch.getAttribute('aria-label');
        if (al) { out += ' ' + al + ' '; continue; }
        if (tag === 'img') { out += ' ' + (ch.getAttribute('alt') || '') + ' '; continue; }
        if (tag === 'svg') { const t = ch.querySelector('title'); out += ' ' + (t ? t.textContent : '') + ' '; continue; }
        out += ' ' + contentName(ch, depth + 1) + ' ';
      }
    }
    return out.replace(/\s+/g, ' ').trim();
  }

  /** Simplified accessible-name computation. Returns { name, source }. */
  u.accName = (el) => {
    const lb = el.getAttribute('aria-labelledby');
    if (lb) {
      const t = lb.split(/\s+/).map((id) => document.getElementById(id)).filter(Boolean).map(u.textOf).join(' ').trim();
      if (t) return { name: t, source: 'aria-labelledby' };
    }
    const al = (el.getAttribute('aria-label') || '').trim();
    if (al) return { name: al, source: 'aria-label' };
    const tag = el.localName;
    if (el.labels && el.labels.length) {
      const t = [...el.labels].map(u.textOf).join(' ').trim();
      if (t) return { name: t, source: 'label' };
    }
    if (tag === 'img' || tag === 'area' || (tag === 'input' && el.type === 'image')) {
      const alt = (el.getAttribute('alt') || '').trim();
      if (alt) return { name: alt, source: 'alt' };
    }
    if (tag === 'input' && ['button', 'submit', 'reset'].includes(el.type)) {
      const v = (el.value || '').trim() || (el.type === 'submit' ? 'Submit' : el.type === 'reset' ? 'Reset' : '');
      if (v) return { name: v, source: 'value' };
    }
    const role = el.getAttribute('role');
    if (NAME_FROM_CONTENT_TAGS.has(tag) || (role && NAME_FROM_CONTENT_ROLES.test(role))) {
      const t = contentName(el);
      if (t) return { name: t, source: 'content' };
    }
    if (tag === 'svg') {
      const t = el.querySelector('title');
      if (t && t.textContent.trim()) return { name: t.textContent.trim(), source: 'svg-title' };
    }
    const title = (el.getAttribute('title') || '').trim();
    if (title) return { name: title, source: 'title' };
    const ph = (el.getAttribute('placeholder') || '').trim();
    if (ph) return { name: ph, source: 'placeholder' };
    return { name: '', source: 'none' };
  };

  // ---------------------------------------------------------------- overlay UI (shadow DOM, page coordinates)
  const HOST_ID = '__contrast_lens_overlay__';
  const OVERLAY_CSS = `
    .box{position:absolute;box-sizing:border-box;border:2px solid #2563eb;border-radius:3px;pointer-events:none}
    .box.warn{border-color:#d97706}.box.err{border-color:#dc2626}.box.dash{border-style:dashed}
    .hl{position:absolute;box-sizing:border-box;border:3px solid #f59e0b;background:rgba(245,158,11,.18);border-radius:4px;
        box-shadow:0 0 0 4px rgba(245,158,11,.35);animation:cl-pulse 1s ease-in-out 3;pointer-events:none}
    @keyframes cl-pulse{50%{box-shadow:0 0 0 10px rgba(245,158,11,0)}}
    @media (prefers-reduced-motion:reduce){.hl{animation:none}}
    .badge{position:absolute;min-width:20px;height:20px;padding:0 5px;box-sizing:border-box;border-radius:10px;background:#2563eb;color:#fff;
           font:700 12px/20px system-ui,sans-serif;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.45);pointer-events:none}
    .badge.warn{background:#d97706}.badge.err{background:#dc2626}
    svg{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}`;

  CL.ui.layer = (name) => {
    let host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = HOST_ID;
      host.style.cssText = 'all:initial;position:absolute;top:0;left:0;width:0;height:0;z-index:2147483646;pointer-events:none;';
      const sr = host.attachShadow({ mode: 'open' });
      try {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(OVERLAY_CSS);
        sr.adoptedStyleSheets = [sheet];
      } catch (e) {
        const st = document.createElement('style');
        st.textContent = OVERLAY_CSS;
        sr.appendChild(st);
      }
      document.documentElement.appendChild(host);
    }
    const sr = host.shadowRoot;
    let layer = sr.querySelector(`[data-layer="${name}"]`);
    if (!layer) {
      layer = document.createElement('div');
      layer.dataset.layer = name;
      sr.appendChild(layer);
    }
    return layer;
  };
  CL.ui.clear = (name) => { CL.ui.layer(name).textContent = ''; };
  CL.ui.pageRect = (el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left + window.scrollX, top: r.top + window.scrollY, width: r.width, height: r.height };
  };
  CL.ui.box = (layer, rect, cls = '', pad = 0) => {
    const b = document.createElement('div');
    b.className = 'box ' + cls;
    b.style.left = rect.left - pad + 'px';
    b.style.top = rect.top - pad + 'px';
    b.style.width = rect.width + pad * 2 + 'px';
    b.style.height = rect.height + pad * 2 + 'px';
    layer.appendChild(b);
    return b;
  };

  let hlTimer = 0;
  CL.handlers.highlight = ({ ns, id }) => {
    const el = (CL.registry[ns] || [])[id];
    if (!el || !el.isConnected) return { found: false };
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const layer = CL.ui.layer('highlight');
    layer.textContent = '';
    const r = CL.ui.pageRect(el);
    const hl = CL.ui.box(layer, r, 'hl', 3);
    hl.className = 'hl';
    clearTimeout(hlTimer);
    hlTimer = setTimeout(() => CL.ui.clear('highlight'), 4000);
    return { found: true };
  };

  CL.handlers.clearOverlays = () => {
    clearTimeout(hlTimer);
    for (const n of ['highlight', 'taborder']) CL.ui.clear(n);
    return {};
  };

  CL.handlers.ping = () => ({ version: CL.version, title: document.title, url: location.href });

  // ---------------------------------------------------------------- message router
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.ns !== 'CL' || !msg.cmd) return false;
    const handler = CL.handlers[msg.cmd];
    if (!handler) {
      sendResponse({ ok: false, error: 'Unknown command: ' + msg.cmd });
      return false;
    }
    Promise.resolve()
      .then(() => handler(msg))
      .then(
        (data) => sendResponse({ ok: true, data }),
        (err) => sendResponse({ ok: false, error: (err && err.message) || String(err) })
      );
    return true; // async response
  });

  // keep eslint-style readers happy: C is used by sibling modules through window.CLColor
  void C;
})();
