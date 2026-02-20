---
name: agent_identity
description: "Register, manage, and query ERC-8004 agent identities on Mantle. Help other agents register on-chain."
version: 2.0.0
author: mantlency
homepage: https://eips.ethereum.org/EIPS/eip-8004
tags: [crypto, identity, eip8004, registration, agent, discovery, nft, mantle, service]
requires_tools: [erc8004_get_config, erc8004_check_fee, erc8004_register, erc8004_get_agent, erc8004_set_uri, erc8004_transfer_nft, get_wallet_details, get_balance]
arguments:
  agent_name:
    description: "Name for the agent identity"
    required: false
  agent_description:
    description: "Description of the agent"
    required: false
  agent_uri:
    description: "URI pointing to the agent's EIP-8004 registration JSON"
    required: false
  recipient_wallet:
    description: "Wallet address to receive the agent identity NFT"
    required: false
---

# ERC-8004 Agent Identity Service

Mantlency provides an **ERC-8004 agent identity registration service** on Mantle. You can register new agents on-chain, query existing agent identities, and help other agents get discoverable via the EIP-8004 standard.

## Contract Addresses

| Contract | Address | Network |
|----------|---------|---------|
| **IdentityRegistry (Mainnet)** | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | Mantle (5000) |
| **ReputationRegistry (Mainnet)** | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | Mantle (5000) |
| **IdentityRegistry (Testnet)** | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | Mantle Sepolia (5003) |
| **ReputationRegistry (Testnet)** | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | Mantle Sepolia (5003) |

Source: [erc-8004/erc-8004-contracts](https://github.com/erc-8004/erc-8004-contracts)

## Service Fee

| Item | Value |
|------|-------|
| **MC Token** | `0x1BD654F13330d5Fe945b6e5Be820cD2c2fbDE6FB` |
| **Token Symbol** | MC |
| **Registration Fee** | 1 MC per agent |
| **Fee Recipient** | Mantlency's wallet address |

---

## Service: Help Another Agent Register on ERC-8004

This is the primary workflow. When a user or agent asks to register on ERC-8004, follow these steps **in order**.

### Step 1: Collect Agent Details

Ask the requester for:
- **Agent URI**: URL pointing to their EIP-8004 registration JSON file (IPFS, HTTPS, etc.)
- **Recipient wallet address**: Where to send the minted agent identity NFT

If they don't have an agent URI yet, explain they need to host a registration JSON file first (see "Identity File Format" below).

### Step 2: Show Registration Config

Use the `erc8004_get_config` action to display the registration requirements:

```
Use erc8004_get_config to show:
- IdentityRegistry address
- MC token address
- Registration fee
- Mantlency wallet address (where to send MC fee)
```

Tell the requester:
> "The registration fee is **1 MC**. Please send 1 MC to my wallet address: `<your wallet address>`. Once confirmed, I'll proceed with the registration."

### Step 3: Verify Payment

After the requester says they've sent 1 MC:

1. Check Mantlency's MC token balance:
```
Use get_balance with the MC token address (0x1BD654F13330d5Fe945b6e5Be820cD2c2fbDE6FB)
to check current MC balance.
```

2. Alternatively, check the requester's balance:
```
Use erc8004_check_fee with the requester's address
to verify they had MC tokens.
```

Confirm the payment before proceeding. If payment is not received, ask the requester to complete the transfer.

### Step 4: Register the Agent

**CONFIRM with the user before executing.** Show a summary:

```
Registration Summary:
- Agent URI: <uri>
- Recipient: <wallet address>
- Fee: 1 MC (paid)
- Network: Mantle Sepolia

Proceed? (yes/no)
```

After confirmation, call `erc8004_register`:

```
Use erc8004_register with:
- agent_uri: <the agent's registration JSON URI>
```

This mints an ERC-721 NFT to Mantlency's wallet and returns the new agent ID.

### Step 5: Transfer NFT to Requester

After registration, transfer the minted agent identity NFT to the requester's wallet:

```
Use erc8004_transfer_nft with:
- agent_id: <the agent ID from step 4>
- to_address: <the requester's wallet address>
```

### Step 6: Report Success

After successful registration and transfer, report:

```
Registration Complete!
- Agent ID: <id>
- Agent URI: <uri>
- Owner: <requester's wallet address>
- Registry: IdentityRegistry on Mantle Sepolia
- Tx Explorer: https://sepolia.mantlescan.xyz/tx/<hash>

The agent is now registered on-chain and discoverable via ERC-8004.
The new owner can update the URI, set metadata, and manage the identity.
```

---

## Query an Existing Agent

To look up information about a registered agent:

```
Use erc8004_get_agent with:
- agent_id: <the agent ID to query>
```

Returns the agent's URI, owner address, and verified wallet.

---

## Update Agent URI

To update the URI of an agent that Mantlency owns:

```
Use erc8004_set_uri with:
- agent_id: <agent ID>
- new_uri: <new registration JSON URI>
```

Note: Only the owner of the agent NFT can update its URI.

---

## Identity File Format

The agent's URI should resolve to a JSON document following the EIP-8004 registration schema:

```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "Agent Name",
  "description": "What this agent does",
  "image": "https://example.com/avatar.png",
  "services": [
    {
      "name": "chat",
      "endpoint": "https://agent.example.com/api/chat",
      "version": "1.0"
    },
    {
      "name": "agentWallet",
      "endpoint": "mantle:0x...",
      "version": "1.0"
    }
  ],
  "registrations": [
    {
      "agentRegistry": "eip155:5003:0x8004A818BFB912233c491871b3d84c89A494BD9e",
      "agentId": "<assigned after registration>"
    }
  ],
  "active": true,
  "supportedTrust": ["reputation"]
}
```

### Common Service Types

| Service | Description |
|---------|-------------|
| `chat` | Chat/conversation endpoint |
| `agentWallet` | On-chain wallet operations |
| `mcp` | Model Context Protocol server |
| `a2a` | Agent-to-Agent protocol |

---

## Mantlency's Own Identity

Mantlency's identity is stored at `soul/IDENTITY.json`:

- **Name:** Mantlency
- **Description:** Autonomous Architect and Lead Engineer on Mantle
- **Network:** Mantle Sepolia (eip155:5003)
- **Services:** agentWallet, chat

---

## ERC-8004 Overview

ERC-8004 (Trustless Agents) defines three on-chain registries:

1. **Identity Registry** — ERC-721 registry for agent identities (portable, browsable, transferable)
2. **Reputation Registry** — Standardized interface for publishing and reading feedback signals
3. **Validation Registry** — Hooks for validator smart contracts to publish validation results

Each agent identity is an NFT whose `tokenURI` points to a registration file containing the agent's metadata, endpoints, and trust methods.

For the full specification, see [EIP-8004](https://eips.ethereum.org/EIPS/eip-8004).

---

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| "insufficient funds for gas" | Not enough MNT | Add MNT to Mantlency's wallet |
| "ERC721NonexistentToken" | Agent ID doesn't exist | Verify the agent ID |
| "ERC721IncorrectOwner" | Not the NFT owner | Only the owner can transfer/update |
| "execution reverted" | Contract call failed | Check parameters and try again |

---

## Available Actions

| Action | Description |
|--------|-------------|
| `erc8004_get_config` | Get registration config (addresses, fee, explorer) |
| `erc8004_check_fee` | Check MC token balance for registration fee |
| `erc8004_register` | Register new agent (mints NFT to Mantlency) |
| `erc8004_get_agent` | Query agent info by ID |
| `erc8004_set_uri` | Update agent URI |
| `erc8004_transfer_nft` | Transfer agent NFT to another wallet |
