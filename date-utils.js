// date-utils.js - local calendar dates for ErrandLoop.
// All dates are plain YYYY-MM-DD strings handled in local time, so a due
// date never shifts because of UTC conversion.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateStr(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export function parseLocal(value) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

export function todayStr() {
  return toDateStr(new Date());
}

export function addDays(dateStr, days) {
  const date = parseLocal(dateStr);
  date.setDate(date.getDate() + days);
  return toDateStr(date);
}

export function isOverdue(errand, today) {
  if (!errand || errand.status !== 'pending') return false;
  if (!errand.dueDate) return false;
  return errand.dueDate < today;
}

export function isDueToday(errand, today) {
  if (!errand || errand.status !== 'pending') return false;
  return errand.dueDate === today;
}

// Short display form, e.g. "25 Nov 2026". Falls back to the raw string.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function formatDate(dateStr) {
  if (!isValidDateStr(dateStr)) return dateStr || '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return d + ' ' + MONTHS[m - 1] + ' ' + y;
}

// Relative label used on cards: Today, Tomorrow, Yesterday, Overdue by N days,
// In N days, or the formatted date.
export function dueLabel(dateStr, today) {
  if (!dateStr) return 'No due date';
  if (dateStr === today) return 'Due today';
  if (dateStr === addDays(today, 1)) return 'Due tomorrow';
  const diff = Math.round((parseLocal(dateStr) - parseLocal(today)) / 86400000);
  if (diff < 0) return 'Overdue by ' + Math.abs(diff) + (Math.abs(diff) === 1 ? ' day' : ' days');
  if (diff <= 30) return 'Due in ' + diff + (diff === 1 ? ' day' : ' days');
  return formatDate(dateStr);
}
