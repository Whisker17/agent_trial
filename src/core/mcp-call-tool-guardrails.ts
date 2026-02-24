import type {
  Content,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from '@elizaos/core';

const MCP_SERVICE_NAME = 'mcp';
const BLOCKSCOUT_SERVER_NAME = 'blockscout';
const BLOCKSCOUT_UNLOCK_TOOL_NAME = '__unlock_blockchain_analysis__';

type ToolCallRecord = {
  serverName: string;
  toolName: string;
};

type McpToolConfig = {
  description?: string;
  inputSchema?: Record<string, unknown>;
};

type McpServerConfig = {
  status?: string;
  tools?: Record<string, McpToolConfig>;
};

type McpServerMap = Record<string, McpServerConfig>;

type McpProviderData = {
  values?: { mcp?: McpServerMap };
  data?: { mcp?: McpServerMap };
};

type McpServiceLike = {
  callTool: (
    serverName: string,
    toolName: string,
    args?: Record<string, unknown>,
  ) => Promise<unknown>;
  getProviderData?: () => McpProviderData;
};

type AnyAction = {
  name?: string;
  handler?: (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: Record<string, unknown>,
    callback?: HandlerCallback,
    responses?: Memory[],
  ) => Promise<unknown>;
  __mantleCallToolGuardPatched?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getMcpServerMapFromState(state: State): McpServerMap | null {
  const mcp = (state as { values?: { mcp?: unknown } } | undefined)?.values?.mcp;
  return isRecord(mcp) ? (mcp as McpServerMap) : null;
}

function getMcpServerMapFromProviderData(
  providerData: McpProviderData | undefined,
): McpServerMap | null {
  const valuesMcp = providerData?.values?.mcp;
  if (isRecord(valuesMcp)) return valuesMcp as McpServerMap;
  const dataMcp = providerData?.data?.mcp;
  if (isRecord(dataMcp)) return dataMcp as McpServerMap;
  return null;
}

function normalizeStateWithUniqueTools(state: State): State {
  const servers = getMcpServerMapFromState(state);
  if (!servers) return state;

  const clonedServers: McpServerMap = {};
  for (const [serverName, server] of Object.entries(servers)) {
    clonedServers[serverName] = {
      ...server,
      tools: { ...(server.tools ?? {}) },
    };
  }

  const uniqueToolMap = new Map<string, { serverName: string; config: McpToolConfig; count: number }>();

  for (const [serverName, server] of Object.entries(clonedServers)) {
    if (server.status !== 'connected') continue;
    for (const [toolName, toolConfig] of Object.entries(server.tools ?? {})) {
      const existing = uniqueToolMap.get(toolName);
      if (existing) {
        existing.count += 1;
        continue;
      }
      uniqueToolMap.set(toolName, { serverName, config: toolConfig, count: 1 });
    }
  }

  for (const [toolName, toolEntry] of uniqueToolMap) {
    if (toolEntry.count !== 1) continue;
    for (const server of Object.values(clonedServers)) {
      if (server.status !== 'connected') continue;
      if (!server.tools) server.tools = {};
      if (!server.tools[toolName]) {
        server.tools[toolName] = toolEntry.config;
      }
    }
  }

  const values = (state as { values?: Record<string, unknown> }).values ?? {};
  return {
    ...(state as Record<string, unknown>),
    values: {
      ...values,
      mcp: clonedServers,
    },
  } as unknown as State;
}

function getUniqueConnectedServerForTool(
  servers: McpServerMap | null,
  toolName: string,
): string | null {
  if (!servers) return null;

  const matches: string[] = [];
  for (const [serverName, server] of Object.entries(servers)) {
    if (server.status !== 'connected') continue;
    if (server.tools?.[toolName]) matches.push(serverName);
  }

  return matches.length === 1 ? matches[0] : null;
}

function isBlockscoutSessionInitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /session\s+not\s+initialized/i.test(message) ||
    /must\s+call\s+__unlock_blockchain_analysis__/i.test(message)
  );
}

function isUnlockOnlyToolSequence(toolCalls: ToolCallRecord[]): boolean {
  return (
    toolCalls.length > 0 &&
    toolCalls.every(
      (call) =>
        call.serverName === BLOCKSCOUT_SERVER_NAME &&
        call.toolName === BLOCKSCOUT_UNLOCK_TOOL_NAME,
    )
  );
}

function addFollowupHint(message: Memory): Memory {
  const existingText = typeof message.content?.text === 'string' ? message.content.text : '';
  const hint =
    'System context: Blockscout is already unlocked; choose the tool that directly answers the user request and do not call __unlock_blockchain_analysis__ again.';

  const content: Content = {
    ...(message.content ?? {}),
    text: `${existingText}\n\n${hint}`,
  };

  return {
    ...message,
    content,
  };
}

export function patchMcpCallToolAction(plugin: unknown): void {
  if (!isRecord(plugin)) return;

  const maybeActions = plugin.actions;
  if (!Array.isArray(maybeActions)) return;

  const action = maybeActions.find(
    (candidate) => isRecord(candidate) && candidate.name === 'CALL_TOOL',
  ) as AnyAction | undefined;
  if (!action || typeof action.handler !== 'function') return;
  if (action.__mantleCallToolGuardPatched) return;

  const originalHandler = action.handler;

  action.handler = async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: Record<string, unknown>,
    callback?: HandlerCallback,
    responses?: Memory[],
  ) => {
    const runOnce = async (withFollowupHint: boolean) => {
      const mcpService = runtime.getService(MCP_SERVICE_NAME) as McpServiceLike | null;
      const callbackPayloads: Content[] = [];
      const toolCalls: ToolCallRecord[] = [];

      const wrappedCallback: HandlerCallback | undefined = callback
        ? async (content: Content) => {
            callbackPayloads.push(content);
            return [];
          }
        : undefined;

      if (!mcpService || typeof mcpService.callTool !== 'function') {
        const result = await originalHandler(
          runtime,
          withFollowupHint ? addFollowupHint(message) : message,
          state,
          options,
          wrappedCallback,
          responses,
        );
        return {
          result,
          callbackPayload: callbackPayloads.at(-1),
          toolCalls,
        };
      }

      const wrappedService = new Proxy(mcpService as Record<string, unknown>, {
        get(target, property, receiver) {
          if (property !== 'callTool') return Reflect.get(target, property, receiver);

          return async (
            requestedServerName: string,
            toolName: string,
            args?: Record<string, unknown>,
          ) => {
            const providerData =
              typeof mcpService.getProviderData === 'function'
                ? mcpService.getProviderData()
                : undefined;
            const uniqueServer = getUniqueConnectedServerForTool(
              getMcpServerMapFromProviderData(providerData),
              toolName,
            );
            const resolvedServer = uniqueServer ?? requestedServerName;

            toolCalls.push({ serverName: resolvedServer, toolName });

            try {
              return await mcpService.callTool(resolvedServer, toolName, args);
            } catch (error) {
              const shouldUnlockAndRetry =
                resolvedServer === BLOCKSCOUT_SERVER_NAME &&
                toolName !== BLOCKSCOUT_UNLOCK_TOOL_NAME &&
                isBlockscoutSessionInitError(error);

              if (!shouldUnlockAndRetry) throw error;

              await mcpService.callTool(
                BLOCKSCOUT_SERVER_NAME,
                BLOCKSCOUT_UNLOCK_TOOL_NAME,
                {},
              );
              return mcpService.callTool(resolvedServer, toolName, args);
            }
          };
        },
      }) as McpServiceLike;

      const runtimeProxy = new Proxy(runtime as unknown as Record<string, unknown>, {
        get(target, property, receiver) {
          if (property === 'getService') {
            return (name: string) => {
              if (name === MCP_SERVICE_NAME) return wrappedService;
              return runtime.getService(name);
            };
          }

          if (property === 'composeState') {
            return async (...args: unknown[]) => {
              const composedState = await runtime.composeState(
                args[0] as Memory,
                args[1] as string[],
              );
              return normalizeStateWithUniqueTools(composedState);
            };
          }

          return Reflect.get(target, property, receiver);
        },
      }) as unknown as IAgentRuntime;

      const result = await originalHandler(
        runtimeProxy,
        withFollowupHint ? addFollowupHint(message) : message,
        state,
        options,
        wrappedCallback,
        responses,
      );

      return {
        result,
        callbackPayload: callbackPayloads.at(-1),
        toolCalls,
      };
    };

    const firstPass = await runOnce(false);
    const shouldRetry = isUnlockOnlyToolSequence(firstPass.toolCalls);
    const secondPass = shouldRetry ? await runOnce(true) : null;

    const finalResult = secondPass?.result ?? firstPass.result;
    const finalCallbackPayload =
      secondPass?.callbackPayload ?? firstPass.callbackPayload;

    if (callback && finalCallbackPayload) {
      await callback(finalCallbackPayload);
    }

    return finalResult;
  };

  action.__mantleCallToolGuardPatched = true;
}
