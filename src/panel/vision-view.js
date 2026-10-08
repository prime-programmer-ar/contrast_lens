import { $, $$, esc, toast } from './dom.js';
import { state, onColors } from './state.js';
import { send } from './bridge.js';
import { hookVision } from './contrast-view.js';

const C = self.CLColor;
const LABELS = { protanopia: 'Protanopia', deuteranopia: 'Deuteranopia', tritanopia: 'Tritanopia', achromatopsia: 'Achromatopsia' };

function renderPair() {
  const a = C.parseColor(state.a);
  const b = C.parseColor(state.b);
  const row = (label, fa, fb) => {
    const r = C.contrastRatio(fa, fb);
    const ok = C.wcag(r).aaNormal;
    return `<div class="sim-row"><div><div class="row-title">${esc(label)}</div>
      <div class="sim-sample" style="color:${C.toHex(fa)};background:${C.toHex(fb)}">Sample text</div></div>
      <div style="text-align:right"><b>${C.formatRatio(r)}:1</b><br><span class="pill ${ok ? 'ok' : 'bad'}">${ok ? 'AA' : 'Fails AA'}</span></div></div>`;
  };
  $('#vision-pair').innerHTML = `<div class="sim-grid">${row('Normal vision', a, b)}${C.CVD_TYPES.map((t) => row(LABELS[t], C.simulate(a, t), C.simulate(b, t))).join('')}</div>
    <p class="note">Simulations follow Machado et al. (2009) for complete deficiency.</p>`;
}

export function initVision() {
  hookVision(renderPair);
  onColors(renderPair);
  renderPair();
  $('#vision-modes').addEventListener('change', async (e) => {
    try { await send('simulate', { mode: e.target.value }); } catch (err) {
      toast(err.message, 'error');
      $('input[name="vision"][value="none"]').checked = true;
    }
  });
  return {
    onPageChange() { $('input[name="vision"][value="none"]').checked = true; },
  };
}
