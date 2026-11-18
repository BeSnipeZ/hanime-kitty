# Hanime Kitty (HTV)

ERC-20 token on Base, and the same token on Solana (Token-2022, `solana/launch.js`).
Fixed supply of 10,000 HTV, minted once to the deployer.
No owner and no mint function; holders can burn their own tokens.

## Commands

```bash
npm install
npm test                   # Base contract (Hardhat)
npm run test:solana        # Solana launch in LiteSVM; runs in Docker (no Windows build of LiteSVM)
node solana/launch.js devnet|mainnet   # one transaction: create, mint 10,000 HTV, lock minting
npx hardhat run scripts/deploy.js --network baseSepolia   # testnet
npx hardhat run scripts/deploy.js --network base          # mainnet, real ETH
```

The deployer key is read from `.env` (`DEPLOYER_KEY=0x...`), which is gitignored.
The key in `.env` today is a throwaway testnet wallet. For mainnet, use a separate
wallet you control, and never commit its key.
