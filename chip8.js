import { FONT } from "./font.js";
import { defineInstructions } from "./instructions.js";

const PROGRAM_ADDRESS = 0x200;
const INSTRUCTIONS_PER_FRAME = 3;
const Registers = {
	PC: 0x0,
	I: 0x1,
	SP: 0x2,
	D: 0x3,
	S: 0x4,
	K: 0x6,
}

export const Events = {
	DISPLAY: 'display',
}

export class Chip8 {
	/** Default memory size of 4096 bytes or 4KB */
	memory = new Uint8Array(0x1000);

	/** Display memory (64x32) */
	display = new Uint8Array(64 * 32);
	
	/** V registers */
	v = new Uint8Array(16); // 16 registers (V0 to VF)

	/** Clock speed (Hz) */
	frequency = 540;

	registers = this.createRegisterProxy();
	instructions = defineInstructions(
		this.registers,
		this.memory,
		this.display,
		this.v,
	);
	instructionsList = Object.keys(this.instructions);

	/** @type { NodeJS.Timeout | null } */
	interval = null;

	/** @type { NodeJS.Timeout | null } */
	delayInterval = null;

	#eventHandlers = {};

	/**
	 * @param { Uint8Array } program - The program to load into memory
	 */
	constructor(program) {
		this.memory.fill(0);
		this.display.fill(0);
		this.v.fill(0);
		this.registers.K = 0xFFFF;

		this.addToMemory(0x000, FONT);
		this.addToMemory(PROGRAM_ADDRESS, program);
		this.beginLoop();
	}

	/**
	 * @type { (event: string, callback: Function) => () => void }
	 */
	on(event, callback) {
		this.#eventHandlers[event] ??= [];
		this.#eventHandlers[event].push(callback);

		return () => {
			this.#eventHandlers[event] = this.#eventHandlers[event].filter((cb) => cb !== callback);
		};
	}

	trigger(event, ...args) {
		if (this.#eventHandlers[event]) {
			this.#eventHandlers[event].forEach((callback) => callback(...args));
		}
	}

	createRegisterProxy() {
		const r = new Uint8Array(16);
		// 8-bit registers
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
	 * Writes data to memory
	 *
	 * @param { number } fromAddress - The address to start writing to
	 * @param { Uint8Array } data - The data to write to memory
	 */
	addToMemory(fromAddress, data) {
		if (fromAddress < 0 || fromAddress + data.length > this.memory.length) {
			throw new Error(`Memory overflow at address 0x${fromAddress.toString(16)}`);
		}

		this.memory.set(data, fromAddress);
	}

	beginLoop() {
		this.registers.PC = PROGRAM_ADDRESS;
		this.interval = setInterval(() => {
			for (let i = 0; i < INSTRUCTIONS_PER_FRAME; i++) this.executeInstruction();
		}, 1000 / this.frequency);
		this.delayInterval = setInterval(this.updateTimers.bind(this), 1000 / this.frequency);
	}

	/**
	 * Executes the current instruction
	 */
	executeInstruction() {
		const nibble1 = this.memory[this.registers.PC];
		const nibble2 = this.memory[this.registers.PC + 1];
		const code = (nibble1 << 8) | nibble2;


		if (this.registers.PC >= this.memory.length) {
			this.stop();
			return;
		}

		const codeStr = code.toString(16).padStart(4, '0').toUpperCase();
		const instructionKey = this.instructionsList.find((mask) => {
			for (let i = 0; i < mask.length; i++) {
				if (mask[i] === 'X') continue;
				if (codeStr[i] !== mask[i]) return false;
			}

			return true;
		});

		if (!instructionKey) {
			console.log(`Unknown instruction: 0x${codeStr} at address 0x${this.registers.PC.toString(16)}`);
		} else {
			this.instructions[instructionKey](code);
		}

		this.registers.PC += 2;
		this.logDisplay();
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

	updateTimers() {
		this.registers.D -= this.registers.D > 0 ? 1 : 0;
		this.registers.S -= this.registers.S > 0 ? 1 : 0;
	}

	logDisplay() {
		this.trigger(Events.DISPLAY, this.display);
	}

	/** Stops the CHIP-8 interpreter */
	stop() {
		clearInterval(this.interval);
		clearInterval(this.delayInterval);
	}
}
