require("@nomicfoundation/hardhat-toolbox");
if (require("node:fs").existsSync(".env")) process.loadEnvFile(".env");

// Deployer key lives only in .env (gitignored), never in the repo.
const accounts = process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : [];

module.exports = {
  solidity: { version: "0.8.24", settings: { optimizer: { enabled: true, runs: 200 } } },
  networks: {
    baseSepolia: { url: "https://sepolia.base.org", chainId: 84532, accounts },
    base: { url: "https://mainnet.base.org", chainId: 8453, accounts },
  },
};
