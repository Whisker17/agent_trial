import {
  AgentRuntime,
  type Content,
  type IAgentRuntime,
  type Memory,
  type UUID,
  resolvePlugins,
  stringToUuid,
  validateUuid,
} from '@elizaos/core';
import { decrypt } from './crypto.ts';
import { buildCharacter } from './character-factory.ts';
import type { SkillRegistry } from './skill-registry.ts';
import * as repo from '../db/repository.ts';
import mantlePlugin from '../plugins/mantle.ts';
import { patchMcpCallToolAction } from './mcp-call-tool-guardrails.ts';

interface RunningAgent {
  runtime: AgentRuntime;
  startedAt: Date;
}

/**
 * Patch runtime.getSetting so it can return object values (needed by MCP plugin).
 *
 * ElizaOS 1.7.x's getSetting() only returns primitives.
 * The MCP plugin reads runtime.getSetting("mcp") expecting the full
 * { servers: {...} } config object. This wrapper fixes that.
 */
function patchGetSettingForObjects(runtime: IAgentRuntime): void {
  const original = runtime.getSetting.bind(runtime);

  (runtime as any).getSetting = (key: string) => {
    const primitiveResult = original(key);
    if (primitiveResult !== null) return primitiveResult;

    const objValue = (runtime.character?.settings as Record<string, any>)?.[key];
    if (objValue !== undefined && objValue !== null && typeof objValue === 'object') {
      return objValue;
    }
    return null;
  };
}

const CLIENT_CHAT_SOURCE = 'client_chat';

function getContentText(content: Content | null | undefined): string | null {
  if (!content) return null;

  const text = typeof content.text === 'string' ? content.text.trim() : '';
  return text.length > 0 ? text : null;
}

function getLatestMessageText(messages: Memory[] | undefined): string | null {
  if (!Array.isArray(messages) || messages.length === 0) return null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const text = getContentText(messages[index]?.content);
    if (text) return text;
  }
  return null;
}

function toStableUuid(value: string, namespace: string): UUID {
  return validateUuid(value) ?? stringToUuid(`${namespace}:${value}`);
}

export class AgentManager {
  private running = new Map<string, RunningAgent>();
  private registry: SkillRegistry;

  constructor(registry: SkillRegistry) {
    this.registry = registry;
    const reconciled = repo.setAllRunningAgentsStopped();
    if (reconciled > 0) {
      console.warn(
        `[agent-manager] Reconciled ${reconciled} stale running agent status record(s) to stopped on boot.`,
      );
    }
  }

  async start(agentId: string): Promise<void> {
    if (this.running.has(agentId)) {
      throw new Error('Agent is already running');
    }

    const record = repo.getAgent(agentId);
    if (!record) throw new Error('Agent not found');

    const privateKey = decrypt(record.encryptedPrivateKey);
    const character = buildCharacter(record, privateKey, this.registry);
    const resolvedCharacterPlugins = await resolvePlugins(character.plugins ?? []);
    const runtimePlugins = [...resolvedCharacterPlugins];
    for (const plugin of runtimePlugins) {
      patchMcpCallToolAction(plugin);
    }
    if (!runtimePlugins.some((plugin) => plugin.name === mantlePlugin.name)) {
      runtimePlugins.push(mantlePlugin);
    }
    console.log(
      `[agent-manager] Runtime plugins for "${record.name}": ${runtimePlugins
        .map((plugin) => plugin.name)
        .join(', ')}`,
    );

    const runtime = new AgentRuntime({
      agentId: agentId as any,
      character,
      plugins: runtimePlugins,
    });

    patchGetSettingForObjects(runtime);

    try {
      const sqlPlugin = runtimePlugins.find(
        (plugin) => plugin.name === '@elizaos/plugin-sql',
      );
      if (sqlPlugin) {
        await runtime.registerPlugin(sqlPlugin);
        const adapter = (runtime as any).adapter;
        if (adapter && !(await adapter.isReady())) {
          await adapter.init();
        }
        await runtime.runPluginMigrations();
      }

      await runtime.initialize({ skipMigrations: !!sqlPlugin });
      this.running.set(agentId, { runtime, startedAt: new Date() });
      repo.setAgentStatus(agentId, 'running');
      console.log(`[agent-manager] Started agent "${record.name}" (${agentId})`);
    } catch (err) {
      repo.setAgentStatus(agentId, 'error');
      console.error(`[agent-manager] Failed to start agent "${record.name}":`, err);
      throw err;
    }
  }

  async stop(agentId: string): Promise<void> {
    const entry = this.running.get(agentId);
    if (!entry) throw new Error('Agent is not running');

    try {
      await entry.runtime.stop();
    } catch (err) {
      console.error(`[agent-manager] Error stopping agent ${agentId}:`, err);
    }

    this.running.delete(agentId);
    repo.setAgentStatus(agentId, 'stopped');
    console.log(`[agent-manager] Stopped agent ${agentId}`);
  }

  async chat(
    agentId: string,
    message: string,
    userId?: string,
    sessionId?: string,
  ): Promise<string> {
    const entry = this.running.get(agentId);
    if (!entry) throw new Error('Agent is not running');

    try {
      const runtime = entry.runtime as unknown as IAgentRuntime;
      const messageService = runtime.messageService;
      if (!messageService) {
        throw new Error('Message service is not initialized');
      }

      const normalizedSessionId =
        typeof sessionId === 'string' && sessionId.trim().length > 0
          ? sessionId.trim()
          : `default:${agentId}`;
      const roomId = toStableUuid(
        normalizedSessionId,
        `chat-room:${agentId}`,
      );

      const normalizedUserId =
        typeof userId === 'string' && userId.trim().length > 0
          ? userId.trim()
          : `anonymous:${agentId}`;
      const entityId = toStableUuid(
        normalizedUserId,
        `chat-user:${agentId}`,
      );

      const userMessage: Memory = {
        entityId,
        agentId: runtime.agentId,
        roomId,
        createdAt: Date.now(),
        content: {
          text: message,
          source: CLIENT_CHAT_SOURCE,
        },
      };

      await runtime.ensureConnection({
        entityId,
        roomId,
        worldId: roomId,
        source: CLIENT_CHAT_SOURCE,
        channelId: roomId,
      });

      const callbackTexts: string[] = [];
      const callback = async (content: Content) => {
        const callbackText = getContentText(content);
        if (callbackText) callbackTexts.push(callbackText);
        return [];
      };

      const handleMessage = async () =>
        messageService.handleMessage(runtime, userMessage, callback);

      const withEntityContext = (runtime as any).withEntityContext;
      const processing =
        typeof withEntityContext === 'function'
          ? await withEntityContext.call(runtime, entityId, handleMessage)
          : await handleMessage();

      const callbackText = callbackTexts.findLast((text) => text.length > 0) ?? null;
      const responseMessageText = getLatestMessageText(processing.responseMessages);
      const responseText = getContentText(processing.responseContent);
      const text = callbackText ?? responseMessageText ?? responseText;

      if (!text) {
        throw new Error('Agent returned an empty response');
      }

      return text;
    } catch (err) {
      console.error(`[agent-manager] Chat error for agent ${agentId}:`, err);
      throw new Error('Failed to generate response');
    }
  }

  isRunning(agentId: string): boolean {
    return this.running.has(agentId);
  }

  getRunningAgentIds(): string[] {
    return [...this.running.keys()];
  }

  async stopAll(): Promise<void> {
    const ids = [...this.running.keys()];
    await Promise.allSettled(ids.map((id) => this.stop(id)));
  }
}
