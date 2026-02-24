const API = "/api";

export type DeployNetwork = "mantle" | "mantleSepolia";

export interface InsufficientAgentGasDetails {
  requiredMnt: string;
  balanceMnt: string;
  shortfallMnt: string;
  fundTo: string;
  network: DeployNetwork;
}

export type DeleteSweepErrorCode =
  | "MISSING_CREATOR_ADDRESS"
  | "INVALID_CREATOR_ADDRESS"
  | "TOKEN_CONFIG_MISSING"
  | "INSUFFICIENT_SWEEP_GAS"
  | "ASSET_TRANSFER_FAILED";

export interface DeleteSweepSummary {
  from: string;
  destination: string;
  transfers: Array<{
    network: DeployNetwork;
    assetType: "NATIVE" | "ERC20";
    symbol: string;
    amount: string;
    txHash: string;
  }>;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(
    message: string,
    opts: { status: number; code?: string; details?: unknown },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = opts.status;
    this.code = opts.code;
    this.details = opts.details;
  }
}

export function isInsufficientAgentGasError(
  error: unknown,
): error is ApiError & {
  code: "INSUFFICIENT_AGENT_GAS";
  details: InsufficientAgentGasDetails;
} {
  if (!(error instanceof ApiError)) return false;
  if (error.code !== "INSUFFICIENT_AGENT_GAS") return false;
  const details = error.details as
    | Partial<InsufficientAgentGasDetails>
    | undefined;
  return !!(
    details &&
    typeof details.requiredMnt === "string" &&
    typeof details.balanceMnt === "string" &&
    typeof details.shortfallMnt === "string" &&
    typeof details.fundTo === "string" &&
    (details.network === "mantle" || details.network === "mantleSepolia")
  );
}

export function isDeleteSweepError(
  error: unknown,
): error is ApiError & {
  code: DeleteSweepErrorCode;
  details: Record<string, unknown>;
} {
  if (!(error instanceof ApiError)) return false;
  if (
    error.code !== "MISSING_CREATOR_ADDRESS" &&
    error.code !== "INVALID_CREATOR_ADDRESS" &&
    error.code !== "TOKEN_CONFIG_MISSING" &&
    error.code !== "INSUFFICIENT_SWEEP_GAS" &&
    error.code !== "ASSET_TRANSFER_FAILED"
  ) {
    return false;
  }
  return !!error.details && typeof error.details === "object";
}

export interface AgentPublic {
  id: string;
  name: string;
  persona: string;
  modelProvider: string;
  skills: string[];
  walletAddress: string;
  creatorAddress: string | null;
  status: "created" | "running" | "stopped" | "error";
  createdAt: string;
  updatedAt: string;
  balance?: { mantle: string; mantleSepolia: string };
  onChainMeta?: AgentOnChainMeta;
}

export interface AgentOnChainMeta {
  erc8004?: {
    registered: boolean;
    registryAddress: string;
    agentId: string;
    txHash: string;
    network: "mantle" | "mantleSepolia";
  };
  governanceToken?: {
    address: string;
    name: string;
    symbol: string;
    supply: string;
    txHash: string;
    network: "mantle" | "mantleSepolia";
  };
}

export interface SkillMeta {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  tags: string[];
  requiresTools: string[];
  tier?: string;
  arguments?: Record<string, { description: string; required: boolean }>;
}

export interface CreateAgentPayload {
  name: string;
  persona: string;
  modelProvider: string;
  skills: string[];
  skillArgs?: Record<string, Record<string, string>>;
  creatorAddress?: string;
  autoStart?: boolean;
}

export interface SocialConfigPayload {
  base: {
    commandPrefix: string;
    responseVisibility: "public" | "ephemeral";
    enableDmFallback: boolean;
  };
  telegram: {
    enabled: boolean;
    botToken: string;
    allowedChatIds: string;
    defaultChatId: string;
    webhookMode: "polling" | "webhook";
  };
  discord: {
    enabled: boolean;
    botToken: string;
    guildId: string;
    controlChannelId: string;
    notifyChannelId: string;
    adminRoleIds: string;
  };
}

let _getToken: (() => Promise<string | null>) | null = null;

export function setAuthTokenGetter(fn: () => Promise<string | null>) {
  _getToken = fn;
}

async function authHeaders(): Promise<Record<string, string>> {
  if (!_getToken) return {};
  const token = await _getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function tryParseJson(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function json<T>(res: Response): Promise<T> {
  const bodyText = await res.text().catch(() => "");
  const parsed = tryParseJson(bodyText) as
    | { error?: string; code?: string; details?: unknown }
    | undefined;

  if (!res.ok) {
    throw new ApiError(parsed?.error || bodyText || `HTTP ${res.status}`, {
      status: res.status,
      code: parsed?.code,
      details: parsed?.details,
    });
  }

  if (parsed !== undefined) {
    return parsed as T;
  }

  throw new ApiError("Invalid JSON response from server", {
    status: res.status,
  });
}

export async function fetchSkills(): Promise<SkillMeta[]> {
  const data = await json<{ skills: SkillMeta[] }>(
    await fetch(`${API}/skills`),
  );
  return data.skills;
}

export async function fetchAgents(): Promise<AgentPublic[]> {
  const headers = await authHeaders();
  const data = await json<{ agents: AgentPublic[] }>(
    await fetch(`${API}/agents`, { headers }),
  );
  return data.agents;
}

export async function fetchAgent(id: string): Promise<AgentPublic> {
  const headers = await authHeaders();
  const data = await json<{ agent: AgentPublic }>(
    await fetch(`${API}/agents/${id}`, { headers }),
  );
  return data.agent;
}

export async function createAgent(
  payload: CreateAgentPayload,
): Promise<AgentPublic> {
  const headers = {
    ...(await authHeaders()),
    "Content-Type": "application/json",
  };
  const data = await json<{ agent: AgentPublic }>(
    await fetch(`${API}/agents`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    }),
  );
  return data.agent;
}

export async function updateAgent(
  id: string,
  fields: Partial<{ onChainMeta: AgentOnChainMeta }>,
): Promise<AgentPublic> {
  const headers = {
    ...(await authHeaders()),
    "Content-Type": "application/json",
  };
  const data = await json<{ agent: AgentPublic }>(
    await fetch(`${API}/agents/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(fields),
    }),
  );
  return data.agent;
}

export async function startAgent(id: string): Promise<void> {
  const headers = await authHeaders();
  await json(
    await fetch(`${API}/agents/${id}/start`, { method: "POST", headers }),
  );
}

export async function stopAgent(id: string): Promise<void> {
  const headers = await authHeaders();
  await json(
    await fetch(`${API}/agents/${id}/stop`, { method: "POST", headers }),
  );
}

export async function deleteAgent(
  id: string,
): Promise<{ success: true; sweep?: DeleteSweepSummary }> {
  const headers = await authHeaders();
  const res = await fetch(`${API}/agents/${id}`, { method: "DELETE", headers });
  if (res.status === 204) return { success: true };
  return json<{ success: true; sweep?: DeleteSweepSummary }>(res);
}

export async function deployToken(
  agentId: string,
  params: {
    tokenName: string;
    tokenSymbol: string;
    initialSupply: string;
    network: DeployNetwork;
  },
): Promise<{ address: string; txHash: string }> {
  const headers = {
    ...(await authHeaders()),
    "Content-Type": "application/json",
  };
  const data = await json<{ token: { address: string; txHash: string } }>(
    await fetch(`${API}/agents/${agentId}/deploy-token`, {
      method: "POST",
      headers,
      body: JSON.stringify(params),
    }),
  );
  return data.token;
}

export interface PersistedChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "agent" | "system";
  text: string;
  timestamp: number;
  actions: string[];
  error: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  lastMessageAt: number;
  createdAt: string;
  updatedAt: string;
}

export async function fetchChatSessions(id: string): Promise<ChatSession[]> {
  const headers = await authHeaders();
  const data = await json<{ sessions: ChatSession[] }>(
    await fetch(`${API}/agents/${id}/chat/sessions`, {
      method: "GET",
      headers,
    }),
  );
  return data.sessions;
}

export async function createChatSession(
  id: string,
  title?: string,
): Promise<ChatSession> {
  const headers = {
    ...(await authHeaders()),
    "Content-Type": "application/json",
  };
  const data = await json<{ session: ChatSession }>(
    await fetch(`${API}/agents/${id}/chat/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ title }),
    }),
  );
  return data.session;
}

export async function fetchChatHistory(
  id: string,
  sessionId?: string,
): Promise<{ session: ChatSession | null; messages: PersistedChatMessage[] }> {
  const headers = await authHeaders();
  const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
  return json<{
    session: ChatSession | null;
    messages: PersistedChatMessage[];
  }>(
    await fetch(`${API}/agents/${id}/chat${query}`, {
      method: "GET",
      headers,
    }),
  );
}

export async function chatWithAgent(
  id: string,
  message: string,
  sessionId?: string,
): Promise<{
  text: string;
  actions: string[];
  sessionId: string;
  session: ChatSession;
}> {
  const headers = {
    ...(await authHeaders()),
    "Content-Type": "application/json",
  };
  const data = await json<{
    response: { text: string; actions: string[]; sessionId: string };
    session: ChatSession;
  }>(
    await fetch(`${API}/agents/${id}/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message, sessionId }),
    }),
  );
  return {
    ...data.response,
    session: data.session,
  };
}

export async function testSocialConnection(
  platform: "telegram" | "discord",
  token: string,
): Promise<{
  success: boolean;
  platform: "telegram" | "discord";
  account: unknown;
}> {
  const headers = {
    ...(await authHeaders()),
    "Content-Type": "application/json",
  };
  return json<{
    success: boolean;
    platform: "telegram" | "discord";
    account: unknown;
  }>(
    await fetch(`${API}/agents/social/test`, {
      method: "POST",
      headers,
      body: JSON.stringify({ platform, token }),
    }),
  );
}
