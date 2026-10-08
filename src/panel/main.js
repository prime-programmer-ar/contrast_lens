import { $, $$ } from './dom.js';
import { loadState } from './state.js';
import { setNavigator } from './nav.js';
import { watchTabs } from './bridge.js';
import { initContrast } from './contrast-view.js';
import { initScan } from './scan-view.js';
import { initTabOrder } from './taborder-view.js';
import { initAudit } from './audit-view.js';
import { initVision } from './vision-view.js';

const views = {};

function showView(name) {
  $$('.tabs [role="tab"]').forEach((t) => {
    const on = t.dataset.view === name;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
  });
  $$('.view').forEach((v) => { v.hidden = v.id !== 'view-' + name; });
  views[name]?.onShow?.();
}

function initTabs() {
  const tabs = $$('.tabs [role="tab"]');
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => showView(t.dataset.view));
    t.addEventListener('keydown', (e) => {
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      const target = tabs[(next + tabs.length) % tabs.length];
      target.focus();
      showView(target.dataset.view);
    });
  });
  setNavigator(showView);
}

function updatePageLabel(tab) {
  const label = $('#page-label');
  if (!tab || !tab.url) { label.textContent = 'No page selected'; label.title = ''; return; }
  let text = tab.title || tab.url;
  try { text = new URL(tab.url).host || tab.url; } catch (e) { /* keep title */ }
  label.textContent = text;
  label.title = tab.title || tab.url;
}

async function boot() {
  await loadState();
  initTabs();
  views.contrast = initContrast();
  views.scan = initScan();
  views.taborder = initTabOrder();
  views.audit = initAudit();
  views.vision = initVision();
  watchTabs((tab) => {
    updatePageLabel(tab);
    Object.values(views).forEach((v) => v?.onPageChange?.());
  });
}

boot();
