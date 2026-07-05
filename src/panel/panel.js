const taskList    = document.getElementById('task-list');
const emptyState  = document.getElementById('empty-state');
const progressBar = document.getElementById('progress-bar');
const progressLbl = document.getElementById('progress-label');
const addForm     = document.getElementById('add-form');
const taskInput   = document.getElementById('task-input');

let tasks = [];

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

    const del = document.createElement('button');
    del.className = 'task-delete';
    del.title = 'Delete task';
    del.textContent = '×';

    check.addEventListener('click', () => toggle(task.id));
    label.addEventListener('click', () => toggle(task.id));
    del.addEventListener('click', () => remove(task.id));

    li.append(check, label, del);
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
