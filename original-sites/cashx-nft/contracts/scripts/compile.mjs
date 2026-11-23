import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileContract } from "./compile-contract.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const artifactDirectory = resolve(scriptDirectory, "../artifacts");
const artifactPath = resolve(artifactDirectory, "CashXEcosystemNFT.json");
const artifact = compileContract();

mkdirSync(artifactDirectory, { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);

console.log(`Compiled ${artifact.contractName} with ${artifact.compilerVersion}.`);
console.log(`EVM target: ${artifact.evmVersion}`);
console.log(`Artifact: ${artifactPath}`);
