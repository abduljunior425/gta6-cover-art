// Fixed scenes for screenshots. `?shot=editor` shows the editor with a
// sample photo loaded; `?shot=cover` draws the exported cover full-frame
// at the window's size; `?shot=cover-portrait` the same in portrait;
// `?shot=grades` a second cover in another layout and grade. Query keys:
// photo (boulevard or pier), caption, subtitle, layout, grade.
// window.__shotReady is set once the scene has painted.

import { state } from './main.js';

export async function runShot(shot, query, api) {
  const photoName = query.get('photo') ?? 'boulevard';
  const title = query.get('caption') ?? 'VICE NIGHTS';
  const subtitle = query.get('subtitle') ?? 'Sunset Strip • Est. 2026';
  const layout = query.get('layout') ?? 'grid';
  const grade = query.get('grade') ?? 'sunset';

  const first = await api.loadImage(`samples/${photoName}.jpg`);
  first.name = photoName === 'pier' ? 'Pier' : 'Boulevard';
  state.photos.push(first);
  // A second sample fills the other panels, so multi-panel covers show
  // two different photos instead of one repeated tile.
  const otherName = photoName === 'pier' ? 'boulevard' : 'pier';
  try {
    const second = await api.loadImage(`samples/${otherName}.jpg`);
    second.name = otherName === 'pier' ? 'Pier' : 'Boulevard';
    state.photos.push(second);
  } catch {
    // One photo is enough; the cover still renders.
  }
  state.title = title;
  state.subtitle = subtitle;
  state.layout = layout;
  state.grade = grade;
  const { LAYOUTS } = await import('./cover.js');
  const count = (LAYOUTS[layout] || LAYOUTS.grid).panels;
  state.panels = [];
  for (let i = 0; i < count; i++) {
    state.panels.push({ photo: i % state.photos.length, zoom: 1, ox: 0, oy: 0 });
  }
  state.selected = 0;

  if (shot === 'cover' || shot === 'cover-portrait' || shot === 'grades') {
    document.body.classList.add('shot-cover');
    const w = shot === 'cover-portrait' ? 1024 : 1280;
    const h = shot === 'cover-portrait' ? 1280 : 720;
    api.setAspect(w, h);
    const cover = document.getElementById('cover');
    cover.style.width = '100vw';
    cover.style.height = '100vh';
  } else {
    api.setAspect(900, 900);
  }
  api.apply();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.__shotReady = true;
  }));
}
