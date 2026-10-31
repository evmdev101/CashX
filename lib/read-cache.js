(function(root) {
  'use strict';
  // Public contract metadata only. Wallet balances, allowances and rewards never use this cache.
  function createCache(now = Date.now) {
    const entries = new Map();
    function get(key, load, ttl = 3600000) {
      const previous = entries.get(key);
      if (previous && (previous.pending || previous.expires > now())) return previous.promise;
      const entry = {pending:true, expires:0};
      entry.promise = Promise.resolve().then(load).then(value => {
        entry.pending = false; entry.expires = now() + ttl; return value;
      }, error => {if (entries.get(key) === entry) entries.delete(key); throw error;});
      entries.set(key, entry);
      // Bound memory for long-running sessions; pending requests stay shareable.
      if (entries.size > 1000) for (const [oldKey, old] of entries) {
        if (!old.pending && old.expires <= now()) entries.delete(oldKey);
      }
      return entry.promise;
    }
    return {get, clear: () => entries.clear()};
  }
  const api = {createCache};
  if (typeof module === 'object' && module.exports) module.exports = api; else root.ReadCache = api;
})(typeof window === 'object' ? window : globalThis);
