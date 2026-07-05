// Procedural pixel-art hibiscus renderer.
// Pure logic (no DOM) so it can run in the browser AND be previewed from Node.
// buildFlowerGrid(state) -> Array(GRID*GRID) of hex color strings or null.

(function (root) {
  const GRID = 32;

  // ── Palettes ───────────────────────────────────────────────────────────────
  const RED = {
    petal:     '#e8344a',
    petalDark: '#c01f31',
    petalEdge: '#931523',
    highlight: '#ff7283',
    center:    '#6e1b27',
    centerDark:'#46101a',
    pistil:    '#f4a32a',
    pistilTip: '#ffd23f',
  };
  const BROWN = {
    petal:     '#9c6b43',
    petalDark: '#6e4a2c',
    petalEdge: '#4f3420',
    highlight: '#b8895f',
    center:    '#3e2614',
    centerDark:'#281708',
    pistil:    '#7a5a30',
    pistilTip: '#9c7a40',
  };
  const LEAF      = { leaf: '#1f5c4d', leafDark: '#103b30', vein: '#2f7d5b' };
  const LEAF_DEAD = { leaf: '#5a5230', leafDark: '#3a3420', vein: '#6e6038' };
  const STEM      = '#2f7d5b';
  const STEM_DEAD = '#6e5a38';

  // ── Per-state configuration ──────────────────────────────────────────────────
  // tilt: radians the flower head rotates (clockwise = drooping down/right)
  // drop: cells the bloom sinks toward the stem as it wilts
  // R:    bloom radius in grid cells
  // missing: which petal indices have fallen off (0 = top, going clockwise)
  const STATES = {
    healthy:         { tilt: 0.00, drop: 0, R: 11.0, missing: [],          dead: false },
    'droopy-slight': { tilt: 0.18, drop: 1, R: 11.0, missing: [],          dead: false },
    'droopy-petals': { tilt: 0.40, drop: 2, R: 10.5, missing: [1, 4],      dead: false },
    'droopy-heavy':  { tilt: 0.60, drop: 4, R: 10.0, missing: [0, 1, 4],   dead: false },
    dead:            { tilt: 0.85, drop: 6, R: 8.5,  missing: [0, 1, 3, 4], dead: true  },
  };

  const PETALS = 5;
  const TWO_PI = Math.PI * 2;
  const SECTOR = TWO_PI / PETALS;

  // ── Grid helpers ─────────────────────────────────────────────────────────────
  function makeGrid() {
    return new Array(GRID * GRID).fill(null);
  }
  function plot(grid, x, y, color) {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || xi >= GRID || yi < 0 || yi >= GRID) return;
    grid[yi * GRID + xi] = color;
  }
  function rot(px, py, cx, cy, a) {
    const s = Math.sin(a), c = Math.cos(a);
    const dx = px - cx, dy = py - cy;
    return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
  }

  // ── Bloom (the multi-petal flower head) ──────────────────────────────────────
  function drawBloom(grid, S, pal) {
    const pivot = { x: 16, y: 19 };           // base of the head (top of stem)
    const bcLocal = { x: 16, y: 9 + S.drop };  // bloom sinks toward the stem as it wilts
    const R = S.R;

    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        // Sample at pixel center, then un-rotate into the head's local frame
        const lp = rot(x + 0.5, y + 0.5, pivot.x, pivot.y, -S.tilt);
        const dx = lp.x - bcLocal.x;
        const dy = lp.y - bcLocal.y;
        const dist = Math.hypot(dx, dy);
        if (dist > R + 1) continue;

        const ang = Math.atan2(dy, dx);
        // f = 1 at petal centers, -1 in the valleys between petals.
        // +PI/2 puts a petal pointing straight up.
        const f = Math.cos(PETALS * (ang + Math.PI / 2));
        const f01 = (f + 1) / 2;
        const boundary = R * (0.70 + 0.30 * f01); // scalloped outline

        if (dist > boundary) continue;

        // Which petal sector are we in?
        let petalIdx = Math.round((ang + Math.PI / 2) / SECTOR);
        petalIdx = ((petalIdx % PETALS) + PETALS) % PETALS;

        const inCenter = dist < R * 0.22;

        // Fallen petals: remove the outer petal, keep the center disc
        if (!inCenter && S.missing.indexOf(petalIdx) !== -1) continue;

        let color;
        if (dist < R * 0.10) {
          color = pal.centerDark;
        } else if (inCenter) {
          color = pal.center;
        } else {
          color = pal.petal;
          // valley shading between petals
          if (f < -0.25 && dist > R * 0.32) color = pal.petalDark;
          if (f < -0.6 && dist > R * 0.32) color = pal.petalEdge;
          // outer rim
          if (dist > boundary - 1.3) color = pal.petalDark;
          if (dist > boundary - 0.5) color = pal.petalEdge;
          // soft sheen on the upper-left of each petal
          if (f > 0.35 && dist > R * 0.28 && dist < R * 0.66 && dx < 0 && dy < 0) {
            color = pal.highlight;
          }
        }
        plot(grid, x, y, color);
      }
    }

    // ── Pistil: a stalk angled up-right with a yellow stamen tip ──
    const pa = -Math.PI / 4; // up-right in local frame
    const len = R + 5;
    for (let t = R * 0.2; t <= len; t += 0.5) {
      const lx = bcLocal.x + Math.cos(pa) * t;
      const ly = bcLocal.y + Math.sin(pa) * t;
      const wp = rot(lx, ly, pivot.x, pivot.y, S.tilt);
      plot(grid, wp.x, wp.y, pal.pistil);
    }
    // stamen specks branching near the tip
    for (let i = 0; i < 5; i++) {
      const t = len - i * 0.9;
      const spread = (i - 2) * 0.7;
      const lx = bcLocal.x + Math.cos(pa) * t + Math.cos(pa + Math.PI / 2) * spread;
      const ly = bcLocal.y + Math.sin(pa) * t + Math.sin(pa + Math.PI / 2) * spread;
      const wp = rot(lx, ly, pivot.x, pivot.y, S.tilt);
      plot(grid, wp.x, wp.y, pal.pistilTip);
    }
    // bright tip cluster
    const tipL = { x: bcLocal.x + Math.cos(pa) * (len + 0.5), y: bcLocal.y + Math.sin(pa) * (len + 0.5) };
    const tipW = rot(tipL.x, tipL.y, pivot.x, pivot.y, S.tilt);
    plot(grid, tipW.x, tipW.y, pal.pistilTip);
    plot(grid, tipW.x + 1, tipW.y, pal.pistilTip);
    plot(grid, tipW.x, tipW.y - 1, pal.pistilTip);
  }

  // ── Stem ─────────────────────────────────────────────────────────────────────
  function drawStem(grid, S, stemCol) {
    for (let y = 18; y < GRID; y++) {
      // a gentle curve toward the bottom
      const bend = Math.round(Math.sin((y - 18) / 9) * 1.5);
      plot(grid, 16 + bend, y, stemCol);
      plot(grid, 17 + bend, y, stemCol);
    }
  }

  // ── Leaves ───────────────────────────────────────────────────────────────────
  function drawLeaf(grid, cx, cy, rx, ry, angle, lp) {
    for (let y = Math.floor(cy - rx); y <= Math.ceil(cy + rx); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        if (x < 0 || x >= GRID || y < 0 || y >= GRID) continue;
        // rotate the point into the leaf's local frame
        const p = rot(x + 0.5, y + 0.5, cx, cy, -angle);
        const u = (p.x - cx) / rx;
        const v = (p.y - cy) / ry;
        const d = u * u + v * v;
        if (d > 1) continue;
        let color = lp.leaf;
        if (d > 0.7) color = lp.leafDark;           // darker edge
        if (Math.abs(p.y - cy) < 0.6) color = lp.vein; // central vein
        plot(grid, x, y, color);
      }
    }
  }

  function drawLeaves(grid, lp) {
    drawLeaf(grid, 8, 21, 6.5, 3.0, -0.45, lp);
    drawLeaf(grid, 11, 26, 5.5, 2.6, 0.30, lp);
  }

  // ── Assemble ─────────────────────────────────────────────────────────────────
  function buildFlowerGrid(state) {
    const S = STATES[state] || STATES.healthy;
    const grid = makeGrid();
    const pal = S.dead ? BROWN : RED;
    const lp = S.dead ? LEAF_DEAD : LEAF;
    const stemCol = S.dead ? STEM_DEAD : STEM;

    drawStem(grid, S, stemCol);
    drawLeaves(grid, lp);
    drawBloom(grid, S, pal);
    return grid;
  }

  const api = { buildFlowerGrid, GRID, STATES };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.FlowerArt = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
