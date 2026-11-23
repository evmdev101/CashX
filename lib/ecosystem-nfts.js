(function (root) {
  'use strict';
  // Ported from evmdev101/cashx-10000-nft-mint app/contract.ts and
  // contracts/CashXEcosystemNFT.sol (main, inspected 2026-11-01).
  // CashMoney is retained as a collection/farm only; its retired mint is never called.
  const COLLECTION = '0x744351E2846498D040B649D694CAB21f32f14AFe';
  const CASHMONEY = '0x1b9C3cebE3E6e6Db92d525CC5cF3bECa86397ee6';
  const ABI = [
    'function PRICE_PER_NFT() view returns (uint256)',
    'function MAX_SUPPLY() view returns (uint256)',
    'function totalSupply() view returns (uint256)',
    'function remainingSupply() view returns (uint256)',
    'function saleActive() view returns (bool)',
    'function balanceOf(address) view returns (uint256)',
    'function treasury() view returns (address)',
    'function mint(uint256 quantity) payable',
    'error SaleClosed()', 'error SoldOut(uint256 remaining)',
    'error InvalidQuantity(uint256 requested)', 'error IncorrectPayment(uint256 expected,uint256 received)',
    'error TreasuryTransferFailed()'
  ];
  function mintRequest(snapshot, quantity) {
    if (!snapshot || snapshot.valid !== true) throw new Error('Refresh collection data before minting.');
    if (!/^\d+$/.test(String(quantity)) || !Number.isSafeInteger(Number(quantity)) || Number(quantity) < 1) {
      throw new Error('Enter a whole number of NFTs, at least 1.');
    }
    const count = BigInt(quantity);
    if (snapshot.remaining === 0n) throw new Error('This collection is sold out.');
    if (snapshot.active !== true) throw new Error('Minting is currently closed.');
    if (count > snapshot.remaining) throw new Error('That quantity exceeds the remaining supply.');
    if (typeof snapshot.price !== 'bigint' || snapshot.price <= 0n) throw new Error('Mint price is unavailable.');
    return {quantity: count, value: snapshot.price * count};
  }
  function friendly(error) {
    if (root.SiteTransactions?.cancelled(error)) return 'Mint cancelled in your wallet.';
    const name = error?.revert?.name || '';
    if (name === 'SaleClosed') return 'Minting is currently closed. Refresh to check its status.';
    if (name === 'SoldOut') return 'The remaining supply changed. Refresh and try a smaller quantity.';
    if (/insufficient funds/i.test(error?.shortMessage || error?.message || '')) return 'Your wallet needs enough PLS for the mint payment and network fee.';
    return error?.shortMessage || error?.message || 'Mint could not be completed. Please refresh and try again.';
  }
  let mounted = false, active = false, reader, tracker, timer, snapshot = null;
  let refreshBusy = false, walletSeen = '', displayWalletSeen = '', accountRead = 0, lastHash = '', lastRefresh = 0;
  const busyWallets = new Set(), walletTransactions = new Map();
  const currentWallet = () => String(root.sharedWalletAddr || '').toLowerCase();
  const walletBusy = () => busyWallets.has(currentWallet());
  const $ = id => root.document.getElementById(id);
  const text = (id, value) => { if ($(id)) $(id).textContent = value; };
  const key = wallet => `369:${wallet.toLowerCase()}:ecosystem-nft:${COLLECTION.toLowerCase()}:mint`;
  function provider() {
    if (!reader) {
      const request = new root.ethers.FetchRequest('https://rpc.pulsechain.com');
      request.timeout = 18000;
      reader = new root.ethers.JsonRpcProvider(request, 369, {staticNetwork: true});
    }
    return reader;
  }
  function status(message, error = false) {
    text('eco-nft-status', message);
    if ($('eco-nft-status')) $('eco-nft-status').classList.toggle('is-error', error);
  }
  function walletStatus(wallet, message, error = false) {
    if (currentWallet() === wallet.toLowerCase()) status(message, error);
  }
  function displayTransaction(record) {
    if (!record || record.wallet !== currentWallet()) return;
    if (record.hash) {
      lastHash = record.hash;
      const link = $('eco-nft-tx');
      if (link) { link.hidden = false; link.href = `https://scan.pulsechain.com/tx/${record.hash}`; }
    }
    if (record.phase === 'pending') status('Mint submitted. Waiting for confirmation on PulseChain.');
    if (record.phase === 'uncertain') status('The wallet response was interrupted. Checking whether the mint was submitted; do not submit it again.');
    if (record.phase === 'confirmed') status('Mint confirmed. Your CashX NFTs are ready.');
    if (record.phase === 'failed') status(record.error || 'Mint reverted. Check the transaction for details.', true);
    if (record.phase === 'cancelled') status('Mint cancelled in your wallet.', true);
  }
  function syncWalletDisplay() {
    const wallet = currentWallet();
    if (wallet === displayWalletSeen) return;
    displayWalletSeen = wallet; lastHash = '';
    const link = $('eco-nft-tx');
    if (link) { link.hidden = true; link.removeAttribute('href'); }
    status(snapshot?.active ? 'Mint price and availability are read directly from the collection.' : snapshot ? 'The collection has minting closed. Existing NFTs can still be used in its farm.' : 'Checking price and availability…');
    displayTransaction(walletTransactions.get(wallet));
  }
  function updateControls() {
    if (!mounted) return;
    syncWalletDisplay();
    const busy = walletBusy();
    const connected = Boolean(root.sharedWalletAddr);
    const pending = connected && tracker?.isPending(key(root.sharedWalletAddr));
    let request;
    try { request = mintRequest(snapshot, $('eco-nft-quantity').value); } catch (_) {}
    text('eco-nft-total', request ? `${root.ethers.formatEther(request.value)} PLS + network fee` : '—');
    const button = $('eco-nft-mint');
    button.disabled = busy || pending || !request;
    button.textContent = busy || pending ? 'Mint in progress…' : connected ? 'Mint CashX NFTs' : 'Connect wallet to mint';
    $('eco-nft-quantity').disabled = busy || pending;
    $('eco-nft-refresh').disabled = refreshBusy;
  }
  async function readCollection() {
    const rpc = provider(), blockTag = await rpc.getBlockNumber();
    const contract = new root.ethers.Contract(COLLECTION, ABI, rpc);
    const [price, cap, supply, remaining, sale, treasury] = await Promise.all([
      contract.PRICE_PER_NFT({blockTag}), contract.MAX_SUPPLY({blockTag}),
      contract.totalSupply({blockTag}), contract.remainingSupply({blockTag}),
      contract.saleActive({blockTag}), contract.treasury({blockTag})
    ]);
    if (price <= 0n || cap !== 10000n || supply > cap || remaining !== cap - supply) {
      throw new Error('Collection data could not be verified. Minting is unavailable.');
    }
    return {valid: true, price, cap, supply, remaining, active: sale, treasury, blockTag, time: Date.now()};
  }
  async function refresh() {
    if (refreshBusy) return;
    refreshBusy = true; lastRefresh = Date.now(); updateControls();
    try {
      snapshot = await readCollection();
      text('eco-nft-price', `${root.ethers.formatEther(snapshot.price)} PLS`);
      text('eco-nft-supply', `${snapshot.supply.toLocaleString()} / ${snapshot.cap.toLocaleString()}`);
      text('eco-nft-remaining', snapshot.remaining.toLocaleString());
      text('eco-nft-sale', snapshot.remaining === 0n ? 'Sold out' : snapshot.active ? 'Mint open' : 'Mint closed');
      text('eco-nft-updated', `Read at ${new Date(snapshot.time).toLocaleTimeString()} · block ${snapshot.blockTag.toLocaleString()}`);
      const link = $('eco-nft-treasury'); link.href = `https://scan.pulsechain.com/address/${snapshot.treasury}`;
      link.textContent = `Mint treasury ${snapshot.treasury.slice(0, 6)}…${snapshot.treasury.slice(-4)} ↗`;
      if (!walletBusy() && !lastHash && !(currentWallet() && tracker?.isPending(key(currentWallet())))) status(snapshot.active ? 'Mint price and availability are read directly from the collection.' : 'The collection has minting closed. Existing NFTs can still be used in its farm.');
      await readWallet();
    } catch (error) {
      snapshot = null;
      text('eco-nft-sale', 'Status unavailable');
      text('eco-nft-updated', 'Live collection data is unavailable. Refresh to try again.');
      if (!walletBusy()) status(friendly(error), true);
    } finally { refreshBusy = false; updateControls(); }
  }
  async function readWallet() {
    const wallet = root.sharedWalletAddr || '', request = ++accountRead;
    syncWalletDisplay();
    walletSeen = wallet.toLowerCase();
    text('eco-nft-owned', wallet ? 'Loading…' : 'Connect wallet');
    text('cashmoney-nft-owned', wallet ? 'Loading…' : 'Connect wallet');
    if (!wallet) { updateControls(); return; }
    await Promise.all([[COLLECTION, 'eco-nft-owned'], [CASHMONEY, 'cashmoney-nft-owned']].map(async ([address, id]) => {
      try {
        const count = await new root.ethers.Contract(address, ['function balanceOf(address) view returns (uint256)'], provider()).balanceOf(wallet);
        if (request === accountRead && root.sharedWalletAddr === wallet) text(id, `${count.toLocaleString()} in wallet`);
      } catch (_) { if (request === accountRead && root.sharedWalletAddr === wallet) text(id, 'Balance unavailable'); }
    }));
    updateControls();
  }
  async function assertWallet(wallet, selected) {
    if (root.CashXWallets?.getActiveProvider() !== selected || root.sharedWalletAddr?.toLowerCase() !== wallet.toLowerCase()) {
      throw new Error('Your wallet changed. Review the mint again.');
    }
    const [chain, accounts] = await Promise.all([selected.request({method:'eth_chainId'}), selected.request({method:'eth_accounts'})]);
    if (Number(chain) !== 369) throw new Error('Switch your wallet to PulseChain before minting.');
    if (accounts[0]?.toLowerCase() !== wallet.toLowerCase()) throw new Error('Your wallet account changed. Review the mint again.');
  }
  function getTracker() {
    if (tracker) return tracker;
    // This adapter keeps NFT pending records separate from farm records while using
    // the site's receipt/replacement tracker. No transaction is ever resubmitted.
    const storage = {getItem: () => root.localStorage.getItem('cashx:nft-mints:v1'), setItem: (_, v) => root.localStorage.setItem('cashx:nft-mints:v1', v)};
    tracker = root.SiteTransactions.createTracker({storage,
      readReceipt: record => provider().getTransactionReceipt(record.hash),
      locateTransaction: async record => {
        if (!Number.isInteger(record.block) || !Number.isInteger(record.nonce) || !record.to || !record.data) return null;
        const rpc = provider(), head = await rpc.getBlockNumber(), last = Math.min(head, record.block + 19);
        for (let block = record.block; block <= last; block++) {
          const data = await rpc.getBlock(block, true); if (!data) break;
          for (const tx of data.prefetchedTransactions) if (String(tx.from).toLowerCase() === record.wallet) {
            const matches = String(tx.to).toLowerCase() === record.to && String(tx.data).toLowerCase() === record.data && String(tx.value) === record.value;
            if (matches && (!record.nonceKnown || tx.nonce === record.nonce)) return {hash:tx.hash, nonce:tx.nonce};
            if (record.nonceKnown && tx.nonce === record.nonce) return {hash:tx.hash, cancelled:true};
          }
          record.block = block + 1;
        }
        return null;
      },
      onChange(record) {
        if (record.kind !== 'ecosystem-nft') return;
        if (record.phase !== 'idle') walletTransactions.set(record.wallet, {...record});
        syncWalletDisplay();
        displayTransaction(record);
        updateControls();
      },
      onSettled: record => { if (active && record.wallet === currentWallet()) { void refresh(); void readWallet(); } }
    });
    tracker.resume(); return tracker;
  }
  async function mint() {
    if (walletBusy()) return;
    if (!root.sharedWalletAddr) {
      await root.connectWallet?.();
      await readWallet();
      status('Review the quantity and total, then select Mint to continue.');
      return;
    }
    const wallet = root.sharedWalletAddr, selected = root.CashXWallets?.getActiveProvider();
    busyWallets.add(wallet.toLowerCase()); updateControls();
    const quantity = $('eco-nft-quantity').value;
    try {
      if (!selected) throw new Error('Connect your wallet before minting.');
      const reviewed = mintRequest(snapshot, quantity);
      await assertWallet(wallet, selected);
      const fresh = await readCollection(), request = mintRequest(fresh, quantity);
      if (request.value !== reviewed.value) { snapshot = fresh; throw new Error('The mint price changed. Refresh and review the total again.'); }
      snapshot = fresh;
      const browser = new root.ethers.BrowserProvider(selected);
      const signer = await browser.getSigner(wallet);
      const contract = new root.ethers.Contract(COLLECTION, ABI, signer);
      await getTracker().run({keys:[key(wallet)], wallet, chainId:369, kind:'ecosystem-nft', target:COLLECTION, action:'mint',
        assertCurrent: () => assertWallet(wallet, selected),
        isCurrent: () => root.sharedWalletAddr?.toLowerCase() === wallet.toLowerCase(),
        checkpoint: async () => {
          const [nonce, block] = await Promise.all([provider().getTransactionCount(wallet, 'pending'), provider().getBlockNumber()]);
          return {nonce, block};
        }
      }, async context => {
        // Exact native-PLS payment; this sale never requires ERC-20 approvals.
        // Simulate first so a closed sale or insufficient funds never opens a send.
        walletStatus(wallet, 'Checking mint availability and your payment…');
        const gas = await contract.mint.estimateGas(request.quantity, {value:request.value});
        await assertWallet(wallet, selected);
        walletStatus(wallet, 'Confirm the mint payment in your wallet.');
        await context.send(contract, 'mint', [request.quantity, {value:request.value, gasLimit:gas * 120n / 100n}]);
        await context.wait();
        walletStatus(wallet, 'Mint confirmed. Your CashX NFTs are ready.');
      });
      if (active && currentWallet() === wallet.toLowerCase()) await refresh();
    } catch (error) { walletStatus(wallet, friendly(error), true); }
    finally { busyWallets.delete(wallet.toLowerCase()); updateControls(); }
  }
  function openFarm(kind) {
    root.showPage('farms');
    root.FarmsApp?.setProductView('farms');
    root.FarmsApp?.setFarmView('grid');
    root.FarmsApp?.clearBrowseFilters();
    root.FarmsApp?.setStakedFilter(false);
    const selector = kind === 'cashmoney' ? '#nexion-nft-farm-card' : '#cashx-eco-nft-farm-card';
    let attempts = 0;
    const focus = () => {
      if (root.location.hash !== '#farms') return;
      if (root.document.querySelector(selector)) root.FarmsApp?.goToFarm(kind === 'cashmoney' ? '__nft__' : '__cashx_eco_nft__');
      else if (++attempts < 20) root.setTimeout(focus, 500);
    };
    root.setTimeout(focus, 300);
  }
  function init() {
    active = true;
    const host = $('nfts-content'); if (!host) return;
    if (!mounted) {
      mounted = true;
      host.innerHTML = `<div class="eco-nfts-heading"><div><span class="eco-nfts-eyebrow">CASHX ECOSYSTEM</span><h1>NFT collections</h1><p>Mint a CashX Ecosystem NFT or manage the collections already in your wallet.</p></div><button type="button" id="eco-nft-refresh">Refresh collections</button></div>
      <div class="eco-nfts-grid"><article class="eco-nfts-card"><div class="eco-nfts-art eco-nfts-cashx"><img id="eco-nft-artwork" src="https://ipfs.io/ipfs/bafybeigh4xrxvp3kly56ezepomltbxlfgxs4rz3dllquf4qxixhm4tpupy" alt="CashX Ecosystem NFT artwork" loading="lazy"><div class="eco-nfts-art-fallback" id="eco-nft-art-fallback" hidden><img src="cashx-logo.png" alt="CashX logo"><p>Collection artwork unavailable</p></div><span id="eco-nft-sale">Reading mint status…</span></div><div class="eco-nfts-body"><h2>CashX Ecosystem</h2><p>One collection, 10,000 NFTs. Mint with PLS and use your NFT in the ecosystem farm.</p><dl class="eco-nfts-stats"><div><dt>Minted</dt><dd id="eco-nft-supply">—</dd></div><div><dt>Remaining</dt><dd id="eco-nft-remaining">—</dd></div><div><dt>Price per NFT</dt><dd id="eco-nft-price">—</dd></div><div><dt>Your NFTs</dt><dd id="eco-nft-owned">Connect wallet</dd></div></dl><label class="eco-nfts-quantity" for="eco-nft-quantity">Quantity<input id="eco-nft-quantity" type="number" inputmode="numeric" min="1" max="10000" step="1" value="1"></label><div class="eco-nfts-total"><span>Mint total</span><strong id="eco-nft-total">—</strong></div><button class="eco-nfts-primary" id="eco-nft-mint" type="button" disabled>Loading mint…</button><p id="eco-nft-status" class="eco-nfts-status" role="status" aria-live="polite">Checking price and availability…</p><a id="eco-nft-tx" hidden target="_blank" rel="noopener noreferrer">View mint transaction ↗</a><button class="eco-nfts-farm" id="eco-nft-open-farm" type="button">Open CashX NFT farm →</button><p id="eco-nft-updated" class="eco-nfts-note">Live values load when this tab opens.</p><div class="eco-nfts-links"><a href="https://scan.pulsechain.com/address/${COLLECTION}" target="_blank" rel="noopener noreferrer">Collection contract ↗</a><a id="eco-nft-treasury" href="https://scan.pulsechain.com/address/0x8875b605ad560792FC8420F901235961d863F62e" target="_blank" rel="noopener noreferrer">Mint treasury ↗</a></div></div></article>
      <article class="eco-nfts-card"><div class="eco-nfts-art"><img src="cashmoney-nft-header.png" alt="CashMoney NFT collection artwork" loading="lazy"><span>Legacy collection · mint retired</span></div><div class="eco-nfts-body"><h2>CashMoney NFT</h2><p>Part of the ecosystem’s history, with an NFT farm for existing holders. Its former mint is retired.</p><dl class="eco-nfts-stats"><div><dt>Your NFTs</dt><dd id="cashmoney-nft-owned">Connect wallet</dd></div><div><dt>Farm</dt><dd>Nexion · pool #0</dd></div></dl><button class="eco-nfts-primary" id="cashmoney-nft-open-farm" type="button">Open CashMoney NFT farm →</button><p class="eco-nfts-note">View staked NFTs, claim available rewards, stake or unstake from the farm.</p><div class="eco-nfts-links"><a href="https://scan.pulsechain.com/address/${CASHMONEY}" target="_blank" rel="noopener noreferrer">Collection contract ↗</a></div></div></article></div>`;
      $('eco-nft-refresh').addEventListener('click', refresh);
      $('eco-nft-quantity').addEventListener('input', updateControls);
      $('eco-nft-mint').addEventListener('click', mint);
      $('eco-nft-open-farm').addEventListener('click', () => openFarm('cashx'));
      $('cashmoney-nft-open-farm').addEventListener('click', () => openFarm('cashmoney'));
      for (const image of host.querySelectorAll('img')) image.addEventListener('error', () => { image.hidden = true; });
      $('eco-nft-artwork').addEventListener('error', () => {
        $('eco-nft-artwork').hidden = true;
        $('eco-nft-art-fallback').hidden = false;
      });
      getTracker();
    }
    root.clearInterval(timer);
    timer = root.setInterval(() => {
      if (!active || root.document.hidden) return;
      if (currentWallet() !== displayWalletSeen) updateControls();
      if (currentWallet() !== walletSeen) void readWallet();
      if (Date.now() - lastRefresh > 60000) void refresh();
    }, 3000);
    void refresh();
  }
  function deactivate() { active = false; accountRead++; root.clearInterval(timer); }
  const api = {init, deactivate, mint, mintRequest, COLLECTION, CASHMONEY, ABI};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EcosystemNFTs = api;
})(typeof window === 'undefined' ? globalThis : window);
