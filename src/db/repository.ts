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
