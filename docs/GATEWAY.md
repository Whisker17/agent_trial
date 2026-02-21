# Mantle AaaS Gateway — Technical Specification

> **Version:** 3.0.0
> **Status:** Draft
> **Last Updated:** 2026-02-18

## 1. Overview

The Mantle AaaS (Agent-as-a-Service) Gateway is a platform that lets users
configure, deploy, and manage autonomous AI agents on the Mantle network.
Each agent is an on-chain entity with its own EVM wallet, personality, and
set of capabilities — selected at creation time through a visual Builder UI.

This document is the single source of truth for the Gateway's architecture,
data models, API surface, and implementation details.

### 1.1 Scope

This specification covers only the **AaaS Gateway layer** — the topmost
layer of the Mantle Agent ecosystem described in `DESIGN.md`. The financial
branch (bonding curves, DEX listing) and the utility branch (A2A protocol,
x402 payments) are out of scope for this phase.

### 1.2 What the Gateway Does

1. **Agent Studio** — A web UI where users name their agent, write a persona,
   and select capabilities from a checklist.
2. **One-Click Deploy** — A single action that generates a wallet, assembles
   an ElizaOS character configuration, and spins up an AI runtime instance.
3. **Agent Management** — Start, stop, chat with, and monitor deployed agents.

---

## 2. Core Philosophy: Hands & Manuals

The Gateway uses a **context-injection** architecture, not a traditional
hardcoded-plugin model. Every agent capability is split into two layers:

### Hands (Generic Tools)

A fixed set of executable tools loaded into **every** agent, regardless of
configuration. They provide raw actions — call a contract, resolve a name,
transfer tokens — but carry no business logic about *when* or *why* to use
them.

| Hand                         | Source                              | Capabilities                                     |
| ---------------------------- | ----------------------------------- | ------------------------------------------------ |
| `@elizaos/plugin-evm`       | ElizaOS plugin                      | Transfer, swap, bridge, generic contract calls    |
| Mantle Plugin (custom)       | `src/plugins/mantle.ts`             | ERC-20/721 contract compilation and deployment    |
| eth-mcp                      | MCP server (`eth-mcp@latest`)       | Token addresses, DeFi yields, whale addresses     |
| ENS                          | MCP server (`mcp-server-ens`)       | Name resolution, reverse lookup, record queries   |
| Blockscout                   | MCP server (`@blockscout/mcp-server`) | Transaction/contract/address exploration          |

These tools **never change per agent**. They are the static infrastructure.

### Manuals (Skills = Markdown Files)

Text documents stored as `.md` files in the `skills/` directory. Each skill
describes — in natural language — contract addresses, step-by-step SOPs,
decision logic, and error handling for a specific domain. When a user
selects a skill in the Builder UI, the platform reads the file and injects
its content into the agent's knowledge base.

The LLM reads the Manual to figure out how to orchestrate the Hands.

**Example:** `skills/agent_identity.md` teaches the agent how to register
identities via ERC-8004. It lists contract addresses, fee structure, and a
6-step workflow. The agent uses generic MCP tools (`erc8004_register`,
`get_balance`) that are already available — it just needed the manual to
know *when* and *how*.

### Why This Matters

- **Zero-code extensibility** — Adding a new agent capability means writing
  a Markdown file. No TypeScript, no recompilation, no redeployment.
- **Composability** — An agent with both `agent_identity` and `defi_yield`
  skills can combine knowledge from both when reasoning about a task.
- **Auditability** — Every piece of business logic is human-readable text.

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Frontend (React SPA)                       │
│  ┌──────────┐  ┌──────────────┐  ┌──────────┐  ┌────────────┐ │
│  │Dashboard │  │Agent Builder │  │Agent Chat│  │Agent Detail│ │
│  └────┬─────┘  └──────┬───────┘  └────┬─────┘  └─────┬──────┘ │
└───────┼────────────────┼───────────────┼──────────────┼────────┘
        │                │               │              │
        ▼                ▼               ▼              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Platform Server (Hono)                        │
│  GET /api/skills   POST /api/agents   POST /api/agents/:id/chat│
└────────┬────────────────┬──────────────────┬────────────────────┘
         │                │                  │
         ▼                ▼                  ▼
┌──────────────┐ ┌──────────────────┐ ┌────────────────────┐
│SkillRegistry │ │  AgentManager    │ │  Chat Router       │
│(scans .md)   │ │(create/start/stop│ │(msg → runtime)     │
└──────┬───────┘ │ + wallet gen)    │ └─────────┬──────────┘
       │         └───────┬──────────┘           │
       │                 │                      │
       ▼                 ▼                      ▼
┌──────────────┐ ┌──────────────────┐ ┌────────────────────┐
│ skills/*.md  │ │CharacterFactory  │ │ ElizaOS Runtimes   │
│ (Manuals)    │ │(config + skills  │ │ ┌────┐ ┌────┐     │
└──────────────┘ │ → Character)     │ │ │ R1 │ │ R2 │ ... │
                 └───────┬──────────┘ │ └──┬─┘ └──┬─┘     │
                         │            └────┼──────┼────────┘
                         ▼                 │      │
                 ┌──────────────┐          ▼      ▼
                 │   SQLite     │    ┌─────────────────┐
                 │(agent records│    │  Hands (always)  │
                 │ + wallets)   │    │  MCP + EVM +     │
                 └──────────────┘    │  Mantle Plugin   │
                                     └─────────────────┘
```

### Component Summary

| Component          | Responsibility                                                        |
| ------------------ | --------------------------------------------------------------------- |
| **SkillRegistry**  | Scans `skills/` directory, parses YAML frontmatter, serves metadata and content |
| **AgentManager**   | Agent CRUD, wallet generation, runtime lifecycle (start/stop/destroy)  |
| **CharacterFactory** | Assembles an ElizaOS `Character` from user config + injected skill markdown |
| **Chat Router**    | Routes incoming messages to the correct `AgentRuntime` by agent ID    |
| **SQLite**         | Persists agent records, wallet data, and status                       |

---

## 4. Skill System

### 4.1 Skill File Format

Every skill is a Markdown file with YAML frontmatter:

```yaml
---
name: <skill_id>
description: "<one-line description for Builder UI>"
version: <semver>
author: <author name>
homepage: <optional URL>
tags: [<tag1>, <tag2>, ...]
requires_tools: [<tool1>, <tool2>, ...]
arguments:
  <arg_name>:
    description: "<what this argument controls>"
    required: <true|false>
---

# Skill Title

<Markdown body: SOPs, contract addresses, workflows, error handling>
```

**Frontmatter field reference:**

| Field            | Required | Purpose                                              |
| ---------------- | -------- | ---------------------------------------------------- |
| `name`           | Yes      | Unique identifier (must match filename without `.md`) |
| `description`    | Yes      | Shown in Builder UI skill selection panel             |
| `version`        | No       | Semantic version for tracking changes                 |
| `author`         | No       | Skill author attribution                              |
| `homepage`       | No       | Link to documentation or standard                     |
| `tags`           | Yes      | Used for filtering/grouping in Builder UI             |
| `requires_tools` | No       | Documents which generic tools the skill references    |
| `arguments`      | No       | Per-skill config parameters shown in Builder UI       |

### 4.2 Skill Categories (Four-Tier Architecture)

Skills are organized into four tiers by directory convention:

```
skills/
  _system/                    # Tier 1: Always injected, hidden from UI
    mantle_chain_basics.md    # Chain IDs, RPC URLs, MNT gas, explorer links
    tool_usage_guide.md       # Overview of available MCP/EVM tools
    skills-creator/           # Meta-skill bundle for generating new skills
      SKILL.md                #   Entry point (registered by SkillRegistry)
      scripts/                #   init_skill.py, package_skill.py, quick_validate.py
      references/             #   workflows.md, output-patterns.md
  base/                       # Tier 2: Opt-in at agent creation (Builder UI)
    mantle_8004_base.md       # ERC-8004 Trustless Agents reference
  service/                    # Tier 3: Marketplace skills (x402 payments)
  private/                    # Tier 4: Owner-only, per-agent
```

| Tier | Directory | Injection | Visibility | Mutability |
|------|-----------|-----------|------------|------------|
| **System** | `_system/` | Always, silent | Hidden from Builder UI | Immutable, platform-maintained |
| **Base** | `base/` | Opt-in at agent creation | Shown in Builder UI (not selected by default) | Immutable, platform/community curated |
| **Service** | `service/` | Via A2A marketplace + x402 | Discoverable via marketplace | Published by agents, reviewed |
| **Private** | `private/` | Owner-only, per-agent | Not visible to others | Mutable by owner agent |

- **Tier 1 (System):** Always injected into every agent's knowledge. Provides
  foundational context (chain details, tool inventory, skill creation) that all
  agents need regardless of configuration. Not shown in any UI.
- **Tier 2 (Base):** Shown in the Builder UI as checkboxes. Users explicitly
  select the capabilities they want. These are stable, well-tested modules
  (identity registration, contract deployment, token launch).
- **Tier 3 (Service):** Published to the Agent API Marketplace. Other agents
  discover and pay for these via x402 micropayments. Security-reviewed before
  listing.
- **Tier 4 (Private):** User-generated skills created via the Skill Creator.
  Only loaded by the owning agent. Not published to any marketplace.
- Adding a new capability = committing a new `.md` file. Zero TypeScript.

### 4.3 SkillRegistry

The `SkillRegistry` is a server-side module that:

1. On startup, scans the `skills/` directory recursively for `.md` files.
2. **Skill bundle detection:** If a directory contains a `SKILL.md` file, it is
   treated as a skill bundle — only `SKILL.md` is registered as the skill entry
   point; other `.md` files (e.g. `references/`) and subdirectories are skipped.
   This allows skills to bundle scripts, reference docs, and assets without
   polluting the registry.
3. Parses YAML frontmatter from each skill file using `gray-matter`.
4. Determines tier from directory path: `_system/` → system, `base/` → base,
   `service/` → service, `private/` → private.
5. Exposes:
   - `listByTier(tier: SkillTier): SkillMetadata[]` — filter by tier
   - `listSelectable(): SkillMetadata[]` — base + service (for Builder UI / marketplace)
   - `listSystem(): SkillMetadata[]` — system tier only
   - `getSystemContents(): string[]` — all system skill markdown bodies
   - `getSkillContent(id: string): string` — returns the full markdown body
   - `getSkillMetadata(id: string): SkillMetadata` — returns parsed frontmatter
6. Optionally watches the directory for changes (hot-reload in development).

---

## 5. Generic Tool Layer ("Hands")

Every agent runtime is loaded with the exact same set of plugins and MCP
connections. These provide the executable primitives that skills reference.

### 5.1 ElizaOS Plugins (always loaded)

| Plugin                              | Purpose                                  |
| ----------------------------------- | ---------------------------------------- |
| `@elizaos/plugin-sql`              | Database access for ElizaOS internals    |
| `@elizaos/plugin-bootstrap`        | Core ElizaOS bootstrapping               |
| `@elizaos/plugin-openrouter`       | LLM access via OpenRouter (or `plugin-openai`, `plugin-ollama` based on config) |
| `@elizaos/plugin-evm`             | Generic EVM: transfer, swap, bridge, contract calls |
| `@fleek-platform/eliza-plugin-mcp` | MCP client — connects to MCP servers     |
| Mantle Plugin (custom)              | Solidity compilation + contract deployment on Mantle |

### 5.2 MCP Servers (always connected)

Configured in the character's `settings.mcp.servers`:

```json
{
  "eth-mcp": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "eth-mcp@latest"]
  },
  "ens": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "mcp-server-ens"]
  },
  "blockscout": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@blockscout/mcp-server"]
  }
}
```

These servers expose tools that skills reference by name in their
`requires_tools` frontmatter and in their SOP steps (e.g., "Use
`erc8004_register` with: ...").

### 5.3 The Mantle Plugin

Refactored from the current `src/plugin.ts`, this custom ElizaOS plugin
provides two actions that require compiled TypeScript (Solidity compilation
cannot be done in a Markdown SOP):

- `DEPLOY_ERC20` — compile and deploy an ERC-20 token
- `DEPLOY_ERC721` — compile and deploy an ERC-721 NFT

And one provider:

- `MANTLE_CHAIN_PROVIDER` — injects wallet address and MNT balances into
  agent context

The plugin reads `EVM_PRIVATE_KEY` from the runtime settings — which the
AgentManager injects per-agent (see Section 6).

---

## 6. Agent Wallet System

Every agent is an on-chain entity with its own wallet. This is not optional —
it is fundamental to the crypto-native identity of each agent.

### 6.1 Wallet Lifecycle

```
POST /api/agents (create)
  │
  ├─ 1. Generate fresh EVM keypair
  │     privateKey = viem.generatePrivateKey()
  │     account = privateKeyToAccount(privateKey)
  │     walletAddress = account.address
  │
  ├─ 2. Encrypt private key
  │     encryptedPrivateKey = AES-256-GCM(privateKey, PLATFORM_ENCRYPTION_KEY)
  │
  ├─ 3. Store in SQLite
  │     INSERT agent record with walletAddress + encryptedPrivateKey
  │
  └─ 4. Return walletAddress to frontend (NEVER return the private key)

POST /api/agents/:id/start
  │
  ├─ 1. Load agent record from SQLite
  │
  ├─ 2. Decrypt private key
  │     privateKey = AES-256-GCM-decrypt(encryptedPrivateKey, PLATFORM_ENCRYPTION_KEY)
  │
  ├─ 3. Build ElizaOS Character via CharacterFactory
  │     character.settings.secrets.EVM_PRIVATE_KEY = privateKey
  │
  └─ 4. Create AgentRuntime with this Character
        plugin-evm and Mantle Plugin read EVM_PRIVATE_KEY from runtime settings
        → agent signs all transactions with its OWN wallet
```

### 6.2 Encryption

- **Algorithm:** AES-256-GCM
- **Key source:** `PLATFORM_ENCRYPTION_KEY` environment variable (32 bytes,
  hex-encoded). This is the only secret the platform operator must manage.
- **Storage:** The `encryptedPrivateKey` column stores the ciphertext + IV +
  auth tag as a single base64 string.
- **Decryption:** Happens in-memory only at agent start time. The decrypted
  key is passed to the runtime and never persisted in plaintext.

### 6.3 Creator Address

Optionally, `AgentConfig` includes `creatorAddress` — the Ethereum address
of the user who deployed the agent, obtained from their connected Web3 wallet.
This establishes off-chain ownership and can later be used for:

- Access control (only creator can stop/delete/reconfigure)
- On-chain registration (linking agent to creator via ERC-8004)
- Revenue sharing (future financial branch)

For MVP, `creatorAddress` is stored but not enforced for access control.

### 6.4 Funding Display

The frontend Dashboard and AgentDetail pages display:

- The agent's `walletAddress`
- The agent's current MNT balance on Mantle (fetched via `viem.getBalance()`)
- A copy-to-clipboard button so users can easily send MNT to fund the agent

This tells the user: "Send MNT here to power your agent's on-chain actions."

---

## 7. Character Assembly (CharacterFactory)

The `CharacterFactory` is the heart of the context-injection engine. It
takes a user's `AgentConfig` + resolved skill content and produces an
ElizaOS `Character` object.

### 7.1 Assembly Steps

```
Input:  AgentConfig { name, persona, modelProvider, skills[], creatorAddress? }
      + AgentRecord { walletAddress, decryptedPrivateKey }
      + SkillRegistry

Step 1: Load system skills
        Read all skills/_system/*.md → systemContent[]

Step 2: Load selected skills
        For each id in config.skills:
          content = SkillRegistry.getSkillContent(id)
          metadata = SkillRegistry.getSkillMetadata(id)
        → selectedContent[], selectedMeta[]

Step 3: Build system prompt
        Concatenate:
          - config.persona (user-provided personality)
          - "Your wallet address is {walletAddress} on Mantle."
          - For each selected skill:
              "You have the [{name}] capability: {description}"

Step 4: Build knowledge array
        knowledge = [...systemContent, ...selectedContent]
        (ElizaOS stores these and uses RAG to retrieve relevant
         sections at query time — no token limit concern)

Step 5: Attach static plugins
        plugins = [
          '@elizaos/plugin-sql',
          '@elizaos/plugin-bootstrap',
          modelProviderPlugin(config.modelProvider),
          '@elizaos/plugin-evm',
          '@fleek-platform/eliza-plugin-mcp',
        ]
        (Mantle custom plugin injected separately at runtime)

Step 6: Attach settings
        settings = {
          secrets: { EVM_PRIVATE_KEY: decryptedPrivateKey },
          chains: { evm: ['mantle', 'mantleSepoliaTestnet'] },
          mcp: { servers: { ...staticMCPConfig } },
        }

Output: Complete ElizaOS Character object
```

### 7.2 System Prompt Template

```
{persona}

You are an autonomous AI agent on the Mantle blockchain network.
Your wallet address: {walletAddress}
Network: Mantle (Chain ID 5000) / Mantle Sepolia (Chain ID 5003)
Native gas token: MNT

You have the following capabilities:
{for each selected skill: "- [{name}]: {description}"}

Always confirm with the user before executing transactions that cost gas.
Default to Mantle Sepolia Testnet unless explicitly told to use Mainnet.
```

---

## 8. Data Models

### 8.1 AgentConfig (Frontend → Backend)

```typescript
interface AgentConfig {
  name: string;
  persona: string;
  modelProvider: 'openrouter' | 'openai' | 'ollama';
  skills: string[];
  skillArgs?: Record<string, Record<string, string>>;
  creatorAddress?: string;
}
```

### 8.2 SkillMetadata (Parsed from YAML frontmatter)

```typescript
type SkillTier = 'system' | 'base' | 'service' | 'private';

interface SkillMetadata {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  homepage?: string;
  tags: string[];
  requiresTools: string[];
  arguments?: Record<string, {
    description: string;
    required: boolean;
  }>;
  tier: SkillTier;
  isSystem: boolean;    // derived: tier === 'system'
}
```

### 8.3 AgentRecord (SQLite)

```typescript
interface AgentRecord {
  id: string;                    // UUID v4
  name: string;
  persona: string;
  modelProvider: string;
  skills: string;                // JSON array of skill IDs
  skillArgs: string;             // JSON object, optional per-skill args
  walletAddress: string;         // Generated EVM address
  encryptedPrivateKey: string;   // AES-256-GCM encrypted
  creatorAddress: string | null; // Web3 wallet of creator, if provided
  status: 'created' | 'running' | 'stopped' | 'error';
  createdAt: string;             // ISO 8601
  updatedAt: string;             // ISO 8601
}
```

### 8.4 SQLite Schema

```sql
CREATE TABLE IF NOT EXISTS agents (
  id                   TEXT PRIMARY KEY,
  name                 TEXT NOT NULL,
  persona              TEXT NOT NULL,
  model_provider       TEXT NOT NULL DEFAULT 'openrouter',
  skills               TEXT NOT NULL DEFAULT '[]',
  skill_args           TEXT NOT NULL DEFAULT '{}',
  wallet_address       TEXT NOT NULL,
  encrypted_private_key TEXT NOT NULL,
  creator_address      TEXT,
  status               TEXT NOT NULL DEFAULT 'created',
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## 9. API Specification

Base URL: `/api`

### 9.1 Skills

#### `GET /api/skills`

List selectable skills (base + service tiers). Supports optional `?tier=base|service` query parameter for filtering.

**Query Parameters:**

| Param | Values | Default |
|-------|--------|---------|
| `tier` | `base`, `service` | Returns both if omitted |

**Response `200`:**
```json
{
  "skills": [
    {
      "id": "mantle_8004_base",
      "name": "mantle_8004_base",
      "description": "Complete ERC-8004 Trustless Agents reference: Identity, Reputation, Validation registries.",
      "version": "1.0.0",
      "author": "mantle-aaas",
      "tags": ["erc8004", "identity", "reputation", "validation", "registry"],
      "requiresTools": ["plugin-evm"],
      "tier": "base"
    }
  ]
}
```

### 9.2 Agents

#### `POST /api/agents`

Create a new agent. Generates a wallet, stores config, optionally auto-starts.

**Request:**
```json
{
  "name": "MantleDegen",
  "persona": "You are a ruthless crypto degen on Mantle...",
  "modelProvider": "openrouter",
  "skills": ["agent_identity", "defi_yield"],
  "skillArgs": {
    "agent_identity": { "agent_name": "MantleDegen" }
  },
  "creatorAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f44e",
  "autoStart": false
}
```

**Response `201`:**
```json
{
  "agent": {
    "id": "a1b2c3d4-...",
    "name": "MantleDegen",
    "walletAddress": "0x9F3e21a...",
    "status": "created",
    "skills": ["agent_identity", "defi_yield"],
    "createdAt": "2026-02-18T12:00:00Z"
  }
}
```

#### `GET /api/agents`

List all agents.

**Response `200`:**
```json
{
  "agents": [
    {
      "id": "a1b2c3d4-...",
      "name": "MantleDegen",
      "walletAddress": "0x9F3e21a...",
      "status": "running",
      "skills": ["agent_identity", "defi_yield"],
      "creatorAddress": "0x742d...f44e",
      "createdAt": "2026-02-18T12:00:00Z"
    }
  ]
}
```

#### `GET /api/agents/:id`

Get agent detail including config and live wallet balance.

**Response `200`:**
```json
{
  "agent": {
    "id": "a1b2c3d4-...",
    "name": "MantleDegen",
    "persona": "You are a ruthless crypto degen...",
    "modelProvider": "openrouter",
    "walletAddress": "0x9F3e21a...",
    "balance": {
      "mantle": "15.3",
      "mantleSepolia": "100.0"
    },
    "status": "running",
    "skills": ["agent_identity", "defi_yield"],
    "creatorAddress": "0x742d...f44e",
    "createdAt": "2026-02-18T12:00:00Z",
    "updatedAt": "2026-02-18T12:05:00Z"
  }
}
```

#### `PATCH /api/agents/:id`

Update agent config. Agent must be in `stopped` or `created` state.

**Request:**
```json
{
  "persona": "Updated persona...",
  "skills": ["agent_identity", "contract_deploy"]
}
```

**Response `200`:** Updated agent object.

#### `DELETE /api/agents/:id`

Stop the runtime (if running), then delete the agent record and its wallet.

**Response `204`:** No content.

#### `POST /api/agents/:id/start`

Start the agent runtime. Decrypts wallet, builds character, creates runtime.

**Response `200`:**
```json
{ "status": "running" }
```

#### `POST /api/agents/:id/stop`

Stop the agent runtime. Shuts down the ElizaOS runtime instance.

**Response `200`:**
```json
{ "status": "stopped" }
```

### 9.3 Chat

#### `POST /api/agents/:id/chat`

Send a message to a running agent.

**Request:**
```json
{
  "message": "What is my wallet balance?",
  "userId": "user-uuid-or-address"
}
```

**Response `200`:**
```json
{
  "response": {
    "text": "Your agent wallet 0x9F3e21a... has 15.3 MNT on Mantle Mainnet.",
    "actions": []
  }
}
```

**Error `409`:** Agent is not in `running` state.

---

## 10. Agent Lifecycle (AgentManager)

The `AgentManager` is the central orchestrator for agent instances.

### 10.1 State Machine

```
              POST /api/agents
                    │
                    ▼
              ┌──────────┐
              │ created  │
              └────┬─────┘
                   │ POST /start
                   ▼
              ┌──────────┐
         ┌────│ running  │────┐
         │    └────┬─────┘    │
         │         │          │ runtime crash
         │  POST /stop        │
         │         │          ▼
         │         │    ┌──────────┐
         │         │    │  error   │
         │         │    └────┬─────┘
         │         ▼         │ POST /start (retry)
         │    ┌──────────┐   │
         └───▶│ stopped  │◀──┘
              └────┬─────┘
                   │ DELETE
                   ▼
              (destroyed)
```

### 10.2 Runtime Management

The `AgentManager` maintains an in-memory map of running agents:

```typescript
Map<agentId, {
  runtime: AgentRuntime,
  character: Character,
  startedAt: Date
}>
```

On `start`:
1. Load `AgentRecord` from SQLite.
2. Decrypt `encryptedPrivateKey`.
3. Call `CharacterFactory.build(config, skills, wallet)`.
4. Create `AgentRuntime` with the character.
5. Initialize runtime (load plugins, connect MCP servers).
6. Add to the active runtimes map.
7. Update status to `running` in SQLite.

On `stop`:
1. Retrieve runtime from the map.
2. Gracefully shut down the runtime (disconnect MCP, close connections).
3. Remove from the map.
4. Update status to `stopped` in SQLite.

On `chat`:
1. Look up runtime in the map.
2. If not found or not running, return `409`.
3. Forward message to the runtime's message handler.
4. Return the agent's response.

---

## 11. Frontend UI

### 11.1 Pages

| Page            | Route                | Purpose                                        |
| --------------- | -------------------- | ---------------------------------------------- |
| **Dashboard**   | `/`                  | List all agents as cards with status, wallet address, MNT balance |
| **Builder**     | `/agents/new`        | Create a new agent: name, persona, model, skill selection |
| **Agent Detail** | `/agents/:id`       | View config, wallet address + balance, start/stop controls |
| **Agent Chat**  | `/agents/:id/chat`   | Chat interface for interacting with the agent   |

### 11.2 Dashboard

Displays a grid of agent cards. Each card shows:

- Agent name
- Status badge (created / running / stopped / error)
- Wallet address (truncated, with copy button)
- MNT balance (fetched client-side via `viem.getBalance()` or via `GET /api/agents/:id`)
- Quick actions: Start / Stop / Chat / Delete

A prominent "Create Agent" button navigates to the Builder.

### 11.3 Builder (Agent Creation Flow)

A single-page form with sections:

1. **Identity** — Agent name (text input), Persona (textarea)
2. **Model** — Model provider selector (OpenRouter / OpenAI / Ollama)
3. **Skills** — Checkbox grid fetched from `GET /api/skills?tier=base`. Each
   skill displays name, description, and tags (none selected by default).
   Selecting a skill may reveal its `arguments` for additional configuration.
4. **Creator** — "Connect Wallet" button (optional). If connected, the
   address is attached as `creatorAddress`.
5. **Deploy** — "Deploy Agent" button. Calls `POST /api/agents` and
   navigates to the new Agent Detail page.

### 11.4 Agent Detail

Displays:

- Full config (name, persona, model, selected skills)
- Wallet section: address (full, copyable), MNT balance on mainnet and sepolia
- "Fund your agent" callout with the wallet address
- Start / Stop / Delete action buttons
- Link to Chat

### 11.5 Agent Chat

Reuses the existing chat components (`ChatMessage.tsx`, `ChatInput.tsx`)
from the current codebase, adapted to:

- Route messages through `POST /api/agents/:id/chat`
- Display the agent's name and wallet address in the header
- Show connection status

---

## 12. Tech Stack

| Layer              | Technology                                     | Rationale                                     |
| ------------------ | ---------------------------------------------- | --------------------------------------------- |
| Runtime            | Bun                                            | Fast, native TypeScript, built-in SQLite      |
| HTTP Server        | Hono                                           | Lightweight, TypeScript-first, Bun-native     |
| Frontend           | React + Vite + Tailwind CSS                    | Existing codebase, fast HMR, utility-first CSS |
| Database           | SQLite via `bun:sqlite`                        | Zero-infrastructure, sufficient for MVP       |
| Agent Runtime      | ElizaOS `@elizaos/core`                        | Mature agent framework, plugin ecosystem      |
| Key Encryption     | AES-256-GCM (Node.js `crypto`)                 | Standard symmetric encryption                 |
| Wallet Generation  | viem (`generatePrivateKey`, `privateKeyToAccount`) | Already a dependency, Mantle-compatible      |
| Frontmatter Parse  | gray-matter                                    | Battle-tested YAML frontmatter parser         |

---

## 13. Project Directory Structure

```
mantle-agent/
├── src/
│   ├── index.ts                    # Entry: starts Hono server
│   ├── server/
│   │   ├── app.ts                  # Hono app, middleware, route mounting
│   │   └── routes/
│   │       ├── agents.ts           # Agent CRUD + start/stop
│   │       ├── chat.ts             # Agent chat proxy
│   │       └── skills.ts           # Skill listing
│   ├── core/
│   │   ├── agent-manager.ts        # Runtime lifecycle + wallet generation
│   │   ├── character-factory.ts    # Config + skills → Character
│   │   ├── skill-registry.ts       # Markdown scanner + frontmatter parser
│   │   └── crypto.ts               # AES-256-GCM encrypt/decrypt helpers
│   ├── db/
│   │   ├── index.ts                # SQLite setup + migrations
│   │   └── repository.ts           # Agent CRUD queries
│   ├── plugins/
│   │   ├── mantle.ts               # Mantle plugin (deploy, chain provider)
│   │   └── contracts/              # compiler.ts, erc20.ts, erc721.ts
│   ├── shared/
│   │   └── types.ts                # AgentConfig, SkillMetadata, AgentRecord
│   └── frontend/
│       ├── index.html
│       ├── index.tsx               # React entry + router setup
│       ├── index.css               # Tailwind base styles
│       ├── pages/
│       │   ├── Dashboard.tsx
│       │   ├── Builder.tsx
│       │   ├── AgentDetail.tsx
│       │   └── AgentChat.tsx
│       ├── components/
│       │   ├── AgentCard.tsx        # Dashboard card with wallet + balance
│       │   ├── SkillSelector.tsx    # Skill checkbox grid
│       │   ├── WalletDisplay.tsx    # Address + balance + copy button
│       │   ├── ChatMessage.tsx      # Refactored from existing
│       │   └── ChatInput.tsx        # Reused from existing
│       ├── hooks/
│       │   ├── use-agents.ts        # Agent CRUD (TanStack Query)
│       │   └── use-chat.ts          # Chat state management
│       ├── api.ts                   # API client
│       └── utils.ts                 # cn() helper
├── skills/                          # THE knowledge layer (4-tier architecture)
│   ├── _system/                     # Tier 1: Always injected, hidden
│   │   ├── mantle_chain_basics.md
│   │   ├── tool_usage_guide.md
│   │   └── skills-creator/          # Skill bundle (SKILL.md + scripts/ + references/)
│   ├── base/                        # Tier 2: Opt-in at creation (Builder UI)
│   │   └── mantle_8004_base.md
│   ├── service/                     # Tier 3: Marketplace skills (x402)
│   └── private/                     # Tier 4: Owner-only, per-agent
├── docs/
│   ├── GATEWAY.md                   # This file
│   └── DESIGN.md                    # Ecosystem design (unchanged)
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

---

## 14. Security Considerations

| Concern                    | Mitigation                                                     |
| -------------------------- | -------------------------------------------------------------- |
| Private key exposure       | AES-256-GCM encryption at rest; decrypted only in-memory at runtime start |
| Platform master key loss   | `PLATFORM_ENCRYPTION_KEY` in env — operator must secure and back up |
| Unauthorized agent access  | MVP: no enforcement. Future: verify `creatorAddress` signature on mutation endpoints |
| Malicious skill content    | Skills are authored by the platform operator, not end users (for now). Future: skill signing/verification |
| MCP server trust           | MCP servers run locally via stdio — no network exposure        |
| SQLite injection           | Use parameterized queries exclusively                          |
| Wallet draining            | Each agent has its own isolated wallet — compromise of one does not affect others |

---

## 15. Future Extensions (Out of Scope)

These are documented for context but are **not** part of this spec:

- **ERC-8004 on-chain registration** of agents at creation time (financial branch)
- **Bonding curve IAO** for agent token issuance (financial branch)
- **A2A protocol** for agent-to-agent communication (utility branch)
- **x402 micropayments** for agent service consumption (utility branch)
- **Access control** via `creatorAddress` signature verification
- **Skill marketplace** where third parties publish skills
- **Multi-chain support** beyond Mantle
