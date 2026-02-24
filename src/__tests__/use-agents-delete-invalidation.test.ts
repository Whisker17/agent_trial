import { describe, expect, it } from 'bun:test';
import { invalidateAfterAgentDelete } from '../frontend/hooks/use-agents';

describe('delete agent side effects', () => {
  it('invalidates both agent list and wallet balance queries', async () => {
    const calls: Array<{ queryKey: string[] }> = [];
    const queryClient = {
      invalidateQueries: async (opts: { queryKey: string[] }) => {
        calls.push(opts);
      },
    };

    await invalidateAfterAgentDelete(queryClient as never);

    expect(calls).toEqual([
      { queryKey: ['agents'] },
      { queryKey: ['walletBalance'] },
    ]);
  });
});
