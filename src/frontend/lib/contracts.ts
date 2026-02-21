export const IDENTITY_REGISTRY = {
  mantle: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as `0x${string}`,
  mantleSepolia: '0x8004A818BFB912233c491871b3d84c89A494BD9e' as `0x${string}`,
} as const;

export const IDENTITY_REGISTRY_ABI = [
  {
    name: 'register',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'agentURI', type: 'string' }],
    outputs: [{ name: 'agentId', type: 'uint256' }],
  },
  {
    name: 'Registered',
    type: 'event',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'agentURI', type: 'string', indexed: false },
      { name: 'owner', type: 'address', indexed: true },
    ],
  },
] as const;
