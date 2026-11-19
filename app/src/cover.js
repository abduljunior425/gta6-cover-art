// Neon Vice — the cover drawing engine.
// Everything the poster is made of lives here: the panel layouts, the
// gradient-map colour grades, the grain and vignette, and the bold caption
// lettering. It draws onto any 2D canvas at any size, so the live preview
// and the exported PNG share exactly the same picture.

export const GRADES = {
  sunset: {
    label: 'Sunset',
    stops: [[26, 11, 46], [255, 94, 58], [255, 209, 102]],
    wash: 'rgba(255, 110, 60, 0.16)',
    accent: '#ff5e3a',
  },
  neon: {
    label: 'Neon Night',
    stops: [[5, 5, 20], [255, 46, 166], [0, 229, 255]],
    wash: 'rgba(120, 40, 255, 0.20)',
    accent: '#00e5ff',
  },
  gold: {
    label: 'Vice Gold',
    stops: [[20, 13, 2], [255, 157, 0], [255, 233, 168]],
    wash: 'rgba(255, 170, 0, 0.14)',
    accent: '#ffb400',
  },
  noir: {
    label: 'Palm Noir',
    stops: [[2, 8, 10], [0, 148, 141], [255, 240, 214]],
    wash: 'rgba(0, 200, 190, 0.12)',
    accent: '#00c8be',
  },
};

export const LAYOUTS = {
  grid: { label: 'Four Panel Grid', panels: 4 },
  hero: { label: 'Hero + Three', panels: 4 },
  full: { label: 'Full Bleed', panels: 1 },
  mosaic: { label: 'Mosaic Nine', panels: 9 },
};

// Panel rectangles for a layout, in pixels. Every layout leaves a thin
// dark frame and a gap between panels, and reserves the bottom strip
// for the caption block.
export function layoutRects(layout, w, h) {
  const gap = Math.round(Math.min(w, h) * 0.012);
  const frame = Math.round(Math.min(w, h) * 0.018);
  const titleH = Math.round(h * 0.20);
  const top = frame;
  const bottom = h - titleH - frame;
  const innerW = w - frame * 2;
  const innerH = bottom - top;
  const cell = (x, y, cw, ch) => ({ x, y, w: cw, h: ch });
  if (layout === 'full') {
    return [cell(frame, frame, innerW, h - frame * 2 - titleH * 0.55)];
  }
  if (layout === 'hero') {
    const heroW = Math.round(innerW * 0.62);
    const sideW = innerW - heroW - gap;
    const thirdH = Math.round((innerH - gap * 2) / 3);
    return [
      cell(frame, top, heroW, innerH),
      cell(frame + heroW + gap, top, sideW, thirdH),
      cell(frame + heroW + gap, top + thirdH + gap, sideW, thirdH),
      cell(frame + heroW + gap, top + thirdH * 2 + gap * 2, sideW, innerH - thirdH * 2 - gap * 2),
    ];
  }
  if (layout === 'mosaic') {
    const cols = 3;
    const rows = 3;
    const cw = Math.round((innerW - gap * (cols - 1)) / cols);
    const ch = Math.round((innerH - gap * (rows - 1)) / rows);
    const rects = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        rects.push(cell(frame + c * (cw + gap), top + r * (ch + gap), cw, ch));
      }
    }
    return rects;
  }
  // grid: 2 x 2
  const cw = Math.round((innerW - gap) / 2);
  const ch = Math.round((innerH - gap) / 2);
  return [
    cell(frame, top, cw, ch),
    cell(frame + cw + gap, top, cw, ch),
    cell(frame, top + ch + gap, cw, ch),
    cell(frame + cw + gap, top + ch + gap, cw, ch),
  ];
}

// Remaps a panel's pixels through a grade's three-stop ramp by luminance,
// then blends the mapped version back over the original so the photo keeps
// some of its own colour. Runs on a small offscreen canvas per panel.
function gradePanel(source, grade) {
  const w = source.width;
  const h = source.height;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');
  ctx.drawImage(source, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  const [dark, mid, bright] = grade.stops;
  for (let i = 0; i < data.length; i += 4) {
    const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
    let r;
    let g;
    let b;
    if (lum < 0.5) {
      const t = lum / 0.5;
      r = dark[0] + (mid[0] - dark[0]) * t;
      g = dark[1] + (mid[1] - dark[1]) * t;
      b = dark[2] + (mid[2] - dark[2]) * t;
    } else {
      const t = (lum - 0.5) / 0.5;
      r = mid[0] + (bright[0] - mid[0]) * t;
      g = mid[1] + (bright[1] - mid[1]) * t;
      b = mid[2] + (bright[2] - mid[2]) * t;
    }
    const mix = 0.62;
    data[i] = data[i] * (1 - mix) + r * mix;
    data[i + 1] = data[i + 1] * (1 - mix) + g * mix;
    data[i + 2] = data[i + 2] * (1 - mix) + b * mix;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

// Draws one photo into a panel rect with cover-fit, the panel's zoom and
// pan offsets, then the grade. Offsets are fractions of the panel size.
function drawPanel(ctx, photo, rect, panel, grade) {
  const { x, y, w, h } = rect;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = '#241028';
  ctx.fillRect(x, y, w, h);
  if (photo) {
    const tile = document.createElement('canvas');
    tile.width = Math.max(2, Math.round(w));
    tile.height = Math.max(2, Math.round(h));
    const tctx = tile.getContext('2d');
    const base = Math.max(w / photo.naturalWidth, h / photo.naturalHeight);
    const scale = base * (panel.zoom || 1);
    const pw = photo.naturalWidth * scale;
    const ph = photo.naturalHeight * scale;
    const cx = w / 2 + (panel.ox || 0) * w;
    const cy = h / 2 + (panel.oy || 0) * h;
    tctx.drawImage(photo, cx - pw / 2, cy - ph / 2, pw, ph);
    const graded = gradePanel(tile, grade);
    ctx.drawImage(graded, x, y);
    // Warm wash so panels in one poster feel like one sunset.
    ctx.fillStyle = grade.wash;
    ctx.fillRect(x, y, w, h);
    // Thin bright edge on the panel, like a printed poster grid.
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = Math.max(1, Math.round(Math.min(w, h) * 0.004));
    ctx.strokeRect(x, y, w, h);
  }
  ctx.restore();
}

let noiseTile = null;
function grainTile() {
  if (noiseTile) return noiseTile;
  noiseTile = document.createElement('canvas');
  noiseTile.width = 140;
  noiseTile.height = 140;
  const nctx = noiseTile.getContext('2d');
  const img = nctx.createImageData(140, 140);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(Math.random() * 255);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 22;
  }
  nctx.putImageData(img, 0, 0);
  return noiseTile;
}

// Fits the heavy display lettering to the available width, shrinking until
// it fits, then draws it with a dark outline and a hard offset shadow.
function drawTitle(ctx, text, cx, baseline, maxWidth, size, accent) {
  const stack = '"Arial Black", "Helvetica Neue", Arial, sans-serif';
  let s = size;
  ctx.font = `900 ${s}px ${stack}`;
  while (ctx.measureText(text).width > maxWidth && s > 10) {
    s -= 2;
    ctx.font = `900 ${s}px ${stack}`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = Math.round(s * 0.06);
  ctx.shadowOffsetY = Math.round(s * 0.06);
  ctx.strokeStyle = '#14081d';
  ctx.lineWidth = Math.max(2, Math.round(s * 0.14));
  ctx.strokeText(text, cx, baseline);
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, cx, baseline);
  // A hot accent underline bar under the title.
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = accent;
  ctx.fillRect(cx - tw / 2, baseline + s * 0.10, tw, Math.max(3, Math.round(s * 0.07)));
  return s;
}

// The whole poster. `state` carries layout, grade, title, subtitle, the
// photos array, one panel record per panel, and the grain/vignette flags.
export function drawCover(ctx, w, h, state) {
  const grade = GRADES[state.grade] || GRADES.sunset;
  ctx.clearRect(0, 0, w, h);
  // Deep plum backdrop with a sunset glow rising from the bottom.
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#160a20');
  bg.addColorStop(0.55, '#2b1038');
  bg.addColorStop(1, '#571b3a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w * 0.5, h * 1.05, 0, w * 0.5, h * 1.05, w * 0.75);
  glow.addColorStop(0, grade.wash.replace(/[\d.]+\)$/, '0.55)'));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  const rects = layoutRects(state.layout, w, h);
  rects.forEach((rect, i) => {
    const panel = state.panels[i] || { photo: 0, zoom: 1, ox: 0, oy: 0 };
    const photo = state.photos[panel.photo] || state.photos[0] || null;
    drawPanel(ctx, photo, rect, panel, grade);
  });

  // Caption block: title, then a tracked-out subtitle.
  const frame = Math.round(Math.min(w, h) * 0.018);
  const titleText = (state.title || 'VICE NIGHTS').trim().toUpperCase();
  const titleSize = Math.round(h * 0.105 * (state.titleScale || 1));
  const titleBase = h - frame - Math.round(h * 0.055);
  drawTitle(ctx, titleText, w / 2, titleBase, w - frame * 2, titleSize, grade.accent);
  const sub = (state.subtitle || '').trim().toUpperCase();
  if (sub) {
    const subSize = Math.max(10, Math.round(h * 0.028));
    ctx.font = `700 ${subSize}px "Helvetica Neue", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    // Letter-spacing by hand: canvas has no tracking, so draw spaced.
    const spaced = sub.split('').join('\u2009');
    ctx.fillText(spaced, w / 2, h - frame - Math.round(h * 0.012));
  }

  if (state.vignette !== false) {
    const vig = ctx.createRadialGradient(
      w / 2, h / 2, Math.min(w, h) * 0.42,
      w / 2, h / 2, Math.max(w, h) * 0.75,
    );
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(10,2,16,0.5)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  }
  if (state.grain !== false) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = ctx.createPattern(grainTile(), 'repeat');
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  // Outer frame line.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = Math.max(1, Math.round(Math.min(w, h) * 0.003));
  ctx.strokeRect(frame / 2, frame / 2, w - frame, h - frame);
}

// Renders the poster at an exact export size and returns a PNG blob.
export function exportCover(state, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  drawCover(canvas.getContext('2d'), width, height, state);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
