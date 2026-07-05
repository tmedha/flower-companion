const canvas = document.getElementById('flower-canvas');
const ctx = canvas.getContext('2d');
const resizeHandle = document.getElementById('resize-handle');

const GRID = window.FlowerArt.GRID;

// ── Rendering ────────────────────────────────────────────────────────────────

let currentState = 'healthy';

function drawGrid(grid) {
  const W = canvas.width;
  const H = canvas.height;
  const cellW = W / GRID;
  const cellH = H / GRID;

  ctx.clearRect(0, 0, W, H);

  for (let i = 0; i < grid.length; i++) {
    const color = grid[i];
    if (!color) continue;
    const x = (i % GRID) * cellW;
    const y = Math.floor(i / GRID) * cellH;
    ctx.fillStyle = color;
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(cellW), Math.ceil(cellH));
  }
}

function render(state) {
  currentState = state;
  drawGrid(window.FlowerArt.buildFlowerGrid(state));
}

function resizeCanvas() {
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  render(currentState);
}

window.addEventListener('resize', resizeCanvas);

// ── State from main process ──────────────────────────────────────────────────

window.api.onFlowerState(({ state }) => render(state));

// ── Dragging + double-click to open panel ────────────────────────────────────
// Both gestures start on the same surface, so we distinguish them:
//   - a drag is any mousedown that moves more than a few pixels
//   - a double-click is two quick mousedowns that did NOT turn into drags

let dragging = false;
let pressed = false;
let pressScreenX = 0;
let pressScreenY = 0;
let winStartX = 0;
let winStartY = 0;
let lastClickTime = 0;

const DRAG_THRESHOLD = 4; // px of movement before it counts as a drag

canvas.addEventListener('mousedown', async (e) => {
  if (e.button !== 0) return; // left button only
  pressed = true;
  pressScreenX = e.screenX;
  pressScreenY = e.screenY;
  const pos = await window.api.getWindowPosition();
  winStartX = pos.x;
  winStartY = pos.y;
});

window.addEventListener('mousemove', (e) => {
  if (!pressed) return;
  const dx = e.screenX - pressScreenX;
  const dy = e.screenY - pressScreenY;

  if (!dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
    dragging = true;
    canvas.classList.add('dragging');
  }
  if (dragging) {
    window.api.moveWindow(winStartX + dx, winStartY + dy);
  }
});

window.addEventListener('mouseup', () => {
  if (!pressed) return;
  pressed = false;

  if (dragging) {
    dragging = false;
    canvas.classList.remove('dragging');
    return; // a drag never counts as a click
  }

  // Clean click (no drag) — check for double-click
  const now = Date.now();
  if (now - lastClickTime < 400) {
    window.api.openPanel();
    lastClickTime = 0;
  } else {
    lastClickTime = now;
  }
});

// ── Resize handle (bottom-right corner) ──────────────────────────────────────
// The window is kept square since the flower art is square.

let resizing = false;
let resizeStartX = 0;
let resizeStartY = 0;
let startW = 0;
let startH = 0;

resizeHandle.addEventListener('mousedown', async (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  resizing = true;
  resizeStartX = e.screenX;
  resizeStartY = e.screenY;
  const size = await window.api.getWindowSize();
  startW = size.width;
  startH = size.height;
  document.body.classList.add('resizing');
});

window.addEventListener('mousemove', (e) => {
  if (!resizing) return;
  const delta = Math.max(e.screenX - resizeStartX, e.screenY - resizeStartY);
  const next = startW + delta; // square
  window.api.resizeWindow(next, next);
});

window.addEventListener('mouseup', () => {
  if (!resizing) return;
  resizing = false;
  document.body.classList.remove('resizing');
});

// ── Init ─────────────────────────────────────────────────────────────────────

resizeCanvas();
render('healthy');
