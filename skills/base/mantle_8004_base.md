---
name: mantle_8004_base
description: "Complete ERC-8004 Trustless Agents reference: Identity Registry, Reputation Registry, Validation Registry. Contract addresses, Solidity interfaces, AgentURI metadata format, and usage workflows on Mantle."
version: 1.0.0
author: mantle-aaas
tags: [system, erc8004, identity, reputation, validation, registry]
requires_tools: [plugin-evm]
---

# ERC-8004: Trustless Agents on Mantle

ERC-8004 enables discovery, trust, and interaction with AI agents across organizational boundaries via three on-chain registries. It uses ERC-721 NFTs as agent identities, making agents browsable, transferable, and composable with existing NFT tooling.

Source: [EIP-8004](https://eips.ethereum.org/EIPS/eip-8004) | [Contracts](https://github.com/erc-8004/erc-8004-contracts)

## Contract Addresses

| Contract | Mantle Mainnet (5000) | Mantle Sepolia (5003) |
|----------|----------------------|----------------------|
| **IdentityRegistry** | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| **ReputationRegistry** | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |
| **ValidationRegistry** | Not yet deployed | Not yet deployed |

Explorer links:
- Mainnet: `https://mantlescan.xyz/address/{address}`
- Testnet: `https://sepolia.mantlescan.xyz/address/{address}`

Default to **Mantle Sepolia Testnet** for all ERC-8004 operations unless the user explicitly requests Mainnet.

## Agent Identifier

Each agent is globally unique via two values:

- **agentRegistry**: `eip155:{chainId}:{identityRegistryAddress}` (e.g., `eip155:5003:0x8004A818BFB912233c491871b3d84c89A494BD9e`)
- **agentId**: The ERC-721 `tokenId` assigned by the registry on registration

The NFT owner controls the agent: updating metadata, setting the wallet, transferring ownership.

---

## 1. Identity Registry

An upgradeable ERC-721 (with URIStorage) for agent registration. Each minted NFT represents one agent identity.

### Registration

Three overloads for minting a new agent:

```solidity
struct MetadataEntry {
    string metadataKey;
    bytes metadataValue;
}

// Full: URI + on-chain metadata entries
function register(string agentURI, MetadataEntry[] calldata metadata) external returns (uint256 agentId)

// URI only
function register(string agentURI) external returns (uint256 agentId)

// Bare registration (set URI later via setAgentURI)
function register() external returns (uint256 agentId)
```

Emits:
```solidity
event Registered(uint256 indexed agentId, string agentURI, address indexed owner)
```

Plus one `MetadataSet` event for the reserved `agentWallet` key (auto-set to `msg.sender`), and one per additional metadata entry.

### Update Agent URI

```solidity
function setAgentURI(uint256 agentId, string calldata newURI) external
```

Emits:
```solidity
event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy)
```

The `agentURI` resolves to the agent's registration file (see Section 2). Supported URI schemes: `https://`, `ipfs://`, or `data:application/json;base64,...` for fully on-chain metadata.

### On-chain Metadata

Optional key-value storage per agent:

```solidity
function getMetadata(uint256 agentId, string memory metadataKey) external view returns (bytes memory)
function setMetadata(uint256 agentId, string memory metadataKey, bytes memory metadataValue) external
```

Emits:
```solidity
event MetadataSet(uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue)
```

### Agent Wallet (Reserved Metadata Key)

The `agentWallet` key is special -- it represents the address where the agent receives payments. It cannot be set via `setMetadata()` or during `register()`.

```solidity
// Change wallet (requires EIP-712 signature for EOAs, ERC-1271 for smart contract wallets)
function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes calldata signature) external

function getAgentWallet(uint256 agentId) external view returns (address)
function unsetAgentWallet(uint256 agentId) external
```

Behavior:
- Initially set to the owner's address on registration
- Changing requires cryptographic proof of control over the new wallet
- Automatically cleared (reset to zero address) when the NFT is transferred; the new owner must re-verify

---

## 2. AgentURI Registration File

The `agentURI` resolves to a JSON registration file describing the agent's identity, capabilities, and communication endpoints.

### Required Structure

```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "MyAgent",
  "description": "What this agent does, how it works, pricing info",
  "image": "https://example.com/agent-avatar.png",
  "services": [
    {
      "name": "web",
      "endpoint": "https://myagent.example.com/"
    },
    {
      "name": "A2A",
      "endpoint": "https://myagent.example/.well-known/agent-card.json",
      "version": "0.3.0"
    },
    {
      "name": "MCP",
      "endpoint": "https://mcp.myagent.example/",
      "version": "2025-06-18"
    },
    {
      "name": "OASF",
      "endpoint": "ipfs://{cid}",
      "version": "0.8"
    },
    {
      "name": "ENS",
      "endpoint": "myagent.eth",
      "version": "v1"
    }
  ],
  "x402Support": false,
  "active": true,
  "registrations": [
    {
      "agentId": 42,
      "agentRegistry": "eip155:5003:0x8004A818BFB912233c491871b3d84c89A494BD9e"
    }
  ],
  "supportedTrust": ["reputation", "crypto-economic", "tee-attestation"]
}
```

### Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| `type` | SHOULD | Schema identifier, always `https://eips.ethereum.org/EIPS/eip-8004#registration-v1` |
| `name` | SHOULD | Agent display name (ERC-721 compatible) |
| `description` | SHOULD | Human-readable description of capabilities and pricing |
| `image` | SHOULD | Avatar URL (ERC-721 compatible) |
| `services` | MAY | Array of endpoint objects (`name`, `endpoint`, optional `version`) |
| `x402Support` | MAY | Whether the agent accepts x402 micropayments |
| `active` | MAY | Whether the agent is currently operational |
| `registrations` | SHOULD | Array of `{ agentId, agentRegistry }` linking back to on-chain identity |
| `supportedTrust` | MAY | Trust models: `"reputation"`, `"crypto-economic"`, `"tee-attestation"` |

### Endpoint Domain Verification (Optional)

To prove control of an HTTPS endpoint domain, publish:
`https://{domain}/.well-known/agent-registration.json`
containing at least a `registrations` list matching the on-chain agent. Not needed if the domain already serves the primary registration file.

---

## 3. Reputation Registry

Stores and exposes on-chain feedback signals. Linked to the Identity Registry via `initialize(address identityRegistry_)`.

```solidity
function getIdentityRegistry() external view returns (address)
```

### Giving Feedback

Any address can submit feedback for a registered agent:

```solidity
function giveFeedback(
    uint256 agentId,
    int128 value,
    uint8 valueDecimals,
    string calldata tag1,
    string calldata tag2,
    string calldata endpoint,
    string calldata feedbackURI,
    bytes32 feedbackHash
) external
```

Constraints:
- `agentId` must be a valid registered agent
- `valueDecimals` must be 0-18
- Caller must NOT be the agent owner or approved operator
- `tag1`, `tag2`, `endpoint`, `feedbackURI`, `feedbackHash` are all optional

Emits:
```solidity
event NewFeedback(
    uint256 indexed agentId,
    address indexed clientAddress,
    uint64 feedbackIndex,
    int128 value,
    uint8 valueDecimals,
    string indexed indexedTag1,
    string tag1,
    string tag2,
    string endpoint,
    string feedbackURI,
    bytes32 feedbackHash
)
```

Stored on-chain: `value`, `valueDecimals`, `tag1`, `tag2`, `isRevoked`, `feedbackIndex`.
Emitted only: `endpoint`, `feedbackURI`, `feedbackHash`.

### Value / Decimals Interpretation

The `value` + `valueDecimals` pair encodes a signed decimal number. The meaning depends on `tag1`:

| tag1 | Measures | Example | value | valueDecimals |
|------|----------|---------|-------|---------------|
| `starred` | Quality (0-100) | 87/100 | `87` | `0` |
| `reachable` | Endpoint alive (binary) | true | `1` | `0` |
| `uptime` | Endpoint uptime (%) | 99.77% | `9977` | `2` |
| `successRate` | Success rate (%) | 89% | `89` | `0` |
| `responseTime` | Latency (ms) | 560ms | `560` | `0` |
| `revenues` | Cumulative (USD) | $560 | `560` | `0` |
| `tradingYield` | Yield (tag2=period) | -3.2% | `-32` | `1` |

### Revoking Feedback

```solidity
function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external
```

Only the original `clientAddress` can revoke. Emits:
```solidity
event FeedbackRevoked(uint256 indexed agentId, address indexed clientAddress, uint64 indexed feedbackIndex)
```

### Appending Responses

Anyone can attach a response to existing feedback (e.g., agent showing a refund, aggregator flagging spam):

```solidity
function appendResponse(
    uint256 agentId,
    address clientAddress,
    uint64 feedbackIndex,
    string calldata responseURI,
    bytes32 responseHash
) external
```

Emits:
```solidity
event ResponseAppended(
    uint256 indexed agentId,
    address indexed clientAddress,
    uint64 feedbackIndex,
    address indexed responder,
    string responseURI,
    bytes32 responseHash
)
```

### Read Functions

```solidity
// Aggregated summary. clientAddresses MUST be non-empty to mitigate Sybil attacks.
function getSummary(
    uint256 agentId,
    address[] calldata clientAddresses,
    string tag1,
    string tag2
) external view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)

// Single feedback entry
function readFeedback(
    uint256 agentId,
    address clientAddress,
    uint64 feedbackIndex
) external view returns (int128 value, uint8 valueDecimals, string tag1, string tag2, bool isRevoked)

// Batch read with optional filters. Revoked excluded by default.
function readAllFeedback(
    uint256 agentId,
    address[] calldata clientAddresses,
    string tag1,
    string tag2,
    bool includeRevoked
) external view returns (
    address[] memory clients,
    uint64[] memory feedbackIndexes,
    int128[] memory values,
    uint8[] memory valueDecimals,
    string[] memory tag1s,
    string[] memory tag2s,
    bool[] memory revokedStatuses
)

// Number of responses on a feedback entry
function getResponseCount(
    uint256 agentId,
    address clientAddress,
    uint64 feedbackIndex,
    address[] responders
) external view returns (uint64 count)

// All client addresses that have given feedback
function getClients(uint256 agentId) external view returns (address[] memory)

// Last feedback index for a client
function getLastIndex(uint256 agentId, address clientAddress) external view returns (uint64)
```

### Off-chain Feedback File (Optional)

The `feedbackURI` may resolve to a JSON file for richer context:

```json
{
  "agentRegistry": "eip155:5003:0x8004A818BFB912233c491871b3d84c89A494BD9e",
  "agentId": 42,
  "clientAddress": "eip155:5003:0xClientAddress...",
  "createdAt": "2026-02-20T12:00:00Z",
  "value": 87,
  "valueDecimals": 0,
  "tag1": "starred",
  "tag2": "",
  "endpoint": "https://agent.example/api",
  "mcp": { "tool": "ToolName" },
  "a2a": { "skills": ["..."], "taskId": "..." },
  "proofOfPayment": {
    "fromAddress": "0x...",
    "toAddress": "0x...",
    "chainId": "5003",
    "txHash": "0x..."
  }
}
```

Use IPFS for content-addressed storage (no `feedbackHash` needed). For HTTPS URIs, provide `feedbackHash` = `keccak256(fileContent)` for integrity verification.

---

## 4. Validation Registry (WIP)

Enables agents to request independent verification of their work. Validator contracts (stake-secured, zkML, TEE) provide on-chain responses.

**Status:** The Validation Registry spec is under active revision with the TEE community. Contract not yet deployed on Mantle.

```solidity
function getIdentityRegistry() external view returns (address)
```

### Requesting Validation

Must be called by the owner or operator of `agentId`:

```solidity
function validationRequest(
    address validatorAddress,
    uint256 agentId,
    string requestURI,
    bytes32 requestHash
) external
```

`requestHash` = `keccak256(requestPayload)`. `requestURI` points to off-chain data with inputs/outputs for the validator.

Emits:
```solidity
event ValidationRequest(
    address indexed validatorAddress,
    uint256 indexed agentId,
    string requestURI,
    bytes32 indexed requestHash
)
```

### Validation Response

Must be called by the `validatorAddress` from the original request:

```solidity
function validationResponse(
    bytes32 requestHash,
    uint8 response,
    string responseURI,
    bytes32 responseHash,
    string tag
) external
```

`response` is 0-100 (binary: 0 = failed, 100 = passed; or intermediate values for spectrum outcomes). Can be called multiple times for the same `requestHash` (progressive validation).

Emits:
```solidity
event ValidationResponse(
    address indexed validatorAddress,
    uint256 indexed agentId,
    bytes32 indexed requestHash,
    uint8 response,
    string responseURI,
    bytes32 responseHash,
    string tag
)
```

### Read Functions

```solidity
function getValidationStatus(bytes32 requestHash) external view returns (
    address validatorAddress, uint256 agentId, uint8 response, bytes32 responseHash, string tag, uint256 lastUpdate
)

function getSummary(uint256 agentId, address[] calldata validatorAddresses, string tag) external view returns (
    uint64 count, uint8 averageResponse
)

function getAgentValidations(uint256 agentId) external view returns (bytes32[] memory requestHashes)

function getValidatorRequests(address validatorAddress) external view returns (bytes32[] memory requestHashes)
```

---

## 5. End-to-End Workflow

### Register an Agent

1. Call `IdentityRegistry.register(agentURI)` on Mantle Sepolia
2. Receive `agentId` from the `Registered` event
3. Confirm tx on explorer: `https://sepolia.mantlescan.xyz/tx/{hash}`

### Publish Metadata

1. Create the registration JSON (see Section 2) with agent name, description, services
2. Upload to IPFS or host at an HTTPS URL
3. If URI was not set during registration, call `setAgentURI(agentId, uri)`

### Set Agent Wallet

1. Have the target wallet sign an EIP-712 typed data message (or use ERC-1271 for smart contract wallets)
2. Call `setAgentWallet(agentId, newWallet, deadline, signature)`
3. Verify with `getAgentWallet(agentId)`

### Collect Reputation

1. After a client interacts with the agent, the client calls `ReputationRegistry.giveFeedback(agentId, value, valueDecimals, tag1, tag2, endpoint, feedbackURI, feedbackHash)`
2. Aggregate scores with `getSummary(agentId, clientAddresses, tag1, tag2)`
3. The agent can respond to feedback with `appendResponse(...)`

### Transfer Ownership

Transfer the ERC-721 NFT via standard `transferFrom` or `safeTransferFrom`. The `agentWallet` is automatically cleared on transfer.

## Integration Notes

- Use **plugin-evm** for all contract calls (register, setAgentURI, giveFeedback, etc.)
- Use **Blockscout** to verify transactions and inspect contract state
- Always confirm gas costs with the user before executing write operations
- Default to Mantle Sepolia for testing; switch to Mainnet only on explicit request
- When constructing `agentRegistry` strings, use chain ID `5003` for Sepolia, `5000` for Mainnet
