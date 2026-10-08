/*
 * Page eyedropper. The panel captures a screenshot of the visible tab and hands it to us;
 * we show it full-viewport with a pixel-grid loupe so you can pick any pixel (images, gradients, video frames).
 * The screenshot is decoded from a Blob, so strict page CSPs (img-src) can't interfere.
 */
(() => {
  const CL = window.__CL;
  if (!CL || CL.handlers.pickStart) return;
  const HOST_ID = '__contrast_lens_picker__';
  const GRID = 11; // loupe shows an 11x11 pixel neighbourhood
  const CELL = 11; // each pixel drawn 11x11
  let session = null;

  async function decode(dataUrl) {
    const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  }

  const hex = (d) => '#' + [d[0], d[1], d[2]].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase();

  function stop(notify) {
    if (!session) return;
    const s = session;
    session = null;
    s.cleanup();
    if (notify) chrome.runtime.sendMessage({ ns: 'CL', event: 'pickCancelled', slot: s.slot }).catch(() => {});
  }

  function start(bitmap, slot) {
    const host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'all:initial;position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:2147483647;cursor:crosshair;';
    const sr = host.attachShadow({ mode: 'closed' });

    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.style.cssText = `position:fixed;left:0;top:0;width:${innerWidth}px;height:${innerHeight}px;display:block;`;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close && bitmap.close();

    const hint = document.createElement('div');
    hint.textContent = `Click a pixel to set colour ${slot.toUpperCase()}  ·  right-click or Esc to cancel`;
    hint.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);background:#0f172a;color:#fff;font:600 13px/1 system-ui,sans-serif;padding:9px 14px;border-radius:999px;box-shadow:0 2px 10px rgba(0,0,0,.45);pointer-events:none;white-space:nowrap;';

    const loupe = document.createElement('div');
    loupe.style.cssText = `position:fixed;display:none;width:${GRID * CELL + 6}px;border-radius:10px;overflow:hidden;background:#0f172a;box-shadow:0 4px 18px rgba(0,0,0,.55);pointer-events:none;border:3px solid #0f172a;`;
    const lc = document.createElement('canvas');
    lc.width = lc.height = GRID * CELL;
    lc.style.cssText = 'display:block;';
    const lctx = lc.getContext('2d');
    lctx.imageSmoothingEnabled = false;
    const label = document.createElement('div');
    label.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 8px;color:#fff;font:600 12px/1 ui-monospace,Menlo,Consolas,monospace;';
    const chip = document.createElement('span');
    chip.style.cssText = 'width:16px;height:16px;border-radius:4px;border:1px solid #fff;flex:none;';
    const txt = document.createElement('span');
    label.append(chip, txt);
    loupe.append(lc, label);
    sr.append(canvas, hint, loupe);

    const sx = bitmap.width / innerWidth;
    const sy = bitmap.height / innerHeight;
    let px = 0;
    let py = 0;
    let started = false;

    const clampPx = () => {
      px = Math.min(canvas.width - 1, Math.max(0, px));
      py = Math.min(canvas.height - 1, Math.max(0, py));
    };

    function render() {
      clampPx();
      const half = (GRID - 1) / 2;
      lctx.fillStyle = '#334155';
      lctx.fillRect(0, 0, lc.width, lc.height);
      lctx.drawImage(canvas, px - half, py - half, GRID, GRID, 0, 0, GRID * CELL, GRID * CELL);
      lctx.lineWidth = 2;
      lctx.strokeStyle = '#000';
      lctx.strokeRect(half * CELL + 1, half * CELL + 1, CELL - 2, CELL - 2);
      lctx.lineWidth = 1;
      lctx.strokeStyle = '#fff';
      lctx.strokeRect(half * CELL + 0.5, half * CELL + 0.5, CELL - 1, CELL - 1);
      const d = ctx.getImageData(px, py, 1, 1).data;
      const h = hex(d);
      chip.style.background = h;
      txt.textContent = h;
      const cx = px / sx;
      const cy = py / sy;
      const w = GRID * CELL + 6;
      const hgt = w + 30;
      let left = cx + 22;
      let top = cy + 22;
      if (left + w > innerWidth - 4) left = cx - 22 - w;
      if (top + hgt > innerHeight - 4) top = cy - 22 - hgt;
      loupe.style.left = Math.max(4, left) + 'px';
      loupe.style.top = Math.max(4, top) + 'px';
      loupe.style.display = 'block';
      return d;
    }

    const onMove = (e) => { started = true; px = Math.floor(e.clientX * sx); py = Math.floor(e.clientY * sy); render(); };
    const confirm = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      if (!started) return;
      const d = render();
      const slotName = slot;
      stop(false);
      chrome.runtime.sendMessage({ ns: 'CL', event: 'picked', slot: slotName, hex: hex(d), rgb: { r: d[0], g: d[1], b: d[2] } }).catch(() => {});
    };
    const onContext = (e) => { e.preventDefault(); stop(true); };
    const onWheel = (e) => e.preventDefault();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); stop(true); return; }
      if (e.key === 'Enter') { confirm(e); return; }
      const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (step) { e.preventDefault(); started = true; px += step[0]; py += step[1]; render(); }
    };
    const onViewportChange = () => stop(true); // the screenshot no longer matches the page

    host.addEventListener('mousemove', onMove);
    host.addEventListener('click', confirm);
    host.addEventListener('contextmenu', onContext);
    host.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    document.documentElement.appendChild(host);

    session = {
      slot,
      cleanup() {
        host.removeEventListener('mousemove', onMove);
        window.removeEventListener('keydown', onKey, true);
        window.removeEventListener('resize', onViewportChange);
        window.removeEventListener('scroll', onViewportChange, true);
        host.remove();
      },
    };
  }

  CL.handlers.pickStart = async ({ dataUrl, slot }) => {
    stop(false);
    const bitmap = await decode(dataUrl);
    start(bitmap, slot === 'b' ? 'b' : 'a');
    return { started: true };
  };
  CL.handlers.pickCancel = () => { stop(false); return {}; };
})();
