import { $, $$, esc, toast, copyText, withBusy, chip } from './dom.js';
import { state, setColors, onColors } from './state.js';
import { send, capture } from './bridge.js';

const C = self.CLColor;
const D = self.CLDominant;

let picking = null; // slot currently being picked on the page, or null

const rgbOf = (hex) => C.parseColor(hex);
const f4 = (n) => n.toFixed(4);

// ---------------------------------------------------------------- rendering
function render() {
  const a = rgbOf(state.a);
  const b = rgbOf(state.b);
  for (const slot of ['a', 'b']) {
    const hex = state[slot];
    $('#swatch-' + slot).style.background = hex;
    const input = $('#color-' + slot);
    if (input.value.toLowerCase() !== hex.toLowerCase()) input.value = hex.toLowerCase();
    const text = $('#hex-' + slot);
    if (document.activeElement !== text) { text.value = hex; text.removeAttribute('aria-invalid'); }
  }

  const ratio = C.contrastRatio(a, b);
  const rating = C.rate(ratio);
  $('#ratio').textContent = C.formatRatio(ratio);
  const badge = $('#rating');
  badge.textContent = rating.label;
  badge.className = 'rating ' + rating.tier;

  const pv = $('#preview');
  pv.style.background = state.b;
  pv.style.color = state.a;
  pv.style.borderColor = state.a;

  const w = C.wcag(ratio);
  const rows = [
    ['AA · normal text', '4.5', w.aaNormal],
    ['AA · large text', '3', w.aaLarge],
    ['AAA · normal text', '7', w.aaaNormal],
    ['AAA · large text', '4.5', w.aaaLarge],
    ['UI components', '3', w.ui],
  ];
  $('#badges').innerHTML = rows
    .map(([label, need, ok]) => `<li class="${ok ? 'pass' : 'fail'}"><span>${label} <small>(${need})</small></span><b>${ok ? 'Pass' : 'Fail'}</b></li>`)
    .join('');

  renderSuggestions(a, b, ratio);
  $('#calc-body').innerHTML = calculationHtml(a, b);
  renderVisionPair?.();
}

let renderVisionPair = null;
export const hookVision = (fn) => { renderVisionPair = fn; };

function renderSuggestions(a, b, ratio) {
  const el = $('#suggest');
  const r = Math.floor(ratio * 100 + 1e-9) / 100;
  if (r >= 7) { el.innerHTML = ''; return; }
  const target = r < 4.5 ? 4.5 : 7;
  const fixText = C.adjustToTarget(a, b, target);
  const fixBg = C.adjustToTarget(b, a, target);
  const row = (label, fix, slot) => fix
    ? `<div class="suggest-row">${chip(fix.hex)}<span><b>${esc(label)}</b> <code>${fix.hex}</code> → ${C.formatRatio(fix.ratio)}:1</span><button class="btn small ghost" data-use="${slot}:${fix.hex}">Use</button></div>`
    : '';
  const html = row('Adjust text', fixText, 'a') + row('Adjust background', fixBg, 'b');
  el.innerHTML = html
    ? `<div class="suggest"><div class="muted">Closest colours that reach ${target}:1 (${target === 4.5 ? 'AA' : 'AAA'} normal text), keeping the same hue:</div>${html}</div>`
    : `<div class="suggest"><div class="muted">No tint of these colours reaches ${target}:1. Try a much lighter or darker pair.</div></div>`;
}

/** Mirrors the worked example: normalise → gamma-correct → luminance → ratio. */
function calculationHtml(a, b) {
  const p = C.explainPair(a, b);
  const block = (label, e) => `
    <div class="calc-block">
      <h4>${label} <code>${e.hex}</code></h4>
      <table class="calc-table">
        <thead><tr><th></th><th>8-bit</th><th>÷ 255</th><th>Gamma-corrected</th></tr></thead>
        <tbody>${e.channels.map((c) => `<tr><th>${c.key}</th><td>${c.value}</td><td>${f4(c.normalized)}</td>
          <td>${f4(c.linear)}<small>${c.branch === 'linear' ? 'c ≤ 0.04045 → c ÷ 12.92' : 'c > 0.04045 → ((c + 0.055) ÷ 1.055)^2.4'}</small></td></tr>`).join('')}</tbody>
      </table>
      <p class="formula">L = 0.2126·${f4(e.channels[0].linear)} + 0.7152·${f4(e.channels[1].linear)} + 0.0722·${f4(e.channels[2].linear)} = <b>${f4(e.luminance)}</b></p>
    </div>`;
  return block('1 · Colour A', p.a) + block('2 · Colour B', p.b) + `
    <div class="calc-block">
      <h4>3 · Contrast ratio</h4>
      <p class="formula">(L₁ + 0.05) ÷ (L₂ + 0.05)<br>= (${f4(p.lighter)} + 0.05) ÷ (${f4(p.darker)} + 0.05)<br>= ${f4(p.lighter + 0.05)} ÷ ${f4(p.darker + 0.05)} = <b>${C.formatRatio(p.ratio)}:1</b></p>
      <p class="note">L₁ is the lighter colour (${p.lighterIs === 'a' ? 'A' : 'B'}). Results are floored to two decimals, never rounded up.</p>
    </div>`;
}

// ---------------------------------------------------------------- inputs
function bindInputs() {
  for (const slot of ['a', 'b']) {
    $('#color-' + slot).addEventListener('input', (e) => setColors({ [slot]: e.target.value }));
    const text = $('#hex-' + slot);
    const commit = () => {
      const parsed = C.parseColor(text.value);
      if (!parsed) { text.setAttribute('aria-invalid', 'true'); toast('Use a hex like #1A1A1A, rgb(…), hsl(…) or a colour name.', 'error'); return; }
      let c = parsed;
      if (parsed.a < 1) {
        const behind = slot === 'a' ? rgbOf(state.b) : { r: 255, g: 255, b: 255, a: 1 };
        c = C.composite(parsed, behind);
        toast('Transparent colour flattened onto ' + (slot === 'a' ? 'B' : 'white') + '.');
      }
      setColors({ [slot]: C.toHex(c) });
      text.removeAttribute('aria-invalid');
    };
    text.addEventListener('change', commit);
    text.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); });
    text.addEventListener('blur', () => { text.value = state[slot]; text.removeAttribute('aria-invalid'); });
  }
  $('#swap').addEventListener('click', () => setColors({ a: state.b, b: state.a }));
  $('#copy-result').addEventListener('click', () => {
    const a = rgbOf(state.a), b = rgbOf(state.b), r = C.contrastRatio(a, b), w = C.wcag(r);
    const mark = (x) => (x ? 'Pass' : 'Fail');
    copyText(`Contrast ${C.formatRatio(r)}:1 — text ${state.a} on ${state.b}\nAA normal ${mark(w.aaNormal)} · AA large ${mark(w.aaLarge)} · AAA normal ${mark(w.aaaNormal)} · AAA large ${mark(w.aaaLarge)} · UI ${mark(w.ui)}`, 'Result copied');
  });

  document.addEventListener('click', (e) => {
    const use = e.target.closest('[data-use]');
    if (use) { const [slot, hex] = use.dataset.use.split(':'); setColors({ [slot]: hex }); }
    const set = e.target.closest('[data-set]');
    if (set) { const [slot, hex] = set.dataset.set.split(':'); setColors({ [slot]: hex }); toast(`Colour ${slot.toUpperCase()} set to ${hex}`); }
    const pair = e.target.closest('[data-pair]');
    if (pair) { const [a, b] = pair.dataset.pair.split(':'); setColors({ a, b }); toast('Pair loaded'); }
  });
}

// ---------------------------------------------------------------- eyedroppers
function setPickingUi(slot) {
  picking = slot;
  $$('[data-pick]').forEach((btn) => {
    const active = slot === btn.dataset.pick;
    btn.classList.toggle('picking', active);
    btn.textContent = active ? 'Cancel' : 'Pick on page';
  });
}

async function startPagePick(slot) {
  if (picking) {
    await send('pickCancel').catch(() => {});
    const same = picking === slot;
    setPickingUi(null);
    if (same) return;
  }
  try {
    const dataUrl = await capture(); // taken before the overlay exists, so it is not in the shot
    await send('pickStart', { dataUrl, slot });
    setPickingUi(slot);
    toast('Hover over the page and click a pixel. Right-click cancels.');
  } catch (e) {
    setPickingUi(null);
    toast(e.message, 'error');
  }
}

async function startScreenPick(slot) {
  if (!('EyeDropper' in window)) { toast('Your Chrome version has no screen eyedropper. Use “Pick on page”.', 'error'); return; }
  try {
    const { sRGBHex } = await new EyeDropper().open();
    setColors({ [slot]: sRGBHex });
    toast(`Colour ${slot.toUpperCase()} set to ${sRGBHex.toUpperCase()}`);
  } catch (e) {
    if (e && e.name !== 'AbortError') toast('Screen eyedropper failed: ' + (e.message || e), 'error');
  }
}

function bindPickers() {
  $$('[data-pick]').forEach((b) => b.addEventListener('click', () => startPagePick(b.dataset.pick)));
  $$('[data-screen]').forEach((b) => {
    if (!('EyeDropper' in window)) b.hidden = true;
    b.addEventListener('click', () => startScreenPick(b.dataset.screen));
  });
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.ns !== 'CL' || !msg.event) return;
    if (msg.event === 'picked') {
      setPickingUi(null);
      setColors({ [msg.slot]: msg.hex });
      toast(`Colour ${msg.slot.toUpperCase()} set to ${msg.hex}`);
    } else if (msg.event === 'pickCancelled') {
      setPickingUi(null);
    }
  });
}

// ---------------------------------------------------------------- automatic detection
const pairRow = (fg, bg, extra = '') => {
  const r = C.contrastRatio(rgbOf(fg), rgbOf(bg));
  const ok = C.wcag(r).aaNormal;
  return `<div class="row">
    <span class="chips">${chip(fg, 'lg')}${chip(bg, 'lg')}</span>
    <div class="row-main"><div class="row-title">${C.formatRatio(r)}:1 <span class="pill ${ok ? 'ok' : 'bad'}">${ok ? 'AA' : 'Fails AA'}</span></div>
      <div class="row-sub mono">${fg} on ${bg}</div>${extra}</div>
    <div class="row-actions"><button class="btn small ghost" data-pair="${fg}:${bg}">Use</button></div></div>`;
};

async function autoDetectDom(btn) {
  const out = $('#auto-out');
  try {
    const data = await withBusy(btn, 'Reading page…', () => send('scan', { level: 'AA' }));
    if (!data.combos.length) { out.innerHTML = '<p class="empty">No visible text found on this page.</p>'; return; }
    const top = data.combos[0];
    setColors({ a: top.fg, b: top.bg });
    out.innerHTML = `<p class="section-title">Most-used text / background pairs</p><div class="list">${data.combos.slice(0, 5).map((c) => {
      const share = data.combos.reduce((t, x) => t + x.chars, 0);
      return pairRow(c.fg, c.bg, `<div class="row-sub">${Math.round((c.chars / share) * 100)}% of text${c.uncertain ? ' · over an image/gradient, verify manually' : ''}</div>`);
    }).join('')}</div><p class="note">The top pair was loaded into A and B.</p>`;
    toast('Loaded the page’s main text and background');
  } catch (e) { toast(e.message, 'error'); }
}

async function autoDetectShot(btn) {
  const out = $('#auto-out');
  try {
    const colours = await withBusy(btn, 'Analysing…', async () => {
      const bmp = await createImageBitmap(await (await fetch(await capture())).blob());
      const w = Math.min(320, bmp.width);
      const h = Math.max(1, Math.round((bmp.height * w) / bmp.width));
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.imageSmoothingEnabled = false; // keep exact colours instead of blending edges
      ctx.drawImage(bmp, 0, 0, w, h);
      return D.dominantColors(ctx.getImageData(0, 0, w, h).data, 8);
    });
    if (colours.length < 2) { out.innerHTML = '<p class="empty">Only one colour found on screen.</p>'; return; }

    const pairs = [];
    for (let i = 0; i < colours.length; i++) {
      for (let j = i + 1; j < colours.length; j++) {
        pairs.push({ bg: colours[i], fg: colours[j], ratio: C.contrastRatio(colours[i].rgb, colours[j].rgb) });
      }
    }
    pairs.sort((x, y) => y.ratio - x.ratio);
    const best = pairs[0];
    setColors({ a: best.fg.hex, b: best.bg.hex });

    out.innerHTML = `<p class="section-title">Dominant colours on screen</p>
      <div class="palette">${colours.map((c) => `<div class="pal"><div class="pal-top">${chip(c.hex)}<div><b class="mono">${c.hex}</b><div class="muted">${Math.round(c.share * 100) || '<1'}% of pixels</div></div></div>
        <div class="pal-actions"><button class="btn small ghost" data-set="a:${c.hex}">Set A</button><button class="btn small ghost" data-set="b:${c.hex}">Set B</button></div></div>`).join('')}</div>
      <p class="section-title">Best pairs</p><div class="list">${pairs.slice(0, 5).map((p) => pairRow(p.fg.hex, p.bg.hex)).join('')}</div>
      <p class="note">The highest-contrast pair was loaded into A and B.</p>`;
    toast('Dominant colours detected');
  } catch (e) { toast(e.message, 'error'); }
}

// ---------------------------------------------------------------- init
export function initContrast() {
  bindInputs();
  bindPickers();
  $('#btn-auto-dom').addEventListener('click', (e) => autoDetectDom(e.currentTarget));
  $('#btn-auto-shot').addEventListener('click', (e) => autoDetectShot(e.currentTarget));
  onColors(render);
  render();
  return {
    onPageChange() {
      if (picking) setPickingUi(null);
      $('#auto-out').innerHTML = '';
    },
  };
}
