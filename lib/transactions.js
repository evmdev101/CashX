(function(root) {
  'use strict';
  const STORAGE_KEY = 'cashx:pending-actions:v1';
  const hashPattern = /^0x[0-9a-f]{64}$/i;
  function cancelled(error) {
    return error?.code === 4001 || error?.code === 'ACTION_REJECTED' ||
      /user (rejected|denied)|request rejected/i.test(error?.shortMessage || error?.message || '');
  }
  function createTracker({storage, readReceipt, locateTransaction, onChange = () => {}, onSettled = () => {}, interval = 7000,
    schedule = setTimeout, unschedule = clearTimeout} = {}) {
    const records = new Map(), locks = new Map(), watchers = new Map(), running = new Set();
    let sequence = 0;
    function save() {
      try { storage?.setItem(STORAGE_KEY, JSON.stringify([...records.values()].filter(r => (r.hash && r.phase === 'pending') || r.phase === 'uncertain'))); } catch (_) {}
    }
    function notify(record) { save(); try { onChange(record); } catch (error) { console.warn('Transaction display unavailable', error); } }
    function release(record) { for (const key of record.keys) if (locks.get(key) === record.id) locks.delete(key); records.delete(record.id); save(); }
    function watch(record, tx) {
      if (watchers.has(record.id)) return watchers.get(record.id).promise;
      let resolve, reject, timer, stopped = false, checking = false;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      // A restored tracker may have no caller awaiting its result.
      promise.catch(() => {});
      function finish(receipt, error) {
        if (stopped) return;
        stopped = true; unschedule(timer); watchers.delete(record.id);
        record.phase = error ? (cancelled(error) ? 'cancelled' : 'failed') : 'confirmed';
        record.error = error?.shortMessage || error?.message || '';
        record.receipt = receipt;
        // Do not serialize provider receipt objects.
        if (!running.has(record.id)) release(record); else save();
        try { onChange(record); } catch (_) {}
        try { Promise.resolve(onSettled(record)).catch(() => {}); } catch (_) {}
        if (error) reject(error); else resolve(receipt);
      }
      function accept(receipt) {
        if (!receipt) return;
        if (Number(receipt.status) === 1) finish(receipt);
        else finish(receipt, Object.assign(new Error('Transaction reverted'), {code: 'CALL_EXCEPTION', receipt}));
      }
      async function check() {
        if (stopped || checking) return;
        checking = true;
        try {
          if (record.hash && readReceipt) accept(await readReceipt(record));
          if (!stopped && locateTransaction) {
            const found = await locateTransaction(record);
            const hash = typeof found === 'string' ? found : found?.hash;
            if (found?.cancelled) { finish(null, Object.assign(new Error('Transaction replaced by another wallet action'), {code:'ACTION_REJECTED'})); return; }
            if (hashPattern.test(hash || '') && hash !== record.hash) {
              if (Number.isInteger(found?.nonce)) {record.nonce = found.nonce; record.nonceKnown = true;}
              record.hash = hash; record.phase = 'pending'; notify(record);
              if (readReceipt) accept(await readReceipt(record));
            }
          }
        } catch (_) {
          // A failed RPC read says nothing about whether a submitted transaction succeeded.
        } finally {
          checking = false;
          if (!stopped) timer = schedule(check, interval);
        }
      }
      watchers.set(record.id, {promise, stop: () => {stopped = true; unschedule(timer);}});
      if (tx?.wait) Promise.resolve().then(() => tx.wait()).then(accept, error => {
        if (stopped) return;
        if (error?.code === 'TRANSACTION_REPLACED') {
          const replacement = error.replacement;
          if (hashPattern.test(replacement?.hash || '')) { record.hash = replacement.hash; notify(record); }
          if (error.cancelled) finish(error.receipt, Object.assign(new Error('Transaction cancelled in wallet'), {code: 'ACTION_REJECTED'}));
          else accept(error.receipt);
        } else if (error?.receipt) accept(error.receipt);
        // Keep polling after a timeout, disconnected wallet, or other unclear wait result.
      });
      check();
      return promise;
    }
    async function run(options, operation) {
      const keys = [...new Set(options.keys)];
      if (!keys.length || keys.some(key => locks.has(key))) return {duplicate: true};
      const record = {id: `${Date.now()}:${++sequence}`, keys, wallet: options.wallet.toLowerCase(), chainId: options.chainId,
        kind: options.kind, target: options.target, action: options.action, phase: 'wallet', hash: '', started: Date.now()};
      records.set(record.id, record); running.add(record.id); keys.forEach(key => locks.set(key, record.id)); notify(record);
      let currentWait;
      const context = {
        isCurrent: () => options.isCurrent?.() !== false,
        async send(action, method, args) {
          if (method) {
            const contract = action;
            record.to = String(contract.target).toLowerCase();
            const inputs = contract.interface.getFunction(method).inputs.length;
            record.data = contract.interface.encodeFunctionData(method, args.slice(0, inputs)).toLowerCase();
            record.value = String(args[inputs]?.value ?? 0);
            action = () => contract[method](...args);
          }
          await options.assertCurrent?.();
          record.phase = 'wallet'; record.hash = ''; notify(record);
          // Capture a nonce/block before asking the wallet, for an RPC error after broadcast without a hash.
          const checkpoint = await options.checkpoint?.();
          if (checkpoint) Object.assign(record, checkpoint);
          record.nonceKnown = false;
          await options.assertCurrent?.();
          let tx;
          try { tx = await action(); }
          catch (error) {
            const hash = error?.transactionHash || error?.transaction?.hash;
            if (hashPattern.test(hash || '')) tx = {hash};
            else if (!cancelled(error) && /timeout|timed out|network|failed to fetch|disconnect/i.test(error?.shortMessage || error?.message || '') && Number.isInteger(record.nonce)) {
              record.phase = 'uncertain'; notify(record); currentWait = watch(record);
              await currentWait; await options.assertCurrent?.(); return {hash: record.hash};
            } else throw error;
          }
          if (!hashPattern.test(tx?.hash || '')) throw new Error('Wallet did not return a transaction hash');
          record.hash = tx.hash; record.phase = 'pending'; record.nonce = tx.nonce ?? record.nonce;
          record.nonceKnown = Number.isInteger(tx.nonce);
          notify(record); currentWait = watch(record, tx); return tx;
        },
        async wait() {
          const receipt = await currentWait;
          await options.assertCurrent?.();
          return receipt;
        }
      };
      try { return await operation(context); }
      finally {
        // An operation can stop after an approval or validation; never discard an unresolved submission.
        running.delete(record.id);
        if (!watchers.has(record.id)) { release(record); record.phase = 'idle'; try { onChange(record); } catch (_) {} }
      }
    }
    function resume() {
      let saved = []; try { saved = JSON.parse(storage?.getItem(STORAGE_KEY) || '[]'); } catch (_) {}
      if (!Array.isArray(saved)) return;
      for (const record of saved.slice(0, 100)) {
        if (!record || record.chainId !== 369 || !/^0x[0-9a-f]{40}$/i.test(record.wallet || '') ||
          !Array.isArray(record.keys) || !record.keys.length || record.keys.some(k => typeof k !== 'string' || !k.startsWith(`369:${record.wallet}:`)) ||
          (!hashPattern.test(record.hash || '') && !(record.phase === 'uncertain' && Number.isInteger(record.nonce) && Number.isInteger(record.block)))) continue;
        record.id = `restored:${++sequence}`;
        if (record.keys.some(k => locks.has(k))) continue;
        records.set(record.id, record); record.keys.forEach(k => locks.set(k, record.id)); notify(record); watch(record);
      }
    }
    return {run, resume, pending: () => [...records.values()], isPending: key => locks.has(key),
      destroy() {for (const watcher of watchers.values()) watcher.stop(); watchers.clear();}};
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {createTracker, cancelled};
  else root.SiteTransactions = {createTracker, cancelled};
})(typeof window === 'undefined' ? globalThis : window);
