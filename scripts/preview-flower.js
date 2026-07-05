// Dev-only: prints an ASCII preview of each flower state to verify the art.
const { buildFlowerGrid, GRID, STATES } = require('../src/flower/flower-art.js');

// Map hex colors to chars by luminance + hue for a rough eyeball preview.
function charFor(hex) {
  if (!hex) return ' ';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (g > r && g > b) return b > 80 ? '%' : ':';        // greens (leaves/stem)
  if (r > 200 && g > 150) return 'Y';                    // yellow tip
  if (r > 180 && g > 90) return 'o';                     // orange pistil
  if (r > 200) return '#';                               // bright red petal
  if (r > 150) return '*';                               // highlight
  if (r > 120) return '+';                               // mid red
  if (r > 60) return '@';                                // dark center / edge
  return '.';
}

for (const state of Object.keys(STATES)) {
  const grid = buildFlowerGrid(state);
  console.log('\n=== ' + state + ' ===');
  for (let y = 0; y < GRID; y++) {
    let line = '';
    for (let x = 0; x < GRID; x++) line += charFor(grid[y * GRID + x]);
    console.log(line);
  }
}
