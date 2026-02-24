# Discord Social Integration Onboarding

本文面向外部用户，说明 Discord 集成中每个配置项的意义、参数获取方式、以及常见踩坑处理。

## 1. 配置项说明

| 配置项 | 是否必填 | 作用 | 备注 |
| --- | --- | --- | --- |
| Enabled | 是（要启用 Discord 时） | 打开 Discord 集成 | 关闭后不会加载 Discord 插件 |
| Bot Token | 是 | Discord 机器人凭据 | 来自 Discord Developer Portal |
| Guild ID | 是 | 限定 bot 所属服务器 | 必须是数字 snowflake |
| Control Channel ID | 可选 | 控制命令可用频道 | 与 Notify Channel 一起用于频道限制 |
| Notify Channel ID | 可选 | 通知消息频道 | 可与 Control 相同 |
| Admin Role IDs | 可选 | 管理员角色白名单（业务扩展位） | 多个用逗号分隔 |
| Test Connection | 建议执行 | 校验 token 是否可访问 Discord API | 仅校验 token，不校验频道权限 |

## 2. 如何获取这些参数

## 2.1 Bot Token

1. 打开 [Discord Developer Portal](https://discord.com/developers/applications)。
2. 创建 Application -> `Bot` -> `Add Bot`。
3. 在 Bot 页面复制 token（或 `Reset Token` 后复制）。
4. 填入 `Bot Token`。

安全建议：token 泄露后立即 `Reset Token`。

## 2.2 Guild ID / Channel ID / Role ID

1. Discord 客户端打开 `User Settings -> Advanced -> Developer Mode`。
2. 右键服务器 -> `Copy Server ID`（即 `Guild ID`）。
3. 右键频道 -> `Copy Channel ID`（可作为 Control/Notify Channel）。
4. 右键角色 -> `Copy Role ID`（可填 `Admin Role IDs`）。

## 2.3 邀请 bot 进服务器

1. 在 Developer Portal 的 OAuth2 URL Generator 勾选 scopes：
   - `bot`
   - `applications.commands`
2. Bot Permissions 至少建议勾选：
   - View Channels
   - Send Messages
   - Read Message History
   - Add Reactions
   - Embed Links（可选但推荐）

## 2.4 必开 intents（非常关键）

若日志出现 `Failed to login to Discord: Used disallowed intents`，通常是 intents 未开启。

在 Bot 页面 `Privileged Gateway Intents` 至少开启：

- Message Content Intent
- Server Members Intent
- Presence Intent

## 3. 推荐 onboarding 流程（外部用户）

1. 在 Developer Portal 创建 bot 并复制 token。
2. 开启上面的 3 个 privileged intents。
3. 用 OAuth2 链接邀请 bot 进目标服务器。
4. 在向导中填写：
   - `Bot Token`
   - `Guild ID`
   - 可选频道/角色 ID
5. 点击 `Test Connection`。
6. 启动 agent，在频道中 `@bot hi` 验证。

## 4. 常见问题排查

- 日志 `Used disallowed intents`：
  - 未开启 Message Content / Members / Presence intents。
- `Test Connection` 成功但频道不回复：
  - bot 没有频道发送权限。
  - 频道不在限制集合内（填写了控制/通知频道时）。
  - 当前实现默认更偏向 mention 触发，优先用 `@bot` 测试。
- 401 或 token 校验失败：
  - token 复制错误、过期或已重置。
