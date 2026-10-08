import { $, esc, toast, withBusy } from './dom.js';
import { send } from './bridge.js';

let last = null;

function render() {
  const out = $('#tab-out');
  if (!last) { out.innerHTML = ''; return; }
  const { summary, stops, unreachable } = last;

  const stats = `<div class="stats">
    <div class="stat"><b>${summary.stops}</b><span>tab stops</span></div>
    <div class="stat ${summary.errors ? 'bad' : ''}"><b>${summary.errors}</b><span>errors</span></div>
    <div class="stat"><b>${summary.warnings}</b><span>warnings</span></div></div>`;

  const rows = stops.length ? stops.map((s) => {
    const sev = s.issues.some((i) => i.sev === 'error') ? 'err' : s.issues.length ? 'warn' : '';
    return `<div class="row clickable" data-locate="${s.id}" tabindex="0" role="button" aria-label="Locate stop ${s.n} on page">
      <span class="num ${sev}">${s.n}</span>
      <div class="row-main">
        <div class="row-title">&lt;${esc(s.tag)}&gt; ${s.name ? '“' + esc(s.name) + '”' : '<span class="muted">no name</span>'}${s.tabindex > 0 ? ` <span class="pill warn">tabindex ${s.tabindex}</span>` : ''}</div>
        <div class="row-sub mono">${esc(s.selector)}</div>
        ${s.issues.length ? `<div class="issues">${s.issues.map((i) => `<span><span class="pill ${i.sev}">${i.sev}</span> ${esc(i.msg)}</span>`).join('')}</div>` : ''}
      </div></div>`;
  }).join('') : '<p class="empty">No keyboard-focusable elements found on this page.</p>';

  const unreachableHtml = unreachable.length
    ? `<p class="section-title">Clickable but not reachable by keyboard</p><div class="list">${unreachable.map((u) => `
      <div class="row clickable" data-locate="${u.id}" tabindex="0" role="button"><span class="num warn">!</span>
        <div class="row-main"><div class="row-title">${u.text ? '“' + esc(u.text) + '”' : 'Clickable element'}</div><div class="row-sub mono">${esc(u.selector)}</div>
        <div class="row-sub">Looks clickable (pointer cursor) but cannot be focused. Use a <code>&lt;button&gt;</code> or <code>&lt;a href&gt;</code>.</div></div></div>`).join('')}</div>` : '';

  out.innerHTML = `${stats}<p class="note">Numbered badges and arrows are drawn on the page. Red = errors, orange = warnings, dashed arrow = focus jumps backwards.</p>
    <p class="section-title">Tab sequence</p><div class="list">${rows}</div>${summary.truncatedDrawing ? '<p class="note">Only the first 500 stops are drawn on the page.</p>' : ''}${unreachableHtml}`;
}

export function initTabOrder() {
  const btn = $('#btn-tab');
  btn.addEventListener('click', async () => {
    try {
      last = await withBusy(btn, 'Analysing…', () => send('tabOrder', { checkFocus: $('#tab-focus').checked }));
      render();
    } catch (e) { toast(e.message, 'error'); }
  });
  $('#btn-tab-clear').addEventListener('click', async () => {
    try { await send('clearOverlays'); } catch (e) { toast(e.message, 'error'); }
  });
  const out = $('#tab-out');
  const locate = async (id) => { try { await send('highlight', { ns: 'tab', id: Number(id) }); } catch (e) { toast(e.message, 'error'); } };
  out.addEventListener('click', (e) => { const row = e.target.closest('[data-locate]'); if (row) locate(row.dataset.locate); });
  out.addEventListener('keydown', (e) => {
    const row = e.target.closest?.('[data-locate]');
    if (row && e.target === row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); locate(row.dataset.locate); }
  });
  return { onPageChange() { last = null; render(); } };
}
