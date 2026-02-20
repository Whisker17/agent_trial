const API = '/api';

export interface AgentPublic {
  id: string;
  name: string;
  persona: string;
  modelProvider: string;
  skills: string[];
  walletAddress: string;
  creatorAddress: string | null;
  status: 'created' | 'running' | 'stopped' | 'error';
  createdAt: string;
  updatedAt: string;
  balance?: { mantle: string; mantleSepolia: string };
}

export interface SkillMeta {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  tags: string[];
  requiresTools: string[];
  arguments?: Record<string, { description: string; required: boolean }>;
}

export interface CreateAgentPayload {
  name: string;
  persona: string;
  modelProvider: string;
  skills: string[];
  autoStart?: boolean;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(body || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchSkills(): Promise<SkillMeta[]> {
  const data = await json<{ skills: SkillMeta[] }>(await fetch(`${API}/skills`));
  return data.skills;
}

export async function fetchAgents(): Promise<AgentPublic[]> {
  const data = await json<{ agents: AgentPublic[] }>(await fetch(`${API}/agents`));
  return data.agents;
}

export async function fetchAgent(id: string): Promise<AgentPublic> {
  const data = await json<{ agent: AgentPublic }>(await fetch(`${API}/agents/${id}`));
  return data.agent;
}

export async function createAgent(payload: CreateAgentPayload): Promise<AgentPublic> {
  const data = await json<{ agent: AgentPublic }>(
    await fetch(`${API}/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
  return data.agent;
}

export async function startAgent(id: string): Promise<void> {
  await json(await fetch(`${API}/agents/${id}/start`, { method: 'POST' }));
}

export async function stopAgent(id: string): Promise<void> {
  await json(await fetch(`${API}/agents/${id}/stop`, { method: 'POST' }));
}

export async function deleteAgent(id: string): Promise<void> {
  const res = await fetch(`${API}/agents/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
}

export async function chatWithAgent(
  id: string,
  message: string,
): Promise<{ text: string; actions: string[] }> {
  const data = await json<{ response: { text: string; actions: string[] } }>(
    await fetch(`${API}/agents/${id}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    }),
  );
  return data.response;
}
