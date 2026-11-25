// app.js - ErrandLoop UI: routing, pages, outings, settings.
// All user text is placed with textContent, never innerHTML.
import { Store, CATEGORIES, PRIORITIES, newId } from './storage.js';
import { todayStr, isOverdue, isDueToday, dueLabel, formatDate, isValidDateStr } from './date-utils.js';
import { validateBackup, buildBackup, buildCsv, downloadFile } from './backup.js';

const store = new Store();
const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 };
const NO_DESTINATION = 'No destination';

const view = document.getElementById('view');
const toastEl = document.getElementById('toast');
const modalRoot = document.getElementById('modal-root');
let toastTimer = null;

// ---------- small DOM helpers ----------
function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'dataset') {
        for (const [dataKey, dataValue] of Object.entries(value)) node.dataset[dataKey] = dataValue;
      } else if (key.startsWith('aria-') || key === 'role' || key === 'type' || key === 'for') {
        node.setAttribute(key, value);
      } else if (key === 'style') {
        node.style.cssText = value;
      } else {
        try { node[key] = value; } catch (ignored) { node.setAttribute(key, value); }
      }
    }
  }
  if (children) {
    for (const child of children) {
      if (child === null || child === undefined) continue;
      node.append(child);
    }
  }
  return node;
}

function icon(name) {
  const paths = {
    dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="3.5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="3.5" cy="18" r="1" fill="currentColor" stroke="none"/>',
    pin: '<path d="M12 21s-7-5.5-7-11a7 7 0 1 1 14 0c0 5.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.4a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.23.6.86 1 1.55 1H21a2 2 0 1 1 0 4h-.09c-.69 0-1.32.4-1.51 1z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    edit: '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    up: '<path d="M18 15l-6-6-6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
  };
  const span = document.createElement('span');
  span.className = 'icon';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (paths[name] || '') + '</svg>';
  return span;
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3000);
}

// ---------- modal ----------
let lastFocused = null;
function openModal(title, bodyNode, actions) {
  lastFocused = document.activeElement;
  modalRoot.replaceChildren();
  const overlay = el('div', { class: 'modal-overlay' });
  const dialog = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' });
  const heading = el('h2', { text: title });
  const closeBtn = el('button', { class: 'btn btn-ghost modal-close', 'aria-label': 'Close dialog', type: 'button' }, [icon('x')]);
  closeBtn.addEventListener('click', closeModal);
  dialog.append(heading, closeBtn, bodyNode);
  if (actions && actions.length > 0) {
    const row = el('div', { class: 'modal-actions' });
    for (const action of actions) {
      const btn = el('button', { class: 'btn ' + (action.kind || 'btn-secondary'), type: 'button', text: action.label });
      if (action.testid) btn.dataset.testid = action.testid;
      btn.addEventListener('click', () => action.onClick());
      row.append(btn);
    }
    dialog.append(row);
  }
  overlay.append(dialog);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) closeModal(); });
  modalRoot.append(overlay);
  const first = dialog.querySelector('input, select, textarea, button:not(.modal-close)') || closeBtn;
  first.focus();
}

function closeModal() {
  modalRoot.replaceChildren();
  if (lastFocused && lastFocused.focus) lastFocused.focus();
}

function openConfirm(title, message, confirmLabel, onConfirm) {
  const body = el('div', {}, [el('p', { text: message })]);
  openModal(title, body, [
    { label: 'Cancel', kind: 'btn-secondary', onClick: closeModal },
    { label: confirmLabel, kind: 'btn-danger', testid: 'confirm-action', onClick: () => { closeModal(); onConfirm(); } },
  ]);
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && modalRoot.firstChild) closeModal();
});

// ---------- theme ----------
function applyTheme() {
  const setting = store.settings.theme;
  let theme = setting;
  if (setting === 'system') {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = theme;
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (store.settings.theme === 'system') applyTheme();
});

// ---------- data helpers ----------
function getErrand(id) {
  return store.errands.find((item) => item.id === id);
}

function allDestinations() {
  const names = new Set(store.destinations);
  for (const item of store.errands) {
    if (item.destination) names.add(item.destination);
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

function saveAndRender() {
  store.save();
  render();
}

function completeErrand(item) {
  item.status = 'completed';
  item.completedAt = Date.now();
}

function reopenErrand(item) {
  item.status = 'pending';
  item.completedAt = null;
}

function toggleErrandStatus(item) {
  if (item.status === 'pending') completeErrand(item);
  else reopenErrand(item);
  store.save();
  render();
}

function deleteErrand(item) {
  openConfirm('Delete errand', 'Delete "' + item.title + '"? This cannot be undone.', 'Delete', () => {
    store.state.errands = store.errands.filter((entry) => entry.id !== item.id);
    for (const outing of store.outings) {
      if (outing.status !== 'active') continue;
      outing.errandIds = outing.errandIds.filter((id) => id !== item.id);
      if (outing.errandIds.length === 0) outing.status = 'cancelled';
    }
    saveAndRender();
    showToast('Errand deleted');
  });
}

// ---------- errand card ----------
function priorityBadge(priority) {
  const badge = el('span', { class: 'badge badge-' + priority.toLowerCase(), text: priority + ' priority' });
  return badge;
}

function errandCard(item, options) {
  const today = todayStr();
  const overdue = isOverdue(item, today);
  const card = el('article', { class: 'card errand-card' + (overdue ? ' is-overdue' : '') });
  const head = el('div', { class: 'errand-head' });
  const title = el('h3', { text: item.title });
  head.append(title, priorityBadge(item.priority));
  card.append(head);

  const meta = el('div', { class: 'errand-meta' });
  meta.append(el('span', { class: 'meta-chip', text: item.category }));
  if (item.destination) meta.append(el('span', { class: 'meta-chip', text: item.destination }));
  if (item.dueDate) {
    meta.append(el('span', { class: 'meta-chip' + (overdue ? ' chip-overdue' : ''), text: dueLabel(item.dueDate, today) + ' (' + formatDate(item.dueDate) + ')' }));
  }
  if (item.durationMin) {
    meta.append(el('span', { class: 'meta-chip', text: 'About ' + item.durationMin + ' min' }));
  }
  if (item.status === 'completed') meta.append(el('span', { class: 'meta-chip chip-done', text: 'Completed' }));
  card.append(meta);

  if (item.notes) card.append(el('p', { class: 'errand-notes', text: item.notes }));

  const actions = el('div', { class: 'card-actions' });
  const toggleBtn = el('button', { class: 'btn btn-primary', type: 'button', text: item.status === 'pending' ? 'Mark complete' : 'Reopen' });
  toggleBtn.addEventListener('click', () => toggleErrandStatus(item));
  actions.append(toggleBtn);
  if (!options || options.edit !== false) {
    const editBtn = el('button', { class: 'btn btn-secondary', type: 'button', text: 'Edit' });
    editBtn.addEventListener('click', () => openErrandForm(item));
    actions.append(editBtn);
  }
  if (!options || options.remove !== false) {
    const deleteBtn = el('button', { class: 'btn btn-danger-outline', type: 'button', text: 'Delete' });
    deleteBtn.addEventListener('click', () => deleteErrand(item));
    actions.append(deleteBtn);
  }
  card.append(actions);
  return card;
}

// ---------- errand form ----------
function openErrandForm(existing) {
  const isEdit = Boolean(existing);
  const form = el('form', { class: 'form', novalidate: true });
  const errorsBox = el('div', { class: 'form-errors', role: 'alert' });
  errorsBox.hidden = true;
  form.append(errorsBox);

  function field(labelText, input, hint) {
    const wrap = el('div', { class: 'field' });
    const label = el('label', { text: labelText });
    wrap.append(label, input);
    if (hint) wrap.append(el('p', { class: 'hint', text: hint }));
    return wrap;
  }

  const titleInput = el('input', { type: 'text', required: true, maxLength: 100 });
  titleInput.dataset.testid = 'errand-title';
  if (existing) titleInput.value = existing.title;

  const destinationInput = el('input', { type: 'text', maxLength: 100, list: 'destination-list' });
  destinationInput.dataset.testid = 'errand-destination';
  if (existing) destinationInput.value = existing.destination || '';
  const dataList = el('datalist', { id: 'destination-list' });
  for (const name of allDestinations()) {
    const option = document.createElement('option');
    option.value = name;
    dataList.append(option);
  }

  const categorySelect = el('select', {});
  categorySelect.dataset.testid = 'errand-category';
  for (const category of CATEGORIES) {
    const option = el('option', { value: category, text: category });
    categorySelect.append(option);
  }
  if (existing) categorySelect.value = existing.category;

  const prioritySelect = el('select', {});
  prioritySelect.dataset.testid = 'errand-priority';
  for (const priority of PRIORITIES) {
    const option = el('option', { value: priority, text: priority });
    prioritySelect.append(option);
  }
  if (existing) prioritySelect.value = existing.priority;

  const dueInput = el('input', { type: 'date' });
  dueInput.dataset.testid = 'errand-due';
  if (existing && existing.dueDate) dueInput.value = existing.dueDate;

  const durationInput = el('input', { type: 'number', min: 1, max: 1440, step: 1, placeholder: 'e.g. 30' });
  durationInput.dataset.testid = 'errand-duration';
  if (existing && existing.durationMin) durationInput.value = String(existing.durationMin);

  const notesInput = el('textarea', { rows: 3, maxLength: 500 });
  notesInput.dataset.testid = 'errand-notes';
  if (existing) notesInput.value = existing.notes || '';

  form.append(
    field('Title', titleInput, '2 to 100 characters.'),
    field('Destination (optional)', destinationInput, 'Type a place, or pick a saved destination.'),
    field('Category', categorySelect),
    field('Priority', prioritySelect),
    field('Due date (optional)', dueInput),
    field('Estimated duration in minutes (optional)', durationInput),
    field('Notes (optional)', notesInput, 'At most 500 characters.'),
    dataList
  );

  const saveBtn = el('button', { class: 'btn btn-primary', type: 'submit', text: isEdit ? 'Save changes' : 'Add errand' });
  saveBtn.dataset.testid = 'save-errand';
  const cancelBtn = el('button', { class: 'btn btn-secondary', type: 'button', text: 'Cancel' });
  cancelBtn.addEventListener('click', closeModal);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const title = titleInput.value.trim();
    const destination = destinationInput.value.trim();
    const notes = notesInput.value.trim();
    const durationRaw = durationInput.value.trim();
    const dueRaw = dueInput.value;
    const errors = [];
    if (title.length < 2 || title.length > 100) errors.push('Title must be 2 to 100 characters.');
    if (notes.length > 500) errors.push('Notes must be at most 500 characters.');
    if (destination.length > 100) errors.push('Destination must be at most 100 characters.');
    let durationMin = null;
    if (durationRaw !== '') {
      durationMin = Number(durationRaw);
      if (!Number.isInteger(durationMin) || durationMin < 1 || durationMin > 1440) {
        errors.push('Duration must be a whole number from 1 to 1440 minutes.');
      }
    }
    if (dueRaw !== '' && !isValidDateStr(dueRaw)) errors.push('Due date is not a valid date.');
    if (errors.length > 0) {
      errorsBox.replaceChildren();
      const list = el('ul', {});
      for (const message of errors) list.append(el('li', { text: message }));
      errorsBox.append(list);
      errorsBox.hidden = false;
      return;
    }
    if (isEdit) {
      existing.title = title;
      existing.destination = destination;
      existing.category = categorySelect.value;
      existing.priority = prioritySelect.value;
      existing.dueDate = dueRaw === '' ? null : dueRaw;
      existing.durationMin = durationMin;
      existing.notes = notes;
      showToast('Errand updated');
    } else {
      store.state.errands.push({
        id: newId(),
        title,
        destination,
        category: categorySelect.value,
        priority: prioritySelect.value,
        dueDate: dueRaw === '' ? null : dueRaw,
        durationMin,
        notes,
        status: 'pending',
        createdAt: Date.now(),
        completedAt: null,
      });
      showToast('Errand added');
    }
    closeModal();
    saveAndRender();
  });

  openModal(isEdit ? 'Edit errand' : 'Add errand', form, []);
  // Replace the default empty action row with form buttons inside the form.
  const actionsRow = el('div', { class: 'modal-actions' }, [cancelBtn, saveBtn]);
  form.append(actionsRow);
}

// ---------- pages ----------
function pageHeader(title, subtitle) {
  const header = el('header', { class: 'page-header' });
  header.append(el('h1', { text: title }));
  if (subtitle) header.append(el('p', { class: 'page-subtitle', text: subtitle }));
  return header;
}

function emptyState(message, buttonLabel, testid, onClick) {
  const box = el('div', { class: 'empty-state' });
  box.append(el('p', { text: message }));
  if (buttonLabel) {
    const btn = el('button', { class: 'btn btn-primary', type: 'button', text: buttonLabel });
    if (testid) btn.dataset.testid = testid;
    btn.addEventListener('click', onClick);
    box.append(btn);
  }
  return box;
}

function statCard(label, value, testid) {
  const card = el('div', { class: 'card stat-card' });
  const valueEl = el('p', { class: 'stat-value', text: String(value) });
  if (testid) valueEl.dataset.testid = testid;
  card.append(valueEl, el('p', { class: 'stat-label', text: label }));
  return card;
}

function renderDashboard() {
  const today = todayStr();
  const errands = store.errands;
  const pending = errands.filter((item) => item.status === 'pending');
  const completed = errands.filter((item) => item.status === 'completed');
  const dueToday = pending.filter((item) => isDueToday(item, today));
  const overdue = pending.filter((item) => isOverdue(item, today));

  view.append(pageHeader('ErrandLoop', 'Plan your stops. Get things done.'));

  const stats = el('section', { class: 'stats-grid', 'aria-label': 'Errand totals' });
  stats.append(
    statCard('Total errands', errands.length, 'stat-total'),
    statCard('Pending', pending.length, 'stat-pending'),
    statCard('Due today', dueToday.length, 'stat-due-today'),
    statCard('Completed', completed.length, 'stat-completed')
  );
  view.append(stats);

  if (errands.length === 0) {
    view.append(emptyState(
      'No errands yet. Add your first errand to start planning your stops.',
      'Add Your First Errand', 'add-first-errand', () => openErrandForm(null)
    ));
    return;
  }

  // Attention: high-priority pending errands, overdue first.
  const attention = pending
    .filter((item) => item.priority === 'High')
    .sort((a, b) => {
      const aOver = isOverdue(a, today) ? 0 : 1;
      const bOver = isOverdue(b, today) ? 0 : 1;
      if (aOver !== bOver) return aOver - bOver;
      if (a.dueDate && b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return b.createdAt - a.createdAt;
    })
    .slice(0, 5);
  const attentionSection = el('section', { class: 'section' });
  attentionSection.append(el('h2', { text: 'Needs attention' }));
  if (attention.length === 0) {
    attentionSection.append(el('p', { class: 'muted', text: 'No high-priority errands pending.' }));
  } else {
    const list = el('div', { class: 'card-list' });
    for (const item of attention) list.append(errandCard(item));
    attentionSection.append(list);
  }
  view.append(attentionSection);

  // Upcoming errands grouped by destination.
  const upcoming = pending
    .filter((item) => item.dueDate)
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]));
  const upcomingSection = el('section', { class: 'section' });
  upcomingSection.append(el('h2', { text: 'Upcoming by destination' }));
  if (upcoming.length === 0) {
    upcomingSection.append(el('p', { class: 'muted', text: 'No upcoming errands with a due date.' }));
  } else {
    const groups = new Map();
    for (const item of upcoming) {
      const key = item.destination || NO_DESTINATION;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    for (const [destination, items] of groups) {
      const group = el('div', { class: 'card group-card' });
      group.append(el('h3', { text: destination }));
      const list = el('div', { class: 'card-list' });
      for (const item of items) list.append(errandCard(item));
      group.append(list);
      upcomingSection.append(group);
    }
  }
  view.append(upcomingSection);

  // Recently completed.
  const recent = completed
    .slice()
    .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))
    .slice(0, 5);
  const recentSection = el('section', { class: 'section' });
  recentSection.append(el('h2', { text: 'Recently completed' }));
  if (recent.length === 0) {
    recentSection.append(el('p', { class: 'muted', text: 'Nothing completed yet.' }));
  } else {
    const list = el('div', { class: 'card-list' });
    for (const item of recent) list.append(errandCard(item));
    recentSection.append(list);
  }
  view.append(recentSection);
}

// ---------- My Errands ----------
const errandsView = { search: '', priority: '', category: '', destination: '', status: '', sort: 'due' };

function filteredErrands() {
  const today = todayStr();
  const query = errandsView.search.trim().toLowerCase();
  let items = store.errands.slice();
  if (query) {
    items = items.filter((item) =>
      item.title.toLowerCase().includes(query) ||
      (item.destination || '').toLowerCase().includes(query) ||
      (item.notes || '').toLowerCase().includes(query));
  }
  if (errandsView.priority) items = items.filter((item) => item.priority === errandsView.priority);
  if (errandsView.category) items = items.filter((item) => item.category === errandsView.category);
  if (errandsView.destination) {
    items = items.filter((item) => (item.destination || NO_DESTINATION) === errandsView.destination);
  }
  if (errandsView.status) items = items.filter((item) => item.status === errandsView.status);
  const sort = errandsView.sort;
  items.sort((a, b) => {
    if (sort === 'due') {
      if (a.dueDate && b.dueDate) return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return b.createdAt - a.createdAt;
    }
    if (sort === 'priority') {
      if (PRIORITY_RANK[a.priority] !== PRIORITY_RANK[b.priority]) return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      return b.createdAt - a.createdAt;
    }
    if (sort === 'recent') return b.createdAt - a.createdAt;
    return a.title.localeCompare(b.title);
  });
  return items;
}

function renderErrandList(container) {
  container.replaceChildren();
  const items = filteredErrands();
  const count = el('p', { class: 'result-count', text: items.length + (items.length === 1 ? ' errand' : ' errands') });
  count.dataset.testid = 'errand-count';
  container.append(count);
  if (items.length === 0) {
    container.append(emptyState(
      store.errands.length === 0 ? 'No errands yet. Add one to get started.' : 'No errands match these filters.',
      store.errands.length === 0 ? 'Add errand' : null, 'add-errand-empty', () => openErrandForm(null)
    ));
    return;
  }
  const list = el('div', { class: 'card-list' });
  list.dataset.testid = 'errand-results';
  for (const item of items) list.append(errandCard(item));
  container.append(list);
}

function renderErrandsPage() {
  view.append(pageHeader('My Errands', 'Add, find, and finish your errands.'));

  const toolbar = el('div', { class: 'toolbar card' });
  const searchInput = el('input', { type: 'search', placeholder: 'Search title, destination, or notes', 'aria-label': 'Search errands' });
  searchInput.dataset.testid = 'search-errands';
  searchInput.value = errandsView.search;
  searchInput.addEventListener('input', () => { errandsView.search = searchInput.value; renderErrandList(results); });

  function selectFilter(testid, label, options, current, onChange) {
    const wrap = el('div', { class: 'field inline-field' });
    const labelEl = el('label', { text: label });
    const select = el('select', {});
    select.dataset.testid = testid;
    select.setAttribute('aria-label', label);
    select.append(el('option', { value: '', text: 'All' }));
    for (const option of options) select.append(el('option', { value: option, text: option }));
    select.value = current;
    select.addEventListener('change', () => { onChange(select.value); renderErrandList(results); });
    wrap.append(labelEl, select);
    return wrap;
  }

  const destinations = allDestinations();
  destinations.unshift(NO_DESTINATION);
  const sortSelect = el('select', {});
  sortSelect.dataset.testid = 'sort-errands';
  sortSelect.setAttribute('aria-label', 'Sort errands');
  for (const [value, label] of [['due', 'Due date'], ['priority', 'Priority'], ['recent', 'Recently added'], ['alpha', 'Alphabetical']]) {
    sortSelect.append(el('option', { value, text: label }));
  }
  sortSelect.value = errandsView.sort;
  sortSelect.addEventListener('change', () => { errandsView.sort = sortSelect.value; renderErrandList(results); });
  const sortWrap = el('div', { class: 'field inline-field' });
  sortWrap.append(el('label', { text: 'Sort by' }), sortSelect);

  const addBtn = el('button', { class: 'btn btn-primary', type: 'button', text: 'Add errand' });
  addBtn.dataset.testid = 'add-errand';
  addBtn.addEventListener('click', () => openErrandForm(null));

  const filters = el('div', { class: 'filters' });
  filters.append(
    selectFilter('filter-priority', 'Priority', PRIORITIES, errandsView.priority, (value) => { errandsView.priority = value; }),
    selectFilter('filter-category', 'Category', CATEGORIES, errandsView.category, (value) => { errandsView.category = value; }),
    selectFilter('filter-destination', 'Destination', destinations, errandsView.destination, (value) => { errandsView.destination = value; }),
    selectFilter('filter-status', 'Status', ['pending', 'completed'], errandsView.status, (value) => { errandsView.status = value; }),
    sortWrap
  );
  toolbar.append(searchInput, filters, addBtn);
  view.append(toolbar);

  const results = el('div', { class: 'results' });
  view.append(results);
  renderErrandList(results);
}

// ---------- Trip Planner ----------
function outingProgress(outing) {
  const done = outing.errandIds.filter((id) => {
    const item = getErrand(id);
    return item && item.status === 'completed';
  }).length;
  return { done, total: outing.errandIds.length };
}

function outingTotalMinutes(outing) {
  let total = 0;
  let known = false;
  for (const id of outing.errandIds) {
    const item = getErrand(id);
    if (item && item.durationMin) { total += item.durationMin; known = true; }
  }
  return known ? total : null;
}

function refreshOutingStatus(outing) {
  const progress = outingProgress(outing);
  if (outing.status === 'cancelled') return;
  if (progress.total > 0 && progress.done === progress.total) {
    if (outing.status !== 'done') { outing.status = 'done'; outing.completedAt = Date.now(); }
  } else if (outing.status === 'done') {
    outing.status = 'active';
    outing.completedAt = null;
  }
}

function toggleStop(outing, errandId, checked) {
  const item = getErrand(errandId);
  if (!item) return;
  if (checked) completeErrand(item);
  else reopenErrand(item);
  refreshOutingStatus(outing);
  store.save();
  render();
}

function moveStop(outing, index, direction) {
  const target = index + direction;
  if (target < 0 || target >= outing.errandIds.length) return;
  const ids = outing.errandIds;
  const temp = ids[index];
  ids[index] = ids[target];
  ids[target] = temp;
  store.save();
  render();
}

function cancelOuting(outing) {
  openConfirm('Cancel outing', 'Cancel this outing? Its errands stay on your list.', 'Cancel outing', () => {
    outing.status = 'cancelled';
    saveAndRender();
    showToast('Outing cancelled');
  });
}

function outingCard(outing) {
  const progress = outingProgress(outing);
  const totalMinutes = outingTotalMinutes(outing);
  const percent = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);
  const card = el('article', { class: 'card outing-card' });
  card.dataset.testid = 'outing-card';
  const head = el('div', { class: 'outing-head' });
  head.append(el('h3', { text: outing.destination || NO_DESTINATION }));
  const statusLabel = outing.status === 'done' ? 'Done' : outing.status === 'cancelled' ? 'Cancelled' : 'Active';
  head.append(el('span', { class: 'badge badge-' + outing.status, text: statusLabel }));
  card.append(head);

  const summary = el('p', { class: 'muted', text: progress.done + ' of ' + progress.total + ' stops done (' + percent + '%)' + (totalMinutes !== null ? ' - about ' + totalMinutes + ' min total' : '') });
  summary.dataset.testid = 'outing-progress';
  card.append(summary);
  const bar = el('div', { class: 'progress', role: 'progressbar', 'aria-valuenow': String(percent), 'aria-valuemin': '0', 'aria-valuemax': '100' });
  bar.append(el('div', { class: 'progress-fill', style: 'width: ' + percent + '%' }));
  card.append(bar);

  const stops = el('ol', { class: 'stops' });
  stops.dataset.testid = 'outing-stops';
  outing.errandIds.forEach((id, index) => {
    const item = getErrand(id);
    if (!item) return;
    const li = el('li', { class: 'stop' + (item.status === 'completed' ? ' is-done' : '') });
    const check = el('input', { type: 'checkbox', 'aria-label': 'Mark ' + item.title + ' complete' });
    check.checked = item.status === 'completed';
    check.disabled = outing.status === 'cancelled';
    check.addEventListener('change', () => toggleStop(outing, id, check.checked));
    const label = el('span', { class: 'stop-title', text: item.title });
    const meta = el('span', { class: 'stop-meta', text: (item.durationMin ? item.durationMin + ' min' : '') + (item.dueDate ? ' - ' + dueLabel(item.dueDate, todayStr()) : '') });
    const moveUp = el('button', { class: 'btn btn-icon', type: 'button', 'aria-label': 'Move ' + item.title + ' up' }, [icon('up')]);
    moveUp.disabled = index === 0 || outing.status !== 'active';
    moveUp.addEventListener('click', () => moveStop(outing, index, -1));
    const moveDown = el('button', { class: 'btn btn-icon', type: 'button', 'aria-label': 'Move ' + item.title + ' down' }, [icon('down')]);
    moveDown.disabled = index === outing.errandIds.length - 1 || outing.status !== 'active';
    moveDown.addEventListener('click', () => moveStop(outing, index, 1));
    li.append(check, label, meta, moveUp, moveDown);
    stops.append(li);
  });
  card.append(stops);

  if (outing.status === 'active') {
    const actions = el('div', { class: 'card-actions' });
    const cancelBtn = el('button', { class: 'btn btn-danger-outline', type: 'button', text: 'Cancel outing' });
    cancelBtn.addEventListener('click', () => cancelOuting(outing));
    actions.append(cancelBtn);
    card.append(actions);
  }
  return card;
}

function renderPlannerPage() {
  view.append(pageHeader('Trip Planner', 'Group pending errands by destination and plan one outing at a time.'));
  const today = todayStr();
  const pending = store.errands.filter((item) => item.status === 'pending');

  const activeOutings = store.outings.filter((outing) => outing.status === 'active' || outing.status === 'done');
  if (activeOutings.length > 0) {
    const section = el('section', { class: 'section' });
    section.append(el('h2', { text: 'Your outings' }));
    const list = el('div', { class: 'card-list' });
    for (const outing of activeOutings) list.append(outingCard(outing));
    section.append(list);
    view.append(section);
  }

  const planSection = el('section', { class: 'section' });
  planSection.append(el('h2', { text: 'Plan a new outing' }));
  if (pending.length === 0) {
    planSection.append(emptyState(
      'No pending errands to plan around.',
      'Add errand', 'add-errand-planner', () => openErrandForm(null)
    ));
    view.append(planSection);
  } else {
    const groups = new Map();
    for (const item of pending) {
      const key = item.destination || NO_DESTINATION;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    const sortedGroups = Array.from(groups.entries()).sort((a, b) => {
      const aDate = a[1].map((item) => item.dueDate || '9999').sort()[0];
      const bDate = b[1].map((item) => item.dueDate || '9999').sort()[0];
      return aDate < bDate ? -1 : aDate > bDate ? 1 : a[0].localeCompare(b[0]);
    });
    for (const [destination, items] of sortedGroups) {
      const group = el('div', { class: 'card group-card' });
      group.dataset.testid = 'planner-group';
      const head = el('div', { class: 'group-head' });
      head.append(el('h3', { text: destination }));
      head.append(el('span', { class: 'muted', text: items.length + (items.length === 1 ? ' errand' : ' errands') }));
      group.append(head);
      const list = el('div', { class: 'check-list' });
      const selected = new Set();
      for (const item of items) {
        const row = el('label', { class: 'check-row' });
        const check = el('input', { type: 'checkbox' });
        check.dataset.testid = 'outing-select';
        check.addEventListener('change', () => {
          if (check.checked) selected.add(item.id);
          else selected.delete(item.id);
          startBtn.disabled = selected.size === 0;
          countEl.textContent = selected.size === 0 ? '' : selected.size + ' selected';
        });
        const title = el('span', { class: 'check-title', text: item.title });
        const meta = el('span', { class: 'check-meta', text: item.priority + (item.dueDate ? ' - ' + dueLabel(item.dueDate, today) : '') + (item.durationMin ? ' - ' + item.durationMin + ' min' : '') });
        row.append(check, title, meta);
        list.append(row);
      }
      group.append(list);
      const footer = el('div', { class: 'group-footer' });
      const countEl = el('span', { class: 'muted', text: '' });
      const startBtn = el('button', { class: 'btn btn-primary', type: 'button', text: 'Start outing with selected' });
      startBtn.dataset.testid = 'start-outing';
      startBtn.disabled = true;
      startBtn.addEventListener('click', () => {
        if (selected.size === 0) return;
        store.state.outings.unshift({
          id: newId(),
          destination,
          errandIds: Array.from(selected),
          status: 'active',
          createdAt: Date.now(),
          completedAt: null,
        });
        saveAndRender();
        showToast('Outing started for ' + destination);
      });
      footer.append(countEl, startBtn);
      group.append(footer);
      planSection.append(group);
    }
    view.append(planSection);
  }

  const past = store.outings.filter((outing) => outing.status === 'cancelled');
  if (past.length > 0) {
    const section = el('section', { class: 'section' });
    section.append(el('h2', { text: 'Past outings' }));
    const list = el('div', { class: 'card-list' });
    for (const outing of past) list.append(outingCard(outing));
    section.append(list);
    view.append(section);
  }
}

// ---------- Settings ----------
function renderSettingsPage() {
  view.append(pageHeader('Settings', 'Destinations, theme, backups, and your data.'));

  // Destinations
  const destSection = el('section', { class: 'section card settings-card' });
  destSection.append(el('h2', { text: 'Destinations' }));
  destSection.append(el('p', { class: 'muted', text: 'Saved destinations appear as suggestions when you add an errand. Deleting one never deletes its errands.' }));
  const destList = el('ul', { class: 'dest-list' });
  destList.dataset.testid = 'destination-list-display';
  if (store.destinations.length === 0) {
    destList.append(el('li', { class: 'muted', text: 'No saved destinations yet.' }));
  }
  for (const name of store.destinations) {
    const row = el('li', { class: 'dest-row' });
    row.append(el('span', { text: name }));
    const delBtn = el('button', { class: 'btn btn-danger-outline btn-small', type: 'button', text: 'Delete' });
    delBtn.dataset.testid = 'delete-destination';
    delBtn.addEventListener('click', () => {
      openConfirm('Delete destination', 'Delete "' + name + '"? Errands with this destination keep their destination text.', 'Delete', () => {
        store.state.destinations = store.destinations.filter((entry) => entry !== name);
        saveAndRender();
        showToast('Destination deleted');
      });
    });
    row.append(delBtn);
    destList.append(row);
  }
  destSection.append(destList);
  const destForm = el('div', { class: 'inline-form' });
  const destInput = el('input', { type: 'text', placeholder: 'Add a destination', 'aria-label': 'New destination name', maxLength: 100 });
  destInput.dataset.testid = 'new-destination';
  const destAdd = el('button', { class: 'btn btn-secondary', type: 'button', text: 'Add destination' });
  destAdd.dataset.testid = 'add-destination';
  const addDestination = () => {
    const name = destInput.value.trim();
    if (name.length === 0) { showToast('Type a destination name first'); return; }
    if (store.destinations.includes(name)) { showToast('That destination is already saved'); return; }
    store.state.destinations.push(name);
    store.state.destinations.sort((a, b) => a.localeCompare(b));
    saveAndRender();
    showToast('Destination added');
  };
  destAdd.addEventListener('click', addDestination);
  destInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') addDestination(); });
  destForm.append(destInput, destAdd);
  destSection.append(destForm);
  view.append(destSection);

  // Theme
  const themeSection = el('section', { class: 'section card settings-card' });
  themeSection.append(el('h2', { text: 'Theme' }));
  const themeRow = el('div', { class: 'theme-row', role: 'group', 'aria-label': 'Theme' });
  for (const theme of ['light', 'dark', 'system']) {
    const btn = el('button', { class: 'btn ' + (store.settings.theme === theme ? 'btn-primary' : 'btn-secondary'), type: 'button', text: theme[0].toUpperCase() + theme.slice(1) });
    btn.dataset.testid = 'theme-' + theme;
    btn.setAttribute('aria-pressed', store.settings.theme === theme ? 'true' : 'false');
    btn.addEventListener('click', () => {
      store.settings.theme = theme;
      store.save();
      applyTheme();
      render();
    });
    themeRow.append(btn);
  }
  themeSection.append(themeRow);
  view.append(themeSection);

  // Backup
  const backupSection = el('section', { class: 'section card settings-card' });
  backupSection.append(el('h2', { text: 'Backup and export' }));
  backupSection.append(el('p', { class: 'muted', text: 'Backups are JSON files. Import checks the whole file before it replaces anything.' }));
  const status = el('p', { class: 'import-status', text: '' });
  status.dataset.testid = 'import-status';
  const backupRow = el('div', { class: 'button-row' });
  const exportBtn = el('button', { class: 'btn btn-secondary', type: 'button', text: 'Export JSON backup' });
  exportBtn.dataset.testid = 'export-backup';
  exportBtn.addEventListener('click', () => {
    const stamp = todayStr();
    downloadFile('errandloop-backup-' + stamp + '.json', JSON.stringify(buildBackup(store.state), null, 2), 'application/json');
    showToast('Backup downloaded');
  });
  const csvBtn = el('button', { class: 'btn btn-secondary', type: 'button', text: 'Export errands as CSV' });
  csvBtn.dataset.testid = 'export-csv';
  csvBtn.addEventListener('click', () => {
    downloadFile('errandloop-errands-' + todayStr() + '.csv', buildCsv(store.errands), 'text/csv');
    showToast('CSV downloaded');
  });
  const importLabel = el('label', { class: 'btn btn-secondary file-label', text: 'Import JSON backup' });
  const importInput = el('input', { type: 'file', accept: '.json,application/json' });
  importInput.dataset.testid = 'import-backup';
  importLabel.append(importInput);
  importInput.addEventListener('change', async () => {
    const file = importInput.files[0];
    if (!file) return;
    let text = '';
    try {
      text = await file.text();
    } catch (e) {
      status.textContent = 'Could not read that file.';
      return;
    }
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      status.textContent = 'That file is not valid JSON.';
      return;
    }
    const result = validateBackup(parsed);
    if (!result.ok) {
      status.textContent = 'That backup is not valid: ' + result.errors.join('; ');
      importInput.value = '';
      return;
    }
    const clean = result.data;
    openConfirm(
      'Replace all data?',
      'Import will replace everything with ' + clean.errands.length + ' errands, ' + clean.destinations.length + ' destinations, and ' + clean.outings.length + ' outings from this backup.',
      'Replace data',
      () => {
        store.replace(clean);
        applyTheme();
        render();
        showToast('Backup imported');
      }
    );
    status.textContent = '';
    importInput.value = '';
  });
  backupRow.append(exportBtn, csvBtn, importLabel);
  backupSection.append(backupRow, status);
  view.append(backupSection);

  // Corrupt storage warning
  if (store.corrupt) {
    const warnSection = el('section', { class: 'section card settings-card warning-card' });
    warnSection.dataset.testid = 'corrupt-warning';
    warnSection.append(el('h2', { text: 'Stored data could not be read' }));
    warnSection.append(el('p', { text: 'Your saved ErrandLoop data was unreadable, so the app started empty. You can download the unreadable data below.' }));
    const downloadBtn = el('button', { class: 'btn btn-secondary', type: 'button', text: 'Download unreadable data' });
    downloadBtn.addEventListener('click', () => downloadFile('errandloop-corrupt-data.txt', store.corrupt, 'text/plain'));
    warnSection.append(downloadBtn);
    view.append(warnSection);
  }

  // Danger zone
  const dangerSection = el('section', { class: 'section card settings-card danger-card' });
  dangerSection.append(el('h2', { text: 'Delete all data' }));
  dangerSection.append(el('p', { class: 'muted', text: 'This removes every errand, destination, and outing. Type DELETE to enable the button.' }));
  const deleteInput = el('input', { type: 'text', placeholder: 'Type DELETE', 'aria-label': 'Type DELETE to confirm' });
  deleteInput.dataset.testid = 'delete-all-input';
  const deleteBtn = el('button', { class: 'btn btn-danger', type: 'button', text: 'Delete all data' });
  deleteBtn.dataset.testid = 'delete-all-btn';
  deleteBtn.disabled = true;
  deleteInput.addEventListener('input', () => { deleteBtn.disabled = deleteInput.value !== 'DELETE'; });
  deleteBtn.addEventListener('click', () => {
    openConfirm('Delete all data?', 'This removes every errand, destination, and outing. This cannot be undone.', 'Delete everything', () => {
      const theme = store.settings.theme;
      store.replace({ errands: [], destinations: [], outings: [], settings: { theme } });
      render();
      showToast('All data deleted');
    });
  });
  const deleteRow = el('div', { class: 'inline-form' });
  deleteRow.append(deleteInput, deleteBtn);
  dangerSection.append(deleteRow);
  view.append(dangerSection);
}

// ---------- routing ----------
const ROUTES = {
  dashboard: { render: renderDashboard, label: 'Dashboard' },
  errands: { render: renderErrandsPage, label: 'My Errands' },
  planner: { render: renderPlannerPage, label: 'Trip Planner' },
  settings: { render: renderSettingsPage, label: 'Settings' },
};

function currentRoute() {
  const hash = window.location.hash.replace('#/', '');
  return ROUTES[hash] ? hash : 'dashboard';
}

function render() {
  const route = currentRoute();
  view.replaceChildren();
  if (store.corrupt) {
    const banner = el('div', { class: 'corrupt-banner', role: 'alert' });
    banner.dataset.testid = 'corrupt-banner';
    banner.append(el('p', { text: 'Your saved data could not be read, so ErrandLoop started empty. See Settings to download the unreadable data.' }));
    view.append(banner);
  }
  document.querySelectorAll('[data-nav]').forEach((link) => {
    const active = link.dataset.nav === route;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  ROUTES[route].render();
}

window.addEventListener('hashchange', render);

applyTheme();
render();
