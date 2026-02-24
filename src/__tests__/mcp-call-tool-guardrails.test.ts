import { describe, expect, it } from 'bun:test';
import { patchMcpCallToolAction } from '../core/mcp-call-tool-guardrails';

type CallRecord = {
  serverName: string;
  toolName: string;
  args?: Record<string, unknown>;
};

type ProviderData = {
  text: string;
  values: {
    mcp: Record<
      string,
      {
        status: string;
        tools: Record<
          string,
          {
            description: string;
            inputSchema: Record<string, unknown>;
          }
        >;
        resources: Record<string, unknown>;
      }
    >;
  };
  data: {
    mcp: Record<string, unknown>;
  };
};

function buildProviderData(): ProviderData {
  const mcp = {
    'eth-mcp': {
      status: 'connected',
      tools: {
        stack_status: {
          description: 'Stack status',
          inputSchema: { type: 'object', properties: {} },
        },
      },
      resources: {},
    },
    blockscout: {
      status: 'connected',
      tools: {
        __unlock_blockchain_analysis__: {
          description: 'Unlock Blockscout',
          inputSchema: { type: 'object', properties: {} },
        },
        get_address_info: {
          description: 'Get address info',
          inputSchema: {
            type: 'object',
            required: ['chain_id', 'address'],
            properties: {
              chain_id: { type: 'string' },
              address: { type: 'string' },
            },
          },
        },
      },
      resources: {},
    },
  };

  return {
    text: '# MCP Configuration',
    values: { mcp },
    data: { mcp },
  };
}

async function loadCallToolAction() {
  const module = await import('@fleek-platform/eliza-plugin-mcp');
  const clonedPlugin = {
    ...module.default,
    actions: (module.default.actions ?? []).map((action: Record<string, unknown>) => ({
      ...action,
    })),
  };
  patchMcpCallToolAction(clonedPlugin);

  const action = clonedPlugin.actions.find(
    (candidate: Record<string, unknown>) => candidate.name === 'CALL_TOOL',
  ) as
    | {
        handler: (
          runtime: any,
          message: any,
          state: any,
          options: any,
          callback?: (content: any) => Promise<any[]>,
          responses?: any[],
        ) => Promise<boolean>;
      }
    | undefined;
  if (!action) throw new Error('CALL_TOOL action not found');
  return action;
}

function createRuntime({
  providerData,
  mcpService,
  modelResponses,
}: {
  providerData: ProviderData;
  mcpService: {
    getProviderData: () => ProviderData;
    callTool: (
      serverName: string,
      toolName: string,
      args?: Record<string, unknown>,
    ) => Promise<unknown>;
  };
  modelResponses: string[];
}) {
  const prompts: string[] = [];
  const runtime = {
    agentId: 'agent-1',
    composeState: async () => ({
      text: '',
      values: providerData.values,
      data: providerData.data,
    }),
    getService: (name: string) => (name === 'mcp' ? mcpService : null),
    useModel: async (_modelClass: unknown, params: { prompt: string }) => {
      prompts.push(params.prompt);
      const next = modelResponses.shift();
      if (!next) throw new Error('No mocked model response left');
      return next;
    },
    addEmbeddingToMemory: async (memory: Record<string, unknown>) => memory,
    createMemory: async () => {},
  };

  return { runtime, prompts };
}

describe('MCP CALL_TOOL guardrails', () => {
  it('reroutes uniquely named tools to the correct server and auto-unlocks Blockscout', async () => {
    const providerData = buildProviderData();
    const callHistory: CallRecord[] = [];
    let unlocked = false;

    const mcpService = {
      getProviderData: () => providerData,
      callTool: async (
        serverName: string,
        toolName: string,
        args?: Record<string, unknown>,
      ) => {
        callHistory.push({ serverName, toolName, args });
        if (serverName === 'blockscout' && toolName === '__unlock_blockchain_analysis__') {
          unlocked = true;
          return { content: [{ type: 'text', text: 'unlocked' }] };
        }
        if (serverName === 'blockscout' && toolName === 'get_address_info') {
          if (!unlocked) throw new Error('Session Not Initialized');
          return {
            content: [{ type: 'text', text: '{"balance":"1230000000000000000"}' }],
          };
        }
        throw new Error(`Unexpected call: ${serverName}.${toolName}`);
      },
    };

    const modelResponses = [
      JSON.stringify({
        serverName: 'eth-mcp',
        toolName: 'get_address_info',
        arguments: {
          chain_id: '5003',
          address: '0x1234567890123456789012345678901234567890',
        },
        reasoning: 'Need address info for balance lookup',
      }),
      'Balance is 1.23 MNT on Mantle Sepolia.',
    ];

    const { runtime } = createRuntime({ providerData, mcpService, modelResponses });
    const action = await loadCallToolAction();
    const callbackPayloads: Array<{ text?: string }> = [];

    await action.handler(
      runtime,
      {
        entityId: 'user-1',
        roomId: 'room-1',
        content: { text: "what's your wallet balance on Mantle Sepolia testnet" },
      },
      {},
      {},
      async (content: { text?: string }) => {
        callbackPayloads.push(content);
        return [];
      },
      [],
    );

    expect(callHistory.some((call) => call.serverName === 'eth-mcp')).toBe(false);
    expect(
      callHistory.some(
        (call) =>
          call.serverName === 'blockscout' &&
          call.toolName === '__unlock_blockchain_analysis__',
      ),
    ).toBe(true);
    expect(
      callHistory.some(
        (call) =>
          call.serverName === 'blockscout' && call.toolName === 'get_address_info',
      ),
    ).toBe(true);
    expect(callbackPayloads).toHaveLength(1);
    expect(callbackPayloads[0]?.text).toBe('Balance is 1.23 MNT on Mantle Sepolia.');
  });

  it('retries once when the first pass only runs Blockscout unlock', async () => {
    const providerData = buildProviderData();
    const callHistory: CallRecord[] = [];
    let unlocked = false;

    const mcpService = {
      getProviderData: () => providerData,
      callTool: async (
        serverName: string,
        toolName: string,
        args?: Record<string, unknown>,
      ) => {
        callHistory.push({ serverName, toolName, args });
        if (serverName === 'blockscout' && toolName === '__unlock_blockchain_analysis__') {
          unlocked = true;
          return { content: [{ type: 'text', text: 'unlocked' }] };
        }
        if (serverName === 'blockscout' && toolName === 'get_address_info') {
          if (!unlocked) throw new Error('Session Not Initialized');
          return {
            content: [{ type: 'text', text: '{"balance":"420000000000000000"}' }],
          };
        }
        throw new Error(`Unexpected call: ${serverName}.${toolName}`);
      },
    };

    const modelResponses = [
      JSON.stringify({
        serverName: 'blockscout',
        toolName: '__unlock_blockchain_analysis__',
        arguments: {},
        reasoning: 'Need to initialize blockscout first',
      }),
      'Unlock complete.',
      JSON.stringify({
        serverName: 'blockscout',
        toolName: 'get_address_info',
        arguments: {
          chain_id: '5003',
          address: '0x1234567890123456789012345678901234567890',
        },
        reasoning: 'Now read wallet balance',
      }),
      'Wallet balance is 0.42 MNT.',
    ];

    const { runtime } = createRuntime({ providerData, mcpService, modelResponses });
    const action = await loadCallToolAction();
    const callbackPayloads: Array<{ text?: string }> = [];

    await action.handler(
      runtime,
      {
        entityId: 'user-1',
        roomId: 'room-1',
        content: { text: "what's your wallet balance on Mantle Sepolia testnet" },
      },
      {},
      {},
      async (content: { text?: string }) => {
        callbackPayloads.push(content);
        return [];
      },
      [],
    );

    const unlockCalls = callHistory.filter(
      (call) =>
        call.serverName === 'blockscout' &&
        call.toolName === '__unlock_blockchain_analysis__',
    );
    const addressInfoCalls = callHistory.filter(
      (call) =>
        call.serverName === 'blockscout' && call.toolName === 'get_address_info',
    );

    expect(unlockCalls.length).toBeGreaterThan(0);
    expect(addressInfoCalls.length).toBeGreaterThan(0);
    expect(callbackPayloads).toHaveLength(1);
    expect(callbackPayloads[0]?.text).toBe('Wallet balance is 0.42 MNT.');
  });
});
