import { $, esc, toast, copyText, withBusy, chip } from './dom.js';
import { setColors } from './state.js';
import { send } from './bridge.js';
import { goto } from './nav.js';

const C = self.CLColor;
let last = null;

function render() {
  const out = $('#scan-out');
  if (!last) { out.innerHTML = ''; return; }
  const { summary, items, combos, level, truncated } = last;
  const failOnly = $('#scan-fail-only').checked;
  const shown = (failOnly ? items.filter((i) => !i.pass) : items);

  const stats = `<div class="stats">
    <div class="stat"><b>${summary.total}</b><span>text blocks</span></div>
    <div class="stat ${summary.fail ? 'bad' : ''}"><b>${summary.fail}</b><span>fail ${level}</span></div>
    <div class="stat"><b>${summary.uncertain}</b><span>over images</span></div></div>`;

  const comboHtml = combos.length
    ? `<p class="section-title">Most-used colour pairs</p><div class="list">${combos.slice(0, 5).map((c) => {
        const ok = C.wcag(c.ratio).aaNormal;
        return `<div class="row"><span class="chips">${chip(c.fg, 'lg')}${chip(c.bg, 'lg')}</span>
          <div class="row-main"><div class="row-title">${C.formatRatio(c.ratio)}:1 <span class="pill ${ok ? 'ok' : 'bad'}">${ok ? 'AA' : 'Fails AA'}</span></div>
          <div class="row-sub mono">${c.fg} on ${c.bg} · ${c.count} block${c.count > 1 ? 's' : ''}</div></div>
          <div class="row-actions"><button class="btn small ghost" data-compare="${c.fg}:${c.bg}">Open</button></div></div>`;
      }).join('')}</div>` : '';

  const rows = shown.length
    ? shown.slice(0, 150).map((i) => `
      <div class="row clickable" data-locate="${i.id}" tabindex="0" role="button" aria-label="Locate on page: ${esc(i.text)}">
        <span class="chips">${chip(i.fg, 'lg')}${chip(i.bg, 'lg')}</span>
        <div class="row-main">
          <div class="row-title">${C.formatRatio(i.ratio)}:1
            <span class="pill ${i.pass ? 'ok' : 'bad'}">${i.pass ? 'Pass' : 'needs ' + i.required}</span>
            ${i.uncertain ? '<span class="pill warn">verify</span>' : ''}</div>
          <div class="row-sub">“${esc(i.text)}”</div>
          <div class="row-sub mono">${esc(i.selector)} · ${i.size}px/${i.weight}${i.large ? ' (large)' : ''}</div>
        </div>
        <div class="row-actions"><button class="btn small ghost" data-compare="${i.fg}:${i.bg}" title="Open in the Contrast tab">Open</button></div>
      </div>`).join('')
    : `<p class="empty">${failOnly ? 'No failures found 🎉 — every scanned text block passes ' + level + '.' : 'Nothing to show.'}</p>`;

  const more = shown.length > 150 ? `<p class="note">Showing the first 150 of ${shown.length}.</p>` : '';
  const trunc = truncated ? '<p class="note">Very large page: only the first 4,000 text blocks were scanned.</p>' : '';
  const uncertainNote = summary.uncertain ? '<p class="note">“verify” means text sits on a background image or gradient. Use <b>Pick on page</b> on the exact spot.</p>' : '';

  out.innerHTML = stats + comboHtml + `<p class="section-title">${failOnly ? 'Failing elements' : 'All elements'}</p><div class="list">${rows}</div>${more}${trunc}${uncertainNote}
    <div class="btn-row"><button class="btn small" id="scan-copy">Copy report</button></div>`;
}

function report() {
  const { summary, items, level } = last;
  const fails = items.filter((i) => !i.pass);
  return [`# Contrast scan (${level})`, '', `${summary.total} text blocks, ${summary.fail} failing, ${summary.uncertain} over images/gradients.`, '',
    '| Ratio | Needs | Text | Colours | Element |', '|---|---|---|---|---|',
    ...fails.map((i) => `| ${C.formatRatio(i.ratio)} | ${i.required} | ${i.text.replace(/\|/g, '\\|')} | ${i.fg} on ${i.bg} | \`${i.selector}\` |`)].join('\n');
}

export function initScan() {
  const btn = $('#btn-scan');
  btn.addEventListener('click', async () => {
    try {
      last = await withBusy(btn, 'Scanning…', () => send('scan', { level: $('#scan-level').value }));
      render();
    } catch (e) { toast(e.message, 'error'); }
  });
  $('#scan-fail-only').addEventListener('change', render);
  $('#scan-level').addEventListener('change', () => { last = null; render(); });

  const out = $('#scan-out');
  const locate = async (id) => {
    try { await send('highlight', { ns: 'scan', id: Number(id) }); } catch (e) { toast(e.message, 'error'); }
  };
  out.addEventListener('click', (e) => {
    const cmp = e.target.closest('[data-compare]');
    if (cmp) { const [a, b] = cmp.dataset.compare.split(':'); setColors({ a, b }); goto('contrast'); return; }
    if (e.target.closest('#scan-copy')) { copyText(report(), 'Report copied'); return; }
    const row = e.target.closest('[data-locate]');
    if (row) locate(row.dataset.locate);
  });
  out.addEventListener('keydown', (e) => {
    const row = e.target.closest?.('[data-locate]');
    if (row && e.target === row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); locate(row.dataset.locate); }
  });
  return { onPageChange() { last = null; render(); } };
}
