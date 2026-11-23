import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ContractFactory,
  JsonRpcProvider,
  Wallet,
  formatEther,
  getAddress,
  isAddress,
  parseEther,
} from "ethers";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const artifactPath = resolve(scriptDirectory, "../artifacts/CashXEcosystemNFT.json");

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function requiredAddress(name) {
  const value = required(name);
  if (!isAddress(value)) throw new Error(`${name} is not a valid EVM address.`);
  return getAddress(value);
}

const rpcUrl = required("RPC_URL");
const privateKey = required("DEPLOYER_PRIVATE_KEY");
const ownerAddress = requiredAddress("OWNER_ADDRESS");
const treasuryAddress = requiredAddress("TREASURY_ADDRESS");
const tokenURI = required("TOKEN_URI");
const expectedChainId = BigInt(required("EXPECTED_CHAIN_ID"));

const provider = new JsonRpcProvider(rpcUrl);
const network = await provider.getNetwork();
if (network.chainId !== expectedChainId) {
  throw new Error(
    `Refusing deployment: RPC chain ID is ${network.chainId}, expected ${expectedChainId}.`,
  );
}

const MAINNET_CHAIN_ID = 369n;
const TESTNET_V4_CHAIN_ID = 943n;
const pricePerNFT =
  network.chainId === MAINNET_CHAIN_ID
    ? parseEther("1000000")
    : network.chainId === TESTNET_V4_CHAIN_ID
      ? parseEther("0.1")
      : null;

if (pricePerNFT === null) {
  throw new Error(
    `Unsupported deployment chain ${network.chainId}. Only PulseChain mainnet (369) and Testnet V4 (943) are allowed.`,
  );
}

const signer = new Wallet(privateKey, provider);
const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
const factory = new ContractFactory(artifact.abi, artifact.bytecode, signer);

console.log(`Deploying from: ${signer.address}`);
console.log(`Initial owner: ${ownerAddress}`);
console.log(`Treasury: ${treasuryAddress}`);
console.log(`Network chain ID: ${network.chainId}`);
console.log(`Mint price: ${formatEther(pricePerNFT)} native PLS`);

const contract = await factory.deploy(ownerAddress, treasuryAddress, tokenURI, pricePerNFT);
console.log(`Deployment transaction: ${contract.deploymentTransaction().hash}`);
await contract.waitForDeployment();

console.log(`CashXEcosystemNFT deployed at: ${await contract.getAddress()}`);
console.log("The sale is CLOSED. Verify the deployment before the owner calls setSaleActive(true).");
