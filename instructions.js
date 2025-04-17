const NO_KEY = 0xFFFF;

/**
 * @typedef {{
 *   PC: number,
 *   SP: number,
 *   I: number,
 *   D: number,
 *   S: number,
 *   K: number,
 * }} Registers
 * @typedef { number } Instruction
 * @typedef { (code: number) => void } InstructionExecutor
 */

/**
 * Returns an instruction set of CHIP-8
 *
 * @param { Registers } r registers
 * @param { Uint8Array } m general memory
 * @param { Uint8Array } d display memory
 * @param { Uint8Array } v v-registers
 * @param { Uint8Array } f flag storage
 * @returns { Record<Instruction, InstructionExecutor> } instructions
 */
export const defineInstructions = (r, m, d, v) => {
	/**
	 * @type { Record<Instruction, InstructionExecutor> }
	 */
	return {
		"00E0": () => d.fill(0),
		"00EE": () => {
			r.SP--;
			r.PC = (m[r.SP * 2 + 1] << 8) | m[r.SP * 2];
		},
		"1XXX": (code) => r.PC = (code & 0x0FFF) - 2,
		"2XXX": (code) => {
			m[r.SP * 2] = r.PC & 0x00FF;
			m[r.SP * 2 + 1] = (r.PC & 0xFF00) >> 8;
			r.PC = (code & 0x0FFF) - 2;
			r.SP++;
		},
		"3XXX": (code) => r.PC += v[(code & 0x0F00) >> 8] !== (code & 0x00FF) ? 0 : 2,
		"4XXX": (code) => r.PC += v[(code & 0x0F00) >> 8] === (code & 0x00FF) ? 0 : 2,
		"5XX0": (code) => r.PC += v[(code & 0x0F00) >> 8] === v[(code & 0x00F0) >> 4] ? 2 : 0,
		"6XXX": (code) => v[(code & 0x0F00) >> 8] = (code & 0x00FF),
		"7XXX": (code) => v[(code & 0x0F00) >> 8] += (code & 0x00FF),
		"8XXX": (code) => {
			const vx = (code & 0x0F00) >> 8;
			const vy = (code & 0x00F0) >> 4;
			const op = code & 0x000F;

			let before;

			switch (op) {
				case 0x0:
					v[vx] = v[vy];
					break;
				case 0x1:
					v[vx] |= v[vy];
					v[0xf] = v[vx] > 0xFF ? 1 : 0;
					break;
				case 0x2:
					v[vx] &= v[vy];
					v[0xf] = v[vx] > 0xFF ? 1 : 0;
					break;
				case 0x3:
					v[vx] ^= v[vy];
					v[0xf] = v[vx] > 0xFF ? 1 : 0;
					break;
				case 0x4:
					before = v[vx];
					v[vx] += v[vy];
					v[0xF] = v[vx] < before;
					break;
				case 0x5:
					before = v[vx];
					v[vx] -= v[vy];
					v[0xF] = v[vx] < before;
					break;
				case 0x7: 
					before = v[vy];
					v[vx] = (v[vy] - v[vx]) & 0xFF;
					v[0xF] = v[vx] < before;
					break;
				case 0x6:
					v[vx] = v[vy];
					const lsb = v[vx] & 0x01;
					v[vx] >>= 1;
					v[vx] &= 0xFF;
					v[0xF] = lsb;
					break;
				case 0xE:
					v[vx] = v[vy];
					const msb = (v[vx] & 0x80) >> 7;
					v[vx] <<= 1;
					v[0xF] = msb
					break;
			}
		},

		"9XX0": (code) => r.PC += v[(code & 0x0F00) >> 8] === v[(code & 0x00F0) >> 4] ? 0 : 2,
		"AXXX": (code) => r.I = code & 0x0FFF,
		"BXXX": (code) => r.PC = ((code & 0x0FFF) + v[0]) - 2,
		"CXXX": (code) => v[(code & 0x0F00) >> 8] = Math.floor(Math.random() * 256) & (code & 0x00FF),
		"DXXX": (code) => {
			const vx = (code & 0x0F00) >> 8;
			const vy = (code & 0x00F0) >> 4;
			const rows = (code & 0x000F) || 0xF;
			const x = v[vx] & (0x40 - 1);
			const y = v[vy] & (0x20 - 1);
			v[0xf] = 0;

			for	(let row = 0; row < rows; row++) {
				const byte = m[r.I + row];

				for (let col = 0; col < 8; col++) {
					const spixel = (byte >> (7 - col)) & 1;
					if (x + col >= 64) break;

					const dpixel = d[x + col + (y + row) * 64];

					if (dpixel === 1 && spixel === 1) {
						d[x + col + (y + row) * 64] = 0;
						v[0xf] = 1;
						continue;
					}

					if (spixel === 1) {
						d[x + col + (y + row) * 64] = 1;
					}
				}
			}
		},

		"EX9E": (code) => r.PC += v[(code & 0x0F00) >> 8] === r.K ?  2 : 0,
		"EXA1": (code) => r.PC += v[(code & 0x0F00) >> 8] !== r.K ? 2 : 0,
		"FX07": (code) => v[(code & 0x0F00) >> 8] = r.D,
		"FX15": (code) => r.D = v[(code & 0x0F00) >> 8],
		"FX18": (code) => r.S = v[(code & 0x0F00) >> 8],
		"FX1E": (code) => r.I += v[(code & 0x0F00) >> 8],
		"FX0A": (code) => {
			const vx = (code & 0x0F00) >> 8;
			if (r.K === NO_KEY) r.PC -= 2;
			if (r.K !== NO_KEY && !v[vx]) {
				v[vx] = r.K;
				r.PC -= 2;
			}
		},

		"FX29": (code) => r.I = v[(code & 0x0F00) >> 8] * 5,
		"FX33": (code) => {
			const value = v[(code & 0x0F00) >> 8];

			m[r.I] = Math.floor(value / 100);
			m[r.I + 1] = Math.floor((value % 100) / 10);
			m[r.I + 2] = value % 10;
		},

		"FX55": (code) => {
			const vx = (code & 0x0F00) >> 8;
			for (let i = 0; i <= vx; i++) m[r.I + i] = v[i];
			r.I += vx + 1;
		},

		"FX65": (code) => {
			const vx = (code & 0x0F00) >> 8;
			for (let i = 0; i <= vx; i++) v[i] = m[r.I + i];
			r.I += vx + 1;
		},
	}
}
