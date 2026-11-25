// Unit tests for ErrandLoop: date handling, backup validation, CSV export.
// Run: node --test tests/errandloop-unit.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidDateStr, parseLocal, toDateStr, todayStr, addDays, isOverdue, isDueToday, dueLabel, formatDate } from '../date-utils.js';
import { validateBackup, buildBackup, buildCsv } from '../backup.js';

const baseErrand = (overrides = {}) => ({
  id: 'e1',
  title: 'Buy groceries',
  destination: 'Market',
  category: 'Shopping',
  priority: 'High',
  dueDate: '2026-11-25',
  durationMin: 30,
  notes: '',
  status: 'pending',
  createdAt: 1000,
  completedAt: null,
  ...overrides,
});

const baseBackup = (overrides = {}) => ({
  app: 'errandloop',
  version: 1,
  exportedAt: '2026-11-25T00:00:00.000Z',
  errands: [baseErrand()],
  destinations: ['Market'],
  outings: [{ id: 'o1', destination: 'Market', errandIds: ['e1'], status: 'active', createdAt: 1000, completedAt: null }],
  settings: { theme: 'system' },
  ...overrides,
});

test('date validity covers leap years and bad dates', () => {
  assert.equal(isValidDateStr('2024-02-29'), true);
  assert.equal(isValidDateStr('2025-02-29'), false);
  assert.equal(isValidDateStr('2026-13-01'), false);
  assert.equal(isValidDateStr('2026-11-31'), false);
  assert.equal(isValidDateStr('2026-11-25'), true);
  assert.equal(isValidDateStr('25-11-2026'), false);
  assert.equal(isValidDateStr(''), false);
  assert.equal(isValidDateStr(null), false);
});

test('addDays crosses month and year boundaries', () => {
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2026-11-25', -1), '2026-11-24');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
});

test('local round trip keeps the same date string', () => {
  const parsed = parseLocal('2026-11-25');
  assert.equal(toDateStr(parsed), '2026-11-25');
  assert.match(todayStr(), /^\d{4}-\d{2}-\d{2}$/);
});

test('overdue and due-today use local dates', () => {
  const today = '2026-11-25';
  assert.equal(isOverdue(baseErrand({ dueDate: '2026-11-24' }), today), true);
  assert.equal(isOverdue(baseErrand({ dueDate: '2026-11-25' }), today), false);
  assert.equal(isOverdue(baseErrand({ dueDate: '2026-11-26' }), today), false);
  assert.equal(isOverdue(baseErrand({ dueDate: null }), today), false);
  assert.equal(isOverdue(baseErrand({ dueDate: '2026-11-24', status: 'completed' }), today), false);
  assert.equal(isDueToday(baseErrand({ dueDate: '2026-11-25' }), today), true);
  assert.equal(isDueToday(baseErrand({ dueDate: '2026-11-24' }), today), false);
});

test('due labels read plainly', () => {
  const today = '2026-11-25';
  assert.equal(dueLabel('2026-11-25', today), 'Due today');
  assert.equal(dueLabel('2026-11-26', today), 'Due tomorrow');
  assert.equal(dueLabel('2026-11-24', today), 'Overdue by 1 day');
  assert.equal(dueLabel('2026-11-22', today), 'Overdue by 3 days');
  assert.equal(dueLabel('2026-11-28', today), 'Due in 3 days');
  assert.equal(dueLabel(null, today), 'No due date');
  assert.equal(formatDate('2026-11-25'), '25 Nov 2026');
});

test('valid backup passes and round-trips', () => {
  const result = validateBackup(baseBackup());
  assert.equal(result.ok, true);
  assert.equal(result.data.errands.length, 1);
  assert.equal(result.data.outings[0].errandIds[0], 'e1');
  const rebuilt = buildBackup(result.data);
  assert.equal(rebuilt.app, 'errandloop');
  assert.equal(rebuilt.version, 1);
});

test('backup validation rejects bad files', () => {
  const cases = [
    [{}, 'empty object'],
    [{ app: 'other', version: 1, errands: [], destinations: [], outings: [] }, 'wrong app'],
    [{ app: 'errandloop', version: 2, errands: [], destinations: [], outings: [] }, 'wrong version'],
    [baseBackup({ errands: 'nope' }), 'errands not an array'],
    [baseBackup({ errands: [baseErrand({ title: 'x' })] }), 'title too short'],
    [baseBackup({ errands: [baseErrand({ title: 'a'.repeat(101) })] }), 'title too long'],
    [baseBackup({ errands: [baseErrand({ category: 'Work' })] }), 'bad category'],
    [baseBackup({ errands: [baseErrand({ priority: 'Urgent' })] }), 'bad priority'],
    [baseBackup({ errands: [baseErrand({ dueDate: '2025-02-29' })] }), 'bad due date'],
    [baseBackup({ errands: [baseErrand({ durationMin: 0 })] }), 'duration zero'],
    [baseBackup({ errands: [baseErrand({ durationMin: 1441 })] }), 'duration too big'],
    [baseBackup({ errands: [baseErrand({ notes: 'n'.repeat(501) })] }), 'notes too long'],
    [baseBackup({ errands: [baseErrand(), baseErrand()] }), 'duplicate errand id'],
    [baseBackup({ destinations: ['Market', 'Market'] }), 'duplicate destination'],
    [baseBackup({ outings: [{ id: 'o1', destination: 'Market', errandIds: ['missing'], status: 'active', createdAt: 1, completedAt: null }] }), 'outing refers to missing errand'],
    [baseBackup({ outings: [{ id: 'o1', destination: 'Market', errandIds: ['e1', 'e1'], status: 'active', createdAt: 1, completedAt: null }] }), 'outing lists errand twice'],
    [baseBackup({ outings: [{ id: 'o1', destination: 'Market', errandIds: [], status: 'active', createdAt: 1, completedAt: null }] }), 'outing with no stops'],
    [baseBackup({ settings: { theme: 'purple' } }), 'bad theme'],
  ];
  for (const [input, label] of cases) {
    const result = validateBackup(input);
    assert.equal(result.ok, false, label + ' should be rejected');
    assert.ok(result.errors.length > 0, label + ' should name a problem');
  }
});

test('backup validation accepts empty lists and missing settings', () => {
  const result = validateBackup({ app: 'errandloop', version: 1, errands: [], destinations: [], outings: [] });
  assert.equal(result.ok, true);
  assert.equal(result.data.settings.theme, 'system');
});

test('CSV export escapes quotes and neutralizes formulas', () => {
  const csv = buildCsv([
    baseErrand({ title: 'Buy "milk", eggs', notes: '=2+2' }),
    baseErrand({ id: 'e2', title: '+Call bank', notes: '@mention', destination: 'Bank, Main St' }),
  ]);
  const lines = csv.split('\r\n');
  assert.equal(lines[0], 'id,title,destination,category,priority,dueDate,durationMin,notes,status,createdAt,completedAt');
  assert.ok(lines[1].includes('"Buy ""milk"", eggs"'), 'quotes are doubled and the cell is quoted');
  assert.ok(lines[1].includes("'=2+2"), 'leading = is neutralized');
  assert.ok(lines[2].includes("'+Call bank"), 'leading + is neutralized');
  assert.ok(lines[2].includes("'@mention"), 'leading @ is neutralized');
  assert.ok(lines[2].includes('"Bank, Main St"'), 'comma in destination is quoted');
});
