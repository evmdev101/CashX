const TESTNET_CONTRACT_ADDRESS = "0x54Fa3D2FF523417D0887625BA5fc01F8063a5104";
const TESTNET_DEPLOYMENT_BLOCK = 25_142_463;
const MAINNET_CONTRACT_ADDRESS = "0x744351E2846498D040B649D694CAB21f32f14AFe";
const MAINNET_DEPLOYMENT_BLOCK = 27_306_495;

const configuredChainId = Number(process.env.NEXT_PUBLIC_CASHX_CHAIN_ID ?? "369");
if (configuredChainId !== 369 && configuredChainId !== 943) {
  throw new Error("NEXT_PUBLIC_CASHX_CHAIN_ID must be 369 or 943.");
}

const chainConfig = configuredChainId === 369
  ? {
      chainIdHex: "0x171",
      chainName: "PulseChain",
      nativeCurrency: {
        name: "Pulse",
        symbol: "PLS",
        decimals: 18,
      },
      rpcUrls: ["https://rpc.pulsechain.com"],
      blockExplorerUrls: ["https://scan.pulsechain.com"],
    }
  : {
      chainIdHex: "0x3af",
      chainName: "PulseChain Testnet v4",
      nativeCurrency: {
        name: "Test Pulse",
        symbol: "tPLS",
        decimals: 18,
      },
      rpcUrls: ["https://rpc.v4.testnet.pulsechain.com"],
      blockExplorerUrls: ["https://scan.v4.testnet.pulsechain.com"],
    };

const defaultAddress = configuredChainId === 369
  ? MAINNET_CONTRACT_ADDRESS
  : TESTNET_CONTRACT_ADDRESS;
const configuredAddress =
  process.env.NEXT_PUBLIC_CASHX_CONTRACT_ADDRESS?.trim() || defaultAddress;
if (!/^0x[0-9a-fA-F]{40}$/.test(configuredAddress)) {
  throw new Error(
    "NEXT_PUBLIC_CASHX_CONTRACT_ADDRESS must contain the deployed contract address.",
  );
}

const defaultDeploymentBlock = configuredChainId === 943
  ? TESTNET_DEPLOYMENT_BLOCK
  : MAINNET_DEPLOYMENT_BLOCK;
const configuredDeploymentBlock = Number(
  process.env.NEXT_PUBLIC_CASHX_DEPLOYMENT_BLOCK ?? defaultDeploymentBlock,
);
if (!Number.isSafeInteger(configuredDeploymentBlock) || configuredDeploymentBlock <= 0) {
  throw new Error(
    "NEXT_PUBLIC_CASHX_DEPLOYMENT_BLOCK must contain the contract deployment block.",
  );
}

export const CASHX_CONTRACT_ADDRESS = configuredAddress;
export const CASHX_DEPLOYMENT_BLOCK = configuredDeploymentBlock;
export const CASHX_CHAIN_ID = configuredChainId;
export const CASHX_NETWORK = chainConfig;

const TREASURY_ADDRESS = "0x8875b605ad560792FC8420F901235961d863F62e";

export const IMPORTANT_CONTRACTS = [
  {
    label: "CashX Ecosystem NFT contract",
    address: configuredAddress,
  },
  {
    label: "Mint treasury",
    address: TREASURY_ADDRESS,
  },
];

export const CASHX_ABI = [
  "function PRICE_PER_NFT() view returns (uint256)",
  "function MAX_SUPPLY() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function remainingSupply() view returns (uint256)",
  "function saleActive() view returns (bool)",
  "function mint(uint256 quantity) payable",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "event Minted(address indexed buyer, uint256 indexed firstTokenId, uint256 quantity, uint256 totalPaid)",
] as const;

export const INITIAL_PRICE_WEI = configuredChainId === 369
  ? BigInt("1000000000000000000000000")
  : BigInt("100000000000000000");
