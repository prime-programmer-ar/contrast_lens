const KEY = 'contrastlens.colors.v1';
const C = self.CLColor;

export const state = { a: '#1A1A1A', b: '#FFFFFF' };
const listeners = new Set();
export const onColors = (fn) => listeners.add(fn);

export async function loadState() {
  try {
    const stored = (await chrome.storage.local.get(KEY))[KEY];
    if (stored && C.parseColor(stored.a) && C.parseColor(stored.b)) {
      state.a = C.toHex(C.parseColor(stored.a));
      state.b = C.toHex(C.parseColor(stored.b));
    }
  } catch (e) { /* storage unavailable: keep defaults */ }
}

export function setColors(patch) {
  for (const k of ['a', 'b']) {
    if (patch[k] !== undefined) {
      const c = C.parseColor(patch[k]);
      if (c) state[k] = C.toHex(c);
    }
  }
  chrome.storage.local.set({ [KEY]: { a: state.a, b: state.b } }).catch(() => {});
  listeners.forEach((fn) => fn(state));
}
