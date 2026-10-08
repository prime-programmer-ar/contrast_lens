/*
 * Keyboard / tab-order check. Computes the sequence a keyboard user would tab through
 * (positive tabindex first, then DOM order), draws numbered badges + arrows on the page and flags problems.
 */
(() => {
  const CL = window.__CL;
  if (!CL || CL.handlers.tabOrder) return;

  const FOCUSABLE =
    'a[href],button,input:not([type="hidden"]),select,textarea,summary,iframe,[tabindex],' +
    '[contenteditable]:not([contenteditable="false"]),audio[controls],video[controls]';
  const TABBABLE_NATIVE =
    'a[href],button,input:not([type="hidden"]),select,textarea,summary,[tabindex]:not([tabindex^="-"]),' +
    '[contenteditable]:not([contenteditable="false"])';
  const NATIVE_TAGS = new Set(['a', 'button', 'input', 'select', 'textarea', 'summary', 'iframe', 'audio', 'video', 'details']);
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const MAX_DRAWN = 500;

  function collectStops() {
    const base = [];
    [...document.querySelectorAll(FOCUSABLE)].forEach((el, dom) => {
      if (el.matches(':disabled') || el.closest('[inert]')) return;
      const ti = el.tabIndex;
      if (ti < 0) return;
      if (!CL.util.isVisible(el)) return;
      base.push({ el, dom, ti });
    });

    // Radio groups are a single tab stop (the checked one, otherwise the first).
    const groups = new Map();
    for (const s of base) {
      if (s.el.type === 'radio' && s.el.name) {
        const formIdx = s.el.form ? [...document.forms].indexOf(s.el.form) : -1;
        const key = formIdx + '|' + s.el.name;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(s);
      }
    }
    const drop = new Set();
    for (const list of groups.values()) {
      const keep = list.find((s) => s.el.checked) || list[0];
      list.forEach((s) => { if (s !== keep) drop.add(s); });
    }
    const stops = base.filter((s) => !drop.has(s));
    const positive = stops.filter((s) => s.ti > 0).sort((a, b) => a.ti - b.ti || a.dom - b.dom);
    const natural = stops.filter((s) => s.ti === 0);
    return [...positive, ...natural];
  }

  function styleSnapshot(el) {
    const cs = getComputedStyle(el);
    return [
      cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.outlineOffset, cs.boxShadow,
      cs.borderTopColor, cs.borderTopWidth, cs.borderBottomColor, cs.backgroundColor, cs.color, cs.textDecorationLine,
    ].join('|');
  }

  /** Focus each element once and see whether anything visible changes. Heuristic, hence a warning. */
  function hasFocusIndicator(el) {
    const prevTransition = el.style.getPropertyValue('transition');
    const prevPriority = el.style.getPropertyPriority('transition');
    el.style.setProperty('transition', 'none', 'important');
    try {
      const before = styleSnapshot(el);
      el.focus({ preventScroll: true });
      if (document.activeElement !== el) return null; // could not take focus; unknown
      const after = styleSnapshot(el);
      const cs = getComputedStyle(el);
      const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
      return before !== after || outline;
    } finally {
      if (prevTransition) el.style.setProperty('transition', prevTransition, prevPriority);
      else el.style.removeProperty('transition');
    }
  }

  function findClickableButUnreachable() {
    const out = [];
    const area = innerWidth * innerHeight;
    let seen = 0;
    for (const el of document.body.querySelectorAll('*')) {
      if (++seen > 6000 || out.length >= 40) break;
      if (el.localName === 'label' && el.control) continue;
      const cs = getComputedStyle(el);
      if (cs.cursor !== 'pointer') continue;
      const parent = el.parentElement;
      if (parent && getComputedStyle(parent).cursor === 'pointer') continue; // only the root of a pointer region
      if (el.closest(TABBABLE_NATIVE) || el.querySelector(TABBABLE_NATIVE)) continue;
      if (!CL.util.isVisible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width * r.height > area * 0.8) continue;
      out.push(el);
    }
    return out;
  }

  function drawOverlay(stops, unreachable) {
    CL.ui.clear('taborder');
    const layer = CL.ui.layer('taborder');
    const docW = Math.max(document.documentElement.scrollWidth, innerWidth);
    const docH = Math.max(document.documentElement.scrollHeight, innerHeight);

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', docW);
    svg.setAttribute('height', docH);
    const defs = document.createElementNS(SVG_NS, 'defs');
    for (const [id, colour] of [['cl-arrow', '#2563eb'], ['cl-arrow-warn', '#dc2626']]) {
      const m = document.createElementNS(SVG_NS, 'marker');
      m.setAttribute('id', id);
      m.setAttribute('viewBox', '0 0 10 10');
      m.setAttribute('refX', '9');
      m.setAttribute('refY', '5');
      m.setAttribute('markerWidth', '7');
      m.setAttribute('markerHeight', '7');
      m.setAttribute('orient', 'auto-start-reverse');
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', 'M0 0L10 5L0 10z');
      p.setAttribute('fill', colour);
      m.appendChild(p);
      defs.appendChild(m);
    }
    svg.appendChild(defs);
    layer.appendChild(svg);

    const drawn = stops.slice(0, MAX_DRAWN);
    drawn.forEach((s, i) => {
      if (i === 0) return;
      const prev = drawn[i - 1];
      const line = document.createElementNS(SVG_NS, 'line');
      const jump = s.issues.some((x) => x.code === 'order-jump');
      line.setAttribute('x1', prev.rect.left + prev.rect.width / 2);
      line.setAttribute('y1', prev.rect.top + prev.rect.height / 2);
      line.setAttribute('x2', s.rect.left + s.rect.width / 2);
      line.setAttribute('y2', s.rect.top + s.rect.height / 2);
      line.setAttribute('stroke', jump ? '#dc2626' : '#2563eb');
      line.setAttribute('stroke-width', '2');
      line.setAttribute('stroke-opacity', '0.7');
      if (jump) line.setAttribute('stroke-dasharray', '6 4');
      line.setAttribute('marker-end', `url(#${jump ? 'cl-arrow-warn' : 'cl-arrow'})`);
      svg.appendChild(line);
    });

    drawn.forEach((s) => {
      const sev = s.issues.some((x) => x.sev === 'error') ? 'err' : s.issues.length ? 'warn' : '';
      CL.ui.box(layer, s.rect, sev);
      const b = document.createElement('div');
      b.className = 'badge ' + sev;
      b.textContent = String(s.n);
      b.style.left = Math.max(0, s.rect.left - 8) + 'px';
      b.style.top = Math.max(0, s.rect.top - 10) + 'px';
      layer.appendChild(b);
    });

    unreachable.forEach((u) => {
      CL.ui.box(layer, u.rect, 'warn dash');
      const b = document.createElement('div');
      b.className = 'badge warn';
      b.textContent = '!';
      b.style.left = Math.max(0, u.rect.left - 8) + 'px';
      b.style.top = Math.max(0, u.rect.top - 10) + 'px';
      layer.appendChild(b);
    });
  }

  CL.handlers.tabOrder = ({ checkFocus = true } = {}) => {
    CL.resetReg('tab');
    const ordered = collectStops();
    const previouslyFocused = document.activeElement;

    const stops = ordered.map((s, i) => {
      const el = s.el;
      const rect = CL.ui.pageRect(el);
      const tag = el.localName;
      const issues = [];
      if (s.ti > 0) issues.push({ sev: 'warning', code: 'positive-tabindex', msg: `tabindex="${s.ti}" overrides the natural order. Prefer 0 and reorder the DOM.` });
      if (!NATIVE_TAGS.has(tag) && !el.hasAttribute('role') && !el.isContentEditable) {
        issues.push({ sev: 'warning', code: 'no-role', msg: 'Focusable element has no role, so assistive tech cannot tell what it is.' });
      }
      const name = CL.util.accName(el);
      if (!name.name && tag !== 'iframe' && !(tag === 'input' && ['text', 'search', 'email', 'tel', 'url', 'password', 'number'].includes(el.type) && el.getAttribute('aria-label'))) {
        issues.push({ sev: 'error', code: 'no-name', msg: 'No accessible name — screen readers will announce just the role.' });
      }
      if (el.closest('[aria-hidden="true"]')) issues.push({ sev: 'error', code: 'aria-hidden', msg: 'Focusable but inside aria-hidden="true".' });
      if (rect.left + rect.width < 0 || rect.top + rect.height < 0) {
        issues.push({ sev: 'info', code: 'offscreen', msg: 'Positioned off-screen (fine for a skip link that appears on focus).' });
      }
      return { n: i + 1, id: CL.reg('tab', el), el, rect, tag, tabindex: s.ti, name: name.name, issues };
    });

    // Visual order: flag when focus jumps well above the previous stop.
    for (let i = 1; i < stops.length; i++) {
      const drop = stops[i - 1].rect.top - stops[i].rect.top;
      if (drop > 80) {
        stops[i].issues.push({ sev: 'warning', code: 'order-jump', msg: `Focus jumps up the page by ${Math.round(drop)}px from #${stops[i - 1].n}. Check the DOM order matches the visual order.` });
      }
    }

    if (checkFocus) {
      for (const s of stops) {
        const res = hasFocusIndicator(s.el);
        if (res === false) s.issues.push({ sev: 'warning', code: 'no-focus-indicator', msg: 'No visible change when focused (no outline, shadow, border or colour change detected).' });
      }
      try {
        if (previouslyFocused && previouslyFocused !== document.body && previouslyFocused.isConnected) previouslyFocused.focus({ preventScroll: true });
        else if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
      } catch (e) { /* ignore */ }
    }

    const unreachableEls = findClickableButUnreachable();
    const unreachable = unreachableEls.map((el) => ({
      id: CL.reg('tab', el),
      el,
      rect: CL.ui.pageRect(el),
      selector: CL.util.cssPath(el),
      text: CL.util.snippet(CL.util.textOf(el), 60),
    }));

    drawOverlay(stops, unreachable);

    const flat = stops.flatMap((s) => s.issues);
    return {
      summary: {
        stops: stops.length,
        errors: flat.filter((i) => i.sev === 'error').length,
        warnings: flat.filter((i) => i.sev === 'warning').length,
        unreachable: unreachable.length,
        truncatedDrawing: stops.length > MAX_DRAWN,
      },
      stops: stops.slice(0, 300).map((s) => ({
        n: s.n, id: s.id, tag: s.tag, tabindex: s.tabindex,
        name: CL.util.snippet(s.name, 60), selector: CL.util.cssPath(s.el), issues: s.issues,
      })),
      unreachable: unreachable.map((u) => ({ id: u.id, selector: u.selector, text: u.text })),
    };
  };
})();
