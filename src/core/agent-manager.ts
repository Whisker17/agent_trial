import { AgentRuntime, type IAgentRuntime, type Plugin, logger } from '@elizaos/core';
import { decrypt } from './crypto.ts';
import { buildCharacter } from './character-factory.ts';
import type { SkillRegistry } from './skill-registry.ts';
import * as repo from '../db/repository.ts';
import mantlePlugin from '../plugins/mantle.ts';

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

export class AgentManager {
  private running = new Map<string, RunningAgent>();
  private registry: SkillRegistry;

  constructor(registry: SkillRegistry) {
    this.registry = registry;
  }

  async start(agentId: string): Promise<void> {
    if (this.running.has(agentId)) {
      throw new Error('Agent is already running');
    }

    const record = repo.getAgent(agentId);
    if (!record) throw new Error('Agent not found');

    const privateKey = decrypt(record.encryptedPrivateKey);
    const character = buildCharacter(record, privateKey, this.registry);

    const runtime = new AgentRuntime({
      agentId: agentId as any,
      character,
      plugins: [mantlePlugin],
    });

    patchGetSettingForObjects(runtime);

    try {
      await runtime.initialize();
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

  async chat(agentId: string, message: string, _userId?: string): Promise<string> {
    const entry = this.running.get(agentId);
    if (!entry) throw new Error('Agent is not running');

    try {
      const result = await entry.runtime.generateText(message, {
        includeCharacter: true,
      });
      return result.text;
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
