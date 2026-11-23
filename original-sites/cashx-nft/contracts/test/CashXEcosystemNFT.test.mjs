import assert from "node:assert/strict";
import test from "node:test";
import { BrowserProvider, ContractFactory, parseEther } from "ethers";
import ganache from "ganache";
import { compileContract } from "../scripts/compile-contract.mjs";

const artifact = compileContract();
const TOKEN_URI = "ipfs://bafy-test/cashx-ecosystem.json";
const PRICE = parseEther("1000000");
const TESTNET_PRICE = parseEther("0.1");

async function fixture(price = PRICE) {
  const eip1193Provider = ganache.provider({
    chain: { hardfork: "shanghai" },
    logging: { quiet: true },
    wallet: { defaultBalance: 100_000_000, totalAccounts: 6 },
  });
  const provider = new BrowserProvider(eip1193Provider);
  const owner = await provider.getSigner(0);
  const buyer = await provider.getSigner(1);
  const treasury = await provider.getSigner(2);
  const nextTreasury = await provider.getSigner(3);
  const stakingOperator = await provider.getSigner(4);
  const recipient = await provider.getSigner(5);
  const factory = new ContractFactory(artifact.abi, artifact.bytecode, owner);
  const contract = await factory.deploy(
    await owner.getAddress(),
    await treasury.getAddress(),
    TOKEN_URI,
    price,
  );
  await contract.waitForDeployment();

  return {
    provider,
    owner,
    buyer,
    treasury,
    nextTreasury,
    stakingOperator,
    recipient,
    contract,
  };
}

async function expectRevert(action) {
  await assert.rejects(async () => {
    const transaction = await action();
    await transaction.wait();
  });
}

test("deployment locks the configured collection economics and starts with sale closed", async () => {
  const { contract } = await fixture();

  assert.equal(await contract.name(), "CashX Ecosystem");
  assert.equal(await contract.symbol(), "CASHXNFT");
  assert.equal(await contract.MAX_SUPPLY(), 10_000n);
  assert.equal(await contract.PRICE_PER_NFT(), PRICE);
  assert.equal(await contract.saleActive(), false);
  assert.equal(await contract.remainingSupply(), 10_000n);
});

test("a low testnet price uses the same protected mint and treasury path", async () => {
  const { provider, owner, buyer, treasury, contract } = await fixture(TESTNET_PRICE);
  await (await contract.connect(owner).setSaleActive(true)).wait();

  const treasuryAddress = await treasury.getAddress();
  const balanceBefore = await provider.getBalance(treasuryAddress);
  await (await contract.connect(buyer).mint(3, { value: TESTNET_PRICE * 3n })).wait();
  const balanceAfter = await provider.getBalance(treasuryAddress);

  assert.equal(await contract.PRICE_PER_NFT(), TESTNET_PRICE);
  assert.equal(await contract.quote(3), TESTNET_PRICE * 3n);
  assert.equal(balanceAfter - balanceBefore, TESTNET_PRICE * 3n);
});

test("mint creates sequential NFTs with shared metadata and forwards all PLS", async () => {
  const { provider, owner, buyer, treasury, contract } = await fixture();
  await (await contract.connect(owner).setSaleActive(true)).wait();

  const treasuryAddress = await treasury.getAddress();
  const balanceBefore = await provider.getBalance(treasuryAddress);
  await (await contract.connect(buyer).mint(2, { value: PRICE * 2n })).wait();
  const balanceAfter = await provider.getBalance(treasuryAddress);

  assert.equal(balanceAfter - balanceBefore, PRICE * 2n);
  assert.equal(await contract.totalSupply(), 2n);
  assert.equal(await contract.ownerOf(1), await buyer.getAddress());
  assert.equal(await contract.ownerOf(2), await buyer.getAddress());
  assert.equal(await contract.tokenURI(1), TOKEN_URI);
  assert.equal(await contract.tokenURI(2), TOKEN_URI);
  assert.equal(await provider.getBalance(await contract.getAddress()), 0n);
});

test("closed sales, zero quantities, sold-out requests, and incorrect payments revert", async () => {
  const { owner, buyer, contract } = await fixture();

  await expectRevert(() => contract.connect(buyer).mint(1, { value: PRICE }));
  await (await contract.connect(owner).setSaleActive(true)).wait();
  await expectRevert(() => contract.connect(buyer).mint(0));
  await expectRevert(() => contract.connect(buyer).mint(10_001));
  await expectRevert(() => contract.connect(buyer).mint(1, { value: PRICE - 1n }));
  await expectRevert(() => contract.connect(buyer).mint(1, { value: PRICE + 1n }));
});

test("does not impose an artificial per-transaction mint limit", async () => {
  const { owner, buyer, contract } = await fixture();
  await (await contract.connect(owner).setSaleActive(true)).wait();

  await (await contract.connect(buyer).mint(25, { value: PRICE * 25n })).wait();
  assert.equal(await contract.totalSupply(), 25n);
  assert.equal(await contract.balanceOf(await buyer.getAddress()), 25n);
});

test("buyWithPLS compatibility entry point uses the same protected mint path", async () => {
  const { owner, buyer, contract } = await fixture();
  await (await contract.connect(owner).setSaleActive(true)).wait();
  assert.equal(await contract.nftPrice(), PRICE);
  assert.equal(await contract.quote(3), PRICE * 3n);

  await (await contract.connect(buyer).buyWithPLS(1, { value: PRICE })).wait();
  assert.equal(await contract.totalSupply(), 1n);
});

test("metadata can be permanently frozen", async () => {
  const { owner, contract } = await fixture();
  const replacementURI = "ipfs://bafy-test/replacement.json";

  await (await contract.connect(owner).setSharedTokenURI(replacementURI)).wait();
  await (await contract.connect(owner).freezeMetadata()).wait();
  assert.equal(await contract.metadataFrozen(), true);
  assert.equal(await contract.sharedTokenURI(), replacementURI);
  await expectRevert(() => contract.connect(owner).setSharedTokenURI(TOKEN_URI));
  await expectRevert(() => contract.connect(owner).freezeMetadata());
});

test("treasury changes require acceptance by the proposed address", async () => {
  const { owner, buyer, nextTreasury, contract } = await fixture();
  const nextTreasuryAddress = await nextTreasury.getAddress();

  await (await contract.connect(owner).startTreasuryTransfer(nextTreasuryAddress)).wait();
  assert.equal(await contract.pendingTreasury(), nextTreasuryAddress);
  await expectRevert(() => contract.connect(buyer).acceptTreasury());
  await (await contract.connect(nextTreasury).acceptTreasury()).wait();

  assert.equal(await contract.treasury(), nextTreasuryAddress);
  assert.equal(await contract.pendingTreasury(), "0x0000000000000000000000000000000000000000");
});

test("non-owners cannot change sale, metadata, or treasury controls", async () => {
  const { buyer, nextTreasury, contract } = await fixture();

  await expectRevert(() => contract.connect(buyer).setSaleActive(true));
  await expectRevert(() => contract.connect(buyer).setSharedTokenURI("ipfs://unauthorized"));
  await expectRevert(() =>
    contract.connect(buyer).startTreasuryTransfer(nextTreasury.getAddress()),
  );
});

test("supports standard ERC-721 approvals and operator transfers used by staking farms", async () => {
  const { owner, buyer, stakingOperator, recipient, contract } = await fixture();
  await (await contract.connect(owner).setSaleActive(true)).wait();
  await (await contract.connect(buyer).mint(1, { value: PRICE })).wait();

  assert.equal(await contract.supportsInterface("0x80ac58cd"), true);
  assert.equal(await contract.supportsInterface("0x780e9d63"), true);

  await (await contract.connect(buyer).setApprovalForAll(
    await stakingOperator.getAddress(),
    true,
  )).wait();
  await (await contract.connect(stakingOperator).transferFrom(
    await buyer.getAddress(),
    await recipient.getAddress(),
    1,
  )).wait();

  assert.equal(await contract.ownerOf(1), await recipient.getAddress());
});

test("rejects direct PLS and requires two-step ownership acceptance", async () => {
  const { owner, buyer, contract } = await fixture();
  await expectRevert(() => buyer.sendTransaction({
    to: contract.getAddress(),
    value: 1n,
  }));

  const buyerAddress = await buyer.getAddress();
  const ownerAddress = await owner.getAddress();
  await (await contract.connect(owner).transferOwnership(buyerAddress)).wait();
  assert.equal(await contract.owner(), ownerAddress);
  assert.equal(await contract.pendingOwner(), buyerAddress);
  await (await contract.connect(buyer).acceptOwnership()).wait();
  assert.equal(await contract.owner(), buyerAddress);
});
