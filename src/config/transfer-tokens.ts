import { isAddress, zeroAddress } from 'viem';
import rawConfig from './transfer-tokens.json';

export type AssetNetwork = 'mantle' | 'mantleSepolia';

export interface TransferToken {
  symbol: string;
  address: `0x${string}`;
  decimals: number;
}

interface RawTransferToken {
  symbol: string;
  address: string;
  decimals: number;
}

interface RawConfig {
  requiredSymbols: string[];
  networks: Record<AssetNetwork, { tokens: RawTransferToken[] }>;
}

export interface TransferTokenConfigError {
  code: 'TOKEN_CONFIG_MISSING';
  error: string;
  details: {
    network?: AssetNetwork;
    symbol?: string;
    reason: string;
  };
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

export function validateTransferTokenConfig():
  | { ok: true; requiredSymbols: string[]; tokensByNetwork: Record<AssetNetwork, TransferToken[]> }
  | { ok: false; configError: TransferTokenConfigError } {
  const config = rawConfig as RawConfig;
  const requiredSymbols = Array.isArray(config.requiredSymbols)
    ? config.requiredSymbols.map(normalizeSymbol)
    : [];

  if (requiredSymbols.length === 0) {
    return {
      ok: false,
      configError: {
        code: 'TOKEN_CONFIG_MISSING',
        error: 'Transfer token configuration is missing requiredSymbols.',
        details: { reason: 'REQUIRED_SYMBOLS_MISSING' },
      },
    };
  }

  const tokensByNetwork = {} as Record<AssetNetwork, TransferToken[]>;
  for (const network of ['mantle', 'mantleSepolia'] as const) {
    const networkTokens = config.networks?.[network]?.tokens;
    if (!Array.isArray(networkTokens)) {
      return {
        ok: false,
        configError: {
          code: 'TOKEN_CONFIG_MISSING',
          error: `Transfer token configuration missing network "${network}".`,
          details: { network, reason: 'NETWORK_TOKENS_MISSING' },
        },
      };
    }

    const bySymbol = new Map<string, RawTransferToken>();
    for (const token of networkTokens) {
      const symbol = normalizeSymbol(token.symbol);
      if (!symbol) continue;
      bySymbol.set(symbol, token);
    }

    const normalizedTokens: TransferToken[] = [];
    for (const requiredSymbol of requiredSymbols) {
      const token = bySymbol.get(requiredSymbol);
      if (!token) {
        return {
          ok: false,
          configError: {
            code: 'TOKEN_CONFIG_MISSING',
            error: `Token "${requiredSymbol}" is not configured for ${network}.`,
            details: { network, symbol: requiredSymbol, reason: 'TOKEN_ENTRY_MISSING' },
          },
        };
      }

      const address = token.address?.trim();
      const decimals = token.decimals;
      if (!address || !isAddress(address) || address.toLowerCase() === zeroAddress) {
        return {
          ok: false,
          configError: {
            code: 'TOKEN_CONFIG_MISSING',
            error: `Token "${requiredSymbol}" has an invalid address for ${network}.`,
            details: { network, symbol: requiredSymbol, reason: 'TOKEN_ADDRESS_INVALID' },
          },
        };
      }
      if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
        return {
          ok: false,
          configError: {
            code: 'TOKEN_CONFIG_MISSING',
            error: `Token "${requiredSymbol}" has invalid decimals for ${network}.`,
            details: { network, symbol: requiredSymbol, reason: 'TOKEN_DECIMALS_INVALID' },
          },
        };
      }

      normalizedTokens.push({
        symbol: requiredSymbol,
        address: address as `0x${string}`,
        decimals,
      });
    }

    tokensByNetwork[network] = normalizedTokens;
  }

  return { ok: true, requiredSymbols, tokensByNetwork };
}
