/* Colour-vision-deficiency simulation applied to the whole page through an SVG colour-matrix filter. */
(() => {
  const CL = window.__CL;
  const C = window.CLColor;
  if (!CL || CL.handlers.simulate) return;
  const SVG_ID = '__cl_cvd_svg__';
  const FILTER_ID = '__cl_cvd_filter__';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  let saved = null;

  function remove() {
    document.getElementById(SVG_ID)?.remove();
    if (saved) {
      const root = document.documentElement;
      if (saved.value) root.style.setProperty('filter', saved.value, saved.priority);
      else root.style.removeProperty('filter');
      saved = null;
    }
  }

  CL.handlers.simulate = ({ mode }) => {
    remove();
    if (!mode || mode === 'none') return { mode: 'none' };
    const m = C.CVD_MATRICES[mode];
    if (!m) throw new Error('Unknown simulation: ' + mode);

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.id = SVG_ID;
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none;';
    const filter = document.createElementNS(SVG_NS, 'filter');
    filter.id = FILTER_ID;
    filter.setAttribute('color-interpolation-filters', 'linearRGB');
    const fe = document.createElementNS(SVG_NS, 'feColorMatrix');
    fe.setAttribute('type', 'matrix');
    fe.setAttribute('values', m.map((row) => `${row[0]} ${row[1]} ${row[2]} 0 0`).join(' ') + ' 0 0 0 1 0');
    filter.appendChild(fe);
    svg.appendChild(filter);
    document.documentElement.appendChild(svg);

    const root = document.documentElement;
    saved = { value: root.style.getPropertyValue('filter'), priority: root.style.getPropertyPriority('filter') };
    root.style.setProperty('filter', `url(#${FILTER_ID})`, 'important');
    return { mode };
  };
})();
