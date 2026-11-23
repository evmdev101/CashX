import fs from "node:fs";
import { createPublicClient, getAddress, http } from "viem";

const config = JSON.parse(
  fs.readFileSync(new URL("../contracts/deployment/pulsechain-pools.json", import.meta.url), "utf8"),
);

const pulsechain = {
  id: 369,
  name: "PulseChain",
  nativeCurrency: { name: "Pulse", symbol: "PLS", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.pulsechain.com"] } },
};

const client = createPublicClient({ chain: pulsechain, transport: http() });
const expectedOwner = getAddress(config.owner);
const activationIssues = [];

const tokenAbi = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
];

const limitedAbi = [
  ...tokenAbi,
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "minter", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "mintingFinalized", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
];

const routerAbi = [
  { type: "function", name: "WPLS", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
];

const exchangeAbi = [
  { type: "function", name: "burnToken", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "limitedToken", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "pulseXRouter", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "wrappedPls", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "treasury", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "managementWallet", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "paused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "BURN_BPS", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "SWAP_BPS", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "MANAGEMENT_MINT_BPS", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
];

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

const router = getAddress(config.pulseXRouter);
const wrappedPls = getAddress(config.wrappedPls);
const routerCode = await client.getCode({ address: router });
requireValue(routerCode && routerCode !== "0x", `No contract code at PulseX router ${router}`);
const routerWrappedPls = await client.readContract({ address: router, abi: routerAbi, functionName: "WPLS" });
requireValue(
  routerWrappedPls.toLowerCase() === wrappedPls.toLowerCase(),
  `Router WPLS mismatch: expected ${wrappedPls}, received ${routerWrappedPls}`,
);

for (const [key, pool] of Object.entries(config.pools)) {
  const original = getAddress(pool.originalToken);
  const limited = getAddress(pool.limitedToken);
  const exchange = getAddress(pool.burnExchange);
  const [originalCode, limitedCode, exchangeCode] = await Promise.all([
    client.getCode({ address: original }),
    client.getCode({ address: limited }),
    client.getCode({ address: exchange }),
  ]);
  requireValue(originalCode && originalCode !== "0x", `${key}: no original-token code at ${original}`);
  requireValue(limitedCode && limitedCode !== "0x", `${key}: no Limited-token code at ${limited}`);
  requireValue(exchangeCode && exchangeCode !== "0x", `${key}: no exchange code at ${exchange}`);

  const [
    originalName,
    originalSymbol,
    originalDecimals,
    limitedName,
    limitedSymbol,
    limitedDecimals,
    limitedSupply,
    owner,
    minter,
    mintingFinalized,
    exchangeOriginal,
    exchangeLimited,
    exchangeRouter,
    exchangeWrappedPls,
    exchangeTreasury,
    exchangeManagementWallet,
    exchangeOwner,
    exchangePaused,
    burnBps,
    swapBps,
    managementMintBps,
  ] = await Promise.all([
    client.readContract({ address: original, abi: tokenAbi, functionName: "name" }),
    client.readContract({ address: original, abi: tokenAbi, functionName: "symbol" }),
    client.readContract({ address: original, abi: tokenAbi, functionName: "decimals" }),
    client.readContract({ address: limited, abi: limitedAbi, functionName: "name" }),
    client.readContract({ address: limited, abi: limitedAbi, functionName: "symbol" }),
    client.readContract({ address: limited, abi: limitedAbi, functionName: "decimals" }),
    client.readContract({ address: limited, abi: limitedAbi, functionName: "totalSupply" }),
    client.readContract({ address: limited, abi: limitedAbi, functionName: "owner" }),
    client.readContract({ address: limited, abi: limitedAbi, functionName: "minter" }),
    client.readContract({ address: limited, abi: limitedAbi, functionName: "mintingFinalized" }),
    client.readContract({ address: exchange, abi: exchangeAbi, functionName: "burnToken" }),
    client.readContract({ address: exchange, abi: exchangeAbi, functionName: "limitedToken" }),
    client.readContract({ address: exchange, abi: exchangeAbi, functionName: "pulseXRouter" }),
    client.readContract({ address: exchange, abi: exchangeAbi, functionName: "wrappedPls" }),
    client.readContract({ address: exchange, abi: exchangeAbi, functionName: "treasury" }),
    client.readContract({ address: exchange, abi: exchangeAbi, functionName: "managementWallet" }),
    client.readContract({ address: exchange, abi: exchangeAbi, functionName: "owner" }),
    client.readContract({ address: exchange, abi: exchangeAbi, functionName: "paused" }),
    client.readContract({ address: exchange, abi: exchangeAbi, functionName: "BURN_BPS" }),
    client.readContract({ address: exchange, abi: exchangeAbi, functionName: "SWAP_BPS" }),
    client.readContract({ address: exchange, abi: exchangeAbi, functionName: "MANAGEMENT_MINT_BPS" }),
  ]);

  requireValue(
    originalDecimals === limitedDecimals,
    `${key}: decimal mismatch (${originalDecimals} original, ${limitedDecimals} Limited)`,
  );
  requireValue(!mintingFinalized, `${key}: Limited-token minting has been finalized`);
  requireValue(
    owner.toLowerCase() === expectedOwner.toLowerCase(),
    `${key}: Limited-token owner mismatch (expected ${expectedOwner}, received ${owner})`,
  );
  requireValue(
    minter !== "0x0000000000000000000000000000000000000000",
    `${key}: Limited-token minter is the zero address`,
  );
  if (minter.toLowerCase() !== exchange.toLowerCase()) {
    activationIssues.push(`${key}: set Limited-token minter to ${exchange} (currently ${minter})`);
  }
  requireValue(exchangeOriginal.toLowerCase() === original.toLowerCase(), `${key}: exchange original-token mismatch`);
  requireValue(exchangeLimited.toLowerCase() === limited.toLowerCase(), `${key}: exchange Limited-token mismatch`);
  requireValue(exchangeRouter.toLowerCase() === router.toLowerCase(), `${key}: exchange router mismatch`);
  requireValue(exchangeWrappedPls.toLowerCase() === wrappedPls.toLowerCase(), `${key}: exchange WPLS mismatch`);
  requireValue(exchangeTreasury.toLowerCase() === getAddress(config.treasury).toLowerCase(), `${key}: exchange treasury mismatch`);
  requireValue(
    exchangeManagementWallet.toLowerCase() === getAddress(config.managementWallet).toLowerCase(),
    `${key}: exchange management-wallet mismatch`,
  );
  requireValue(exchangeOwner.toLowerCase() === expectedOwner.toLowerCase(), `${key}: exchange owner mismatch`);
  requireValue(!exchangePaused, `${key}: exchange is paused`);
  requireValue(burnBps === 8_000n, `${key}: exchange burn rate is not 80%`);
  requireValue(swapBps === 2_000n, `${key}: exchange swap rate is not 20%`);
  requireValue(managementMintBps === 500n, `${key}: management mint is not 5%`);

  process.stdout.write(
    `${key}: ${originalName} (${originalSymbol}) -> ${limitedName} (${limitedSymbol}), `
      + `${originalDecimals} decimals, exchange ${exchange}, Limited supply ${limitedSupply}, owner ${owner}, minter ${minter}\n`,
  );
}

process.stdout.write(`PulseX router ${router} uses WPLS ${wrappedPls}.\n`);

if (activationIssues.length > 0) {
  process.stderr.write(`Exchange contracts are configured correctly but not activated:\n- ${activationIssues.join("\n- ")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Production address and minter checks passed.\n");
}
