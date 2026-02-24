---
name: social_apps_integration_base
description: Unified Telegram and Discord integration for agent control, notifications, and community operations. Use when users want social app access without choosing a single platform first.
version: 1.0.0
author: mantle-aaas
tags: [social, telegram, discord, bot, integration, notifications, community]
requires_tools: [telegram-mcp, discord-mcp]
arguments:
  platforms:
    description: telegram | discord | both (default both)
    required: false
  notifications:
    description: notification scope, e.g. transactions,status,alerts (default all)
    required: false
  access_policy:
    description: allowed chat IDs, guild IDs, and role constraints
    required: false
---

# Social Apps Integration (Telegram + Discord)

Unified social integration for Mantle agents across Telegram and Discord.

This is a **base skill** (located in `skills/base/`) so it appears in the default selectable skill list in Agent Wizard.

## Default Behavior

If the user asks to "add social integration" but does not specify a platform:

- Integrate **both Telegram and Discord**
- Expose the same core commands on both
- Send the same high-signal notifications on both

If the user explicitly asks for one platform, integrate only that platform.

## Core Command Contract

Implement these commands consistently across platforms:

| Capability | Telegram | Discord |
|------------|----------|---------|
| Welcome | `/start` | `/help` or welcome message |
| Help | `/help` | `/help` slash command |
| Wallet balance | `/balance` | `/balance` |
| Agent status | `/status` | `/agent-status` |
| Execute actions | command + confirm buttons | slash command + confirm buttons |

Command responses should include:

- concise result summary
- network context (Mantle Mainnet or Mantle Sepolia)
- explorer links for transaction hashes

## Integration SOP

1. Provision bot credentials
2. Configure platform-specific command handlers
3. Enforce access control before action execution
4. Add notification routing
5. Add rate limits and input validation
6. Validate end-to-end flows in test channels before production

## Telegram Requirements

- Create bot via BotFather and store token securely
- Use webhook for production, long polling for local development
- Use inline keyboards for confirmations
- Apply chat ID allowlist and admin checks for sensitive actions

## Discord Requirements

- Create bot in Discord Developer Portal and store token securely
- Enable required intents (`GUILDS`, `GUILD_MESSAGES`, optional `MESSAGE_CONTENT`)
- Register slash commands for operational actions
- Enforce role-based permissions for sensitive actions

## Notification Defaults

Send these events by default:

- transaction success/failure
- agent runtime status changes
- critical errors requiring operator action

Recommended routing:

- Telegram: primary operator chat
- Discord: dedicated alerts channel (for example `#agent-alerts`)

## Security Baseline

- never expose tokens in logs or client-side code
- validate user identity and scope (chat/guild/role) before execution
- rate-limit command execution per user
- sanitize all user inputs (addresses, token symbols, amounts)
- require explicit confirmation for value-moving operations

## Single Skill Policy

This project uses a single social skill (`social_apps_integration_base`) for onboarding.
Platform selection (Telegram, Discord, or both) is configured in skill arguments during setup.
