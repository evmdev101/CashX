import { useEffect, useMemo, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  formatUnits,
  http,
  maxUint256,
  parseUnits,
  type Address,
  type EIP1193Provider,
  type Hash,
} from "viem";
import "./limited-farms.css";

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

const FARM_CONTRACT: Address = "0x961130836e52215f3A26f30994b025B4ecDB73ba";
const PRICE_CALCULATOR: Address = "0xC3864afC169C6110cB8f0cCaC4fE1B935951A66F";
const NEXION_FARMS_URL = "https://nexionpulse.com/farmexplorer";
const PULSEX_ADD_V2_URL = "https://pulsex.mypinata.cloud/ipfs/bafybeiaq4jgcpz4hdzwid6letizdnhijlp6lu5ivcjcp5vbgpgf54jknn4/#/add/V2";
const NEXION_LOGO = "https://raw.githubusercontent.com/evmdev101/CashX/main/nexion.png";
const WPLS_LOGO = "https://raw.githubusercontent.com/evmdev101/CashX/main/pls.png";

const publicAsset = (path: string) =>
  `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;

const farmAbi = [
  {
    type: "function",
    name: "poolInfo",
    stateMutability: "view",
    inputs: [{ name: "pid", type: "uint256" }],
    outputs: [
      { name: "lpToken", type: "address" },
      { name: "rewardToken", type: "address" },
      { name: "totalRewards", type: "uint256" },
      { name: "lpSupply", type: "uint256" },
      { name: "startTime", type: "uint256" },
      { name: "endTime", type: "uint256" },
      { name: "lastRewardTime", type: "uint256" },
      { name: "accRewardPerShare", type: "uint256" },
      { name: "depositFeeBP", type: "uint256" },
      { name: "withdrawFeeBP", type: "uint256" },
      { name: "creator", type: "address" },
      { name: "remainingRewards", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "userInfo",
    stateMutability: "view",
    inputs: [
      { name: "pid", type: "uint256" },
      { name: "user", type: "address" },
    ],
    outputs: [
      { name: "amount", type: "uint256" },
      { name: "rewardDebt", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "pendingReward",
    stateMutability: "view",
    inputs: [
      { name: "pid", type: "uint256" },
      { name: "user", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "pid", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "pid", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [{ name: "pid", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "claimMany",
    stateMutability: "nonpayable",
    inputs: [{ name: "pids", type: "uint256[]" }],
    outputs: [],
  },
] as const;

const lpAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
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
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const lpPairAbi = [
  {
    type: "function",
    name: "getReserves",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "reserve0", type: "uint112" },
      { name: "reserve1", type: "uint112" },
      { name: "blockTimestampLast", type: "uint32" },
    ],
  },
  {
    type: "function",
    name: "token0",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const tokenMetaAbi = [
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

const priceAbi = [
  {
    type: "function",
    name: "getBatchLpValue",
    stateMutability: "view",
    inputs: [{ name: "tokens", type: "address[]" }],
    outputs: [{ name: "", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "getBatchPrice",
    stateMutability: "view",
    inputs: [{ name: "tokens", type: "address[]" }],
    outputs: [{ name: "", type: "uint256[]" }],
  },
] as const;

type FarmToken = {
  symbol: string;
  address: Address;
  logo: string;
};

type FarmConfig = {
  id: number;
  pid: number;
  lp: Address;
  tokens: readonly [FarmToken, FarmToken];
};

type PoolInfo = readonly [
  Address,
  Address,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  Address,
  bigint,
];

type FarmLive = {
  config: FarmConfig;
  rewardAddress: Address;
  rewardSymbol: string;
  rewardDecimals: number;
  apr: number;
  tvlUsd: number;
  stakedUsd: number;
  userStakedUsd: number;
  remainingUsd: number;
  pendingUsd: number;
  dailyRewardAmount: number;
  dailyRewardUsd: number;
  remainingRewards: bigint;
  poolSupply: bigint;
  lpTotalSupply: bigint;
  lpToken0: Address;
  reserve0: bigint;
  reserve1: bigint;
  walletBalance: bigint;
  userStaked: bigint;
  pendingReward: bigint;
  allowance: bigint;
  depositFeeBp: bigint;
  withdrawFeeBp: bigint;
  endTime: number;
};

const token = (symbol: string, address: Address, logo: string): FarmToken => ({
  symbol,
  address,
  logo,
});

const TOKENS = {
  cashx: token("CASHX", "0x510c547318032275e41D1362A465783320d8152f", publicAsset("tokens/cashx.png")),
  lcashx: token("LCASHX", "0x57cBC908078b291117242385Fe7C0cf3582fA460", publicAsset("tokens/lcashx.png")),
  distrox: token("DISTROX", "0xec03E43e21B337F60F6a63944bC7b61B531c035F", publicAsset("tokens/distrox.jpg")),
  ldistrox: token("LDISTROX", "0xfC961146971679Cc4E731F60D72B60eb3dd8b036", publicAsset("tokens/ldistrox.png")),
  divx: token("DIVX", "0xB528AFfc72Dfc7Da5d3184C4e233Fc9fc156c4E0", publicAsset("tokens/divx.png")),
  ldivx: token("LDIVX", "0x8DbD0923c0c2dd4973806B655036251610aE11BC", publicAsset("tokens/ldivx.png")),
  gsx: token("GSX", "0xFA490c52FD934c7b8629E30Ea4c14683ee000b5d", publicAsset("tokens/gsx.png")),
  lgsx: token("LGSX", "0xCc6A42F028905096c76E5631aed78e20f5CDDFBa", publicAsset("tokens/lgsx.png")),
  wpls: token("WPLS", "0xA1077a294DDE1B09BB078844DF40758a5D0f9a27", WPLS_LOGO),
} as const;

const FARMS: FarmConfig[] = [
  { id: 277, pid: 92, lp: "0x01AaddD156392fE811FdAE236f2d4341b6a7f129", tokens: [TOKENS.gsx, TOKENS.lgsx] },
  { id: 276, pid: 91, lp: "0xbF5B80f368d8563A7ae3d8c2c481770F4d236e3a", tokens: [TOKENS.wpls, TOKENS.lgsx] },
  { id: 275, pid: 90, lp: "0x4333B9fD8e4C33BB373F94e95b6Bbf9e84273fA0", tokens: [TOKENS.divx, TOKENS.ldivx] },
  { id: 274, pid: 89, lp: "0x33692D8679b3F9c2bd5Ac28d7D3A25F677eCB68A", tokens: [TOKENS.ldivx, TOKENS.wpls] },
  { id: 273, pid: 88, lp: "0xeEf1dBd3Bd19859CbfB9e330A5B3FC1Fd0df2294", tokens: [TOKENS.distrox, TOKENS.ldistrox] },
  { id: 272, pid: 87, lp: "0x6955f02Bd012f6cFF0e5030ac5D123785C6b66FC", tokens: [TOKENS.wpls, TOKENS.ldistrox] },
  { id: 271, pid: 86, lp: "0x4c2336077207f06c890a7eb92346D59e40abFc09", tokens: [TOKENS.cashx, TOKENS.lcashx] },
  { id: 270, pid: 85, lp: "0x207c74d16D659C9627142bf5178aaB6DFb813657", tokens: [TOKENS.lcashx, TOKENS.wpls] },
];

function usd(value: number) {
  if (!Number.isFinite(value)) return "$0.00 USD";
  return `${value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} USD`;
}

function tokenAmount(value: bigint, decimals = 18, maximumFractionDigits = 2) {
  const amount = Number(formatUnits(value, decimals));
  return amount.toLocaleString("en-US", { maximumFractionDigits });
}

function percentFromBp(value: bigint) {
  return `${(Number(value) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}

function timeLeft(endTime: number) {
  const seconds = Math.max(endTime - Math.floor(Date.now() / 1000), 0);
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  return seconds > 0 ? `${days}d ${hours}h ${minutes}m ${remainder}s` : "Ended";
}

function normalizeInput(value: string) {
  const stripped = value.replace(/,/g, "").replace(/[^0-9.]/g, "");
  const [whole = "", ...fractions] = stripped.split(".");
  return fractions.length ? `${whole}.${fractions.join("")}` : whole;
}

function isWalletRejection(error: unknown) {
  if ((error as { code?: number } | null)?.code === 4001) return true;
  return /user rejected|user denied|rejected the request/i.test(error instanceof Error ? error.message : "");
}

function actionMessage(error: unknown) {
  if (isWalletRejection(error)) return "Transaction cancelled in your wallet.";
  if (error instanceof Error) {
    const message = error.message.split("\n")[0];
    return message.length > 150 ? "The farm transaction failed. Please try again." : message;
  }
  return "The farm transaction failed. Please try again.";
}

function manageLiquidityUrl(farm: FarmConfig) {
  return `${PULSEX_ADD_V2_URL}/${farm.tokens[0].address}/${farm.tokens[1].address}`;
}

async function waitForReceipt(hash: Hash) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (receipt.status === "reverted") throw new Error("The transaction reverted on PulseChain.");
}

type LimitedFarmsProps = {
  account: Address | null;
  provider: EIP1193Provider | null;
  onConnect: () => void;
};

export default function LimitedFarms({ account, provider, onConnect }: LimitedFarmsProps) {
  const [farms, setFarms] = useState<FarmLive[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [stakedOnly, setStakedOnly] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [inputs, setInputs] = useState<Record<number, string>>({});
  const [messages, setMessages] = useState<Record<number, string>>({});
  const [expandedPools, setExpandedPools] = useState<Set<number>>(() => new Set());
  const [busyPid, setBusyPid] = useState<number | null>(null);
  const [claimAllBusy, setClaimAllBusy] = useState(false);
  const [claimAllStatus, setClaimAllStatus] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadFarms() {
      try {
        setLoadError("");
        const pools = await Promise.all(
          FARMS.map((farm) => publicClient.readContract({
            address: FARM_CONTRACT,
            abi: farmAbi,
            functionName: "poolInfo",
            args: [BigInt(farm.pid)],
          }) as Promise<PoolInfo>),
        );

        // Farm IDs survive LP migrations; always use the LP currently held by the pool.
        const resolvedFarms = FARMS.map((farm, index) => ({ ...farm, lp: pools[index][0] }));

        const lpPrices = await publicClient.readContract({
          address: PRICE_CALCULATOR,
          abi: priceAbi,
          functionName: "getBatchLpValue",
          args: [resolvedFarms.map((farm) => farm.lp)],
        });

        const lpDetails = await Promise.all(resolvedFarms.map(async (farm) => {
          const [token0Address, reserves, totalSupply] = await Promise.all([
            publicClient.readContract({ address: farm.lp, abi: lpPairAbi, functionName: "token0" }),
            publicClient.readContract({ address: farm.lp, abi: lpPairAbi, functionName: "getReserves" }),
            publicClient.readContract({ address: farm.lp, abi: lpPairAbi, functionName: "totalSupply" }),
          ]);
          return { token0Address, reserves, totalSupply };
        }));

        const rewardAddresses = Array.from(new Set(pools.map((pool) => pool[1].toLowerCase()))) as Address[];
        const canonicalRewardAddresses = rewardAddresses.map((address) => pools.find((pool) => pool[1].toLowerCase() === address)?.[1] ?? address);
        const [rewardPrices, rewardMetadata] = await Promise.all([
          publicClient.readContract({
            address: PRICE_CALCULATOR,
            abi: priceAbi,
            functionName: "getBatchPrice",
            args: [canonicalRewardAddresses],
          }),
          Promise.all(canonicalRewardAddresses.map(async (address) => {
            const [symbol, decimals] = await Promise.all([
              publicClient.readContract({ address, abi: tokenMetaAbi, functionName: "symbol" }),
              publicClient.readContract({ address, abi: tokenMetaAbi, functionName: "decimals" }),
            ]);
            return { address, symbol, decimals };
          })),
        ]);

        const rewardMap = new Map(rewardMetadata.map((meta, index) => [
          meta.address.toLowerCase(),
          { ...meta, price: rewardPrices[index] ?? 0n },
        ]));

        const now = BigInt(Math.floor(Date.now() / 1000));
        const live = await Promise.all(resolvedFarms.map(async (config, index): Promise<FarmLive> => {
          const pool = pools[index];
          const reward = rewardMap.get(pool[1].toLowerCase());
          const lpDetail = lpDetails[index];
          const [userInfo, pendingReward, walletBalance, allowance] = account
            ? await Promise.all([
                publicClient.readContract({ address: FARM_CONTRACT, abi: farmAbi, functionName: "userInfo", args: [BigInt(config.pid), account] }),
                publicClient.readContract({ address: FARM_CONTRACT, abi: farmAbi, functionName: "pendingReward", args: [BigInt(config.pid), account] }),
                publicClient.readContract({ address: config.lp, abi: lpAbi, functionName: "balanceOf", args: [account] }),
                publicClient.readContract({ address: config.lp, abi: lpAbi, functionName: "allowance", args: [account, FARM_CONTRACT] }),
              ])
            : [[0n, 0n] as const, 0n, 0n, 0n] as const;

          const totalRewards = pool[2];
          const poolSupply = pool[3];
          const startTime = pool[4];
          const endTime = pool[5];
          const duration = endTime > startTime ? endTime - startTime : 0n;
          const secondsLeft = endTime > now ? endTime - now : 0n;
          const remainingRewards = duration > 0n ? totalRewards * secondsLeft / duration : pool[11];
          const rewardDecimals = Number(reward?.decimals ?? 18);
          const lpPrice = Number(formatUnits(lpPrices[index] ?? 0n, 18));
          const rewardPrice = Number(formatUnits(reward?.price ?? 0n, 18));
          const stakedUsd = Number(formatUnits(poolSupply, 18)) * lpPrice;
          const remainingUsd = Number(formatUnits(remainingRewards, rewardDecimals)) * rewardPrice;
          const userStakedUsd = Number(formatUnits(userInfo[0], 18)) * lpPrice;
          const pendingUsd = Number(formatUnits(pendingReward, rewardDecimals)) * rewardPrice;
          const userPoolShare = poolSupply > 0n ? Number(userInfo[0]) / Number(poolSupply) : 0;
          const dailyRewardAmount = duration > 0n
            ? Number(formatUnits(totalRewards, rewardDecimals)) / Number(duration) * 86_400 * userPoolShare
            : 0;
          const daysLeft = Number(secondsLeft) / 86_400;
          const apr = stakedUsd > 0 && remainingUsd > 0 && daysLeft > 0
            ? Math.min((remainingUsd * (365 / daysLeft) / stakedUsd) * 100, 1_000_000)
            : 0;

          return {
            config,
            rewardAddress: pool[1],
            rewardSymbol: reward?.symbol ?? "TOKEN",
            rewardDecimals,
            apr,
            tvlUsd: stakedUsd + remainingUsd,
            stakedUsd,
            userStakedUsd,
            remainingUsd,
            pendingUsd,
            dailyRewardAmount,
            dailyRewardUsd: dailyRewardAmount * rewardPrice,
            remainingRewards,
            poolSupply,
            lpTotalSupply: lpDetail.totalSupply,
            lpToken0: lpDetail.token0Address,
            reserve0: lpDetail.reserves[0],
            reserve1: lpDetail.reserves[1],
            walletBalance,
            userStaked: userInfo[0],
            pendingReward,
            allowance,
            depositFeeBp: pool[8],
            withdrawFeeBp: pool[9],
            endTime: Number(endTime),
          };
        }));

        if (!cancelled) {
          setFarms(live);
          setLoading(false);
        }
      } catch (error) {
        if (!cancelled) {
          setLoading(false);
          setLoadError(error instanceof Error ? error.message : "Unable to load Nexion farms right now.");
        }
      }
    }

    void loadFarms();
    const timer = window.setInterval(() => { void loadFarms(); }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [account, refreshKey]);

  const displayedFarms = useMemo(
    () => farms.filter((farm) => !stakedOnly || farm.userStaked > 0n),
    [farms, stakedOnly],
  );

  const claimableFarms = useMemo(
    () => farms.filter((farm) => farm.pendingReward > 0n),
    [farms],
  );

  const summary = useMemo(() => ({
    tvl: farms.reduce((total, farm) => total + farm.tvlUsd, 0),
    rewards: farms.reduce((total, farm) => total + farm.remainingUsd, 0),
    highestApr: farms.reduce((highest, farm) => Math.max(highest, farm.apr), 0),
    active: farms.filter((farm) => farm.endTime > Date.now() / 1000).length,
    userStaked: farms.reduce((total, farm) => total + farm.userStakedUsd, 0),
    claimable: farms.reduce((total, farm) => total + farm.pendingUsd, 0),
    positions: farms.filter((farm) => farm.userStaked > 0n).length,
  }), [farms]);

  const rankings = useMemo(() => [
    { title: "Highest APR", farms: [...farms].sort((a, b) => b.apr - a.apr).slice(0, 3), value: (farm: FarmLive) => `${farm.apr.toFixed(2)}%` },
    { title: "Highest TVL", farms: [...farms].sort((a, b) => b.tvlUsd - a.tvlUsd).slice(0, 3), value: (farm: FarmLive) => usd(farm.tvlUsd) },
    { title: "Highest Rewards", farms: [...farms].sort((a, b) => b.remainingUsd - a.remainingUsd).slice(0, 3), value: (farm: FarmLive) => usd(farm.remainingUsd) },
  ], [farms]);

  const dailyRewards = useMemo(() => {
    const grouped = new Map<string, { amount: number; usd: number }>();
    farms.forEach((farm) => {
      const current = grouped.get(farm.rewardSymbol) ?? { amount: 0, usd: 0 };
      current.amount += farm.dailyRewardAmount;
      current.usd += farm.dailyRewardUsd;
      grouped.set(farm.rewardSymbol, current);
    });
    return Array.from(grouped, ([symbol, totals]) => ({ symbol, ...totals })).filter((item) => item.amount > 0);
  }, [farms]);

  const rewardLogo = (symbol: string) => {
    const match = Object.values(TOKENS).find((item) => item.symbol === symbol);
    return match?.logo ?? NEXION_LOGO;
  };

  function setFarmMessage(pid: number, message: string) {
    setMessages((current) => ({ ...current, [pid]: message }));
  }

  function togglePoolDetails(pid: number) {
    setExpandedPools((current) => {
      const next = new Set(current);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  }

  async function copyLpAddress(farm: FarmLive) {
    try {
      await navigator.clipboard.writeText(farm.config.lp);
      setFarmMessage(farm.config.pid, "LP contract address copied.");
    } catch {
      setFarmMessage(farm.config.pid, farm.config.lp);
    }
  }

  function parsedInput(pid: number) {
    const value = inputs[pid] || "";
    if (!value) throw new Error("Enter an LP amount first.");
    const amount = parseUnits(value, 18);
    if (amount <= 0n) throw new Error("Enter an LP amount greater than zero.");
    return amount;
  }

  async function runFarmAction(farm: FarmLive, action: "approve" | "stake" | "unstake" | "claim") {
    if (!account || !provider) {
      onConnect();
      return;
    }

    try {
      setBusyPid(farm.config.pid);
      setFarmMessage(farm.config.pid, action === "approve" ? "Confirm LP approval in your wallet…" : `Confirm ${action} in your wallet…`);
      const wallet = createWalletClient({ account, chain: pulsechain, transport: custom(provider) });
      let hash: Hash;

      if (action === "approve") {
        hash = await wallet.writeContract({
          address: farm.config.lp,
          abi: lpAbi,
          functionName: "approve",
          args: [FARM_CONTRACT, maxUint256],
        });
      } else if (action === "claim") {
        hash = await wallet.writeContract({
          address: FARM_CONTRACT,
          abi: farmAbi,
          functionName: "claim",
          args: [BigInt(farm.config.pid)],
        });
      } else {
        const amount = parsedInput(farm.config.pid);
        if (action === "stake") {
          if (amount > farm.walletBalance) throw new Error("That amount is higher than your LP wallet balance.");
          if (farm.allowance < amount) throw new Error("Approve this LP farm before staking.");
        } else if (amount > farm.userStaked) {
          throw new Error("That amount is higher than your staked LP balance.");
        }
        hash = await wallet.writeContract({
          address: FARM_CONTRACT,
          abi: farmAbi,
          functionName: action === "stake" ? "deposit" : "withdraw",
          args: [BigInt(farm.config.pid), amount],
        });
      }

      setFarmMessage(farm.config.pid, "Transaction submitted — waiting for PulseChain…");
      await waitForReceipt(hash);
      setInputs((current) => ({ ...current, [farm.config.pid]: "" }));
      setFarmMessage(farm.config.pid, `${action[0].toUpperCase()}${action.slice(1)} confirmed.`);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setFarmMessage(farm.config.pid, actionMessage(error));
    } finally {
      setBusyPid(null);
    }
  }

  async function claimAll() {
    if (claimAllBusy) return;
    if (!account || !provider) {
      onConnect();
      return;
    }
    if (claimableFarms.length === 0) {
      setClaimAllStatus("No pending rewards on these Limited farms.");
      return;
    }

    try {
      setClaimAllBusy(true);
      setClaimAllStatus(`Preparing ${claimableFarms.length} active position${claimableFarms.length === 1 ? "" : "s"}…`);
      claimableFarms.forEach((farm) => setFarmMessage(farm.config.pid, "Queued for Claim All…"));

      const wallet = createWalletClient({ account, chain: pulsechain, transport: custom(provider) });
      const hash = await wallet.writeContract({
        address: FARM_CONTRACT,
        abi: farmAbi,
        functionName: "claimMany",
        args: [claimableFarms.map((farm) => BigInt(farm.config.pid))],
      });

      const shortHash = `${hash.slice(0, 8)}…${hash.slice(-4)}`;
      setClaimAllStatus(`Claim submitted ${shortHash} — waiting for PulseChain…`);
      claimableFarms.forEach((farm) => setFarmMessage(farm.config.pid, "Claim All submitted…"));
      await waitForReceipt(hash);

      setClaimAllStatus(`Claimed ${claimableFarms.length} active position${claimableFarms.length === 1 ? "" : "s"}.`);
      claimableFarms.forEach((farm) => setFarmMessage(farm.config.pid, "Claim confirmed."));
      setRefreshKey((value) => value + 1);
    } catch (error) {
      const message = actionMessage(error);
      setClaimAllStatus(message);
      claimableFarms.forEach((farm) => setFarmMessage(farm.config.pid, message));
    } finally {
      setClaimAllBusy(false);
    }
  }

  return (
    <section className="limited-farms-view" aria-labelledby="limited-farms-heading">
      <h1 id="limited-farms-heading" className="limited-farms-sr-only">Limited Nexion Farms</h1>

      <div className="limited-farms-total-tvl" aria-label={`Total value locked ${usd(summary.tvl)}`}>
        <span>Total Value Locked:</span>
        <strong>{loading ? "Loading…" : usd(summary.tvl).replace(" USD", "")}</strong>
      </div>

      <div className="limited-farms-ranking" aria-label="Limited farm rankings">
        {rankings.map((group) => (
          <div className="limited-rank-card" key={group.title}>
            <h2>{group.title}</h2>
            <div className="limited-rank-list">
              {(loading ? FARMS.slice(0, 3).map((config) => ({ config } as FarmLive)) : group.farms).map((farm, index) => (
                <a href={`#limited-farm-${farm.config.pid}`} className="limited-rank-row" key={`${group.title}-${farm.config.pid}`}>
                  <span className="limited-rank-position">{index + 1}</span>
                  <span className="limited-rank-pair">
                    <span className="limited-farm-logos" aria-hidden="true">
                      {farm.config.tokens.map((item) => <img key={item.symbol} src={item.logo} alt="" />)}
                    </span>
                    <b>{farm.config.tokens.map((item) => item.symbol).join("/")} LP <small>#{farm.config.id}</small></b>
                  </span>
                  <strong>{loading ? "Loading" : group.value(farm)}</strong>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="limited-farms-panel">
        <div className="limited-farms-toolbar">
          <div className="limited-farms-brand-stack">
            <a className="limited-farms-brand" href={NEXION_FARMS_URL} target="_blank" rel="noreferrer">
              <img src={NEXION_LOGO} alt="Nexion logo" />
              <b>Nexion Farms</b>
              <small>{summary.active || FARMS.length} farms</small>
            </a>
            <label className="limited-farms-staked-filter">
              <input type="checkbox" checked={stakedOnly} onChange={(event) => setStakedOnly(event.target.checked)} />
              <span className="limited-toggle-orb" aria-hidden="true" />
              <span>Staked</span>
            </label>
          </div>
          <div className="limited-farms-view-toggle" aria-label="Farm layout">
            <button type="button" className={viewMode === "grid" ? "active" : ""} onClick={() => setViewMode("grid")} aria-label="Grid view">▦</button>
            <button type="button" className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")} aria-label="List view">☰</button>
          </div>
        </div>

        <div className="limited-farms-user-summary">
          <div className="limited-user-total"><span>Total staked:</span><strong>{account ? usd(summary.userStaked) : "$0.00 USD"}</strong></div>
          <div className="limited-user-total"><span>Total claimable rewards:</span><strong>{account ? usd(summary.claimable) : "$0.00 USD"}</strong></div>
          <div className="limited-daily-rewards">
            <span>Projected daily rewards:</span>
            <div>
              {dailyRewards.length ? dailyRewards.map((item) => (
                <span className="limited-daily-token" key={item.symbol}>
                  <img src={rewardLogo(item.symbol)} alt="" />
                  {item.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} {item.symbol}
                </span>
              )) : <small>{account ? "No active Limited positions" : "Connect wallet to calculate"}</small>}
            </div>
            <b>≈ {usd(dailyRewards.reduce((total, item) => total + item.usd, 0))} / day</b>
          </div>
          <div className="limited-claim-all">
            <span>{summary.positions} active position{summary.positions === 1 ? "" : "s"}</span>
            <button type="button" disabled={!account || claimableFarms.length === 0 || busyPid !== null || claimAllBusy} onClick={() => void claimAll()}>{claimAllBusy ? "Claiming…" : "Claim all"}</button>
            {claimAllStatus && <small className="limited-claim-all-status" role="status">{claimAllStatus}</small>}
          </div>
        </div>

        {loadError && <p className="limited-farms-error" role="alert">Unable to load live farm data: {loadError}</p>}
        {loading && farms.length === 0 ? (
          <div className="limited-farms-loading">Loading Limited Nexion farms…</div>
        ) : displayedFarms.length === 0 ? (
          <div className="limited-farms-loading">No farms match this filter.</div>
        ) : (
          <div className={`limited-farms-grid ${viewMode === "list" ? "list" : ""}`}>
            {displayedFarms.map((farm) => {
              const pairName = `${farm.config.tokens[0].symbol} / ${farm.config.tokens[1].symbol}`;
              const busy = claimAllBusy || busyPid === farm.config.pid;
              const approved = farm.allowance > 0n;
              const expanded = expandedPools.has(farm.config.pid);
              const firstTokenIsToken0 = farm.config.tokens[0].address.toLowerCase() === farm.lpToken0.toLowerCase();
              const firstReserve = firstTokenIsToken0 ? farm.reserve0 : farm.reserve1;
              const secondReserve = firstTokenIsToken0 ? farm.reserve1 : farm.reserve0;
              const firstUnderlying = farm.lpTotalSupply > 0n ? farm.userStaked * firstReserve / farm.lpTotalSupply : 0n;
              const secondUnderlying = farm.lpTotalSupply > 0n ? farm.userStaked * secondReserve / farm.lpTotalSupply : 0n;
              const dailyApr = farm.apr / 365;
              return (
                <article className="limited-farm-card" key={farm.config.pid} id={`limited-farm-${farm.config.pid}`}>
                  <header className="limited-farm-card-head">
                    <div className="limited-farm-title">
                      <span className="limited-farm-logos" aria-hidden="true">
                        {farm.config.tokens.map((item) => <img key={item.symbol} src={item.logo} alt="" />)}
                      </span>
                      <span>
                        <span className="limited-farm-pair-line">
                          <b>{pairName}</b>
                          <button type="button" className="limited-copy-lp" aria-label={`Copy ${pairName} LP address`} onClick={() => void copyLpAddress(farm)}>
                            <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="7" height="7" rx="1.5" /><path d="M4 10H3.5A1.5 1.5 0 0 1 2 8.5v-5A1.5 1.5 0 0 1 3.5 2h5A1.5 1.5 0 0 1 10 3.5V4" /></svg>
                          </button>
                        </span>
                        <small>PLP V2</small>
                      </span>
                    </div>
                    <a href={manageLiquidityUrl(farm.config)} target="_blank" rel="noreferrer">Manage Liquidity</a>
                  </header>

                  <div className="limited-farm-primary-metrics">
                    <div>
                      <span>APR</span>
                      <strong className="limited-apr-wrap">
                        {farm.apr.toFixed(2)}%
                        <button type="button" aria-label={`${pairName} APR breakdown`}>🧮</button>
                        <span className="limited-card-popover" role="tooltip">
                          <b>🧮 APR Breakdown</b>
                          <span>Daily: <strong>{dailyApr.toFixed(2)}%</strong></span>
                          <span>Weekly: <strong>{(dailyApr * 7).toFixed(2)}%</strong></span>
                          <span>Monthly: <strong>{(farm.apr / 12).toFixed(2)}%</strong></span>
                          <span>Yearly: <strong>{farm.apr.toFixed(2)}%</strong></span>
                        </span>
                      </strong>
                    </div>
                    <div><span>Fees</span><strong>{percentFromBp(farm.depositFeeBp)} / {percentFromBp(farm.withdrawFeeBp)}</strong></div>
                  </div>

                  <div className="limited-farm-stats">
                    <div>
                      <span>Balance</span>
                      <span className="limited-balance-row"><strong>{account ? tokenAmount(farm.walletBalance, 18, 4) : "0"}</strong><button type="button" disabled={!account || farm.walletBalance === 0n} onClick={() => setInputs((current) => ({ ...current, [farm.config.pid]: formatUnits(farm.walletBalance, 18) }))}>[MAX]</button></span>
                      <small>{account ? "LP in wallet" : "Connect wallet"}</small>
                    </div>
                    <div><span>Remaining rewards</span><strong>{tokenAmount(farm.remainingRewards, farm.rewardDecimals)}</strong><small className="limited-token-usd"><img src={rewardLogo(farm.rewardSymbol)} alt="" />{usd(farm.remainingUsd)}</small></div>
                    <div>
                      <span className="limited-staked-label"><span>Staked</span><button type="button" aria-expanded={expanded} aria-controls={`limited-lp-details-${farm.config.pid}`} onClick={() => togglePoolDetails(farm.config.pid)}>{expanded ? "[-]" : "[+]"}</button></span>
                      <span className="limited-balance-row"><strong>{account ? tokenAmount(farm.userStaked, 18, 4) : "0"}</strong><button type="button" disabled={!account || farm.userStaked === 0n} onClick={() => setInputs((current) => ({ ...current, [farm.config.pid]: formatUnits(farm.userStaked, 18) }))}>[MAX]</button></span>
                      <small>{usd(farm.userStakedUsd)} ({farm.poolSupply > 0n ? (Number(farm.userStaked) / Number(farm.poolSupply) * 100).toFixed(2) : "0"}%)</small>
                    </div>
                    <div>
                      <span>Rewards</span>
                      <strong className="limited-reward-line">
                        <img src={rewardLogo(farm.rewardSymbol)} alt="" />{account ? `${tokenAmount(farm.pendingReward, farm.rewardDecimals, 4)} ${farm.rewardSymbol}` : `0 ${farm.rewardSymbol}`}
                        <span className="limited-reward-projection">
                          <button type="button" aria-label={`${farm.rewardSymbol} reward projection`}>
                            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 12.5V3.5M2.5 12.5h11M4.5 10l2.4-2.4 2 1.5 3.1-4" /><path d="M9.8 5.1H12V7.3" /></svg>
                          </button>
                          <span className="limited-card-popover" role="tooltip">
                            <b>{farm.rewardSymbol} Reward Projection</b>
                            <span>Daily: <strong>{farm.dailyRewardAmount.toLocaleString("en-US", { maximumFractionDigits: 4 })} {farm.rewardSymbol}</strong></span>
                            <span>Weekly: <strong>{(farm.dailyRewardAmount * 7).toLocaleString("en-US", { maximumFractionDigits: 4 })} {farm.rewardSymbol}</strong></span>
                            <span>Monthly: <strong>{(farm.dailyRewardAmount * 30).toLocaleString("en-US", { maximumFractionDigits: 4 })} {farm.rewardSymbol}</strong></span>
                            <span>Yearly: <strong>{(farm.dailyRewardAmount * 365).toLocaleString("en-US", { maximumFractionDigits: 4 })} {farm.rewardSymbol}</strong></span>
                          </span>
                        </span>
                      </strong>
                      <small>{usd(farm.pendingUsd)}</small>
                    </div>
                  </div>

                  {expanded && (
                    <div className="limited-lp-breakdown" id={`limited-lp-details-${farm.config.pid}`}>
                      <div><span><img src={farm.config.tokens[0].logo} alt="" />{farm.config.tokens[0].symbol} in your staked LP</span><strong>{tokenAmount(firstUnderlying, 18, 4)}</strong></div>
                      <div><span><img src={farm.config.tokens[1].logo} alt="" />{farm.config.tokens[1].symbol} in your staked LP</span><strong>{tokenAmount(secondUnderlying, 18, 4)}</strong></div>
                    </div>
                  )}

                  <div className="limited-farm-actions">
                    <div className="limited-farm-claim-row"><button className="limited-farm-claim" type="button" disabled={!account || busy || farm.pendingReward === 0n} onClick={() => void runFarmAction(farm, "claim")}>Claim</button></div>
                    <div className="limited-farm-amount-wrap">
                      <input
                        inputMode="decimal"
                        aria-label={`${pairName} LP amount`}
                        placeholder={account ? "Amount" : "Connect wallet…"}
                        disabled={!account}
                        value={inputs[farm.config.pid] || ""}
                        onChange={(event) => setInputs((current) => ({ ...current, [farm.config.pid]: normalizeInput(event.target.value) }))}
                      />
                    </div>
                    <div className="limited-farm-action-buttons">
                      <button type="button" disabled={!account || busy} onClick={() => void runFarmAction(farm, "stake")}>Stake</button>
                      <button type="button" disabled={!account || busy || farm.userStaked === 0n} onClick={() => void runFarmAction(farm, "unstake")}>Unstake</button>
                    </div>
                    <button className="limited-farm-approve" type="button" disabled={Boolean(account && (busy || approved))} onClick={account ? () => void runFarmAction(farm, "approve") : onConnect}>{account ? (approved ? "LP Approved" : "Approve MAX") : "Connect Wallet"}</button>
                  </div>

                  {messages[farm.config.pid] && <p className="limited-farm-message" role="status">{messages[farm.config.pid]}</p>}
                  <footer>
                    <span className="limited-footer-time">Time Left: <b>{timeLeft(farm.endTime)}</b></span>
                    <span className="limited-footer-staked">Pool Staked: <b>{tokenAmount(farm.poolSupply, 18, 2)}</b> · {usd(farm.stakedUsd)}</span>
                    <span className="limited-footer-tvl">TVL: <b>{usd(farm.tvlUsd)}</b></span>
                    <a className="limited-footer-rank" href={`https://scan.pulsechain.com/address/${farm.config.lp}`} target="_blank" rel="noreferrer">#{farm.config.id}</a>
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
