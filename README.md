# backrooms

A ten-level, entirely static backrooms prototype. No installation, bundler, backend,
CDN, analytics, external fonts, API calls, or downloaded runtime assets.

## Preview

Serve this directory over HTTP (ES modules cannot run directly from `file://`):

```sh
python3 -m http.server 4173
```

Open http://localhost:4173. Click **Start**. A modern WebGL-capable
browser with hardware acceleration is required.

## Controls

- WASD: move. Mouse: look when captured; drag to look if capture is unavailable.
- Left/right arrows: turn. Up/down arrows: forward/back.
- Shift: move faster. Default walk speed is 5.8 m/s; sprint is 1.65 times that.
- M / Overhead: hide the ceiling and see your character from above. WASD or arrows
  move relative to the screen in this view.
- Escape: pause and release the mouse. Click Resume to continue.
- Tune: change the 92-degree default field of view, walking speed, reset position,
  or select any of the ten fixed levels.
- Find the unmarked door and press E (or its nearby onscreen button) to enter the next level.
  The tenth exit completes the sequence; Restart returns to level 1.
- Sound: optional synthesized fluorescent hum, off by default.
- Touch: directional buttons move; drag the scene to look.

Each fixed level spans 108 x 108 metres, with 5.5-metre ceilings. The layout mixes
36 x 24 metre chambers, an 84-metre hall, colonnades, diagonal partitions,
L-shaped alcoves, and 1.35-metre-wide connecting passages. All exits are reachable.
There are no route hints, floor markers, signs, or activated guidance systems.
The same
ten seeds always produce the same ten layouts; there is no random regeneration
or user-facing seed control. Use `?level=1` through `?level=10` for direct links.
Old `?seed=` parameters are ignored and removed. There are no monsters, story,
combat, stamina, or survival systems. Overhead view remains available for review.

## GitHub Pages

For an **existing GitHub Pages website**, add the `backrooms` folder inside your
existing published root (the repo root, `docs/`, or your build output). Keep the
site's existing deployment workflow.
Publish this directory unchanged so `/backrooms/index.html`, `main.js`, `world.js`,
`style.css`, `assets/`, `vendor/`, `licenses/`, `LICENSE`, and `CREDITS.md` are served.

For a **new standalone repository**, put this folder's contents at the repo root.
In **Settings > Pages > Build and deployment**, choose **Deploy from a branch**,
select `main` and `/ (root)`. The `.nojekyll` file bypasses Jekyll. No installation
or build is needed. The `backrooms` repository is served at https://waychas.github.io/backrooms/.

All asset URLs are relative, so `/backrooms/` under a custom/user domain, or
`/repository/backrooms/` on a project Pages site, work without configuration.
For the exact root URL `/backrooms/`, use your existing user/organization Pages
website or its custom domain; project Pages sites retain their `/repository/` prefix.
To embed this
inside an existing website, host the folder under a subpath or use an iframe:

```html
<iframe src="./backrooms/" title="backrooms exploration"
  style="width:100%;height:80vh;border:0" allow="fullscreen"
  allowfullscreen></iframe>
```

If the iframe is sandboxed, include `allow-scripts allow-same-origin
allow-pointer-lock`. Drag/keyboard look also works without pointer lock.

## Development

```sh
node --test world.test.js
node --check main.js
```

`world.js` owns deterministic layout and collision; `main.js` owns rendering,
controls, and audio. `style.css` and `index.html` own the interface. Runtime assets
are committed in `assets/` and `vendor/`. No npm dependencies are required.

This is a small standalone derivative using Level 0 Engine's exported textures
and vendored renderer, not the entire upstream survival engine. See `CREDITS.md`
and the retained licenses before redistributing.
