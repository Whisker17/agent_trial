# Mantle AaaS Platform — Spec Review & Implementation Roadmap

> **Version:** 1.0.0
> **Status:** Draft — For Discussion
> **Date:** 2026-02-22
> **Scope:** Architecture critique, design recommendations, skills expansion, phased roadmap
> **Input Documents:** DESIGN.md, GATEWAY.md (v3.0.0), v3.0.0-spec-code-api-refactoring.md

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architectural Critique](#2-architectural-critique)
3. [Revised Skill Tier Model](#3-revised-skill-tier-model)
4. [Revised Code Generation Safety Model](#4-revised-code-generation-safety-model)
5. [System Skills Expansion](#5-system-skills-expansion)
6. [Base Skills Expansion](#6-base-skills-expansion)
7. [Phased Implementation Roadmap](#7-phased-implementation-roadmap)
8. [Open Questions & Decision Points](#8-open-questions--decision-points)

---

## 1. Executive Summary

The Mantle AaaS (Agent-as-a-Service) platform aims to let non-developer users deploy autonomous AI agents on the Mantle network via a visual builder, with modular capabilities driven by Markdown-based Skills. Three design documents exist today:

- **DESIGN.md** — High-level vision: AaaS concept, skills hierarchy (System/Base/Advanced), key features (self-extension, marketplace, asset issuance).
- **GATEWAY.md** — Technical spec for the Gateway layer: Hands & Manuals architecture, four-tier skills (System/Base/Service/Private), agent wallet system, API surface, frontend UI.
- **v3.0.0-spec-code-api-refactoring.md** — Proposed evolution: Skills become "specs" (WHAT), LLM generates per-agent TypeScript code (HOW), plus an API Marketplace for capability discovery.

This review identifies **7 structural issues** across these documents, proposes concrete design corrections, expands the skills catalog from 6 to 20+ skills, and defines a 7-phase implementation roadmap.

The central thesis of this review: **the platform should fully validate the Hands & Manuals model before introducing LLM code generation.** Code generation adds an order-of-magnitude increase in attack surface, and the current safety model (regex-based validation) is insufficient for financial operations. The recommended path is to harden the foundation first, then introduce sandboxed code generation in a later phase with defense-in-depth protections.

---

## 2. Architectural Critique

### 2.1 Issue: Spec-Code-API Safety Gap

**Severity: Critical**

The v3.0.0 refactoring proposes that agents generate TypeScript code from Skill specs via LLM, then load it via `dynamic import()`. The code validation pipeline (v3.0.0 Section 4.4) relies on **regex pattern matching** for security:

```
| Forbidden Pattern         | Reason                              |
|---------------------------|-------------------------------------|
| import.*from ['"]node:    | Block Node.js built-in modules      |
| process\.env              | Block environment variable access   |
| require\(                 | Block CommonJS require              |
| eval\(, Function\(        | Block dynamic code execution        |
```

**Why this fails:**

1. **Trivial bypass via string concatenation:** `process['e'+'nv']` passes the `process\.env` regex.
2. **Dynamic import bypass:** `const m = await import(pathVariable)` can load arbitrary modules at runtime — the static regex only checks literal import statements.
3. **Prototype pollution:** Generated code can modify `Object.prototype`, `Array.prototype`, or any global, affecting all agents in the same process.
4. **No runtime sandbox:** Code runs in the same V8 isolate as the platform. A malicious or buggy plugin has full access to the Node.js process.
5. **Financial risk:** These agents handle real assets. A code generation bug in a "buy the dip" plugin can drain a wallet. The validation pipeline has no mechanism to verify *business logic correctness*, only syntactic patterns.

**Evidence from existing docs:**

- v3.0.0 Section 6.2 acknowledges: "同一进程内存空间，理论上存在内存越界风险" and "单个 Agent 的插件 bug 可能导致进程崩溃，影响所有 Agent" — but defers mitigation to Stage 2/3.
- v3.0.0 Section 4.4 lists only 6 regex patterns as the entire security model for generated code.

**Recommendation:** Defer code generation to Phase 4 (see Section 7). When implemented, replace regex validation with AST-level static analysis + runtime sandbox (isolated-vm or Worker Threads with resource limits) + transaction dry-run simulation + mandatory human confirmation for value-moving operations.

---

### 2.2 Issue: Skill Sharing vs Marketplace Cannibalization

**Severity: High**

The design creates a self-defeating loop:

1. Agent A implements a capability and publishes a Skill spec (public, with full SOP, contract addresses, decision logic).
2. Agent A registers an API in the Marketplace, charging per call.
3. Agent B discovers the API, sees the associated Skill spec.
4. Agent B **forks** the Skill spec (v3.0.0 Section 3.4: "支持 Fork：其他 Agent 可以 fork 一个公开 Skill 作为自己实现的基础").
5. Agent B generates its own implementation from the forked Skill — for free.
6. Agent A's paid API has zero customers.

**The fork mechanism directly cannibalizes the Marketplace business model.** If a Skill contains enough detail to guide LLM code generation (which is its stated purpose), then it contains enough detail for any agent to replicate the capability independently.

**Evidence from existing docs:**

- DESIGN.md line 9: "用户即使有相关功能的 skills 也不一定能够构建出正确的后端代码" — this assumption is weakened by the v3.0.0 code generation pipeline, which exists precisely to turn Skills into code.
- v3.0.0 Section 3.4 explicitly enables forking of public skills.

**Recommendation:** Introduce a **Skill Visibility Model** with three levels (see Section 3.3). Service-tier skills that back paid APIs should expose only a capability description and interface schema (spec-only), not the full SOP or implementation hints.

---

### 2.3 Issue: Document Inconsistencies

**Severity: Medium**

The three design documents contradict each other in several places:

| Topic | DESIGN.md | GATEWAY.md | v3.0.0 Refactoring |
|-------|-----------|------------|---------------------|
| Skill tiers | 3 tiers: System, Base, Advanced | 4 tiers: System, Base, Service, Private | 4 tiers (same as GATEWAY) |
| ERC-8004 | Listed as "Advanced" example | Placed in `base/` directory | Not mentioned specifically |
| Asset issuance | Key Feature with DEX bonding curve | Out of scope (Section 1.1, 15) | Not mentioned |
| Skill purpose | "Agent 通过 skill 完成后端功能开发" (implementation) | "Manuals" = knowledge injection (cognition) | "Skills 从实现降级为规格" (specification) |
| Skills storage | "通过注册写入数据库" | Filesystem only | Hybrid (filesystem + DB) |

The "Advanced" tier from DESIGN.md disappeared without explanation. Its examples (8004 registration, yield boost, dapp development) were scattered across Base and Future Extensions.

**Recommendation:** Establish a single canonical skill tier model (see Section 3). Deprecate "Advanced" explicitly. Assign each capability to exactly one tier with clear rationale.

---

### 2.4 Issue: Runtime Isolation Underestimation

**Severity: High**

v3.0.0 Section 6.1 proposes three isolation stages:

| Stage | Isolation | Scale |
|-------|-----------|-------|
| Stage 1 (current) | Logical (same process) | < 50 Agents |
| Stage 2 | Process (Child Process / Worker Thread) | < 500 Agents |
| Stage 3 | Container (Docker) | Production |

**Problems with Stage 1:**

1. The "< 50 Agent" threshold has no empirical basis. A single LLM-generated infinite loop blocks the event loop for all 49 other agents.
2. No memory limits — one agent allocating a large buffer can trigger OOM for the entire process.
3. No CPU time limits — a computationally expensive plugin starves all other agents.
4. `dynamic import()` runs in the main isolate — generated code can access and modify any global state.
5. The `Map<agentId, RunningAgent>` (GATEWAY.md Section 10.2) is a process-global data structure accessible to any code running in the same isolate.

**Recommendation:** Even in Stage 1, enforce:
- Per-agent execution timeouts (via `AbortController` or `setTimeout` wrappers)
- Memory monitoring with per-agent budgets (process.memoryUsage() sampling)
- Heartbeat checks that restart unresponsive agents
- For generated code specifically: mandatory Worker Thread isolation from day one (not deferred to Stage 2)

---

### 2.5 Issue: Marketplace Payment Model is Undefined

**Severity: High**

The Marketplace is positioned as a core value driver — "Agent 不应重复开发已有能力" (v3.0.0 Section 5.1) — but the payment model is skeletal:

- `price_per_call` and `payment_token` fields exist in the DB schema, but the actual payment flow is undefined.
- x402 is mentioned exactly twice in the entire corpus (GATEWAY.md Section 4.2, v3.0.0 Section 5.5) with no specification of how it integrates.
- No escrow mechanism: if Agent B pays Agent A for an API call that returns garbage, there is no recourse.
- No dispute resolution: who arbitrates quality complaints?
- No refund conditions defined.
- Unclear fund source: does the payment come from Agent B's wallet? The user's wallet? A platform escrow?

**Recommendation:** Define the complete payment flow before implementing Marketplace (see Phase 3 in Section 7). At minimum:
- Payment token: the calling agent's native token or a platform stablecoin
- Escrow: Gateway holds payment until the caller confirms result (with timeout auto-release)
- Dispute: platform-level arbitration for flagged transactions
- Refund: automatic if API returns error; manual review for quality disputes

---

### 2.6 Issue: ElizaOS Deep Coupling

**Severity: Medium**

The platform is tightly bound to ElizaOS at every layer:

- Agent lifecycle → `AgentRuntime` from `@elizaos/core`
- Plugin system → ElizaOS `Plugin`, `Action`, `Provider` interfaces
- Character assembly → ElizaOS `Character` object
- Knowledge injection → ElizaOS RAG system
- LLM access → ElizaOS model provider plugins (`plugin-openrouter`, `plugin-openai`)
- Message handling → ElizaOS runtime message handler

If ElizaOS ships a breaking change to any of these interfaces, the entire platform requires coordinated migration. There is no abstraction layer between platform logic and ElizaOS internals.

**Recommendation:** Introduce an `AgentRuntimeAdapter` interface that wraps ElizaOS-specific calls:

```typescript
interface AgentRuntimeAdapter {
  createRuntime(character: PlatformCharacter, plugins: PlatformPlugin[]): RuntimeHandle;
  destroyRuntime(handle: RuntimeHandle): void;
  sendMessage(handle: RuntimeHandle, message: string, userId: string): Promise<string>;
  getStatus(handle: RuntimeHandle): RuntimeStatus;
}
```

This allows swapping ElizaOS for another runtime (or a future version) without rewriting AgentManager, CharacterFactory, or chat routing. The adapter pattern also simplifies testing — mock the adapter instead of the entire ElizaOS stack.

---

### 2.7 Issue: No Agent-to-Agent Communication Protocol

**Severity: Medium**

The Marketplace provides a request-response pattern: Agent A calls Agent B's API via the Gateway proxy. But there is no mechanism for:

- **Async task delegation:** Agent A asks Agent B to perform a long-running task and gets notified on completion.
- **Event subscription:** Agent A subscribes to events from Agent B (e.g., "notify me when MNT drops below $0.50").
- **Multi-agent coordination:** Three agents collaborating on a complex workflow (e.g., one monitors price, one executes trade, one reports to user).

The current architecture treats agents as isolated silos that only interact through synchronous API calls. This limits the composability that makes an agent ecosystem valuable.

**Recommendation:** Define a lightweight Agent Communication Protocol (ACP) with:
- Request-response (already covered by Marketplace)
- Fire-and-forget notifications (async, no response expected)
- Subscription/callback (register interest, receive pushes)
- Task delegation with status polling (submit task, poll for completion)

Implementation can use the existing SQLite DB as a message queue in Phase 1, upgrading to a proper message broker in later phases.

---

### 2.8 Summary of Issues

| # | Issue | Severity | Current State | Recommended Fix |
|---|-------|----------|---------------|-----------------|
| 1 | Code generation safety | Critical | Regex-only validation | AST analysis + sandbox + dry-run + human confirmation |
| 2 | Skill/Marketplace conflict | High | Fork cannibalizes paid APIs | Skill visibility levels (spec-only / full / private) |
| 3 | Document inconsistencies | Medium | 3 docs contradict each other | Single canonical tier model, deprecate "Advanced" |
| 4 | Runtime isolation | High | Same-process, no limits | Per-agent timeouts + memory budgets + heartbeats |
| 5 | Payment model undefined | High | DB fields only, no flow | Escrow + dispute + refund + clear fund source |
| 6 | ElizaOS coupling | Medium | Direct dependency everywhere | AgentRuntimeAdapter abstraction |
| 7 | No A2A communication | Medium | Sync API calls only | Agent Communication Protocol (async + subscription) |

---

## 3. Revised Skill Tier Model

### 3.1 Unified Four-Tier Hierarchy

DESIGN.md uses three tiers (System/Base/Advanced). GATEWAY.md uses four (System/Base/Service/Private). This review establishes the **four-tier model as canonical** and explicitly deprecates "Advanced."

```
skills/
  _system/          # Tier 1: System
  base/             # Tier 2: Base
  service/          # Tier 3: Service (was "Advanced" in DESIGN.md)
  private/          # Tier 4: Private
```

| Tier | Directory | Injection | Visibility | Mutability | Source |
|------|-----------|-----------|------------|------------|--------|
| **System** | `_system/` | Always, silent | Hidden from UI | Immutable, platform-maintained | Filesystem |
| **Base** | `base/` | Opt-in at agent creation | Builder UI checkbox | Immutable, platform-curated | Filesystem |
| **Service** | `service/` | Via Marketplace discovery | Marketplace catalog | Mutable by author agent | SQLite DB |
| **Private** | `private/` | Owner-only | Not visible to others | Mutable by owner agent | SQLite DB |

**Migration of DESIGN.md "Advanced" examples:**

| DESIGN.md "Advanced" Example | New Tier | Rationale |
|------------------------------|----------|-----------|
| 8004 注册与代注册 | **Base** | Standardized workflow, platform-curated, already in `base/` |
| Mantle 链上最佳 Yield Boost | **Base** | Common user need, should be a curated base skill |
| 简易 dapps 开发与部署 | **Service** or **Private** | User-specific, created via skills-creator |

### 3.2 Tier Lifecycle Rules

```
                  Platform Dev         skills-creator          Agent Owner
                      │                     │                      │
                      ▼                     ▼                      ▼
                 ┌─────────┐          ┌──────────┐           ┌──────────┐
                 │ System  │          │ Service  │           │ Private  │
                 │  Base   │          │ (DB)     │           │ (DB)     │
                 │ (files) │          └────┬─────┘           └────┬─────┘
                 └─────────┘               │                      │
                                           │ promote              │ promote
                                           ▼                      ▼
                                      ┌──────────┐          ┌──────────┐
                                      │ Base     │          │ Service  │
                                      │ (review) │          │ (public) │
                                      └──────────┘          └──────────┘
```

- **System/Base** skills are authored by platform developers and deployed via code releases. They are never created dynamically.
- **Service** skills are created by agents via skills-creator. After community review, high-quality service skills can be promoted to Base.
- **Private** skills are owner-only. The owner can promote a private skill to Service to share it.
- **Demotion** is also possible: a Base skill can be deprecated (soft-deleted with a migration note).

### 3.3 Skill Visibility Model

To resolve the Skill sharing vs Marketplace cannibalization problem (Issue 2.2), each skill has a `visibility` attribute controlling what others can see:

| Visibility | Who Can See | What They See | Fork Allowed |
|------------|-------------|---------------|--------------|
| **spec-only** | Everyone | Name, description, interface schema, tags — but NOT the SOP body, contract addresses, or implementation logic | No |
| **full** | Everyone | Complete Markdown content including SOPs | Yes |
| **private** | Owner only | Everything | N/A |

**Default visibility by tier:**

| Tier | Default Visibility | Rationale |
|------|-------------------|-----------|
| System | Hidden (not in any catalog) | Platform internals |
| Base | Full | Educational, community benefit |
| Service | Spec-only | Protects Marketplace revenue |
| Private | Private | Owner's IP |

**How spec-only works in practice:**

When a Service skill backs a paid Marketplace API, other agents can see:
- "This skill enables MNT price monitoring with configurable thresholds and auto-buy triggers"
- Input/output interface: `{ threshold: number, action: "buy" | "alert", amount: number }`
- Tags: `[defi, price, monitoring, automated-trading]`

They CANNOT see:
- The SOP steps ("Step 1: Query eth-mcp for current MNT/USDC price...")
- Contract addresses or protocol-specific details
- Decision logic or error handling strategies

This means forking a spec-only skill gives you the WHAT but not the HOW — you'd need to independently figure out the implementation, which preserves the value of the paid API.

---

## 4. Revised Code Generation Safety Model

### 4.1 Defense-in-Depth Architecture

Replace the current regex-based validation (v3.0.0 Section 4.4) with a five-layer defense model:

```
┌───────────────────────────────────────────────────┐
│  Layer 5: Human-in-the-Loop                        │
│  User must confirm before any value-moving tx      │
├───────────────────────────────────────────────────┤
│  Layer 4: Transaction Simulation                    │
│  Dry-run on fork before real execution              │
├───────────────────────────────────────────────────┤
│  Layer 3: Runtime Sandbox                           │
│  isolated-vm / Worker Thread with resource limits   │
├───────────────────────────────────────────────────┤
│  Layer 2: Import Resolution                         │
│  Compile-time whitelist, bundled dependencies only  │
├───────────────────────────────────────────────────┤
│  Layer 1: AST Static Analysis                       │
│  TypeScript Compiler API, not regex                 │
└───────────────────────────────────────────────────┘
```

### 4.2 Layer 1: AST Static Analysis

Use the TypeScript Compiler API (`ts.createSourceFile`) to parse generated code into an AST, then walk the tree to enforce rules:

| Check | AST Node Type | Action |
|-------|---------------|--------|
| Forbidden imports | `ImportDeclaration` | Reject if module specifier not in whitelist |
| Dynamic imports | `CallExpression` where expression is `import` | Reject unconditionally |
| Global access | `PropertyAccessExpression` on `process`, `global`, `globalThis` | Reject |
| Eval patterns | `CallExpression` where callee is `eval` or `Function` | Reject |
| Prototype modification | `PropertyAccessExpression` on `.prototype` | Reject |
| Export validation | `ExportAssignment` or `ExportDeclaration` | Must export a Plugin-shaped object |

AST analysis catches obfuscation attempts (`process['e'+'nv']`) because it inspects the actual property access chain, not string patterns.

### 4.3 Layer 2: Import Resolution

At code generation time, resolve all imports against a compile-time whitelist:

**Allowed imports:**
- `@elizaos/core` (types only: `Plugin`, `Action`, `Provider`, `AgentRuntime`)
- `viem` (types only: `Address`, `Hash`, `Hex`)
- Platform-provided utility module: `@mantle-aaas/plugin-utils` (safe wrappers for common operations)

**Everything else is rejected before the code reaches the runtime.**

### 4.4 Layer 3: Runtime Sandbox

Generated plugins must run inside an isolated execution environment:

**Option A: `isolated-vm` (recommended for Stage 1)**
- Separate V8 isolate with its own heap
- Configurable memory limit (e.g., 128MB per agent)
- Configurable CPU time limit (e.g., 5 seconds per action execution)
- No access to Node.js APIs — only explicitly transferred references

**Option B: Worker Threads (recommended for Stage 2+)**
- Separate thread with `resourceLimits` (`maxOldGenerationSizeMb`, `maxYoungGenerationSizeMb`)
- Communication via `MessagePort` (structured clone, no shared state)
- Can be killed externally if unresponsive

**Either option eliminates:** prototype pollution, global state modification, event loop blocking, memory exhaustion affecting other agents.

### 4.5 Layer 4: Transaction Simulation

Before executing any on-chain transaction from generated code:

1. Fork the target chain state locally (via `viem`'s `createTestClient` with `mode: 'anvil'` or Tenderly simulation API)
2. Execute the transaction on the fork
3. Compare expected outcome vs actual outcome
4. If simulation succeeds: present the user with a summary ("This will swap 100 USDC for ~195 MNT with 0.5% slippage")
5. If simulation fails: reject the transaction and report the error

This catches business logic bugs (wrong contract address, incorrect calldata encoding, insufficient allowance) before real funds are at risk.

### 4.6 Layer 5: Human-in-the-Loop

For any operation that moves value (token transfers, swaps, contract calls with non-zero msg.value, approve calls):

1. Agent presents a plain-language summary of the intended action
2. Agent shows the simulation result (Layer 4)
3. User explicitly confirms ("Yes, execute this swap") or rejects
4. Only upon confirmation does the agent submit the real transaction

This is already partially implemented in the existing `mantle_chain_basics` system skill ("Always confirm with the user before executing transactions that cost gas"). The code generation system must enforce this as a hard constraint, not a suggestion.

### 4.7 AgentRuntimeAdapter

To decouple from ElizaOS and enable sandbox enforcement:

```typescript
interface AgentRuntimeAdapter {
  createRuntime(config: AgentRuntimeConfig): RuntimeHandle;
  destroyRuntime(handle: RuntimeHandle): Promise<void>;
  sendMessage(handle: RuntimeHandle, msg: ChatMessage): Promise<ChatResponse>;
  loadPlugin(handle: RuntimeHandle, plugin: SandboxedPlugin): Promise<void>;
  unloadPlugin(handle: RuntimeHandle, pluginName: string): Promise<void>;
  getStatus(handle: RuntimeHandle): RuntimeStatus;
  getMetrics(handle: RuntimeHandle): RuntimeMetrics;
}

interface RuntimeMetrics {
  memoryUsageMb: number;
  cpuTimeMs: number;
  activePlugins: string[];
  lastMessageAt: Date | null;
  uptime: number;
}
```

The `ElizaOSAdapter` implements this interface wrapping `AgentRuntime`. Future adapters could wrap other frameworks or a custom lightweight runtime.

### 4.8 Agent Communication Protocol (ACP)

Beyond the Marketplace's synchronous request-response, define four interaction patterns:

| Pattern | Initiator | Flow | Use Case |
|---------|-----------|------|----------|
| **Request-Response** | Agent A | A -> Gateway -> B -> Gateway -> A | Marketplace API calls |
| **Notification** | Agent A | A -> Gateway -> B (no response) | "MNT dropped below $0.50" |
| **Subscription** | Agent A | A registers interest -> B pushes events | Price alerts, status changes |
| **Task Delegation** | Agent A | A submits task -> B processes async -> A polls/gets callback | Long-running operations |

**MVP implementation (Phase 3+):**

Use a `messages` table in SQLite as a simple message queue:

```sql
CREATE TABLE IF NOT EXISTS agent_messages (
  id          TEXT PRIMARY KEY,
  from_agent  TEXT NOT NULL,
  to_agent    TEXT NOT NULL,
  type        TEXT NOT NULL,  -- 'request' | 'response' | 'notification' | 'event'
  ref_id      TEXT,           -- correlation ID for request-response pairs
  payload     TEXT NOT NULL,  -- JSON
  status      TEXT DEFAULT 'pending',  -- 'pending' | 'delivered' | 'processed' | 'failed'
  created_at  TEXT DEFAULT (datetime('now')),
  expires_at  TEXT,
  FOREIGN KEY (from_agent) REFERENCES agents(id),
  FOREIGN KEY (to_agent) REFERENCES agents(id)
);
```

The Gateway polls this table and routes messages to running agent runtimes. In later phases, this can be replaced by a proper message broker (Redis Streams, NATS, etc.) without changing the agent-facing API.

---

## 5. System Skills Expansion

System skills are always injected into every agent's knowledge base, hidden from the Builder UI. They provide foundational context that all agents need regardless of configuration.

### 5.1 Existing System Skills

| Skill | File | Purpose | Assessment |
|-------|------|---------|------------|
| `mantle_chain_basics` | `_system/mantle_chain_basics.md` | Chain IDs, RPC URLs, MNT gas, explorer links, default-to-testnet rule | **Adequate.** Covers essentials. Consider adding MNT faucet info for testnet. |
| `tool_usage_guide` | `_system/tool_usage_guide.md` | Maps task types to tools (EVM plugin, eth-mcp, ENS, Blockscout) | **Adequate.** Could add priority/fallback logic for when a tool is unavailable. |
| `skills-creator` | `_system/skills-creator/SKILL.md` | Meta-skill for creating new skills from natural language | **Adequate for skill creation.** Needs adaptation for v3.0.0 where skills become specs (add guidance on writing interface schemas, not just SOPs). |

### 5.2 Must-Add System Skills

#### 5.2.1 `security_best_practices`

**Priority:** Must-have
**Rationale:** Every agent handles wallets and on-chain transactions. Without explicit security guidance injected into every agent, the LLM will fall back on generic knowledge that may be outdated or incorrect for Mantle-specific scenarios.

**Content Outline:**

```markdown
# Security Best Practices for Mantle Agents

## Transaction Confirmation Protocol
- NEVER execute a value-moving transaction without explicit user confirmation
- Present: action summary, estimated gas cost (MNT), target address, value
- Wait for "yes" / "confirm" / explicit approval before signing
- If user says "do it" without seeing the summary, show summary first

## Gas Estimation
- Always call estimateGas() before presenting cost to user
- Add 20% buffer to gas estimate for safety
- If gas estimate exceeds 0.1 MNT, warn the user explicitly
- If gas estimate fails, do NOT proceed — report the error

## Token Approval Risks
- WARN the user when approving unlimited allowance (type(uint256).max)
- Recommend exact-amount approvals over unlimited
- List the spender address and explain what contract is being approved
- Check existing allowance before requesting new approval

## Common Scam Patterns
- Never interact with unverified contracts without user acknowledgment
- Warn if a token contract has: no verified source, recently deployed (<24h), honeypot patterns
- Never send private keys, seed phrases, or encrypted key material in chat
- Never call arbitrary contract functions from user-pasted calldata without decoding first

## Address Verification
- Always display full addresses (not truncated) for transaction targets
- Cross-reference addresses with Blockscout for contract verification status
- Warn if sending to a contract address vs EOA when the user likely means the other

## Private Key Handling
- NEVER log, display, or transmit the agent's private key
- NEVER include private key material in LLM prompts or chat responses
- Access private key ONLY through runtime.getSetting('EVM_PRIVATE_KEY')
```

#### 5.2.2 `error_handling_patterns`

**Priority:** Must-have
**Rationale:** Agents will encounter transaction failures, RPC errors, and tool unavailability. Without standardized error handling, each agent invents its own (often poor) error reporting.

**Content Outline:**

```markdown
# Error Handling Patterns

## Transaction Failures
- If tx reverts: decode the revert reason, explain it in plain language, suggest fix
- If tx is stuck (pending > 2 min): suggest replacement tx with higher gas
- If nonce error: fetch current nonce from chain, retry with correct nonce
- If insufficient balance: show current balance, required amount, deficit

## RPC Failures
- Primary RPC: https://rpc.mantle.xyz (mainnet), https://rpc.sepolia.mantle.xyz (testnet)
- If primary fails: retry once after 2 seconds
- If retry fails: report RPC unavailability, suggest user try again later
- NEVER silently swallow RPC errors

## Tool Unavailability
- If an MCP server (eth-mcp, ENS, Blockscout) is unreachable:
  1. Report which tool is unavailable
  2. Suggest alternative approaches (e.g., use on-chain calls instead of Blockscout)
  3. Do not fabricate data that would have come from the unavailable tool

## User-Facing Error Messages
- Always include: what went wrong, why it likely happened, what the user can do
- Include tx hash and explorer link if a transaction was involved
- Never show raw stack traces or internal error objects
- Use consistent format: "[Error] {summary}\n{detail}\n{suggested action}"

## Retry Strategy
- Idempotent operations (reads, balance checks): retry up to 3 times with exponential backoff
- Non-idempotent operations (transfers, deploys): NEVER auto-retry — ask user
- Rate-limited responses (429): wait the indicated retry-after period
```

#### 5.2.3 `output_formatting`

**Priority:** Must-have
**Rationale:** Agents produce responses containing addresses, tx hashes, balances, and explorer links. Without a consistent format, the user experience varies wildly between agents. This skill standardizes presentation.

**Content Outline:**

```markdown
# Output Formatting Standards

## Addresses
- Always show full address: 0x742d35Cc6634C0532925a3b844Bc9e7595f44e
- Include explorer link: [0x742d...f44e](https://sepolia.mantlescan.xyz/address/0x742d35Cc6634C0532925a3b844Bc9e7595f44e)
- Label known addresses: "Your wallet", "USDC contract", "Agent wallet"

## Transaction Hashes
- Always provide explorer link immediately after tx submission
- Format: "Transaction submitted: [0xabc...def](https://sepolia.mantlescan.xyz/tx/0xabc...def)"
- After confirmation: "Transaction confirmed in block {number} ({confirmations} confirmations)"

## Token Balances
- Always include symbol: "15.3 MNT" not "15.3"
- For amounts > 1M: use comma separators: "1,500,000 MNTC"
- For amounts < 0.001: use scientific notation or indicate "< 0.001"
- Always specify which chain: "(on Mantle Sepolia)"

## Confirmation Prompts
- Standard format for value-moving operations:
  "I'm about to {action}:
   - From: {source}
   - To: {destination}
   - Amount: {amount} {token}
   - Estimated gas: {gas} MNT
   - Network: {chain}
   Confirm? (yes/no)"

## Error Display
- Format: "[Error] {one-line summary}
   Details: {explanation}
   Suggestion: {what user can do next}"
```

### 5.3 Recommended System Skills

#### 5.3.1 `on_chain_data_interpretation`

**Priority:** Recommended
**Rationale:** Agents frequently need to decode on-chain data (event logs, calldata, contract state) but LLMs often hallucinate ABI encodings. This skill provides correct patterns.

**Content Outline:**

```markdown
# On-Chain Data Interpretation

## Event Log Decoding
- Use Blockscout MCP to fetch transaction logs
- Match topic[0] against known event signatures
- Decode indexed vs non-indexed parameters
- Common events: Transfer(address,address,uint256), Approval(address,address,uint256)

## Calldata Decoding
- First 4 bytes = function selector (keccak256 of function signature)
- Remaining bytes = ABI-encoded parameters
- Use Blockscout's contract ABI to decode if contract is verified
- Common selectors: 0xa9059cbb (transfer), 0x095ea7b3 (approve)

## Contract State Reading
- Use plugin-evm for direct contract calls (view/pure functions)
- Use Blockscout MCP for historical state and event history
- Common reads: balanceOf, allowance, totalSupply, owner, name, symbol, decimals

## Block Data
- Use Blockscout MCP for block details
- Mantle block time: ~2 seconds
- Finality: ~15 minutes (L1 confirmation)
```

#### 5.3.2 `gas_optimization`

**Priority:** Recommended
**Rationale:** MNT gas costs on Mantle are low but not zero. Agents that batch operations or time transactions can save users meaningful amounts at scale.

**Content Outline:**

```markdown
# Gas Optimization on Mantle

## Estimation
- Always estimate before execution: viem.estimateGas()
- Add 20% buffer for safety margin
- Cache gas prices for 30 seconds to avoid redundant RPC calls

## Batching Strategies
- For multiple token transfers: use multicall contract where available
- For approve + swap: check existing allowance first, skip approve if sufficient
- Group read operations: use multicall for batch balanceOf/allowance checks

## Transaction Timing
- Mantle L2 gas prices are relatively stable (not affected by Ethereum base fee directly)
- For non-urgent transactions: no need to time — gas variance is minimal
- For urgent transactions: use the current gas price without discount

## Cost Communication
- Always show estimated gas cost before execution
- For recurring operations: show cumulative cost estimate
- Compare cost to Ethereum mainnet equivalent when relevant (user education)
```

---

## 6. Base Skills Expansion

Base skills are shown in the Builder UI as opt-in checkboxes at agent creation time. They represent stable, well-tested capabilities that the platform curates for common use cases.

### 6.1 Existing Base Skills

| Skill | File | Purpose | Assessment |
|-------|------|---------|------------|
| `asset_deploy` | `base/asset_deploy.md` | ERC-20/721 deployment on Mantle | **Good.** Detailed parameter tables, trigger patterns, post-deploy ops. Add ERC-1155 and ERC-4626 when contracts are ready. |
| `social_apps_integration_base` | `base/social_apps_integration_base.md` | Telegram + Discord bot integration | **Good structure** but references `social_telegram` and `social_discord` deep-dive files that are currently empty. Must complete those or inline the content. |
| `mantle_8004_base` | `base/mantle_8004_base.md` | ERC-8004 Trustless Agents (Identity, Reputation, Validation) | **Excellent.** Most complete skill in the catalog. Full Solidity interfaces, workflows, examples. |

### 6.2 Must-Add Base Skills

#### 6.2.1 `defi_swap`

**Priority:** Must-have
**Rationale:** Token swapping is the most fundamental DeFi operation. Users expect their agents to trade tokens without manual DEX interaction.

**Content Outline:**

```markdown
# DEX Trading on Mantle

## Supported DEXes
| DEX | Type | Router Address (Mainnet) | Router Address (Sepolia) |
|-----|------|-------------------------|-------------------------|
| Agni Finance | UniV3-style concentrated liquidity | 0x... | 0x... |
| FusionX | UniV2-style AMM | 0x... | 0x... |
| Merchant Moe | Liquidity Book (variable bin widths) | 0x... | 0x... |
| iZiSwap | Discretized concentrated liquidity | 0x... | 0x... |

## Swap Workflow (SOP)
1. Identify token pair (input token, output token)
2. Check input token balance (plugin-evm)
3. If input token is not MNT: check and set approval for DEX router
4. Query quotes from available DEXes (eth-mcp or direct router call)
5. Compare quotes: select best rate after accounting for gas
6. Present swap summary to user (input, output, rate, slippage, gas)
7. On confirmation: execute swap via plugin-evm
8. Report result: tx hash, actual output amount, explorer link

## Slippage Control
- Default slippage tolerance: 0.5%
- User can specify: "swap with 1% slippage"
- If price impact > 5%: warn user, suggest smaller trade or different route
- If price impact > 15%: refuse execution, explain why

## Token Address Resolution
- Use eth-mcp to look up token addresses by symbol
- Common Mantle tokens: MNT, USDC, USDT, WETH, mETH, cmETH
- If token not found: ask user for contract address

## Approval Management
- Check existing allowance before requesting new approval
- Use exact amount approval (not unlimited) by default
- If user requests unlimited: warn about risks (ref: security_best_practices)
```

#### 6.2.2 `defi_yield`

**Priority:** Must-have
**Rationale:** Yield farming and staking are key DeFi activities on Mantle. The mETH/cmETH staking ecosystem is a major differentiator.

**Content Outline:**

```markdown
# Yield Optimization on Mantle

## Yield Sources
| Source | Type | Asset | Typical APY Range | Risk Level |
|--------|------|-------|-------------------|------------|
| mETH staking | Liquid staking | ETH -> mETH | 3-5% | Low |
| cmETH | Restaking receipt | mETH -> cmETH | 5-8% | Medium |
| Agni LP | Concentrated liquidity | Various pairs | 10-50% | High (IL risk) |
| Merchant Moe LP | Liquidity Book | Various pairs | 5-30% | High (IL risk) |
| Lendle | Lending/borrowing | Various | 2-10% supply | Low-Medium |

## Yield Discovery Workflow
1. Query current yields from eth-mcp (DeFi yields tool)
2. Filter by: asset type, risk tolerance, minimum APY
3. Present ranked opportunities with risk assessment
4. On selection: guide through deposit workflow

## Staking Workflow (mETH)
1. Check user's ETH balance on Mantle
2. Explain: staking ETH -> mETH via Mantle LSP
3. Present current exchange rate and APY
4. On confirmation: execute staking transaction
5. Report mETH received, explorer link

## LP Position Management
- Entering LP: approve tokens, add liquidity, receive LP token/NFT
- Monitoring: check position value, accrued fees, impermanent loss
- Exiting: remove liquidity, receive underlying tokens

## Risk Assessment
- Always disclose: impermanent loss risk for LP positions
- Always disclose: smart contract risk (audited vs unaudited)
- Always disclose: APY is variable and historical, not guaranteed
- Rate risk: Low (staking) / Medium (lending) / High (LP farming)
```

#### 6.2.3 `price_monitoring`

**Priority:** Must-have
**Rationale:** Price monitoring is a prerequisite for automated trading strategies, alerts, and portfolio management. Users explicitly requested this in DESIGN.md ("监控 MNT 价格").

**Content Outline:**

```markdown
# Token Price Monitoring

## Data Sources
| Source | Method | Refresh Rate | Coverage |
|--------|--------|-------------|----------|
| eth-mcp | MCP tool call | On-demand | Major tokens |
| DEX quotes | Direct router query | On-demand | Any traded pair |
| On-chain oracle | Contract read (if available) | Per-block | Selected pairs |

## Monitoring Workflow
1. User specifies: token, threshold, direction (above/below), action
2. Agent stores monitoring config in memory
3. Agent periodically checks price (configurable interval, default 60s)
4. On threshold breach: execute action (alert, buy, sell)
5. Report action result to user

## Alert Actions
| Action | Trigger | Behavior |
|--------|---------|----------|
| alert | Price crosses threshold | Notify via chat (and social if configured) |
| buy | Price drops below threshold | Execute swap (with user confirmation if first time) |
| sell | Price rises above threshold | Execute swap (with user confirmation if first time) |
| report | Periodic | Send price summary at configured interval |

## Configuration
- Polling interval: minimum 30 seconds, default 60 seconds
- Multiple monitors can run concurrently
- Persistent across agent restarts (store in agent memory/DB)
- Social channel routing: forward alerts to Telegram/Discord if social_apps skill is active

## Limitations
- Polling-based, not event-driven (no websocket price feeds in current tool stack)
- Price accuracy depends on DEX liquidity depth
- Latency: 30-60 seconds between price change and detection
```

#### 6.2.4 `token_management`

**Priority:** Must-have
**Rationale:** Basic token operations (check balance, transfer, manage approvals) are needed by nearly every agent but are currently spread across `tool_usage_guide` and `asset_deploy` without a dedicated skill.

**Content Outline:**

```markdown
# Token Management

## Balance Queries
- Native MNT: use MANTLE_CHAIN_PROVIDER or plugin-evm
- ERC-20 tokens: call balanceOf(agentWallet) via plugin-evm
- Batch check: use multicall for multiple tokens in one RPC call
- Display format: "{amount} {SYMBOL} (on {chain})"

## Token Transfers
- MNT: use plugin-evm TRANSFER action
- ERC-20: use plugin-evm TRANSFER action with token address
- Always verify: recipient address, amount, token, chain
- Always confirm with user before execution

## Approval Management
- Check allowance: call allowance(owner, spender) via plugin-evm
- Set approval: call approve(spender, amount) via plugin-evm
- Revoke approval: call approve(spender, 0)
- List active approvals: query Approval events from Blockscout

## Token Metadata
- Lookup by symbol: use eth-mcp token address tools
- Read metadata: name(), symbol(), decimals(), totalSupply() via plugin-evm
- Verify token: check contract verification status on Blockscout
- Warn if: unverified contract, recently deployed, no liquidity

## Multi-Token Portfolio View
- Aggregate balances across configured tokens
- Present as sorted table: Symbol, Balance, USD Value (if price available)
- Highlight tokens with zero balance (cleanup suggestions)
```

### 6.3 Recommended Base Skills

#### 6.3.1 `nft_operations`

**Priority:** Recommended
**Rationale:** Extends `asset_deploy` with post-deployment NFT operations. The current `asset_deploy` skill deploys ERC-721 but doesn't cover minting, metadata, or marketplace interactions.

**Key Content:**
- Batch minting workflow (mint multiple NFTs in sequence)
- Metadata management: set tokenURI, update base URI
- Transfer and approval flows for NFTs
- Marketplace listing (if Mantle NFT marketplaces emerge)
- Royalty configuration (ERC-2981)

#### 6.3.2 `cross_chain_bridge`

**Priority:** Recommended
**Rationale:** Users need to move assets between Ethereum and Mantle. The official Mantle Bridge is the primary mechanism.

**Key Content:**
- Official Mantle Bridge contract addresses and workflow
- Deposit flow (L1 -> L2): expected time (~10 minutes)
- Withdrawal flow (L2 -> L1): expected time (~7 days challenge period)
- Bridge fee estimation
- Transaction tracking across chains
- Third-party bridge options (Orbiter, Stargate) for faster withdrawals

#### 6.3.3 `governance_voting`

**Priority:** Recommended
**Rationale:** Mantle has on-chain governance. Agents should be able to participate in DAO voting on behalf of users.

**Key Content:**
- Governance contract addresses (Mantle Governor)
- Proposal discovery: list active proposals, read descriptions
- Voting workflow: delegate -> vote (for/against/abstain)
- Delegation management: delegate to self or to another address
- Proposal creation (if agent has sufficient voting power)

#### 6.3.4 `portfolio_tracker`

**Priority:** Recommended
**Rationale:** Users want a holistic view of their agent's holdings and performance.

**Key Content:**
- Multi-token balance aggregation
- USD value calculation (via DEX quotes or eth-mcp)
- Historical tracking: record balances at intervals, compute PnL
- Position breakdown: liquid vs staked vs LP
- Periodic reports: daily/weekly summaries via chat or social channels

#### 6.3.5 `scheduled_tasks`

**Priority:** Recommended
**Rationale:** Many agent behaviors require periodic execution (price checks, rebalancing, reporting). Currently there is no skill guiding agents on how to handle recurring tasks.

**Key Content:**
- Timer-based scheduling: "every N minutes/hours/days"
- Condition-based scheduling: "when X happens, do Y"
- Task persistence across agent restarts
- Conflict resolution: what happens when two scheduled tasks overlap
- Resource budgeting: limit total scheduled tasks per agent

### 6.4 Nice-to-Have Base Skills

#### 6.4.1 `contract_interaction`

Generic read/write interaction with any verified contract via ABI. Covers: fetching ABI from Blockscout, encoding calldata, executing calls, decoding results.

#### 6.4.2 `airdrop_management`

Token distribution workflows: merkle tree generation, airdrop contract deployment, claim page setup, batch claiming.

#### 6.4.3 `dapp_launcher`

Simple dApp scaffolding: generate a frontend that interacts with the agent's deployed contracts. As mentioned in DESIGN.md Advanced examples ("设计并开发类似于 fomo3d 的游戏给 agents 玩").

### 6.5 Skills Catalog Summary

| Tier | Skill | Priority | Status |
|------|-------|----------|--------|
| System | `mantle_chain_basics` | Existing | Done |
| System | `tool_usage_guide` | Existing | Done |
| System | `skills-creator` | Existing | Done |
| System | `security_best_practices` | Must-add | Phase 1 |
| System | `error_handling_patterns` | Must-add | Phase 1 |
| System | `output_formatting` | Must-add | Phase 1 |
| System | `on_chain_data_interpretation` | Recommended | Phase 2 |
| System | `gas_optimization` | Recommended | Phase 2 |
| Base | `asset_deploy` | Existing | Done |
| Base | `social_apps_integration_base` | Existing | Needs deep-dive completion |
| Base | `mantle_8004_base` | Existing | Done |
| Base | `defi_swap` | Must-add | Phase 1 |
| Base | `defi_yield` | Must-add | Phase 1 |
| Base | `price_monitoring` | Must-add | Phase 1 |
| Base | `token_management` | Must-add | Phase 1 |
| Base | `nft_operations` | Recommended | Phase 2 |
| Base | `cross_chain_bridge` | Recommended | Phase 2 |
| Base | `governance_voting` | Recommended | Phase 2 |
| Base | `portfolio_tracker` | Recommended | Phase 2 |
| Base | `scheduled_tasks` | Recommended | Phase 2 |
| Base | `contract_interaction` | Nice-to-have | Phase 3+ |
| Base | `airdrop_management` | Nice-to-have | Phase 3+ |
| Base | `dapp_launcher` | Nice-to-have | Phase 3+ |

---

## 7. Phased Implementation Roadmap

### 7.0 Phase Dependencies

```
Phase 0 ──► Phase 1 ──► Phase 2 ──► Phase 3
(Docs)      (Foundation)  (Skill     (Marketplace
                          Economy)    MVP)
                            │
                            ▼
                         Phase 4 ──► Phase 5
                         (Sandboxed   (Runtime
                          CodeGen)     Isolation)
                                        │
                                        ▼
                                     Phase 6
                                     (Financial
                                      Branch)
```

Phase 4 depends on Phase 2 (skills-creator must work before code generation). Phase 5 depends on Phase 4 (need generated code before runtime isolation matters). Phase 6 depends on Phase 3 (marketplace must exist before financial features make sense). Phases 0-3 are strictly sequential. Phases 4-5 can run in parallel with Phase 3's later stages.

---

### Phase 0: Documentation Alignment

**Duration:** 1 week
**Goal:** Establish a single source of truth by reconciling all three design documents.

**TODO:**
- [ ] Deprecate "Advanced" tier in DESIGN.md, replace with Service/Private explanation
- [ ] Align DESIGN.md skill tier model with the 4-tier model defined in this review (Section 3)
- [ ] Move "Asset issuance + bonding curve" from DESIGN.md Key Features to a "Financial Branch" section marked as Phase 6
- [ ] Update GATEWAY.md Section 4.2 to reference the unified tier model
- [ ] Update v3.0.0 refactoring doc to note that code generation is deferred to Phase 4 with the revised safety model (Section 4)
- [ ] Add cross-references between all three docs so readers know the reading order: DESIGN.md (vision) -> this review (spec) -> GATEWAY.md (implementation detail)
- [ ] Complete the empty `social_telegram.md` and `social_discord.md` files referenced by `social_apps_integration_base.md`, or inline their content

**Acceptance Criteria:**
- No contradictions between DESIGN.md, GATEWAY.md, and v3.0.0 refactoring
- Every capability is assigned to exactly one skill tier
- Every feature is assigned to exactly one phase
- All referenced files exist and are non-empty

---

### Phase 1: Foundation Hardening

**Duration:** 3 weeks
**Goal:** Complete the Hands & Manuals Gateway with expanded skills, without code generation.
**Depends on:** Phase 0

**TODO — System Skills (Week 1):**
- [ ] Write `skills/_system/security_best_practices.md` following outline in Section 5.2.1
- [ ] Write `skills/_system/error_handling_patterns.md` following outline in Section 5.2.2
- [ ] Write `skills/_system/output_formatting.md` following outline in Section 5.2.3
- [ ] Update `skills/_system/mantle_chain_basics.md`: add MNT faucet info for Sepolia
- [ ] Update `skills/_system/tool_usage_guide.md`: add fallback logic for unavailable tools

**TODO — Base Skills (Week 2):**
- [ ] Write `skills/base/defi_swap.md` following outline in Section 6.2.1 — requires research on current Mantle DEX router addresses
- [ ] Write `skills/base/defi_yield.md` following outline in Section 6.2.2 — requires research on current Mantle yield sources and APYs
- [ ] Write `skills/base/price_monitoring.md` following outline in Section 6.2.3
- [ ] Write `skills/base/token_management.md` following outline in Section 6.2.4
- [ ] Complete `skills/base/social_telegram.md` deep-dive (currently empty)
- [ ] Complete `skills/base/social_discord.md` deep-dive (currently empty)

**TODO — SkillRegistry Hybrid Storage (Week 3):**
- [ ] Add `skills` table migration to `src/db/index.ts` (schema per v3.0.0 Section 3.2)
- [ ] Add skills CRUD methods to `src/db/repository.ts`
- [ ] Refactor `src/core/skill-registry.ts` to merge filesystem + DB queries
- [ ] Add `POST /api/skills` endpoint to `src/server/routes/skills.ts`
- [ ] Add `PATCH /api/skills/:id` and `DELETE /api/skills/:id` endpoints
- [ ] Add `GET /api/agents/:id/skills` endpoint for agent skill listing
- [ ] Add `SkillRecord` type to `src/shared/types.ts`

**TODO — Infrastructure:**
- [ ] Add per-agent execution timeout wrapper to AgentManager (AbortController-based)
- [ ] Add memory usage monitoring (periodic `process.memoryUsage()` sampling)
- [ ] Add agent heartbeat check (detect unresponsive runtimes, auto-restart)

**Acceptance Criteria:**
- All must-add system and base skills written and passing frontmatter validation
- `GET /api/skills` returns both filesystem and DB skills
- `POST /api/skills` creates a new skill in DB
- Agent creation with new base skills works end-to-end
- Agent runtime has timeout protection (configurable, default 30s per action)
- Memory monitoring logs warnings when process exceeds 80% of configured limit

---

### Phase 2: Skill Economy

**Duration:** 3 weeks
**Goal:** Users can create custom skills via natural language, share them, and manage visibility.
**Depends on:** Phase 1

**TODO — Skills Creator Integration (Week 1):**
- [ ] Adapt `skills-creator` SKILL.md to guide agents in writing spec-format skills (interface schemas, not just SOPs)
- [ ] Implement skill creation flow: user describes need -> agent calls skills-creator -> agent generates skill Markdown -> validation -> store in DB
- [ ] Add Skill safety validation pipeline (static rules, frontmatter completeness, audit LLM review)
- [ ] Wire `POST /api/skills` to the creation flow with validation

**TODO — Skill Visibility Model (Week 2):**
- [ ] Add `visibility` field to `skills` table: 'spec-only' | 'full' | 'private'
- [ ] Implement spec-only rendering: return only name, description, tags, interface schema for spec-only skills
- [ ] Update `GET /api/skills/:id` to respect visibility (hide body for spec-only when requester is not author)
- [ ] Update Agent detail page to show skills with correct visibility
- [ ] Implement skill promotion: private -> service (change visibility + tier)

**TODO — Skill Sharing & Fork (Week 3):**
- [ ] Implement `POST /api/skills/:id/fork` — creates a copy in the forker's private tier
- [ ] Add `fork_of` field tracking to skill records
- [ ] Implement Agent homepage skills section: list skills used by agent, link to public skill details
- [ ] Add usage statistics: count how many agents use each skill
- [ ] Write recommended system skills: `on_chain_data_interpretation`, `gas_optimization`
- [ ] Write recommended base skills: `nft_operations`, `cross_chain_bridge`, `governance_voting`, `portfolio_tracker`, `scheduled_tasks`

**Acceptance Criteria:**
- User can describe a capability in natural language and get a validated skill stored in DB
- Spec-only skills hide implementation details from non-authors
- Fork creates an independent copy with `fork_of` reference
- Agent homepage shows public skills correctly
- All recommended skills written and validated

---

### Phase 3: Marketplace MVP

**Duration:** 3 weeks
**Goal:** Agents can register APIs, other agents can discover and call them.
**Depends on:** Phase 2

**TODO — API Registry (Week 1):**
- [ ] Add `marketplace_apis` table migration (schema per v3.0.0 Section 5.2)
- [ ] Add `agent_messages` table migration (schema per Section 4.8 of this review)
- [ ] Implement Marketplace service (`src/core/marketplace.ts`): register, search, invoke
- [ ] Add `POST /api/marketplace/apis` — register an API
- [ ] Add `GET /api/marketplace/apis` — list/search with `?q=` NL search via FTS5
- [ ] Add `GET /api/marketplace/apis/:id` — detail including linked skills

**TODO — API Invocation (Week 2):**
- [ ] Add `POST /api/marketplace/apis/:id/invoke` — Gateway proxy that routes to target agent
- [ ] Implement request validation: check API status, caller identity
- [ ] Implement response wrapping: standardize return format, mark as UNTRUSTED
- [ ] Add rate limiting: per-caller, per-API configurable limits
- [ ] Add call counting: increment `call_count` on each successful invocation

**TODO — MARKETPLACE_SEARCH Action (Week 3):**
- [ ] Implement `MARKETPLACE_SEARCH` ElizaOS Action (per v3.0.0 Section 5.6)
- [ ] Inject MARKETPLACE_SEARCH into all agent runtimes via CharacterFactory
- [ ] Implement intent extraction: agent determines when it cannot fulfill a request and searches marketplace
- [ ] Implement result ranking: relevance score based on description match, call count, rating
- [ ] Define payment model specification document (escrow, dispute, refund — defer implementation to Phase 6)

**TODO — Frontend:**
- [ ] Add Marketplace page (`/marketplace`): search bar, API card grid, filters
- [ ] Add API detail modal: schema, pricing, linked skills, call count
- [ ] Update Agent detail page: add "Published APIs" section

**Acceptance Criteria:**
- Agent can register an API via `POST /api/marketplace/apis`
- NL search returns relevant APIs (`GET /api/marketplace/apis?q=...`)
- API invocation proxies correctly through Gateway to target agent
- MARKETPLACE_SEARCH action triggers when agent cannot fulfill a request
- Rate limiting prevents abuse (configurable per-API)
- Frontend Marketplace page functional with search and browse

---

### Phase 4: Sandboxed Code Generation

**Duration:** 4 weeks
**Goal:** Agents can generate TypeScript code from skill specs, running safely in sandboxed isolation.
**Depends on:** Phase 2

**TODO — AST Validation (Week 1):**
- [ ] Implement `src/core/code-validator.ts` using TypeScript Compiler API (not regex)
- [ ] Implement forbidden pattern detection via AST walk (Section 4.2 of this review)
- [ ] Implement import whitelist enforcement at AST level
- [ ] Implement export shape validation (must export Plugin-conformant object)
- [ ] Write test suite: 20+ test cases covering bypass attempts

**TODO — Runtime Sandbox (Week 2):**
- [ ] Evaluate and select sandbox approach: `isolated-vm` vs Worker Threads
- [ ] Implement sandbox wrapper: execute generated plugin in isolated context
- [ ] Implement resource limits: memory (128MB), CPU time (5s per action), execution timeout
- [ ] Implement communication bridge: sandbox <-> main process via message passing
- [ ] Implement crash isolation: sandbox crash does not affect main process

**TODO — Code Generation Pipeline (Week 3):**
- [ ] Implement `src/core/code-generator.ts`: LLM prompt construction, code extraction, validation loop
- [ ] Implement ElizaOS plugin template injection (per v3.0.0 Section 4.3)
- [ ] Implement `src/core/agent-workspace.ts`: materialize, cleanup, destroy
- [ ] Add `agent_plugins` table migration (schema per v3.0.0 Section 4.7)
- [ ] Wire `POST /api/agents/:id/plugins` to trigger code generation
- [ ] Implement retry logic: if validation fails, re-prompt LLM with error feedback (max 3 attempts)

**TODO — Transaction Simulation (Week 4):**
- [ ] Implement transaction dry-run via viem fork mode or Tenderly API
- [ ] Add simulation step before all value-moving operations from generated code
- [ ] Implement simulation result presentation: expected outcome, gas cost, risk flags
- [ ] Update AgentManager.start() to load validated plugins from DB + sandbox
- [ ] Update AgentManager.stop() to clean up workspaces
- [ ] Update DELETE flow to cascade-delete plugins and workspaces

**Acceptance Criteria:**
- AST validator catches all bypass patterns from Section 4.2 (test suite passes)
- Generated code runs in sandbox with enforced resource limits
- Sandbox crash does not affect other agents or the main process
- Code generation succeeds for at least 3 reference skills (defi_swap, price_monitoring, token_management)
- Transaction simulation catches common errors (insufficient balance, wrong address, excessive slippage)
- Full lifecycle works: generate -> validate -> sandbox -> load -> execute -> unload

---

### Phase 5: Runtime Isolation & Scale

**Duration:** 4 weeks
**Goal:** Each agent runs in its own Worker Thread with resource monitoring and auto-recovery.
**Depends on:** Phase 4

**TODO — Worker Thread Isolation (Weeks 1-2):**
- [ ] Implement `AgentRuntimeAdapter` interface (Section 4.7 of this review)
- [ ] Implement `ElizaOSAdapter` wrapping current `AgentRuntime` creation
- [ ] Refactor `AgentManager` to use `AgentRuntimeAdapter` instead of direct ElizaOS calls
- [ ] Implement Worker Thread-based runtime: each agent in its own thread
- [ ] Implement IPC bridge: start/stop/chat/loadPlugin via MessagePort
- [ ] Configure per-thread resource limits: `resourceLimits.maxOldGenerationSizeMb`

**TODO — Monitoring & Recovery (Weeks 3-4):**
- [ ] Implement per-agent metrics collection (memory, CPU, message latency, plugin count)
- [ ] Implement health check: periodic ping, auto-restart on timeout
- [ ] Implement graceful degradation: if agent thread crashes, mark as `error`, preserve DB state
- [ ] Implement Agent Communication Protocol (ACP) per Section 4.8
- [ ] Add `agent_messages` table polling and routing
- [ ] Implement subscription pattern: agent A subscribes to agent B's events
- [ ] Load test: verify 50+ agents running concurrently without degradation

**Acceptance Criteria:**
- Each agent runs in its own Worker Thread with isolated memory
- Single agent crash does not affect other agents (verified by kill test)
- AgentRuntimeAdapter allows swapping ElizaOS for a mock in tests
- ACP supports request-response, notification, and subscription patterns
- 50 concurrent agents with 10 generated plugins each: no OOM, no deadlock, p99 message latency < 2s

---

### Phase 6: Financial Branch

**Duration:** 4+ weeks
**Goal:** Asset issuance, bonding curves, DEX integration, and x402 micropayments.
**Depends on:** Phase 3 (Marketplace) + Phase 5 (Isolation)

**TODO — Asset Issuance:**
- [ ] Implement bonding curve contract for agent token launch
- [ ] Implement automated DEX pool creation after token launch (fair launch)
- [ ] Add agent token management: track issued tokens, holder count, price

**TODO — Payment Integration:**
- [ ] Implement x402 payment verification middleware for Marketplace API calls
- [ ] Implement escrow contract: hold payment during API call, release on success
- [ ] Implement dispute flow: caller flags bad result, platform arbitrates
- [ ] Implement refund: automatic for API errors, manual review for quality disputes

**TODO — Reputation-Weighted Marketplace:**
- [ ] Integrate ERC-8004 Reputation Registry feedback into Marketplace ranking
- [ ] Implement quality score: weighted by caller reputation, recency, volume
- [ ] Display quality badges on Marketplace API cards

**Acceptance Criteria:**
- Agent can issue a token with bonding curve and auto-list on DEX
- Marketplace API calls can require payment via x402
- Payment is escrowed and released on successful completion
- Dispute resolution flow works end-to-end
- Marketplace search results are ranked by reputation score

---

## 8. Open Questions & Decision Points

These questions must be resolved before or during implementation. Each includes an impact assessment, the options considered, and a suggested default.

### 8.1 Code Generation LLM Selection

**Question:** Should generated code use the agent's own LLM (user-configured) or a platform-designated high-capability LLM?

| Option | Pros | Cons |
|--------|------|------|
| Agent's own LLM | Consistent with user's cost/performance choice; simpler architecture | User may pick a weak model; code quality varies wildly |
| Platform LLM (e.g., Claude, GPT-4) | Consistent code quality; easier to validate and test | Additional cost to platform or user; vendor lock-in |
| Hybrid: platform LLM for generation, agent's LLM for runtime | Best of both worlds | Two LLM configs to manage; higher complexity |

**Impact:** Code quality directly affects safety and user trust. A bad LLM choice leads to more validation failures, higher retry costs, and potential security vulnerabilities.

**Suggested Default:** Platform-designated LLM for code generation (currently Claude or GPT-4 class). The agent's configured LLM is used only for conversational reasoning and tool orchestration.

---

### 8.2 Hot Reload vs Restart for New Plugins

**Question:** When a new plugin is generated for a running agent, does the agent need to restart, or can plugins be hot-loaded?

| Option | Pros | Cons |
|--------|------|------|
| Restart required | Simpler, deterministic; clean state | Interrupts ongoing conversations; user downtime |
| Hot reload | Zero downtime; better UX | Complex; risk of memory leaks; hard to test |

**Impact:** Affects user experience during skill expansion. Frequent restarts are disruptive for agents with active users.

**Suggested Default:** Restart for Phase 4 (simplicity). Evaluate hot reload for Phase 5 when Worker Thread isolation makes it safer (terminate old thread, start new one with updated plugins).

---

### 8.3 Generated Code Size Limits

**Question:** What is the maximum allowed size for a single generated plugin?

| Limit | Rationale |
|-------|-----------|
| 200 lines | Forces decomposition; faster validation; lower LLM cost |
| 500 lines | Covers most use cases; original v3.0.0 suggestion |
| 1000 lines | Allows complex plugins; higher risk of bugs |

**Impact:** Larger plugins are harder to validate, more expensive to generate, and more likely to contain bugs. But overly strict limits force artificial decomposition.

**Suggested Default:** 500 lines hard limit. If a capability requires more, it should be split into multiple plugins that compose.

---

### 8.4 Marketplace Search: Keywords vs Semantic

**Question:** Is FTS5 keyword search sufficient for the Marketplace MVP, or do we need embedding-based semantic search from the start?

| Option | Pros | Cons |
|--------|------|------|
| FTS5 only | Zero additional infrastructure; fast; deterministic | Poor recall for semantic queries ("help me trade" won't match "DEX swap service") |
| FTS5 + synonym expansion | Better recall with minimal infra | Requires manual synonym mapping; doesn't scale |
| Embedding vectors (SQLite-vec or external) | Best semantic matching; scales naturally | Additional dependency; latency; embedding model cost |

**Impact:** Search quality directly determines whether agents can discover relevant APIs. Poor search = agents can't find what they need = Marketplace fails.

**Suggested Default:** FTS5 for Phase 3 MVP with enriched indexing (index skill tags, description, and a generated synonym list). Migrate to embedding vectors in Phase 5 when scale justifies the infrastructure.

---

### 8.5 Skill Fork and Upstream Tracking

**Question:** When a skill is forked, should the fork track upstream changes?

| Option | Pros | Cons |
|--------|------|------|
| No tracking | Simple; fork is independent | Forks become stale; no bug fix propagation |
| Notification only | Fork owner gets notified of upstream changes | Low effort; but notification fatigue risk |
| Auto-merge with conflict resolution | Forks stay current | Complex; merge conflicts in Markdown are awkward |

**Impact:** Affects the skill ecosystem health. Without any tracking, forks diverge permanently and the ecosystem fragments.

**Suggested Default:** Notification only. Record `fork_of` in the skill record. When the upstream skill is updated, notify fork owners. They decide whether to manually merge changes.

---

### 8.6 Multi-Chain Strategy

**Question:** The current design is Mantle-only. When and how should multi-chain support be introduced?

| Option | Pros | Cons |
|--------|------|------|
| Mantle-only forever | Maximum focus; simpler skills; no chain confusion | Limits addressable market; users with assets on other chains can't use them |
| Mantle + Ethereum L1 (Phase 5+) | Covers bridging use case; aligns with cross_chain_bridge skill | Two sets of contract addresses; chain selection complexity |
| EVM-generic (any chain) | Maximum flexibility | Explosion of skill variants; testing burden; hard to curate |

**Impact:** Chain support affects every skill (contract addresses, explorer links, RPC URLs, gas token). Adding a chain retroactively requires updating all existing skills.

**Suggested Default:** Mantle-only through Phase 4. Add Ethereum L1 support in Phase 5 (primarily for bridging). Defer EVM-generic to post-Phase 6 based on demand.

---

### 8.7 Agent Persistence Across Platform Restarts

**Question:** When the platform process restarts, should previously-running agents auto-start?

| Option | Pros | Cons |
|--------|------|------|
| Manual restart | Explicit; user controls costs; no surprise LLM bills | User must remember to restart; poor UX after platform updates |
| Auto-restart all `running` agents | Seamless; agents feel "always on" | Startup storm; high LLM cost if many agents; potential resource exhaustion |
| Auto-restart with staggered delay | Balanced; prevents startup storm | Slightly delayed availability; more complex |

**Impact:** Affects perceived reliability. Users expect "deployed" agents to be available. Manual restart contradicts the "always-on" AaaS value proposition.

**Suggested Default:** Auto-restart with staggered delay (100ms between agents). Agents marked `running` in DB are queued for restart on platform boot. Add a configurable max concurrent startups limit.

---

### 8.8 Data Retention and Agent Deletion

**Question:** When an agent is deleted, what data is retained?

| Data | Retain | Delete | Rationale |
|------|--------|--------|-----------|
| Agent record | | Delete | Core identity, no reason to keep |
| Wallet keys (encrypted) | | Delete | Security — no orphaned keys |
| Generated plugins | | Delete | Bound to agent lifecycle (v3.0.0 principle) |
| Skills created by agent | Retain (orphan) | | Skills may be forked/used by others |
| Marketplace APIs | | Deprecate (soft-delete) | Callers need to know API is gone, not 404 |
| Chat history | Retain 30 days | Delete after | Debugging and dispute resolution |
| Agent messages (ACP) | | Delete | No value without the agent |

**Suggested Default:** Implement as described above. Skills survive their creator (they may have forks and users). Marketplace APIs transition to `deprecated` status (not hard-deleted) so callers get a meaningful error instead of 404.

---

### 8.9 Summary of Decisions Needed

| # | Question | Suggested Default | Decision Owner | Decide By |
|---|----------|-------------------|----------------|-----------|
| 1 | Code generation LLM | Platform-designated | Platform architect | Phase 4 start |
| 2 | Hot reload vs restart | Restart (Phase 4), hot reload (Phase 5) | Platform architect | Phase 4 start |
| 3 | Code size limit | 500 lines | Platform architect | Phase 4 start |
| 4 | Search: keywords vs semantic | FTS5 for MVP, embeddings for Phase 5 | Product owner | Phase 3 start |
| 5 | Fork upstream tracking | Notification only | Product owner | Phase 2 start |
| 6 | Multi-chain strategy | Mantle-only through Phase 4 | Product owner + BD | Phase 5 planning |
| 7 | Auto-restart on platform boot | Yes, staggered with max concurrency | Platform architect | Phase 1 start |
| 8 | Data retention on delete | Skills retained, APIs deprecated, rest deleted | Platform architect | Phase 1 start |

---

## Appendix: Document Cross-Reference

| This Review Section | Related Existing Document | Relationship |
|--------------------|--------------------------|--------------|
| Section 2 (Critique) | All three docs | Identifies contradictions and gaps |
| Section 3 (Tier Model) | DESIGN.md Section "Skills 分级隔离设置", GATEWAY.md Section 4.2 | Supersedes both with unified model |
| Section 4 (Safety Model) | v3.0.0 Section 4.4, 6.1, 7.1 | Replaces regex validation with defense-in-depth |
| Section 5 (System Skills) | `skills/_system/` directory | Extends from 3 to 8 skills |
| Section 6 (Base Skills) | `skills/base/` directory | Extends from 3 to 14 skills |
| Section 7 (Roadmap) | v3.0.0 Section 11 (Phases A-F) | Replaces with revised 7-phase plan |
| Section 8 (Open Questions) | v3.0.0 Section 12 | Extends from 5 to 8 questions with suggested defaults |
