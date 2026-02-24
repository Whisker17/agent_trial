import type { DeleteSweepSummary } from '../api';

export interface DashboardDeleteState {
  deletedAgentName?: string;
  deleteSweep?: DeleteSweepSummary;
}

export interface DeleteSweepNotice {
  title: string;
  subtitle: string;
  transfers: string[];
  destination: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function shortAddress(value: string): string {
  if (value.length < 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function buildDeleteSweepNotice(state: unknown): DeleteSweepNotice | null {
  if (!isRecord(state)) return null;

  const name =
    typeof state.deletedAgentName === 'string' && state.deletedAgentName.trim()
      ? state.deletedAgentName.trim()
      : null;
  if (!name) return null;

  const rawSweep = state.deleteSweep;
  if (!isRecord(rawSweep) || !Array.isArray(rawSweep.transfers)) {
    return {
      title: `${name} deleted`,
      subtitle: 'Agent deletion completed. Sweep details were not returned.',
      transfers: [],
      destination: null,
    };
  }

  const sweep = rawSweep as DeleteSweepSummary;
  const transfers = sweep.transfers.map(
    (item) => `${item.amount} ${item.symbol} (${item.assetType} on ${item.network})`,
  );

  if (transfers.length === 0) {
    return {
      title: `${name} deleted`,
      subtitle: 'No transferable assets were found in the agent wallet.',
      transfers,
      destination: sweep.destination,
    };
  }

  const destination = sweep.destination || null;
  const transferLabel = transfers.length === 1 ? 'asset' : 'assets';
  const destinationText = destination ? ` to ${shortAddress(destination)}` : '';

  return {
    title: `${name} deleted`,
    subtitle: `Transferred ${transfers.length} ${transferLabel}${destinationText}.`,
    transfers,
    destination,
  };
}
