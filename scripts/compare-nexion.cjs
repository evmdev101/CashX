// Read-only comparison at one block; no wallet or transactions.
// Nexion formulas: see nexion-valuation-notes.md. Run: node scripts/compare-nexion.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ethers = require('../vendor/ethers.umd.min.js');
const source = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
function section(a, b) {
  const start = source.indexOf(a), end = source.indexOf(b, start + a.length);
  assert.ok(start >= 0 && end > start, a);
  return source.slice(start, end);
}
const constants = {};
for (const [, name, value] of source.matchAll(/const (\w+)\s*=\s*'(0x[0-9a-fA-F]{40})';/g)) constants[name] = value;
const ctx = vm.createContext({ ...constants, ethers, console,
  fmtUsd: value => value, fmtFarmFixed: (raw, _, dec = 18) => ethers.formatUnits(raw, dec),
  formatFarmPoolSharePercent: () => '', prettyFarmSymbol: s => s === 'PHEX' ? 'pHEX' : s,
});
vm.runInContext(section('  const FARMS = [', '  let wProvider') +
  section('  const TOKEN_ADDRESSES = {', '  function farmRewardSymbol(') +
  section('  function farmRewardSymbol(', '  function farmRewardAddress(') +
  section('  function farmRewardAddress(', '  function') +
  section('  function poolValue(', '  function formatBp(') +
  section('  function remainingRewardParams(', '  function formatFarmPoolSharePercent(') +
  section('  function nexionPendingUsd(', '  function formatCountdown(') +
  section('  const FARM_ABI = [', '  const FARM_TIME_ABI') +
  '\nglobalThis.farms = FARMS; globalThis.abi = FARM_ABI;', ctx);

async function main() {
  const request = new ethers.FetchRequest('https://rpc.pulsechain.com');
  request.timeout = 20000;
  const provider = new ethers.JsonRpcProvider(request, 369, { staticNetwork: true });
  try {
    const block = await provider.getBlock('latest');
    ctx.Date = class extends Date { static now() { return block.timestamp * 1000; } };
    const opts = { blockTag: block.number };
    const contract = new ethers.Contract(constants.FARM_CONTRACT, ctx.abi, provider);
    const calculator = new ethers.Contract(constants.NEXION_LP_CALCULATOR, [
      'function getBatchPrice(address[]) view returns (uint256[])',
      'function getBatchLpValue(address[]) view returns (uint256[])',
    ], provider);
    const rows = [];
    for (const [label, pid] of [['#200', 15], ['#240', 55], ['#257', 72]]) {
      const farm = ctx.farms.find(f => f.label === label);
      const pool = await contract.poolInfo(pid, opts);
      assert.equal(pool.lpToken.toLowerCase(), farm.lp.toLowerCase());
      assert.equal(pool.rewardToken.toLowerCase(), ctx.farmRewardAddress(farm, pool).toLowerCase());
      const token = new ethers.Contract(pool.rewardToken, ['function decimals() view returns (uint8)'], provider);
      const [[stakePrice], [rewardPrice], decimals] = await Promise.all([
        farm.single ? calculator.getBatchPrice([farm.lp], opts) : calculator.getBatchLpValue([farm.lp], opts),
        calculator.getBatchPrice([pool.rewardToken], opts), token.decimals(opts),
      ]);
      const dec = Number(decimals);
      assert.equal(ctx.farmTokenDec(pool.rewardToken), dec);
      // Controlled claimable amount tests the USD conversion, not a user's wallet balance.
      const pending = ethers.parseUnits('10', dec);
      const actual = await ctx.fetchNexionValuation(null, farm, pool, pool.lpSupply,
        pool.lpSupply / 100n, pending, { stakeScaledPrice: stakePrice, rewardScaledPrice: rewardPrice });
      assert.ok(actual);
      const duration = Number(pool.endTime - pool.startTime);
      const secondsLeft = Math.max(Number(pool.endTime) - block.timestamp, 0);
      const remainingRaw = Math.floor(Number(pool.totalRewards) * (secondsLeft / duration));
      const remainingUsd = remainingRaw / 10 ** dec * Number(rewardPrice) / 1e18;
      const stakedUsd = Number(pool.lpSupply) / 1e18 * Number(stakePrice) / 1e18;
      const tvl = stakedUsd + remainingUsd;
      const apr = stakedUsd > .01 && remainingUsd > 0 && secondsLeft > 0
        ? Math.min(remainingUsd * (365 / (secondsLeft / 86400)) / stakedUsd * 100, 1e6) : 0;
      const pendingUsd = 10 * remainingUsd / (Number(pool.totalRewards) / 10 ** dec);
      for (const [key, expected] of [['tvl', tvl], ['remainingRewardsUsd', remainingUsd], ['pendingUsd', pendingUsd]]) {
        assert.ok(Math.abs(actual[key] - expected) < 1e-8 * Math.max(1, Math.abs(expected)), `${label} ${key}`);
      }
      assert.equal(actual.apr, `${apr.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);
      rows.push({ label, farm: farm.name, reward: actual.rewardSymbol, decimals: dec,
        tvlUsd: tvl, apr: actual.apr, testTenPendingTokensUsd: pendingUsd, matched: true });
    }
    const report = { block: block.number, timestamp: new Date(block.timestamp * 1000).toISOString(),
      scope: 'Same-block public farm inputs; Nexion formula comparison. Claimable uses 10 test tokens, not a wallet.', rows };
    fs.writeFileSync(path.join(__dirname, 'nexion-comparison.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } finally { provider.destroy(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
