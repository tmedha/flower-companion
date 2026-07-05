const taskList    = document.getElementById('task-list');
const emptyState  = document.getElementById('empty-state');
const progressBar = document.getElementById('progress-bar');
const progressLbl = document.getElementById('progress-label');
const addForm     = document.getElementById('add-form');
const taskInput   = document.getElementById('task-input');

let tasks = [];

// A snooze resets a task's neglect clock, keeping it from counting toward
// wilting for about a day (matches the first wilt threshold in main.js). Show
// the "Snoozed" tag for that window.
const DAY_MS = 24 * 60 * 60 * 1000;
const isSnoozed = (task) =>
  !task.done && task.snoozedAt && (Date.now() - task.snoozedAt) < DAY_MS;

function render(newTasks) {
  tasks = newTasks;
  taskList.innerHTML = '';

  const done  = tasks.filter(t => t.done).length;
  const total = tasks.length;
  const pct   = total ? Math.round((done / total) * 100) : 0;

  progressLbl.textContent = `${done} / ${total}`;
  progressBar.style.width = `${pct}%`;
  progressBar.classList.toggle('complete', total > 0 && done === total);

  emptyState.style.display = tasks.length === 0 ? 'block' : 'none';

  tasks.forEach(task => {
    const li = document.createElement('li');
    li.className = 'task-item';
    li.dataset.id = task.id;

    const check = document.createElement('div');
    check.className = 'task-check' + (task.done ? ' checked' : '');
    check.title = task.done ? 'Mark incomplete' : 'Mark complete';

    const label = document.createElement('span');
    label.className = 'task-label' + (task.done ? ' done' : '');
    label.textContent = task.title;

    const actions = document.createElement('div');
    actions.className = 'task-actions';

    // Snooze ("I'm working on this") — only meaningful for unfinished tasks.
    // Resets the task's neglect clock so a long task doesn't wilt the flower.
    if (!task.done) {
      const snooze = document.createElement('button');
      snooze.className = 'task-btn task-snooze';
      snooze.title = "Snooze — I'm working on this";
      snooze.innerHTML =
        '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" ' +
        'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
        'stroke-linejoin="round"><circle cx="12" cy="13" r="8"/>' +
        '<path d="M12 9v4l2.5 1.5M5 3 2 6M22 6l-3-3"/></svg>';
      snooze.addEventListener('click', () => snoozeTask(task.id));
      actions.appendChild(snooze);
    }

    const del = document.createElement('button');
    del.className = 'task-btn task-delete';
    del.title = 'Delete task';
    del.textContent = '×';

    check.addEventListener('click', () => toggle(task.id));
    label.addEventListener('click', () => toggle(task.id));
    del.addEventListener('click', () => remove(task.id));
    actions.appendChild(del);

    li.append(check, label);

    // Little indicator that this task is currently snoozed (not wilting the flower).
    if (isSnoozed(task)) {
      const badge = document.createElement('span');
      badge.className = 'task-snoozed';
      badge.title = "Snoozed — not counting toward wilting right now";
      badge.innerHTML =
        '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" ' +
        'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
        'stroke-linejoin="round"><circle cx="12" cy="13" r="8"/>' +
        '<path d="M12 9v4l2.5 1.5M5 3 2 6M22 6l-3-3"/></svg>Snoozed';
      li.append(badge);
    }

    li.append(actions);
    taskList.appendChild(li);
  });
}

async function toggle(id) {
  const updated = await window.api.toggleTask(id);
  render(updated);
}

async function remove(id) {
  const updated = await window.api.deleteTask(id);
  render(updated);
}

async function snoozeTask(id) {
  const updated = await window.api.snoozeTask(id);
  render(updated);
}

addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = taskInput.value.trim();
  if (!title) return;
  taskInput.value = '';
  const updated = await window.api.addTask(title);
  render(updated);
});

// Receive live updates from main (e.g. when another source changes tasks)
window.api.onTasksUpdate((newTasks) => render(newTasks));

// Initial load
window.api.getTasks().then(render);
