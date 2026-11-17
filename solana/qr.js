// QR code for a Solana address, read back with a decoder before it is kept,
// so a scanned code always yields exactly the address.
// Usage: node solana/qr.js <address> <out.png>
const fs = require("node:fs");
const QRCode = require("qrcode");
const jsQR = require("jsqr");
const { PNG } = require("pngjs");
const { PublicKey } = require("@solana/web3.js");

async function addressQr(address, out) {
  new PublicKey(address); // throws on anything that is not a valid Solana address
  // Plain address, no "solana:" prefix: exchange apps (Trade Republic) expect only the address.
  const buf = await QRCode.toBuffer(address, { errorCorrectionLevel: "M", margin: 4, width: 600, color: { dark: "#000000", light: "#ffffff" } });
  const png = PNG.sync.read(buf);
  const read = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  if (!read || read.data !== address) throw new Error(`QR check failed: read ${read && read.data}`);
  fs.writeFileSync(out, buf);
  return read.data;
}

module.exports = { addressQr };

if (require.main === module) {
  const [address, out] = process.argv.slice(2);
  if (!address || !out) throw new Error("usage: node solana/qr.js <address> <out.png>");
  addressQr(address, out).then((a) => console.log(`ok ${out} -> ${a}`)).catch((e) => { console.error(e.message); process.exitCode = 1; });
}
