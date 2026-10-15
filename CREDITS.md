# Credits and Provenance

## Level 0 Engine

Source: https://github.com/aedmark/level0engine

Upstream revision: `120f6e05609f17a2dc72fc4ab3df880a7569b8b7`.

Author: Andrew Edmark, with the human/computer collaboration acknowledgment
preserved in `licenses/LEVEL0-LICENSE.txt`.

Reused unchanged: `wallTexture.webp`, `wallBumpTexture.webp`,
`carpetTexture.webp`, `ceilingTexture.webp`, and `ceilingBumpTexture.webp`, from
upstream `assets/textures/`. The local Three.js file was also copied unchanged
from upstream `r160.js`.

The upstream license is a custom MIT (Human/Computer Variant), not unmodified
standard MIT. Its complete permission notice, acknowledgment, and disclaimer
are retained in `licenses/LEVEL0-LICENSE.txt`.

## Three.js

Three.js r160, https://github.com/mrdoob/three.js/tree/r160

Copyright 2010-2023 Three.js Authors. MIT license, retained in
`licenses/THREE-LICENSE.txt`. Renderer is vendored locally as
`vendor/three-r160.js`; no CDN requests are made.

## Prototype Changes

New ten-level fixed-seed connected-maze generator, collision, compact renderer, first-person
and overhead cameras, simple character, interface, synthesized ambience, touch
controls, large mixed-scale halls, rotated-wall collision, exit progression, and tests. The original game's narrative,
entities, streamed infinite world, persistence, and editors are not included.

Original prototype code is MIT-licensed under `LICENSE`. Upstream assets and
vendored code remain subject to their respective retained licenses.
