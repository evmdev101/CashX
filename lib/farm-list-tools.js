(function (root) {
  'use strict';
  const storageKey = 'cashx:farm-favorites:v1';
  const normalize = value => String(value || '').toLowerCase().trim();
  function matches(entry, filters, favorites) {
    if (filters.stakedOnly && !entry.staked && !entry.unavailable) return false;
    if (filters.favoritesOnly && !favorites.has(entry.key)) return false;
    if (filters.reward && !entry.rewards.some(reward => normalize(reward) === normalize(filters.reward))) return false;
    const haystack = normalize([entry.name, entry.label, entry.address, ...entry.rewards].join(' '));
    return normalize(filters.query).split(/\s+/).filter(Boolean).every(word => haystack.includes(word));
  }
  function select(entries, filters, favorites) {
    return entries.filter(entry => matches(entry, filters, favorites))
      .sort((a, b) => {
        const pinned = Number(favorites.has(b.key)) - Number(favorites.has(a.key));
        if (pinned) return pinned;
        const key = { rate: 'rate', deposit: 'deposit', ending: 'end' }[filters.sort];
        if (!key) return 0;
        const valid = v => Number.isFinite(v) && (key !== 'end' || v > Date.now() / 1000);
        if (!valid(a[key])) return valid(b[key]) ? 1 : 0;
        if (!valid(b[key])) return -1;
        return key === 'end' ? a[key] - b[key] : b[key] - a[key];
      });
  }
  function preferences(value = {}) {
    return { query: typeof value?.query === 'string' ? value.query.slice(0, 200) : '',
      reward: typeof value?.reward === 'string' ? value.reward.slice(0, 60) : '',
      favoritesOnly: value?.favoritesOnly === true, stakedOnly: value?.stakedOnly === true,
      sort: ['default', 'rate', 'deposit', 'ending'].includes(value?.sort) ? value.sort : 'default' };
  }
  function loadPreferences(storage, scope) {
    try { return preferences(JSON.parse(storage.getItem(`cashx:browse:${scope}:v1`) || '{}')); }
    catch (_) { return preferences(); }
  }
  function savePreferences(storage, scope, value) {
    try { storage.setItem(`cashx:browse:${scope}:v1`, JSON.stringify(preferences(value))); return true; }
    catch (_) { return false; }
  }
  function ending(end, now = Date.now() / 1000) {
    if (!Number.isFinite(end) || end <= 0) return '';
    const seconds = end - now;
    if (seconds <= 0) return 'Rewards ended';
    if (seconds >= 7 * 86400) return '';
    if (seconds < 86400) return 'Ends within 24h';
    const days = Math.ceil(seconds / 86400);
    return `Ends in ${days} ${days === 1 ? 'day' : 'days'}`;
  }
  function load(storage) {
    try {
      const data = JSON.parse(storage.getItem(storageKey) || '[]');
      return new Set(Array.isArray(data) ? data.filter(key => typeof key === 'string').slice(0, 1000) : []);
    } catch (_) { return new Set(); }
  }
  function save(storage, favorites) {
    try { storage.setItem(storageKey, JSON.stringify([...favorites])); return true; }
    catch (_) { return false; }
  }
  const api = { matches, select, ending, load, save, loadPreferences, savePreferences };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FarmListTools = api;
})(typeof window === 'undefined' ? globalThis : window);
