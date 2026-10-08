# ContrastLens

A Chrome extension for checking colour contrast and basic accessibility, right where you design and build.

Pick two colours with an eyedropper, get the WCAG contrast ratio with the full working shown, let the extension find a page's real text and background colours for you, and run keyboard and accessibility checks on any page.

Everything runs locally in your browser. No network requests, no analytics, no accounts.

---

## Features

| Tool | What it does |
|---|---|
| **Contrast (A vs B)** | Choose two colours with a native colour input, a hex/`rgb()`/`hsl()`/name field, the **page eyedropper** (magnifier with pixel grid) or the **screen eyedropper** (any pixel on your screen). Shows the ratio, AA/AAA results for normal text, large text and UI components, a live text preview and a one-click swap. |
| **Show the calculation** | Step-by-step working in the same order as the worked example: normalise ÷255, gamma-correct, luminance, ratio. |
| **Fix suggestions** | When a pair fails, shows the closest same-hue colours (for the text or the background) that reach 4.5:1, or 7:1 if it already passes AA. |
| **Auto-detect text & background** | Reads the page's computed styles and loads the most-used text/background pair into A and B. |
| **Dominant colours** | Takes a screenshot, extracts the main colours (median cut), ranks every pairing by contrast and loads the best pair. |
| **Page scan** | Checks every visible text element against WCAG 1.4.3 (AA) or 1.4.6 (AAA). Handles opacity and translucent backgrounds, large-text rules and flags text over images/gradients for manual checking. Click a row to locate the element on the page. |
| **Tab order** | Numbers every keyboard stop in the order Tab visits it, with arrows drawn on the page. Flags positive `tabindex`, focus jumping backwards, missing accessible names, missing focus indicators, non-interactive elements made focusable, `aria-hidden` focus traps, and clickable elements that keyboard users cannot reach. Built with form pages in mind. |
| **Audit** | 24 quick checks: page title, `lang`, zoom lock, `<main>`, image alt text, form labels, placeholder-only labels, `autocomplete`, radio grouping, button/link names, generic link text, label-in-name, headings, duplicate IDs, 24px target size, `aria-hidden` focusables, iframe titles, table headers, autoplay. |
| **Vision** | Simulates protanopia, deuteranopia, tritanopia and achromatopsia on the whole page, and shows how your A/B pair and its contrast ratio change under each. |

Your last A and B colours are remembered between sessions.

---

## Install (developer mode)

Requires Chrome (or Edge/Brave/other Chromium) **114 or newer**.

1. Download or clone this folder.
2. Open `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the `contrastlens` folder (the one containing `manifest.json`).
5. Pin the extension, then click its icon (or press **Alt+Shift+C**) to open the side panel.

To change the shortcut, go to `chrome://extensions/shortcuts`.

> **Local files:** to inspect `file://` pages, open the extension's *Details* page and enable **Allow access to file URLs**.

### Package it

```sh
npm run zip        # or: sh scripts/build-zip.sh
```

This creates `dist/contrastlens-1.0.0.zip`, ready to upload to the Chrome Web Store.

---

## Using it

### 1. Compare two colours
1. Open the side panel on any normal web page.
2. Under **A** (text) click **Pick on page**, then hover the page and click a pixel. A magnifier shows the exact pixel and its hex value. Right-click cancels.
3. Do the same for **B** (background). The ratio updates instantly.
4. Use **Screen** instead if you need to pick from outside the browser window (another app, your design tool).

Tips:
- Type any CSS colour into the hex box. Transparent colours are flattened onto the other colour (A) or white (B).
- **Show the calculation** reproduces the worked example for your two colours.
- **Copy result** puts a one-line summary on your clipboard.

### 2. Detect colours automatically
- **Text & background** reads the page's real CSS and loads the dominant pair, which is the most reliable option for text.
- **Dominant colours** analyses what is visible on screen (images, gradients, illustrations included) and loads the highest-contrast pair.

### 3. Scan a whole page
**Page scan → Scan page.** Failures are listed worst first. Click a row to scroll to and highlight the element, or **Open** to load its colours into the Contrast tab. Rows marked **verify** sit on a background image or gradient, so use **Pick on page** on the exact spot.

### 4. Check keyboard access (great for forms)
**Tab order → Analyse tab order.** Numbered badges and arrows appear on the page:

- blue: fine
- orange: warning
- red: error
- dashed red arrow: focus jumps up the page

Tick **Also test focus indicators** to briefly focus each element and check that something visibly changes. Untick it if a page runs side effects on focus.

### 5. Audit and simulate
**Audit → Run audit** lists issues by severity with WCAG references. **Vision** applies a colour-blindness filter to the page until you pick *Normal vision*.

---

## How the contrast ratio is calculated

This is the WCAG 2.x method.

For each colour with 8-bit channels R, G, B:

1. **Normalise:** `c = value / 255`
2. **Gamma-correct** each channel:
   - if `c ≤ 0.04045` → `c / 12.92`
   - otherwise → `((c + 0.055) / 1.055) ^ 2.4`
3. **Relative luminance:** `L = 0.2126·R + 0.7152·G + 0.0722·B`
4. **Ratio:** `(L₁ + 0.05) / (L₂ + 0.05)`, where `L₁` is the lighter colour.

Worked example, white (`#FFFFFF`) vs black (`#000000`):

```
White: all channels 255/255 = 1.0 → gamma 1.0 → L₁ = 0.2126 + 0.7152 + 0.0722 = 1.0
Black: all channels 0/255   = 0.0 → 0.0/12.92 = 0.0 → L₂ = 0.0
Ratio = (1.0 + 0.05) / (0.0 + 0.05) = 21  →  21:1
```

**Thresholds**

| Level | Normal text | Large text* | UI components / graphics |
|---|---|---|---|
| AA | 4.5 : 1 | 3 : 1 | 3 : 1 |
| AAA | 7 : 1 | 4.5 : 1 | — |

\* Large text is 24px or more, or 18.66px (14pt) or more in bold.

The displayed ratio is **floored** to two decimals, never rounded up, so 4.499 shows as 4.49 and correctly fails AA.

---

## Project structure

```
contrastlens/
├── manifest.json            Manifest V3 (side panel, scripting, storage)
├── icons/                   16 / 32 / 48 / 128 px
├── src/
│   ├── background.js        Service worker: opens the side panel on icon click / shortcut
│   ├── lib/
│   │   ├── color.js         WCAG maths, parsing, suggestions, CVD simulation (also runs in Node)
│   │   └── dominant.js      Median-cut dominant colours (also runs in Node)
│   ├── content/             Injected into the page on demand
│   │   ├── core.js          Message router, shadow-DOM overlay, accessible-name helper
│   │   ├── picker.js        Screenshot-based page eyedropper with loupe
│   │   ├── contrast-scan.js Text contrast scan
│   │   ├── tab-order.js     Tab sequence + focus checks
│   │   ├── a11y-audit.js    Accessibility checks
│   │   └── simulate.js      Colour-blindness SVG filter
│   └── panel/               Side-panel UI (ES modules)
│       ├── index.html, styles.css, main.js
│       ├── bridge.js        Injection, messaging, screenshots
│       ├── state.js, nav.js, dom.js
│       └── contrast-view.js, scan-view.js, taborder-view.js, audit-view.js, vision-view.js
├── tests/color.test.js      Unit tests for the maths
└── scripts/build-zip.sh     Packaging
```

**How it fits together:** the side panel stays open while you work on the page. When you use a tool, the panel injects the content scripts into the active tab if they are not already there, then sends them a message (`{ ns: 'CL', cmd, ... }`). Results come back as plain JSON. The eyedropper is the one asynchronous flow: the panel takes a screenshot with `chrome.tabs.captureVisibleTab`, the page shows it with a magnifier, and the picked colour is sent back as an event.

---

## Permissions and privacy

| Permission | Why |
|---|---|
| `sidePanel` | The UI lives in Chrome's side panel so it stays open while you pick colours. |
| `scripting` | Injects the inspection scripts into the tab you are working on. |
| `storage` | Remembers your last two colours locally. |
| `<all_urls>` (host) | Lets the extension capture the visible tab and inject scripts on whichever site you open it on. It never injects anything until you use a tool. |

No data leaves your browser. There is no remote code, no network access and no analytics.

---

## Development

```sh
npm test            # unit tests (Node 18+, no dependencies)
```

After editing code, click the reload icon for the extension at `chrome://extensions`, then close and reopen the side panel. Reload the inspected page if you changed content scripts.

Debugging:
- **Side panel:** right-click inside it → *Inspect*.
- **Service worker:** `chrome://extensions` → *service worker* link.
- **Content scripts:** the page's DevTools console (choose the extension's context from the dropdown at the top of the console).

---

## Limitations

- **Restricted pages:** Chrome blocks extensions on `chrome://` pages, the Web Store and the built-in PDF viewer.
- **Frames and shadow DOM:** scans cover the top-level document. Content inside iframes and shadow roots is not scanned, and shadow-DOM controls are not part of the tab order.
- **Backgrounds:** images and gradients cannot be resolved from CSS, so those text blocks are flagged *verify*. Use the page eyedropper on the exact spot.
- **Opacity:** text opacity is applied to the foreground colour. Opacity on backgrounds, blend modes, filters and `text-shadow` are not modelled.
- **Inputs:** text typed into form fields and placeholder colours are not part of the contrast scan.
- **Focus indicator test:** a heuristic. It looks for a visible outline or a change in shadow, border, background, colour or underline. Focus styles applied to a parent or sibling can be reported as a false positive.
- **Colour-blindness filter:** applied to the `<html>` element, so `position: fixed` elements may shift slightly on long, scrolled pages while it is on.
- **Dynamic pages:** the page eyedropper cancels itself if the page scrolls or resizes, because its screenshot would no longer match. Pick again.
- **Automated checks are partial.** They are a fast first pass and do not replace testing with a keyboard, a screen reader and real users.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| “Chrome does not let extensions inspect this page” | Open a normal website (`https://…`). |
| “Could not access this page” | Reload the page, then try again. |
| `file://` page does not work | Enable **Allow access to file URLs** on the extension's details page. |
| Pick on page does nothing after reloading the extension | Reload the web page so old scripts are replaced. |
| **Screen** button missing | Your Chrome has no `EyeDropper` API. Use **Pick on page**. |
| Side panel button missing | Update Chrome to version 114 or later. |

---

## References

- [WCAG 2.2 — 1.4.3 Contrast (Minimum)](https://www.w3.org/TR/WCAG22/#contrast-minimum)
- [WCAG 2.2 — 1.4.6 Contrast (Enhanced)](https://www.w3.org/TR/WCAG22/#contrast-enhanced)
- [WCAG 2.2 — 1.4.11 Non-text Contrast](https://www.w3.org/TR/WCAG22/#non-text-contrast)
- [WCAG 2.2 — 2.4.3 Focus Order](https://www.w3.org/TR/WCAG22/#focus-order)
- [WCAG 2.2 — 2.5.8 Target Size (Minimum)](https://www.w3.org/TR/WCAG22/#target-size-minimum)
- [Relative luminance definition](https://www.w3.org/TR/WCAG22/#dfn-relative-luminance)
- Machado, Oliveira & Fernandes (2009), *A Physiologically-based Model for Simulation of Color Vision Deficiency*

## License

MIT, see [LICENSE](LICENSE).
