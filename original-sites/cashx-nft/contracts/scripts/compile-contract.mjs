import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "../..");
const sourcePath = resolve(projectRoot, "contracts/CashXEcosystemNFT.sol");
const sourceName = "contracts/CashXEcosystemNFT.sol";

function findImport(importPath) {
  try {
    const resolvedPath = resolve(projectRoot, "node_modules", importPath);
    return { contents: readFileSync(resolvedPath, "utf8") };
  } catch {
    return { error: `Unable to resolve Solidity import: ${importPath}` };
  }
}

export function compileContract() {
  const input = {
    language: "Solidity",
    sources: {
      [sourceName]: { content: readFileSync(sourcePath, "utf8") },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "paris",
      outputSelection: {
        "*": {
          "*": ["abi", "metadata", "evm.bytecode.object", "evm.deployedBytecode.object"],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImport }));
  const diagnostics = output.errors ?? [];
  const errors = diagnostics.filter(({ severity }) => severity === "error");

  if (errors.length > 0) {
    throw new Error(errors.map(({ formattedMessage }) => formattedMessage).join("\n"));
  }

  const contract = output.contracts?.[sourceName]?.CashXEcosystemNFT;
  if (!contract) throw new Error("CashXEcosystemNFT compiler output was not found.");

  return {
    contractName: "CashXEcosystemNFT",
    sourceName,
    compilerVersion: solc.version(),
    evmVersion: "paris",
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`,
    deployedBytecode: `0x${contract.evm.deployedBytecode.object}`,
  };
}
