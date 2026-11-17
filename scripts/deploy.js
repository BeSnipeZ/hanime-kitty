const { ethers, network } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("DEPLOYER_KEY missing in .env");
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`network ${network.name}, deployer ${deployer.address}, balance ${ethers.formatEther(balance)} ETH`);
  if (balance === 0n) throw new Error("deployer has no ETH for gas");

  const token = await ethers.deployContract("HanimeKitty");
  await token.waitForDeployment();
  const address = await token.getAddress();
  console.log(`Hanime Kitty (HTV) deployed at ${address}`);
  const explorer = network.name === "base" ? "https://basescan.org" : "https://sepolia.basescan.org";
  console.log(`${explorer}/token/${address}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
