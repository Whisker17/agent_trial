import { Hono } from 'hono';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import {
  createPublicClient,
  createWalletClient,
  http,
  formatUnits,
  encodeDeployData,
  isAddress,
  zeroAddress,
} from 'viem';
import { mantle, mantleSepoliaTestnet } from 'viem/chains';
import type { Chain } from 'viem';
import { encrypt, decrypt } from '../../core/crypto.ts';
import { noProxyFetch } from '../../core/no-proxy-fetch.ts';
import { compileSolidity } from '../../contracts/compiler.ts';
import { ERC20_SOURCE } from '../../contracts/erc20.ts';
import type { AgentManager } from '../../core/agent-manager.ts';
import * as repo from '../../db/repository.ts';
import { toAgentPublic, type AgentRecord } from '../../shared/types.ts';
import {
  validateTransferTokenConfig,
  type AssetNetwork,
} from '../../config/transfer-tokens.ts';

function rpcTransport(chain: Chain) {
  const url = chain.rpcUrls.default.http[0];
  return http(url, { fetchFn: noProxyFetch });
}

type DeployNetwork = 'mantle' | 'mantleSepolia';
type SweepNetwork = AssetNetwork;

function toMntUnits(value: bigint): string {
  return formatUnits(value, 18);
}

const ERC20_TRANSFER_ABI = [
  {
    inputs: [{ name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

interface SweepTransferResult {
  network: SweepNetwork;
  assetType: 'NATIVE' | 'ERC20';
  symbol: string;
  amount: string;
  txHash: string;
}

interface SweepSummary {
  from: string;
  destination: string;
  transfers: SweepTransferResult[];
}

type SweepResult =
  | { ok: true; summary: SweepSummary }
  | { ok: false; status: number; payload: { error: string; code: string; details: unknown } };

interface SweepContext {
  destination: `0x${string}`;
  config: Extract<ReturnType<typeof validateTransferTokenConfig>, { ok: true }>;
}
type SweepFailure = Extract<SweepResult, { ok: false }>;

function chainFromNetwork(network: SweepNetwork): Chain {
  return network === 'mantle' ? mantle : mantleSepoliaTestnet;
}

function sweepError(
  status: number,
  code:
    | 'MISSING_CREATOR_ADDRESS'
    | 'INVALID_CREATOR_ADDRESS'
    | 'TOKEN_CONFIG_MISSING'
    | 'INSUFFICIENT_SWEEP_GAS'
    | 'ASSET_TRANSFER_FAILED',
  error: string,
  details: unknown,
): SweepResult {
  return { ok: false, status, payload: { error, code, details } };
}

async function sweepAgentAssets(record: AgentRecord): Promise<SweepResult> {
  const preflight = preflightSweep(record);
  if (!preflight.ok) return preflight;
  const { destination, config } = preflight.context;

  const privateKey = decrypt(record.encryptedPrivateKey) as `0x${string}`;
  const account = privateKeyToAccount(privateKey);

  const summary: SweepSummary = {
    from: account.address,
    destination,
    transfers: [],
  };

  for (const network of ['mantle', 'mantleSepolia'] as const) {
    const chain = chainFromNetwork(network);
    const pc = createPublicClient({ chain, transport: rpcTransport(chain) });
    const wc = createWalletClient({
      account,
      chain,
      transport: rpcTransport(chain),
    });

    for (const token of config.tokensByNetwork[network]) {
      let balance: bigint;
      try {
        balance = (await pc.readContract({
          address: token.address,
          abi: ERC20_TRANSFER_ABI,
          functionName: 'balanceOf',
          args: [account.address],
        })) as bigint;
      } catch (err: any) {
        return sweepError(
          409,
          'ASSET_TRANSFER_FAILED',
          `Failed to check ${token.symbol} balance on ${network}.`,
          {
            network,
            symbol: token.symbol,
            stage: 'BALANCE_CHECK',
            message: err?.message || String(err),
          },
        );
      }

      if (balance === 0n) continue;

      let hash: `0x${string}`;
      try {
        hash = await wc.writeContract({
          address: token.address,
          abi: ERC20_TRANSFER_ABI,
          functionName: 'transfer',
          args: [destination, balance],
        });
      } catch (err: any) {
        return sweepError(
          409,
          'ASSET_TRANSFER_FAILED',
          `Failed to submit ${token.symbol} transfer on ${network}.`,
          {
            network,
            symbol: token.symbol,
            stage: 'TRANSFER_SUBMIT',
            message: err?.message || String(err),
          },
        );
      }

      try {
        const receipt = await pc.waitForTransactionReceipt({ hash });
        if (receipt.status !== 'success') {
          return sweepError(
            409,
            'ASSET_TRANSFER_FAILED',
            `${token.symbol} transfer reverted on ${network}.`,
            {
              network,
              symbol: token.symbol,
              stage: 'TRANSFER_RECEIPT',
              txHash: hash,
              receiptStatus: receipt.status,
            },
          );
        }
      } catch (err: any) {
        return sweepError(
          409,
          'ASSET_TRANSFER_FAILED',
          `Failed to confirm ${token.symbol} transfer on ${network}.`,
          {
            network,
            symbol: token.symbol,
            stage: 'TRANSFER_RECEIPT',
            txHash: hash,
            message: err?.message || String(err),
          },
        );
      }

      summary.transfers.push({
        network,
        assetType: 'ERC20',
        symbol: token.symbol,
        amount: formatUnits(balance, token.decimals),
        txHash: hash,
      });
    }

    let nativeBalance: bigint;
    try {
      nativeBalance = await pc.getBalance({ address: account.address });
    } catch (err: any) {
      return sweepError(
        409,
        'ASSET_TRANSFER_FAILED',
        `Failed to read native balance on ${network}.`,
        {
          network,
          symbol: 'MNT',
          stage: 'NATIVE_BALANCE',
          message: err?.message || String(err),
        },
      );
    }

    if (nativeBalance === 0n) continue;

    let gasPriceWei: bigint;
    try {
      const feeEstimate = await pc.estimateFeesPerGas();
      gasPriceWei = feeEstimate.maxFeePerGas ?? feeEstimate.gasPrice ?? 0n;
      if (!gasPriceWei) gasPriceWei = await pc.getGasPrice();
    } catch (err: any) {
      return sweepError(
        409,
        'ASSET_TRANSFER_FAILED',
        `Failed to estimate gas price for native transfer on ${network}.`,
        {
          network,
          symbol: 'MNT',
          stage: 'NATIVE_GAS_PRICE',
          message: err?.message || String(err),
        },
      );
    }

    let gasEstimate: bigint;
    try {
      gasEstimate = await pc.estimateGas({
        account: account.address,
        to: destination,
        value: 0n,
      });
    } catch (err: any) {
      return sweepError(
        409,
        'ASSET_TRANSFER_FAILED',
        `Failed to estimate native transfer gas on ${network}.`,
        {
          network,
          symbol: 'MNT',
          stage: 'NATIVE_GAS_ESTIMATE',
          message: err?.message || String(err),
        },
      );
    }

    const reserveWei = ((gasEstimate * gasPriceWei) * 12n) / 10n;
    if (nativeBalance <= reserveWei) {
      return sweepError(
        409,
        'INSUFFICIENT_SWEEP_GAS',
        `Insufficient MNT on ${network} to complete native asset sweep.`,
        {
          network,
          balanceMnt: toMntUnits(nativeBalance),
          requiredMnt: toMntUnits(reserveWei),
          shortfallMnt: toMntUnits(reserveWei - nativeBalance),
          destination,
        },
      );
    }

    const sendValue = nativeBalance - reserveWei;
    let nativeHash: `0x${string}`;
    try {
      nativeHash = await wc.sendTransaction({
        to: destination,
        value: sendValue,
      });
    } catch (err: any) {
      return sweepError(
        409,
        'ASSET_TRANSFER_FAILED',
        `Failed to submit native transfer on ${network}.`,
        {
          network,
          symbol: 'MNT',
          stage: 'NATIVE_TRANSFER_SUBMIT',
          message: err?.message || String(err),
        },
      );
    }

    try {
      const nativeReceipt = await pc.waitForTransactionReceipt({ hash: nativeHash });
      if (nativeReceipt.status !== 'success') {
        return sweepError(
          409,
          'ASSET_TRANSFER_FAILED',
          `Native transfer reverted on ${network}.`,
          {
            network,
            symbol: 'MNT',
            stage: 'NATIVE_TRANSFER_RECEIPT',
            txHash: nativeHash,
            receiptStatus: nativeReceipt.status,
          },
        );
      }
    } catch (err: any) {
      return sweepError(
        409,
        'ASSET_TRANSFER_FAILED',
        `Failed to confirm native transfer on ${network}.`,
        {
          network,
          symbol: 'MNT',
          stage: 'NATIVE_TRANSFER_RECEIPT',
          txHash: nativeHash,
          message: err?.message || String(err),
        },
      );
    }

    summary.transfers.push({
      network,
      assetType: 'NATIVE',
      symbol: 'MNT',
      amount: toMntUnits(sendValue),
      txHash: nativeHash,
    });
  }

  return { ok: true, summary };
}

function preflightSweep(
  record: AgentRecord,
): { ok: true; context: SweepContext } | SweepFailure {
  if (!record.creatorAddress) {
    return sweepError(
      400,
      'MISSING_CREATOR_ADDRESS',
      'Creator address is required before deleting an agent with asset sweep enabled.',
      { agentId: record.id, reason: 'CREATOR_ADDRESS_MISSING' },
    );
  }
  if (
    !isAddress(record.creatorAddress) ||
    record.creatorAddress.toLowerCase() === zeroAddress
  ) {
    return sweepError(
      400,
      'INVALID_CREATOR_ADDRESS',
      'Creator address is invalid. Cannot sweep assets before deletion.',
      { agentId: record.id, creatorAddress: record.creatorAddress },
    );
  }

  const configValidation = validateTransferTokenConfig();
  if (!configValidation.ok) {
    return { ok: false, status: 409, payload: configValidation.configError };
  }

  return {
    ok: true,
    context: { destination: record.creatorAddress as `0x${string}`, config: configValidation },
  };
}

export function createAgentRoutes(manager: AgentManager) {
  const app = new Hono();

  app.post('/agents', async (c) => {
    const userId: string | undefined = c.get('userId');
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
      userId: userId || null,
    });

    const agent = toAgentPublic(record);

    if (autoStart) {
      try {
        await manager.start(id);
        agent.status = 'running';
      } catch {
        agent.status = 'error';
      }
    }

    return c.json({ agent }, 201);
  });

  app.get('/agents', (c) => {
    const userId: string | undefined = c.get('userId');
    const records = repo.listAgents(userId);
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
    const userId: string | undefined = c.get('userId');
    const record = repo.getAgent(id, userId);
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
    const userId: string | undefined = c.get('userId');
    const existing = repo.getAgent(id, userId);
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
      onChainMeta: body.onChainMeta,
    });

    return c.json({ agent: updated ? toAgentPublic(updated) : null });
  });

  app.delete('/agents/:id', async (c) => {
    const id = c.req.param('id');
    const userId: string | undefined = c.get('userId');
    const existing = repo.getAgent(id, userId);
    if (!existing) return c.json({ error: 'Agent not found' }, 404);

    const sweepPreflight = preflightSweep(existing);
    if (!sweepPreflight.ok) {
      return c.json(sweepPreflight.payload, sweepPreflight.status);
    }

    if (manager.isRunning(id)) {
      await manager.stop(id);
    }

    const sweepResult = await sweepAgentAssets(existing);
    if (!sweepResult.ok) {
      return c.json(sweepResult.payload, sweepResult.status);
    }

    repo.deleteAgent(id);
    return c.json({ success: true, sweep: sweepResult.summary });
  });

  app.post('/agents/:id/start', async (c) => {
    const id = c.req.param('id');
    const userId: string | undefined = c.get('userId');
    const record = repo.getAgent(id, userId);
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

  app.post('/agents/:id/deploy-token', async (c) => {
    const id = c.req.param('id');
    const userId: string | undefined = c.get('userId');
    const record = repo.getAgent(id, userId);
    if (!record) return c.json({ error: 'Agent not found' }, 404);

    const body = await c.req.json();
    const { tokenName, tokenSymbol, initialSupply, network } = body;
    if (!tokenName || !tokenSymbol) {
      return c.json({ error: 'tokenName and tokenSymbol are required' }, 400);
    }

    const networkKey: DeployNetwork =
      network === 'mantle' ? 'mantle' : 'mantleSepolia';
    const chain = networkKey === 'mantle' ? mantle : mantleSepoliaTestnet;
    const supply = BigInt(initialSupply || 1000000);

    try {
      const privateKey = decrypt(record.encryptedPrivateKey) as `0x${string}`;
      const account = privateKeyToAccount(privateKey);
      const wc = createWalletClient({
        account,
        chain,
        transport: rpcTransport(chain),
      });
      const pc = createPublicClient({ chain, transport: rpcTransport(chain) });

      const compiled = compileSolidity(ERC20_SOURCE, 'SimpleERC20');
      const deployData = encodeDeployData({
        abi: compiled.abi,
        bytecode: compiled.bytecode,
        args: [tokenName, tokenSymbol, supply],
      });
      const [gasEstimate, feeEstimate, balanceWei] = await Promise.all([
        pc.estimateGas({
          data: deployData,
        }),
        pc.estimateFeesPerGas(),
        pc.getBalance({ address: account.address }),
      ]);

      let gasPriceWei = feeEstimate.maxFeePerGas ?? feeEstimate.gasPrice;
      if (!gasPriceWei) {
        gasPriceWei = await pc.getGasPrice();
      }
      // Keep a safety margin for fee fluctuation between estimate and send.
      const requiredWei = ((gasEstimate * gasPriceWei) * 12n) / 10n;

      if (balanceWei < requiredWei) {
        const shortfallWei = requiredWei - balanceWei;
        return c.json(
          {
            error: 'Agent wallet has insufficient MNT for token deployment gas.',
            code: 'INSUFFICIENT_AGENT_GAS',
            details: {
              requiredMnt: toMntUnits(requiredWei),
              balanceMnt: toMntUnits(balanceWei),
              shortfallMnt: toMntUnits(shortfallWei),
              fundTo: account.address,
              network: networkKey,
            },
          },
          400,
        );
      }

      const hash = await wc.deployContract({
        abi: compiled.abi,
        bytecode: compiled.bytecode,
        args: [tokenName, tokenSymbol, supply],
      });

      const receipt = await pc.waitForTransactionReceipt({ hash });
      const contractAddress = receipt.contractAddress!;

      repo.updateAgent(id, {
        onChainMeta: {
          ...(record.onChainMeta ? JSON.parse(record.onChainMeta) : {}),
          governanceToken: {
            address: contractAddress,
            name: tokenName,
            symbol: tokenSymbol,
            supply: supply.toString(),
            txHash: hash,
            network: networkKey,
          },
        },
      });

      return c.json({
        success: true,
        token: { address: contractAddress, txHash: hash },
      });
    } catch (err: any) {
      return c.json({ error: `Token deployment failed: ${err.message}` }, 500);
    }
  });

  return app;
}

async function fetchBalance(address: string, chain: typeof mantle): Promise<string> {
  const client = createPublicClient({ chain, transport: rpcTransport(chain) });
  const balance = await client.getBalance({ address: address as `0x${string}` });
  return formatUnits(balance, 18);
}
