// Retires the first HTV mint (1,337 supply): burns every token the wallet holds, closes the
// token account (rent back) and renames the mint to "HTV OLD" so nobody mistakes it for the relaunch.
// One transaction, all or nothing. Simulates by default; sends only with --send.
// The mint itself cannot be deleted (no close authority), this is as far as it goes.
const fs = require("fs");
const path = require("path");
const { Connection, Keypair, PublicKey, Transaction } = require("@solana/web3.js");
const { TOKEN_2022_PROGRAM_ID, getAccount, createBurnCheckedInstruction, createCloseAccountInstruction } = require("@solana/spl-token");
const { createUpdateFieldInstruction } = require("@solana/spl-token-metadata");

const OLD_MINT = new PublicKey("6FRYJe9kjoiV5JFdSCHT311C662Lj1nXoXV5Rf8r8Dmg");
const OLD_ACCOUNT = new PublicKey("cZt5xTik5aYPsMP7TidiZkFeJr8JmmGdUb1nZAenfxp");
const DECIMALS = 9;

function buildRetireTx(owner, amount) {
  const field = (f, value) => createUpdateFieldInstruction({
    programId: TOKEN_2022_PROGRAM_ID, metadata: OLD_MINT, updateAuthority: owner, field: f, value,
  });
  return new Transaction().add(
    field("name", "HTV OLD dead"), // same length as before, so no extra rent
    field("symbol", "OLD"),
    createBurnCheckedInstruction(OLD_ACCOUNT, OLD_MINT, owner, amount, DECIMALS, [], TOKEN_2022_PROGRAM_ID),
    createCloseAccountInstruction(OLD_ACCOUNT, owner, owner, [], TOKEN_2022_PROGRAM_ID),
  );
}

async function main() {
  const send = process.argv.includes("--send");
  const conn = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(__dirname, ".wallet-mainnet.json"), "utf8"))));
  const acc = await getAccount(conn, OLD_ACCOUNT, "confirmed", TOKEN_2022_PROGRAM_ID);
  if (!acc.owner.equals(payer.publicKey)) throw new Error("old token account belongs to another wallet");
  console.log(`burning ${Number(acc.amount) / 10 ** DECIMALS} old HTV from ${payer.publicKey.toBase58()}`);

  const tx = buildRetireTx(payer.publicKey, acc.amount);
  tx.feePayer = payer.publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  tx.sign(payer);
  const sim = await conn.simulateTransaction(tx);
  if (sim.value.err) throw new Error(`simulation failed: ${JSON.stringify(sim.value.err)}\n${sim.value.logs.join("\n")}`);
  console.log("simulation ok");
  if (!send) return console.log("nothing sent. run again with --send to do it.");

  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction(sig, "confirmed");
  console.log(`done: https://explorer.solana.com/tx/${sig}`);
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { buildRetireTx };