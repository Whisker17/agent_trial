import { getDatabase } from './index.ts';
import type { AgentRecord, AgentStatus, AgentOnChainMeta } from '../shared/types.ts';

interface AgentRow {
  id: string;
  name: string;
  persona: string;
  model_provider: string;
  skills: string;
  skill_args: string;
  wallet_address: string;
  encrypted_private_key: string;
  creator_address: string | null;
  user_id: string | null;
  on_chain_meta: string;
  status: string;
  created_at: string;
  updated_at: string;
}

function rowToRecord(row: AgentRow): AgentRecord {
  return {
    id: row.id,
    name: row.name,
    persona: row.persona,
    modelProvider: row.model_provider,
    skills: row.skills,
    skillArgs: row.skill_args,
    walletAddress: row.wallet_address,
    encryptedPrivateKey: row.encrypted_private_key,
    creatorAddress: row.creator_address,
    userId: row.user_id,
    onChainMeta: row.on_chain_meta,
    status: row.status as AgentStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createAgent(params: {
  id: string;
  name: string;
  persona: string;
  modelProvider: string;
  skills: string[];
  skillArgs: Record<string, Record<string, string>>;
  walletAddress: string;
  encryptedPrivateKey: string;
  creatorAddress: string | null;
  userId: string | null;
}): AgentRecord {
  const db = getDatabase();
  db.run(
    `INSERT INTO agents (id, name, persona, model_provider, skills, skill_args,
       wallet_address, encrypted_private_key, creator_address, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.id,
      params.name,
      params.persona,
      params.modelProvider,
      JSON.stringify(params.skills),
      JSON.stringify(params.skillArgs),
      params.walletAddress,
      params.encryptedPrivateKey,
      params.creatorAddress,
      params.userId,
    ],
  );
  return getAgent(params.id)!;
}

export function getAgent(id: string, userId?: string): AgentRecord | null {
  const db = getDatabase();
  if (userId) {
    const row = db
      .query('SELECT * FROM agents WHERE id = ? AND user_id = ?')
      .get(id, userId) as AgentRow | null;
    return row ? rowToRecord(row) : null;
  }
  const row = db.query('SELECT * FROM agents WHERE id = ?').get(id) as AgentRow | null;
  return row ? rowToRecord(row) : null;
}

export function listAgents(userId?: string): AgentRecord[] {
  const db = getDatabase();
  if (userId) {
    const rows = db
      .query('SELECT * FROM agents WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as AgentRow[];
    return rows.map(rowToRecord);
  }
  const rows = db.query('SELECT * FROM agents ORDER BY created_at DESC').all() as AgentRow[];
  return rows.map(rowToRecord);
}

export function updateAgent(
  id: string,
  fields: Partial<{
    name: string;
    persona: string;
    modelProvider: string;
    skills: string[];
    skillArgs: Record<string, Record<string, string>>;
    status: AgentStatus;
    onChainMeta: AgentOnChainMeta;
  }>,
): AgentRecord | null {
  const db = getDatabase();
  const sets: string[] = [];
  const values: any[] = [];

  if (fields.name !== undefined) {
    sets.push('name = ?');
    values.push(fields.name);
  }
  if (fields.persona !== undefined) {
    sets.push('persona = ?');
    values.push(fields.persona);
  }
  if (fields.modelProvider !== undefined) {
    sets.push('model_provider = ?');
    values.push(fields.modelProvider);
  }
  if (fields.skills !== undefined) {
    sets.push('skills = ?');
    values.push(JSON.stringify(fields.skills));
  }
  if (fields.skillArgs !== undefined) {
    sets.push('skill_args = ?');
    values.push(JSON.stringify(fields.skillArgs));
  }
  if (fields.status !== undefined) {
    sets.push('status = ?');
    values.push(fields.status);
  }
  if (fields.onChainMeta !== undefined) {
    sets.push('on_chain_meta = ?');
    values.push(JSON.stringify(fields.onChainMeta));
  }

  if (sets.length === 0) return getAgent(id);

  sets.push("updated_at = datetime('now')");
  values.push(id);

  db.run(`UPDATE agents SET ${sets.join(', ')} WHERE id = ?`, values);
  return getAgent(id);
}

export function deleteAgent(id: string): boolean {
  const db = getDatabase();
  const result = db.run('DELETE FROM agents WHERE id = ?', [id]);
  return (result as any).changes > 0;
}

export function setAgentStatus(id: string, status: AgentStatus): void {
  const db = getDatabase();
  db.run("UPDATE agents SET status = ?, updated_at = datetime('now') WHERE id = ?", [status, id]);
}

interface ChatMessageRow {
  id: string;
  agent_id: string;
  role: string;
  text: string;
  actions: string;
  is_error: number;
  timestamp: number;
  created_at: string;
}

export interface PersistedChatMessage {
  id: string;
  agentId: string;
  role: 'user' | 'agent' | 'system';
  text: string;
  actions: string[];
  error: boolean;
  timestamp: number;
  createdAt: string;
}

function parseActions(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value) => typeof value === 'string');
  } catch {
    return [];
  }
}

function chatMessageRowToRecord(row: ChatMessageRow): PersistedChatMessage {
  return {
    id: row.id,
    agentId: row.agent_id,
    role: row.role as PersistedChatMessage['role'],
    text: row.text,
    actions: parseActions(row.actions),
    error: row.is_error === 1,
    timestamp: row.timestamp,
    createdAt: row.created_at,
  };
}

export function createChatMessage(params: {
  id?: string;
  agentId: string;
  role: PersistedChatMessage['role'];
  text: string;
  actions?: string[];
  error?: boolean;
  timestamp?: number;
}): PersistedChatMessage {
  const db = getDatabase();
  const id = params.id ?? crypto.randomUUID();
  const timestamp = params.timestamp ?? Date.now();
  db.run(
    `INSERT INTO agent_chat_messages (id, agent_id, role, text, actions, is_error, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      params.agentId,
      params.role,
      params.text,
      JSON.stringify(params.actions ?? []),
      params.error ? 1 : 0,
      timestamp,
    ],
  );
  const row = db
    .query('SELECT * FROM agent_chat_messages WHERE id = ?')
    .get(id) as ChatMessageRow | null;
  if (!row) {
    throw new Error('Failed to persist chat message');
  }
  return chatMessageRowToRecord(row);
}

export function listChatMessages(agentId: string): PersistedChatMessage[] {
  const db = getDatabase();
  const rows = db
    .query(
      'SELECT * FROM agent_chat_messages WHERE agent_id = ? ORDER BY timestamp ASC, created_at ASC, id ASC',
    )
    .all(agentId) as ChatMessageRow[];
  return rows.map(chatMessageRowToRecord);
}

interface SkillRow {
  id: string;
  name: string;
  description: string;
  content: string;
  version: string;
  tier: string;
  author_agent: string | null;
  author_user: string | null;
  visibility: string;
  tags: string;
  requires_tools: string;
  arguments: string;
  contract: string | null;
  fork_of: string | null;
  created_at: string;
  updated_at: string;
}

function skillRowToRecord(row: SkillRow): SkillRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    content: row.content,
    version: row.version,
    tier: row.tier as any,
    authorAgent: row.author_agent,
    authorUser: row.author_user,
    visibility: row.visibility as SkillVisibility,
    tags: JSON.parse(row.tags),
    requiresTools: JSON.parse(row.requires_tools),
    arguments: JSON.parse(row.arguments),
    contract: row.contract ? JSON.parse(row.contract) : undefined,
    forkOf: row.fork_of ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSkill(params: {
  id: string;
  name: string;
  description: string;
  content: string;
  version?: string;
  tier?: string;
  authorAgent?: string | null;
  authorUser?: string | null;
  visibility?: string;
  tags?: string[];
  requiresTools?: string[];
  arguments?: Record<string, unknown>;
  contract?: unknown;
  forkOf?: string | null;
}): SkillRecord {
  const db = getDatabase();
  db.run(
    `INSERT INTO skills (id, name, description, content, version, tier, author_agent, author_user, visibility, tags, requires_tools, arguments, contract, fork_of)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.id,
      params.name,
      params.description,
      params.content,
      params.version ?? '1.0.0',
      params.tier ?? 'base',
      params.authorAgent ?? null,
      params.authorUser ?? null,
      params.visibility ?? 'private',
      JSON.stringify(params.tags ?? []),
      JSON.stringify(params.requiresTools ?? []),
      JSON.stringify(params.arguments ?? {}),
      params.contract ? JSON.stringify(params.contract) : null,
      params.forkOf ?? null,
    ],
  );
  return getSkillRecord(params.id)!;
}

export function getSkillRecord(id: string): SkillRecord | null {
  const db = getDatabase();
  const row = db.query('SELECT * FROM skills WHERE id = ?').get(id) as SkillRow | null;
  return row ? skillRowToRecord(row) : null;
}

export function listSkillRecords(opts?: {
  tier?: string;
  visibility?: string;
  authorAgent?: string;
}): SkillRecord[] {
  const db = getDatabase();
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (opts?.tier !== undefined) {
    conditions.push('tier = ?');
    values.push(opts.tier);
  }
  if (opts?.visibility !== undefined) {
    conditions.push('visibility = ?');
    values.push(opts.visibility);
  }
  if (opts?.authorAgent !== undefined) {
    conditions.push('author_agent = ?');
    values.push(opts.authorAgent);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db
    .query(`SELECT * FROM skills ${where} ORDER BY created_at DESC`)
    .all(...values) as SkillRow[];
  return rows.map(skillRowToRecord);
}

export function updateSkill(
  id: string,
  fields: Partial<{
    name: string;
    description: string;
    content: string;
    version: string;
    visibility: string;
    tags: string[];
    requiresTools: string[];
    arguments: Record<string, unknown>;
    contract: unknown;
  }>,
): SkillRecord | null {
  const db = getDatabase();
  const sets: string[] = [];
  const values: unknown[] = [];
  if (fields.name !== undefined) {
    sets.push('name = ?');
    values.push(fields.name);
  }
  if (fields.description !== undefined) {
    sets.push('description = ?');
    values.push(fields.description);
  }
  if (fields.content !== undefined) {
    sets.push('content = ?');
    values.push(fields.content);
  }
  if (fields.version !== undefined) {
    sets.push('version = ?');
    values.push(fields.version);
  }
  if (fields.visibility !== undefined) {
    sets.push('visibility = ?');
    values.push(fields.visibility);
  }
  if (fields.tags !== undefined) {
    sets.push('tags = ?');
    values.push(JSON.stringify(fields.tags));
  }
  if (fields.requiresTools !== undefined) {
    sets.push('requires_tools = ?');
    values.push(JSON.stringify(fields.requiresTools));
  }
  if (fields.arguments !== undefined) {
    sets.push('arguments = ?');
    values.push(JSON.stringify(fields.arguments));
  }
  if (fields.contract !== undefined) {
    sets.push('contract = ?');
    values.push(fields.contract ? JSON.stringify(fields.contract) : null);
  }
  if (sets.length === 0) return getSkillRecord(id);
  sets.push("updated_at = datetime('now')");
  values.push(id);
  db.run(`UPDATE skills SET ${sets.join(', ')} WHERE id = ?`, values);
  return getSkillRecord(id);
}

export function deleteSkill(id: string): boolean {
  const db = getDatabase();
  const result = db.run('DELETE FROM skills WHERE id = ?', [id]);
  return (result as any).changes > 0;
}

export function listSkillsByAgent(agentId: string): SkillRecord[] {
  const db = getDatabase();
  const rows = db
    .query('SELECT * FROM skills WHERE author_agent = ? ORDER BY created_at DESC')
    .all(agentId) as SkillRow[];
  return rows.map(skillRowToRecord);
}

export function forkSkill(params: {
  id: string;
  forkOfId: string;
  authorAgent?: string | null;
  authorUser?: string | null;
}): SkillRecord {
  const source = getSkillRecord(params.forkOfId);
  if (!source) throw new Error(`Skill not found: ${params.forkOfId}`);
  return createSkill({
    id: params.id,
    name: source.name,
    description: source.description,
    content: source.content,
    version: source.version,
    tier: source.tier,
    authorAgent: params.authorAgent ?? null,
    authorUser: params.authorUser ?? null,
    visibility: source.visibility,
    tags: source.tags,
    requiresTools: source.requiresTools,
    arguments: source.arguments as Record<string, unknown>,
    contract: source.contract,
    forkOf: params.forkOfId,
  });
}

interface PluginRow {
  id: string;
  agent_id: string;
  skill_id: string;
  name: string;
  description: string;
  source_code: string;
  status: string;
  active_version_id: string | null;
  error_msg: string | null;
  created_at: string;
  updated_at: string;
}

function pluginRowToRecord(row: PluginRow): AgentPlugin {
  return {
    id: row.id,
    agentId: row.agent_id,
    skillId: row.skill_id,
    name: row.name,
    description: row.description,
    sourceCode: row.source_code,
    status: row.status as PluginStatus,
    activeVersionId: row.active_version_id ?? undefined,
    errorMsg: row.error_msg ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createPlugin(params: {
  id: string;
  agentId: string;
  skillId: string;
  name: string;
  description?: string;
  sourceCode?: string;
}): AgentPlugin {
  const db = getDatabase();
  db.run(
    `INSERT INTO agent_plugins (id, agent_id, skill_id, name, description, source_code)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      params.id,
      params.agentId,
      params.skillId,
      params.name,
      params.description ?? '',
      params.sourceCode ?? '',
    ],
  );
  return getPlugin(params.id)!;
}

export function getPlugin(id: string): AgentPlugin | null {
  const db = getDatabase();
  const row = db.query('SELECT * FROM agent_plugins WHERE id = ?').get(id) as PluginRow | null;
  return row ? pluginRowToRecord(row) : null;
}

export function listPluginsByAgent(agentId: string): AgentPlugin[] {
  const db = getDatabase();
  const rows = db
    .query('SELECT * FROM agent_plugins WHERE agent_id = ? ORDER BY created_at DESC')
    .all(agentId) as PluginRow[];
  return rows.map(pluginRowToRecord);
}

export function updatePlugin(
  id: string,
  fields: Partial<{
    sourceCode: string;
    status: PluginStatus;
    activeVersionId: string | null;
    errorMsg: string | null;
  }>,
): AgentPlugin | null {
  const db = getDatabase();
  const sets: string[] = [];
  const values: unknown[] = [];
  if (fields.sourceCode !== undefined) {
    sets.push('source_code = ?');
    values.push(fields.sourceCode);
  }
  if (fields.status !== undefined) {
    sets.push('status = ?');
    values.push(fields.status);
  }
  if (fields.activeVersionId !== undefined) {
    sets.push('active_version_id = ?');
    values.push(fields.activeVersionId);
  }
  if (fields.errorMsg !== undefined) {
    sets.push('error_msg = ?');
    values.push(fields.errorMsg);
  }
  if (sets.length === 0) return getPlugin(id);
  sets.push("updated_at = datetime('now')");
  values.push(id);
  db.run(`UPDATE agent_plugins SET ${sets.join(', ')} WHERE id = ?`, values);
  return getPlugin(id);
}

export function deletePlugin(id: string): boolean {
  const db = getDatabase();
  const result = db.run('DELETE FROM agent_plugins WHERE id = ?', [id]);
  return (result as any).changes > 0;
}

interface PluginVersionRow {
  id: string;
  plugin_id: string;
  version: number;
  source_code: string;
  status: string;
  error_msg: string | null;
  created_at: string;
}

function versionRowToRecord(row: PluginVersionRow): AgentPluginVersion {
  return {
    id: row.id,
    pluginId: row.plugin_id,
    version: row.version,
    sourceCode: row.source_code,
    status: row.status as PluginStatus,
    errorMsg: row.error_msg ?? undefined,
    createdAt: row.created_at,
  };
}

export function createPluginVersion(params: {
  id: string;
  pluginId: string;
  sourceCode: string;
  status?: string;
}): AgentPluginVersion {
  const db = getDatabase();
  const maxRow = db
    .query('SELECT COALESCE(MAX(version), 0) as max_version FROM agent_plugin_versions WHERE plugin_id = ?')
    .get(params.pluginId) as { max_version: number };
  const nextVersion = maxRow.max_version + 1;
  db.run(
    `INSERT INTO agent_plugin_versions (id, plugin_id, version, source_code, status)
     VALUES (?, ?, ?, ?, ?)`,
    [params.id, params.pluginId, nextVersion, params.sourceCode, params.status ?? 'draft'],
  );
  return getPluginVersion(params.id)!;
}

export function listPluginVersions(pluginId: string): AgentPluginVersion[] {
  const db = getDatabase();
  const rows = db
    .query('SELECT * FROM agent_plugin_versions WHERE plugin_id = ? ORDER BY version DESC')
    .all(pluginId) as PluginVersionRow[];
  return rows.map(versionRowToRecord);
}

export function getPluginVersion(id: string): AgentPluginVersion | null {
  const db = getDatabase();
  const row = db
    .query('SELECT * FROM agent_plugin_versions WHERE id = ?')
    .get(id) as PluginVersionRow | null;
  return row ? versionRowToRecord(row) : null;
}

interface MarketplaceRow {
  id: string;
  agent_id: string;
  name: string;
  description: string;
  endpoint: string;
  schema: string | null;
  skill_ids: string;
  tags: string;
  price_per_call: string | null;
  payment_token: string | null;
  status: string;
  call_count: number;
  avg_response_ms: number | null;
  success_rate: number | null;
  last_active_at: string | null;
  min_reputation: number | null;
  created_at: string;
  updated_at: string;
}

function marketplaceRowToRecord(row: MarketplaceRow): MarketplaceApi {
  return {
    id: row.id,
    agentId: row.agent_id,
    name: row.name,
    description: row.description,
    endpoint: row.endpoint,
    schema: row.schema ?? undefined,
    skillIds: JSON.parse(row.skill_ids),
    tags: JSON.parse(row.tags),
    pricePerCall: row.price_per_call ?? undefined,
    paymentToken: row.payment_token ?? undefined,
    status: row.status as MarketplaceApiStatus,
    callCount: row.call_count,
    avgResponseMs: row.avg_response_ms ?? undefined,
    successRate: row.success_rate ?? undefined,
    lastActiveAt: row.last_active_at ?? undefined,
    minReputation: row.min_reputation ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createMarketplaceApi(params: {
  id: string;
  agentId: string;
  name: string;
  description: string;
  endpoint: string;
  schema?: string | null;
  skillIds?: string[];
  tags?: string[];
  pricePerCall?: string | null;
  paymentToken?: string | null;
  minReputation?: number | null;
}): MarketplaceApi {
  const db = getDatabase();
  db.run(
    `INSERT INTO marketplace_apis (id, agent_id, name, description, endpoint, schema, skill_ids, tags, price_per_call, payment_token, min_reputation)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.id,
      params.agentId,
      params.name,
      params.description,
      params.endpoint,
      params.schema ?? null,
      JSON.stringify(params.skillIds ?? []),
      JSON.stringify(params.tags ?? []),
      params.pricePerCall ?? null,
      params.paymentToken ?? null,
      params.minReputation ?? null,
    ],
  );
  return getMarketplaceApi(params.id)!;
}

export function getMarketplaceApi(id: string): MarketplaceApi | null {
  const db = getDatabase();
  const row = db
    .query('SELECT * FROM marketplace_apis WHERE id = ?')
    .get(id) as MarketplaceRow | null;
  return row ? marketplaceRowToRecord(row) : null;
}

export function listMarketplaceApis(opts?: {
  agentId?: string;
  status?: string;
  query?: string;
}): MarketplaceApi[] {
  const db = getDatabase();
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (opts?.agentId !== undefined) {
    conditions.push('agent_id = ?');
    values.push(opts.agentId);
  }
  if (opts?.status !== undefined) {
    conditions.push('status = ?');
    values.push(opts.status);
  }
  if (opts?.query !== undefined && opts.query.trim() !== '') {
    conditions.push('(name LIKE ? OR description LIKE ?)');
    const pattern = `%${opts.query}%`;
    values.push(pattern, pattern);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db
    .query(`SELECT * FROM marketplace_apis ${where} ORDER BY created_at DESC`)
    .all(...values) as MarketplaceRow[];
  return rows.map(marketplaceRowToRecord);
}

export function updateMarketplaceApi(
  id: string,
  fields: Partial<{
    name: string;
    description: string;
    schema: string | null;
    pricePerCall: string | null;
    paymentToken: string | null;
    status: MarketplaceApiStatus;
    minReputation: number | null;
  }>,
): MarketplaceApi | null {
  const db = getDatabase();
  const sets: string[] = [];
  const values: unknown[] = [];
  if (fields.name !== undefined) {
    sets.push('name = ?');
    values.push(fields.name);
  }
  if (fields.description !== undefined) {
    sets.push('description = ?');
    values.push(fields.description);
  }
  if (fields.schema !== undefined) {
    sets.push('schema = ?');
    values.push(fields.schema);
  }
  if (fields.pricePerCall !== undefined) {
    sets.push('price_per_call = ?');
    values.push(fields.pricePerCall);
  }
  if (fields.paymentToken !== undefined) {
    sets.push('payment_token = ?');
    values.push(fields.paymentToken);
  }
  if (fields.status !== undefined) {
    sets.push('status = ?');
    values.push(fields.status);
  }
  if (fields.minReputation !== undefined) {
    sets.push('min_reputation = ?');
    values.push(fields.minReputation);
  }
  if (sets.length === 0) return getMarketplaceApi(id);
  sets.push("updated_at = datetime('now')");
  values.push(id);
  db.run(`UPDATE marketplace_apis SET ${sets.join(', ')} WHERE id = ?`, values);
  return getMarketplaceApi(id);
}

export function deleteMarketplaceApi(id: string): boolean {
  const db = getDatabase();
  const result = db.run('DELETE FROM marketplace_apis WHERE id = ?', [id]);
  return (result as any).changes > 0;
}

export function incrementApiCallCount(id: string, responseMs: number, success: boolean): void {
  const db = getDatabase();
  const row = db
    .query('SELECT call_count, avg_response_ms, success_rate FROM marketplace_apis WHERE id = ?')
    .get(id) as { call_count: number; avg_response_ms: number | null; success_rate: number | null } | null;
  if (!row) return;
  const newCallCount = row.call_count + 1;
  const oldAvgMs = row.avg_response_ms ?? 0;
  const newAvgMs = oldAvgMs + (responseMs - oldAvgMs) / newCallCount;
  const oldSuccessRate = row.success_rate ?? (success ? 1 : 0);
  const newSuccessRate = oldSuccessRate + ((success ? 1 : 0) - oldSuccessRate) / newCallCount;
  db.run(
    `UPDATE marketplace_apis SET call_count = ?, avg_response_ms = ?, success_rate = ?, last_active_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
    [newCallCount, newAvgMs, newSuccessRate, id],
  );
}
