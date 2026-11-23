import fs from "node:fs";
import path from "node:path";
import solc from "solc";

const root = process.cwd();
const sourceDir = path.join(root, "contracts", "src");
const sourceNames = fs.readdirSync(sourceDir).filter((name) => name.endsWith(".sol"));
const sources = Object.fromEntries(
  sourceNames.map((name) => [
    `contracts/src/${name}`,
    { content: fs.readFileSync(path.join(sourceDir, name), "utf8") },
  ]),
);

function findImports(importPath) {
  const candidates = [path.join(root, importPath), path.join(root, "node_modules", importPath)];
  const resolved = candidates.find((candidate) => fs.existsSync(candidate));
  return resolved
    ? { contents: fs.readFileSync(resolved, "utf8") }
    : { error: `Import not found: ${importPath}` };
}

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "paris",
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
const errors = (output.errors ?? []).filter((item) => item.severity === "error");
if (errors.length) {
  for (const error of errors) process.stderr.write(`${error.formattedMessage}\n`);
  process.exit(1);
}

const artifactDir = path.join(root, "contracts", "artifacts");
fs.mkdirSync(artifactDir, { recursive: true });
for (const artifactName of fs.readdirSync(artifactDir)) {
  if (artifactName.endsWith(".json")) fs.rmSync(path.join(artifactDir, artifactName));
}

const productionContracts = [
  {
    name: "CashXLCashXMintExchange",
    source: "contracts/src/CashXLCashXMintExchange.sol",
  },
  {
    name: "DistroXLDistroXMintExchange",
    source: "contracts/src/DistroXLDistroXMintExchange.sol",
  },
  {
    name: "DivXLDivXMintExchange",
    source: "contracts/src/DivXLDivXMintExchange.sol",
  },
  {
    name: "GSXLGSXMintExchange",
    source: "contracts/src/GSXLGSXMintExchange.sol",
  },
];

for (const { name: contractName, source: sourceName } of productionContracts) {
  const contract = output.contracts[sourceName][contractName];
  fs.writeFileSync(
    path.join(artifactDir, `${contractName}.json`),
    JSON.stringify(
      {
        contractName,
        sourceName,
        compiler: {
          version: solc.version(),
          evmVersion: input.settings.evmVersion,
          optimizer: input.settings.optimizer,
        },
        abi: contract.abi,
        bytecode: `0x${contract.evm.bytecode.object}`,
        deployedBytecode: `0x${contract.evm.deployedBytecode.object}`,
      },
      null,
      2,
    ),
  );
}

for (const { name: contractName, source: sourceName } of productionContracts) {
  const contract = output.contracts[sourceName][contractName];
  const deployedBytes = contract.evm.deployedBytecode.object.length / 2;
  if (deployedBytes > 24_576) {
    throw new Error(
      `${contractName} runtime bytecode is ${deployedBytes} bytes and exceeds the 24,576-byte EVM limit.`,
    );
  }
}

process.stdout.write(
  `${productionContracts.map(({ name }) => name).join(", ")} compiled successfully.\n`,
);
