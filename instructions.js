// @ts-check
const NO_KEY = 0xFFFF;
const RESOLUTIONS = [64, 128];
const COLS = [8, 16];

/**
 * @typedef {{
 *   PC: number, SP: number,
 *   I: number, D: number,
 *   S: number, K: number,
 *   EX: number, HR: number,
 *   SX: number, SY: number,
 *   PL: number, RD: number,
 *   XO: number, S0: number,
 *   S1: number,
 * }} Registers
 * @typedef { string } Instruction
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
export const defineInstructions = (r, m, d, v, f) => {
	/** 
	 * @param { number } dx - X scroll distance 
	 * @param { number } dy - Y scroll distance
	 */
	const scrollBuffer = (dx, dy) => {
		const rx = RESOLUTIONS[r.HR];
		const ry = rx / 2;
		const bufferSize = rx * (rx / 2);
		const tbuffer = d.slice(0, bufferSize);

		for (let i = 0; i < bufferSize; i++) {
			const x = i % rx;
			const y = Math.floor(i / rx);
			const ti = ((x - dx) % rx) + ((y - dy) % ry) * rx;

			d[i] = tbuffer[ti];
		}
		r.RD = 1;
		r.S1 = 1;
	}

	/** @type { Record<Instruction, InstructionExecutor> } */
	const instructions = {
		"00E0": () => (d.fill(0), r.RD = 1),
		"00EE": () => {
			r.SP--;
			r.PC = (m[r.SP * 2 + 1] << 8) | m[r.SP * 2];
		},
		"1XXX": (code) => {
			r.PC = (code & 0x0FFF) - 2;
		},
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
					if (r.S0) break;
					v[0xf] = v[vx] > 0xFF ? 1 : 0;
					break;
				case 0x2:
					v[vx] &= v[vy];
					if (r.S0) return; // Quirk
					v[0xf] = v[vx] > 0xFF ? 1 : 0;
					break;
				case 0x3:
					v[vx] ^= v[vy];
					if (r.S0) return; // Quirk
					v[0xf] = v[vx] > 0xFF ? 1 : 0;
					break;
				case 0x4:
					before = v[vx];
					v[vx] += v[vy];
					v[0xF] = +(v[vx] < before);
					break;
				case 0x5:
					before = v[vx];
					v[vx] -= v[vy];
					v[0xF] = +(v[vx] < before);
					break;
				case 0x7: 
					before = v[vy];
					v[vx] = (v[vy] - v[vx]) & 0xFF;
					v[0xF] = +(v[vx] < before);
					break;
				case 0x6:
					v[vx] = r.S0 ? v[vx] : v[vy];
					const lsb = v[vx] & 0x01;
					v[vx] >>= 1;
					v[vx] &= 0xFF;
					v[0xF] = lsb;
					break;
				case 0xE:
					v[vx] = r.S0 ? v[vx] : v[vy];
					const msb = (v[vx] & 0x80) >> 7;
					v[vx] <<= 1;
					v[0xF] = msb
					break;
			}
		},

		"9XX0": (code) => r.PC += v[(code & 0x0F00) >> 8] === v[(code & 0x00F0) >> 4] ? 0 : 2,
		"AXXX": (code) => r.I = code & 0x0FFF,
		"BXXX": (code) => {
			const vx = (code & 0x0f00) >> 8;
			const offset = r.S0 || r.S1 ? v[vx] : v[0];

			r.PC = ((code & 0x0FFF) + offset) - 2;
		},
		"CXXX": (code) => v[(code & 0x0F00) >> 8] = Math.floor(Math.random() * 256) & (code & 0x00FF),
		"DXXX": (code) => {
			const rx = RESOLUTIONS[r.HR];
			const ry = rx / 2;
			const x = (v[(code & 0x0F00) >> 8] & (rx - 1));
			const y = (v[(code & 0x00F0) >> 4] & (ry - 1));
			let rows = (code & 0x000F);
			v[0xF] = 0;

			rows = r.HR && !rows ? 16 : rows;
			const cols = r.S0 && !rows ? 16 : 8;

			/** Plane address XO-CHIP only */
			const p = r.HR ? r.PL * 0x2000 : 0;

			for	(let row = 0; row < rows; row++) 
			for (let col = 0; col < cols; col++) {
				if (x + col >= rx) break;
				if (y + row >= ry) break;

				if (r.HR) v[0xF] += +(y + row >= ry);

				const xpos = ((x + col) % rx);
				const ypos = ((y + row) % ry);
				const address = p + xpos + ypos * rx;
				const spixel = (m[r.I + row] >> (cols - 1 - col)) & 0x01;

				if (d[address] && spixel) {
					d[address] = 0;
					if (!r.HR) v[0xF] = 1; else v[0xF]++;
					continue;
				}

				d[address] = spixel || d[address];
			}

			r.RD = 1;
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
			if (r.S1) return;
			r.I += vx + 1;
		},

		"FX65": (code) => {
			const vx = (code & 0x0F00) >> 8;
			for (let i = 0; i <= vx; i++) v[i] = m[r.I + i];
			if (r.S1) return;
			r.I += vx + 1;
		},
		
		// SUPER-CHIP instructions
		"00FD": () => r.EX = 1,
		"00FE": () => (r.HR = 0, r.S0 = 1),
		"00FF": () => (r.HR = 1, r.S0 = 1),
		"FX75": (code) => {
			const vx = (code & 0x0F00) >> 8;
			for (let i = 0; i <= vx; i++) f[i] = v[i];
			r.I += vx + 1;
		},

		"FX85": (code) => {
			const vx = (code & 0x0F00) >> 8;
			for (let i = 0; i <= vx; i++) v[i] = f[i];
			r.I += vx + 1;
		},

		// SUPER-CHIP 1.1 instructions
		"00CX": (code) => {
			const distance = (code & 0x000F);
			if (!distance) return;

			scrollBuffer(0, distance / (r.HR ? 1 : 2));
		},

		"00FB": () => scrollBuffer(4, 0),
		"00FC": () => scrollBuffer(-4, 0),
		"FX30": (code) => (r.I = (v[(code & 0x0F00) >> 8] & 0x0F) * 10, r.S1 = 1),
		"5XX2": (code) => {
			const x = (code & 0x0F00) >> 8;
			const y = (code & 0x00F0) >> 4;

			for (let i = x; i <= y; i++) {
				m[r.I + (i - x)] = v[i];
			}
			r.S1 = 1;
		},
		"5XX3": (code) => {
			const x = (code & 0x0F00) >> 8;
			const y = (code & 0x00F0) >> 4;

			for (let i = x; i <= y; i++) {
				v[i] = m[r.I + (i - x)];
			}
			r.S1 = 1;
		},

		// XO-CHIP instructions
		"FX01": code => (r.PL = (code & 0x0F00) >> 8, r.XO = 1),
		"FX02": _ => null,

		// HELL YEAH!!!!!!!!
		"F000": () => {
			r.I = (m[r.PC + 2] << 8) | m[r.PC + 3];
			r.PC += 2;
			r.XO = 1;
		},

		"00DX": (code) => {
			const distance = r.HR ? (code & 0x000F) : Math.floor((code & 0x000F) / 2);
			r.SY -= distance;
			r.XO = 1;
		},
	}

	return instructions;
}
