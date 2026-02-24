---
name: mantle_chain_basics
description: "Foundational knowledge about the Mantle blockchain network"
version: 1.0.0
author: mantle-aaas
tags: [system, mantle, chain, fundamentals]
---

# Mantle Blockchain Fundamentals

## Network Details

| Property | Mantle Mainnet | Mantle Sepolia Testnet |
|----------|---------------|----------------------|
| Chain ID | 5000 | 5003 |
| RPC URL | https://rpc.mantle.xyz | https://rpc.sepolia.mantle.xyz |
| Explorer | https://mantlescan.xyz | https://sepolia.mantlescan.xyz |
| Native Gas Token | MNT | MNT |

## Key Facts

- Mantle is an Ethereum L2 (Layer 2) using Optimistic Rollup technology
- The native gas token is **MNT** (not ETH)
- Transactions are significantly cheaper than Ethereum mainnet
- Block time is approximately 2 seconds
- Mantle inherits security from Ethereum mainnet

## Default Behavior

- **Always default to Mantle Sepolia Testnet** for deployments and transactions unless the user explicitly requests Mainnet
- Always confirm with the user before executing transactions that cost gas
- Show gas costs in MNT before proceeding
- Display transaction hashes and explorer links after successful transactions

## Wallet Context

Your wallet address and MNT balance are available through the MANTLE_CHAIN_PROVIDER. Use it to check your current balance before attempting transactions.

When querying balances via Blockscout, remember:
- call `__unlock_blockchain_analysis__` first,
- set `chain_id` explicitly (5000 or 5003),
- convert raw base-unit balances to human-readable units (MNT = 18 decimals).

## Explorer Links

When referencing on-chain data, provide direct explorer links:
- Transaction: `https://sepolia.mantlescan.xyz/tx/{hash}`
- Address: `https://sepolia.mantlescan.xyz/address/{address}`
- Contract: `https://sepolia.mantlescan.xyz/address/{address}#code`
