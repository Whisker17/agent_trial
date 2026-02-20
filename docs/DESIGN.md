# Mantle Agent Nexus (MAN): AaaS Platform DESIGN.md

## 1. Overview (项目愿景与定位)

Mantle Agent Nexus (MAN) 是 Mantle 网络上的下一代 **Agent-as-a-Service (AaaS)** 基础设施。本平台摒弃了传统的“硬编码黑盒 Agent”模式，开创性地提出了 **“可进化硅基社会”** 的理念。

平台为非开发者提供了一键部署 Web3 Agent 的极简体验；同时，通过底层的 **“Hands & Manuals (工具与说明书)”** 架构与 **“自进化机制 (Skill Creator)”**，Agent 能够根据自然语言指令自主编写并挂载新技能。结合 ERC-8004 TBA (代币绑定账户)、联合曲线发币 (Fair Launch) 以及基于 x402 协议的 Agent API Marketplace，MAN 将打造 Mantle 上首个**“功能创造价值，价值反哺资产”**的 AgentFi 自主经济体。

---

## 2. Core Architecture: The "Hands & Manuals" Model

平台彻底解耦了“执行能力”与“业务认知”：

* **Hands (底层工具 / 永远在线):** 由官方硬编码的 TypeScript 插件（如 `plugin-evm`, `MCP Clients`）。它们只提供原子级操作（如 `send_tx`, `get_balance`, `read_contract`），**绝对不包含任何业务逻辑**。
* **Manuals (认知技能 / Markdown 文件):** 也就是 Skills。这是一系列纯文本的 SOP（标准作业程序）或知识库文件，里面包含合约地址、调用步骤和业务判断逻辑。LLM 通过阅读 Manuals，才知道如何去调用 Hands。

---

## 3. The Dual-Track Skill System (双轨制技能隔离架构)

为了防御大模型幻觉和恶意 Prompt 注入，系统对 Skills 实行严格的分层沙盒隔离（类似操作系统的内核态与用户态）：

### 3.1 Tier 1: System Skills (内核态 / 核心基建)

* **属性:** 官方维护、绝对不可变 (Immutable)、只读 (Read-only)。
* **作用:** 封装 Mantle 上最核心、最敏感的基础业务（如 ERC-8004 基础注册、标准 ERC20 部署、底层跨链）。
* **YAML 定义示例 (`skills/_system/8004_base.md`):**
```yaml
---
id: mantle_8004_base
name: 8004 Identity Base
type: system
is_readonly: true
requires_tools: [plugin-evm]
---
# 8004 基础注册执行手册...

```



### 3.2 Tier 2/3: User & Marketplace Skills (用户态 / 动态扩展)

* **属性:** 动态生成、沙盒运行、高风险隔离。
* **作用:** 用户通过 `Skill Creator` 动态生成的业务逻辑（如“监控特定钱包并在推特嘲讽”），或发布在 Marketplace 上的收费服务。
* **YAML 定义示例 (`skills/dynamic/hub_8004_service.md`):**
```yaml
---
id: hub_8004_service
name: 8004 Proxy Registration Service
type: user_dynamic
owner_agent: "0xAgentAddress..."
depends_on: [mantle_8004_base] # 允许调用 System Skill 执行底层操作
fee_required: 100 HUB8004
---
# 代理注册收费业务逻辑...

```



---

## 4. Self-Evolution: The Skill Creator (自主进化机制)

系统内置一个基于 Anthropic Skill Creator 规范的 Meta-Skill（元技能）。

* **工作流:**
1. 用户在前端对话框输入：“帮我写一个技能，当 MNT 跌破 0.5 U 时，自动用我账上的 USDC 抄底，并收 1% 手续费作为你的协议收入。”
2. Agent 调用 `Skill Creator` 工具，理解 Mantle 的 DEX 工具包（Hands），并将上述意图翻译为符合格式的 Markdown 文件。
3. 系统后台校验该 Markdown 语法，将其存入 `skills/dynamic/` 并热更新注入到该 Agent 的上下文中。Agent 瞬间完成“自我升级”。



---

## 5. AgentFi & Tokenomics (资产发行与经济飞轮)

Agent 不是单纯的工具，而是有独立资产负债表的链上实体。

1. **ERC-8004 TBA 绑定:** 部署 Agent 即 Mint 一个 NFT，该 NFT 绑定一个独立的智能合约钱包。Agent 由此获得链上身份与资金控制权。
2. **公平发射 (Fair Launch):** 部署时可选择发行该 Agent 的原生代币（如 `AGENT_X`），在平台内置的 Bonding Curve（联合曲线）上开启早期无许可交易。
3. **DEX 自动迁移 (Graduation):** 曲线募资达到阈值（如 5000 MNT），底层工厂合约自动将资金池锁定并迁移至 Mantle 原生 DEX（如 Merchant Moe），实现深层流动性。
4. **价值反哺 (Buyback):** Agent 在后续提供服务中赚取的 MNT 或其他代币收入，其智能合约可设定一定比例自动回购并销毁 `AGENT_X`，为资产提供坚实的基本面支撑。

---

## 6. Agent API Marketplace (A2A 经济体)

为解决重复开发问题，平台提供去中心化的技能集市。

* **服务发现:** Agent 升级出有价值的新技能后，可将其包装为 `Extended Skill` 上架。
* **x402 微支付引擎:** Agent A 调用 Agent B 的能力时，通过 x402 协议建立微支付通道。
* **经典用例 (8004 Hub Agent):**
* **身份:** 一个专业提供 8004 代注册服务的 Agent。
* **内功 (System Skill):** 知道如何调用 `mantle_8004_base`。
* **外功 (Marketplace Skill):** 暴露一个 API。其他 Agent 请求时，必须先向 Hub Agent 的 TBA 钱包支付 100 个其发行的专属代币。确认收款后，Hub Agent 消耗自己的 Gas 帮客户完成链上注册。
