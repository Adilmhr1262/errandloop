// backup.js - JSON backup export/import and CSV export for ErrandLoop.
// Import is validated in full before any stored data is replaced.
import { CATEGORIES, PRIORITIES, THEMES } from './storage.js';
import { isValidDateStr } from './date-utils.js';

export const APP_ID = 'errandloop';
export const BACKUP_VERSION = 1;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isInt(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function validErrand(item) {
  if (!isPlainObject(item)) return 'errand is not an object';
  if (typeof item.id !== 'string' || item.id.length === 0) return 'errand id is missing';
  if (typeof item.title !== 'string' || item.title.length < 2 || item.title.length > 100) return 'errand title must be 2 to 100 characters';
  if (typeof item.destination !== 'string') return 'errand destination must be text';
  if (!CATEGORIES.includes(item.category)) return 'errand category is not valid';
  if (!PRIORITIES.includes(item.priority)) return 'errand priority is not valid';
  if (item.dueDate !== null && !isValidDateStr(item.dueDate)) return 'errand due date is not valid';
  if (item.durationMin !== null && !isInt(item.durationMin, 1, 1440)) return 'errand duration must be 1 to 1440 minutes';
  if (typeof item.notes !== 'string' || item.notes.length > 500) return 'errand notes must be at most 500 characters';
  if (item.status !== 'pending' && item.status !== 'completed') return 'errand status is not valid';
  if (!isInt(item.createdAt, 0, Number.MAX_SAFE_INTEGER)) return 'errand createdAt is not valid';
  if (item.completedAt !== null && !isInt(item.completedAt, 0, Number.MAX_SAFE_INTEGER)) return 'errand completedAt is not valid';
  return null;
}

function validOuting(item, errandIds) {
  if (!isPlainObject(item)) return 'outing is not an object';
  if (typeof item.id !== 'string' || item.id.length === 0) return 'outing id is missing';
  if (typeof item.destination !== 'string') return 'outing destination must be text';
  if (!Array.isArray(item.errandIds) || item.errandIds.length === 0) return 'outing must list at least one stop';
  const seen = new Set();
  for (const id of item.errandIds) {
    if (typeof id !== 'string') return 'outing stop id is not text';
    if (seen.has(id)) return 'outing lists the same errand twice';
    seen.add(id);
    if (!errandIds.has(id)) return 'outing refers to an errand that is not in the backup';
  }
  if (!['active', 'done', 'cancelled'].includes(item.status)) return 'outing status is not valid';
  if (!isInt(item.createdAt, 0, Number.MAX_SAFE_INTEGER)) return 'outing createdAt is not valid';
  if (item.completedAt !== null && !isInt(item.completedAt, 0, Number.MAX_SAFE_INTEGER)) return 'outing completedAt is not valid';
  return null;
}

// Returns { ok: true, data } or { ok: false, errors: [] }.
// The returned data is a clean copy, safe to store as-is.
export function validateBackup(input) {
  const errors = [];
  if (!isPlainObject(input)) return { ok: false, errors: ['File is not a JSON object'] };
  if (input.app !== APP_ID) errors.push('File is not an ErrandLoop backup');
  if (input.version !== BACKUP_VERSION) errors.push('Backup version is not supported');
  if (!Array.isArray(input.errands)) errors.push('Backup has no errands list');
  if (!Array.isArray(input.destinations)) errors.push('Backup has no destinations list');
  if (!Array.isArray(input.outings)) errors.push('Backup has no outings list');
  if (errors.length > 0) return { ok: false, errors };

  const errandIds = new Set();
  input.errands.forEach((item, index) => {
    const problem = validErrand(item);
    if (problem) { errors.push('Errand ' + (index + 1) + ': ' + problem); return; }
    if (errandIds.has(item.id)) errors.push('Errand ' + (index + 1) + ': duplicate id');
    errandIds.add(item.id);
  });

  const destinationNames = new Set();
  input.destinations.forEach((name, index) => {
    if (typeof name !== 'string' || name.trim().length === 0 || name.length > 100) {
      errors.push('Destination ' + (index + 1) + ': name must be 1 to 100 characters');
      return;
    }
    if (destinationNames.has(name.trim())) errors.push('Destination ' + (index + 1) + ': duplicate name');
    destinationNames.add(name.trim());
  });

  const outingIds = new Set();
  input.outings.forEach((item, index) => {
    const problem = validOuting(item, errandIds);
    if (problem) { errors.push('Outing ' + (index + 1) + ': ' + problem); return; }
    if (outingIds.has(item.id)) errors.push('Outing ' + (index + 1) + ': duplicate id');
    outingIds.add(item.id);
  });

  if (input.settings !== undefined) {
    if (!isPlainObject(input.settings) || !THEMES.includes(input.settings.theme)) {
      errors.push('Backup settings are not valid');
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const clean = {
    errands: input.errands.map((item) => ({
      id: item.id,
      title: item.title,
      destination: item.destination,
      category: item.category,
      priority: item.priority,
      dueDate: item.dueDate,
      durationMin: item.durationMin,
      notes: item.notes,
      status: item.status,
      createdAt: item.createdAt,
      completedAt: item.completedAt,
    })),
    destinations: input.destinations.map((name) => name.trim()),
    outings: input.outings.map((item) => ({
      id: item.id,
      destination: item.destination,
      errandIds: item.errandIds.slice(),
      status: item.status,
      createdAt: item.createdAt,
      completedAt: item.completedAt,
    })),
    settings: { theme: input.settings && THEMES.includes(input.settings.theme) ? input.settings.theme : 'system' },
  };
  return { ok: true, data: clean };
}

export function buildBackup(state) {
  return {
    app: APP_ID,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    errands: state.errands,
    destinations: state.destinations,
    outings: state.outings,
    settings: state.settings,
  };
}

// CSV helpers. A leading =, +, -, @ or tab stops spreadsheet formula injection.
function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  if (/[",\n\r]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
  return text;
}

export function buildCsv(errands) {
  const header = ['id', 'title', 'destination', 'category', 'priority', 'dueDate', 'durationMin', 'notes', 'status', 'createdAt', 'completedAt'];
  const lines = [header.join(',')];
  for (const item of errands) {
    lines.push(header.map((key) => csvCell(item[key])).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

export function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
