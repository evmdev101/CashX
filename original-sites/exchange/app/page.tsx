import LimitedTokenInsights, { type LimitedTokenInsightView } from "./LimitedTokenInsights";
import LimitedFarms from "./LimitedFarms";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  formatUnits,
  http,
  parseUnits,
  zeroAddress,
  type Address,
  type EIP1193Provider,
  type Hash,
} from "viem";
import ThemePicker from "./ThemePicker";

const pulsechain = defineChain({
  id: 369,
  name: "PulseChain",
  nativeCurrency: { name: "Pulse", symbol: "PLS", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.pulsechain.com"] } },
  blockExplorers: {
    default: { name: "PulseChain Scan", url: "https://scan.pulsechain.com" },
  },
});

const publicClient = createPublicClient({ chain: pulsechain, transport: http() });

const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const limitedTokenAbi = [
  {
    type: "function",
    name: "minter",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const burnExchangeAbi = [
  {
    type: "function",
    name: "burnAndMint",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "burnAndClaim",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "fund",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [{ name: "received", type: "uint256" }],
  },
  {
    type: "function",
    name: "reserve",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalBurned",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalLimitedDistributed",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalLimitedMinted",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalTreasurySent",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "exchangeCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "uniqueExchangers",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const swapBurnMintExchangeAbi = [
  {
    type: "function",
    name: "burnAndMint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "minPlsOut", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "quotePlsOut",
    stateMutability: "view",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [{ name: "expectedPlsOut", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalBurned",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalOriginalSwapped",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalPlsToTreasury",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalLimitedMintedToUsers",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalLimitedMintedToManagement",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "exchangeCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "paused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

type Pair = {
  key: string;
  burn: string;
  receive: string;
  label: string;
  logo: string;
  receiveLogo: string;
  decimals: number;
  burnAddress: Address;
  receiveAddress: Address;
  exchangeAddress: Address;
  mintOnDemand?: boolean;
  swapToPls?: boolean;
  maxWebsiteTestAmount?: bigint;
};

type PoolStats = {
  totalBurned: bigint;
  totalDistributed: bigint;
  totalTreasurySent: bigint;
  totalOriginalSwapped: bigint;
  totalPlsToTreasury: bigint;
  totalManagementMinted: bigint;
  exchanges: bigint;
  uniqueExchangers: bigint;
};

type TransactionStage = "ready" | "approving" | "exchanging" | "confirmed";
type SiteView = "exchange" | "farms";
type MintSectionView = "mint" | LimitedTokenInsightView;

type BrowserWalletProvider = EIP1193Provider & {
  providers?: BrowserWalletProvider[];
  isMetaMask?: boolean;
  isRabby?: boolean;
  isPhantom?: boolean;
  isCoinbaseWallet?: boolean;
  isBraveWallet?: boolean;
  isTrust?: boolean;
  isTrustWallet?: boolean;
  isInternetMoney?: boolean;
  isInternetMoneyWallet?: boolean;
  isIMWallet?: boolean;
  isSafePal?: boolean;
  isSafePalWallet?: boolean;
  isOkxWallet?: boolean;
  isOKXWallet?: boolean;
  isZKXWallet?: boolean;
  isZkxWallet?: boolean;
  isZerion?: boolean;
  isZerionWallet?: boolean;
  isUniswapWallet?: boolean;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

type Eip6963ProviderInfo = {
  uuid: string;
  name: string;
  icon?: string;
  rdns?: string;
};

type Eip6963ProviderDetail = {
  info: Eip6963ProviderInfo;
  provider: BrowserWalletProvider;
};

type WalletOption = {
  key: string;
  name: string;
  provider: BrowserWalletProvider | null;
  icon: string;
  description: string;
};

const emptyStats: PoolStats = {
  totalBurned: 0n,
  totalDistributed: 0n,
  totalTreasurySent: 0n,
  totalOriginalSwapped: 0n,
  totalPlsToTreasury: 0n,
  totalManagementMinted: 0n,
  exchanges: 0n,
  uniqueExchangers: 0n,
};

// PulseChain token and exchange addresses.
const publicAsset = (path: string) =>
  `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;

const cashXWalletAsset = (path: string) =>
  `https://raw.githubusercontent.com/evmdev101/CashX/main/${path}`;

const walletCatalog: WalletOption[] = [
  { key: "metamask", name: "MetaMask", provider: null, icon: cashXWalletAsset("metamask-wallet-icon.svg"), description: "MetaMask browser wallet" },
  { key: "internet-money", name: "Internet Money Wallet", provider: null, icon: cashXWalletAsset("internetmoneywallet.png"), description: "Internet Money browser wallet" },
  { key: "rabby", name: "Rabby Wallet", provider: null, icon: cashXWalletAsset("rabby-clean.png"), description: "Rabby browser wallet" },
  { key: "safepal", name: "SafePal Wallet", provider: null, icon: publicAsset("safepal-wallet.svg"), description: "SafePal browser wallet" },
];

const walletPreferenceStorageKey = "limited-exchange.wallet-provider";
const liveStatsPollingInterval = 4_000;

// The original tokens run reflection and dividend loops inside every transfer, so the
// same exchange can cost two to three times more gas in one block than in the next.
// A wallet estimate taken seconds before the trade mines is routinely too low, and the
// shortfall surfaces as an out-of-gas revert inside the PulseX router rather than as a
// readable error. Unused gas is refunded, so padding the limit only raises the balance
// the wallet checks upfront - it does not raise the fee the trade actually costs.
const exchangeGasMultiplier = 3n;
const exchangeGasFloor = 4_000_000n;
const exchangeGasCeiling = 20_000_000n; // PulseChain blocks allow 45,000,000
const approvalGasMultiplier = 2n;
const approvalGasFloor = 400_000n;

// Every revert the exchange can produce, keyed by its four-byte selector. The exchange
// ABIs above carry only functions, so viem cannot name these on its own and the raw
// selector is all that reaches the browser. Anything marked retryable is a transient
// PulseChain condition rather than a problem with what the user asked for.
const exchangeRevertReasons: Record<string, { retryable: boolean; describe: (pair: Pair) => string }> = {
  // ExactOriginalRequired - the originals pay holders passively, so the exchange balance
  // can tick up mid-trade and the deployed contract rejects the whole exchange.
  "0x3c5583b1": { retryable: true, describe: () => "PulseChain credited reflection dust in the middle of the trade, so the exchange turned it down. No tokens were exchanged - press Try again." },
  // ExactBurnRequired
  "0x538c0ddb": { retryable: true, describe: (pair) => `The ${pair.burn} burn settled at a different size than expected. No tokens were exchanged - press Try again.` },
  // InvalidSupplyChange
  "0x09b0df66": { retryable: true, describe: (pair) => `${pair.burn} supply moved while the trade was being built. No tokens were exchanged - press Try again.` },
  // RouterDidNotUseFullAllowance
  "0x81397d17": { retryable: true, describe: () => "PulseX did not take the full swap amount. No tokens were exchanged - press Try again." },
  // RouterDidNotSpendExactOriginal - the migrated exchanges use the older
  // balance check, which can reject harmless reflection dust after the swap.
  "0x3848b495": { retryable: true, describe: () => "The token balance changed during the PulseX swap, so the exchange was cancelled. No tokens were exchanged - press Try again." },
  // PlsTreasuryShortfall
  "0x780a55f6": { retryable: true, describe: () => "The PulseX price moved while you were confirming. No tokens were exchanged - press Try again." },
  // ExactMintRequired
  "0x4a4e295d": { retryable: true, describe: (pair) => `The ${pair.receive} mint returned an unexpected amount. No tokens were exchanged - press Try again.` },
  // ExactMintSupplyRequired
  "0x88b5d27e": { retryable: true, describe: (pair) => `The ${pair.receive} mint returned an unexpected supply. No tokens were exchanged - press Try again.` },
  // ZeroMinimumOutput
  "0x501e45b2": { retryable: true, describe: () => "The PulseX quote came back empty. Give it a moment and press Try again." },
  // ERC20InsufficientAllowance
  "0xfb8f41b2": { retryable: true, describe: (pair) => `The ${pair.burn} approval has not landed yet. Give it a few seconds and press Try again.` },
  // ExchangeIsNotMinter
  "0x0af46499": { retryable: false, describe: (pair) => `The ${pair.receive} creator must set its minter to this exchange contract first.` },
  // EnforcedPause
  "0xd93c0665": { retryable: false, describe: (pair) => `The ${pair.receive} exchange is temporarily paused.` },
  // AmountTooSmall
  "0xc2f5625a": { retryable: false, describe: () => "That amount is too small to split across the burn, the swap and the management mint." },
  // ZeroAmount
  "0x1f2a2005": { retryable: false, describe: () => "Enter an amount greater than zero." },
};

/// Walks the cause chain of a viem or wallet error looking for a selector we recognise.
function revertSelector(error: unknown) {
  const seen: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current != null && depth < 12; depth += 1) {
    if (typeof current === "string") {
      seen.push(current);
      break;
    }
    if (typeof current !== "object") break;
    const record = current as Record<string, unknown>;
    for (const key of ["message", "shortMessage", "details", "reason", "data"]) {
      const value = record[key];
      if (typeof value === "string") seen.push(value);
      else if (value && typeof value === "object") {
        const nested = (value as { data?: unknown }).data;
        if (typeof nested === "string") seen.push(nested);
      }
    }
    current = record.cause;
  }
  const blob = seen.join(" ");
  return Object.keys(exchangeRevertReasons).find((selector) => blob.includes(selector));
}

function isKnownRevert(error: unknown) {
  return revertSelector(error) !== undefined;
}

function describeExchangeFailure(error: unknown, pair: Pair) {
  const selector = revertSelector(error);
  if (!selector) return null;
  const reason = exchangeRevertReasons[selector];
  return { message: reason.describe(pair), retryable: reason.retryable };
}

function isWalletRejection(error: unknown) {
  if ((error as { code?: number } | null)?.code === 4001) return true;
  const message = error instanceof Error ? error.message : "";
  return /user rejected|user denied|rejected the request/i.test(message);
}

async function gasWithHeadroom(
  estimate: () => Promise<bigint>,
  multiplier: bigint,
  floor: bigint,
) {
  let limit = floor;
  try {
    limit = (await estimate()) * multiplier;
  } catch (error) {
    // This estimate doubles as a dry run. A revert we recognise means the trade cannot
    // succeed against current state, so let it through rather than asking the user to
    // sign and pay for a transaction that is already known to fail.
    if (isKnownRevert(error)) throw error;
    // Anything else - a flaky RPC, a node that refuses to simulate - is not evidence
    // the trade is bad, so fall back to the floor and let the wallet decide.
  }
  if (limit < floor) limit = floor;
  return limit > exchangeGasCeiling ? exchangeGasCeiling : limit;
}

const pairs: Pair[] = [
  { key: "cashx", burn: "CashX", receive: "LCASHX", label: "Limited CashX", logo: publicAsset("tokens/cashx.png"), receiveLogo: publicAsset("tokens/lcashx.png"), decimals: 18, burnAddress: "0x510c547318032275e41D1362A465783320d8152f", receiveAddress: "0x57cBC908078b291117242385Fe7C0cf3582fA460", exchangeAddress: "0xE346B08433BE131A7964a7e1F46c6fC28eC69003", mintOnDemand: true, swapToPls: true },
  { key: "distrox", burn: "DistroX", receive: "LdistroX", label: "Limited DistributionX", logo: publicAsset("tokens/distrox.jpg"), receiveLogo: publicAsset("tokens/ldistrox.png"), decimals: 18, burnAddress: "0xec03E43e21B337F60F6a63944bC7b61B531c035F", receiveAddress: "0xfC961146971679Cc4E731F60D72B60eb3dd8b036", exchangeAddress: "0x3EbC49f2e89260655D957774E73440e20e942934", mintOnDemand: true, swapToPls: true },
  { key: "divx", burn: "DivX", receive: "LDIVX", label: "Limited DividendX", logo: publicAsset("tokens/divx.png"), receiveLogo: publicAsset("tokens/ldivx.png"), decimals: 18, burnAddress: "0xB528AFfc72Dfc7Da5d3184C4e233Fc9fc156c4E0", receiveAddress: "0x8DbD0923c0c2dd4973806B655036251610aE11BC", exchangeAddress: "0x2b199B79E84f74e06c1E08baf92249Be4003EBa0", mintOnDemand: true, swapToPls: true },
  { key: "gsx", burn: "GSX", receive: "LGSX", label: "Limited Grand SlamX", logo: publicAsset("tokens/gsx.png"), receiveLogo: publicAsset("tokens/lgsx.png"), decimals: 18, burnAddress: "0xFA490c52FD934c7b8629E30Ea4c14683ee000b5d", receiveAddress: "0xCc6A42F028905096c76E5631aed78e20f5CDDFBa", exchangeAddress: "0x9548c4b026b5B4026C60edd39D17D72EABa97093", mintOnDemand: true, swapToPls: true },
];

const burnSink: Address = "0x000000000000000000000000000000000000dEaD";

declare global {
  interface Window {
    ethereum?: BrowserWalletProvider;
    rabby?: BrowserWalletProvider;
    internetMoney?: BrowserWalletProvider;
    okxwallet?: BrowserWalletProvider;
    safepal?: BrowserWalletProvider;
    safepalProvider?: BrowserWalletProvider;
    zkx?: BrowserWalletProvider;
    phantom?: { ethereum?: BrowserWalletProvider };
  }
}

function walletKeyFromIdentity(name = "", rdns = ""): WalletOption["key"] | null {
  const identity = `${name} ${rdns}`.toLowerCase();
  if (identity.includes("rabby")) return "rabby";
  if (identity.includes("internet money") || identity.includes("internetmoney")) return "internet-money";
  if (identity.includes("metamask") || identity.includes("io.metamask")) return "metamask";
  if (identity.includes("safepal") || identity.includes("safe pal")) return "safepal";
  return null;
}

function isInternetMoneyProvider(provider: BrowserWalletProvider) {
  return Boolean(provider.isInternetMoney || provider.isInternetMoneyWallet || provider.isIMWallet);
}

function isActualMetaMaskProvider(provider: BrowserWalletProvider) {
  return Boolean(
    provider.isMetaMask
    && !provider.isRabby
    && !provider.isPhantom
    && !provider.isCoinbaseWallet
    && !provider.isBraveWallet
    && !provider.isTrust
    && !provider.isTrustWallet
    && !provider.isSafePal
    && !provider.isSafePalWallet
    && !provider.isOkxWallet
    && !provider.isOKXWallet
    && !provider.isZKXWallet
    && !provider.isZkxWallet
    && !provider.isZerion
    && !provider.isZerionWallet
    && !provider.isUniswapWallet
    && provider !== window.phantom?.ethereum,
  );
}

function genericWalletName(provider: BrowserWalletProvider) {
  if (provider.isSafePal || provider.isSafePalWallet) return "SafePal Wallet";
  if (provider.isOkxWallet || provider.isOKXWallet) return "OKX Wallet";
  if (provider.isZKXWallet || provider.isZkxWallet) return "ZKX Wallet";
  if (provider.isZerion || provider.isZerionWallet) return "Zerion Wallet";
  if (provider.isUniswapWallet) return "Uniswap Extension";
  if (provider.isCoinbaseWallet) return "Coinbase Wallet";
  if (provider.isTrust || provider.isTrustWallet) return "Trust Wallet";
  if (provider.isBraveWallet) return "Brave Wallet";
  if (provider.isPhantom || provider === window.phantom?.ethereum) return "Phantom Wallet";
  return "Browser / Mobile Wallet";
}

function walletOptionSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "wallet";
}

function shortAddress(address: Address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatAmount(value: bigint, decimals: number, maximumFractionDigits = 2) {
  return Number(formatUnits(value, decimals)).toLocaleString(undefined, { maximumFractionDigits });
}

function normalizeAmountInput(value: string) {
  const stripped = value.replace(/,/g, "").replace(/[^0-9.]/g, "");
  const [whole = "", ...fractionParts] = stripped.split(".");
  return fractionParts.length > 0 ? `${whole}.${fractionParts.join("")}` : whole;
}

function formatAmountInput(value: string) {
  if (!value) return "";
  const [whole, fraction] = value.split(".");
  const groupedWhole = whole.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === undefined ? groupedWhole : `${groupedWhole}.${fraction}`;
}

function AnimatedStatValue({
  value,
  decimals = 0,
  maximumFractionDigits = 2,
}: {
  value: bigint;
  decimals?: number;
  maximumFractionDigits?: number;
}) {
  const [displayValue, setDisplayValue] = useState(0n);
  const [rolling, setRolling] = useState(false);
  const displayValueRef = useRef(0n);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || displayValueRef.current === value) {
      displayValueRef.current = value;
      setDisplayValue(value);
      return;
    }

    const startValue = displayValueRef.current;
    const difference = value - startValue;
    const startedAt = performance.now();
    const duration = 1_050;
    let frame = 0;

    setRolling(true);

    const animate = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - ((1 - progress) ** 3);
      const scale = BigInt(Math.round(eased * 10_000));
      const nextValue = startValue + ((difference * scale) / 10_000n);

      displayValueRef.current = nextValue;
      setDisplayValue(nextValue);

      if (progress < 1) {
        frame = window.requestAnimationFrame(animate);
      } else {
        displayValueRef.current = value;
        setDisplayValue(value);
        setRolling(false);
      }
    };

    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [value]);

  const formattedValue = decimals > 0
    ? formatAmount(displayValue, decimals, maximumFractionDigits)
    : displayValue.toLocaleString();

  return <strong className={`stat-rolling-value${rolling ? " rolling" : ""}`}>{formattedValue}</strong>;
}

async function waitForPulseChainReceipt(hash: Hash, provider?: BrowserWalletProvider | null) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (provider) {
      const walletReceipt = await provider.request({
        method: "eth_getTransactionReceipt",
        params: [hash],
      }).catch(() => null) as { status?: string } | null;

      if (walletReceipt) {
        if (walletReceipt.status === "0x0") throw new Error("The transaction reverted");
        return;
      }
    }

    const receipt = await publicClient.getTransactionReceipt({ hash }).catch(() => null);
    if (receipt) {
      if (receipt.status === "reverted") throw new Error("The transaction reverted");
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1_500));
  }

  throw new Error(`Transaction submitted, but confirmation is delayed: ${shortAddress(hash)}`);
}

function TransactionProgress({
  stage,
  pair,
}: {
  stage: TransactionStage;
  pair: Pair;
}) {
  const approvalComplete = stage === "exchanging" || stage === "confirmed";
  const exchangeComplete = stage === "confirmed";

  return (
    <div className="transaction-progress" role="status" aria-live="polite">
      <div className={`transaction-progress-step${stage === "ready" || stage === "approving" ? " active" : ""}${approvalComplete ? " complete" : ""}`}>
        <span className="transaction-progress-number" aria-hidden="true">{approvalComplete ? "✓" : "1"}</span>
        <strong>Approve {pair.burn}</strong>
      </div>
      <span className="transaction-progress-arrow" aria-hidden="true">→</span>
      <div className={`transaction-progress-step${stage === "exchanging" ? " active" : ""}${exchangeComplete ? " complete" : ""}`}>
        <span className="transaction-progress-number" aria-hidden="true">{exchangeComplete ? "✓" : "2"}</span>
        <strong>{pair.mintOnDemand ? "Burn & mint" : "Burn & claim"} {pair.receive}</strong>
      </div>
    </div>
  );
}

export default function Home() {
  const [activeView, setActiveView] = useState<SiteView>(() => {
    const hash = window.location.hash.toLowerCase();
    return hash === "#farms" || hash.startsWith("#limited-farm-") ? "farms" : "exchange";
  });
  const [activeKey, setActiveKey] = useState("cashx");
  const [mintSectionViews, setMintSectionViews] = useState<Record<string, MintSectionView>>({});
  const [account, setAccount] = useState<Address | null>(null);
  const [amount, setAmount] = useState("");
  const [reserve, setReserve] = useState<bigint>(0n);
  const [balance, setBalance] = useState<bigint>(0n);
  const [limitedBalance, setLimitedBalance] = useState<bigint>(0n);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [exchangeActivated, setExchangeActivated] = useState(false);
  const [exchangePaused, setExchangePaused] = useState(false);
  const [stats, setStats] = useState<PoolStats>(emptyStats);
  const [transactionStage, setTransactionStage] = useState<TransactionStage>("ready");
  const [retryable, setRetryable] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [copiedAddress, setCopiedAddress] = useState<Address | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);
  const [quickSelectorOpen, setQuickSelectorOpen] = useState(false);
  const quickSelectorRef = useRef<HTMLDivElement>(null);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [walletPickerOpen, setWalletPickerOpen] = useState(false);
  const [walletOptions, setWalletOptions] = useState<WalletOption[]>(walletCatalog);
  const [walletSearch, setWalletSearch] = useState("");
  const [walletProvider, setWalletProvider] = useState<BrowserWalletProvider | null>(null);
  const announcedProviders = useRef<Map<string, Eip6963ProviderDetail>>(new Map());
  const [nativeBalance, setNativeBalance] = useState<bigint>(0n);

  const pair = useMemo(
    () => pairs.find((item) => item.key === activeKey) ?? pairs[0],
    [activeKey],
  );
  const mintSectionView = mintSectionViews[activeKey] ?? "mint";
  const configured = pair.exchangeAddress !== zeroAddress;
  const filteredWalletOptions = useMemo(() => {
    const query = walletSearch.trim().toLowerCase();
    if (!query) return walletOptions;
    return walletOptions.filter((wallet) =>
      `${wallet.name} ${wallet.description}`.toLowerCase().includes(query),
    );
  }, [walletOptions, walletSearch]);

  useEffect(() => {
    const syncViewFromHash = () => {
      const hash = window.location.hash.toLowerCase();
      setActiveView(hash === "#farms" || hash.startsWith("#limited-farm-") ? "farms" : "exchange");
    };

    syncViewFromHash();
    window.addEventListener("hashchange", syncViewFromHash);
    return () => window.removeEventListener("hashchange", syncViewFromHash);
  }, []);

  function selectPair(key: string) {
    const nextPair = pairs.find((item) => item.key === key) ?? pairs[0];
    setActiveKey(nextPair.key);
    setAmount("");
    setReserve(0n);
    setBalance(0n);
    setLimitedBalance(0n);
    setStats(emptyStats);
    setExchangeActivated(false);
    setExchangePaused(false);
    setTransactionStage("ready");
    setRetryable(false);
    setSelectorOpen(false);
    setQuickSelectorOpen(false);
    setStatus("");
  }

  function useMaximumTestAmount() {
    const maximum = pair.maxWebsiteTestAmount && balance > pair.maxWebsiteTestAmount
      ? pair.maxWebsiteTestAmount
      : balance;
    setAmount(formatUnits(maximum, pair.decimals));
  }

  useEffect(() => {
    if (!selectorOpen && !quickSelectorOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (selectorOpen && !selectorRef.current?.contains(target)) {
        setSelectorOpen(false);
      }
      if (quickSelectorOpen && !quickSelectorRef.current?.contains(target)) {
        setQuickSelectorOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectorOpen(false);
        setQuickSelectorOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [quickSelectorOpen, selectorOpen]);

  async function copyAddress(address: Address, label: string) {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(address);
      setStatus(`${label} contract address copied`);
      window.setTimeout(() => setCopiedAddress(null), 1800);
    } catch {
      setStatus("Unable to copy the address. Please copy it from the explorer.");
    }
  }

  async function copyWalletAddress() {
    if (!account) return;
    try {
      await navigator.clipboard.writeText(account);
      setCopiedAddress(account);
      setStatus("Wallet address copied");
      window.setTimeout(() => setCopiedAddress(null), 1800);
    } catch {
      setStatus("Unable to copy the wallet address.");
    }
  }

  async function discoverWallets() {
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    await new Promise((resolve) => window.setTimeout(resolve, 180));

    const detected = new Map<string, WalletOption>();
    const seenProviders = new Set<BrowserWalletProvider>();
    const addProvider = (
      key: string | null,
      provider?: BrowserWalletProvider,
      info?: Pick<Eip6963ProviderInfo, "name" | "icon">,
    ) => {
      if (!provider || typeof provider.request !== "function") return;
      if (!key || detected.has(key) || seenProviders.has(provider)) return;
      const catalogWallet = walletCatalog.find((wallet) => wallet.key === key);
      const detectedName = info?.name || catalogWallet?.name || genericWalletName(provider);
      seenProviders.add(provider);
      detected.set(key, {
        key,
        name: detectedName,
        provider,
        icon: info?.icon || catalogWallet?.icon || publicAsset("wallet-browser.svg"),
        description: "Injected wallet ready to connect",
      });
    };

    // EIP-6963 includes a wallet name and reverse-DNS identity. Prefer that
    // identity over compatibility flags: Phantom and several other wallets
    // intentionally expose `isMetaMask` so older dApps continue to work.
    announcedProviders.current.forEach(({ info, provider }) => {
      const catalogKey = walletKeyFromIdentity(info.name, info.rdns);
      const dynamicKey = `eip6963:${walletOptionSlug(info.rdns || info.name || info.uuid)}`;
      addProvider(catalogKey ?? dynamicKey, provider, info);
    });

    const addLegacyProvider = (provider?: BrowserWalletProvider, suffix = "default") => {
      if (!provider) return;
      if (provider.isSafePal || provider.isSafePalWallet) addProvider("safepal", provider);
      else if (provider.isRabby) addProvider("rabby", provider);
      else if (isInternetMoneyProvider(provider)) addProvider("internet-money", provider);
      else if (isActualMetaMaskProvider(provider)) addProvider("metamask", provider);
      else {
        const name = genericWalletName(provider);
        addProvider(`legacy:${walletOptionSlug(name)}:${suffix}`, provider, { name });
      }
    };

    window.ethereum?.providers?.forEach((provider, index) => addLegacyProvider(provider, String(index)));
    addProvider("rabby", window.rabby);
    addProvider("internet-money", window.internetMoney);
    addLegacyProvider(window.okxwallet, "okx");
    addLegacyProvider(window.safepalProvider ?? window.safepal, "safepal");
    addLegacyProvider(window.zkx, "zkx");
    addLegacyProvider(window.phantom?.ethereum, "phantom");
    if (!window.ethereum?.providers?.length) addLegacyProvider(window.ethereum);

    const catalogKeys = new Set(walletCatalog.map((wallet) => wallet.key));
    const catalogOptions = walletCatalog.map((wallet) => detected.get(wallet.key) ?? wallet);
    const dynamicOptions = Array.from(detected.values()).filter((wallet) => !catalogKeys.has(wallet.key));
    const options = [...catalogOptions, ...dynamicOptions];
    setWalletOptions(options);
    return options;
  }

  async function openWalletPicker() {
    setWalletSearch("");
    setWalletPickerOpen(true);
    await discoverWallets();
  }

  async function connectWallet(
    selectedProvider?: BrowserWalletProvider | null,
    walletName = "Wallet",
    selectedKey?: WalletOption["key"],
  ) {
    if (!selectedProvider) {
      await openWalletPicker();
      return;
    }

    setWalletPickerOpen(false);
    try {
      setStatus(`Connecting ${walletName}…`);
      const addresses = (await selectedProvider.request({
        method: "eth_requestAccounts",
      })) as Address[];
      if (!addresses[0]) throw new Error("No wallet account was selected");

      try {
        await selectedProvider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x171" }],
        });
      } catch (switchError) {
        if ((switchError as { code?: number }).code !== 4902) throw switchError;
        await selectedProvider.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: "0x171",
            chainName: "PulseChain",
            nativeCurrency: { name: "Pulse", symbol: "PLS", decimals: 18 },
            rpcUrls: ["https://rpc.pulsechain.com"],
            blockExplorerUrls: ["https://scan.pulsechain.com"],
          }],
        });
      }

      setWalletProvider(selectedProvider);
      setAccount(addresses[0]);
      const walletKey = selectedKey
        ?? walletOptions.find((option) => option.provider === selectedProvider)?.key;
      if (walletKey) window.localStorage.setItem(walletPreferenceStorageKey, walletKey);
      setStatus(`${walletName} connected on PulseChain`);
    } catch (error) {
      setStatus((error as { code?: number }).code === 4001
        ? "Wallet connection was cancelled."
        : error instanceof Error ? error.message : "Unable to connect this wallet.");
    }
  }

  function disconnectWallet() {
    window.localStorage.removeItem(walletPreferenceStorageKey);
    setWalletModalOpen(false);
    setWalletPickerOpen(false);
    setWalletProvider(null);
    setAccount(null);
    setNativeBalance(0n);
    setBalance(0n);
    setAmount("");
    setTransactionStage("ready");
    setBusy(false);
    setStatus("Wallet disconnected from this site");
  }

  async function handleWalletButton() {
    if (account) {
      setWalletModalOpen(true);
      return;
    }
    await openWalletPicker();
  }

  useEffect(() => {
    const handleAnnouncement = (event: Event) => {
      const detail = (event as CustomEvent<Eip6963ProviderDetail>).detail;
      if (!detail?.provider || !detail.info) return;
      announcedProviders.current.set(detail.info.uuid || detail.info.rdns || detail.info.name, detail);
    };

    window.addEventListener("eip6963:announceProvider", handleAnnouncement);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    return () => window.removeEventListener("eip6963:announceProvider", handleAnnouncement);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function restoreWalletConnection() {
      const savedKey = window.localStorage.getItem(walletPreferenceStorageKey);
      if (!savedKey) return;

      const options = await discoverWallets();
      if (cancelled) return;
      const savedWallet = options.find((wallet) => wallet.key === savedKey);
      if (!savedWallet?.provider) {
        setStatus(`${savedWallet?.name ?? "Saved wallet"} is not available in this browser.`);
        return;
      }

      try {
        const addresses = (await savedWallet.provider.request({ method: "eth_accounts" })) as Address[];
        if (cancelled) return;
        if (!addresses[0]) {
          setStatus(`Unlock ${savedWallet.name}, then click Connect wallet.`);
          return;
        }

        const chainId = (await savedWallet.provider.request({ method: "eth_chainId" })) as string;
        if (cancelled) return;
        setWalletProvider(savedWallet.provider);
        setAccount(addresses[0]);
        setStatus(
          chainId.toLowerCase() === "0x171"
            ? ""
            : `Switch ${savedWallet.name} to PulseChain to continue`,
        );
      } catch {
        if (!cancelled) setStatus(`Unlock ${savedWallet.name}, then click Connect wallet.`);
      }
    }

    void restoreWalletConnection();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!walletPickerOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setWalletPickerOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [walletPickerOpen]);

  useEffect(() => {
    if (!walletProvider?.on) return;

    const handleAccountsChanged = (...args: unknown[]) => {
      const addresses = (args[0] as Address[] | undefined) ?? [];
      if (!addresses[0]) {
        setAccount(null);
        setNativeBalance(0n);
        setBalance(0n);
        setStatus("Wallet disconnected from this site");
        return;
      }
      setAccount(addresses[0]);
      setAmount("");
      setTransactionStage("ready");
      setRefreshKey((value) => value + 1);
      setStatus(`Account changed to ${shortAddress(addresses[0])}`);
    };
    const handleChainChanged = (...args: unknown[]) => {
      const chainId = args[0] as string | undefined;
      if (chainId?.toLowerCase() !== "0x171") {
        setStatus("Switch your wallet to PulseChain to continue");
      } else {
        setStatus("Wallet connected on PulseChain");
      }
    };

    walletProvider.on("accountsChanged", handleAccountsChanged);
    walletProvider.on("chainChanged", handleChainChanged);
    return () => {
      walletProvider.removeListener?.("accountsChanged", handleAccountsChanged);
      walletProvider.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [walletProvider]);

  useEffect(() => {
    if (!walletModalOpen || !account) return;
    let cancelled = false;

    publicClient.getBalance({ address: account })
      .then((value) => {
        if (!cancelled) setNativeBalance(value);
      })
      .catch(() => {
        if (!cancelled) setStatus("Unable to read the wallet PLS balance right now.");
      });

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setWalletModalOpen(false);
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => {
      cancelled = true;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [account, walletModalOpen]);

  useEffect(() => {
    let cancelled = false;
    let loading = false;
    async function loadPool() {
      if (loading) return;
      loading = true;
      try {
        const balancePromise = account
          ? publicClient.readContract({ address: pair.burnAddress, abi: erc20Abi, functionName: "balanceOf", args: [account] })
          : Promise.resolve(0n);
        const limitedBalancePromise = account
          ? publicClient.readContract({ address: pair.receiveAddress, abi: erc20Abi, functionName: "balanceOf", args: [account] })
          : Promise.resolve(0n);

        if (!configured) {
          const [nextBalance, nextLimitedBalance] = await Promise.all([balancePromise, limitedBalancePromise]);
          if (!cancelled) {
            setReserve(0n);
            setBalance(nextBalance);
            setLimitedBalance(nextLimitedBalance);
            setStats(emptyStats);
            setExchangeActivated(false);
            setExchangePaused(false);
          }
          return;
        }

        const [currentMinter, currentPaused] = await Promise.all([
          publicClient.readContract({ address: pair.receiveAddress, abi: limitedTokenAbi, functionName: "minter" }),
          publicClient.readContract({ address: pair.exchangeAddress, abi: swapBurnMintExchangeAbi, functionName: "paused" }),
        ]);
        const nextExchangeActivated = currentMinter.toLowerCase() === pair.exchangeAddress.toLowerCase();

        let nextReserve = 0n;
        let nextBalance = 0n;
        let nextLimitedBalance = 0n;
        let nextStats = emptyStats;

        if (pair.swapToPls) {
          const [
            totalBurned,
            totalOriginalSwapped,
            totalPlsToTreasury,
            totalDistributed,
            totalManagementMinted,
            exchanges,
            walletBalance,
            limitedWalletBalance,
          ] = await Promise.all([
            publicClient.readContract({ address: pair.exchangeAddress, abi: swapBurnMintExchangeAbi, functionName: "totalBurned" }),
            publicClient.readContract({ address: pair.exchangeAddress, abi: swapBurnMintExchangeAbi, functionName: "totalOriginalSwapped" }),
            publicClient.readContract({ address: pair.exchangeAddress, abi: swapBurnMintExchangeAbi, functionName: "totalPlsToTreasury" }),
            publicClient.readContract({ address: pair.exchangeAddress, abi: swapBurnMintExchangeAbi, functionName: "totalLimitedMintedToUsers" }),
            publicClient.readContract({ address: pair.exchangeAddress, abi: swapBurnMintExchangeAbi, functionName: "totalLimitedMintedToManagement" }),
            publicClient.readContract({ address: pair.exchangeAddress, abi: swapBurnMintExchangeAbi, functionName: "exchangeCount" }),
            balancePromise,
            limitedBalancePromise,
          ]);
          nextBalance = walletBalance;
          nextLimitedBalance = limitedWalletBalance;
          nextStats = {
            ...emptyStats,
            totalBurned,
            totalDistributed,
            totalOriginalSwapped,
            totalPlsToTreasury,
            totalManagementMinted,
            exchanges,
          };
        } else if (pair.mintOnDemand) {
          const [totalBurned, totalDistributed, totalTreasurySent, exchanges, uniqueExchangers, walletBalance, limitedWalletBalance] = await Promise.all([
            publicClient.readContract({ address: pair.exchangeAddress, abi: burnExchangeAbi, functionName: "totalBurned" }),
            publicClient.readContract({ address: pair.exchangeAddress, abi: burnExchangeAbi, functionName: "totalLimitedMinted" }),
            publicClient.readContract({ address: pair.exchangeAddress, abi: burnExchangeAbi, functionName: "totalTreasurySent" }),
            publicClient.readContract({ address: pair.exchangeAddress, abi: burnExchangeAbi, functionName: "exchangeCount" }),
            publicClient.readContract({ address: pair.exchangeAddress, abi: burnExchangeAbi, functionName: "uniqueExchangers" }),
            balancePromise,
            limitedBalancePromise,
          ]);
          nextBalance = walletBalance;
          nextLimitedBalance = limitedWalletBalance;
          nextStats = { ...emptyStats, totalBurned, totalDistributed, totalTreasurySent, exchanges, uniqueExchangers };
        } else {
          const [poolReserve, totalBurned, totalDistributed, exchanges, uniqueExchangers, walletBalance, limitedWalletBalance] = await Promise.all([
            publicClient.readContract({ address: pair.exchangeAddress, abi: burnExchangeAbi, functionName: "reserve" }),
            publicClient.readContract({ address: pair.exchangeAddress, abi: burnExchangeAbi, functionName: "totalBurned" }),
            publicClient.readContract({ address: pair.exchangeAddress, abi: burnExchangeAbi, functionName: "totalLimitedDistributed" }),
            publicClient.readContract({ address: pair.exchangeAddress, abi: burnExchangeAbi, functionName: "exchangeCount" }),
            publicClient.readContract({ address: pair.exchangeAddress, abi: burnExchangeAbi, functionName: "uniqueExchangers" }),
            balancePromise,
            limitedBalancePromise,
          ]);
          nextReserve = poolReserve;
          nextBalance = walletBalance;
          nextLimitedBalance = limitedWalletBalance;
          nextStats = { ...emptyStats, totalBurned, totalDistributed, exchanges, uniqueExchangers };
        }
        if (!cancelled) {
          setReserve(nextReserve);
          setBalance(nextBalance);
          setLimitedBalance(nextLimitedBalance);
          setStats(nextStats);
          setExchangeActivated(nextExchangeActivated);
          setExchangePaused(currentPaused);
        }
      } catch {
        if (!cancelled) {
          setReserve(0n);
          setBalance(0n);
          setLimitedBalance(0n);
          setStats(emptyStats);
          setExchangeActivated(false);
          setExchangePaused(false);
          setStatus("Unable to read this pool right now.");
        }
      } finally {
        loading = false;
      }
    }
    void loadPool();
    const pollingTimer = window.setInterval(() => { void loadPool(); }, liveStatsPollingInterval);
    return () => {
      cancelled = true;
      window.clearInterval(pollingTimer);
    };
  }, [account, configured, pair, refreshKey]);

  async function getWallet() {
    if (!walletProvider || !account) throw new Error("Connect wallet first");
    return createWalletClient({ account, chain: pulsechain, transport: custom(walletProvider) });
  }

  async function burnAndClaim() {
    if (!account) return connectWallet();
    if (!configured) {
      setStatus("This mint will activate after its verified addresses are added.");
      return;
    }
    if (!exchangeActivated) {
      setStatus(`The ${pair.receive} creator must set its minter to this exchange contract first.`);
      return;
    }
    if (exchangePaused) {
      setStatus(`The ${pair.receive} exchange is temporarily paused.`);
      return;
    }

    let approvalComplete = false;
    try {
      setBusy(true);
      setRetryable(false);
      setTransactionStage("approving");
      const value = parseUnits(amount, pair.decimals);
      if (value <= 0n) throw new Error("Enter an amount greater than zero");
      if (pair.maxWebsiteTestAmount && value > pair.maxWebsiteTestAmount) {
        throw new Error(`For this live test, use no more than ${formatUnits(pair.maxWebsiteTestAmount, pair.decimals)} ${pair.burn}`);
      }
      if (!pair.mintOnDemand && value > reserve) throw new Error("The pool does not have enough reserves");
      const wallet = await getWallet();
      const allowance = await publicClient.readContract({
        address: pair.burnAddress,
        abi: erc20Abi,
        functionName: "allowance",
        args: [account, pair.exchangeAddress],
      });

      if (allowance < value) {
        setStatus(`Approve ${pair.burn} in your wallet`);
        const approvalGas = await gasWithHeadroom(
          () =>
            publicClient.estimateContractGas({
              account,
              address: pair.burnAddress,
              abi: erc20Abi,
              functionName: "approve",
              args: [pair.exchangeAddress, value],
            }),
          approvalGasMultiplier,
          approvalGasFloor,
        );
        const approvalHash = await wallet.writeContract({
          address: pair.burnAddress,
          abi: erc20Abi,
          functionName: "approve",
          args: [pair.exchangeAddress, value],
          gas: approvalGas,
        });
        setStatus("Approval submitted — waiting for confirmation");
        await waitForPulseChainReceipt(approvalHash, walletProvider);
        setStatus("Approval confirmed — opening the exchange confirmation");
        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }

      approvalComplete = true;
      setTransactionStage("exchanging");
      setStatus(`Confirm the 1:1 ${pair.burn} burn and mint in your wallet`);
      let hash: Hash;
      if (pair.swapToPls) {
        setStatus("Checking the current PulseX V2 price");
        const expectedPlsOut = await publicClient.readContract({
          address: pair.exchangeAddress,
          abi: swapBurnMintExchangeAbi,
          functionName: "quotePlsOut",
          args: [value],
        });
        const minPlsOut = expectedPlsOut * 85n / 100n;
        if (minPlsOut <= 0n) throw new Error("The PulseX output quote is too small");
        const swapGas = await gasWithHeadroom(
          () =>
            publicClient.estimateContractGas({
              account,
              address: pair.exchangeAddress,
              abi: swapBurnMintExchangeAbi,
              functionName: "burnAndMint",
              args: [value, minPlsOut],
            }),
          exchangeGasMultiplier,
          exchangeGasFloor,
        );
        setStatus(`Confirm the 1:1 ${pair.burn} burn and mint in your wallet`);
        hash = await wallet.writeContract({
          address: pair.exchangeAddress,
          abi: swapBurnMintExchangeAbi,
          functionName: "burnAndMint",
          args: [value, minPlsOut],
          gas: swapGas,
        });
      } else {
        const exchangeFunction = pair.mintOnDemand ? "burnAndMint" : "burnAndClaim";
        const exchangeGas = await gasWithHeadroom(
          () =>
            publicClient.estimateContractGas({
              account,
              address: pair.exchangeAddress,
              abi: burnExchangeAbi,
              functionName: exchangeFunction,
              args: [value],
            }),
          exchangeGasMultiplier,
          exchangeGasFloor,
        );
        hash = await wallet.writeContract({
          address: pair.exchangeAddress,
          abi: burnExchangeAbi,
          functionName: exchangeFunction,
          args: [value],
          gas: exchangeGas,
        });
      }
      setStatus("Trade submitted — waiting for PulseChain confirmation");
      await waitForPulseChainReceipt(hash, walletProvider);
      setAmount("");
      setTransactionStage("confirmed");
      setRefreshKey((value) => value + 1);
      setStatus(`Trade confirmed — ${pair.receive} minted successfully`);
    } catch (error) {
      setTransactionStage(approvalComplete ? "exchanging" : "ready");
      if (isWalletRejection(error)) {
        setStatus("Transaction cancelled in your wallet");
        return;
      }
      const failure = describeExchangeFailure(error, pair);
      if (failure) {
        setRetryable(failure.retryable);
        setStatus(failure.message);
        return;
      }
      // A revert that only surfaces once the trade is mined has already moved past the
      // dry run above, which on these originals means transient chain state.
      if (error instanceof Error && error.message === "The transaction reverted") {
        setRetryable(true);
        setStatus("PulseChain rejected the trade as it settled. Press Try again.");
        return;
      }
      setStatus(error instanceof Error ? error.message : "Transaction failed");
    } finally {
      setBusy(false);
    }
  }

  const exchangeButtonLabel = busy
    ? "Waiting for confirmation…"
    : !configured
      ? `Awaiting ${pair.receive} contract`
      : !exchangeActivated
        ? `Awaiting ${pair.receive} minter activation`
        : exchangePaused
          ? `${pair.receive} exchange paused`
          : !account
            ? "Connect wallet to continue"
            : retryable
              ? `Try again — burn ${pair.burn} & mint ${pair.receive}`
              : `Burn ${pair.burn} & mint ${pair.receive}`;

  return (
    <main className="site-shell">
      <header className="topbar">
        <div className="nav-left" aria-label="Community links">
          <a className="social-icon" href="https://t.me/+Ruw3dQPRTv00NDRl" target="_blank" rel="noreferrer" aria-label="Telegram">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" fill="currentColor" />
            </svg>
          </a>
          <a className="social-icon" href="https://x.com/TomkiwMich70997" target="_blank" rel="noreferrer" aria-label="X">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.912-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" fill="currentColor" />
            </svg>
          </a>
          <a className="social-icon" href="https://dexscreener.com/pulsechain/0xda942580cee2a69c5fc74109090816157730c64d" target="_blank" rel="noreferrer" aria-label="DexScreener">
            <svg width="20" height="20" viewBox="0 0 252 300" fill="currentColor" fillRule="evenodd" aria-hidden="true">
              <path d="M151.818 106.866c9.177-4.576 20.854-11.312 32.545-20.541 2.465 5.119 2.735 9.586 1.465 13.193-.9 2.542-2.596 4.753-4.826 6.512-2.415 1.901-5.431 3.285-8.765 4.033-6.326 1.425-13.712.593-20.419-3.197m1.591 46.886 12.148 7.017c-24.804 13.902-31.547 39.716-39.557 64.859-8.009-25.143-14.753-50.957-39.556-64.859l12.148-7.017a5.95 5.95 0 003.84-5.845c-1.113-23.547 5.245-33.96 13.821-40.498 3.076-2.342 6.434-3.518 9.747-3.518s6.671 1.176 9.748 3.518c8.576 6.538 14.934 16.951 13.821 40.498a5.95 5.95 0 003.84 5.845zM126 0c14.042.377 28.119 3.103 40.336 8.406 8.46 3.677 16.354 8.534 23.502 14.342 3.228 2.622 5.886 5.155 8.814 8.071 7.897.273 19.438-8.5 24.796-16.709-9.221 30.23-51.299 65.929-80.43 79.589-.012-.005-.02-.012-.029-.018-5.228-3.992-11.108-5.988-16.989-5.988s-11.76 1.996-16.988 5.988c-.009.005-.017.014-.029.018-29.132-13.66-71.209-49.359-80.43-79.589 5.357 8.209 16.898 16.982 24.795 16.709 2.929-2.915 5.587-5.449 8.814-8.071C69.31 16.94 77.204 12.083 85.664 8.406 97.882 3.103 111.959.377 126 0m-25.818 106.866c-9.176-4.576-20.854-11.312-32.544-20.541-2.465 5.119-2.735 9.586-1.466 13.193.901 2.542 2.597 4.753 4.826 6.512 2.416 1.901 5.432 3.285 8.766 4.033 6.326 1.425 13.711.593 20.418-3.197" />
              <path d="M197.167 75.016c6.436-6.495 12.107-13.684 16.667-20.099l2.316 4.359c7.456 14.917 11.33 29.774 11.33 46.494l-.016 26.532.14 13.754c.54 33.766 7.846 67.929 24.396 99.193l-34.627-27.922-24.501 39.759-25.74-24.231L126 299.604l-41.132-66.748-25.739 24.231-24.501-39.759L0 245.25c16.55-31.264 23.856-65.427 24.397-99.193l.14-13.754-.016-26.532c0-16.721 3.873-31.578 11.331-46.494l2.315-4.359c4.56 6.415 10.23 13.603 16.667 20.099l-2.01 4.175c-3.905 8.109-5.198 17.176-2.156 25.799 1.961 5.554 5.54 10.317 10.154 13.953 4.48 3.531 9.782 5.911 15.333 7.161 3.616.814 7.3 1.149 10.96 1.035-.854 4.841-1.227 9.862-1.251 14.978L53.2 160.984l25.206 14.129a41.926 41.926 0 015.734 3.869c20.781 18.658 33.275 73.855 41.861 100.816 8.587-26.961 21.08-82.158 41.862-100.816a41.865 41.865 0 015.734-3.869l25.206-14.129-32.665-18.866c-.024-5.116-.397-10.137-1.251-14.978 3.66.114 7.344-.221 10.96-1.035 5.551-1.25 10.854-3.63 15.333-7.161 4.613-3.636 8.193-8.399 10.153-13.953 3.043-8.623 1.749-17.689-2.155-25.799l-2.01-4.175z" />
            </svg>
          </a>
          <a className="social-icon" href="https://www.youtube.com/watch?v=z_dfluPpyNI&t=522s" target="_blank" rel="noreferrer" aria-label="YouTube">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
            </svg>
          </a>
        </div>
        <nav className="nav-center" aria-label="Primary navigation">
          <a
            className={`nav-tab${activeView === "exchange" ? " active" : ""}`}
            href="#pools"
            aria-current={activeView === "exchange" ? "page" : undefined}
            onClick={() => setActiveView("exchange")}
          >
            Mint
          </a>
          <a
            className={`nav-tab${activeView === "farms" ? " active" : ""}`}
            href="#farms"
            aria-current={activeView === "farms" ? "page" : undefined}
            onClick={() => setActiveView("farms")}
          >
            Farms
          </a>
        </nav>
        <div className="nav-actions">
          <ThemePicker />
          <button
            className="wallet-button"
            type="button"
            onClick={handleWalletButton}
            aria-label={account ? `Open wallet details for ${shortAddress(account)}` : "Connect wallet"}
            title={account ? "Wallet details" : "Connect wallet"}
          >
            {account ? shortAddress(account) : "Connect wallet"}
          </button>
        </div>
      </header>

      {walletPickerOpen && (
        <div
          className="wallet-picker-backdrop"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setWalletPickerOpen(false);
          }}
        >
          <section className="wallet-picker-box" role="dialog" aria-modal="true" aria-labelledby="wallet-picker-title">
            <div className="wallet-picker-head">
              <div className="wallet-picker-heading">
                <strong id="wallet-picker-title">Connect Wallet</strong>
                <span>PulseChain · {walletOptions.filter((wallet) => wallet.provider).length} detected</span>
              </div>
              <button type="button" onClick={() => setWalletPickerOpen(false)} aria-label="Close wallet picker">×</button>
            </div>
            <label className="wallet-picker-search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="m16 16 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                aria-label="Search wallets"
                placeholder="Search wallets"
                value={walletSearch}
                onChange={(event) => setWalletSearch(event.target.value)}
              />
            </label>
            <div className="wallet-picker-list">
              {filteredWalletOptions.map((wallet) => {
                const installed = Boolean(wallet.provider);
                const catalogWallet = walletCatalog.some((item) => item.key === wallet.key);
                return (
                  <button
                    className="wallet-option"
                    type="button"
                    key={wallet.key}
                    disabled={!installed}
                    onClick={() => connectWallet(wallet.provider, wallet.name, wallet.key)}
                  >
                    <span className={`wallet-option-icon wallet-icon-${catalogWallet ? wallet.key : "browser-wallet"}`} aria-hidden="true">
                      <img src={wallet.icon} alt="" />
                    </span>
                      <span className="wallet-option-copy">
                        <span className="wallet-option-name">{wallet.name}</span>
                        <span className="wallet-option-sub">
                          {installed ? "Ready to connect" : wallet.description}
                        </span>
                      </span>
                    <span className={`wallet-option-badge${installed ? "" : " muted"}`}>
                      {installed ? "Installed" : "Not detected"}
                    </span>
                  </button>
                );
              })}
              {filteredWalletOptions.length === 0 && (
                <p className="wallet-picker-empty">No matching wallet was detected.</p>
              )}
            </div>
            <p className="wallet-picker-footer">Supported browser wallets are detected automatically and connect directly.</p>
          </section>
        </div>
      )}

      {walletModalOpen && account && (
        <div
          className="wallet-dialog-backdrop"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setWalletModalOpen(false);
          }}
        >
          <section className="wallet-dialog" role="dialog" aria-modal="true" aria-labelledby="wallet-dialog-address">
            <button className="wallet-dialog-close" type="button" onClick={() => setWalletModalOpen(false)} aria-label="Close wallet details">×</button>
            <div className="wallet-avatar" aria-hidden="true" />
            <strong id="wallet-dialog-address" title={account}>{shortAddress(account)}</strong>
            <span className="wallet-native-balance">{formatAmount(nativeBalance, 18, 2)} PLS</span>
            <div className="wallet-dialog-actions">
              <button type="button" onClick={copyWalletAddress}>
                <b aria-hidden="true">⧉</b>
                <span>{copiedAddress === account ? "Copied" : "Copy Address"}</span>
              </button>
              <button type="button" onClick={disconnectWallet}>
                <b aria-hidden="true">↪</b>
                <span>Disconnect</span>
              </button>
            </div>
          </section>
        </div>
      )}

      {activeView === "exchange" ? (
        <>
      <section className="hero" id="top">
        <div className="hero-copy">
          <h1>Burn the original<br /><em>Mint the limited</em></h1>
          <p>Burn your original coins and mint the matching Limited coins at a 1:1 rate.</p>
        </div>

        <article className="quick-exchange-card" aria-label="Quick burn exchange">
          <div className="quick-card-heading">
            <h2>Mint {pair.label}</h2>
            <p className="quick-card-description">Choose an amount, approve access, then confirm your burn and mint.</p>
          </div>

          <div className="quick-field">
            <div className="quick-field-label">
              <span>You burn</span>
              <div className="quick-field-actions">
                <button type="button" onClick={useMaximumTestAmount}>MAX</button>
                <small>Balance: {account ? formatAmount(balance, pair.decimals, 4) : "—"}</small>
              </div>
            </div>
            <div className="quick-field-row">
              <input
                inputMode="decimal"
                aria-label={`Quick ${pair.burn} amount to burn and exchange`}
                placeholder="0.00"
                value={formatAmountInput(amount)}
                onChange={(event) => setAmount(normalizeAmountInput(event.target.value))}
              />
              <div className="pair-selector quick-pair-selector" ref={quickSelectorRef}>
                <button
                  className="quick-token-trigger"
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={quickSelectorOpen}
                  aria-label={`Choose quick burn token. Current pair ${pair.burn} to ${pair.receive}`}
                  onClick={() => {
                    setSelectorOpen(false);
                    setQuickSelectorOpen((open) => !open);
                  }}
                >
                  <img className="token-logo" src={pair.logo} alt="" aria-hidden="true" />
                  <span className="quick-token-copy">
                    <b>{pair.burn}</b>
                    <small>PulseChain</small>
                  </span>
                  <span className="quick-token-chevron" aria-hidden="true">⌄</span>
                </button>

                {quickSelectorOpen && (
                  <div className="pair-selector-menu quick-selector-menu" role="listbox" aria-label="Choose quick burn exchange pair">
                    <p>Select an original token</p>
                    {pairs.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        role="option"
                        aria-selected={item.key === activeKey}
                        onClick={() => selectPair(item.key)}
                      >
                        <img className="token-logo" src={item.logo} alt="" aria-hidden="true" />
                        <span className="selector-token-copy">
                          <b>{item.burn}</b>
                          <small>Receives {item.receive}</small>
                        </span>
                        {item.key === activeKey && <span className="selector-check" aria-hidden="true">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <small>1 {pair.burn} = 1 {pair.receive}</small>
            <small>
              {pair.swapToPls
                ? `80% burned • 20% swapped to PLS for treasury • extra 5% ${pair.receive} management mint`
                : `80% burned • 20% ${pair.burn} treasury`}
              {pair.maxWebsiteTestAmount ? ` • ${formatUnits(pair.maxWebsiteTestAmount, pair.decimals)} ${pair.burn} maximum` : ""}
            </small>
          </div>

          <div className="quick-rate" aria-hidden="true"><span>↓</span></div>

          <div className="quick-field quick-receive-field">
            <div className="quick-field-label">
              <span>You mint</span>
              <small>Balance: {account ? `${formatAmount(limitedBalance, pair.decimals, 4)} ${pair.receive}` : "—"}</small>
            </div>
            <div className="quick-field-row">
              <strong>{amount ? formatAmountInput(amount) : "0.00"}</strong>
              <div className="quick-token-locked" aria-label={`${pair.receive} is locked to ${pair.burn}`}>
                <img className="token-logo" src={pair.receiveLogo} alt="" aria-hidden="true" />
                <span className="quick-token-copy">
                  <b>{pair.receive}</b>
                  <small>{pair.label}</small>
                </span>
              </div>
            </div>
          </div>

          <button className="quick-exchange-button" type="button" onClick={burnAndClaim} disabled={busy || !configured || !exchangeActivated || exchangePaused}>
            {exchangeButtonLabel}
          </button>
          <TransactionProgress stage={transactionStage} pair={pair} />
        </article>
      </section>

      <section className="exchange-section" id="pools">
        <div className="pool-tabs" role="tablist" aria-label="Burn exchange pools">
          {pairs.map((item) => (
            <button
              key={item.key}
              role="tab"
              aria-selected={item.key === activeKey}
              className={item.key === activeKey ? "active" : ""}
              onClick={() => selectPair(item.key)}
            >
              <small>{item.burn}</small>
              <strong>{item.receive}</strong>
            </button>
          ))}
        </div>

        <div className="mint-section-tabs" role="tablist" aria-label={`${pair.receive} information`}>
          {(["mint", "holders", "activity"] as const).map((view) => (
            <button
              type="button"
              role="tab"
              aria-selected={mintSectionView === view}
              className={mintSectionView === view ? "active" : ""}
              key={view}
              onClick={() => setMintSectionViews((current) => ({ ...current, [activeKey]: view }))}
            >
              {view[0].toUpperCase()}{view.slice(1)}
            </button>
          ))}
        </div>

        {mintSectionView === "mint" ? (
          <div className="exchange-grid" role="tabpanel" aria-label={`${pair.receive} mint`}>
          <article className="exchange-card">
            <div className="quick-card-heading">
              <h2>Mint {pair.label}</h2>
            <p className="quick-card-description">Choose an amount, approve access, then confirm your burn and mint.</p>
            </div>

            <div className="quick-field">
              <div className="quick-field-label">
                <span>You burn</span>
                <div className="quick-field-actions">
                  <button type="button" onClick={useMaximumTestAmount}>MAX</button>
                  <small>Balance: {account ? formatAmount(balance, pair.decimals, 4) : "—"}</small>
                </div>
              </div>
              <div className="quick-field-row">
                <input
                  inputMode="decimal"
                  aria-label={`${pair.burn} amount to burn and exchange`}
                  placeholder="0.00"
                  value={formatAmountInput(amount)}
                  onChange={(event) => setAmount(normalizeAmountInput(event.target.value))}
                />
                <div className="pair-selector quick-pair-selector" ref={selectorRef}>
                  <button
                    className="quick-token-trigger"
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={selectorOpen}
                    aria-label={`Choose burn token. Current pair ${pair.burn} to ${pair.receive}`}
                    onClick={() => {
                      setQuickSelectorOpen(false);
                      setSelectorOpen((open) => !open);
                    }}
                  >
                    <img className="token-logo" src={pair.logo} alt="" aria-hidden="true" />
                    <span className="quick-token-copy">
                      <b>{pair.burn}</b>
                      <small>PulseChain</small>
                    </span>
                    <span className="quick-token-chevron" aria-hidden="true">⌄</span>
                  </button>

                  {selectorOpen && (
                    <div className="pair-selector-menu quick-selector-menu" role="listbox" aria-label="Choose burn exchange pair">
                      <p>Select an original token</p>
                      {pairs.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          role="option"
                          aria-selected={item.key === activeKey}
                          onClick={() => selectPair(item.key)}
                        >
                          <img className="token-logo" src={item.logo} alt="" aria-hidden="true" />
                          <span className="selector-token-copy">
                            <b>{item.burn}</b>
                            <small>Receives {item.receive}</small>
                          </span>
                          {item.key === activeKey && <span className="selector-check" aria-hidden="true">✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <small>1 {pair.burn} = 1 {pair.receive}</small>
              <small>
                {pair.swapToPls
                  ? `80% burned • 20% swapped to PLS for treasury • extra 5% ${pair.receive} management mint`
                  : `80% burned • 20% ${pair.burn} treasury`}
                {pair.maxWebsiteTestAmount ? ` • ${formatUnits(pair.maxWebsiteTestAmount, pair.decimals)} ${pair.burn} maximum` : ""}
              </small>
            </div>

            <div className="quick-rate" aria-hidden="true"><span>↓</span></div>

            <div className="quick-field quick-receive-field">
              <div className="quick-field-label">
                <span>You mint</span>
                <small>Balance: {account ? `${formatAmount(limitedBalance, pair.decimals, 4)} ${pair.receive}` : "—"}</small>
              </div>
              <div className="quick-field-row">
                <strong>{amount ? formatAmountInput(amount) : "0.00"}</strong>
                <div className="quick-token-locked" aria-label={`${pair.receive} is paired automatically with ${pair.burn}`}>
                  <img className="token-logo" src={pair.receiveLogo} alt="" aria-hidden="true" />
                  <span className="quick-token-copy">
                    <b>{pair.receive}</b>
                    <small>{pair.label}</small>
                  </span>
                </div>
              </div>
            </div>

            <button className="quick-exchange-button main-exchange-button" type="button" onClick={burnAndClaim} disabled={busy || !configured || !exchangeActivated || exchangePaused}>
              {exchangeButtonLabel}
            </button>
            <TransactionProgress stage={transactionStage} pair={pair} />
            <p className="status-line" role="status">{status}</p>
          </article>

          <section className="below-card-details" aria-label={`${pair.burn} pool details`}>
            <div className="pool-stats inline-stats" aria-label={`${pair.burn} burn exchange statistics`}>
              <div>
                <span>{pair.burn} burned</span>
                {configured
                  ? <AnimatedStatValue key={`${pair.key}-burned`} value={stats.totalBurned} decimals={pair.decimals} />
                  : <strong>Pending</strong>}
              </div>
              {pair.swapToPls && (
                <>
                  <div>
                    <span>{pair.burn} swapped</span>
                    <AnimatedStatValue key={`${pair.key}-swapped`} value={stats.totalOriginalSwapped} decimals={pair.decimals} />
                  </div>
                  <div>
                    <span>PLS sent to treasury</span>
                    <AnimatedStatValue key={`${pair.key}-pls-treasury`} value={stats.totalPlsToTreasury} decimals={18} />
                  </div>
                </>
              )}
              {pair.mintOnDemand && !pair.swapToPls && (
                <div>
                  <span>{pair.burn} sent to treasury</span>
                  <AnimatedStatValue key={`${pair.key}-treasury`} value={stats.totalTreasurySent} decimals={pair.decimals} />
                </div>
              )}
              <div>
                <span>{pair.receive} minted to users</span>
                {configured
                  ? <AnimatedStatValue key={`${pair.key}-minted`} value={stats.totalDistributed} decimals={pair.decimals} />
                  : <strong>0</strong>}
              </div>
              {pair.swapToPls && (
                <div>
                  <span>{pair.receive} management mint</span>
                  <AnimatedStatValue key={`${pair.key}-management-mint`} value={stats.totalManagementMinted} decimals={pair.decimals} />
                </div>
              )}
              <div>
                <span>Exchanges</span>
                {configured
                  ? <AnimatedStatValue key={`${pair.key}-exchanges`} value={stats.exchanges} />
                  : <strong>—</strong>}
              </div>
            </div>

            <details className="contract-details">
              <summary>Contract addresses</summary>
              <dl>
                <div>
                  <dt>Original contract</dt>
                  <dd className="contract-actions">
                    <a href={`https://scan.pulsechain.com/address/${pair.burnAddress}`} target="_blank" rel="noreferrer">{shortAddress(pair.burnAddress)} ↗</a>
                    <button type="button" title={`Copy ${pair.burn} address`} aria-label={`Copy ${pair.burn} contract address`} onClick={() => copyAddress(pair.burnAddress, pair.burn)}>{copiedAddress === pair.burnAddress ? "✓" : "⧉"}</button>
                  </dd>
                </div>
                <div>
                  <dt>Token burn address</dt>
                  <dd className="contract-actions">
                    <a href={`https://scan.pulsechain.com/address/${burnSink}`} target="_blank" rel="noreferrer">{shortAddress(burnSink)} ↗</a>
                    <button type="button" title="Copy token burn address" aria-label="Copy token burn address" onClick={() => copyAddress(burnSink, "token burn address")}>{copiedAddress === burnSink ? "✓" : "⧉"}</button>
                  </dd>
                </div>
                <div>
                  <dt>Limited token contract</dt>
                  {pair.receiveAddress === zeroAddress ? (
                    <dd className="address-pending">Pending</dd>
                  ) : (
                    <dd className="contract-actions">
                      <a href={`https://scan.pulsechain.com/address/${pair.receiveAddress}`} target="_blank" rel="noreferrer">{shortAddress(pair.receiveAddress)} ↗</a>
                      <button type="button" title={`Copy ${pair.receive} address`} aria-label={`Copy ${pair.receive} contract address`} onClick={() => copyAddress(pair.receiveAddress, pair.receive)}>{copiedAddress === pair.receiveAddress ? "✓" : "⧉"}</button>
                    </dd>
                  )}
                </div>
                <div>
                  <dt>Burn exchange contract</dt>
                  {pair.exchangeAddress === zeroAddress ? (
                    <dd className="address-pending">Pending</dd>
                  ) : (
                    <dd className="contract-actions">
                      <a href={`https://scan.pulsechain.com/address/${pair.exchangeAddress}`} target="_blank" rel="noreferrer">{shortAddress(pair.exchangeAddress)} ↗</a>
                      <button type="button" title={`Copy ${pair.burn} burn exchange address`} aria-label={`Copy ${pair.burn} burn exchange contract address`} onClick={() => copyAddress(pair.exchangeAddress, `${pair.burn} burn exchange`)}>{copiedAddress === pair.exchangeAddress ? "✓" : "⧉"}</button>
                    </dd>
                  )}
                </div>
              </dl>
            </details>

          </section>
          </div>
        ) : (
          <LimitedTokenInsights
            token={{
              key: pair.key,
              name: pair.label,
              symbol: pair.receive,
              address: pair.receiveAddress,
              logo: pair.receiveLogo,
              decimals: pair.decimals,
            }}
            view={mintSectionView}
          />
        )}
      </section>

      <section className="how-section" id="how">
        <div>
          <span className="section-number">01</span>
          <h3>Choose a pair</h3>
          <p>Select the original token you hold and its matching limited token.</p>
        </div>
        <div>
          <span className="section-number">02</span>
          <h3>Approve & burn</h3>
          <p>Your wallet approves the amount, then the burn exchange permanently burns it.</p>
        </div>
        <div>
          <span className="section-number">03</span>
          <h3>Mint 1:1</h3>
          <p>You mint 1 matching Limited coin for every 1 original coin you burn.</p>
        </div>
      </section>

      <section className="faq-section" aria-labelledby="faq-heading">
        <div className="faq-heading">
          <h2 id="faq-heading">FAQ</h2>
        </div>
        <div className="faq-list">
          <details>
            <summary>How does the 1:1 exchange work?</summary>
            <p>After approval, the exchange burns 1 original coin and mints 1 matching Limited coin in the same transaction.</p>
          </details>
          <details>
            <summary>Can burned tokens be recovered?</summary>
            <p>No. Once an original coin is burned, it is gone forever.</p>
          </details>
          <details>
            <summary>Where do the Limited coins come from?</summary>
            <p>They start with zero supply and are minted only when matching original coins are burned.</p>
          </details>
          <details>
            <summary>Can anyone mint Limited coins?</summary>
            <p>No. Each Limited coin can only be minted through its matching burn contract.</p>
          </details>
        </div>
      </section>
        </>
      ) : (
        <LimitedFarms
          account={account}
          provider={walletProvider}
          onConnect={() => { void handleWalletButton(); }}
        />
      )}
    </main>
  );
}
