// Creates Hanime Kitty (HTV) as a Token-2022 mint with on-chain metadata,
// mints the fixed supply to the wallet and removes the mint authority for good.
// Everything happens in ONE transaction: it either fully succeeds or costs nothing but the fee.
// Usage: node solana/launch.js devnet|mainnet
const fs = require("node:fs");
const path = require("node:path");
const {
  Connection, Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction,
  sendAndConfirmTransaction, clusterApiUrl,
} = require("@solana/web3.js");
const {
  TOKEN_2022_PROGRAM_ID, ExtensionType, TYPE_SIZE, LENGTH_SIZE, AuthorityType,
  getMintLen, getAssociatedTokenAddressSync, getMint,
  createInitializeMetadataPointerInstruction, createInitializeMintInstruction,
  createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction, createSetAuthorityInstruction,
} = require("@solana/spl-token");
const { createInitializeInstruction, pack } = require("@solana/spl-token-metadata");

const NAME = "Hanime Kitty";
const SYMBOL = "HTV";
const URI = "https://besnipez.github.io/hanime-kitty/metadata.json";
const DECIMALS = 9;
const SUPPLY = 1_000n;
const RAW_SUPPLY = SUPPLY * 10n ** BigInt(DECIMALS);

// Mint account size: the mint grows from mintLen to mintLen + metaLen when the metadata is written,
// so the rent must cover both while the account is only allocated with mintLen.
function mintSizes(mint, owner) {
  const mintLen = getMintLen([ExtensionType.MetadataPointer]);
  const metaLen = TYPE_SIZE + LENGTH_SIZE + pack({
    mint, name: NAME, symbol: SYMBOL, uri: URI, updateAuthority: owner, additionalMetadata: [],
  }).length;
  return { mintLen, total: mintLen + metaLen };
}

function buildLaunchTx(owner, mint, rentLamports) {
  const { mintLen } = mintSizes(mint, owner);
  const ata = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_2022_PROGRAM_ID);
  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: owner, newAccountPubkey: mint, space: mintLen,
      lamports: Number(rentLamports), programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeMetadataPointerInstruction(mint, owner, mint, TOKEN_2022_PROGRAM_ID),
    createInitializeMintInstruction(mint, DECIMALS, owner, null, TOKEN_2022_PROGRAM_ID),
    createInitializeInstruction({
      programId: TOKEN_2022_PROGRAM_ID, metadata: mint, updateAuthority: owner,
      mint, mintAuthority: owner, name: NAME, symbol: SYMBOL, uri: URI,
    }),
    createAssociatedTokenAccountIdempotentInstruction(owner, ata, owner, mint, TOKEN_2022_PROGRAM_ID),
    createMintToInstruction(mint, ata, owner, RAW_SUPPLY, [], TOKEN_2022_PROGRAM_ID),
    createSetAuthorityInstruction(mint, owner, AuthorityType.MintTokens, null, [], TOKEN_2022_PROGRAM_ID),
  );
  tx.feePayer = owner;
  return { tx, ata };
}

async function main(net) {
  if (!["devnet", "mainnet"].includes(net)) throw new Error("usage: node solana/launch.js devnet|mainnet");
  const conn = new Connection(clusterApiUrl(net === "mainnet" ? "mainnet-beta" : "devnet"), "confirmed");
  const walletFile = path.join(__dirname, `.wallet-${net}.json`); // gitignored, holds the secret key
  const resultFile = path.join(__dirname, `mint-${net}.json`);
  if (fs.existsSync(resultFile)) {
    console.log(`already launched on ${net}:`, fs.readFileSync(resultFile, "utf8"));
    return;
  }
  if (!fs.existsSync(walletFile)) {
    // Owner-only and never overwrite an existing key (mode is ignored on Windows, which uses ACLs).
    fs.writeFileSync(walletFile, JSON.stringify([...Keypair.generate().secretKey]), { mode: 0o600, flag: "wx" });
  }
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletFile, "utf8"))));
  const mint = Keypair.generate();
  console.log(`network ${net}, wallet ${payer.publicKey.toBase58()}`);

  const { total } = mintSizes(mint.publicKey, payer.publicKey);
  const rent = await conn.getMinimumBalanceForRentExemption(total);
  const ataRent = await conn.getMinimumBalanceForRentExemption(170); // Token-2022 account with ImmutableOwner
  const needed = rent + ataRent + 20_000; // plus fee headroom
  const balance = await conn.getBalance(payer.publicKey);
  console.log(`balance ${balance / LAMPORTS_PER_SOL} SOL, needed ${needed / LAMPORTS_PER_SOL} SOL`);
  if (balance < needed) throw new Error(`send at least ${needed / LAMPORTS_PER_SOL} SOL to ${payer.publicKey.toBase58()}`);

  const { tx, ata } = buildLaunchTx(payer.publicKey, mint.publicKey, rent);
  const sig = await sendAndConfirmTransaction(conn, tx, [payer, mint]);

  // Self-check against the chain: supply is exact and nobody can mint more.
  const info = await getMint(conn, mint.publicKey, "confirmed", TOKEN_2022_PROGRAM_ID);
  if (info.supply !== RAW_SUPPLY) throw new Error(`supply mismatch: ${info.supply}`);
  if (info.mintAuthority !== null) throw new Error("mint authority still set");

  const cluster = net === "mainnet" ? "" : "?cluster=devnet";
  const result = {
    network: net, mint: mint.publicKey.toBase58(), wallet: payer.publicKey.toBase58(),
    tokenAccount: ata.toBase58(), supply: SUPPLY.toString(), decimals: DECIMALS, signature: sig,
    explorer: `https://explorer.solana.com/address/${mint.publicKey.toBase58()}${cluster}`,
  };
  fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
  if (net === "mainnet") {
    const docs = path.join(__dirname, "..", "docs");
    await require("./qr").addressQr(result.mint, path.join(docs, "mint-qr.png"));
    fs.writeFileSync(path.join(docs, "mint.json"), JSON.stringify(result, null, 2));
  }
  console.log(result);
}

module.exports = { buildLaunchTx, mintSizes, NAME, SYMBOL, DECIMALS, RAW_SUPPLY };

if (require.main === module) {
  main(process.argv[2]).catch((e) => {
    console.error(e.message || e);
    process.exitCode = 1;
  });
}
