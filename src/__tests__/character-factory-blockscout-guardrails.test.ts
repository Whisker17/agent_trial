import { describe, expect, it } from 'bun:test';
import { buildCharacter } from '../core/character-factory';
import type { AgentRecord } from '../shared/types';
import type { SkillRegistry } from '../core/skill-registry';

type MinimalRegistry = Pick<
  SkillRegistry,
  'getSystemContents' | 'resolveSkillContents' | 'getMetadata'
>;

const registry: MinimalRegistry = {
  getSystemContents: () => [],
  resolveSkillContents: () => [],
  getMetadata: () => undefined,
};

function makeRecord(): AgentRecord {
  return {
    id: 'agent-1',
    name: 'Guardrail Agent',
    persona: 'A Mantle assistant',
    modelProvider: 'openrouter',
    skills: '[]',
    skillArgs: '{}',
    walletAddress: '0x1234567890123456789012345678901234567890',
    encryptedPrivateKey: 'unused-in-build-character',
    creatorAddress: null,
    userId: null,
    onChainMeta: '{}',
    status: 'created',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('buildCharacter blockscout balance guardrails', () => {
  it('includes explicit balance safety rules for Blockscout MCP', () => {
    const character = buildCharacter(
      makeRecord(),
      '0xprivate-key',
      registry as SkillRegistry,
    );

    expect(character.system).toContain('__unlock_blockchain_analysis__');
    expect(character.system).toContain('chain_id 5000');
    expect(character.system).toContain('chain_id 5003');
    expect(character.system).toContain('base units');
    expect(character.system).toContain('MNT uses 18 decimals');
  });
});
