import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

async function productionBuild() {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  const assetDirectory = new URL("../dist/assets/", import.meta.url);
  const scripts = (await readdir(assetDirectory)).filter((name) => name.endsWith(".js"));
  const bundles = await Promise.all(
    scripts.map((name) => readFile(new URL(name, assetDirectory), "utf8")),
  );

  return { html, bundle: bundles.join("\n") };
}

test("builds the mainnet CashX mint experience for static hosting", async () => {
  const { html, bundle } = await productionBuild();
  assert.match(html, /<title>CashX Ecosystem NFT Mint<\/title>/i);
  assert.match(html, /evmdev101\.github\.io\/cashx-10000-nft-mint/);
  assert.match(bundle, /Mint Overview/);
  assert.match(bundle, /Connect wallet/);
  assert.match(bundle, /0x744351E2846498D040B649D694CAB21f32f14AFe/);
  assert.match(bundle, /27306495/);
  assert.match(bundle, /1000000/);
  assert.doesNotMatch(`${html}\n${bundle}`, /codex-preview|Building your site|react-loading-skeleton/i);
});

test("shows the active Nexion farm with explicit wallet transaction flows", async () => {
  const [experience, css, packageJson] = await Promise.all([
    readFile(new URL("../app/MintExperience.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(experience, /type PageView = "mint" \| "farm"/);
  assert.match(experience, /https:\/\/nexionpulse\.com\/farmexplorer/);
  assert.match(experience, /NEXION_NFT_POOL_ID = 1/);
  assert.match(experience, /farm\.poolInfo\(NEXION_NFT_POOL_ID\)/);
  assert.match(experience, /farm\.getPoolRewards\(NEXION_NFT_POOL_ID\)/);
  assert.match(experience, /farm\.getUserStakedTokens\(NEXION_NFT_POOL_ID, walletAddress\)/);
  assert.match(experience, /farm\.pendingRewards\(NEXION_NFT_POOL_ID, walletAddress\)/);
  assert.match(experience, /priceCalculator\.getBatchPrice/);
  assert.match(experience, /Select CashX Ecosystem NFTs to/);
  assert.match(experience, /Selected: \{selectedTokens\.size\} \/ \{pickerTokens\.length\}/);
  assert.match(experience, /nft\.setApprovalForAll\(NEXION_NFT_FARM_ADDRESS, true\)/);
  assert.match(experience, /farm\.calculateDepositFee/);
  assert.match(experience, /farm\.depositNFTs/);
  assert.match(experience, /farm\.withdrawNFTs/);
  assert.match(experience, /farm\.claimRewards\(NEXION_NFT_POOL_ID\)/);
  assert.match(experience, /await transaction\.wait\(\)/);
  assert.match(experience, /CashX Eco NFT/);
  assert.match(experience, /Remaining Rewards/);
  assert.match(experience, /Pending Rewards/);
  assert.match(experience, /APR Breakdown/);
  assert.match(experience, /NFT Rewards Projection/);
  assert.match(experience, /FARM_PROJECTION_PERIODS/);
  assert.match(experience, /reward\.rewardPerSecond \* BigInt\(projectedSeconds\)/);
  assert.match(experience, /NFT Farm Approved/);
  assert.match(experience, /Time Left/);
  assert.match(experience, /CASHX[\s\S]*DISTROX[\s\S]*DIVX[\s\S]*GSX/);
  assert.match(experience, /pageView === "farm"/);
  assert.match(experience, />\s*Farm\s*</);
  assert.match(css, /\.farm-page\s*\{/);
  assert.match(css, /width:\s*min\(680px, calc\(100% - 24px\)\)/);
  assert.match(css, /\.farm-proto-grid\s*\{/);
  assert.match(css, /\.farm-design-proto \.farm-proto-metric\.farm-proto-rewards/);
  assert.match(css, /\.farm-proto-actions\s*\{/);
  assert.match(css, /\.farm-design-proto \.farm-apr-popover\s*\{/);
  assert.match(css, /\.farm-reward-projection-wrap:hover \.farm-reward-projection-popover/);
  assert.match(css, /\.farm-apr-wrap:focus-within \.farm-apr-popover/);
  assert.match(css, /\.farm-design-proto \.farm-claim-btn:not\(:disabled\)/);
  assert.match(css, /--farm-theme-metric:\s*color-mix\(in srgb, var\(--fg\) 8%, transparent\)/);
  assert.match(css, /--farm-theme-accent:\s*var\(--red\)/);
  assert.match(css, /--farm-theme-text:\s*var\(--fg\)/);
  assert.match(css, /\.farm-picker\s*\{[\s\S]*position:\s*fixed/);
  assert.match(css, /\.farm-picker-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(4/);
  assert.match(css, /\.farm-picker-token\.selected/);
  assert.match(css, /\.farm-picker-submit/);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*\.farm-proto-metric/);
  assert.doesNotMatch(experience, /Awaiting Nexion setup|This preview cannot submit staking transactions/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("starts with Cyberpunk colors and the Constellations animation", async () => {
  const [themes, experience] = await Promise.all([
    readFile(new URL("../app/themes.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/MintExperience.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(themes, /export const DEFAULT_THEME = 'cyberpunk'/);
  assert.match(themes, /cyberpunk:\s*'constellations'/);
  assert.match(experience, /useState\(DEFAULT_THEME\)/);
  assert.match(experience, /useState\(THEMES\[DEFAULT_THEME\]\)/);
  assert.match(experience, /useState\(\(\) => defaultFx\(DEFAULT_THEME\)\)/);
});

test("loads holders and mint activity from the deployed contract", async () => {
  const [experience, contract, css] = await Promise.all([
    readFile(new URL("../app/MintExperience.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/contract.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(experience, /type Tab = "mint" \| "holders" \| "activity"/);
  assert.match(experience, /readCollectionHistory/);
  assert.match(experience, /contract\.queryFilter\(contract\.filters\.Transfer/);
  assert.match(experience, /NEXION_NFT_FARM_ADDRESS/);
  assert.match(experience, /address: to === farmAddress \? from : to/);
  assert.match(experience, /stakedTokenIds/);
  assert.match(experience, /Recent Mints/);
  assert.match(experience, /CashX NFT Holders/);
  assert.doesNotMatch(experience, /Live on PulseChain · Wallet \+ Nexion staked/);
  assert.match(experience, /className="holder-rank"/);
  assert.match(experience, /className="holder-staked"/);
  assert.match(experience, /className="holder-owned"/);
  assert.match(experience, /className="holder-share"/);
  assert.match(experience, /aria-label="Ranked CashX NFT holders"/);
  assert.doesNotMatch(experience, /holder-items|CashX #\$\{tokenId\}/);
  assert.match(contract, /event Transfer/);
  assert.match(contract, /event Minted/);
  assert.match(css, /\.holders-table/);
  assert.match(css, /\.holders-table\s*\{[\s\S]*overflow-y:\s*auto/);
  assert.match(css, /\.holders-header\s*\{[\s\S]*position:\s*sticky/);
  assert.match(css, /\.holders-table::-webkit-scrollbar-thumb/);
  assert.match(css, /\.holder-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(220px, 1fr\) minmax\(80px, 150px\) 90px/);
  assert.match(css, /\.holder-staked/);
  assert.match(css, /\.activity-row/);
});

test("reports the PLS raised and mint progress instead of a static supply box", async () => {
  const [experience, css] = await Promise.all([
    readFile(new URL("../app/MintExperience.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(experience, /label="PLS raised"/);
  assert.match(experience, /const raised = mintPrice \* BigInt\(minted\)/);
  assert.match(experience, /const raiseGoal = mintPrice \* BigInt\(COLLECTION_SIZE\)/);
  assert.match(experience, /Items minted/);
  assert.match(experience, /role="progressbar"/);
  assert.match(css, /\.mint-progress-track\s*\{/);
  assert.match(css, /\.mint-progress-fill\s*\{/);

  // The replaced supply box and its captions should be gone.
  assert.doesNotMatch(experience, /label="Total supply"/);
  assert.doesNotMatch(experience, /Shared edition collection/);
  assert.doesNotMatch(experience, /chainName\} price/);
});

test("tilts the artwork with a toggleable light and honors reduced motion", async () => {
  const [tilt, experience, css] = await Promise.all([
    readFile(new URL("../app/TiltCard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/MintExperience.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(tilt, /requestAnimationFrame/);
  assert.match(tilt, /onPointerMove/);
  assert.match(tilt, /rotateY\(\$\{s\.cx \* MAX_TILT\}deg\)/);
  assert.match(tilt, /prefers-reduced-motion: reduce/);
  assert.match(tilt, /\{light && <div className="tilt-glare"/);
  assert.match(experience, /Light \{lightOn \? "On" : "Off"\}/);
  assert.match(css, /\.tilt-card\s*\{/);
  assert.match(css, /perspective: 1100px/);
  assert.match(css, /mix-blend-mode: screen/);
});

test("lists the verified contracts and answers the mint FAQ", async () => {
  const [experience, contract, css] = await Promise.all([
    readFile(new URL("../app/MintExperience.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/contract.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(contract, /0x8875b605ad560792FC8420F901235961d863F62e/);
  assert.match(experience, /IMPORTANT_CONTRACTS\.map/);
  assert.match(experience, /Important contracts/);
  assert.match(experience, /buildFaqs\(/);
  assert.match(experience, /Your CashX NFTs/);
  assert.match(experience, /contract\.balanceOf\(address\)/);
  assert.match(css, /\.faq-item\s*\{/);
  assert.match(css, /\.wallet-balances\s*\{/);
  assert.match(css, /\.contract-link-row\s*\{/);
});

test("offers a local wallet disconnect without altering the browser wallet", async () => {
  const [experience, css] = await Promise.all([
    readFile(new URL("../app/MintExperience.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(experience, /Wallet disconnected from this site\./);
  assert.match(experience, /Copy Address/);
  assert.match(experience, /Disconnect/);
  assert.match(experience, /navigator\.clipboard\.writeText\(walletAddress\)/);
  assert.match(experience, /setWalletAddress\(""\)/);
  assert.match(experience, /rpcProvider\.getBalance\(address\)/);
  assert.match(experience, /wallet-modal-backdrop/);
  assert.match(css, /\.wallet-popover\s*\{/);
  assert.match(css, /\.wallet-popover-actions\s*\{/);
  assert.match(css, /\.wallet-modal-backdrop\s*\{/);
});

test("allows a typed mint quantity up to the remaining supply", async () => {
  const experience = await readFile(
    new URL("../app/MintExperience.tsx", import.meta.url),
    "utf8",
  );

  assert.match(experience, /type="number"/);
  assert.match(experience, /aria-label="NFT quantity"/);
  assert.match(experience, /max=\{Math\.max\(1, remaining\)\}/);
  assert.match(experience, /Math\.trunc\(nextQuantity\)/);
});

test("pins the verified deployment values for the mainnet site build", async () => {
  const contract = await readFile(
    new URL("../app/contract.ts", import.meta.url),
    "utf8",
  );

  assert.match(contract, /NEXT_PUBLIC_CASHX_CHAIN_ID/);
  assert.match(contract, /NEXT_PUBLIC_CASHX_CONTRACT_ADDRESS/);
  assert.match(contract, /NEXT_PUBLIC_CASHX_DEPLOYMENT_BLOCK/);
  assert.match(contract, /configuredChainId === 369/);
  assert.match(contract, /https:\/\/rpc\.pulsechain\.com/);
  assert.match(contract, /1000000000000000000000000/);
  assert.match(contract, /0x744351E2846498D040B649D694CAB21f32f14AFe/);
  assert.match(contract, /27_306_495/);

  const validator = await readFile(
    new URL("../scripts/validate-site-config.mjs", import.meta.url),
    "utf8",
  );
  assert.match(validator, /Mainnet build refused/);
  assert.match(validator, /chainId === "369"/);
  assert.match(validator, /0x744351E2846498D040B649D694CAB21f32f14AFe/);
});
