import { FONT } from "./font.js";
import { defineInstructions } from "./instructions.js";

const PROGRAM_ADDRESS = 0x200;
const INSTRUCTIONS_PER_FRAME = 10;

const Registers = {
	PC: 0x0,
	I: 0x1,
	SP: 0x2,
	D: 0x3,
	S: 0x4,
	K: 0x5,
	EX: 0x6,
	HR: 0x7, // Hires Mode
	SX: 0x8, // Scroll X
	SY: 0x9, // Scroll Y
	PL: 0xA, // Plane
	RD: 0xB, // Redraw
	XO: 0xC, // XO-CHIP
	S0: 0xD, // SUPER-CHIP 1.0
	S1:	0xE, // SUPER-CHIP 1.1
}

export const Events = {
	DISPLAY: 'display',
	HIRES_MODE_CHANED: 'hires-mode-changed',
}

export class Chip8 {
	/** Default memory size of 4096 bytes or 4KB */
	memory = new Uint8Array(0x10000);

	/** Display memory (128x64) SCHIP x 4 planes */
	display = new Uint8Array(128 * 64 * 4);
	
	/** V registers */
	v = new Uint8Array(16); // 16 registers (V0 to VF)

	/** Flag registers */
	f = new Uint8Array(16); // Flag register (VF)

	/** Clock speed (Hz) */
	frequency = 540;

	registers = this.#createRegisterProxy();
	instructions = defineInstructions(
		this.registers,
		this.memory,
		this.display,
		this.v,
		this.f,
	);
	instructionsList = Object.keys(this.instructions);

	/** @type { NodeJS.Timeout | null } */
	interval = null;

	/** @type { NodeJS.Timeout | null } */
	delayInterval = null;

	#eventHandlers = {};

	get isHiresMode() {
		return this.registers.HR === 1;
	}

	/**
	 * @param { Uint8Array } program - The program to load into memory
	 */
	constructor(program) {
		this.memory.fill(0);
		this.display.fill(0);
		this.v.fill(0);
		this.registers.K = 0xFFFF;

		this.#addToMemory(FONT);
		this.#addToMemory(program, PROGRAM_ADDRESS);
		this.#beginLoop();
	}

	#trigger(event, ...args) {
		if (this.#eventHandlers[event]) {
			this.#eventHandlers[event].forEach((callback) => callback(...args));
		}
	}

	#createRegisterProxy() {
		const r = new Uint8Array(32);

		return new Proxy(Registers, {
			get(target, prop) {
				if (prop in target) {
					return (r[target[prop] * 2 + 1] << 8) | r[target[prop] * 2];
				}
				throw new Error(`Register ${String(prop)} not found`);
			},
	
			set(target, prop, value) {
				if (!(prop in target)) throw new Error(`Register ${String(prop)} not found`);
				r[target[prop] * 2] = value & 0xFF;
				r[target[prop] * 2 + 1] = (value >> 8) & 0xFF;
				return true;
			},
		})
	}

	/**
	 * @param { Uint8Array } data - The data to write to memory
	 * @param { number } address - The address to start writing to
	 */
	#addToMemory(data, address) {
		if (address < 0 || address + data.length > this.memory.length) {
			throw new Error(`Memory overflow at address 0x${address.toString(16)}`);
		}

		this.memory.set(data, address);
	}

	#beginLoop() {
		this.registers.PC = PROGRAM_ADDRESS;
		this.interval = setInterval(() => {
			for (let i = 0; i < INSTRUCTIONS_PER_FRAME; i++) this.#executeInstruction();
		}, 1000 / this.frequency);
		this.delayInterval = setInterval(this.#updateTimers.bind(this), 1000 / this.frequency);
	}

	#updateTimers() {
		this.registers.D -= this.registers.D > 0 ? 1 : 0;
		this.registers.S -= this.registers.S > 0 ? 1 : 0;
	}

	#logDisplay() {
		this.#trigger(Events.DISPLAY, this.display);
		this.registers.RD = 0;
	}

	#executeInstruction() {
		if (this.registers.PC >= this.memory.length) return this.stop();

		const code = (this.memory[this.registers.PC] << 8) | this.memory[this.registers.PC + 1];
		const codeStr = code.toString(16).padStart(4, '0').toUpperCase();
		const instructionKey = this.instructionsList.find((mask) => {
			for (let i = 0; i < mask.length; i++) {
				if (mask[i] === 'X') continue;
				if (codeStr[i] !== mask[i]) return false;
			}
			return true;
		});

		const hiresMode = this.registers.HR;

		if (!instructionKey)
			throw new Error(`Unknown instruction: 0x${codeStr} at address 0x${this.registers.PC.toString(16)}`);

		// console.log(`Executing instruction: 0x${codeStr} at address 0x${this.registers.PC.toString(16)}`);
		this.instructions[instructionKey](code);
		this.registers.PC += 2;

		if (this.registers.RD) this.#logDisplay();
		if (this.registers.HR !== hiresMode) this.#trigger(Events.HIRES_MODE_CHANED, this.registers.HR);
	}

	/**
	 * Writes a key value to the K registers
	 * @param { number } key - The key value to Writes
	 * @param { boolean } pressed - Whether the key is pressed or not
	 */
	keypad(key, pressed) {
		if (!pressed) {
			this.registers.K = this.registers.K === key 
				? -1 
				: this.registers.K;
			return;
		}
		this.registers.K = key;
	}

	/**
	 * Registers an event handler
	 *
	 * @type { (event: string, callback: Function) => () => void }
	 */
	on(event, callback) {
		this.#eventHandlers[event] ??= [];
		this.#eventHandlers[event].push(callback);

		return () => {
			this.#eventHandlers[event] = this.#eventHandlers[event].filter((cb) => cb !== callback);
		};
	}

	/** Stops the CHIP-8 interpreter */
	stop() {
		clearInterval(this.interval);
		clearInterval(this.delayInterval);
	}
}
