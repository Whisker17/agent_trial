import { logger } from '@elizaos/core';
import solc from 'solc';

interface CompileResult {
  abi: any[];
  bytecode: `0x${string}`;
}

const compilationCache = new Map<string, CompileResult>();

/**
 * Compile a Solidity source string and return the ABI + bytecode for the specified contract.
 * Results are cached by contractName to avoid recompilation.
 */
export function compileSolidity(
  source: string,
  contractName: string
): CompileResult {
  const cacheKey = contractName;
  if (compilationCache.has(cacheKey)) {
    return compilationCache.get(cacheKey)!;
  }

  logger.info(`Compiling Solidity contract: ${contractName}`);

  const input = {
    language: 'Solidity',
    sources: {
      [`${contractName}.sol`]: { content: source },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode.object'],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  if (output.errors) {
    const errors = output.errors.filter(
      (e: any) => e.severity === 'error'
    );
    if (errors.length > 0) {
      const msg = errors.map((e: any) => e.formattedMessage).join('\n');
      throw new Error(`Solidity compilation failed:\n${msg}`);
    }
  }

  const contractFile = output.contracts[`${contractName}.sol`];
  if (!contractFile || !contractFile[contractName]) {
    throw new Error(
      `Contract ${contractName} not found in compilation output`
    );
  }

  const compiled = contractFile[contractName];
  const result: CompileResult = {
    abi: compiled.abi,
    bytecode: `0x${compiled.evm.bytecode.object}` as `0x${string}`,
  };

  compilationCache.set(cacheKey, result);
  logger.info(`Successfully compiled ${contractName} (${result.bytecode.length} bytes)`);

  return result;
}
