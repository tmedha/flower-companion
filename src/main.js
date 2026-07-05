const { app, BrowserWindow, ipcMain, screen, nativeImage } = require('electron');
const path = require('path');

const ICON_PATH = path.join(__dirname, '..', 'assets', 'icon.png');

// ── Withering tuning ─────────────────────────────────────────────────────────
// The flower reacts to *neglect*: how long the current backlog has gone without
// progress. Completing any task resets that clock (perk-up); tasks left sitting
// let it grow (wilt). These are the knobs that control the feel.
const DAY_MS = 24 * 60 * 60 * 1000;
// Neglect (in days) at which each drooping stage kicks in.
const WILT_DAYS = {
  'droopy-slight': 1, // >= 1 day untended
  'droopy-petals': 2, // >= 2 days
  'droopy-heavy':  3, // >= 3 days
  dead:            4  // >= 4 days
};
// Once this many tasks have piled up, push the flower one stage further down.
const PILEUP_THRESHOLD = 8;
// Ordered from healthiest to most wilted; used to apply the pile-up nudge.
const STAGES = ['healthy', 'droopy-slight', 'droopy-petals', 'droopy-heavy', 'dead'];
// How often to re-evaluate state as time passes with no user action.
const TICK_MS = 10 * 60 * 1000; // 10 minutes

// electron-store must be imported with dynamic import in ESM-compatible versions
let store;

let flowerWindow = null;
let panelWindow = null;

async function initStore() {
  const { default: Store } = await import('electron-store');
  store = new Store({
    defaults: {
      tasks: [],
      lastCompletedAt: null, // timestamp (ms) of the most recent task completion
      flowerBounds: null     // { x, y, width, height }
    }
  });
}

// A task's creation time. New tasks carry an explicit `createdAt`; older ones
// fall back to `id`, which has always been `Date.now()` at creation.
function taskCreatedAt(task) {
  return task.createdAt ?? task.id;
}

// When a task's neglect clock starts. Snoozing ("I'm working on this") pushes it
// forward to now, so a long-running task stops driving the wilt until it re-ages.
function taskNeglectStart(task) {
  return Math.max(taskCreatedAt(task), task.snoozedAt || 0);
}

function getFlowerState(store) {
  const tasks = store.get('tasks');
  if (!tasks || tasks.length === 0) return 'healthy';

  const pending = tasks.filter(t => !t.done);
  if (pending.length === 0) return 'healthy'; // nothing hanging over you

  // How long the backlog has gone without progress. The clock starts at
  // whichever is more recent: the last time you completed something, or the
  // moment the oldest still-pending task appeared. Completing a task bumps
  // `lastCompletedAt` to now, so the flower perks up.
  const now = Date.now();
  const lastCompletedAt = store.get('lastCompletedAt') || 0;
  const oldestPendingAt = Math.min(...pending.map(taskNeglectStart));
  const reference = Math.max(lastCompletedAt, oldestPendingAt);
  const neglectDays = (now - reference) / DAY_MS;

  let base = 'healthy';
  if (neglectDays >= WILT_DAYS.dead) base = 'dead';
  else if (neglectDays >= WILT_DAYS['droopy-heavy']) base = 'droopy-heavy';
  else if (neglectDays >= WILT_DAYS['droopy-petals']) base = 'droopy-petals';
  else if (neglectDays >= WILT_DAYS['droopy-slight']) base = 'droopy-slight';

  // Pile-up nudge: a large backlog pushes the flower one stage further down.
  const bump = pending.length >= PILEUP_THRESHOLD ? 1 : 0;
  const stage = Math.min(STAGES.indexOf(base) + bump, STAGES.length - 1);
  return STAGES[stage];
}

async function createFlowerWindow() {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

  const savedBounds = store.get('flowerBounds');
  const defaultSize = 110;
  const bounds = savedBounds || {
    x: sw - defaultSize - 20,
    y: sh - defaultSize - 20,
    width: defaultSize,
    height: defaultSize
  };
  // The flower art is square, so the window must be too. Force any restored
  // bounds square (guards against legacy/odd saved sizes) — the aspect ratio is
  // then locked below so it can never be stretched.
  const side = Math.max(60, Math.min(300, bounds.width, bounds.height));
  bounds.width = side;
  bounds.height = side;

  flowerWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: 60,
    minHeight: 60,
    maxWidth: 300,
    maxHeight: 300,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  flowerWindow.loadFile(path.join(__dirname, 'flower', 'index.html'));
  flowerWindow.setAlwaysOnTop(true, 'screen-saver');
  // Lock the window to a 1:1 aspect ratio so every resize stays square and the
  // pixel-art flower can never be stretched — whether resized via the corner
  // grip or by the OS (window snapping/tiling).
  flowerWindow.setAspectRatio(1);

  // Persist position/size on move or resize.
  // Debounced so a drag (many rapid 'moved' events) writes to disk only once it settles.
  let saveTimer = null;
  const saveBounds = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (flowerWindow && !flowerWindow.isDestroyed()) {
        store.set('flowerBounds', flowerWindow.getBounds());
      }
    }, 300);
  };
  flowerWindow.on('moved', saveBounds);
  flowerWindow.on('resized', saveBounds);

  // State depends on elapsed time, so re-evaluate periodically even when the
  // user isn't touching anything (a neglected backlog wilts on its own).
  const tick = setInterval(pushFlowerState, TICK_MS);
  flowerWindow.on('closed', () => clearInterval(tick));

  // Double-click opens panel (sent from renderer via IPC)
  ipcMain.on('open-panel', () => openPanel());

  // Manual window dragging from the renderer (the flower canvas)
  ipcMain.on('move-window', (_, { x, y }) => {
    if (flowerWindow && !flowerWindow.isDestroyed()) {
      flowerWindow.setPosition(Math.round(x), Math.round(y));
    }
  });
  ipcMain.handle('get-window-position', () => {
    if (flowerWindow && !flowerWindow.isDestroyed()) {
      const [x, y] = flowerWindow.getPosition();
      return { x, y };
    }
    return { x: 0, y: 0 };
  });

  // Manual window resizing from the corner handle (kept square)
  ipcMain.on('resize-window', (_, { width, height }) => {
    if (flowerWindow && !flowerWindow.isDestroyed()) {
      const w = Math.max(60, Math.min(300, Math.round(width)));
      const h = Math.max(60, Math.min(300, Math.round(height)));
      flowerWindow.setSize(w, h);
    }
  });
  ipcMain.handle('get-window-size', () => {
    if (flowerWindow && !flowerWindow.isDestroyed()) {
      const [width, height] = flowerWindow.getSize();
      return { width, height };
    }
    return { width: 110, height: 110 };
  });

  // Send initial state once the window is ready
  flowerWindow.webContents.on('did-finish-load', () => {
    pushFlowerState();
  });
}

function openPanel() {
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.focus();
    return;
  }

  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

  panelWindow = new BrowserWindow({
    width: 340,
    height: 500,
    x: Math.round(sw / 2 - 170),
    y: Math.round(sh / 2 - 250),
    frame: true,
    resizable: true,
    alwaysOnTop: true,
    title: 'Tasks',
    icon: ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  panelWindow.loadFile(path.join(__dirname, 'panel', 'index.html'));
  panelWindow.setMenuBarVisibility(false);

  panelWindow.on('closed', () => {
    panelWindow = null;
    pushFlowerState();
  });

  panelWindow.webContents.on('did-finish-load', () => {
    panelWindow.webContents.send('tasks-update', store.get('tasks'));
  });
}

function pushFlowerState() {
  if (flowerWindow && !flowerWindow.isDestroyed()) {
    const state = getFlowerState(store);
    const tasks = store.get('tasks');
    const done = tasks.filter(t => t.done).length;
    const total = tasks.length;
    flowerWindow.webContents.send('flower-state', { state, done, total });
  }
}

function registerIPC() {
  ipcMain.handle('get-tasks', () => store.get('tasks'));

  ipcMain.handle('add-task', (_, title) => {
    const tasks = store.get('tasks');
    const now = Date.now();
    tasks.push({ id: now, createdAt: now, title, done: false });
    store.set('tasks', tasks);
    afterTaskChange();
    return tasks;
  });

  ipcMain.handle('toggle-task', (_, id) => {
    const tasks = store.get('tasks');
    const task = tasks.find(t => t.id === id);
    if (task) {
      task.done = !task.done;
      // Completing a task is the "you made progress" signal — perks the flower up.
      if (task.done) {
        task.completedAt = Date.now();
        store.set('lastCompletedAt', task.completedAt);
      }
    }
    store.set('tasks', tasks);
    afterTaskChange();
    return tasks;
  });

  ipcMain.handle('snooze-task', (_, id) => {
    const tasks = store.get('tasks');
    const task = tasks.find(t => t.id === id);
    // Reset this task's neglect clock — signals "I'm still on it" without completing it.
    if (task && !task.done) task.snoozedAt = Date.now();
    store.set('tasks', tasks);
    afterTaskChange();
    return tasks;
  });

  ipcMain.handle('delete-task', (_, id) => {
    let tasks = store.get('tasks');
    tasks = tasks.filter(t => t.id !== id);
    store.set('tasks', tasks);
    afterTaskChange();
    return tasks;
  });

  ipcMain.handle('reorder-tasks', (_, newOrder) => {
    store.set('tasks', newOrder);
    afterTaskChange();
    return newOrder;
  });
}

function afterTaskChange() {
  pushFlowerState();
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.webContents.send('tasks-update', store.get('tasks'));
  }
}

app.whenReady().then(async () => {
  // In dev the build icon doesn't apply, so set the dock icon at runtime (macOS)
  if (process.platform === 'darwin' && app.dock) {
    const img = nativeImage.createFromPath(ICON_PATH);
    if (!img.isEmpty()) app.dock.setIcon(img);
  }
  await initStore();
  registerIPC();
  await createFlowerWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!flowerWindow || flowerWindow.isDestroyed()) createFlowerWindow();
});
