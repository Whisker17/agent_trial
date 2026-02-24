# Telegram Social Integration Onboarding

本文面向外部用户，说明 Telegram 集成中每个配置项的意义、参数获取方式、以及最小可用的上线流程。

## 1. 配置项说明

| 配置项 | 是否必填 | 作用 | 备注 |
| --- | --- | --- | --- |
| Enabled | 是（要启用 Telegram 时） | 打开 Telegram 集成 | 关闭后不会加载 Telegram 插件 |
| Bot Token | 是 | Telegram 机器人身份凭据 | 由 BotFather 签发 |
| Allowed Chat IDs | 建议填写 | 限制允许与 agent 交互的 chat | 多个用逗号分隔 |
| Default Chat ID | 可选 | 默认 chat（项目里会并入 allowlist） | 常填主群 ID |
| Mode (polling/webhook) | 可选 | 展示为接入模式选择 | 当前版本运行时主要走 polling |
| Test Connection | 建议执行 | 校验 token 是否有效 | 仅校验 token，不校验消息链路 |

## 2. 如何获取这些参数

### 2.1 Bot Token

1. 打开 Telegram，进入 [@BotFather](https://t.me/BotFather)。
2. 创建新 bot：`/newbot`（已有 bot 可用 `/token` 重新获取）。
3. 得到形如 `123456789:AA...` 的 token，填入 `Bot Token`。

安全建议：token 泄露后立刻在 BotFather 执行 `/revoke`，再重新 `/token`。

### 2.2 Chat ID（Allowed Chat IDs / Default Chat ID）

#### 私聊 chat id

1. 给 bot 私聊发送 `/start`。
2. 执行：

```bash
curl "https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates"
```

3. 在返回中找到 `message.chat.id`。

#### 群聊 / 超级群 chat id

1. 将 bot 拉入目标群并给予发言权限。
2. 在群内发送：`/start@<your_bot_username>`（比普通文本更稳）。
3. 再执行 `getUpdates`，读取 `message.chat.id`。
4. 超级群常见为 `-100...` 开头。

如果一直拿不到更新，先检查是否有别的进程占用同一 token，或先删除 webhook：

```bash
curl "https://api.telegram.org/bot<YOUR_TOKEN>/deleteWebhook?drop_pending_updates=false"
```

## 3. 推荐 onboarding 流程（外部用户）

1. 创建 bot，拿到 `Bot Token`。
2. 拉 bot 进目标群，拿到群 `chat.id`。
3. 在向导中填写：
   - `Bot Token`
   - `Allowed Chat IDs`（建议填主群/私聊 id）
   - `Default Chat ID`（可与主群 id 一致）
4. 点击 `Test Connection`（通过仅代表 token 有效）。
5. 启动 agent，在群里发送 `/start@bot_username` 或 `@bot hi` 验证。

## 4. 常见问题排查

- `Test Connection` 成功但群里不回复：
  - 群 chat id 不在 `Allowed Chat IDs`。
  - 群里只发了普通文本，未 mention / 未发命令。
  - bot 无发送权限。
- 返回 `409 Conflict`：
  - 同一 token 被多个实例同时轮询。
- `getUpdates` 一直为空：
  - 没有新消息可消费，或更新被其他实例先消费。
  - 先停止其他实例再重试。
