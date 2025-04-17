import { Chip8 } from "./chip8.js";

document.body.style.display = 'grid';
document.body.style.gridTemplateColumns = 'repeat(2, 1fr)';
document.body.style.gap = '1rem';

const KEYPAD_MAP = {
	'1': 0x1,
	'2': 0x2,
	'3': 0x3,
	'4': 0xC,
	'Q': 0x4,
	'W': 0x5,
	'E': 0x6,
	'R': 0xD,
	'A': 0x7,
	'S': 0x8,
	'D': 0x9,
	'F': 0xE,
	'Z': 0xA,
	'X': 0x0,
	'C': 0xB,
	'V': 0xF,
}

const showProgram = (url) => fetch(url)
	.then((response) => response.arrayBuffer())
	.then((buffer) => {
		const c = document.createElement('canvas').getContext('2d');
		const { canvas } = c;
		
		canvas.width = 64;
		canvas.height = 32;
		canvas.style.width = '100%';
		canvas.style.imageRendering = 'pixelated';
		
		document.body.appendChild(canvas);

		const program = new Uint8Array(buffer);
		const chip = new Chip8(program);

		window.addEventListener('keydown', (e) => {
			let key = KEYPAD_MAP[e.key.toUpperCase()];
			if (key === undefined) key = -1;
			chip.keypad(key, true);
		});

		window.addEventListener('keyup', (e) => {
			let key = KEYPAD_MAP[e.key.toUpperCase()];
			if (key === undefined) key = -1;
			chip.keypad(key, false);
		});

		chip.on('display', (display) => {
			const imageData = c.createImageData(64, 32);
			const data = imageData.data;

			for (let i = 0; i < display.length; i++) {
				const pixel = display[i] ? 255 : 0;
				data[i * 4] = pixel;
				data[i * 4 + 1] = pixel;
				data[i * 4 + 2] = pixel;
				data[i * 4 + 3] = 255;
			}

			c.putImageData(imageData, 0, 0);
		});
	});

showProgram('./examples/octojam2title.ch8');
