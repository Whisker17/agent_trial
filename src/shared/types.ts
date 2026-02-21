export type AgentStatus = 'created' | 'running' | 'stopped' | 'error';

export interface AgentOnChainMeta {
  erc8004?: {
    registered: boolean;
    registryAddress: string;
    agentId: string;
    txHash: string;
    network: 'mantle' | 'mantleSepolia';
  };
  governanceToken?: {
    address: string;
    name: string;
    symbol: string;
    supply: string;
    txHash: string;
    network: 'mantle' | 'mantleSepolia';
  };
}

export interface AgentConfig {
  name: string;
  persona: string;
  modelProvider: 'openrouter' | 'openai' | 'ollama';
  skills: string[];
  skillArgs?: Record<string, Record<string, string>>;
  creatorAddress?: string;
  autoStart?: boolean;
}

export interface AgentRecord {
  id: string;
  name: string;
  persona: string;
  modelProvider: string;
  skills: string;
  skillArgs: string;
  walletAddress: string;
  encryptedPrivateKey: string;
  creatorAddress: string | null;
  userId: string | null;
  onChainMeta: string;
  status: AgentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AgentPublic {
  id: string;
  name: string;
  persona: string;
  modelProvider: string;
  skills: string[];
  walletAddress: string;
  creatorAddress: string | null;
  status: AgentStatus;
  createdAt: string;
  updatedAt: string;
  balance?: {
    mantle: string;
    mantleSepolia: string;
  };
  onChainMeta?: AgentOnChainMeta;
}

export type SkillTier = 'system' | 'base' | 'service' | 'private';

export interface SkillArgument {
  description: string;
  required: boolean;
}

export interface SkillMetadata {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  homepage?: string;
  tags: string[];
  requiresTools: string[];
  arguments?: Record<string, SkillArgument>;
  tier: SkillTier;
  isSystem: boolean;
}

export interface Skill {
  metadata: SkillMetadata;
  content: string;
}

export function toAgentPublic(record: AgentRecord): AgentPublic {
  const onChainMeta = record.onChainMeta ? JSON.parse(record.onChainMeta) : undefined;
  const isEmpty = !onChainMeta || Object.keys(onChainMeta).length === 0;

  return {
    id: record.id,
    name: record.name,
    persona: record.persona,
    modelProvider: record.modelProvider,
    skills: JSON.parse(record.skills),
    walletAddress: record.walletAddress,
    creatorAddress: record.creatorAddress,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    onChainMeta: isEmpty ? undefined : onChainMeta,
  };
}
