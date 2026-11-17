// Runs the real launch transaction against an in-process Solana runtime (LiteSVM, with the SPL programs).
const test = require("node:test");
const assert = require("node:assert");
const { LiteSVM } = require("litesvm");
const { Keypair, LAMPORTS_PER_SOL, PublicKey } = require("@solana/web3.js");
const {
  TOKEN_2022_PROGRAM_ID, unpackMint, unpackAccount, getTokenMetadata,
  getExtensionData, ExtensionType, createTransferCheckedInstruction,
  getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction,
} = require("@solana/spl-token");
const { unpack } = require("@solana/spl-token-metadata");
const { Transaction } = require("@solana/web3.js");
const { buildLaunchTx, mintSizes, NAME, SYMBOL, DECIMALS, RAW_SUPPLY } = require("./launch");

function setup() {
  const svm = new LiteSVM();
  const owner = Keypair.generate();
  const mint = Keypair.generate();
  svm.airdrop(owner.publicKey, BigInt(LAMPORTS_PER_SOL));
  const rent = svm.minimumBalanceForRentExemption(BigInt(mintSizes(mint.publicKey, owner.publicKey).total));
  const { tx, ata } = buildLaunchTx(owner.publicKey, mint.publicKey, rent);
  tx.recentBlockhash = svm.latestBlockhash();
  tx.sign(owner, mint);
  const res = svm.sendTransaction(tx);
  assert.ok(!res.err, `launch failed: ${res.toString?.() ?? res}`);
  return { svm, owner, mint, ata };
}

function read(svm, pubkey) {
  const a = svm.getAccount(pubkey);
  return { ...a, data: Buffer.from(a.data), owner: new PublicKey(a.owner) };
}

function send(svm, signers, ...ixs) {
  const tx = new Transaction().add(...ixs);
  tx.recentBlockhash = svm.latestBlockhash();
  tx.feePayer = signers[0].publicKey;
  tx.sign(...signers);
  return svm.sendTransaction(tx);
}

test("launch tx creates the token, mints the full supply and locks minting", () => {
  const { svm, owner, mint, ata } = setup();
  const m = unpackMint(mint.publicKey, read(svm, mint.publicKey), TOKEN_2022_PROGRAM_ID);
  assert.equal(m.supply, RAW_SUPPLY);
  assert.equal(m.decimals, DECIMALS);
  assert.equal(m.mintAuthority, null);
  assert.equal(m.freezeAuthority, null);

  const meta = unpack(getExtensionData(ExtensionType.TokenMetadata, m.tlvData));
  assert.equal(meta.name, NAME);
  assert.equal(meta.symbol, SYMBOL);

  const acc = unpackAccount(ata, read(svm, ata), TOKEN_2022_PROGRAM_ID);
  assert.equal(acc.amount, RAW_SUPPLY);
  assert.ok(acc.owner.equals(owner.publicKey));
});

test("holder can send HTV to a friend", () => {
  const { svm, owner, mint, ata } = setup();
  const friend = Keypair.generate().publicKey;
  const friendAta = getAssociatedTokenAddressSync(mint.publicKey, friend, false, TOKEN_2022_PROGRAM_ID);
  const res = send(svm, [owner],
    createAssociatedTokenAccountIdempotentInstruction(owner.publicKey, friendAta, friend, mint.publicKey, TOKEN_2022_PROGRAM_ID),
    createTransferCheckedInstruction(ata, mint.publicKey, friendAta, owner.publicKey, 5n * 10n ** 9n, DECIMALS, [], TOKEN_2022_PROGRAM_ID),
  );
  assert.ok(!res.err, `transfer failed: ${res}`);
  assert.equal(unpackAccount(friendAta, read(svm, friendAta), TOKEN_2022_PROGRAM_ID).amount, 5n * 10n ** 9n);
});

test("minting more is impossible after launch", () => {
  const { svm, owner, mint, ata } = setup();
  const res = send(svm, [owner], createMintToInstruction(mint.publicKey, ata, owner.publicKey, 1n, [], TOKEN_2022_PROGRAM_ID));
  assert.ok(res.err, "mint after launch must fail");
});

test("a stranger cannot move the holder's coins", () => {
  const { svm, owner, mint, ata } = setup();
  const thief = Keypair.generate();
  svm.airdrop(thief.publicKey, BigInt(LAMPORTS_PER_SOL));
  const thiefAta = getAssociatedTokenAddressSync(mint.publicKey, thief.publicKey, false, TOKEN_2022_PROGRAM_ID);
  const res = send(svm, [thief],
    createAssociatedTokenAccountIdempotentInstruction(thief.publicKey, thiefAta, thief.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID),
    // The thief signs and claims to be the authority over the holder's account.
    createTransferCheckedInstruction(ata, mint.publicKey, thiefAta, thief.publicKey, 1n, DECIMALS, [], TOKEN_2022_PROGRAM_ID),
  );
  assert.ok(res.err, "transfer signed only by a stranger must fail");
  assert.equal(unpackAccount(ata, read(svm, ata), TOKEN_2022_PROGRAM_ID).amount, RAW_SUPPLY);
});

test("sending more than owned fails", () => {
  const { svm, owner, mint, ata } = setup();
  const friend = Keypair.generate().publicKey;
  const friendAta = getAssociatedTokenAddressSync(mint.publicKey, friend, false, TOKEN_2022_PROGRAM_ID);
  const res = send(svm, [owner],
    createAssociatedTokenAccountIdempotentInstruction(owner.publicKey, friendAta, friend, mint.publicKey, TOKEN_2022_PROGRAM_ID),
    createTransferCheckedInstruction(ata, mint.publicKey, friendAta, owner.publicKey, RAW_SUPPLY + 1n, DECIMALS, [], TOKEN_2022_PROGRAM_ID),
  );
  assert.ok(res.err);
});

test("launch fails atomically without enough SOL: nothing is created", () => {
  const svm = new LiteSVM();
  const owner = Keypair.generate();
  const mint = Keypair.generate();
  svm.airdrop(owner.publicKey, 10_000n); // far too little for rent
  const { tx } = buildLaunchTx(owner.publicKey, mint.publicKey, 1_000_000n);
  tx.recentBlockhash = svm.latestBlockhash();
  tx.sign(owner, mint);
  assert.ok(svm.sendTransaction(tx).err);
  assert.equal(svm.getAccount(mint.publicKey), null);
});
