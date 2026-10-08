/* Quick accessibility audit: a set of fast, high-signal WCAG 2.2 checks that need no external library. */
(() => {
  const CL = window.__CL;
  if (!CL || CL.handlers.audit) return;
  const U = CL.util;
  const MAX_NODES = 30;

  const q = (sel, root = document) => [...root.querySelectorAll(sel)];
  const visible = (list) => list.filter(U.isVisible);
  const n = (el, msg) => ({ el, msg });
  const TABBABLE =
    'a[href],button,input:not([type="hidden"]),select,textarea,summary,[tabindex]:not([tabindex^="-"]),[contenteditable]:not([contenteditable="false"])';
  const LABELABLE =
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]),select,textarea';

  const AUTOCOMPLETE_HINTS = [
    [/e-?mail/i, 'email'],
    [/(^|[^a-z])(tel|phone|mobile)/i, 'tel'],
    [/first.?name|given/i, 'given-name'],
    [/last.?name|surname|family/i, 'family-name'],
    [/^(full.?)?name$/i, 'name'],
    [/postal|zip/i, 'postal-code'],
    [/street|address.?line.?1|^address$/i, 'street-address'],
  ];

  const checks = [
    {
      id: 'page-title', title: 'Page has a title', severity: 'error', wcag: '2.4.2',
      help: 'Add a descriptive <title>; it is the first thing a screen reader announces.',
      run: () => (document.title.trim() ? [] : [n(null, 'The document has no <title>.')]),
    },
    {
      id: 'html-lang', title: 'Page language is declared', severity: 'error', wcag: '3.1.1',
      help: 'Set a valid lang attribute on <html>, e.g. lang="en".',
      run: () => {
        const lang = (document.documentElement.getAttribute('lang') || '').trim();
        return /^[a-z]{2,3}(-[a-z0-9]+)*$/i.test(lang) ? [] : [n(null, lang ? `Invalid lang="${lang}".` : '<html> has no lang attribute.')];
      },
    },
    {
      id: 'viewport-zoom', title: 'Pinch-zoom is not disabled', severity: 'warning', wcag: '1.4.4',
      help: 'Remove user-scalable=no and low maximum-scale values from the viewport meta tag.',
      run: () => {
        const meta = document.querySelector('meta[name="viewport"]');
        const c = meta ? meta.getAttribute('content') || '' : '';
        const max = /maximum-scale\s*=\s*([\d.]+)/i.exec(c);
        return /user-scalable\s*=\s*(no|0)/i.test(c) || (max && parseFloat(max[1]) < 2) ? [n(null, `Viewport "${c}" restricts zoom.`)] : [];
      },
    },
    {
      id: 'main-landmark', title: 'Page has a main landmark', severity: 'warning', wcag: '2.4.1',
      help: 'Wrap the primary content in <main> so keyboard and screen-reader users can jump to it.',
      run: () => (document.querySelector('main,[role="main"]') ? [] : [n(null, 'No <main> or role="main" found.')]),
    },
    {
      id: 'img-alt', title: 'Images have alt text', severity: 'error', wcag: '1.1.1',
      help: 'Add alt text; use alt="" for purely decorative images.',
      run: () => visible(q('img:not([alt]):not([role="presentation"]):not([role="none"])')).map((el) => n(el, 'Image has no alt attribute.')),
    },
    {
      id: 'img-alt-filename', title: 'Alt text is not a file name', severity: 'warning', wcag: '1.1.1',
      help: 'Describe what the image conveys instead of repeating its file name.',
      run: () => q('img[alt]').filter((el) => /\.(png|jpe?g|gif|svg|webp|avif)$/i.test(el.alt.trim())).map((el) => n(el, `alt="${el.alt}" looks like a file name.`)),
    },
    {
      id: 'form-label', title: 'Form fields have labels', severity: 'error', wcag: '1.3.1 · 4.1.2',
      help: 'Associate a <label for>, wrap the field in <label>, or add aria-label / aria-labelledby.',
      run: () => visible(q(LABELABLE)).filter((el) => U.accName(el).source === 'none').map((el) => n(el, `<${el.localName}${el.type ? ' type=' + el.type : ''}> has no label.`)),
    },
    {
      id: 'form-label-weak', title: 'Labels are more than a placeholder', severity: 'warning', wcag: '3.3.2',
      help: 'Placeholders vanish while typing and are often low-contrast. Add a visible <label>.',
      run: () => visible(q(LABELABLE)).filter((el) => ['placeholder', 'title'].includes(U.accName(el).source)).map((el) => n(el, `Only the ${U.accName(el).source} names this field.`)),
    },
    {
      id: 'autocomplete', title: 'Personal-data fields use autocomplete', severity: 'warning', wcag: '1.3.5',
      help: 'Add the matching autocomplete token (email, tel, given-name …) so browsers and assistive tech can fill the field.',
      run: () => visible(q('input:not([type="hidden"]):not([type="password"]):not([type="checkbox"]):not([type="radio"])')).flatMap((el) => {
        const ac = (el.getAttribute('autocomplete') || '').trim().toLowerCase();
        if (ac && ac !== 'off') return [];
        const hay = `${el.name} ${el.id} ${el.type === 'email' ? 'email' : ''} ${el.type === 'tel' ? 'tel' : ''}`;
        const hit = AUTOCOMPLETE_HINTS.find(([re]) => re.test(hay.trim().split(/\s+/)[0] || hay) || re.test(hay));
        return hit ? [n(el, `Looks like a "${hit[1]}" field but has no autocomplete="${hit[1]}".`)] : [];
      }),
    },
    {
      id: 'radio-group', title: 'Radio groups are grouped', severity: 'warning', wcag: '1.3.1',
      help: 'Wrap related radio buttons in <fieldset> with a <legend> (or role="radiogroup" with a label).',
      run: () => {
        const groups = new Map();
        for (const r of visible(q('input[type="radio"][name]'))) {
          const key = (r.form ? [...document.forms].indexOf(r.form) : -1) + '|' + r.name;
          (groups.get(key) || groups.set(key, []).get(key)).push(r);
        }
        return [...groups.values()].filter((g) => g.length > 1 && !g[0].closest('fieldset,[role="radiogroup"],[role="group"]')).map((g) => n(g[0], `${g.length} radio buttons named "${g[0].name}" have no group label.`));
      },
    },
    {
      id: 'button-name', title: 'Buttons have names', severity: 'error', wcag: '4.1.2',
      help: 'Give icon-only buttons an aria-label or visually hidden text.',
      run: () => visible(q('button,[role="button"],input[type="button"],input[type="submit"],input[type="reset"]')).filter((el) => !U.accName(el).name).map((el) => n(el, 'Button has no accessible name.')),
    },
    {
      id: 'link-name', title: 'Links have names', severity: 'error', wcag: '2.4.4 · 4.1.2',
      help: 'Links need text, an image with alt, or an aria-label.',
      run: () => visible(q('a[href],[role="link"]')).filter((el) => !U.accName(el).name).map((el) => n(el, 'Link has no accessible name.')),
    },
    {
      id: 'link-generic', title: 'Link text makes sense out of context', severity: 'warning', wcag: '2.4.4',
      help: 'Avoid "click here" / "read more"; say where the link goes.',
      run: () => visible(q('a[href]')).filter((el) => /^(click here|here|read more|more|learn more|link|this|details)\.?$/i.test(U.accName(el).name)).map((el) => n(el, `Link text "${U.accName(el).name}" is not descriptive.`)),
    },
    {
      id: 'label-in-name', title: 'Accessible name contains the visible label', severity: 'warning', wcag: '2.5.3',
      help: 'Voice-control users say what they see. Start aria-label with the visible text.',
      run: () => visible(q('a[href][aria-label],button[aria-label],[role="button"][aria-label]')).filter((el) => {
        const vis = U.textOf(el).toLowerCase();
        return vis && !el.getAttribute('aria-label').toLowerCase().includes(vis);
      }).map((el) => n(el, `aria-label "${el.getAttribute('aria-label')}" does not include visible text "${U.snippet(U.textOf(el), 30)}".`)),
    },
    {
      id: 'heading-empty', title: 'Headings are not empty', severity: 'error', wcag: '1.3.1',
      help: 'Remove empty headings or give them text.',
      run: () => visible(q('h1,h2,h3,h4,h5,h6,[role="heading"]')).filter((el) => !U.accName(el).name).map((el) => n(el, 'Heading has no text.')),
    },
    {
      id: 'heading-order', title: 'Heading levels do not skip', severity: 'warning', wcag: '1.3.1',
      help: 'Go h1 → h2 → h3 without skipping levels.',
      run: () => {
        const out = [];
        let prev = 0;
        for (const el of visible(q('h1,h2,h3,h4,h5,h6,[role="heading"][aria-level]'))) {
          const lvl = /^h\d$/i.test(el.localName) ? +el.localName[1] : parseInt(el.getAttribute('aria-level'), 10);
          if (prev && lvl > prev + 1) out.push(n(el, `Jumps from h${prev} to h${lvl}.`));
          prev = lvl;
        }
        return out;
      },
    },
    {
      id: 'h1-count', title: 'Page has exactly one h1', severity: 'info', wcag: 'Best practice',
      help: 'A single h1 describing the page helps navigation.',
      run: () => {
        const h1 = visible(q('h1'));
        return h1.length === 1 ? [] : h1.length === 0 ? [n(null, 'No visible <h1>.')] : h1.slice(1).map((el) => n(el, `Page has ${h1.length} h1 elements.`));
      },
    },
    {
      id: 'duplicate-id', title: 'IDs are unique', severity: 'warning', wcag: '4.1.2',
      help: 'Duplicate IDs break label/for and aria-labelledby references.',
      run: () => {
        const seen = new Map();
        q('[id]').forEach((el) => { if (el.id) (seen.get(el.id) || seen.set(el.id, []).get(el.id)).push(el); });
        return [...seen.entries()].filter(([, l]) => l.length > 1).map(([id, l]) => n(l[1], `id="${id}" is used ${l.length} times.`));
      },
    },
    {
      id: 'target-size', title: 'Touch / click targets are at least 24×24px', severity: 'warning', wcag: '2.5.8',
      help: 'WCAG 2.2 AA minimum target size (inline links and adequately spaced targets are exempt).',
      run: () => visible(q('a[href],button,input:not([type="hidden"]),select,textarea,[role="button"],[role="link"],[role="checkbox"],[role="tab"]'))
        .filter((el) => {
          if (el.localName === 'a' && getComputedStyle(el).display === 'inline') return false;
          if (el.labels && [...el.labels].some((l) => { const r = l.getBoundingClientRect(); return r.width >= 24 && r.height >= 24; })) return false;
          const r = el.getBoundingClientRect();
          return r.width < 24 || r.height < 24;
        })
        .map((el) => { const r = el.getBoundingClientRect(); return n(el, `Target is ${Math.round(r.width)}×${Math.round(r.height)}px.`); }),
    },
    {
      id: 'positive-tabindex', title: 'No positive tabindex values', severity: 'warning', wcag: '2.4.3',
      help: 'Positive tabindex creates a separate, fragile tab order. Use 0 or -1 and fix the DOM order.',
      run: () => q('[tabindex]').filter((el) => parseInt(el.getAttribute('tabindex'), 10) > 0).map((el) => n(el, `tabindex="${el.getAttribute('tabindex')}".`)),
    },
    {
      id: 'aria-hidden-focusable', title: 'aria-hidden content is not focusable', severity: 'error', wcag: '4.1.2',
      help: 'Hidden-from-AT elements that can still receive focus create ghost tab stops.',
      run: () => q('[aria-hidden="true"]').filter((el) => (el.matches(TABBABLE) || el.querySelector(TABBABLE)) && U.isVisible(el)).map((el) => n(el, 'aria-hidden region contains focusable elements.')),
    },
    {
      id: 'iframe-title', title: 'Iframes have titles', severity: 'warning', wcag: '4.1.2',
      help: 'Add a title attribute describing the frame content.',
      run: () => visible(q('iframe')).filter((el) => !(el.title || el.getAttribute('aria-label') || '').trim()).map((el) => n(el, 'Iframe has no title.')),
    },
    {
      id: 'table-headers', title: 'Data tables have header cells', severity: 'info', wcag: '1.3.1',
      help: 'Use <th> (with scope) so screen readers can announce headers.',
      run: () => visible(q('table:not([role="presentation"]):not([role="none"])')).filter((t) => !t.querySelector('th') && t.rows.length > 1 && t.rows[0].cells.length > 1).map((t) => n(t, 'Table has no <th> cells.')),
    },
    {
      id: 'autoplay', title: 'No unmuted autoplay media', severity: 'warning', wcag: '1.4.2',
      help: 'Audio that plays automatically for more than 3 seconds needs a pause/mute control.',
      run: () => q('video[autoplay]:not([muted]),audio[autoplay]').map((el) => n(el, 'Media autoplays with sound.')),
    },
  ];

  CL.handlers.audit = () => {
    CL.resetReg('audit');
    const results = [];
    const passed = [];
    for (const chk of checks) {
      let nodes;
      try { nodes = chk.run(); } catch (e) { nodes = []; }
      if (!nodes.length) { passed.push(chk.title); continue; }
      results.push({
        id: chk.id, title: chk.title, severity: chk.severity, wcag: chk.wcag, help: chk.help, count: nodes.length,
        nodes: nodes.slice(0, MAX_NODES).map((x) => ({
          id: x.el && x.el !== document.documentElement ? CL.reg('audit', x.el) : null,
          selector: x.el ? U.cssPath(x.el) : '',
          msg: x.msg,
        })),
      });
    }
    const order = { error: 0, warning: 1, info: 2 };
    results.sort((a, b) => order[a.severity] - order[b.severity]);
    const sum = (sev) => results.filter((r) => r.severity === sev).reduce((t, r) => t + r.count, 0);
    return {
      summary: {
        errors: sum('error'), warnings: sum('warning'), info: sum('info'),
        failedChecks: results.length, passedChecks: passed.length, totalChecks: checks.length,
      },
      checks: results,
      passed,
    };
  };
})();
