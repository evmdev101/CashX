const chainId = process.env.NEXT_PUBLIC_CASHX_CHAIN_ID?.trim() || "369";
if (chainId !== "369" && chainId !== "943") {
  throw new Error("NEXT_PUBLIC_CASHX_CHAIN_ID must be 369 or 943.");
}

const address = process.env.NEXT_PUBLIC_CASHX_CONTRACT_ADDRESS?.trim()
  || "0x744351E2846498D040B649D694CAB21f32f14AFe";
const deploymentBlock = process.env.NEXT_PUBLIC_CASHX_DEPLOYMENT_BLOCK?.trim()
  || "27306495";

if (chainId === "369") {
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error(
      "Mainnet build refused: NEXT_PUBLIC_CASHX_CONTRACT_ADDRESS is missing or invalid.",
    );
  }
  if (!deploymentBlock || !/^\d+$/.test(deploymentBlock) || Number(deploymentBlock) <= 0) {
    throw new Error(
      "Mainnet build refused: NEXT_PUBLIC_CASHX_DEPLOYMENT_BLOCK is missing or invalid.",
    );
  }
}

console.log(
  chainId === "369"
    ? `Validated PulseChain mainnet site configuration for ${address}.`
    : "Validated PulseChain Testnet V4 site configuration.",
);
