// storage.js - localStorage persistence for ErrandLoop.
// Data lives under one key. When storage is missing or unreadable the app
// keeps working in memory for the session and reports the problem.
export const STORAGE_KEY = 'errandloop.v1';
export const CORRUPT_KEY = 'errandloop.v1.corrupt';

export const CATEGORIES = ['Shopping', 'Banking', 'Household', 'Personal', 'Other'];
export const PRIORITIES = ['Low', 'Medium', 'High'];
export const THEMES = ['light', 'dark', 'system'];

export function emptyState() {
  return { errands: [], destinations: [], outings: [], settings: { theme: 'system' } };
}

export function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function storageAvailable() {
  try {
    if (typeof localStorage === 'undefined') return false;
    const probe = '__errandloop_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch (e) {
    return false;
  }
}

export class Store {
  constructor() {
    this.available = storageAvailable();
    this.corrupt = null;
    this.state = emptyState();
    this.load();
  }

  load() {
    if (!this.available) return;
    let raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      this.available = false;
      return;
    }
    if (raw === null || raw === '') return;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.errands)) {
        throw new Error('bad shape');
      }
      const state = emptyState();
      state.errands = parsed.errands;
      state.destinations = Array.isArray(parsed.destinations) ? parsed.destinations : [];
      state.outings = Array.isArray(parsed.outings) ? parsed.outings : [];
      if (parsed.settings && typeof parsed.settings === 'object') {
        state.settings = { theme: THEMES.includes(parsed.settings.theme) ? parsed.settings.theme : 'system' };
      }
      this.state = state;
    } catch (e) {
      this.corrupt = raw;
      try { localStorage.setItem(CORRUPT_KEY, raw); } catch (ignored) {}
      this.state = emptyState();
    }
  }

  save() {
    if (!this.available) return false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      return true;
    } catch (e) {
      return false;
    }
  }

  replace(state) {
    this.state = state;
    return this.save();
  }

  get errands() { return this.state.errands; }
  get destinations() { return this.state.destinations; }
  get outings() { return this.state.outings; }
  get settings() { return this.state.settings; }
}
