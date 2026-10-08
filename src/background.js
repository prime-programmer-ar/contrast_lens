// ContrastLens service worker.
// The whole UI lives in the side panel, so the worker only wires up how it opens.

function enableActionClick() {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error('[ContrastLens] setPanelBehavior failed:', err));
}

chrome.runtime.onInstalled.addListener(enableActionClick);
chrome.runtime.onStartup.addListener(enableActionClick);
enableActionClick();

// Keyboard shortcut (default Alt+Shift+C, change at chrome://extensions/shortcuts).
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'open-panel') return;
  try {
    const windowId = tab?.windowId ?? (await chrome.windows.getCurrent()).id;
    await chrome.sidePanel.open({ windowId });
  } catch (err) {
    console.error('[ContrastLens] could not open side panel:', err);
  }
});
