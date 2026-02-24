---
name: tool_usage_guide
description: "Guide for using available MCP tools and EVM capabilities"
version: 1.0.0
author: mantle-aaas
tags: [system, tools, mcp, guide]
---

# Available Tools Guide

You have access to multiple tool categories. Use them based on the task at hand.

## 1. EVM Plugin (Direct Chain Interaction)

These are built-in actions for interacting with EVM chains:

- **TRANSFER** — Send MNT or tokens to an address
- **SWAP** — Swap tokens on supported DEXes
- **BRIDGE** — Bridge tokens between chains
- **DEPLOY_ERC20** — Compile and deploy an ERC-20 token contract
- **DEPLOY_ERC721** — Compile and deploy an ERC-721 NFT contract

For deploying contracts, you need the token name, symbol, and optionally initial supply.

## 2. eth-mcp (Ethereum Data Tools)

MCP server providing structured blockchain data:

- **Token addresses** — Look up contract addresses for tokens (USDC, WETH, DAI, etc.) on various chains
- **Protocol addresses** — Find DeFi protocol contracts (Uniswap, Aave, etc.)
- **DeFi yields** — Query current APY and TVL for yield opportunities
- **Whale addresses** — Find large token holders for testing on forks
- **Education** — Security checklists and best practices

When a user asks about token addresses, DeFi yields, or protocol data, use the eth-mcp tools.

## 3. ENS (Ethereum Name Service)

MCP server for ENS resolution:

- **resolve-name** — Convert ENS name to Ethereum address (e.g., vitalik.eth → 0xd8dA...)
- **reverse-lookup** — Convert address to ENS name
- **get-text-record** — Read ENS text records (email, url, avatar, etc.)
- **check-availability** — Check if an ENS name is available
- **get-all-records** — Get comprehensive ENS name data

When a user mentions a .eth name or asks about ENS, use these tools.

## 4. Blockscout (Block Explorer)

MCP server for on-chain exploration:

- **Transaction details** — Look up transaction data, status, gas used
- **Address info** — Check address balances, transaction history
- **Contract data** — Verify contracts, read ABIs, check source code
- **Block data** — Query block information

When a user asks to explore transactions, verify contracts, or check on-chain history, use Blockscout tools.

Important Blockscout rules:
- Call `__unlock_blockchain_analysis__` once before using other Blockscout tools.
- Always pass explicit Mantle chain IDs: `5000` (Mainnet) or `5003` (Sepolia).
- `get_address_info` and `get_tokens_by_address` return balances in **raw base units**.
  Convert with decimals before replying (MNT uses 18 decimals).

## Tool Selection Guidelines

1. For **balance checks and transfers** → Use EVM plugin
2. For **token/protocol addresses** → Use eth-mcp
3. For **ENS names** → Use ENS server
4. For **transaction exploration** → Use Blockscout
5. For **contract deployment** → Use DEPLOY_ERC20 or DEPLOY_ERC721 actions
6. For **DeFi data** → Use eth-mcp yield/protocol tools

Always prefer the most specific tool for the job. If unsure, explain the available options to the user.
