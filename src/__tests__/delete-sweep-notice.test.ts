import { describe, expect, it } from 'bun:test';
import { buildDeleteSweepNotice } from '../frontend/utils/delete-sweep-notice';

describe('buildDeleteSweepNotice', () => {
  it('builds a transfer notice when sweep summary is available', () => {
    const notice = buildDeleteSweepNotice({
      deletedAgentName: 'Alpha',
      deleteSweep: {
        from: '0x1111111111111111111111111111111111111111',
        destination: '0x2222222222222222222222222222222222222222',
        transfers: [
          {
            network: 'mantle',
            assetType: 'NATIVE',
            symbol: 'MNT',
            amount: '1.25',
            txHash: '0xabc',
          },
        ],
      },
    });

    expect(notice?.title).toBe('Alpha deleted');
    expect(notice?.subtitle.includes('Transferred 1 asset')).toBe(true);
    expect(notice?.transfers).toEqual(['1.25 MNT (NATIVE on mantle)']);
  });

  it('builds an empty-transfer notice when summary has no transfers', () => {
    const notice = buildDeleteSweepNotice({
      deletedAgentName: 'Beta',
      deleteSweep: {
        from: '0x1111111111111111111111111111111111111111',
        destination: '0x2222222222222222222222222222222222222222',
        transfers: [],
      },
    });

    expect(notice?.title).toBe('Beta deleted');
    expect(notice?.subtitle).toBe('No transferable assets were found in the agent wallet.');
    expect(notice?.transfers).toEqual([]);
  });

  it('returns null when there is no delete state', () => {
    expect(buildDeleteSweepNotice(null)).toBeNull();
    expect(buildDeleteSweepNotice({})).toBeNull();
  });
});
