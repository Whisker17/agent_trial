---
name: asset_deploy
description: "Deploy standard token contracts on Mantle: ERC-20 (fungible tokens), ERC-721 (NFTs). Covers deployment SOPs, constructor parameters, post-deployment operations, and chain selection."
version: 1.0.0
author: mantle-aaas
tags: [asset, deploy, erc20, erc721, contract, mantle]
requires_tools: [mantle-plugin]
---

# Asset Deployment on Mantle

Deploy standard token contracts via the Mantle Plugin. Contracts are compiled on-the-fly using `solc` (optimizer: 200 runs) and deployed in a single transaction.

## Supported Asset Types

| Standard | Action | Status | Use Case |
|----------|--------|--------|----------|
| **ERC-20** | `DEPLOY_ERC20` | Implemented | Fungible tokens (governance, utility, meme) |
| **ERC-721** | `DEPLOY_ERC721` | Implemented | Non-fungible tokens (collectibles, PFPs, certificates) |
| **ERC-1155** | — | Planned | Multi-token (game items, mixed fungible + non-fungible) |
| **ERC-4626** | — | Planned | Tokenized vaults (DeFi yield, staking wrappers) |

## Chain Selection

The Mantle Plugin defaults to **Mantle Sepolia Testnet** for safety. To deploy on mainnet, include the word "mainnet" in the request (without "testnet").

| Keyword in Message | Target Chain | Chain ID | Explorer |
|--------------------|-------------|----------|----------|
| _(default)_ | Mantle Sepolia | 5003 | `https://explorer.sepolia.mantle.xyz` |
| "mainnet" | Mantle Mainnet | 5000 | `https://explorer.mantle.xyz` |

Gas is paid in **MNT**. Ensure the agent wallet has sufficient MNT balance before deploying.

## ERC-20: Fungible Token

### Action

`DEPLOY_ERC20` (aliases: `CREATE_TOKEN`, `DEPLOY_TOKEN`, `LAUNCH_TOKEN`)

### Parameters

| Param | Required | Default | Parsed From |
|-------|----------|---------|-------------|
| `name` | Yes | — | `"called/named {name} with/symbol"` pattern |
| `symbol` | Yes | — | `"symbol {SYMBOL}"` pattern (uppercase, 1-10 chars) |
| `initialSupply` | No | 1,000,000 | `"{number} supply/tokens"` or `"supply of {number}"` |

### Contract: `SimpleERC20`

- **Decimals:** 18 (fixed)
- **Total supply:** `initialSupply * 10^18` (all minted to deployer)
- **Functions:** `transfer(to, value)`, `approve(spender, value)`, `transferFrom(from, to, value)`
- **Events:** `Transfer`, `Approval`
- No mint function — supply is fixed at deployment

### Example

User: "Deploy an ERC20 token called MantleCoin with symbol MNTC and 500000 supply"

Result:
- Contract deployed at `0x...`
- 500,000 MNTC (with 18 decimals) sent to deployer wallet
- Explorer link returned

### Trigger Pattern

Message must contain one of (`deploy`, `create`, `launch`) AND one of (`erc20`, `token`).

## ERC-721: Non-Fungible Token

### Action

`DEPLOY_ERC721` (aliases: `CREATE_NFT`, `DEPLOY_NFT`, `LAUNCH_NFT`)

### Parameters

| Param | Required | Default | Parsed From |
|-------|----------|---------|-------------|
| `name` | Yes | — | `"called/named {name} with/symbol"` pattern |
| `symbol` | Yes | — | `"symbol {SYMBOL}"` pattern (uppercase, 1-10 chars) |

### Contract: `SimpleERC721`

- **Owner:** deployer address (set in constructor)
- **Minting:** `mint(to, tokenId)` — restricted to owner only
- **Functions:** `balanceOf(owner)`, `ownerOf(tokenId)`, `approve(to, tokenId)`, `setApprovalForAll(operator, approved)`, `transferFrom(from, to, tokenId)`
- **Events:** `Transfer`, `Approval`, `ApprovalForAll`
- `totalSupply` counter incremented on each mint

### Example

User: "Deploy an ERC721 NFT called MantlePunks with symbol MPUNK"

Result:
- Contract deployed at `0x...`
- Deployer is the contract owner
- Use `mint(recipientAddress, tokenId)` to create new NFTs

### Trigger Pattern

Message must contain one of (`deploy`, `create`, `launch`) AND one of (`erc721`, `nft`).

### Minting After Deployment

To mint an NFT after deployment, call the contract's `mint` function via `plugin-evm`:
- `to`: recipient address
- `tokenId`: unique uint256 identifier (choose sequentially: 1, 2, 3...)

## Post-Deployment Operations

After deploying any asset contract:

1. **Verify on Blockscout** — Use the explorer link from the deployment response to confirm the contract is live
2. **Transfer tokens** — Use `plugin-evm` TRANSFER action for ERC-20 transfers
3. **Read state** — Use `plugin-evm` or Blockscout MCP to call view functions (`balanceOf`, `totalSupply`, `ownerOf`)
4. **Approve spending** — Call `approve(spender, amount)` to allow other addresses or contracts to spend tokens

## Limitations

- **Fixed templates only** — Cannot deploy custom Solidity code; only `SimpleERC20` and `SimpleERC721` are available
- **No proxy/upgradeable patterns** — Deployed contracts are immutable
- **No metadata URI** — ERC-721 does not include `tokenURI` or metadata storage; add off-chain metadata via separate service
- **No burn function** — Neither template includes burn capability
- **Single-chain** — Each deployment targets one Mantle chain (mainnet or Sepolia)
