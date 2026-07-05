const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Flower window
  openPanel: () => ipcRenderer.send('open-panel'),
  onFlowerState: (cb) => ipcRenderer.on('flower-state', (_, data) => cb(data)),
  moveWindow: (x, y) => ipcRenderer.send('move-window', { x, y }),
  getWindowPosition: () => ipcRenderer.invoke('get-window-position'),
  resizeWindow: (width, height) => ipcRenderer.send('resize-window', { width, height }),
  getWindowSize: () => ipcRenderer.invoke('get-window-size'),

  // Panel window
  getTasks: () => ipcRenderer.invoke('get-tasks'),
  addTask: (title) => ipcRenderer.invoke('add-task', title),
  toggleTask: (id) => ipcRenderer.invoke('toggle-task', id),
  snoozeTask: (id) => ipcRenderer.invoke('snooze-task', id),
  deleteTask: (id) => ipcRenderer.invoke('delete-task', id),
  reorderTasks: (tasks) => ipcRenderer.invoke('reorder-tasks', tasks),
  onTasksUpdate: (cb) => ipcRenderer.on('tasks-update', (_, tasks) => cb(tasks)),
});
