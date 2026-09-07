/* Local observations only. No RPC calls, analytics, or wallet requests. */
(function (root) {
  'use strict';
  const KEY = 'cashx:farm-changes:v1';
  const valid = p => p && Number.isFinite(p.at) && p.at > 0 &&
    ['share', 'apr', 'deposit'].every(k => Number.isFinite(p[k]) && p[k] >= 0) && p.share <= 100;
  function createHistory(storage) {
    const saved = new Map(), baseline = new Map(), current = new Map();
    let persistent = true, queued = false;
    try {
      const rows = JSON.parse(storage.getItem(KEY) || '[]');
      if (Array.isArray(rows)) for (const row of rows.slice(-1000)) {
        if (Array.isArray(row) && typeof row[0] === 'string' && valid(row[1])) saved.set(row[0], row[1]);
      }
    } catch (_) { persistent = false; }
    function observe(key, point) {
      if (!valid(point) || point.at > Date.now() + 60000) return;
      if (!baseline.has(key)) baseline.set(key, saved.get(key) || null);
      if (current.has(key) && current.get(key).at >= point.at) return;
      current.set(key, { ...point });
      saved.delete(key); saved.set(key, { ...point });
      while (saved.size > 1000) saved.delete(saved.keys().next().value);
      if (!queued) {
        queued = true;
        Promise.resolve().then(() => {
          queued = false;
          try { storage.setItem(KEY, JSON.stringify([...saved])); persistent = true; }
          catch (_) { persistent = false; }
        });
      }
    }
    return { observe, get: key => ({ before: baseline.get(key) || null, now: current.get(key) || null, persistent }) };
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = { createHistory }; return; }
  let storage; try { storage = root.localStorage; } catch (_) {}
  const history = createHistory(storage);
  let dialog;
  const date = at => new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const number = (n, places = 2) => n.toLocaleString(undefined, { minimumFractionDigits: places, maximumFractionDigits: places });
  function open(key, name, connected, unavailable, expectedAt) {
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.className = 'farm-changes-dialog';
      dialog.setAttribute('aria-labelledby', 'farm-changes-title');
      document.body.appendChild(dialog);
      dialog.addEventListener('click', event => { if (event.target === dialog) {
        const rect = dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
      } });
    }
    dialog.replaceChildren();
    const add = (tag, text, parent = dialog) => { const el = document.createElement(tag); el.textContent = text; parent.appendChild(el); return el; };
    const close = add('button', '×'); close.className = 'share-close'; close.setAttribute('aria-label', 'Close changes'); close.onclick = () => dialog.close();
    add('h2', 'What changed?').id = 'farm-changes-title';
    add('p', name);
    const { before, now, persistent } = history.get(key);
    if (!connected) add('p', 'Connect your wallet to record your farm share and deposited value.');
    else if (unavailable || !now || now.at !== expectedAt) add('p', 'Current readings are unavailable. Try again after the farm data refreshes.');
    else {
      add('p', before ? `Previous visit: ${date(before.at)}\nCurrent reading: ${date(now.at)}` : `First observation saved: ${date(now.at)}. Visit again to see what changed.`).className = 'changes-dates';
      const table = add('table', '');
      const head = add('tr', '', add('thead', '', table));
      for (const title of ['Metric', 'Previous', 'Current', 'Change']) add('th', title, head).scope = 'col';
      const body = add('tbody', '', table);
      for (const [key, title, unit, digits] of [['share', 'Farm share', '%', 4], ['apr', 'APR', '%', 2], ['deposit', 'Deposited value', 'USD', 2]]) {
        const format = value => unit === 'USD' ? `$${number(value)}` : `${number(value, digits)}%`;
        const row = add('tr', '', body);
        add('th', title, row).scope = 'row';
        add('td', before ? format(before[key]) : '—', row);
        add('td', format(now[key]), row);
        const delta = before ? now[key] - before[key] : null;
        const rounded = delta === null ? null : Number(delta.toFixed(digits));
        add('td', rounded === null ? '—' : rounded === 0 ? 'No change' : `${rounded > 0 ? '↑ +' : '↓ −'}${unit === 'USD' ? '$' : ''}${number(Math.abs(rounded), digits)}${unit === '%' ? ' pp' : ''}`, row);
      }
      add('p', 'Share and APR changes are in percentage points (pp). Deposited value can change with prices, deposits, or withdrawals; it is not profit. Farm share is your stake divided by total stake in this farm.').className = 'changes-note';
    }
    add('p', persistent ? 'Saved only in this browser for this wallet. Observations are recorded while you visit; no history is collected while the site is closed.' : 'Browser storage is unavailable. These observations will not survive a refresh.').className = 'changes-note';
    if (!dialog.open) dialog.showModal();
  }
  root.FarmChanges = { observe: history.observe, open, close: () => dialog?.close() };
})(typeof window === 'undefined' ? globalThis : window);
