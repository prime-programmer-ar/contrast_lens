import { $, esc, toast, copyText, withBusy } from './dom.js';
import { send } from './bridge.js';

let last = null;

function render() {
  const out = $('#audit-out');
  $('#btn-audit-copy').disabled = !last;
  if (!last) { out.innerHTML = ''; return; }
  const { summary, checks, passed } = last;

  const stats = `<div class="stats">
    <div class="stat ${summary.errors ? 'bad' : ''}"><b>${summary.errors}</b><span>errors</span></div>
    <div class="stat"><b>${summary.warnings}</b><span>warnings</span></div>
    <div class="stat"><b>${summary.passedChecks}/${summary.totalChecks}</b><span>checks passed</span></div></div>`;

  const groups = checks.map((c) => `
    <details class="acc" ${c.severity === 'error' ? 'open' : ''}>
      <summary><span class="pill ${c.severity}">${c.severity}</span><span class="row-title">${esc(c.title)}</span><span class="muted" style="margin-left:auto">${c.count}</span></summary>
      <div class="acc-body">
        <p class="muted">${esc(c.help)} <span class="mono">WCAG ${esc(c.wcag)}</span></p>
        ${c.nodes.map((n) => `<div class="row ${n.id !== null ? 'clickable' : ''}" ${n.id !== null ? `data-locate="${n.id}" tabindex="0" role="button"` : ''} style="grid-template-columns:1fr">
          <div class="row-main"><div class="row-title">${esc(n.msg)}</div>${n.selector ? `<div class="row-sub mono">${esc(n.selector)}</div>` : ''}</div></div>`).join('')}
        ${c.count > c.nodes.length ? `<p class="note">+ ${c.count - c.nodes.length} more not shown</p>` : ''}
      </div>
    </details>`).join('');

  out.innerHTML = stats + (checks.length ? groups : '<p class="empty">No issues found by these checks 🎉</p>') +
    (passed.length ? `<details class="acc"><summary><span class="pill ok">passed</span><span class="row-title">${passed.length} checks passed</span></summary><div class="acc-body"><p class="muted">${passed.map(esc).join(' · ')}</p></div></details>` : '') +
    '<p class="note">Automated checks catch roughly a third of accessibility problems. Test with a keyboard and a screen reader too.</p>';
}

function report() {
  const lines = ['# Accessibility quick audit', ''];
  for (const c of last.checks) {
    lines.push(`## [${c.severity}] ${c.title} (${c.count}) — WCAG ${c.wcag}`, c.help);
    c.nodes.forEach((n) => lines.push(`- ${n.msg}${n.selector ? ' — `' + n.selector + '`' : ''}`));
    lines.push('');
  }
  lines.push(`Passed: ${last.passed.join(', ')}`);
  return lines.join('\n');
}

export function initAudit() {
  const btn = $('#btn-audit');
  btn.addEventListener('click', async () => {
    try { last = await withBusy(btn, 'Auditing…', () => send('audit')); render(); } catch (e) { toast(e.message, 'error'); }
  });
  $('#btn-audit-copy').addEventListener('click', () => last && copyText(report(), 'Report copied'));
  const out = $('#audit-out');
  const locate = async (id) => { try { await send('highlight', { ns: 'audit', id: Number(id) }); } catch (e) { toast(e.message, 'error'); } };
  out.addEventListener('click', (e) => { const row = e.target.closest('[data-locate]'); if (row) locate(row.dataset.locate); });
  out.addEventListener('keydown', (e) => {
    const row = e.target.closest?.('[data-locate]');
    if (row && e.target === row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); locate(row.dataset.locate); }
  });
  render();
  return { onPageChange() { last = null; render(); } };
}
