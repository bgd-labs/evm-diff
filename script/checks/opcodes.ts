import { type Hex, type PublicClient, toHex } from 'viem';

type Opcode = number;
type OpcodeDefinition = {
	name: string;
	stackInput?: number;
	bytecode?: Hex;
};
type CallError = { details: string };

export async function checkOpcodes(
	client: PublicClient,
): Promise<{ number: Hex; name: string; supported: boolean | string }[]> {
	const opcodes = Array.from(Array(0xff + 1).keys());
	const supported = await Promise.all(opcodes.map(async (opcode) => checkOpcode(opcode, client)));

	const result: { number: Hex; name: string; supported: boolean | string }[] = [];
	opcodes.forEach((opcode, index) => {
		// For brevity, omit opcodes that are not known and not supported. All known opcodes are
		// included. Supported but unknown opcodes are included with the name 'unknown'.
		const shouldOmit = !knownOpcodes[opcode] && !supported[index];
		if (!shouldOmit) {
			result.push({
				number: toHex(opcode, { size: 1 }),
				name: knownOpcodes[opcode]?.name || 'unknown',
				supported: supported[index],
			});
		}
	});
	return result;
}

async function checkOpcode(opcode: Opcode, client: PublicClient): Promise<boolean | 'unknown'> {
	try {
		await client.call({ data: getBytecode(opcode) });
		return true; // Call succeeded so opcode is supported.
	} catch (e: unknown) {
		const err = e as CallError;
		const details = err.details.toLowerCase();

		// TODO These might be specific to the node implementation, can this be more robust?
		if (
			opcode === 0xfe &&
			['invalid opcode: invalid', 'invalidfeopcode', 'execution reverted'].some((msg) =>
				details.includes(msg),
			)
		) {
			return true; // Designated invalid opcode.
		}
		if (opcode === 0xfd && details.includes('execution reverted')) return true; // Revert opcode.
		if (details.includes('opcodenotfound')) return false;
		if (details.includes('not defined')) return false;
		if (details.includes('not supported')) return false;
		if (details.includes('invalid opcode')) return false;
		if (details.includes('notactivated')) return false;

		console.log(`\n======== Opcode ${opcode} ========`);
		console.log('err.details:', err.details);
		console.log(JSON.stringify(err, null, 2));
		throw new Error(`Unexpected error: ${err}`);
	}
}

function getBytecode(opcode: Opcode): Hex {
	const opDef = knownOpcodes[opcode];
	if (opDef?.bytecode) {
		return opDef.bytecode as Hex;
	}
	if (opDef?.stackInput) {
		let bytecode: Hex = '0x';
		// Push required default inputs onto stack
		for (let i = 0; i < opDef.stackInput; i++) {
			bytecode += '6001'; // PUSH1 01
		}
		bytecode += toHex(opcode, { size: 1 }).slice(2);
		return bytecode as Hex;
	}
	return toHex(opcode, { size: 1 });
}

export const knownOpcodes: Record<Opcode, OpcodeDefinition> = {
	0x00: { name: 'STOP' },
	0x01: { name: 'ADD', stackInput: 2 },
	0x02: { name: 'MUL', stackInput: 2 },
	0x03: { name: 'SUB', stackInput: 2 },
	0x04: { name: 'DIV', stackInput: 2 },
	0x05: { name: 'SDIV', stackInput: 2 },
	0x06: { name: 'MOD', stackInput: 2 },
	0x07: { name: 'SMOD', stackInput: 2 },
	0x08: { name: 'ADDMOD', stackInput: 3 },
	0x09: { name: 'MULMOD', stackInput: 3 },
	0x0a: { name: 'EXP', stackInput: 2 },
	0x0b: { name: 'SIGNEXTEND', stackInput: 2 },
	0x10: { name: 'LT', stackInput: 2 },
	0x11: { name: 'GT', stackInput: 2 },
	0x12: { name: 'SLT', stackInput: 2 },
	0x13: { name: 'SGT', stackInput: 2 },
	0x14: { name: 'EQ', stackInput: 2 },
	0x15: { name: 'ISZERO', stackInput: 1 },
	0x16: { name: 'AND', stackInput: 2 },
	0x17: { name: 'OR', stackInput: 2 },
	0x18: { name: 'XOR', stackInput: 2 },
	0x19: { name: 'NOT', stackInput: 1 },
	0x1a: { name: 'BYTE', stackInput: 2 },
	0x1b: { name: 'SHL', stackInput: 2 },
	0x1c: { name: 'SHR', stackInput: 2 },
	0x1d: { name: 'SAR', stackInput: 2 },
	0x20: { name: 'KECCAK256', stackInput: 2 },
	0x30: { name: 'ADDRESS' },
	0x31: { name: 'BALANCE', stackInput: 1 },
	0x32: { name: 'ORIGIN' },
	0x33: { name: 'CALLER' },
	0x34: { name: 'CALLVALUE' },
	0x35: { name: 'CALLDATALOAD', stackInput: 1 },
	0x36: { name: 'CALLDATASIZE' },
	0x37: { name: 'CALLDATACOPY', stackInput: 3 },
	0x38: { name: 'CODESIZE' },
	0x39: { name: 'CODECOPY', stackInput: 3 },
	0x3a: { name: 'GASPRICE' },
	0x3b: { name: 'EXTCODESIZE', stackInput: 1 },
	0x3c: { name: 'EXTCODECOPY', stackInput: 4 },
	0x3d: { name: 'RETURNDATASIZE' },
	0x3e: {
		name: 'RETURNDATACOPY',
		bytecode:
			'0x7f7f7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff6000527fff6000527fff60005260206000f30000000000000000000000000000000000006020527f000000000060205260296000f300000000000000000000000000000000000000604052604d60006000f060006000600060008463fffffffffa50506000600052600060205260006040526020600060003e',
	},
	0x3f: { name: 'EXTCODEHASH', stackInput: 1 },
	0x40: { name: 'BLOCKHASH', stackInput: 1 },
	0x41: { name: 'COINBASE' },
	0x42: { name: 'TIMESTAMP' },
	0x43: { name: 'NUMBER' },
	0x44: { name: 'PREVRANDAO' },
	0x45: { name: 'GASLIMIT' },
	0x46: { name: 'CHAINID' },
	0x47: { name: 'SELFBALANCE' },
	0x48: { name: 'BASEFEE' },
	0x49: { name: 'BLOBHASH', stackInput: 1 },
	0x4a: { name: 'BLOBBASEFEE' },
	0x50: { name: 'POP', stackInput: 1 },
	0x51: { name: 'MLOAD', stackInput: 2 },
	0x52: { name: 'MSTORE', stackInput: 2 },
	0x53: { name: 'MSTORE8', stackInput: 2 },
	0x54: { name: 'SLOAD', stackInput: 1 },
	0x55: { name: 'SSTORE', stackInput: 2 },
	0x56: { name: 'JUMP', bytecode: '0x600456FE5B6001' }, // (PUSH1 04, JUMP, INVALID, JUMPDEST, PUSH1 01)
	0x57: { name: 'JUMPI', bytecode: '0x6000600a576001600c575BFE5B6001' },
	0x58: { name: 'PC' },
	0x59: { name: 'MSIZE' },
	0x5a: { name: 'GAS' },
	0x5b: { name: 'JUMPDEST' },
	0x5c: { name: 'TLOAD', stackInput: 1 },
	0x5d: { name: 'TSTORE', stackInput: 2 },
	0x5e: { name: 'MCOPY', stackInput: 3 },
	0x5f: { name: 'PUSH0' },
	0x60: { name: 'PUSH1' },
	0x61: { name: 'PUSH2' },
	0x62: { name: 'PUSH3' },
	0x63: { name: 'PUSH4' },
	0x64: { name: 'PUSH5' },
	0x65: { name: 'PUSH6' },
	0x66: { name: 'PUSH7' },
	0x67: { name: 'PUSH8' },
	0x68: { name: 'PUSH9' },
	0x69: { name: 'PUSH10' },
	0x6a: { name: 'PUSH11' },
	0x6b: { name: 'PUSH12' },
	0x6c: { name: 'PUSH13' },
	0x6d: { name: 'PUSH14' },
	0x6e: { name: 'PUSH15' },
	0x6f: { name: 'PUSH16' },
	0x70: { name: 'PUSH17' },
	0x71: { name: 'PUSH18' },
	0x72: { name: 'PUSH19' },
	0x73: { name: 'PUSH20' },
	0x74: { name: 'PUSH21' },
	0x75: { name: 'PUSH22' },
	0x76: { name: 'PUSH23' },
	0x77: { name: 'PUSH24' },
	0x78: { name: 'PUSH25' },
	0x79: { name: 'PUSH26' },
	0x7a: { name: 'PUSH27' },
	0x7b: { name: 'PUSH28' },
	0x7c: { name: 'PUSH29' },
	0x7d: { name: 'PUSH30' },
	0x7e: { name: 'PUSH31' },
	0x7f: { name: 'PUSH32' },
	0x80: { name: 'DUP1', stackInput: 1 },
	0x81: { name: 'DUP2', stackInput: 2 },
	0x82: { name: 'DUP3', stackInput: 3 },
	0x83: { name: 'DUP4', stackInput: 4 },
	0x84: { name: 'DUP5', stackInput: 5 },
	0x85: { name: 'DUP6', stackInput: 6 },
	0x86: { name: 'DUP7', stackInput: 7 },
	0x87: { name: 'DUP8', stackInput: 8 },
	0x88: { name: 'DUP9', stackInput: 9 },
	0x89: { name: 'DUP10', stackInput: 10 },
	0x8a: { name: 'DUP11', stackInput: 11 },
	0x8b: { name: 'DUP12', stackInput: 12 },
	0x8c: { name: 'DUP13', stackInput: 13 },
	0x8d: { name: 'DUP14', stackInput: 14 },
	0x8e: { name: 'DUP15', stackInput: 15 },
	0x8f: { name: 'DUP16', stackInput: 16 },
	0x90: { name: 'SWAP1', stackInput: 2 },
	0x91: { name: 'SWAP2', stackInput: 3 },
	0x92: { name: 'SWAP3', stackInput: 4 },
	0x93: { name: 'SWAP4', stackInput: 5 },
	0x94: { name: 'SWAP5', stackInput: 6 },
	0x95: { name: 'SWAP6', stackInput: 7 },
	0x96: { name: 'SWAP7', stackInput: 8 },
	0x97: { name: 'SWAP8', stackInput: 9 },
	0x98: { name: 'SWAP9', stackInput: 10 },
	0x99: { name: 'SWAP10', stackInput: 11 },
	0x9a: { name: 'SWAP11', stackInput: 12 },
	0x9b: { name: 'SWAP12', stackInput: 13 },
	0x9c: { name: 'SWAP13', stackInput: 14 },
	0x9d: { name: 'SWAP14', stackInput: 15 },
	0x9e: { name: 'SWAP15', stackInput: 16 },
	0x9f: { name: 'SWAP16', stackInput: 17 },
	0xa0: { name: 'LOG0', stackInput: 2 },
	0xa1: { name: 'LOG1', stackInput: 3 },
	0xa2: { name: 'LOG2', stackInput: 4 },
	0xa3: { name: 'LOG3', stackInput: 5 },
	0xa4: { name: 'LOG4', stackInput: 6 },
	0xf0: { name: 'CREATE', stackInput: 3 },
	0xf1: { name: 'CALL', stackInput: 7 },
	0xf2: { name: 'CALLCODE', stackInput: 7 },
	0xf3: { name: 'RETURN', stackInput: 2 },
	0xf4: { name: 'DELEGATECALL', stackInput: 6 },
	0xf5: { name: 'CREATE2', stackInput: 4 },
	0xfa: { name: 'STATICCALL', stackInput: 6 },
	0xfd: { name: 'REVERT', bytecode: '0x60006000fd' }, // (PUSH1 00, PUSH1 00, REVERT)
	0xfe: { name: 'INVALID' },
	0xff: { name: 'SELFDESTRUCT', stackInput: 1 },
};
