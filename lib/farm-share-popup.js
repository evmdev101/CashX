/* Farm-share observations reuse existing reads; this module makes no requests. */
(() => {
  'use strict';
  const STORAGE = 'cashx:share-popup:v1';
  const DAY = 86400000;
  const INTERVAL = 4 * 3600000;
  const entries = new Map();
  const live = new Map();
  const baselines = new Map();
  let stored = true, queued = false, dialog, activeId;
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date = t => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const pct = p => p > 0 && p < 0.0001 ? '<0.0001%' : `${p.toFixed(p < 1 ? 3 : 2)}%`;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) || '[]');
    if (Array.isArray(saved)) for (const entry of saved.slice(-128)) {
      if (!Array.isArray(entry) || typeof entry[0] !== 'string' || !Array.isArray(entry[1])) continue;
      const points = entry[1].filter(p => p && Number.isFinite(p.t) && p.t > Date.now() - 30 * DAY && p.t <= Date.now()
        && Number.isFinite(p.p) && p.p >= 0 && p.p <= 100).sort((a,b) => a.t-b.t).slice(-180);
      if (points.length) entries.set(entry[0], points);
    }
  } catch (_) { stored = false; }

  function save() {
    if (queued || !stored) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      for (const [key, points] of entries) {
        const recent = points.filter(p => p.t > Date.now() - 30 * DAY).slice(-180);
        if (recent.length) entries.set(key, recent); else entries.delete(key);
      }
      while (entries.size > 128) entries.delete(entries.keys().next().value);
      try { localStorage.setItem(STORAGE, JSON.stringify([...entries])); }
      catch (_) { stored = false; }
    });
  }

  function button(data) {
    const id = String(Number(data.id));
    const previous = live.get(id);
    const now = Date.now();
    let point = null;
    if (data.connected && data.valid && typeof data.staked === 'bigint' && typeof data.total === 'bigint'
      && data.staked >= 0n && data.total >= data.staked) {
      point = { t: now, p: data.total === 0n ? 0 : Number(data.staked * 10000000000n / data.total) / 100000000 };
      const points = (entries.get(data.key) || []).filter(p => p.t > now - 30 * DAY);
      if (!baselines.has(data.key)) baselines.set(data.key, points.at(-1) || point);
      if ((data.staked > 0n || points.length) && (!points.length || now - points.at(-1).t >= INTERVAL)) {
        entries.delete(data.key);
        entries.set(data.key, [...points, point].slice(-180));
        save();
      }
    }
    live.set(id, { ...data, point });
    if (dialog?.open && activeId === id) {
      if (previous?.key !== data.key || !data.connected) dialog.close();
      else render();
    }
    const baseline = baselines.get(data.key);
    const delta = point && baseline ? point.p - baseline.p : 0;
    const changed = point && baseline && point.t - baseline.t >= 60000 && Math.abs(delta) >= 0.00005;
    const direction = delta > 0 ? 'up' : 'down';
    const changeHint = changed ? `Share ${direction} since ${date(baseline.t)}. ` : '';
    const arrow = changed ? `<span class="farm-share-arrow share-${direction}" aria-hidden="true">${delta > 0 ? '↑' : '↓'}</span>` : '';
    return `<button class="farm-share-link" type="button" onclick="FarmSharePopup.open(this, ${Number(id)})" aria-haspopup="dialog" aria-label="${esc(changeHint)}View farm share history for ${esc(data.name)}" title="${esc(changeHint)}View farm share history">${esc(data.label)}${arrow}</button>`;
  }

  function content(data) {
    if (!data.connected) return '<p>Connect your wallet to see your farm share and start recording its history.</p>';
    if (!data.point) return '<p>Share data is temporarily unavailable. No history was recorded from this reading.</p>';
    const current = data.point;
    const baseline = baselines.get(data.key) || current;
    const delta = current.p - baseline.p;
    const changed = Math.abs(delta) >= 0.00005;
    const change = changed ? `${delta > 0 ? '↑ +' : '↓ −'}${Math.abs(delta).toFixed(4).replace(/0+$/, '').replace(/\.$/, '')} percentage points` : 'No change';
    const prior = current.t - baseline.t >= 60000;
    const points = (entries.get(data.key) || []).filter(p => p.t > current.t - 30 * DAY);
    if (!points.length || points.at(-1).t !== current.t) points.push(current);
    let chart = '<p class="share-muted">History starts with your first observation. Check back to see changes.</p>';
    if (points.length > 1 && current.t - points[0].t >= 60000) {
      const min = Math.min(...points.map(p => p.p)), max = Math.max(...points.map(p => p.p));
      const spread = Math.max(max-min, 0.01);
      const coords = points.map(p => `${(10+(p.t-points[0].t)/(current.t-points[0].t)*280).toFixed(2)},${(80-(p.p-min)/spread*60).toFixed(2)}`);
      chart = `<div class="share-muted">Observed range: ${esc(pct(min))} – ${esc(pct(max))}</div>
        <svg viewBox="0 0 300 100" role="img" aria-label="Recorded share from ${esc(pct(points[0].p))} to ${esc(pct(current.p))}">
          <path d="M10 88H290" stroke="currentColor" opacity=".2"/><polyline points="${coords.join(' ')}" fill="none" stroke="currentColor" stroke-width="2"/>
          ${coords.map(c => { const [x,y]=c.split(','); return `<circle cx="${x}" cy="${y}" r="2" fill="currentColor"/>`; }).join('')}</svg>
        <div class="share-dates"><span>${esc(date(points[0].t))}</span><span>${esc(date(current.t))}</span></div>`;
    }
    return `<div class="share-current">${esc(pct(current.p))}</div><div class="share-muted">Current farm share</div>
      ${prior ? `<p class="${changed ? delta > 0 ? 'share-up' : 'share-down' : ''}">${esc(change)}<br><span class="share-muted">Previously ${esc(pct(baseline.p))} · ${esc(date(baseline.t))}</span></p>` : ''}
      <div class="share-chart">${chart}</div>
      <p class="share-muted">${stored ? 'Saved in this browser for this wallet.' : 'Browser storage unavailable; observations last only for this page session.'} Up to 30 days, with saved readings at least 4 hours apart, plus the current reading. Recorded only while visiting; lines connect observations across gaps.</p>`;
  }

  function render() {
    const data = live.get(activeId);
    if (!data) return;
    dialog.querySelector('.share-farm-name').textContent = data.name;
    dialog.querySelector('.share-body').innerHTML = content(data);
  }

  function open(trigger, id) {
    activeId = String(id);
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.className = 'farm-share-dialog';
      dialog.setAttribute('aria-labelledby', 'farm-share-title');
      dialog.innerHTML = '<button class="share-close" type="button" aria-label="Close share history">×</button><h2 id="farm-share-title">Your farm share</h2><div class="share-farm-name"></div><div class="share-body"></div><p class="share-explanation">Your stake ÷ total stake in this farm. This percentage is not ownership of the entire LP pool.</p>';
      document.body.append(dialog);
      dialog.querySelector('.share-close').addEventListener('click', () => dialog.close());
      dialog.addEventListener('click', event => {
        const box = dialog.getBoundingClientRect();
        if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) dialog.close();
      });
    }
    render();
    if (!dialog.open) dialog.showModal();
    dialog.onclose = () => {
      // Farm refreshes can replace the original percentage button.
      const replacement = document.querySelector(`#farm-staked-sub-${id} .farm-share-link`);
      (trigger.isConnected ? trigger : replacement)?.focus();
    };
  }
  window.FarmSharePopup = { button, open };
})();
