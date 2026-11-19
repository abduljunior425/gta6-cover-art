# Neon Vice — Cover Art Maker

![Make GTA 6 Cover Art](https://make.fun/badge/gta6-cover-art-01.svg)
![Rank](https://make.fun/badge/gta6-cover-art-01/abduljunior425/gta6-cover-art/rank.svg)
![Reward](https://make.fun/badge/gta6-cover-art-01/abduljunior425/gta6-cover-art/reward.svg)

An offline web app that turns your own photos and a caption into a
multi-panel Vice City style poster and exports it as a PNG.
Entered in [Make GTA 6 Cover Art](https://make.fun/bounty/gta6-cover-art-01) ($250).

## How it works

1. **Add photos** — drop your own photos in (they never leave your machine),
   or try the two built-in sample photos.
2. **Pick a layout** — Four Panel Grid, Hero + Three, Full Bleed, or Mosaic Nine.
3. **Pick a colour grade** — Sunset, Neon Night, Vice Gold, or Palm Noir.
   Each grade is a real gradient-map / duotone pass over the photo, plus film
   grain and a vignette.
4. **Write the caption** — a bold title and a subtitle, sized to fit.
5. **Crop each panel** — click a panel, drag it to position the photo,
   scroll to zoom, or pick a different photo per panel.
6. **Export** — one click, as a PNG in 1080 × 1080, 1080 × 1350, or 1920 × 1080.

Undo/redo (Ctrl+Z / Ctrl+Y) covers every change. Everything runs from
static files under `app/` — no build step, no network requests, no fonts
or artwork from any game. The lettering is a heavy system sans-serif stack,
styled with an outline, a hard shadow and an accent bar.

## Try it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome.
