import { Hono } from 'hono';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http, formatUnits } from 'viem';
import { mantle, mantleSepoliaTestnet } from 'viem/chains';
import { encrypt } from '../../core/crypto.ts';
import type { AgentManager } from '../../core/agent-manager.ts';
import * as repo from '../../db/repository.ts';
import { toAgentPublic } from '../../shared/types.ts';

export function createAgentRoutes(manager: AgentManager) {
  const app = new Hono();

  app.post('/agents', async (c) => {
    const body = await c.req.json();
    const { name, persona, modelProvider, skills, skillArgs, creatorAddress, autoStart } = body;

    if (!name || !persona) {
      return c.json({ error: 'name and persona are required' }, 400);
    }

    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const walletAddress = account.address;
    const encryptedPrivateKey = encrypt(privateKey);

    const id = crypto.randomUUID();
    const record = repo.createAgent({
      id,
      name,
      persona,
      modelProvider: modelProvider || 'openrouter',
      skills: Array.isArray(skills) ? skills : [],
      skillArgs: skillArgs || {},
      walletAddress,
      encryptedPrivateKey,
      creatorAddress: creatorAddress || null,
    });

    const agent = toAgentPublic(record);

    if (autoStart) {
      try {
        await manager.start(id);
        agent.status = 'running';
      } catch (err) {
        agent.status = 'error';
      }
    }

    return c.json({ agent }, 201);
  });

  app.get('/agents', (c) => {
    const records = repo.listAgents();
    const agents = records.map((r) => {
      const pub = toAgentPublic(r);
      if (manager.isRunning(r.id) && r.status !== 'running') {
        pub.status = 'running';
      }
      return pub;
    });
    return c.json({ agents });
  });

  app.get('/agents/:id', async (c) => {
    const id = c.req.param('id');
    const record = repo.getAgent(id);
    if (!record) return c.json({ error: 'Agent not found' }, 404);

    const agent = toAgentPublic(record);

    try {
      const [mantleBal, sepoliaBal] = await Promise.all([
        fetchBalance(record.walletAddress, mantle),
        fetchBalance(record.walletAddress, mantleSepoliaTestnet),
      ]);
      agent.balance = { mantle: mantleBal, mantleSepolia: sepoliaBal };
    } catch {
      agent.balance = { mantle: 'unavailable', mantleSepolia: 'unavailable' };
    }

    return c.json({ agent });
  });

  app.patch('/agents/:id', async (c) => {
    const id = c.req.param('id');
    const existing = repo.getAgent(id);
    if (!existing) return c.json({ error: 'Agent not found' }, 404);

    if (manager.isRunning(id)) {
      return c.json({ error: 'Cannot update a running agent. Stop it first.' }, 409);
    }

    const body = await c.req.json();
    const updated = repo.updateAgent(id, {
      name: body.name,
      persona: body.persona,
      modelProvider: body.modelProvider,
      skills: body.skills,
      skillArgs: body.skillArgs,
    });

    return c.json({ agent: updated ? toAgentPublic(updated) : null });
  });

  app.delete('/agents/:id', async (c) => {
    const id = c.req.param('id');
    const existing = repo.getAgent(id);
    if (!existing) return c.json({ error: 'Agent not found' }, 404);

    if (manager.isRunning(id)) {
      await manager.stop(id);
    }

    repo.deleteAgent(id);
    return c.body(null, 204);
  });

  app.post('/agents/:id/start', async (c) => {
    const id = c.req.param('id');
    const record = repo.getAgent(id);
    if (!record) return c.json({ error: 'Agent not found' }, 404);

    if (manager.isRunning(id)) {
      return c.json({ error: 'Agent is already running' }, 409);
    }

    try {
      await manager.start(id);
      return c.json({ status: 'running' });
    } catch (err: any) {
      return c.json({ error: `Failed to start: ${err.message}` }, 500);
    }
  });

  app.post('/agents/:id/stop', async (c) => {
    const id = c.req.param('id');
    if (!manager.isRunning(id)) {
      return c.json({ error: 'Agent is not running' }, 409);
    }

    await manager.stop(id);
    return c.json({ status: 'stopped' });
  });

  return app;
}

async function fetchBalance(address: string, chain: typeof mantle): Promise<string> {
  const client = createPublicClient({ chain, transport: http() });
  const balance = await client.getBalance({ address: address as `0x${string}` });
  return formatUnits(balance, 18);
}
