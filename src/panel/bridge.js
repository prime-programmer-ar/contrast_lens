// Everything that talks to the inspected tab: injection, messaging, screenshots.
const FILES = [
  'src/lib/color.js',
  'src/content/core.js',
  'src/content/picker.js',
  'src/content/contrast-scan.js',
  'src/content/tab-order.js',
  'src/content/a11y-audit.js',
  'src/content/simulate.js',
];

const BLOCKED = /^(chrome|chrome-extension|edge|about|devtools|view-source|chrome-search|chrome-untrusted):/i;
const STORE = /^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)/i;

export async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error('No active tab found.');
  return tab;
}

function assertInspectable(tab) {
  const url = tab.url || tab.pendingUrl || '';
  if (!url || BLOCKED.test(url) || STORE.test(url)) {
    throw new Error('Chrome does not let extensions inspect this page (browser pages and the Web Store are off-limits). Open a normal website and try again.');
  }
  if (/\.pdf($|[?#])/i.test(url)) throw new Error('PDFs open in Chrome’s built-in viewer, which extensions cannot inspect.');
  if (/^file:/i.test(url)) {
    // Works only if the user enabled "Allow access to file URLs"; the injection error below explains otherwise.
  }
}

async function ensureInjected(tab) {
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => !!window.__CL });
    if (!res || !res.result) await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: FILES });
  } catch (e) {
    if (/^file:/i.test(tab.url || '')) {
      throw new Error('To inspect local files, turn on “Allow access to file URLs” for ContrastLens at chrome://extensions.');
    }
    throw new Error('Could not access this page (' + (e.message || e) + '). Try reloading the page.');
  }
}

/** Run a content-script command on the active tab and return its data. */
export async function send(cmd, payload = {}) {
  const tab = await activeTab();
  assertInspectable(tab);
  await ensureInjected(tab);
  let res;
  try {
    res = await chrome.tabs.sendMessage(tab.id, { ns: 'CL', cmd, ...payload });
  } catch (e) {
    throw new Error('The page did not respond. Reload it and try again.');
  }
  if (!res || !res.ok) throw new Error((res && res.error) || 'The page did not respond.');
  return res.data;
}

/** Screenshot of the visible part of the active tab (PNG data URL). */
export async function capture() {
  const tab = await activeTab();
  assertInspectable(tab);
  try {
    return await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  } catch (e) {
    throw new Error('Could not capture the tab: ' + (e.message || e));
  }
}

export function watchTabs(callback) {
  const notify = async () => {
    try { callback(await activeTab()); } catch (e) { callback(null); }
  };
  chrome.tabs.onActivated.addListener(notify);
  chrome.tabs.onUpdated.addListener((id, info, tab) => {
    if (tab.active && (info.status === 'loading' || info.url)) notify();
  });
  chrome.windows.onFocusChanged.addListener(notify);
  notify();
}
