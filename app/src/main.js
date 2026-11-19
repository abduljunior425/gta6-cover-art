// Neon Vice — the editor wiring.
// Owns the poster state, the controls, undo/redo, dragging and zooming a
// panel's photo, and the one-click PNG exports. Photos are read on this
// machine only, with FileReader and object URLs; nothing is uploaded.

import { drawCover, exportCover, GRADES, LAYOUTS, layoutRects } from './cover.js';
import { runShot } from './shots.js';

const canvas = document.getElementById('cover');
const statusEl = document.getElementById('status');
const titleInput = document.getElementById('title');
const subtitleInput = document.getElementById('subtitle');

// One record per panel: which photo it shows, its zoom and its pan.
function freshPanels(count, photoCount) {
  const panels = [];
  for (let i = 0; i < count; i++) {
    panels.push({ photo: Math.min(i, Math.max(0, photoCount - 1)), zoom: 1, ox: 0, oy: 0 });
  }
  return panels;
}

export const state = {
  layout: 'grid',
  grade: 'sunset',
  title: 'VICE NIGHTS',
  subtitle: 'Sunset Strip • Est. 2026',
  titleScale: 1,
  grain: true,
  vignette: true,
  photos: [],
  panels: freshPanels(4, 1),
  selected: 0,
};

// --- Undo / redo: snapshots of everything but the image objects. ---
const past = [];
const future = [];
function snapshot() {
  return JSON.stringify({
    layout: state.layout,
    grade: state.grade,
    title: state.title,
    subtitle: state.subtitle,
    titleScale: state.titleScale,
    grain: state.grain,
    vignette: state.vignette,
    panels: state.panels,
    selected: state.selected,
    photoSlots: state.panels.map((p) => p.photo),
  });
}
function restore(json) {
  const s = JSON.parse(json);
  Object.assign(state, s);
}
function commit() {
  past.push(snapshot());
  if (past.length > 60) past.shift();
  future.length = 0;
  syncUndoButtons();
}
function undo() {
  if (!past.length) return;
  future.push(snapshot());
  restore(past.pop());
  syncControls();
  redraw();
  syncUndoButtons();
}
function redo() {
  if (!future.length) return;
  past.push(snapshot());
  restore(future.pop());
  syncControls();
  redraw();
  syncUndoButtons();
}
function syncUndoButtons() {
  document.getElementById('undo').disabled = !past.length;
  document.getElementById('redo').disabled = !future.length;
}

// --- Preview sizing: the canvas keeps the export aspect of the moment. ---
let previewAspect = 1;
function fitPreview() {
  const box = document.getElementById('stage');
  const availW = Math.max(320, box.clientWidth - 8);
  const availH = Math.max(320, box.clientHeight - 8);
  let w = availW;
  let h = availW / previewAspect;
  if (h > availH) {
    h = availH;
    w = availH * previewAspect;
  }
  canvas.style.width = `${Math.round(w)}px`;
  canvas.style.height = `${Math.round(h)}px`;
}

function redraw() {
  const ctx = canvas.getContext('2d');
  drawCover(ctx, canvas.width, canvas.height, state);
  // Full-frame cover scenes are the exported poster itself: no editor chrome.
  if (!document.body.classList.contains('shot-cover')) drawSelection(ctx);
}

// A bright outline around the selected panel so the user sees which
// panel dragging and the zoom slider will move.
function drawSelection(ctx) {
  const rects = layoutRects(state.layout, canvas.width, canvas.height);
  const rect = rects[state.selected];
  if (!rect) return;
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(2, Math.round(canvas.width * 0.004));
  ctx.setLineDash([Math.round(canvas.width * 0.02), Math.round(canvas.width * 0.012)]);
  ctx.strokeRect(rect.x + 2, rect.y + 2, rect.w - 4, rect.h - 4);
  ctx.restore();
}

function setStatus(text) {
  statusEl.textContent = text;
}

/** Loads an image from a URL, resolving once it can be drawn. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

function notePhotos() {
  const strip = document.getElementById('photos');
  strip.innerHTML = '';
  state.photos.forEach((photo, i) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = photo.name || `Photo ${i + 1}`;
    chip.title = `Use this photo in the selected panel`;
    chip.addEventListener('click', () => {
      commit();
      state.panels[state.selected].photo = i;
      syncPanelControls();
      redraw();
    });
    strip.appendChild(chip);
  });
  document.getElementById('fillAll').disabled = !state.photos.length;
}

async function addFiles(files) {
  let added = 0;
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    try {
      const img = await loadImage(URL.createObjectURL(file));
      img.name = file.name;
      state.photos.push(img);
      added++;
    } catch {
      // Skip a file that is not a readable image.
    }
  }
  if (added) {
    state.panels.forEach((p) => {
      if (p.photo >= state.photos.length) p.photo = state.photos.length - 1;
    });
    notePhotos();
    syncPanelControls();
    redraw();
    setStatus(`${added} photo${added > 1 ? 's' : ''} loaded — click a panel, then drag to crop.`);
  }
}

// --- Layout and grade pickers. ---
function buildPickers() {
  const layoutBox = document.getElementById('layouts');
  Object.entries(LAYOUTS).forEach(([key, info]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pick';
    b.dataset.layout = key;
    b.textContent = info.label;
    b.addEventListener('click', () => {
      if (state.layout === key) return;
      commit();
      state.layout = key;
      const count = info.panels;
      const old = state.panels;
      state.panels = freshPanels(count, state.photos.length || 1);
      for (let i = 0; i < Math.min(old.length, count); i++) state.panels[i] = old[i];
      state.selected = 0;
      syncPickers();
      syncPanelControls();
      redraw();
    });
    layoutBox.appendChild(b);
  });
  const gradeBox = document.getElementById('grades');
  Object.entries(GRADES).forEach(([key, grade]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.dataset.grade = key;
    b.title = grade.label;
    b.style.background = `linear-gradient(135deg, rgb(${grade.stops[1].join(',')}), rgb(${grade.stops[2].join(',')}))`;
    const label = document.createElement('span');
    label.textContent = grade.label;
    b.appendChild(label);
    b.addEventListener('click', () => {
      if (state.grade === key) return;
      commit();
      state.grade = key;
      syncPickers();
      redraw();
    });
    gradeBox.appendChild(b);
  });
}

function syncPickers() {
  document.querySelectorAll('#layouts .pick').forEach((b) => {
    b.classList.toggle('active', b.dataset.layout === state.layout);
  });
  document.querySelectorAll('#grades .swatch').forEach((b) => {
    b.classList.toggle('active', b.dataset.grade === state.grade);
  });
  document.getElementById('grainToggle').checked = state.grain;
  document.getElementById('vignetteToggle').checked = state.vignette;
}

function syncPanelControls() {
  const panel = state.panels[state.selected];
  document.getElementById('panelLabel').textContent = `Panel ${state.selected + 1} of ${state.panels.length}`;
  document.getElementById('zoom').value = String(panel.zoom);
  document.getElementById('zoomVal').textContent = `${Math.round(panel.zoom * 100)}%`;
  const picker = document.getElementById('panelPhoto');
  picker.innerHTML = '';
  state.photos.forEach((photo, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = photo.name || `Photo ${i + 1}`;
    picker.appendChild(opt);
  });
  picker.value = String(panel.photo);
  picker.disabled = !state.photos.length;
}

// Rebuilds every control from the state (used after undo/redo and shots).
function syncControls() {
  titleInput.value = state.title;
  subtitleInput.value = state.subtitle;
  document.getElementById('titleScale').value = String(state.titleScale);
  syncPickers();
  syncPanelControls();
}

// --- Pointer work on the canvas: click picks a panel, drag pans it. ---
let dragging = null;
function panelAt(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  const x = ((clientX - r.left) / r.width) * canvas.width;
  const y = ((clientY - r.top) / r.height) * canvas.height;
  const rects = layoutRects(state.layout, canvas.width, canvas.height);
  for (let i = rects.length - 1; i >= 0; i--) {
    const rc = rects[i];
    if (x >= rc.x && x <= rc.x + rc.w && y >= rc.y && y <= rc.y + rc.h) return i;
  }
  return -1;
}
canvas.addEventListener('pointerdown', (e) => {
  const i = panelAt(e.clientX, e.clientY);
  if (i < 0) return;
  if (state.selected !== i) {
    state.selected = i;
    syncPanelControls();
  }
  const panel = state.panels[i];
  dragging = { i, x: e.clientX, y: e.clientY, ox: panel.ox, oy: panel.oy, moved: false };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const r = canvas.getBoundingClientRect();
  const rects = layoutRects(state.layout, canvas.width, canvas.height);
  const rect = rects[dragging.i];
  const dx = (e.clientX - dragging.x) / r.width / (rect.w / canvas.width);
  const dy = (e.clientY - dragging.y) / r.height / (rect.h / canvas.height);
  if (Math.abs(e.clientX - dragging.x) + Math.abs(e.clientY - dragging.y) > 4) dragging.moved = true;
  const panel = state.panels[dragging.i];
  panel.ox = Math.max(-0.6, Math.min(0.6, dragging.ox + dx));
  panel.oy = Math.max(-0.6, Math.min(0.6, dragging.oy + dy));
  redraw();
});
canvas.addEventListener('pointerup', () => {
  if (dragging && dragging.moved) commit();
  dragging = null;
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const panel = state.panels[state.selected];
  commit();
  panel.zoom = Math.max(1, Math.min(4, panel.zoom * (e.deltaY < 0 ? 1.12 : 0.89)));
  syncPanelControls();
  redraw();
}, { passive: false });

// --- Export: one click per size, exact pixels, PNG download. ---
async function exportSize(w, h) {
  setStatus(`Exporting ${w} x ${h}…`);
  const blob = await exportCover(state, w, h);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `vice-cover-${w}x${h}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  setStatus(`Saved vice-cover-${w}x${h}.png (${Math.round(blob.size / 1024)} KiB).`);
  return blob;
}
window.__exportCover = exportSize;

// --- Wire the controls. ---
buildPickers();
syncPickers();
syncPanelControls();
syncUndoButtons();

document.getElementById('photoInput').addEventListener('change', (e) => addFiles(e.target.files));
document.getElementById('dropzone').addEventListener('click', () => document.getElementById('photoInput').click());
document.getElementById('sampleBoulevard').addEventListener('click', async () => {
  const img = await loadImage('samples/boulevard.jpg');
  img.name = 'Boulevard';
  state.photos.push(img);
  notePhotos();
  syncPanelControls();
  redraw();
  setStatus('Sample photo “Boulevard” loaded.');
});
document.getElementById('samplePier').addEventListener('click', async () => {
  const img = await loadImage('samples/pier.jpg');
  img.name = 'Pier';
  state.photos.push(img);
  notePhotos();
  syncPanelControls();
  redraw();
  setStatus('Sample photo “Pier” loaded.');
});
document.getElementById('fillAll').addEventListener('click', () => {
  if (!state.photos.length) return;
  commit();
  const first = state.panels[state.selected].photo;
  state.panels.forEach((p) => { p.photo = first; });
  redraw();
  setStatus('Every panel now shows the same photo.');
});
titleInput.addEventListener('input', () => { state.title = titleInput.value; redraw(); });
subtitleInput.addEventListener('input', () => { state.subtitle = subtitleInput.value; redraw(); });
titleInput.addEventListener('change', commit);
subtitleInput.addEventListener('change', commit);
document.getElementById('titleScale').addEventListener('input', (e) => {
  state.titleScale = Number(e.target.value);
  redraw();
});
document.getElementById('titleScale').addEventListener('change', commit);
document.getElementById('grainToggle').addEventListener('change', (e) => { commit(); state.grain = e.target.checked; redraw(); });
document.getElementById('vignetteToggle').addEventListener('change', (e) => { commit(); state.vignette = e.target.checked; redraw(); });
document.getElementById('zoom').addEventListener('input', (e) => {
  state.panels[state.selected].zoom = Number(e.target.value);
  document.getElementById('zoomVal').textContent = `${Math.round(state.panels[state.selected].zoom * 100)}%`;
  redraw();
});
document.getElementById('zoom').addEventListener('change', commit);
document.getElementById('panelPhoto').addEventListener('change', (e) => {
  commit();
  state.panels[state.selected].photo = Number(e.target.value);
  redraw();
});
document.getElementById('undo').addEventListener('click', undo);
document.getElementById('redo').addEventListener('click', redo);
document.getElementById('shuffle').addEventListener('click', () => {
  if (!state.photos.length) return;
  commit();
  state.panels.forEach((p) => { p.photo = Math.floor(Math.random() * state.photos.length); });
  redraw();
  setStatus('Panels shuffled across your photos.');
});
document.querySelectorAll('[data-export]').forEach((b) => {
  b.addEventListener('click', () => exportSize(Number(b.dataset.w), Number(b.dataset.h)));
});
document.getElementById('aspectSquare').addEventListener('click', () => { previewAspect = 1; canvas.width = 900; canvas.height = 900; fitPreview(); redraw(); });
document.getElementById('aspectPortrait').addEventListener('click', () => { previewAspect = 1080 / 1350; canvas.width = 864; canvas.height = 1080; fitPreview(); redraw(); });
document.getElementById('aspectWide').addEventListener('click', () => { previewAspect = 1920 / 1080; canvas.width = 1080; canvas.height = 608; fitPreview(); redraw(); });
window.addEventListener('resize', fitPreview);
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
});

// --- Start: a `?shot=` query sets up a fixed scene for screenshots. ---
const params = new URLSearchParams(location.search);
const shot = params.get('shot');
if (shot) {
  runShot(shot, params, {
    loadImage,
    setAspect(w, h) {
      previewAspect = w / h;
      canvas.width = w;
      canvas.height = h;
      fitPreview();
    },
    apply() {
      syncControls();
      redraw();
    },
  });
} else {
  canvas.width = 900;
  canvas.height = 900;
  fitPreview();
  redraw();
  setStatus('Add a photo to begin — or try a sample below.');
}
